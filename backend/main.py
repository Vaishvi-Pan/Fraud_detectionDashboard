from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
import pandas as pd
import io
import random
from datetime import datetime, timedelta

from database import engine, get_db, Base
from models import Transaction, FieldVerification
from ml.fraud_detector import detector
import base64
import os
from models import Transaction, FieldVerification

Base.metadata.create_all(bind=engine)

app = FastAPI(title="FraudLens API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── SEED ──────────────────────────────────────────────────────────────────────

def seed_database(db: Session):
    if db.query(Transaction).count() > 0:
        return

    NAMES = [
        "Arjun Sharma","Priya Patel","Rohan Mehta","Sneha Iyer","Vikram Nair",
        "Ananya Gupta","Kiran Reddy","Divya Joshi","Aditya Kumar","Pooja Singh",
        "Rahul Verma","Neha Kapoor","Siddharth Rao","Kavya Nambiar","Amit Shah",
        "Shreya Mishra","Rajesh Pillai","Lakshmi Agarwal","Vivek Tiwari","Meera Bose",
        "Harsh Malhotra","Ritika Saxena","Nikhil Chandra","Swati Desai","Gaurav Pandey",
        "Deepak Jain","Sunita Yadav","Manish Gupta","Rekha Singh","Ajay Verma",
    ]
    CATEGORIES = ["Electronics","Clothing","Footwear","Home Decor","Accessories","Sports"]
    REASONS = [
        "Defective product","Wrong size","Changed mind","Not as described",
        "Better price elsewhere","Damaged in shipping","Duplicate order","Gift return",
    ]
    CITIES = ["Mumbai","Delhi","Bangalore","Chennai","Hyderabad","Pune","Kolkata","Ahmedabad","Jaipur","Surat"]

    random.seed(42)
    raw = []
    base_date = datetime(2024, 9, 1)

    for i in range(500):
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
            "date": (base_date + timedelta(days=random.randint(0, 120))).strftime("%Y-%m-%d"),
            "status": "Pending Review",
            "is_locked": False,
        })

    scored = detector.predict(raw)
    for t in scored:
        t.pop("is_locked", None)
        db.add(Transaction(**t))
    db.commit()
    print(f"✅ Seeded 500 transactions")


@app.on_event("startup")
def startup():
    db = next(get_db())
    seed_database(db)


# ── STATS (real-time) ─────────────────────────────────────────────────────────

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    total = db.query(Transaction).count()
    flagged = db.query(Transaction).filter(Transaction.is_fraud == True).count()
    
    # Only count unresolved fraud for "at risk"
    unresolved = db.query(Transaction).filter(
        Transaction.is_fraud == True,
        Transaction.status.in_(["Pending Review", "Flagged"])
    ).all()
    resolved_fraud = db.query(Transaction).filter(
        Transaction.is_fraud == True,
        Transaction.status == "Escalated"
    ).all()

    at_risk = sum(o.order_value for o in unresolved)
    saved = sum(o.order_value for o in resolved_fraud)
    avg_score = db.query(func.avg(Transaction.risk_score)).scalar() or 0

    return {
        "total_returns": total,
        "flagged_orders": flagged,
        "pending_review": len(unresolved),
        "fraud_rate": round(flagged / total * 100, 1) if total else 0,
        "amount_at_risk": round(at_risk, 2),
        "amount_saved": round(saved, 2),
        "avg_risk_score": round(avg_score, 1),
    }


# ── ORDERS ────────────────────────────────────────────────────────────────────

@app.get("/api/orders")
def get_orders(
    flagged_only: bool = False,
    category: str = None,
    min_score: int = 0,
    search: str = None,
    limit: int = 100,
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
    
    # 🔒 LOCKED — cannot re-edit once resolved
    if order.is_locked:
        raise HTTPException(status_code=403, detail="Order is locked and cannot be modified")
    
    new_status = payload.get("status")
    order.status = new_status
    
    # Lock if final decision made
    if new_status in ["Escalated", "Cleared"]:
        order.is_locked = True
    
    db.commit()
    return order


# ── FRAUD SUMMARY ─────────────────────────────────────────────────────────────

@app.get("/api/fraud-summary/{order_id}")
def get_fraud_summary(order_id: str, db: Session = Depends(get_db)):
    order = db.query(Transaction).filter(Transaction.order_id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    customer_orders = db.query(Transaction).filter(
        Transaction.customer_id == order.customer_id
    ).all()
    fraud_count = sum(1 for o in customer_orders if o.is_fraud)

    # Build detailed summary
    flags = []
    if order.reason_category_mismatch:
        flags.append(f"⚠️  REASON MISMATCH: '{order.return_reason}' is invalid for '{order.category}'")
    if order.fingerprint_mismatch_reason:
        flags.append(f"🔍 FINGERPRINT: {order.fingerprint_mismatch_reason}")
    if order.photo_verification_required:
        flags.append(f"📸 WARDROBING: Photo verification required — tag must be attached")
    if order.return_count >= 6:
        flags.append(f"🔄 SERIAL: {order.return_count} returns on this account")

    flags_text = "\n".join(flags) if flags else "General anomalous pattern"

    summary = f"""FRAUD ANALYSIS — {order.order_id}
{'━' * 40}
Customer : {order.customer_name} ({order.customer_id})
City     : {order.city}
Risk Score: {order.risk_score}/100  {'🔴 HIGH' if order.risk_score >= 85 else '🟡 MEDIUM'}
Status   : {order.status} {'🔒 LOCKED' if order.is_locked else ''}

ORDER DETAILS
{'─' * 40}
Category  : {order.category}
Value     : ₹{order.order_value:,.2f}
Reason    : {order.return_reason}
Return Gap: {order.return_day_gap} day(s)
Returns   : {order.return_count} total · {fraud_count} flagged on account

FRAUD SIGNALS DETECTED
{'─' * 40}
{flags_text}

FINGERPRINT STATUS
{'─' * 40}
Match     : {'✅ MATCH' if order.fingerprint_match else '❌ MISMATCH — ' + (order.fingerprint_mismatch_reason or '')}

RECOMMENDED ACTION
{'─' * 40}
{'🔴 BLOCK REFUND — Escalate to fraud team immediately' if order.risk_score >= 85 else '🟡 HOLD — Manual review before processing refund'}
{'🔒 Decision is FINAL and LOCKED once submitted' if order.is_locked else '⚡ Awaiting analyst decision'}"""

    return {"summary": summary, "order": order}


# ── ANALYTICS ─────────────────────────────────────────────────────────────────

@app.get("/api/trends")
def get_trends(db: Session = Depends(get_db)):
    all_orders = db.query(Transaction).all()
    
    # Group by week from actual data
    weeks = {}
    for o in all_orders:
        try:
            d = datetime.strptime(o.date, "%Y-%m-%d")
            # Round to week
            week_start = d - timedelta(days=d.weekday())
            week_key = week_start.strftime("%b %d")
            if week_key not in weeks:
                weeks[week_key] = {"week": week_key, "total_returns": 0, "flagged": 0, "escalated": 0, "cleared": 0, "amount_saved": 0}
            weeks[week_key]["total_returns"] += 1
            if o.is_fraud:
                weeks[week_key]["flagged"] += 1
            if o.status == "Escalated":
                weeks[week_key]["escalated"] += 1
                weeks[week_key]["amount_saved"] += o.order_value
            if o.status == "Cleared":
                weeks[week_key]["cleared"] += 1
        except:
            continue

    return sorted(weeks.values(), key=lambda x: x["week"])


@app.get("/api/categories")
def get_categories(db: Session = Depends(get_db)):
    rows = db.query(Transaction).all()
    result = {}
    for r in rows:
        if r.category not in result:
            result[r.category] = {"total": 0, "flagged": 0, "escalated": 0, "cleared": 0, "value": 0}
        result[r.category]["total"] += 1
        if r.is_fraud:
            result[r.category]["flagged"] += 1
        if r.status == "Escalated":
            result[r.category]["escalated"] += 1
        if r.status == "Cleared":
            result[r.category]["cleared"] += 1
        result[r.category]["value"] += r.order_value

    return [
        {
            "category": k, **v,
            "fraud_rate": round(v["flagged"] / v["total"] * 100, 1)
        }
        for k, v in result.items()
    ]


@app.get("/api/cities")
def get_cities(db: Session = Depends(get_db)):
    rows = db.query(Transaction).all()
    result = {}
    for r in rows:
        if r.city not in result:
            result[r.city] = {"total": 0, "flagged": 0, "value": 0}
        result[r.city]["total"] += 1
        if r.is_fraud:
            result[r.city]["flagged"] += 1
        result[r.city]["value"] += r.order_value
    return [
        {"city": k, **v, "fraud_rate": round(v["flagged"] / v["total"] * 100, 1)}
        for k, v in result.items()
    ]


@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    contents = await file.read()
    df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
    required = ["order_id","customer_id","customer_name","order_value","return_count","return_day_gap","category","return_reason"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing columns: {missing}")
    raw = df.to_dict(orient="records")
    scored = detector.predict(raw)
    added = 0
    for t in scored:
        exists = db.query(Transaction).filter(Transaction.order_id == t["order_id"]).first()
        if not exists:
            db.add(Transaction(**t))
            added += 1
    db.commit()
    # ── FIELD VERIFICATION ────────────────────────────────────────────────────────

@app.get("/api/verify/{order_id}")
def get_order_for_agent(order_id: str, db: Session = Depends(get_db)):
    order = db.query(Transaction).filter(Transaction.order_id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    existing = db.query(FieldVerification).filter(
        FieldVerification.order_id == order_id
    ).first()
    
    return {
        "order_id": order.order_id,
        "customer_name": order.customer_name,
        "customer_id": order.customer_id,
        "category": order.category,
        "order_value": order.order_value,
        "return_reason": order.return_reason,
        "risk_score": order.risk_score,
        "photo_verification_required": order.photo_verification_required,
        "fingerprint": order.fingerprint,
        "already_verified": existing is not None,
        "verification": {
            "result": existing.verification_result,
            "agent_name": existing.agent_name,
            "agent_notes": existing.agent_notes,
            "item_condition": existing.item_condition,
            "verified_at": str(existing.verified_at),
        } if existing else None
    }


@app.post("/api/verify/{order_id}")
async def submit_verification(
    order_id: str,
    payload: dict,
    db: Session = Depends(get_db)
):
    order = db.query(Transaction).filter(Transaction.order_id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    existing = db.query(FieldVerification).filter(
        FieldVerification.order_id == order_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already verified by field agent")

    item_matches = payload.get("item_matches_order", False)
    tag_attached = payload.get("tag_attached", True)
    packaging_intact = payload.get("packaging_intact", True)
    item_condition = payload.get("item_condition", "Good")

    failed = (
        not item_matches or
        (order.photo_verification_required and not tag_attached) or
        item_condition in ["Fake", "Damaged"]
    )
    result = "Failed" if failed else "Passed"

    verification = FieldVerification(
        order_id=order_id,
        agent_name=payload.get("agent_name", "Field Agent"),
        item_matches_order=item_matches,
        tag_attached=tag_attached,
        packaging_intact=packaging_intact,
        item_condition=item_condition,
        agent_notes=payload.get("agent_notes", ""),
        photo_url=payload.get("photo_url", ""),
        verification_result=result,
    )
    db.add(verification)

    if result == "Failed" and not order.is_locked:
        order.status = "Escalated"
        order.is_locked = True
    elif result == "Passed" and not order.is_locked:
        order.status = "Cleared"
        order.is_locked = True

    order.photo_verification_status = f"Verified by agent — {result}"
    db.commit()

    return {
        "message": f"Verification submitted — {result}",
        "result": result,
        "order_status": order.status
    }


@app.get("/api/verifications")
def get_all_verifications(db: Session = Depends(get_db)):
    return db.query(FieldVerification).order_by(
        FieldVerification.verified_at.desc()
    ).all()


@app.get("/api/verifications/{order_id}")
def get_verification(order_id: str, db: Session = Depends(get_db)):
    v = db.query(FieldVerification).filter(
        FieldVerification.order_id == order_id
    ).first()
    if not v:
        return None
    return v
    return {"message": f"Uploaded {added} new transactions", "total": len(scored)}

