"""
MNETI Protocol — Phase 8
ai/api/main.py

FastAPI server exposing the PoBF (Proof-of-Business-Finance) scoring model.

Endpoints:
  POST /api/pobf/score    — Score a business wallet
  GET  /api/pobf/health   — Service health check
  GET  /api/pobf/model    — Model info

Run:
  cd MNETI/ai
  pip install fastapi uvicorn pydantic numpy
  pip install tensorflow   # optional — falls back to rule-based if not installed
  uvicorn api.main:app --port 8000 --reload
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import sys
import os

# Add parent directory to path for model import
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from models.pobf_model import score, INDUSTRY_RISK

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="MNETI PoBF Scoring API",
    description="Proof-of-Business-Finance AI credit scorer — Phase 8",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://dashboard.mneti.io"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request / Response Models ────────────────────────────────────────────────

class PoBFRequest(BaseModel):
    """All fields match compute_features() input keys in pobf_model.py"""

    wallet: str = Field(..., description="Solana wallet public key (base58) — for audit trail only, not used in scoring")

    # ZK Credit Signal
    zk_credit_score: int = Field(
        default=500,
        ge=300, le=850,
        description="On-chain ZK credit score from mneti-compliance CreditScoreCredential"
    )

    # Vault Behaviour Signals
    vault_balance_kes: float = Field(default=0.0, ge=0, description="Current SME vault balance in KES")
    months_active:     int   = Field(default=0,   ge=0, description="Number of months vault has been active")
    payroll_run_count: int   = Field(default=0,   ge=0, description="Total payroll runs executed via mneti-payments")
    invoices_paid:     int   = Field(default=0,   ge=0, description="Supplier invoices paid on time")
    invoices_defaulted:int   = Field(default=0,   ge=0, description="Supplier invoices not paid by due date")
    avg_monthly_inflow:float = Field(default=0.0, ge=0, description="Average monthly KES inflow over vault history")

    # Industry Risk Signal
    industry: str = Field(
        default="unknown",
        description=f"Business sector. Options: {', '.join(INDUSTRY_RISK.keys())}"
    )
    country:  str = Field(default="KE", description="ISO 3166-1 alpha-2 country code")

    # Governance
    multisig_signers: int = Field(default=1, ge=1, le=10, description="Number of vault multisig signers")


class PoBFResponse(BaseModel):
    wallet:                str
    pobf_score:            float
    zk_contribution:       float
    vault_contribution:    float
    industry_contribution: float
    recommendation:        str
    confidence:            str
    model_type:            str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/api/pobf/score", response_model=PoBFResponse, summary="Score a business wallet")
async def score_wallet(req: PoBFRequest):
    """
    Compute the PoBF (Proof-of-Business-Finance) score for an SME wallet.

    The score (0–100) combines:
    - ZK Credit Score from on-chain credential (40%)
    - Vault behaviour: balance stability, payroll, invoices (35%)
    - Industry risk lookup (25%)

    Returns the score, signal breakdown, and a credit line recommendation.
    """
    try:
        inputs = req.model_dump()
        result = score(inputs)
        return PoBFResponse(wallet=req.wallet, **result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring failed: {str(e)}")


@app.get("/api/pobf/health", summary="Health check")
async def health():
    try:
        # Quick sanity check — score a dummy wallet
        test_inputs = {
            "wallet": "health_check",
            "zk_credit_score": 650,
            "vault_balance_kes": 500_000,
            "months_active": 12,
            "payroll_run_count": 12,
            "invoices_paid": 5,
            "invoices_defaulted": 0,
            "avg_monthly_inflow": 400_000,
            "industry": "technology",
            "country": "KE",
            "multisig_signers": 2,
        }
        result = score(test_inputs)
        return {
            "status":     "healthy",
            "model_type": result["model_type"],
            "test_score": result["pobf_score"],
            "version":    "1.0.0",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/pobf/model", summary="Model information")
async def model_info():
    return {
        "name":         "MNETI PoBF Scorer",
        "version":      "1.0.0",
        "architecture": "3-layer MLP (10 → 64 → 32 → 1)",
        "signals": {
            "zk_credit_score":   "40% — Groth16 ZK proof from mneti-compliance",
            "vault_behaviour":   "35% — balance, payroll, invoice history on mneti-vault",
            "industry_risk":     "25% — sector lookup table",
        },
        "industries": list(INDUSTRY_RISK.keys()),
        "score_range": "0–100 (higher = better creditworthiness)",
        "credit_tiers": {
            "80–100": "KES 5,000,000 — Enterprise Line",
            "65–79":  "KES 500,000 — SME Line",
            "50–64":  "KES 50,000 — Personal Line",
            "0–49":   "KES 5,000 — Starter Line",
        },
    }
