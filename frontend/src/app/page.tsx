"use client";

import { useEffect, useState } from "react";
import { getStats, getOrders, getFraudSummary, updateOrderStatus, getTrends, getCategories } from "../../lib/api";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Search, AlertTriangle, TrendingUp, Shield, DollarSign, ChevronRight, X } from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [fraudSummary, setFraudSummary] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [s, o, t, c] = await Promise.all([
      getStats(),
      getOrders({ flagged_only: true, limit: 50 }),
      getTrends(),
      getCategories(),
    ]);
    setStats(s);
    setOrders(o);
    setTrends(t);
    setCategories(c);
    setLoading(false);
  }

  async function handleSearch(val: string) {
    setSearch(val);
    const o = await getOrders({ flagged_only: true, search: val, limit: 50 });
    setOrders(o);
  }

  async function handleFilter(f: string) {
    setFilter(f);
    const params: any = { flagged_only: true, limit: 50 };
    if (f === "high") params.min_score = 85;
    else if (f === "medium") { params.min_score = 70; }
    else if (f !== "all") params.category = f;
    const o = await getOrders(params);
    setOrders(o);
  }

  async function openModal(order: any) {
    setSelectedOrder(order);
    setModalOpen(true);
    setFraudSummary("Loading analysis...");
    const data = await getFraudSummary(order.order_id);
    setFraudSummary(data.summary);
  }

  async function handleStatusUpdate(status: string) {
    if (!selectedOrder) return;
    await updateOrderStatus(selectedOrder.order_id, status);
    setModalOpen(false);
    loadData();
  }

  function riskColor(score: number) {
    if (score >= 85) return "#ff3b3b";
    if (score >= 70) return "#f59e0b";
    return "#22c55e";
  }

  function statusColor(status: string) {
    const map: any = {
      "Flagged": "bg-red-500/20 text-red-400",
      "Escalated": "bg-red-500/20 text-red-400",
      "Pending Review": "bg-amber-500/20 text-amber-400",
      "Cleared": "bg-green-500/20 text-green-400",
    };
    return map[status] || "bg-blue-500/20 text-blue-400";
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-center">
        <div className="text-[#ff3b3b] text-4xl font-black mb-4">FraudLens</div>
        <div className="text-[#8888aa] font-mono text-sm">Loading intelligence...</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">

      {/* TOPBAR */}
      <div className="border-b border-white/10 bg-[#111118] px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight">
            Fraud<span className="text-[#ff3b3b]">Lens</span>
          </h1>
          <p className="text-xs text-[#8888aa] font-mono mt-0.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse"></span>
            LIVE · Returns Fraud Intelligence
          </p>
        </div>
        <div className="flex items-center gap-3 bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2">
          <Search size={14} className="text-[#8888aa]" />
          <input
            type="text"
            placeholder="Search order, customer..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="bg-transparent text-sm text-white outline-none placeholder:text-[#55556a] w-52 font-mono"
          />
        </div>
      </div>

      <div className="flex">

        {/* SIDEBAR */}
        <aside className="w-52 min-h-screen bg-[#111118] border-r border-white/10 p-5 flex flex-col gap-6">
          <nav className="flex flex-col gap-1">
            {[
              { icon: <Shield size={15} />, label: "Dashboard", active: true },
              { icon: <AlertTriangle size={15} />, label: "Fraud Queue" },
              { icon: <TrendingUp size={15} />, label: "Trends" },
              { icon: <DollarSign size={15} />, label: "By Category" },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer text-sm font-semibold transition-all ${item.active ? "bg-red-500/15 text-[#ff3b3b]" : "text-[#8888aa] hover:bg-white/5 hover:text-white"}`}>
                {item.icon} {item.label}
              </div>
            ))}
          </nav>

          {/* Alert count */}
          <div className="mt-auto bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <div className="text-xs font-mono text-[#ff3b3b] mb-1">🔴 LIVE ALERTS</div>
            <div className="text-3xl font-black text-[#ff3b3b]">{stats?.flagged_orders}</div>
            <div className="text-xs text-[#8888aa] mt-0.5">orders need review</div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 p-8 flex flex-col gap-6">

          {/* STAT CARDS */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Flagged Orders", value: stats?.flagged_orders, sub: `${stats?.fraud_rate}% fraud rate`, color: "#ff3b3b", icon: <AlertTriangle size={18} /> },
              { label: "Amount at Risk", value: `₹${(stats?.amount_at_risk / 100000).toFixed(1)}L`, sub: "across flagged orders", color: "#f59e0b", icon: <DollarSign size={18} /> },
              { label: "Amount Saved", value: `₹${(stats?.amount_saved / 100000).toFixed(1)}L`, sub: "refunds blocked", color: "#22c55e", icon: <Shield size={18} /> },
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

          {/* CHARTS */}
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

          {/* FRAUD TABLE */}
          <div className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="text-sm font-bold">🔍 Fraud Alert Queue</div>
              <div className="flex gap-2">
                {["all", "high", "medium", "Electronics", "Clothing"].map(f => (
                  <button key={f} onClick={() => handleFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all ${filter === f ? "bg-red-500/20 text-[#ff3b3b] border-red-500/30" : "border-white/10 text-[#8888aa] hover:text-white"}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {["Order ID", "Customer", "Category", "Reason", "Amount", "Risk Score", "Status", ""].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-mono text-[#55556a] uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order: any) => (
                  <tr key={order.order_id} onClick={() => openModal(order)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-all">
                    <td className="px-5 py-4 font-mono text-xs text-blue-400">{order.order_id}</td>
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
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${order.risk_score}%`, background: riskColor(order.risk_score) }}></div>
                        </div>
                        <span className="font-mono text-xs font-semibold" style={{ color: riskColor(order.risk_score) }}>{order.risk_score}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-mono ${statusColor(order.status)}`}>{order.status}</span>
                    </td>
                    <td className="px-5 py-4">
                      <ChevronRight size={14} className="text-[#55556a]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </main>
      </div>

      {/* MODAL */}
      {modalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setModalOpen(false)}>
          <div className="bg-[#111118] border border-white/20 rounded-2xl w-[540px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between p-6 border-b border-white/10">
              <div>
                <div className="text-base font-black">{selectedOrder.order_id} — Fraud Analysis</div>
                <div className="text-xs font-mono text-[#8888aa] mt-1">{selectedOrder.customer_name} · {selectedOrder.customer_id}</div>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-[#8888aa] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Order Value", value: `₹${selectedOrder.order_value?.toLocaleString("en-IN")}`, color: "#f59e0b" },
                  { label: "Risk Score", value: `${selectedOrder.risk_score}/100`, color: riskColor(selectedOrder.risk_score) },
                  { label: "Category", value: selectedOrder.category, color: "white" },
                  { label: "Return Gap", value: `${selectedOrder.return_day_gap} day(s)`, color: "white" },
                  { label: "Return Count", value: `${selectedOrder.return_count} returns`, color: selectedOrder.return_count >= 6 ? "#ff3b3b" : "white" },
                  { label: "Status", value: selectedOrder.status, color: "#8888aa" },
                ].map((item, i) => (
                  <div key={i} className="bg-[#1a1a24] rounded-lg p-3">
                    <div className="text-xs font-mono text-[#55556a] uppercase tracking-widest mb-1">{item.label}</div>
                    <div className="text-sm font-bold" style={{ color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="bg-[#1a1a24] border-l-4 border-[#ff3b3b] rounded-lg p-4">
                <div className="text-xs font-mono text-[#ff3b3b] uppercase tracking-widest mb-3">⚡ AI Fraud Intelligence</div>
                <pre className="text-xs font-mono text-[#8888aa] whitespace-pre-wrap leading-relaxed">{fraudSummary}</pre>
              </div>
            </div>

            <div className="flex gap-2 p-6 pt-0">
              <button onClick={() => handleStatusUpdate("Escalated")} className="px-4 py-2 bg-red-500/20 text-[#ff3b3b] border border-red-500/30 rounded-lg text-xs font-bold hover:bg-[#ff3b3b] hover:text-white transition-all">🔴 Escalate</button>
              <button onClick={() => handleStatusUpdate("Cleared")} className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-bold hover:bg-green-500 hover:text-white transition-all">✓ Clear</button>
              <button onClick={() => handleStatusUpdate("Pending Review")} className="px-4 py-2 bg-white/5 text-[#8888aa] border border-white/10 rounded-lg text-xs font-bold hover:text-white transition-all">⏳ Hold</button>
              <button onClick={() => setModalOpen(false)} className="ml-auto px-4 py-2 bg-white/5 text-[#8888aa] border border-white/10 rounded-lg text-xs font-bold hover:text-white transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}