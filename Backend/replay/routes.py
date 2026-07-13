"""FastAPI-Routen fürs Replay-Modul. Registrierung in main.py:

    from replay.routes import replay_router
    app.include_router(replay_router, prefix="/replay")

GET /replay/hits darf 5-15s dauern (3D-Resampling + GVA-Erkennung on-the-fly).
"""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ml.db import select_all, insert, update
from .fundamentals import ranking_snapshot
from .gva_history import find_hit, normalize_pair, reconstruct_hits
from .trade_result import simulate_trade

replay_router = APIRouter()


@replay_router.get("/hits")
def get_hits(
    pair: str = Query(...),
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
):
    try:
        hits = reconstruct_hits(pair, date_from, date_to)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    instrument = normalize_pair(pair)
    return {
        "pair": instrument,
        "from": date_from,
        "to": date_to,
        "count": len(hits),
        "hits": [
            {
                "hit_date": h["hit_date"],
                "level": h["level"],
                "direction": h["direction"],
                "line_formed_date": h["line_formed_date"],
                "fundamental_snapshot": h["fundamental_snapshot"],
                # as-of-Ranking (Zins+Saison-Baseline, Q-Stufen) der Hit-Woche
                "ranking_snapshot": ranking_snapshot(instrument, h["hit_date"]),
            }
            for h in hits
        ],
    }


class EvaluateRequest(BaseModel):
    instrument: str
    hit_date: str
    hit_direction: str  # "SHORT" | "LONG"
    trade_taken: bool
    skip_reason: str | None = None
    notes: str | None = None
    # optional: disambiguiert bei mehreren Hits gleicher Richtung am selben Tag
    hit_level: float | None = None
    session_id: int | None = None


@replay_router.post("/evaluate")
def evaluate(req: EvaluateRequest):
    instrument = normalize_pair(req.instrument)
    direction = req.hit_direction.upper()
    if direction not in ("SHORT", "LONG"):
        raise HTTPException(status_code=422, detail="hit_direction muss SHORT oder LONG sein")

    try:
        hit = find_hit(instrument, req.hit_date, direction, level=req.hit_level)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    if not hit:
        raise HTTPException(status_code=404, detail="Hit nicht gefunden (Datum/Richtung prüfen)")

    snap = hit.get("fundamental_snapshot") or {}
    ranking = ranking_snapshot(instrument, req.hit_date)
    row = {
        "instrument": instrument,
        "hit_date": req.hit_date,
        "hit_level": hit["level"],
        "hit_direction": direction,
        "line_formed_date": hit["line_formed_date"],
        "fundamental_direction": snap.get("direction"),
        "fundamental_aligned_count": snap.get("aligned_count"),
        "fundamental_factors": snap.get("factors"),
        "ranking_bias": ranking["bias"] if ranking else None,
        "ranking_detail": ranking,
        "session_id": req.session_id,
        "trade_taken": req.trade_taken,
        "skip_reason": req.skip_reason,
        "notes": req.notes,
        "entry_price": None,
        "sl_price": None,
        "tp_price": None,
        "result": None,
        "result_pips": None,
        "result_rr": None,
        "exit_date": None,
    }

    if req.trade_taken:
        sim = simulate_trade(instrument, hit)
        if sim is None:
            raise HTTPException(status_code=422, detail="Keine Preisdaten am Hit-Tag — Simulation nicht möglich")
        row.update(sim)

    try:
        insert("backtest_replay", row, upsert_on="instrument,hit_date,hit_direction")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return {"ok": True, "evaluation": row}


@replay_router.get("/trades")
def get_trades(pair: str | None = Query(default=None)):
    params = {"select": "*", "order": "hit_date.asc"}
    if pair:
        params["instrument"] = f"eq.{normalize_pair(pair)}"
    try:
        rows = select_all("backtest_replay", params)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"count": len(rows), "trades": rows}


# ── Sessions: anlegen, auflisten (mit Fortschritt), pausieren/abschliessen ──

class SessionCreate(BaseModel):
    pair: str
    date_from: str
    date_to: str
    name: str | None = None


class SessionPatch(BaseModel):
    status: str  # 'active' | 'paused' | 'done'
    notes: str | None = None


@replay_router.post("/sessions")
def create_session(req: SessionCreate):
    instrument = normalize_pair(req.pair)
    name = req.name or f"{instrument} {req.date_from} – {req.date_to}"
    try:
        insert("replay_sessions", {
            "name": name, "pair": instrument,
            "date_from": req.date_from, "date_to": req.date_to,
        })
        rows = select_all("replay_sessions", {
            "select": "*", "order": "id.desc", "limit": 1,
        })
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"session": rows[0]}


@replay_router.get("/sessions")
def list_sessions():
    try:
        sessions = select_all("replay_sessions", {"select": "*", "order": "id.desc"})
        evaluated = select_all("backtest_replay", {
            "select": "session_id", "session_id": "not.is.null",
        })
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    counts: dict[int, int] = defaultdict(int)
    for r in evaluated:
        counts[r["session_id"]] += 1
    for s in sessions:
        s["evaluated_count"] = counts.get(s["id"], 0)
    return {"sessions": sessions}


@replay_router.patch("/sessions/{session_id}")
def patch_session(session_id: int, req: SessionPatch):
    if req.status not in ("active", "paused", "done"):
        raise HTTPException(status_code=422, detail="status muss active/paused/done sein")
    patch: dict = {"status": req.status}
    if req.status == "done":
        from datetime import datetime, timezone
        patch["finished_at"] = datetime.now(timezone.utc).isoformat()
    if req.notes is not None:
        patch["notes"] = req.notes
    try:
        update("replay_sessions", {"id": f"eq.{session_id}"}, patch)
        rows = select_all("replay_sessions", {"select": "*", "id": f"eq.{session_id}"})
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    if not rows:
        raise HTTPException(status_code=404, detail="Session nicht gefunden")
    return {"session": rows[0]}


def _bucket() -> dict:
    return {"n": 0, "wins": 0, "losses": 0, "timeouts": 0, "sum_rr": 0.0,
            "win_pips": 0.0, "loss_pips": 0.0}


def _add(b: dict, t: dict) -> None:
    b["n"] += 1
    b["sum_rr"] += t.get("result_rr") or 0.0
    pips = t.get("result_pips") or 0.0
    if t.get("result") == "WIN":
        b["wins"] += 1
        b["win_pips"] += pips
    elif t.get("result") == "LOSS":
        b["losses"] += 1
        b["loss_pips"] += abs(pips)
    elif t.get("result") == "TIMEOUT":
        b["timeouts"] += 1
        if pips >= 0:
            b["win_pips"] += pips
        else:
            b["loss_pips"] += abs(pips)


def _final(b: dict) -> dict:
    decided = b["wins"] + b["losses"]
    return {
        "trades": b["n"],
        "wins": b["wins"],
        "losses": b["losses"],
        "timeouts": b["timeouts"],
        "winrate": round(b["wins"] / decided * 100, 1) if decided else None,
        "avg_rr": round(b["sum_rr"] / b["n"], 2) if b["n"] else None,
        "profit_factor": round(b["win_pips"] / b["loss_pips"], 2) if b["loss_pips"] > 0 else None,
    }


def _ranking_bucket_key(t: dict) -> str:
    """Rückenwind/Gegenwind: as-of-Ranking-Bias vs. Hit-Richtung."""
    bias = t.get("ranking_bias")
    if bias not in ("long", "short"):
        return "neutral"
    hit_long = t["hit_direction"] == "LONG"
    return "Rückenwind" if (bias == "long") == hit_long else "Gegenwind"


@replay_router.get("/stats")
def get_stats(
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    session_id: int | None = Query(default=None),
):
    params = {"select": "*", "trade_taken": "eq.true", "order": "hit_date.asc"}
    date_filters = []
    if date_from:
        date_filters.append(f"gte.{date_from}")
    if date_to:
        date_filters.append(f"lte.{date_to}")
    if date_filters:
        params["hit_date"] = date_filters
    if session_id is not None:
        params["session_id"] = f"eq.{session_id}"
    try:
        trades = select_all("backtest_replay", params)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # nur simulierte Trades zählen (result gesetzt, INVALID raus)
    trades = [t for t in trades if t.get("result") in ("WIN", "LOSS", "TIMEOUT")]

    total = _bucket()
    by_direction: dict[str, dict] = defaultdict(_bucket)
    by_pair: dict[str, dict] = defaultdict(_bucket)
    by_confluence: dict[str, dict] = defaultdict(_bucket)
    by_ranking: dict[str, dict] = defaultdict(_bucket)
    by_year: dict[str, dict] = defaultdict(_bucket)

    # Skip-Zählung separat (fließt NICHT in die Winrate)
    skip_params = {"select": "id", "trade_taken": "eq.false"}
    if date_filters:
        skip_params["hit_date"] = date_filters
    if session_id is not None:
        skip_params["session_id"] = f"eq.{session_id}"
    try:
        skips = select_all("backtest_replay", skip_params)
    except RuntimeError:
        skips = []

    for t in trades:
        _add(total, t)
        _add(by_direction[t["hit_direction"]], t)
        _add(by_pair[t["instrument"]], t)
        ac = t.get("fundamental_aligned_count")
        _add(by_confluence[str(ac) if ac is not None else "unbekannt"], t)
        _add(by_ranking[_ranking_bucket_key(t)], t)
        _add(by_year[str(t["hit_date"])[:4]], t)

    return {
        "total": _final(total),
        "skips": len(skips),
        "by_direction": {k: _final(v) for k, v in sorted(by_direction.items())},
        "by_pair": {k: _final(v) for k, v in sorted(by_pair.items())},
        "by_confluence": {k: _final(v) for k, v in sorted(by_confluence.items())},
        "by_ranking": {k: _final(v) for k, v in sorted(by_ranking.items())},
        "by_year": {k: _final(v) for k, v in sorted(by_year.items())},
    }
