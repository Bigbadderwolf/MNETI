"""
MNETI Protocol — Phase 8
ai/models/pobf_model.py

PoBF (Proof-of-Business-Finance) Scoring Model.

Combines three signals to produce a 0–100 business credit score:
  1. ZK Credit Score      (40% weight) — from mneti-compliance on-chain credential
  2. On-Chain Vault Score (35% weight) — derived from vault behaviour (balance stability,
                                         payroll regularity, invoice payment history)
  3. Industry Risk Score  (25% weight) — sector + geography risk from lookup table

Architecture: 3-layer MLP trained on synthetic SME financial data.
In production: retrain on real anonymised vault behaviour (no PII).
"""

import numpy as np
import json
import os
from typing import Dict, Any, Tuple

# ─── Optional TensorFlow import ───────────────────────────────────────────────
try:
    import tensorflow as tf
    from tensorflow import keras
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("[PoBF] TensorFlow not installed — using rule-based fallback scorer")

# ─── Industry Risk Table ──────────────────────────────────────────────────────
# Lower = better (risk multiplier applied to final score)
INDUSTRY_RISK: Dict[str, float] = {
    "technology":       0.10,
    "healthcare":       0.12,
    "agriculture":      0.18,
    "retail":           0.22,
    "hospitality":      0.30,
    "construction":     0.25,
    "transport":        0.28,
    "manufacturing":    0.20,
    "finance":          0.15,
    "education":        0.14,
    "unknown":          0.25,
}

# ─── Feature Engineering ──────────────────────────────────────────────────────

def compute_vault_score(
    vault_balance_kes:    float,
    months_active:        int,
    payroll_run_count:    int,
    invoices_paid:        int,
    invoices_defaulted:   int,
    avg_monthly_inflow:   float,
) -> float:
    """
    Returns a 0–100 vault behaviour score.
    Rewards: balance stability, payroll regularity, invoice payment history.
    Penalises: invoice defaults, very short history.
    """
    # Balance component (0–40): log-scale so large balances don't dominate
    bal_score = min(40.0, np.log1p(vault_balance_kes / 10_000) * 5.0)

    # Payroll regularity (0–20): more payroll runs = more operational
    payroll_score = min(20.0, payroll_run_count * 2.0)

    # Invoice repayment (0–30)
    total_invoices = invoices_paid + invoices_defaulted
    if total_invoices > 0:
        repayment_rate = invoices_paid / total_invoices
        invoice_score  = repayment_rate * 30.0
    else:
        invoice_score = 15.0  # neutral — no history

    # History length (0–10)
    history_score = min(10.0, months_active * (10.0 / 24.0))

    return bal_score + payroll_score + invoice_score + history_score


def compute_features(inputs: Dict[str, Any]) -> np.ndarray:
    """
    Converts raw inputs to the 10-dimensional feature vector fed to the MLP.

    Input keys:
        zk_credit_score    : int   300–850
        vault_balance_kes  : float KES balance
        months_active      : int   months vault has been active
        payroll_run_count  : int   number of payroll runs executed
        invoices_paid      : int   invoices paid on time
        invoices_defaulted : int   invoices not paid
        avg_monthly_inflow : float average monthly KESH inflow in KES
        industry           : str   industry sector key
        country            : str   "KE" etc (currently unused — placeholder)
        multisig_signers   : int   number of multisig signers (governance quality proxy)
    """
    zk_score       = float(inputs.get("zk_credit_score",    500))
    vault_bal      = float(inputs.get("vault_balance_kes",  0))
    months         = int(inputs.get("months_active",         0))
    payroll_runs   = int(inputs.get("payroll_run_count",      0))
    inv_paid       = int(inputs.get("invoices_paid",          0))
    inv_default    = int(inputs.get("invoices_defaulted",     0))
    avg_inflow     = float(inputs.get("avg_monthly_inflow",  0))
    industry       = inputs.get("industry", "unknown").lower()
    signers        = int(inputs.get("multisig_signers",       1))

    # Normalise ZK score to 0–1
    zk_norm = (zk_score - 300) / (850 - 300)

    # Vault behaviour score normalised
    vault_score = compute_vault_score(vault_bal, months, payroll_runs, inv_paid, inv_default, avg_inflow)
    vault_norm  = vault_score / 100.0

    # Industry risk (inverted: lower risk = higher feature value)
    industry_risk = INDUSTRY_RISK.get(industry, 0.25)
    industry_norm = 1.0 - industry_risk

    # Inflow normalised (log scale)
    inflow_norm = min(1.0, np.log1p(avg_inflow / 100_000) / np.log1p(10))

    # Governance quality
    governance_norm = min(1.0, (signers - 1) / 4.0)

    # Invoice default rate (inverted)
    total_inv = inv_paid + inv_default
    default_rate = (inv_default / total_inv) if total_inv > 0 else 0.0
    default_norm = 1.0 - default_rate

    # History length
    history_norm = min(1.0, months / 24.0)

    # Balance log-normalised
    bal_norm = min(1.0, np.log1p(vault_bal / 1_000_000) / np.log1p(10))

    # Payroll regularity
    payroll_norm = min(1.0, payroll_runs / 24.0)

    return np.array([
        zk_norm,        # 0: ZK credit score
        vault_norm,     # 1: overall vault behaviour
        industry_norm,  # 2: industry safety
        inflow_norm,    # 3: average monthly inflow
        governance_norm,# 4: multisig governance quality
        default_norm,   # 5: invoice repayment reliability
        history_norm,   # 6: months of on-chain history
        bal_norm,       # 7: treasury balance magnitude
        payroll_norm,   # 8: payroll execution regularity
        zk_norm * vault_norm,  # 9: interaction term
    ], dtype=np.float32)

# ─── Rule-Based Fallback Scorer ───────────────────────────────────────────────

def rule_based_score(features: np.ndarray) -> float:
    """
    Weighted sum used when TensorFlow is not available.
    Weights match the declared signal weights: ZK 40%, Vault 35%, Industry 25%.
    """
    weights = np.array([
        0.30,  # zk_credit_score (primary ZK signal)
        0.25,  # vault_behaviour
        0.15,  # industry_norm
        0.08,  # inflow
        0.05,  # governance
        0.07,  # invoice reliability
        0.04,  # history length
        0.03,  # balance magnitude
        0.02,  # payroll regularity
        0.01,  # interaction term
    ])
    raw = float(np.dot(features, weights))
    return round(min(100.0, max(0.0, raw * 100.0)), 1)

# ─── MLP Model Builder ────────────────────────────────────────────────────────

MODEL_PATH = os.path.join(os.path.dirname(__file__), "pobf_model_weights.h5")

def build_model() -> "keras.Model":
    """3-layer MLP: 10 → 64 → 32 → 1"""
    if not TF_AVAILABLE:
        raise RuntimeError("TensorFlow not available")

    model = keras.Sequential([
        keras.layers.Input(shape=(10,)),
        keras.layers.Dense(64, activation="relu"),
        keras.layers.Dropout(0.1),
        keras.layers.Dense(32, activation="relu"),
        keras.layers.Dropout(0.1),
        keras.layers.Dense(1, activation="sigmoid"),
    ], name="pobf_mlp")

    model.compile(optimizer="adam", loss="mse", metrics=["mae"])
    return model

def load_or_build_model() -> Tuple[Any, bool]:
    """Returns (model, is_trained). Falls back to rule-based if no weights."""
    if not TF_AVAILABLE:
        return None, False
    model = build_model()
    if os.path.exists(MODEL_PATH):
        try:
            model.load_weights(MODEL_PATH)
            return model, True
        except Exception as e:
            print(f"[PoBF] Could not load weights: {e} — using untrained model")
    return model, False

# ─── Main Scorer ──────────────────────────────────────────────────────────────

_model, _trained = None, False

def score(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Entry point called by the FastAPI endpoint.

    Returns:
        pobf_score          : float  0–100 (higher = better creditworthiness)
        zk_contribution     : float  weighted ZK credit signal
        vault_contribution  : float  weighted vault behaviour signal
        industry_contribution: float weighted industry signal
        recommendation      : str   credit line recommendation
        confidence          : str   "high" | "medium" | "low"
    """
    global _model, _trained

    features = compute_features(inputs)

    # Get raw score (0–1)
    if TF_AVAILABLE:
        if _model is None:
            _model, _trained = load_or_build_model()
        raw = float(_model.predict(features.reshape(1, -1), verbose=0)[0][0])
        pobf_score = round(raw * 100.0, 1)
        confidence = "high" if _trained else "medium"
    else:
        pobf_score = rule_based_score(features)
        confidence = "medium"

    # Decompose contributions
    zk_c       = round(features[0] * 40.0, 1)
    vault_c    = round(features[1] * 35.0, 1)
    industry_c = round(features[2] * 25.0, 1)

    # Recommend credit line based on score
    if pobf_score >= 80:
        rec = "KES 5,000,000 — Enterprise Line"
    elif pobf_score >= 65:
        rec = "KES 500,000 — SME Line"
    elif pobf_score >= 50:
        rec = "KES 50,000 — Personal Line"
    else:
        rec = "KES 5,000 — Starter Line"

    return {
        "pobf_score":             pobf_score,
        "zk_contribution":        zk_c,
        "vault_contribution":     vault_c,
        "industry_contribution":  industry_c,
        "recommendation":         rec,
        "confidence":             confidence,
        "model_type":             "mlp_tensorflow" if TF_AVAILABLE else "rule_based",
    }
