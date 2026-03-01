FraudLens — Returns Fraud Detection Dashboard

AI-powered dashboard that detects, scores, and explains e-commerce return fraud in real time.


1. Problem Statement
Problem Title: Returns Fraud Detection in E-Commerce Platforms
Problem Description:
E-commerce platforms face growing losses due to fraudulent return behavior. Common patterns include serial returners, wardrobing (using items temporarily before returning), and receipt manipulation. Return fraud is difficult to detect manually due to large transaction volumes and subtle behavioral patterns. Many platforms rely on basic rule-based systems that fail to detect evolving fraud strategies.
Target Users:

Fraud analysts at e-commerce companies
Operations managers handling return workflows
Risk and compliance teams

Existing Gaps:

No structured system to analyze transaction logs for suspicious return behavior
No explainability — systems flag orders but don't say why
Rule-based systems are easy to game and produce high false positives
No visual interface for analysts to act on fraud signals quickly


2. Problem Understanding & Approach
Root Cause Analysis:

Return fraud thrives because platforms process thousands of returns daily with no intelligent pattern detection
Fraudsters exploit generous return policies by returning used/different items or repeatedly abusing refund workflows
Existing rule-based systems (e.g. "flag if >5 returns/month") are static and easily bypassed

Solution Strategy:

Use unsupervised anomaly detection (Isolation Forest) to detect unusual return behavior without needing labelled fraud data
Engineer behavioral features (return frequency, return timing, item value patterns) to capture subtle fraud signals
Provide human-readable explanations for every flagged order so analysts can act confidently
Build a real-time dashboard for fraud teams to monitor, investigate, and resolve cases


3. Proposed Solution
Solution Overview:
FraudLens is a web-based Returns Fraud Detection Dashboard that ingests transaction logs, applies ML-based anomaly detection, assigns interpretable risk scores (0–100), and presents findings in a clean, actionable interface.
Core Idea:
Combine Isolation Forest anomaly detection with rule-based explainability to give fraud analysts a prioritized queue of suspicious orders — each with a clear explanation of why it was flagged.
Key Features:

Real-time fraud risk scoring (0–100) for every return order
Anomaly detection using Isolation Forest — no labelled data required
Plain-English explanation for every flagged case (e.g. "Serial returner — 8 returns in 30 days, wardrobing pattern detected")
Interactive dashboard with fraud queue, filters, search, and charts
One-click actions: Escalate, Clear, or Hold orders for review
Trend charts showing flagged vs total returns over time
Fraud breakdown by category and city
CSV upload to ingest real transaction data


4. System Architecture
High-Level Flow:
User → Frontend (Next.js) → Backend (FastAPI) → ML Model (Isolation Forest) → Database (SQLite) → Response
Architecture Description:

The user interacts with a Next.js frontend dashboard
The frontend calls REST API endpoints on the FastAPI backend
The backend runs transaction data through the Isolation Forest model to compute risk scores
Results are stored in a SQLite database and returned to the frontend as JSON
The fraud explanation engine generates human-readable reasons for each flagged order

Architecture Diagram:
┌─────────────────────────────────────────────────┐
│              FRONTEND (Next.js)                  │
│  Dashboard · Charts · Fraud Queue · Modal        │
└────────────────────┬────────────────────────────┘
                     │ REST API (HTTP/JSON)
┌────────────────────▼────────────────────────────┐
│              BACKEND (FastAPI)                   │
│  /api/stats · /api/orders · /api/fraud-summary  │
│  /api/trends · /api/categories · /api/upload    │
└──────────┬──────────────────┬───────────────────┘
           │                  │
┌──────────▼──────┐  ┌────────▼──────────────────┐
│   ML ENGINE     │  │      DATABASE (SQLite)     │
│ Isolation Forest│  │  transactions table        │
│ Risk Scoring    │  │  risk_score, is_fraud,     │
│ Explainability  │  │  status, fraud_type        │
└─────────────────┘  └───────────────────────────┘


6. Dataset Selected
Dataset Name: Synthetic E-Commerce Returns Dataset
Source: Programmatically generated using Python (mirrors real-world return patterns)
Data Type: Tabular (CSV / SQLite)
Selection Reason:
A synthetic dataset was used to ensure full control over fraud pattern distribution, avoid data privacy issues, and enable rapid prototyping. The dataset mirrors real behavioral patterns including serial returners, wardrobing, and high-value quick returns.
Preprocessing Steps:

Generated 200 transactions with realistic customer names, cities, categories, and return reasons
Engineered features: high_value_quick_return, serial_returner, value_per_return
Normalized features using StandardScaler before feeding to Isolation Forest
Risk scores normalized to 0–100 range from raw Isolation Forest decision scores


7. Model Selected
Model Name: Isolation Forest (scikit-learn)
Selection Reasoning:
Isolation Forest is ideal for this problem because:

It is an unsupervised model — no labelled fraud data is required
It is specifically designed for anomaly detection in high-dimensional tabular data
It works well with imbalanced datasets (fraud is rare)
It is fast, interpretable, and production-ready

Alternatives Considered:

Local Outlier Factor (LOF): Good for density-based anomalies but slower on large datasets
Autoencoder (deep learning): More powerful but overkill for a 24hr hackathon and requires more data
Rule-based system: Simple but static — easy for fraudsters to game

Evaluation Metrics:

Contamination rate set to 15% (expected fraud proportion)
Risk score distribution reviewed to ensure separation between fraud and non-fraud
Explainability rules validated against known fraud patterns (wardrobing, serial returning)


8. Technology Stack
LayerTechnologyFrontendNext.js 14, Tailwind CSS, Recharts, Lucide ReactBackendPython, FastAPI, UvicornML/AIscikit-learn (Isolation Forest), pandas, numpyDatabaseSQLite, SQLAlchemyDeploymentVercel (Frontend), Railway (Backend)

9. API Documentation & Testing
API Endpoints List:
MethodEndpointDescriptionGET/api/statsOverall fraud statistics (total, flagged, amount at risk)GET/api/ordersList orders with filters (flagged_only, category, min_score, search)GET/api/orders/{order_id}Single order detailsPATCH/api/orders/{order_id}/statusUpdate order status (Escalate/Clear/Hold)GET/api/fraud-summary/{order_id}AI-generated fraud explanation for an orderGET/api/trendsWeekly trend data for chartsGET/api/categoriesFraud breakdown by product categoryGET/api/citiesFraud breakdown by cityPOST/api/uploadUpload CSV of transaction data
API Testing Screenshots:
(Add Postman / Thunder Client screenshots here)

10. Module-wise Development & Deliverables
Checkpoint 1: Research & Planning

Deliverables: Problem statement analysis, solution approach, architecture diagram, GitHub repo structure

Checkpoint 2: Backend Development

Deliverables: FastAPI server, SQLite database, SQLAlchemy models, all 9 API endpoints, seeded synthetic data

Checkpoint 3: Frontend Development

Deliverables: Next.js dashboard, stat cards, fraud alert table, trend charts, category charts, search and filters

Checkpoint 4: Model Training

Deliverables: Isolation Forest model, feature engineering, StandardScaler normalization, risk score generation

Checkpoint 5: Model Integration

Deliverables: ML model integrated into FastAPI startup, fraud scores saved to DB, explainability engine generating plain-English fraud reasons

Checkpoint 6: Deployment

Deliverables: Frontend deployed on Vercel, backend deployed on Railway, end-to-end live demo working


11. End-to-End Workflow

Analyst opens FraudLens dashboard in browser
Dashboard loads real-time stats: total returns, flagged orders, amount at risk, amount saved
Fraud Alert Queue displays all high-risk orders sorted by risk score
Analyst filters by risk level (High 85+, Medium 70–84) or category
Analyst clicks on a flagged order to open the detail modal
Modal shows full behavioral analysis and AI-generated fraud explanation
Analyst takes action — Escalate to fraud team, Clear the order, or Hold for review
Status updates are saved to the database and reflected live in the dashboard


12. Demo & Video

Live Demo Link: https://fraud-detectiondashboard.vercel.app/
Live Video Link: https://drive.google.com/file/d/1sL011Jt3p5GxJUKJ5V50nxOIHreUmAFf/view?usp=sharing
PPT Link: https://drive.google.com/file/d/1nVcxxcgCeLRjDKClB9lB7oeodY6SorhO/view?usp=drive_link

13. Hackathon Deliverables Summary

Fully functional Returns Fraud Detection Dashboard (web app)
FastAPI backend with 9 REST API endpoints
Isolation Forest ML model with real-time risk scoring
Plain-English explainability engine for every flagged order
Next.js frontend with charts, fraud queue, filters, and analyst actions
SQLite database with seeded transaction data
README documentation with architecture and API docs


14. Team Roles & Responsibilities
Member NameRoleResponsibilities(Member 1)Backend EngineerFastAPI server, database design, ML model integration, API endpoints(Member 2)Frontend EngineerNext.js dashboard, UI components, API integration, charts(Member 3)ML Engineer & DataIsolation Forest model, feature engineering, synthetic dataset, fraud explainability, demo prep

15. Future Scope & Scalability
Short-Term:

Integrate real Kaggle e-commerce returns dataset for improved model accuracy
Add user authentication for fraud analysts
Add email/Slack alerts when high-risk orders are detected
Implement SHAP values for deeper ML explainability

Long-Term:

Real-time streaming pipeline using Kafka for live transaction ingestion
Multi-tenant support for multiple e-commerce clients
Graph-based fraud detection to identify fraud rings across accounts
Mobile app for on-the-go fraud review
Integration with payment gateways to auto-block refunds on flagged orders


16. Known Limitations

Currently uses synthetic data — model accuracy will improve significantly with real transaction data
Isolation Forest contamination rate (15%) is manually set — ideally learned from historical fraud labels
No user authentication implemented in the hackathon version
SQLite is not suitable for production scale — would need PostgreSQL for high volume


17. Impact

Reduces financial losses from return fraud for e-commerce platforms
Empowers fraud analysts with an explainable, actionable tool instead of raw spreadsheets
Protects honest customers by reducing false positives through intelligent scoring
Scalable architecture can handle thousands of transactions with minimal changes
Explainability engine builds analyst trust in AI-driven fraud detection
