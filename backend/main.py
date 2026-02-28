from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
import pandas as pd
import io
import random
from datetime import datetime, timedelta

from database import engine, get_db, Base
from models import Transaction
from ml.fraud_detector import detector

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="FraudLens API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── SEED DATA ─────────────────────────────────────────────────────────────────

def seed_database(db: Session):
    if db.query(Transaction).count() > 0:
        return  # already seeded

    NAMES = ["Arjun Sharma","Priya Patel","Rohan Mehta","Sneha Iyer","Vikram Nair",
             "Ananya Gupta","Kiran Reddy","Divya Joshi","Aditya Kumar","Pooja Singh",
             "Rahul Verma","Neha Kapoor","Siddharth Rao","Kavya Nambiar","Amit Shah",
             "Shreya Mishra","Rajesh Pillai","Lakshmi Agarwal","Vivek Tiwari","Meera Bose"]
    CATEGORIES = ["Electronics","Clothing","Footwear","Home Decor","Accessories","Sports"]
    REASONS = ["Defective product","Wrong size","Changed mind","Not as described",
               "Better price elsewhere","Damaged in shipping","Duplicate order"]
    CITIES = ["Mumbai","Delhi","Bangalore","Chennai","Hyderabad","Pune","Kolkata"]

    random.seed(42)
    raw = []
    base_date = datetime(2024, 11, 1)

    for i in range(200):
        ci = random.randint(0, len(NAMES) - 1)
        raw.append({
            "order_id": f"ORD{100000 + i}",
            "customer_id": f"CUST{1000 + ci}",
            "customer_name": NAMES[ci],
            "city": random.choice(CITIES),
            "category": random.choice(CATEGORIES),
            "order_value": round(random.uniform(299, 15999), 2),
            "return_reason": random.choice(REASONS),
            "return_count": random.randint(1, 12),
            "return_day_gap": random.randint(0, 30),
            "date": (base_date + timedelta(days=random.randint(0, 89))).strftime("%Y-%m-%d"),
            "status": "Pending Review",
        })

    # Run ML model on all transactions
    scored = detector.predict(raw)

    for t in scored:
        db.add(Transaction(**t))

    db.commit()
    print(f"✅ Seeded {len(scored)} transactions")


# ── STARTUP ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    db = next(get_db())
    seed_database(db)


# ── STATS ─────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    total = db.query(Transaction).count()
    flagged = db.query(Transaction).filter(Transaction.is_fraud == True).count()
    fraud_value = db.query(func.sum(Transaction.order_value))\
        .filter(Transaction.is_fraud == True).scalar() or 0
    avg_score = db.query(func.avg(Transaction.risk_score)).scalar() or 0

    return {
        "total_returns": total,
        "flagged_orders": flagged,
        "fraud_rate": round(flagged / total * 100, 1) if total else 0,
        "amount_at_risk": round(fraud_value, 2),
        "amount_saved": round(fraud_value * 0.73, 2),
        "avg_risk_score": round(avg_score, 1),
    }


# ── ORDERS ────────────────────────────────────────────────────────────────────

@app.get("/api/orders")
def get_orders(
    flagged_only: bool = False,
    category: str = None,
    min_score: int = 0,
    search: str = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    query = db.query(Transaction)

    if flagged_only:
        query = query.filter(Transaction.is_fraud == True)
    if category:
        query = query.filter(Transaction.category == category)
    if min_score:
        query = query.filter(Transaction.risk_score >= min_score)
    if search:
        query = query.filter(
            Transaction.customer_name.contains(search) |
            Transaction.order_id.contains(search) |
            Transaction.customer_id.contains(search)
        )

    return query.order_by(Transaction.risk_score.desc()).limit(limit).all()


@app.get("/api/orders/{order_id}")
def get_order(order_id: str, db: Session = Depends(get_db)):
    order = db.query(Transaction).filter(Transaction.order_id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@app.patch("/api/orders/{order_id}/status")
def update_status(order_id: str, payload: dict, db: Session = Depends(get_db)):
    order = db.query(Transaction).filter(Transaction.order_id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.status = payload.get("status", order.status)
    db.commit()
    return order


# ── FRAUD SUMMARY ─────────────────────────────────────────────────────────────

@app.get("/api/fraud-summary/{order_id}")
def get_fraud_summary(order_id: str, db: Session = Depends(get_db)):
    order = db.query(Transaction).filter(Transaction.order_id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    customer_orders = db.query(Transaction)\
        .filter(Transaction.customer_id == order.customer_id).all()
    fraud_count = sum(1 for o in customer_orders if o.is_fraud)

    summary = f"""FRAUD ANALYSIS — {order.order_id}

Customer: {order.customer_name} ({order.customer_id})
Risk Score: {order.risk_score}/100
Primary Flag: {order.fraud_type or 'Anomalous pattern detected'}

Behavioral Signals:
- Total returns by this customer: {order.return_count}
- Return filed after: {order.return_day_gap} day(s)
- Item value: ₹{order.order_value:,.2f}
- Stated reason: {order.return_reason}
- Fraud flags on account: {fraud_count} of {len(customer_orders)} orders

Assessment:
This order exhibits {'HIGH' if order.risk_score >= 85 else 'MODERATE'} fraud probability.
{'Immediate escalation recommended.' if order.risk_score >= 85 else 'Hold refund pending manual review.'}

Recommended Action: {'Block refund & escalate to fraud team' if order.risk_score >= 85 else 'Hold for manual review'}"""

    return {"summary": summary, "order": order}


# ── ANALYTICS ─────────────────────────────────────────────────────────────────

@app.get("/api/trends")
def get_trends(db: Session = Depends(get_db)):
    base = datetime(2024, 11, 1)
    result = []
    for i in range(12):
        week = (base + timedelta(weeks=i)).strftime("%b %d")
        total = random.randint(18, 35)
        flagged = random.randint(3, 12)
        result.append({
            "week": week,
            "total_returns": total,
            "flagged": flagged,
            "amount_saved": round(flagged * random.uniform(2000, 8000), 2),
        })
    return result


@app.get("/api/categories")
def get_categories(db: Session = Depends(get_db)):
    rows = db.query(Transaction).all()
    result = {}
    for r in rows:
        if r.category not in result:
            result[r.category] = {"total": 0, "flagged": 0, "value": 0}
        result[r.category]["total"] += 1
        if r.is_fraud:
            result[r.category]["flagged"] += 1
        result[r.category]["value"] += r.order_value
    return [
        {"category": k, **v,
         "fraud_rate": round(v["flagged"] / v["total"] * 100, 1)}
        for k, v in result.items()
    ]


@app.get("/api/cities")
def get_cities(db: Session = Depends(get_db)):
    rows = db.query(Transaction).all()
    result = {}
    for r in rows:
        if r.city not in result:
            result[r.city] = {"total": 0, "flagged": 0}
        result[r.city]["total"] += 1
        if r.is_fraud:
            result[r.city]["flagged"] += 1
    return [
        {"city": k, **v,
         "fraud_rate": round(v["flagged"] / v["total"] * 100, 1)}
        for k, v in result.items()
    ]


# ── CSV UPLOAD ────────────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    contents = await file.read()
    df = pd.read_csv(io.StringIO(contents.decode("utf-8")))

    required = ["order_id","customer_id","customer_name","order_value",
                "return_count","return_day_gap","category","return_reason"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing columns: {missing}")

    raw = df.to_dict(orient="records")
    scored = detector.predict(raw)

    added = 0
    for t in scored:
        exists = db.query(Transaction)\
            .filter(Transaction.order_id == t["order_id"]).first()
        if not exists:
            db.add(Transaction(**t))
            added += 1

    db.commit()
    return {"message": f"Uploaded {added} new transactions", "total": len(scored)}