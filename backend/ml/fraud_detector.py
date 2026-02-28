import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

class FraudDetector:
    def __init__(self):
        self.model = IsolationForest(
            contamination=0.15,  # expects ~15% fraud
            random_state=42,
            n_estimators=100
        )
        self.scaler = StandardScaler()
        self.is_trained = False

    def prepare_features(self, transactions: list[dict]) -> pd.DataFrame:
        df = pd.DataFrame(transactions)
        features = df[[
            "return_count",
            "return_day_gap",
            "order_value",
        ]].copy()

        # Extra engineered features — these make the model smarter
        features["high_value_quick_return"] = (
            (df["order_value"] > 5000) & (df["return_day_gap"] <= 1)
        ).astype(int)

        features["serial_returner"] = (
            df["return_count"] >= 6
        ).astype(int)

        features["value_per_return"] = (
            df["order_value"] / (df["return_count"] + 1)
        )

        return features

    def train(self, transactions: list[dict]):
        features = self.prepare_features(transactions)
        scaled = self.scaler.fit_transform(features)
        self.model.fit(scaled)
        self.is_trained = True
        print(f"✅ Model trained on {len(transactions)} transactions")

    def predict(self, transactions: list[dict]) -> list[dict]:
        if not self.is_trained:
            self.train(transactions)

        features = self.prepare_features(transactions)
        scaled = self.scaler.transform(features)

        # Isolation Forest returns -1 for anomaly, 1 for normal
        raw_scores = self.model.decision_function(scaled)
        predictions = self.model.predict(scaled)

        results = []
        for i, transaction in enumerate(transactions):
            # Convert raw score to 0-100 risk score
            normalized = (raw_scores[i] - raw_scores.min()) / (raw_scores.max() - raw_scores.min())
            risk_score = round((1 - normalized) * 99 + 1)

            is_fraud = risk_score >= 70
            fraud_type = self._explain_fraud(transaction, risk_score) if is_fraud else None

            results.append({
                **transaction,
                "risk_score": risk_score,
                "is_fraud": is_fraud,
                "fraud_type": fraud_type,
            })

        return sorted(results, key=lambda x: x["risk_score"], reverse=True)

    def _explain_fraud(self, t: dict, score: int) -> str:
        reasons = []

        if t["return_count"] >= 8:
            reasons.append(f"Serial returner — {t['return_count']} returns on record")
        elif t["return_count"] >= 5:
            reasons.append(f"High return frequency — {t['return_count']} returns")

        if t["return_day_gap"] <= 1 and t["order_value"] > 5000:
            reasons.append(f"Wardrobing — ₹{t['order_value']:,.0f} item returned in {t['return_day_gap']} day(s)")

        if t["order_value"] > 10000 and t["return_count"] >= 3:
            reasons.append(f"High-value repeat pattern — ₹{t['order_value']:,.0f}")

        if t["return_day_gap"] == 0:
            reasons.append("Same-day return — possible receipt manipulation")

        if not reasons:
            reasons.append(f"Anomalous behavior detected — risk score {score}/100")

        return " · ".join(reasons)

# Single instance reused across the app
detector = FraudDetector()