import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { BusinessProfile } from "./BusinessProfile";
import "./Dashboard.css";

interface DashboardSummary {
  totalSales: number;
  totalTaxCollected: number;
  outstanding: number;
  totalExpenses: number;
  totalReceivables: number;
  totalPayables: number;
  cashBalance: number;
  cashFlowTrend: { period: string; amount: number }[];
}

interface LowStockItem {
  id: string;
  name: string;
  currentStock: number;
  lowStockAlert: number;
}

interface Business {
  id: string;
  name: string;
  setupComplete: boolean;
  ownerName?: string;
  stateName?: string;
  businessType?: string;
}

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");

  const businessId = localStorage.getItem("businessId") || "";

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const [summaryData, itemsData, businessData] = await Promise.all([
          api(`/reports/summary${periodQuery(period)}`).catch(() => ({})),
          api("/items/low-stock").catch(() => []),
          api(`/business/${businessId}`).catch(() => null),
        ]);

        setSummary(summaryData);
        setLowStock(itemsData);
        setBusiness(businessData);

        // Show profile modal if setup not complete
        if (businessData && !businessData.setupComplete) {
          setShowProfileModal(true);
        }
      } catch (error) {
        console.error("Error loading dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    if (businessId) {
      loadDashboard();
    }
  }, [businessId, period]);

  const handleProfileComplete = () => {
    setShowProfileModal(false);
    // Refresh dashboard
    window.location.reload();
  };

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  return (
    <>
      {showProfileModal && business && (
        <div className="modal-overlay">
          <div className="modal-content modal-large">
            <button className="modal-close" onClick={() => setShowProfileModal(false)}>
              ✕
            </button>
            <h2>Complete Your Business Profile</h2>
            <p className="setup-hint">
              Set up your business details to unlock full features including GST filing, invoicing, and reporting.
            </p>
            <BusinessProfile businessId={businessId} onComplete={handleProfileComplete} />
          </div>
        </div>
      )}

      <div className="dashboard-page">
        <h1>Dashboard</h1>
        <p className="dashboard-subtitle">
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
        <div className="dashboard-periods" aria-label="Dashboard period">
          {[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['quarter', 'This quarter'], ['year', 'This year']].map(([value, label]) => (
            <button key={value} className={period === value ? "gold" : "secondary"} onClick={() => setPeriod(value)}>{label}</button>
          ))}
        </div>

        {/* Top KPI Cards */}
        <div className="kpi-section">
          <h2>Today's Overview</h2>
          <div className="kpi-grid">
            <KPICard
              label="Total Sales"
              value={summary?.totalSales}
              color="teal"
              icon="📊"
            />
            <KPICard
              label="GST Collected"
              value={summary?.totalTaxCollected}
              color="blue"
              icon="📋"
            />
            <KPICard
              label="Receivables"
              value={summary?.totalReceivables}
              color="orange"
              icon="💳"
              trend={summary?.totalReceivables ? "up" : undefined}
            />
            <KPICard
              label="Expenses"
              value={summary?.totalExpenses}
              color="red"
              icon="💰"
            />
            <KPICard
              label="Payables"
              value={summary?.totalPayables}
              color="purple"
              icon="📤"
            />
            <KPICard
              label="Cash Balance"
              value={summary?.cashBalance}
              color="green"
              icon="💵"
              highlight
            />
          </div>
        </div>

        {/* Cash Flow Trend */}
        {summary?.cashFlowTrend && summary.cashFlowTrend.length > 0 && (
          <div className="cash-flow-section">
            <h2>7-Day Cash Flow Trend</h2>
            <div className="cash-flow-chart">
              {summary.cashFlowTrend.map((item) => (
                <div
                  key={item.period}
                  className="flow-bar"
                  style={{
                    height: `${Math.max(20, Math.min(100, (Math.abs(item.amount) / 10000) * 100))}%`,
                    backgroundColor: item.amount >= 0 ? "#84fab0" : "#fa709a",
                  }}
                  title={`${item.period}: ₹${item.amount.toLocaleString("en-IN")}`}
                >
                  <span className="flow-label">{item.period}</span>
                  <span className="flow-value">
                    ₹{(item.amount / 1000).toFixed(0)}k
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outstanding Section */}
        {summary?.outstanding ? (
          <div className="outstanding-section">
            <h2>Outstanding Invoices</h2>
            <div className="outstanding-card">
              <div className="outstanding-value">
                ₹{summary.outstanding.toLocaleString("en-IN")}
              </div>
              <p>Amount awaiting from customers</p>
            </div>
          </div>
        ) : null}

        {/* Low Stock Section */}
        <section className="low-stock-section">
          <h2>Reorder Soon</h2>
          {lowStock.length === 0 ? (
            <p className="empty-message">Nothing below its reorder line yet.</p>
          ) : (
            <table className="low-stock-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Current Stock</th>
                  <th>Alert Threshold</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((item) => (
                  <tr key={item.id}>
                    <td className="item-name">{item.name}</td>
                    <td className="numeral">{item.currentStock}</td>
                    <td className="numeral threshold">{item.lowStockAlert}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

function periodQuery(period: string) {
  const now = new Date();
  const from = new Date(now);
  if (period === "today") from.setHours(0, 0, 0, 0);
  else if (period === "week") from.setDate(now.getDate() - 6);
  else if (period === "month") from.setDate(1);
  else if (period === "quarter") from.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
  else if (period === "year") from.setMonth(3, 1);
  if (period === "year" && now.getMonth() < 3) from.setFullYear(now.getFullYear() - 1);
  return `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(new Date(now.getTime() + 86400000).toISOString())}`;
}

interface KPICardProps {
  label: string;
  value?: number;
  color: string;
  icon?: string;
  trend?: "up" | "down";
  highlight?: boolean;
}

function KPICard({ label, value, color, icon, trend, highlight }: KPICardProps) {
  const colorMap: Record<string, string> = {
    teal: "#1abc9c",
    blue: "#3498db",
    orange: "#f39c12",
    red: "#e74c3c",
    purple: "#9b59b6",
    green: "#2ecc71",
  };

  return (
    <div className={`kpi-card ${highlight ? "highlight" : ""}`}>
      <div className="kpi-header">
        <div className="kpi-icon" style={{ backgroundColor: colorMap[color] }}>
          {icon}
        </div>
        {trend && <span className={`trend ${trend}`}>↑</span>}
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: colorMap[color] }}>
        {value !== undefined ? `₹${value.toLocaleString("en-IN")}` : "—"}
      </div>
    </div>
  );
}

