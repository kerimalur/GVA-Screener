"""Modell-Fabrik: LightGBM / Logistische Regression, Feature-Gruppen, Contribs."""
from __future__ import annotations

import numpy as np
import pandas as pd

FEATURE_GROUPS: dict[str, list[str]] = {
    "cot_core": [
        "noncomm_net", "noncomm_net_d1w", "comm_net", "comm_net_d1w",
        "retail_net", "retail_net_d1w", "cot_divergence", "comm_z",
        "comm_net_pct156", "open_interest", "oi_d1w",
    ],
    "cot_tff": [
        "dealer_net", "dealer_net_d1w", "asset_net", "asset_net_d1w",
        "lev_net", "lev_net_d1w",
    ],
    "rates": ["rate_level", "rate_diff_avg", "rate_mom_6m"],
    "season": ["season_mean_ret", "season_hit_years", "season_active"],
    "scores": ["cot_score", "rates_score", "season_score"],
}
G8 = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"]
CCY_DUMMIES = [f"ccy_{c}" for c in G8]


def feature_columns(groups: list[str]) -> list[str]:
    cols: list[str] = []
    for g in groups:
        cols.extend(FEATURE_GROUPS[g])
    return cols + CCY_DUMMIES


def design_matrix(panel: pd.DataFrame, groups: list[str]) -> pd.DataFrame:
    base_cols = [c for g in groups for c in FEATURE_GROUPS[g]]
    X = panel[base_cols].copy()
    for c in G8:
        X[f"ccy_{c}"] = (panel["ccy"] == c).astype(float)
    return X


def make_model(algo: str, params: dict, seed: int):
    if algo == "lgbm":
        import lightgbm as lgb
        return lgb.LGBMClassifier(
            random_state=seed, verbosity=-1, n_jobs=2,
            **{"n_estimators": 200, "learning_rate": 0.05, "num_leaves": 31,
               "min_child_samples": 40, **params},
        )
    if algo == "logreg":
        from sklearn.impute import SimpleImputer
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
        return make_pipeline(
            SimpleImputer(strategy="median"), StandardScaler(),
            LogisticRegression(max_iter=1000, C=params.get("C", 1.0), random_state=seed),
        )
    raise ValueError(f"Unbekannter Algo: {algo}")


def predict_scores(model, algo: str, X: pd.DataFrame) -> np.ndarray:
    """Score ∈ (-1, +1): P(up)*2-1 — vergleichbar über Algos."""
    proba = model.predict_proba(X)[:, 1]
    return proba * 2.0 - 1.0


def top_contributions(model, algo: str, X: pd.DataFrame, k: int = 3) -> list[list[dict]]:
    """Pro Zeile die k stärksten Feature-Beiträge (Name + Vorzeichen-Wert)."""
    names = list(X.columns)
    if algo == "lgbm":
        contrib = model.predict(X, pred_contrib=True)[:, :-1]  # letzte Spalte = Bias
    else:  # logreg: coef × standardisierte Werte
        imp = model.named_steps["simpleimputer"]
        scaler = model.named_steps["standardscaler"]
        Xs = scaler.transform(imp.transform(X))
        coef = model.named_steps["logisticregression"].coef_[0]
        contrib = Xs * coef
    out = []
    for row in np.asarray(contrib):
        idx = np.argsort(-np.abs(row))[:k]
        out.append([{"feature": names[i], "value": round(float(row[i]), 4)} for i in idx])
    return out
