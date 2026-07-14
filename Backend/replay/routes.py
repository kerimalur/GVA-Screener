"""FastAPI-Routen fürs Replay-Modul. Registrierung in main.py:

    from replay.routes import replay_router
    app.include_router(replay_router, prefix="/replay")

GET /replay/hits darf 5-15s dauern (3D-Resampling + GVA-Erkennung on-the-fly).
"""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ml.db import select_all, insert, update, delete
from .fundamentals import ranking_series
from .gva_history import find_hit, normalize_pair, reconstruct_hits

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
    # Bewusst OHNE Fundamentals/Ranking: das GVA-Replay prüft rein die
    # Linien-Logik (Kerims Vorgabe) — und bleibt dadurch schnell.
    return {
        "pair": normalize_pair(pair),
        "from": date_from,
        "to": date_to,
        "count": len(hits),
        "hits": [
            {
                "hit_date": h["hit_date"],
                "level": h["level"],
                "direction": h["direction"],
                "line_formed_date": h["line_formed_date"],
            }
            for h in hits
        ],
    }


@replay_router.get("/blocks")
def get_blocks(
    pair: str = Query(...),
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
):
    """Debug für den TV-Raster-Abgleich (GVA_BACKTEST_ROADMAP.md Phase 1):
    zeigt die 3D-Block-Grenzen inkl. der Tageskerzen pro Block. Damit sieht
    man direkt, wo das Raster gegen TradingView phasenverschoben ist und ob
    Feiertags-Kerzen (z.B. Karfreitag) im OANDA-Feed fehlen/existieren."""
    import numpy as np

    from data_pipeline import GVA_3D_ANCHOR, fetch_daily_oanda

    instrument = normalize_pair(pair)
    daily = fetch_daily_oanda(instrument, count=5000)
    if daily.empty:
        raise HTTPException(status_code=503, detail="Keine OANDA-Daten")
    df = daily.sort_index().copy()
    pos = np.arange(len(df))
    anchor_pos = int(df.index.searchsorted(GVA_3D_ANCHOR))
    df["block_id"] = (pos - anchor_pos) // 3

    blocks = []
    for _, grp in df.groupby("block_id"):
        days = [ts.date().isoformat() for ts in grp.index]
        if days[-1] < date_from or days[0] > date_to:
            continue
        o, c = float(grp["open"].iloc[0]), float(grp["close"].iloc[-1])
        blocks.append({
            "start": days[0],
            "days": days,
            "open": round(o, 5),
            "close": round(c, 5),
            "body_top": round(max(o, c), 5),
            "body_bot": round(min(o, c), 5),
        })
    return {"pair": instrument, "anchor": GVA_3D_ANCHOR.date().isoformat(), "blocks": blocks}


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

    # Replay ist rein technisch (nur GVA-Linien) — keine Fundamental-Felder,
    # keine SL/TP/R:R-Simulation. Nur: Linie gebildet, Linie gehittet, Preis.
    row = {
        "instrument": instrument,
        "hit_date": req.hit_date,
        "hit_level": hit["level"],
        "hit_direction": direction,
        "line_formed_date": hit["line_formed_date"],
        "session_id": req.session_id,
        "trade_taken": req.trade_taken,
        "skip_reason": req.skip_reason,
        "notes": req.notes,
    }

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


@replay_router.get("/rankings")
def get_rankings(
    pair: str = Query(...),
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
):
    """Wochen-Rankings (as-of Baseline + Q-Stufen) eines Pairs im Zeitraum."""
    instrument = normalize_pair(pair)
    rankings = ranking_series(instrument, date_from, date_to)
    return {"pair": instrument, "from": date_from, "to": date_to,
            "count": len(rankings), "rankings": rankings}


# ── Sessions: anlegen, auflisten (mit Fortschritt), pausieren/abschliessen ──

class SessionCreate(BaseModel):
    pair: str
    date_from: str
    date_to: str
    name: str | None = None


class SessionPatch(BaseModel):
    status: str | None = None  # 'active' | 'paused' | 'done'
    name: str | None = None
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
    patch: dict = {}
    if req.status is not None:
        if req.status not in ("active", "paused", "done"):
            raise HTTPException(status_code=422, detail="status muss active/paused/done sein")
        patch["status"] = req.status
        if req.status == "done":
            from datetime import datetime, timezone
            patch["finished_at"] = datetime.now(timezone.utc).isoformat()
    if req.name is not None and req.name.strip():
        patch["name"] = req.name.strip()
    if req.notes is not None:
        patch["notes"] = req.notes
    if not patch:
        raise HTTPException(status_code=422, detail="nichts zu ändern")
    try:
        update("replay_sessions", {"id": f"eq.{session_id}"}, patch)
        rows = select_all("replay_sessions", {"select": "*", "id": f"eq.{session_id}"})
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    if not rows:
        raise HTTPException(status_code=404, detail="Session nicht gefunden")
    return {"session": rows[0]}


@replay_router.delete("/sessions/{session_id}")
def delete_session(session_id: int):
    """Session inkl. ihrer Bewertungen löschen (wie Backtest-Lab: Session = Container)."""
    try:
        delete("backtest_replay", {"session_id": f"eq.{session_id}"})
        delete("replay_sessions", {"id": f"eq.{session_id}"})
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"ok": True}


@replay_router.get("/stats")
def get_stats(
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    session_id: int | None = Query(default=None),
):
    """Reine Zählungen — SL/TP/R:R-Simulation wurde entfernt (siehe
    GVA_BACKTEST_ROADMAP.md Phase 1). Kennzahlen kommen erst zurück, wenn die
    GVA-Linien-Logik 1:1 mit TradingView übereinstimmt."""
    params = {"select": "*", "order": "hit_date.asc"}
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
        rows = select_all("backtest_replay", params)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    taken = [r for r in rows if r.get("trade_taken") is True]
    by_direction: dict[str, int] = defaultdict(int)
    by_pair: dict[str, int] = defaultdict(int)
    by_year: dict[str, int] = defaultdict(int)
    for t in taken:
        by_direction[t["hit_direction"]] += 1
        by_pair[t["instrument"]] += 1
        by_year[str(t["hit_date"])[:4]] += 1

    return {
        "evaluated": len(rows),
        "taken": len(taken),
        "skips": sum(1 for r in rows if r.get("trade_taken") is False),
        "by_direction": dict(sorted(by_direction.items())),
        "by_pair": dict(sorted(by_pair.items())),
        "by_year": dict(sorted(by_year.items())),
    }
