from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, JSON
from sqlalchemy.sql import func
from database import Base

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(String, unique=True, index=True)
    customer_id = Column(String, index=True)
    customer_name = Column(String)
    city = Column(String)
    category = Column(String)
    order_value = Column(Float)
    return_reason = Column(String)
    return_count = Column(Integer)
    return_day_gap = Column(Integer)
    risk_score = Column(Float, default=0.0)
    is_fraud = Column(Boolean, default=False)
    fraud_type = Column(String, nullable=True)
    status = Column(String, default="Pending Review")
    date = Column(String)
    created_at = Column(DateTime, default=func.now())

    # Option A — Order Fingerprint
    fingerprint = Column(JSON, nullable=True)
    fingerprint_match = Column(Boolean, nullable=True)
    fingerprint_mismatch_reason = Column(String, nullable=True)

    # Option C — Reason/Category mismatch
    reason_category_mismatch = Column(Boolean, default=False)

    # Option B (Wardrobing) — Photo verification
    photo_verification_required = Column(Boolean, default=False)
    photo_verification_status = Column(String, default="Not Required")

class FieldVerification(Base):
    __tablename__ = "field_verifications"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(String, index=True)
    agent_name = Column(String)
    item_matches_order = Column(Boolean, nullable=True)
    tag_attached = Column(Boolean, nullable=True)
    packaging_intact = Column(Boolean, nullable=True)
    item_condition = Column(String, nullable=True)
    agent_notes = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    verification_result = Column(String, default="Pending")
    verified_at = Column(DateTime, default=func.now())