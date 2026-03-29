"""
MNETI Protocol — Phase 8
ai/training/train.py

Training script for the PoBF model.

Generates synthetic SME financial data, trains the MLP, and saves weights.

Usage:
  cd MNETI/ai
  pip install tensorflow numpy scikit-learn
  python training/train.py

Output:
  ai/models/pobf_model_weights.h5   — trained model weights
  ai/training/training_metrics.json — accuracy metrics
"""

import numpy as np
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from models.pobf_model import compute_features, build_model, MODEL_PATH, INDUSTRY_RISK

try:
    import tensorflow as tf
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
except ImportError:
    print("Install: pip install tensorflow scikit-learn")
    sys.exit(1)

# ─── Synthetic Data Generation ────────────────────────────────────────────────

def generate_synthetic_dataset(n_samples: int = 10_000) -> tuple:
    """
    Generates n_samples synthetic SME records.
    True score is computed as a weighted combination of signals
    (same weights as the rule-based fallback) to give the model a ground truth.
    """
    rng = np.random.default_rng(42)
    industries = list(INDUSTRY_RISK.keys())

    X = []
    y = []

    for _ in range(n_samples):
        # Sample inputs from realistic distributions
        zk_score    = int(rng.uniform(300, 851))
        vault_bal   = rng.exponential(scale=500_000)
        months      = int(rng.uniform(0, 36))
        pay_runs    = int(rng.uniform(0, months + 1))
        inv_paid    = int(rng.uniform(0, 20))
        inv_default = int(rng.binomial(inv_paid, 0.1))  # ~10% default rate
        avg_inflow  = rng.exponential(scale=300_000)
        industry    = rng.choice(industries)
        signers     = int(rng.choice([1, 1, 1, 2, 2, 3, 5]))

        inputs = {
            "zk_credit_score":     zk_score,
            "vault_balance_kes":   vault_bal,
            "months_active":       months,
            "payroll_run_count":   pay_runs,
            "invoices_paid":       inv_paid,
            "invoices_defaulted":  inv_default,
            "avg_monthly_inflow":  avg_inflow,
            "industry":            industry,
            "country":             "KE",
            "multisig_signers":    signers,
        }

        features = compute_features(inputs)

        # Ground truth: deterministic weighted sum (same as rule_based_score)
        weights = np.array([0.30, 0.25, 0.15, 0.08, 0.05, 0.07, 0.04, 0.03, 0.02, 0.01])
        true_score = float(np.dot(features, weights))

        X.append(features)
        y.append(true_score)

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)


# ─── Training ─────────────────────────────────────────────────────────────────

def train():
    print("[PoBF Train] Generating 10,000 synthetic SME records...")
    X, y = generate_synthetic_dataset(10_000)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    print(f"[PoBF Train] Train: {len(X_train)} | Test: {len(X_test)}")
    print(f"[PoBF Train] Score range: {y.min():.3f} – {y.max():.3f}")

    model = build_model()
    model.summary()

    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=10, restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=5, verbose=1),
    ]

    print("\n[PoBF Train] Training...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_test, y_test),
        epochs=100,
        batch_size=256,
        callbacks=callbacks,
        verbose=1,
    )

    # Evaluate
    test_loss, test_mae = model.evaluate(X_test, y_test, verbose=0)
    final_epoch = len(history.history["loss"])

    print(f"\n[PoBF Train] ✅ Training complete")
    print(f"  Epochs:    {final_epoch}")
    print(f"  Test MAE:  {test_mae:.4f}  (raw 0–1 units, ×100 = score points)")
    print(f"  Test Loss: {test_loss:.6f}")

    # Save weights
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    model.save_weights(MODEL_PATH)
    print(f"  Weights:   {MODEL_PATH}")

    # Save metrics
    metrics = {
        "test_loss":    test_loss,
        "test_mae":     test_mae,
        "epochs":       final_epoch,
        "train_samples":len(X_train),
        "test_samples": len(X_test),
        "val_loss_history": [float(v) for v in history.history["val_loss"][-5:]],
    }
    metrics_path = os.path.join(os.path.dirname(__file__), "training_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"  Metrics:   {metrics_path}")

    return model, metrics


if __name__ == "__main__":
    train()
