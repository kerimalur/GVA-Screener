"""FastAPI-Routen fürs Replay-Modul. Registrierung in main.py:

    from replay.routes import replay_router
    app.include_router(replay_router, prefix="/replay")

GET /replay/hits darf 5-15s dauern (3D-Resampling + GVA-Erkennung on-the-fly).
"""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from analyzer import GVA_SIZE_FACTOR, GVA_TOL_PCT
from ml.db import select_all, insert, update, delete
from .fundamentals import ranking_series, ranking_snapshot
from .gva_history import find_hit, normalize_pair, reconstruct_hits, reconstruct_lines

replay_router = APIRouter()


def _bias_fields(instrument: str, hit_date: str) -> dict:
    """As-of Fundamental-Bias (Rückenwind/Gegenwind) für einen Hit — kompakt
    fürs Frontend-Badge + Inline. Ausfall => bias=None (Hit bleibt nutzbar)."""
    snap = ranking_snapshot(instrument, hit_date)
    if not snap:
        return {"bias": None}
    return {
        "bias": snap["bias"],
        "base_ccy": snap["base"]["ccy"],
        "base_q": snap["base"]["quintile"],
        "quote_ccy": snap["quote"]["ccy"],
        "quote_q": snap["quote"]["quintile"],
        "bias_week": snap["week_start"],
    }


@replay_router.get("/hits")
def get_hits(
    pair: str = Query(...),
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    size_factor: float = Query(default=GVA_SIZE_FACTOR),
    tol_pct: float = Query(default=GVA_TOL_PCT),
    with_bias: bool = Query(default=True),
):
    try:
        hits = reconstruct_hits(pair, date_from, date_to, size_factor, tol_pct)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    instrument = normalize_pair(pair)
    out = []
    for h in hits:
        row = {
            "hit_date": h["hit_date"],
            "level": h["level"],
            "direction": h["direction"],
            "line_formed_date": h["line_formed_date"],
        }
        # Fundamentale Konfluenz: as-of Bias je Hit. with_bias=0 (Kalibrier-
        # Vorschau) überspringt den Panel-Lookup → rein technisch + schnell.
        if with_bias:
            row.update(_bias_fields(instrument, h["hit_date"]))
        out.append(row)
    return {
        "pair": instrument,
        "from": date_from,
        "to": date_to,
        "count": len(out),
        "hits": out,
    }


@replay_router.get("/lines")
def get_lines(
    pair: str = Query(...),
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    size_factor: float = Query(default=GVA_SIZE_FACTOR),
    tol_pct: float = Query(default=GVA_TOL_PCT),
):
    """Alle GVA-Linien, die im Zeitraum GEBILDET wurden (nicht nur gehittete) —
    fürs Kalibrieren der Erkennung gegen TradingView."""
    try:
        lines = reconstruct_lines(pair, date_from, date_to, size_factor, tol_pct)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {
        "pair": normalize_pair(pair),
        "from": date_from,
        "to": date_to,
        "count": len(lines),
        "lines": [
            {
                "line_formed_date": ln["line_formed_date"],
                "level": ln["level"],
                "direction": ln["direction"],
            }
            for ln in lines
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
    from data_pipeline import GVA_3D_ANCHOR, fetch_daily_oanda, gva_3d_block_ids

    instrument = normalize_pair(pair)
    daily = fetch_daily_oanda(instrument, count=5000)
    if daily.empty:
        raise HTTPException(status_code=503, detail="Keine OANDA-Daten")
    df = daily.sort_index().copy()
    df["block_id"] = gva_3d_block_ids(df.index)

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
    # GVA-Toleranz der Session (damit find_hit dieselben Hits rekonstruiert)
    size_factor: float | None = None
    tol_pct: float | None = None
    # Bias nur berechnen/speichern, wenn die Session fundamental läuft
    with_fundamentals: bool = True


@replay_router.post("/evaluate")
def evaluate(req: EvaluateRequest):
    instrument = normalize_pair(req.instrument)
    direction = req.hit_direction.upper()
    if direction not in ("SHORT", "LONG"):
        raise HTTPException(status_code=422, detail="hit_direction muss SHORT oder LONG sein")

    try:
        hit = find_hit(
            instrument, req.hit_date, direction, level=req.hit_level,
            size_factor=req.size_factor if req.size_factor is not None else GVA_SIZE_FACTOR,
            tol_pct=req.tol_pct if req.tol_pct is not None else GVA_TOL_PCT,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    if not hit:
        raise HTTPException(status_code=404, detail="Hit nicht gefunden (Datum/Richtung prüfen)")

    # Fundamentale Konfluenz: as-of Bias beider Pair-Währungen zur Hit-Woche
    # (Datum = HIT-Tag, nicht Linien-Bildung) mitspeichern → sobald GVA-Ergebnisse
    # zurückkommen, ist der Winrate-Split Rückenwind vs. Gegenwind sofort auswertbar.
    # Nur wenn die Session fundamental läuft; Ausfall => bias null (kein Block).
    snap = ranking_snapshot(instrument, req.hit_date) if req.with_fundamentals else None
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
        "ranking_bias": snap["bias"] if snap else None,
        "ranking_detail": snap,
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
    # kalibrierte GVA-Toleranz, in die Session eingefroren (reproduzierbar)
    tol_pct: float | None = None
    size_factor: float | None = None
    # mit fundamentaler Konfluenz (as-of Bias) oder rein technisch
    with_fundamentals: bool | None = None


class SessionPatch(BaseModel):
    status: str | None = None  # 'active' | 'paused' | 'done'
    name: str | None = None
    notes: str | None = None


@replay_router.post("/sessions")
def create_session(req: SessionCreate):
    instrument = normalize_pair(req.pair)
    name = req.name or f"{instrument} {req.date_from} – {req.date_to}"
    row = {
        "name": name, "pair": instrument,
        "date_from": req.date_from, "date_to": req.date_to,
    }
    if req.tol_pct is not None:
        row["tol_pct"] = req.tol_pct
    if req.size_factor is not None:
        row["size_factor"] = req.size_factor
    if req.with_fundamentals is not None:
        row["with_fundamentals"] = req.with_fundamentals
    try:
        insert("replay_sessions", row)
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


def _ranking_bucket(t: dict) -> str:
    """Rückenwind/Gegenwind: as-of-Bias vs. gehandelte Hit-Richtung."""
    bias = t.get("ranking_bias")
    if bias not in ("long", "short"):
        return "Neutral"
    hit_long = t["hit_direction"] == "LONG"
    return "Rückenwind" if (bias == "long") == hit_long else "Gegenwind"


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
    by_ranking: dict[str, int] = defaultdict(int)
    for t in taken:
        by_direction[t["hit_direction"]] += 1
        by_pair[t["instrument"]] += 1
        by_year[str(t["hit_date"])[:4]] += 1
        by_ranking[_ranking_bucket(t)] += 1

    return {
        "evaluated": len(rows),
        "taken": len(taken),
        "skips": sum(1 for r in rows if r.get("trade_taken") is False),
        "by_direction": dict(sorted(by_direction.items())),
        "by_pair": dict(sorted(by_pair.items())),
        "by_year": dict(sorted(by_year.items())),
        # Vorbereitung: Zählung genommener Trades nach Fundamental-Bias.
        # Winrate-Split folgt, sobald GVA-Ergebnisse zurückkommen.
        "by_ranking": dict(sorted(by_ranking.items())),
    }
