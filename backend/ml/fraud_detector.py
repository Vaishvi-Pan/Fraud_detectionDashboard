import numpy as np
import pandas as pd
import random
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# ── Option C: Reason-Category Mismatch Matrix ─────────────────────────────────
INVALID_COMBINATIONS = {
    # Electronics CAN be wrong size (cables, cases, screen protectors)
    # So we only flag truly impossible reasons
    "Electronics": ["Doesn't fit clothing", "Fabric defect", "Stitching issue"],
    "Clothing":    ["Technical malfunction", "Software issue", "Not compatible", "Overheating"],
    "Books":       ["Technical malfunction", "Software issue", "Not compatible", "Wrong size"],
    "Footwear":    ["Technical malfunction", "Software issue", "Not compatible", "Overheating"],
    "Sports":      ["Software issue", "Overheating"],
    "Home Decor":  ["Wrong size clothing", "Fabric shrinkage"],
    "Accessories": ["Technical malfunction", "Software issue", "Overheating"],
}

# ── Option A: Fingerprint Templates per Category ──────────────────────────────
FINGERPRINT_TEMPLATES = {
    "Electronics": ["serial_number", "color", "model", "seal_intact", "accessories_count"],
    "Clothing":    ["color", "size", "tag_attached", "fabric_condition", "stitching_intact"],
    "Footwear":    ["color", "size", "sole_condition", "tag_attached", "box_intact"],
    "Home Decor":  ["color", "dimensions", "packaging_intact", "parts_count"],
    "Accessories": ["color", "tag_attached", "packaging_intact", "serial_number"],
    "Sports":      ["color", "size", "seal_intact", "accessories_count"],
    "Books":       ["isbn", "condition", "pages_intact", "cover_condition"],
}

def generate_fingerprint(category: str, order_id: str) -> dict:
    """Generate a unique fingerprint for an order at purchase time."""
    fields = FINGERPRINT_TEMPLATES.get(category, ["color", "condition", "tag_attached"])
    random.seed(hash(order_id) % 10000)

    fingerprint = {"order_id": order_id, "category": category}
    for field in fields:
        if field in ["serial_number", "isbn"]:
            fingerprint[field] = f"SN{random.randint(100000, 999999)}"
        elif field in ["seal_intact", "tag_attached", "packaging_intact",
                       "pages_intact", "box_intact", "stitching_intact"]:
            fingerprint[field] = True  # always True at purchase time
        elif field == "color":
            fingerprint[field] = random.choice(["Black","White","Blue","Red","Green"])
        elif field == "size":
            fingerprint[field] = random.choice(["S","M","L","XL","XXL"])
        elif field in ["accessories_count", "parts_count"]:
            fingerprint[field] = random.randint(1, 4)
        elif field == "condition":
            fingerprint[field] = "New"
        else:
            fingerprint[field] = "Original"
    return fingerprint

def simulate_return_fingerprint(original: dict, is_fraud: bool) -> tuple[dict, bool, str]:
    """
    Simulate what the warehouse scans at return time.
    If fraud, introduce mismatches. If legit, fingerprint matches.
    """
    returned = original.copy()
    mismatch_reason = None
    has_mismatch = False

    if is_fraud:
        mismatch_chance = random.random()
        if mismatch_chance > 0.4:  # 60% of fraud orders have fingerprint mismatch
            field = random.choice([
                k for k in original
                if k not in ["order_id", "category"]
            ])
            original_val = original[field]

            if isinstance(original_val, bool):
                returned[field] = False
                mismatch_reason = f"'{field}' mismatch — expected True, found False at return"
            elif isinstance(original_val, str) and field == "color":
                new_color = random.choice(["Black","White","Blue","Red","Green","Yellow"])
                if new_color != original_val:
                    returned[field] = new_color
                    mismatch_reason = f"Color mismatch — ordered {original_val}, returned {new_color}"
            elif isinstance(original_val, str) and field == "serial_number":
                returned[field] = f"SN{random.randint(100000, 999999)}"
                mismatch_reason = f"Serial number mismatch — item returned is not the item purchased"
            elif isinstance(original_val, int):
                returned[field] = max(0, original_val - 1)
                mismatch_reason = f"'{field}' mismatch — expected {original_val}, found {returned[field]}"
            elif isinstance(original_val, str):
                returned[field] = "Damaged"
                mismatch_reason = f"'{field}' mismatch — condition changed from Original to Damaged"

            has_mismatch = mismatch_reason is not None

    return returned, has_mismatch, mismatch_reason or ""


class FraudDetector:
    def __init__(self):
        self.model = IsolationForest(
            contamination=0.15,
            random_state=42,
            n_estimators=100
        )
        self.scaler = StandardScaler()
        self.is_trained = False

    def check_reason_category_mismatch(self, category: str, reason: str) -> bool:
        invalid_reasons = INVALID_COMBINATIONS.get(category, [])
        return reason in invalid_reasons

    def prepare_features(self, transactions: list[dict]) -> pd.DataFrame:
        df = pd.DataFrame(transactions)
        features = df[["return_count", "return_day_gap", "order_value"]].copy()

        features["high_value_quick_return"] = (
            (df["order_value"] > 5000) & (df["return_day_gap"] <= 1)
        ).astype(int)

        features["serial_returner"] = (df["return_count"] >= 6).astype(int)
        features["value_per_return"] = df["order_value"] / (df["return_count"] + 1)

        # Option C feature
        features["reason_mismatch"] = df.apply(
            lambda row: int(self.check_reason_category_mismatch(
                row.get("category", ""),
                row.get("return_reason", "")
            )), axis=1
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
        raw_scores = self.model.decision_function(scaled)

        results = []
        for i, transaction in enumerate(transactions):
            normalized = (raw_scores[i] - raw_scores.min()) / (raw_scores.max() - raw_scores.min())
            risk_score = round((1 - normalized) * 99 + 1)

            # ── Option C: Boost score if reason-category mismatch ────────────
            reason_mismatch = self.check_reason_category_mismatch(
                transaction.get("category", ""),
                transaction.get("return_reason", "")
            )
            if reason_mismatch:
                risk_score = min(risk_score + 25, 99)

            # ── Option A: Generate fingerprint & simulate return scan ─────────
            fingerprint = generate_fingerprint(
                transaction.get("category", ""),
                transaction.get("order_id", str(i))
            )
            is_fraud_prelim = risk_score >= 70
            returned_fp, fp_mismatch, fp_mismatch_reason = simulate_return_fingerprint(
                fingerprint, is_fraud_prelim
            )
            if fp_mismatch:
                risk_score = min(risk_score + 20, 99)

            is_fraud = risk_score >= 70
            fraud_explanations = self._explain_fraud(
                transaction, risk_score, reason_mismatch,
                fp_mismatch, fp_mismatch_reason
            )

            # Wardrobing → require photo verification
            wardrobing = (
                transaction.get("order_value", 0) > 5000 and
                transaction.get("return_day_gap", 99) <= 1
            )

            results.append({
                **transaction,
                "risk_score": risk_score,
                "is_fraud": is_fraud,
                "fraud_type": fraud_explanations if is_fraud else None,
                "reason_category_mismatch": reason_mismatch,
                "fingerprint": fingerprint,
                "fingerprint_match": not fp_mismatch,
                "fingerprint_mismatch_reason": fp_mismatch_reason if fp_mismatch else None,
                "photo_verification_required": wardrobing,
                "photo_verification_status": "Pending Upload" if wardrobing else "Not Required",
            })

        return sorted(results, key=lambda x: x["risk_score"], reverse=True)

    def _explain_fraud(self, t: dict, score: int,
                       reason_mismatch: bool,
                       fp_mismatch: bool,
                       fp_mismatch_reason: str) -> str:
        reasons = []

        # Serial returning
        if t.get("return_count", 0) >= 8:
            reasons.append(f"Serial returner — {t['return_count']} returns on record")
        elif t.get("return_count", 0) >= 5:
            reasons.append(f"High return frequency — {t['return_count']} returns")

        # Wardrobing
        if t.get("return_day_gap", 99) <= 1 and t.get("order_value", 0) > 5000:
            reasons.append(
                f"Wardrobing detected — ₹{t['order_value']:,.0f} item "
                f"returned in {t['return_day_gap']} day(s) · Photo verification required"
            )

        # Same-day return
        if t.get("return_day_gap", 99) == 0:
            reasons.append("Same-day return — high suspicion of receipt manipulation")

        # Option C — Reason mismatch
        if reason_mismatch:
            reasons.append(
                f"Return reason mismatch — '{t.get('return_reason')}' "
                f"is not valid for category '{t.get('category')}'"
            )

        # Option A — Fingerprint mismatch
        if fp_mismatch and fp_mismatch_reason:
            reasons.append(f"Fingerprint mismatch — {fp_mismatch_reason}")

        # High value repeat
        if t.get("order_value", 0) > 10000 and t.get("return_count", 0) >= 3:
            reasons.append(
                f"High-value repeat pattern — "
                f"₹{t['order_value']:,.0f} item, {t['return_count']} total returns"
            )

        if not reasons:
            reasons.append(f"Anomalous behavioral pattern — risk score {score}/100")

        return " · ".join(reasons)


detector = FraudDetector()