"""Feature-Engineering fürs ML-Modell: Woche × Pair → ~40 Features + 4 Targets.

Datenquellen (Supabase REST): cot_reports (Legacy: NonComm + Commercials),
cot_tff_reports (TFF: Leveraged Funds + Asset Manager), price_daily.

AS-OF-GARANTIE: Für eine Woche mit Montag X fließen nur Daten mit Datum ≤ X ein.
- COT: Report (Dienstag-Stichtag) erscheint Freitag → letzter Report ≤ X ist am
  Montag X auch live verfügbar gewesen. Rolling-Perzentile/Flows enden je Index.
- Saisonalität: Monats-Statistik nur aus Jahren < Jahr(X) — der laufende Monat
  und das laufende Jahr fließen nie in die eigene Statistik ein.
- Targets schauen nach vorn (Close X → Close X+N Wochen) — nur fürs Training.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd

from . import db

# G8 → CFTC-Contract-Code (identisch zu frontend-next/lib/constants/cftcContracts.ts)
CONTRACT_BY_CCY = {
    "EUR": "099741",
    "GBP": "096742",
    "JPY": "097741",
    "CHF": "092741",
    "CAD": "090741",
    "AUD": "232741",
    "NZD": "112741",
    "USD": "098662",  # Dollar-Index
}

PAIRS = [
    "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD", "USD_CHF", "NZD_USD",
    "EUR_JPY", "GBP_JPY", "EUR_GBP", "AUD_JPY", "CAD_JPY", "CHF_JPY", "EUR_AUD",
    "EUR_CAD", "EUR_CHF", "EUR_NZD", "GBP_AUD", "GBP_CAD", "GBP_CHF", "GBP_NZD",
    "AUD_CAD", "AUD_CHF", "AUD_NZD", "CAD_CHF", "NZD_CAD", "NZD_CHF", "NZD_JPY",
]

HORIZONS = [1, 2, 3, 4]

# COT-Basis-Features je Währung & Variante (Pair-Feature = Base − Quote)
COT_FEATURE_NAMES = [
    "net_percentile_1y",
    "net_percentile_3y",
    "net_percentile_5y",
    "flow_1w_pct_oi",
    "flow_4w_pct_oi",
    "flow_8w_pct_oi",
    "flow_13w_pct_oi",
    "flow_acceleration",
    "streak_weeks",
    "comm_vs_spec_divergence",
    "oi_change_4w_pct",
]
VARIANTS = ["nc", "tff"]  # Legacy Non-Commercials | TFF Leveraged Funds


def mondays(weeks: int, include_current: bool = False) -> list[str]:
    """Letzte `weeks` Wochen-Montage (UTC), aufsteigend; optional inkl. aktueller Woche."""
    today = dt.datetime.now(dt.timezone.utc).date()
    current = today - dt.timedelta(days=today.weekday())
    end = 0 if include_current else 1
    return [
        (current - dt.timedelta(weeks=w)).isoformat() for w in range(weeks - 1 + end, end - 1, -1)
    ]


def _rolling_percentile(s: pd.Series, window: int) -> pd.Series:
    """Perzentil (0–100) des aktuellen Werts im Fenster, as-of (endet am Index)."""
    def pct(x: np.ndarray) -> float:
        cur = x[-1]
        return float((x <= cur).sum() - 1) / max(len(x) - 1, 1) * 100.0

    return s.rolling(window, min_periods=max(window // 2, 26)).apply(pct, raw=True)


def _streak(delta: pd.Series) -> pd.Series:
    """Wochen in Folge mit gleichem Δ-Vorzeichen (inkl. aktueller)."""
    out = np.zeros(len(delta))
    run = 0
    prev = 0.0
    for i, d in enumerate(delta.to_numpy()):
        if np.isnan(d) or d == 0:
            run = 0
        elif prev != 0 and np.sign(d) == np.sign(prev):
            run += 1
        else:
            run = 1
        prev = 0.0 if np.isnan(d) else d
        out[i] = run
    return pd.Series(out, index=delta.index)


def _series_features(df: pd.DataFrame, spec_net: str, hedger_net: str) -> pd.DataFrame:
    """Feature-Serie (Index = report_date) aus einer COT-Report-Serie einer Währung.

    spec_net: Spalte der spekulativen Netto-Position (NonComm bzw. Leveraged).
    hedger_net: Gegenseite für die Divergenz (Commercials bzw. Asset Manager).
    """
    net = df[spec_net].astype(float)
    hedger = df[hedger_net].astype(float)
    oi = df["open_interest"].astype(float).replace(0, np.nan)

    out = pd.DataFrame(index=df.index)
    out["net_percentile_1y"] = _rolling_percentile(net, 52)
    out["net_percentile_3y"] = _rolling_percentile(net, 156)
    out["net_percentile_5y"] = _rolling_percentile(net, 260)
    for k in (1, 4, 8, 13):
        out[f"flow_{k}w_pct_oi"] = (net - net.shift(k)) / oi * 100.0
    out["flow_acceleration"] = out["flow_4w_pct_oi"] - out["flow_4w_pct_oi"].shift(4)
    out["streak_weeks"] = _streak(net - net.shift(1))
    hedger_flow4 = (hedger - hedger.shift(4)) / oi * 100.0
    out["comm_vs_spec_divergence"] = hedger_flow4 - out["flow_4w_pct_oi"]
    oi_prev = oi.shift(4)
    out["oi_change_4w_pct"] = (oi - oi_prev) / oi_prev * 100.0
    return out


def _load_cot() -> dict[str, dict[str, pd.DataFrame]]:
    """Je Variante je Währung die as-of Feature-Serie (Index = report_date)."""
    codes = list(CONTRACT_BY_CCY.values())
    legacy = pd.DataFrame(
        db.select_all(
            "cot_reports",
            {
                "select": "contract_code,report_date,open_interest,noncomm_long,noncomm_short,comm_long,comm_short",
                "contract_code": f"in.({','.join(codes)})",
                "order": "report_date.asc",
            },
        )
    )
    tff = pd.DataFrame(
        db.select_all(
            "cot_tff_reports",
            {
                "select": "contract_code,report_date,open_interest,lev_money_long,lev_money_short,asset_mgr_long,asset_mgr_short",
                "contract_code": f"in.({','.join(codes)})",
                "order": "report_date.asc",
            },
        )
    )

    result: dict[str, dict[str, pd.DataFrame]] = {"nc": {}, "tff": {}}
    for ccy, code in CONTRACT_BY_CCY.items():
        lg = legacy[legacy["contract_code"] == code].set_index("report_date")
        if not lg.empty:
            lg = lg.fillna(0)
            lg["nc_net"] = lg["noncomm_long"] - lg["noncomm_short"]
            lg["comm_net"] = lg["comm_long"] - lg["comm_short"]
            result["nc"][ccy] = _series_features(lg, "nc_net", "comm_net")
        tf = tff[tff["contract_code"] == code].set_index("report_date")
        if not tf.empty:
            tf = tf.fillna(0)
            tf["lev_net"] = tf["lev_money_long"] - tf["lev_money_short"]
            tf["asset_net"] = tf["asset_mgr_long"] - tf["asset_mgr_short"]
            result["tff"][ccy] = _series_features(tf, "lev_net", "asset_net")
    return result


def _load_prices(since: str) -> dict[str, pd.Series]:
    rows = db.select_all(
        "price_daily",
        {
            "select": "instrument,date,close",
            "instrument": f"in.({','.join(PAIRS)})",
            "date": f"gte.{since}",
            "order": "instrument.asc,date.asc",
        },
    )
    df = pd.DataFrame(rows)
    out: dict[str, pd.Series] = {}
    for pair, grp in df.groupby("instrument"):
        s = grp.set_index("date")["close"].astype(float)
        s.index = pd.to_datetime(s.index)
        out[pair] = s
    return out


def _monthly_stats(prices: dict[str, pd.Series]) -> dict[str, pd.DataFrame]:
    """Je Pair: Monats-Return je (Jahr, Monat) — Basis für as-of Saison-Statistik."""
    out: dict[str, pd.DataFrame] = {}
    for pair, s in prices.items():
        m = s.resample("ME").last().pct_change() * 100.0
        df = pd.DataFrame({"ret": m})
        df["year"] = df.index.year
        df["month"] = df.index.month
        out[pair] = df.dropna()
    return out


def _close_at_or_after(s: pd.Series, target: pd.Timestamp, tolerance_days: int = 5) -> float | None:
    idx = s.index.searchsorted(target)
    if idx >= len(s):
        return None
    d = s.index[idx]
    if (d - target).days > tolerance_days:
        return None
    return float(s.iloc[idx])


def feature_names() -> list[str]:
    names = [f"{v}_{f}_diff" for v in VARIANTS for f in COT_FEATURE_NAMES]
    names += [f"month_{m}" for m in range(1, 13)]
    names += ["month_avg_return", "month_hitrate", "week_of_month", "is_quarter_end", "half_year"]
    return names


def build_dataset(weeks: int = 900, include_current: bool = False, with_targets: bool = True) -> pd.DataFrame:
    """DataFrame: eine Zeile je (week_start, instrument), Spalten = Features (+ Targets)."""
    wk = mondays(weeks, include_current=include_current)
    since = (dt.date.fromisoformat(wk[0]) - dt.timedelta(days=430)).isoformat()

    cot = _load_cot()
    prices = _load_prices(since)
    seasonal = _monthly_stats(prices)

    # COT je Woche as-of mappen: letzter Report ≤ Montag (merge_asof je Serie)
    week_ts = pd.to_datetime(wk)
    cot_at: dict[tuple[str, str], pd.DataFrame] = {}
    for variant, per_ccy in cot.items():
        for ccy, feats in per_ccy.items():
            f = feats.copy()
            f.index = pd.to_datetime(f.index)
            f = f.sort_index()
            aligned = pd.merge_asof(
                pd.DataFrame(index=week_ts),
                f,
                left_index=True,
                right_index=True,
                direction="backward",
                tolerance=pd.Timedelta(days=35),
            )
            cot_at[(variant, ccy)] = aligned

    rows: list[dict] = []
    for wi, monday in enumerate(wk):
        ts = week_ts[wi]
        year, month, day = ts.year, ts.month, ts.day
        week_of_month = (day - 1) // 7 + 1
        # letzte Woche eines Quartals: Quartalsmonat und Monatsende ≤ 7 Tage entfernt
        next_month = ts + pd.offsets.MonthEnd(0)
        is_q_end = 1 if month in (3, 6, 9, 12) and (next_month - ts).days < 7 else 0

        for pair in PAIRS:
            base, quote = pair.split("_")
            price = prices.get(pair)
            if price is None:
                continue
            c0 = _close_at_or_after(price, ts)
            if c0 is None or c0 == 0:
                continue

            row: dict = {"week_start": monday, "instrument": pair}

            # — COT-Diffs je Variante —
            for variant in VARIANTS:
                fb = cot_at.get((variant, base))
                fq = cot_at.get((variant, quote))
                for feat in COT_FEATURE_NAMES:
                    vb = fb.iloc[wi][feat] if fb is not None else np.nan
                    vq = fq.iloc[wi][feat] if fq is not None else np.nan
                    row[f"{variant}_{feat}_diff"] = (
                        float(vb) - float(vq)
                        if pd.notna(vb) and pd.notna(vq)
                        else np.nan
                    )

            # — Saison (as-of: nur Jahre < aktuelles Jahr) —
            stats = seasonal.get(pair)
            hist = stats[(stats["month"] == month) & (stats["year"] < year)] if stats is not None else None
            if hist is not None and len(hist) >= 5:
                row["month_avg_return"] = float(hist["ret"].mean())
                row["month_hitrate"] = float((hist["ret"] > 0).mean() * 100.0)
            else:
                row["month_avg_return"] = np.nan
                row["month_hitrate"] = np.nan
            for m in range(1, 13):
                row[f"month_{m}"] = 1 if m == month else 0
            row["week_of_month"] = week_of_month
            row["is_quarter_end"] = is_q_end
            row["half_year"] = 0 if month <= 6 else 1

            # — Targets —
            if with_targets:
                for h in HORIZONS:
                    cN = _close_at_or_after(price, ts + pd.Timedelta(weeks=h))
                    if cN is None or cN == c0:
                        row[f"direction_{h}w"] = np.nan
                    else:
                        row[f"direction_{h}w"] = 1 if cN > c0 else 0

            rows.append(row)

    return pd.DataFrame(rows)
