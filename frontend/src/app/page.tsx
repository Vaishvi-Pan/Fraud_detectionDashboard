"use client";

import { useEffect, useState, useCallback } from "react";
import { getStats, getOrders, getOrder, getFraudSummary, updateOrderStatus, getTrends, getCategories, getCities } from "../../lib/api";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Search, AlertTriangle, TrendingUp, Shield, DollarSign, ChevronRight, X, Lock, RefreshCw } from "lucide-react";

type Page = "dashboard" | "queue" | "trends" | "categories";

export default function Dashboard() {
  const [page, setPage] = useState<Page>("dashboard");
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [fraudSummary, setFraudSummary] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, o, t, c, ci] = await Promise.all([
        getStats(),
        getOrders({ flagged_only: true, limit: 100 }),
        getTrends(),
        getCategories(),
        getCities(),
      ]);
      setStats(s);
      setOrders(o);
      setTrends(t);
      setCategories(c);
      setCities(ci);
    } catch (e) {
      console.error("Load error:", e);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleSearch(val: string) {
    setSearch(val);
    const o = await getOrders({ flagged_only: true, search: val, limit: 100 });
    setOrders(o);
  }

  async function handleFilter(f: string) {
    setFilter(f);
    const params: any = { flagged_only: true, limit: 100 };
    if (f === "high") params.min_score = 85;
    else if (f === "medium") params.min_score = 70;
    else if (f !== "all") params.category = f;
    const o = await getOrders(params);
    setOrders(o);
  }

  async function openModal(order: any) {
    setSelectedOrder(order);
    setFraudSummary("Loading analysis...");
    setModalOpen(true);
    try {
      const data = await getFraudSummary(order.order_id);
      setFraudSummary(data.summary);
    } catch {
      setFraudSummary(`FRAUD ANALYSIS — ${order.order_id}
${"━".repeat(40)}
Customer  : ${order.customer_name} (${order.customer_id})
City      : ${order.city}
Risk Score: ${order.risk_score}/100 ${order.risk_score >= 85 ? "🔴 HIGH" : "🟡 MEDIUM"}

ORDER DETAILS
${"─".repeat(40)}
Category  : ${order.category}
Value     : ₹${order.order_value?.toLocaleString("en-IN")}
Reason    : ${order.return_reason}
Return Gap: ${order.return_day_gap} day(s)
Returns   : ${order.return_count} total

FRAUD SIGNALS
${"─".repeat(40)}
${order.reason_category_mismatch ? `⚠️  Reason mismatch — '${order.return_reason}' invalid for '${order.category}'\n` : ""}${!order.fingerprint_match ? `🔍 Fingerprint mismatch detected\n` : ""}${order.photo_verification_required ? `📸 Wardrobing — photo verification required\n` : ""}${order.return_count >= 6 ? `🔄 Serial returner — ${order.return_count} returns\n` : ""}
RECOMMENDED ACTION
${"─".repeat(40)}
${order.risk_score >= 85 ? "🔴 BLOCK REFUND — Escalate immediately" : "🟡 HOLD — Manual review required"}`);
    }
  }

  async function handleStatusUpdate(status: string) {
    if (!selectedOrder || actionLoading) return;
    if (selectedOrder.is_locked) return;
    setActionLoading(true);
    try {
      const updated = await updateOrderStatus(selectedOrder.order_id, status);
      setSelectedOrder(updated);
      await loadData();
    } catch (e: any) {
      console.error("Status update error:", e);
      try {
        const fresh = await getOrder(selectedOrder.order_id);
        setSelectedOrder(fresh);
      } catch {
        setModalOpen(false);
      }
    }
    setActionLoading(false);
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────
  function riskColor(score: number) {
    if (score >= 85) return "#ff3b3b";
    if (score >= 70) return "#f59e0b";
    return "#22c55e";
  }

  function riskStars(score: number) {
    if (score >= 85) return 4;
    if (score >= 70) return 3;
    if (score >= 50) return 2;
    if (score >= 30) return 1;
    return 0;
  }

  function StarRating({ score }: { score: number }) {
    const stars = riskStars(score);
    const color = riskColor(score);
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <span key={i} style={{ color: i <= stars ? color : "#333344", fontSize: 13 }}>★</span>
        ))}
      </div>
    );
  }

  function statusColor(status: string) {
    const map: any = {
      "Flagged": "bg-red-500/20 text-red-400 border border-red-500/30",
      "Escalated": "bg-red-500/20 text-red-400 border border-red-500/30",
      "Pending Review": "bg-amber-500/20 text-amber-400 border border-amber-500/30",
      "Cleared": "bg-green-500/20 text-green-400 border border-green-500/30",
    };
    return map[status] || "bg-blue-500/20 text-blue-400";
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-center">
        <div className="text-[#ff3b3b] text-4xl font-black mb-4">FraudLens</div>
        <div className="text-[#8888aa] font-mono text-sm animate-pulse">Loading intelligence...</div>
      </div>
    </div>
  );

  // ── ORDER ROW ─────────────────────────────────────────────────────────────
  const OrderRow = ({ order }: { order: any }) => (
    <tr onClick={() => openModal(order)}
      className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-all">
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-blue-400">{order.order_id}</span>
          {order.is_locked && <Lock size={10} className="text-[#55556a]" />}
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="text-sm font-semibold">{order.customer_name}</div>
        <div className="text-xs font-mono text-[#55556a]">{order.customer_id} · {order.city}</div>
      </td>
      <td className="px-5 py-4">
        <span className="px-2 py-1 rounded-full text-xs font-mono bg-blue-500/20 text-blue-400">{order.category}</span>
      </td>
      <td className="px-5 py-4 text-xs text-[#8888aa] max-w-32 truncate">{order.return_reason}</td>
      <td className="px-5 py-4 font-mono text-sm font-semibold">₹{order.order_value?.toLocaleString("en-IN")}</td>
      <td className="px-5 py-4">
        <div className="flex flex-col gap-1">
          <StarRating score={order.risk_score} />
        </div>
      </td>
      <td className="px-5 py-4">
        <span className={`px-2 py-1 rounded-full text-xs font-mono ${statusColor(order.status)}`}>{order.status}</span>
      </td>
      <td className="px-5 py-4">
        {order.is_locked ? <Lock size={13} className="text-[#55556a]" /> : <ChevronRight size={14} className="text-[#55556a]" />}
      </td>
    </tr>
  );

  // ── TABLE ─────────────────────────────────────────────────────────────────
  const OrderTable = ({ data, showFilters = false }: { data: any[], showFilters?: boolean }) => (
    <div className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden">
      {showFilters && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="text-sm font-bold">🔍 Fraud Alert Queue</div>
          <div className="flex gap-2 flex-wrap">
            {["all", "high", "medium", "Electronics", "Clothing", "Footwear"].map(f => (
              <button key={f} onClick={() => handleFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all ${filter === f ? "bg-red-500/20 text-[#ff3b3b] border-red-500/30" : "border-white/10 text-[#8888aa] hover:text-white"}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              {["Order ID", "Customer", "Category", "Reason", "Amount", "Risk", "Status", ""].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-mono text-[#55556a] uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0
              ? <tr><td colSpan={8} className="text-center py-12 text-[#55556a] font-mono text-sm">No orders found</td></tr>
              : data.map(o => <OrderRow key={o.order_id} order={o} />)
            }
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── PAGES ─────────────────────────────────────────────────────────────────
  const DashboardPage = () => (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Flagged Orders", value: stats?.flagged_orders, sub: `${stats?.fraud_rate}% fraud rate`, color: "#ff3b3b", icon: <AlertTriangle size={18} /> },
          { label: "Amount at Risk", value: `₹${(stats?.amount_at_risk / 100000).toFixed(1)}L`, sub: `${stats?.pending_review} pending review`, color: "#f59e0b", icon: <DollarSign size={18} /> },
          { label: "Amount Saved", value: `₹${(stats?.amount_saved / 100000).toFixed(1)}L`, sub: "from escalated orders", color: "#22c55e", icon: <Shield size={18} /> },
          { label: "Total Returns", value: stats?.total_returns, sub: `avg risk: ${stats?.avg_risk_score}`, color: "#3b82f6", icon: <TrendingUp size={18} /> },
        ].map((card, i) => (
          <div key={i} className="bg-[#111118] border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-[#8888aa] uppercase tracking-widest">{card.label}</span>
              <span style={{ color: card.color }}>{card.icon}</span>
            </div>
            <div className="text-3xl font-black tracking-tight" style={{ color: card.color }}>{card.value}</div>
            <div className="text-xs font-mono text-[#55556a] mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-[#111118] border border-white/10 rounded-xl p-5">
          <div className="text-sm font-bold mb-1">Returns Trend</div>
          <div className="text-xs font-mono text-[#55556a] mb-4">Flagged vs Total — Weekly</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trends}>
              <XAxis dataKey="week" tick={{ fill: "#55556a", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#55556a", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1a1a24", border: "1px solid #ffffff18", borderRadius: 8, fontSize: 11 }} />
              <Line type="monotone" dataKey="total_returns" stroke="#3b82f6" strokeWidth={2} dot={false} name="Total" />
              <Line type="monotone" dataKey="flagged" stroke="#ff3b3b" strokeWidth={2} dot={false} name="Flagged" />
              <Line type="monotone" dataKey="escalated" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Escalated" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#111118] border border-white/10 rounded-xl p-5">
          <div className="text-sm font-bold mb-1">Fraud by Category</div>
          <div className="text-xs font-mono text-[#55556a] mb-4">Fraud rate %</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={categories} layout="vertical">
              <XAxis type="number" tick={{ fill: "#55556a", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
              <YAxis dataKey="category" type="category" tick={{ fill: "#8888aa", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={70} />
              <Tooltip contentStyle={{ background: "#1a1a24", border: "1px solid #ffffff18", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="fraud_rate" fill="#ff3b3b" radius={[0, 4, 4, 0]} name="Fraud Rate %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <OrderTable data={orders.slice(0, 10)} />
    </div>
  );

  const QueuePage = () => (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-black">Fraud Alert Queue</h2>
        <p className="text-xs font-mono text-[#8888aa] mt-1">All flagged orders · click to investigate · 🔒 locked once decision is made</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pending Review", value: orders.filter(o => o.status === "Pending Review").length, color: "#f59e0b" },
          { label: "Escalated", value: orders.filter(o => o.status === "Escalated").length, color: "#ff3b3b" },
          { label: "Cleared", value: orders.filter(o => o.status === "Cleared").length, color: "#22c55e" },
        ].map((s, i) => (
          <div key={i} className="bg-[#111118] border border-white/10 rounded-xl p-4 flex items-center justify-between">
            <span className="text-xs font-mono text-[#8888aa] uppercase tracking-widest">{s.label}</span>
            <span className="text-2xl font-black" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>
      <OrderTable data={orders} showFilters={true} />
    </div>
  );

  const TrendsPage = () => (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-black">Fraud Trends</h2>
        <p className="text-xs font-mono text-[#8888aa] mt-1">Weekly analysis of return fraud patterns</p>
      </div>
      <div className="bg-[#111118] border border-white/10 rounded-xl p-6">
        <div className="text-sm font-bold mb-1">Weekly Returns Overview</div>
        <div className="text-xs font-mono text-[#55556a] mb-6">Total · Flagged · Escalated · Cleared</div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trends}>
            <XAxis dataKey="week" tick={{ fill: "#55556a", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#55556a", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#1a1a24", border: "1px solid #ffffff18", borderRadius: 8, fontSize: 11 }} />
            <Line type="monotone" dataKey="total_returns" stroke="#3b82f6" strokeWidth={2} dot={false} name="Total Returns" />
            <Line type="monotone" dataKey="flagged" stroke="#ff3b3b" strokeWidth={2} dot={false} name="Flagged" />
            <Line type="monotone" dataKey="escalated" stroke="#22c55e" strokeWidth={2} dot={false} name="Escalated" />
            <Line type="monotone" dataKey="cleared" stroke="#8888aa" strokeWidth={1.5} dot={false} name="Cleared" strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-[#111118] border border-white/10 rounded-xl p-6">
        <div className="text-sm font-bold mb-1">Amount Saved Over Time</div>
        <div className="text-xs font-mono text-[#55556a] mb-6">Refunds blocked by week (₹)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={trends}>
            <XAxis dataKey="week" tick={{ fill: "#55556a", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#55556a", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#1a1a24", border: "1px solid #ffffff18", borderRadius: 8, fontSize: 11 }} formatter={(v: any) => `₹${Number(v).toLocaleString("en-IN")}`} />
            <Bar dataKey="amount_saved" fill="#22c55e" radius={[4, 4, 0, 0]} name="Amount Saved" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-[#111118] border border-white/10 rounded-xl p-6">
        <div className="text-sm font-bold mb-1">Fraud by City</div>
        <div className="text-xs font-mono text-[#55556a] mb-6">Fraud rate % across locations</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={cities}>
            <XAxis dataKey="city" tick={{ fill: "#55556a", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#55556a", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#1a1a24", border: "1px solid #ffffff18", borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="fraud_rate" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Fraud Rate %" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const COLORS = ["#ff3b3b", "#f59e0b", "#3b82f6", "#22c55e", "#a855f7", "#ec4899"];

  const CategoriesPage = () => (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-black">Fraud by Category</h2>
        <p className="text-xs font-mono text-[#8888aa] mt-1">Breakdown of fraud patterns across product categories</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {categories.map((cat, i) => (
          <div key={cat.category} className="bg-[#111118] border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold">{cat.category}</span>
              <span className="text-xs font-mono px-2 py-1 rounded-full" style={{ background: COLORS[i % COLORS.length] + "20", color: COLORS[i % COLORS.length] }}>
                {cat.fraud_rate}%
              </span>
            </div>
            <div className="flex gap-4 text-xs font-mono text-[#8888aa]">
              <span>Total: <span className="text-white font-bold">{cat.total}</span></span>
              <span>Flagged: <span className="text-[#ff3b3b] font-bold">{cat.flagged}</span></span>
              <span>Saved: <span className="text-[#22c55e] font-bold">{cat.escalated}</span></span>
            </div>
            <div className="mt-3 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(cat.fraud_rate * 3, 100)}%`, background: COLORS[i % COLORS.length] }} />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#111118] border border-white/10 rounded-xl p-6">
          <div className="text-sm font-bold mb-1">Fraud Distribution</div>
          <div className="text-xs font-mono text-[#55556a] mb-4">Share of flagged orders by category</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={categories} dataKey="flagged" nameKey="category" cx="50%" cy="50%" outerRadius={80}
                label={({ category, percent }: any) => `${category} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#1a1a24", border: "1px solid #ffffff18", borderRadius: 8, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[#111118] border border-white/10 rounded-xl p-6">
          <div className="text-sm font-bold mb-1">Total Value at Risk by Category</div>
          <div className="text-xs font-mono text-[#55556a] mb-4">Sum of flagged order values (₹)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categories}>
              <XAxis dataKey="category" tick={{ fill: "#55556a", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#55556a", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1a1a24", border: "1px solid #ffffff18", borderRadius: 8, fontSize: 11 }} formatter={(v: any) => `₹${Number(v).toLocaleString("en-IN")}`} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total Value" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 text-sm font-bold">Category Summary Table</div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              {["Category", "Total", "Flagged", "Fraud Rate", "Escalated", "Cleared", "Total Value"].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-mono text-[#55556a] uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, i) => (
              <tr key={cat.category} className="border-b border-white/5 hover:bg-white/5 transition-all">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-sm font-semibold">{cat.category}</span>
                  </div>
                </td>
                <td className="px-5 py-4 font-mono text-sm">{cat.total}</td>
                <td className="px-5 py-4 font-mono text-sm text-[#ff3b3b]">{cat.flagged}</td>
                <td className="px-5 py-4">
                  <span className="font-mono text-sm px-2 py-1 rounded-full" style={{ background: COLORS[i % COLORS.length] + "20", color: COLORS[i % COLORS.length] }}>
                    {cat.fraud_rate}%
                  </span>
                </td>
                <td className="px-5 py-4 font-mono text-sm text-[#22c55e]">{cat.escalated}</td>
                <td className="px-5 py-4 font-mono text-sm text-[#8888aa]">{cat.cleared}</td>
                <td className="px-5 py-4 font-mono text-sm text-[#f59e0b]">₹{cat.value?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── MAIN RENDER ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">

      {/* TOPBAR */}
      <div className="border-b border-white/10 bg-[#111118] px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black tracking-tight">Fraud<span className="text-[#ff3b3b]">Lens</span></h1>
          <p className="text-xs text-[#8888aa] font-mono mt-0.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />
            LIVE · {refreshing ? "Refreshing..." : "Returns Fraud Intelligence · auto-refresh 10s"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2">
            <Search size={14} className="text-[#8888aa]" />
            <input type="text" placeholder="Search order, customer..."
              value={search} onChange={e => handleSearch(e.target.value)}
              className="bg-transparent text-sm text-white outline-none placeholder:text-[#55556a] w-52 font-mono" />
          </div>
          <button onClick={loadData} className="p-2 bg-[#1a1a24] border border-white/10 rounded-lg text-[#8888aa] hover:text-white transition-all">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="flex">
        {/* SIDEBAR */}
        <aside className="w-52 min-h-screen bg-[#111118] border-r border-white/10 p-5 flex flex-col gap-6 sticky top-[61px] h-[calc(100vh-61px)]">
          <nav className="flex flex-col gap-1">
            {[
              { icon: <Shield size={15} />, label: "Dashboard", key: "dashboard" },
              { icon: <AlertTriangle size={15} />, label: "Fraud Queue", key: "queue" },
              { icon: <TrendingUp size={15} />, label: "Trends", key: "trends" },
              { icon: <DollarSign size={15} />, label: "By Category", key: "categories" },
            ].map(item => (
              <div key={item.key} onClick={() => setPage(item.key as Page)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer text-sm font-semibold transition-all ${page === item.key ? "bg-red-500/15 text-[#ff3b3b]" : "text-[#8888aa] hover:bg-white/5 hover:text-white"}`}>
                {item.icon} {item.label}
              </div>
            ))}
          </nav>
          <div className="mt-auto bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <div className="text-xs font-mono text-[#ff3b3b] mb-1">🔴 LIVE ALERTS</div>
            <div className="text-3xl font-black text-[#ff3b3b]">{stats?.pending_review}</div>
            <div className="text-xs text-[#8888aa] mt-0.5">pending review</div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 p-8 overflow-y-auto">
          {page === "dashboard" && <DashboardPage />}
          {page === "queue" && <QueuePage />}
          {page === "trends" && <TrendsPage />}
          {page === "categories" && <CategoriesPage />}
        </main>
      </div>

      {/* MODAL */}
      {modalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}>
          <div className="bg-[#111118] border border-white/20 rounded-2xl w-[560px] max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            {/* Modal Header */}
            <div className="flex items-start justify-between p-6 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-base font-black">{selectedOrder.order_id}</div>
                  {selectedOrder.is_locked && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded-full text-xs font-mono text-[#8888aa]">
                      <Lock size={10} /> LOCKED
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-[#8888aa] mt-1">
                  {selectedOrder.customer_name} · {selectedOrder.customer_id} · {selectedOrder.city}
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-[#8888aa] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Order Value", value: `₹${selectedOrder.order_value?.toLocaleString("en-IN")}`, color: "#f59e0b" },
                  { label: "Category", value: selectedOrder.category, color: "white" },
                  { label: "Return Gap", value: `${selectedOrder.return_day_gap} day(s)`, color: "white" },
                  { label: "Return Count", value: `${selectedOrder.return_count} returns`, color: selectedOrder.return_count >= 6 ? "#ff3b3b" : "white" },
                  { label: "Fingerprint", value: selectedOrder.fingerprint_match ? "✅ Match" : "❌ Mismatch", color: selectedOrder.fingerprint_match ? "#22c55e" : "#ff3b3b" },
                  { label: "Status", value: selectedOrder.status, color: "#8888aa" },
                ].map((item, i) => (
                  <div key={i} className="bg-[#1a1a24] rounded-lg p-3">
                    <div className="text-xs font-mono text-[#55556a] uppercase tracking-widest mb-1">{item.label}</div>
                    <div className="text-sm font-bold" style={{ color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Risk Stars */}
              <div className="bg-[#1a1a24] rounded-lg p-3">
                <div className="text-xs font-mono text-[#55556a] uppercase tracking-widest mb-2">Risk Level</div>
                <div className="flex items-center gap-3">
                  <StarRating score={selectedOrder.risk_score} />
                  <span className="font-mono text-sm font-bold" style={{ color: riskColor(selectedOrder.risk_score) }}>
                    {selectedOrder.risk_score}/100 — {selectedOrder.risk_score >= 85 ? "HIGH RISK" : selectedOrder.risk_score >= 70 ? "MEDIUM RISK" : "LOW RISK"}
                  </span>
                </div>
              </div>

              {/* Fingerprint mismatch */}
              {!selectedOrder.fingerprint_match && selectedOrder.fingerprint_mismatch_reason && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <div className="text-xs font-mono text-[#ff3b3b] mb-1">🔍 FINGERPRINT MISMATCH</div>
                  <div className="text-xs font-mono text-[#8888aa]">{selectedOrder.fingerprint_mismatch_reason}</div>
                </div>
              )}

              {/* Reason mismatch */}
              {selectedOrder.reason_category_mismatch && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <div className="text-xs font-mono text-[#f59e0b] mb-1">⚠️ REASON-CATEGORY MISMATCH</div>
                  <div className="text-xs font-mono text-[#8888aa]">'{selectedOrder.return_reason}' is not valid for '{selectedOrder.category}'</div>
                </div>
              )}

              {/* Photo verification */}
              {selectedOrder.photo_verification_required && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <div className="text-xs font-mono text-blue-400 mb-1">📸 PHOTO VERIFICATION REQUIRED</div>
                  <div className="text-xs font-mono text-[#8888aa]">Wardrobing detected — delivery agent must verify tag is attached on pickup</div>
                </div>
              )}

              {/* AI Summary */}
              <div className="bg-[#1a1a24] border-l-4 border-[#ff3b3b] rounded-lg p-4">
                <div className="text-xs font-mono text-[#ff3b3b] uppercase tracking-widest mb-3">⚡ AI Fraud Intelligence</div>
                <pre className="text-xs font-mono text-[#8888aa] whitespace-pre-wrap leading-relaxed">{fraudSummary}</pre>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2 p-6 pt-0">
              {selectedOrder.is_locked ? (
                <div className="flex items-center gap-2 text-xs font-mono text-[#55556a] px-3 py-2 bg-white/5 rounded-lg border border-white/10 w-full justify-center">
                  <Lock size={12} /> Decision is final and locked — cannot be modified
                </div>
              ) : (
                <>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleStatusUpdate("Escalated")}
                    className="px-4 py-2 bg-red-500/20 text-[#ff3b3b] border border-red-500/30 rounded-lg text-xs font-bold hover:bg-[#ff3b3b] hover:text-white transition-all disabled:opacity-50">
                    {actionLoading ? "..." : "🔴 Escalate"}
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleStatusUpdate("Cleared")}
                    className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-bold hover:bg-green-500 hover:text-white transition-all disabled:opacity-50">
                    {actionLoading ? "..." : "✓ Clear"}
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleStatusUpdate("Pending Review")}
                    className="px-4 py-2 bg-white/5 text-[#8888aa] border border-white/10 rounded-lg text-xs font-bold hover:text-white transition-all disabled:opacity-50">
                    {actionLoading ? "..." : "⏳ Hold"}
                  </button>
                </>
              )}
              <button onClick={() => setModalOpen(false)}
                className="ml-auto px-4 py-2 bg-white/5 text-[#8888aa] border border-white/10 rounded-lg text-xs font-bold hover:text-white transition-all">
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}