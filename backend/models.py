from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
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