import { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./Expenses.css";

interface Expense {
  id: string;
  category: string;
  amount: number;
  taxAmount: number;
  note?: string;
  sourceImageUrl?: string;
  aiCategoryConfidence?: number;
  createdAt: string;
}

interface CategorizeResult {
  category: string;
  reasoning: string;
  confidence: number;
}

export function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [receiptText, setReceiptText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [categorizing, setCategorizing] = useState(false);
  const [lastResult, setLastResult] = useState<CategorizeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [period, setPeriod] = useState("current");
  const [manual, setManual] = useState({ category: "Rent", amount: "", taxAmount: "", note: "" });
  const expenseCategories = ["Salaries", "Rent", "Electricity", "Water", "Internet", "Telephone", "Transport", "Fuel", "Office supplies", "Repairs", "Maintenance", "Bank charges", "Loan interest", "Advertising", "Insurance", "Taxes", "Software subscriptions", "Miscellaneous"];

  function refresh() {
    api("/expenses")
      .then(setExpenses)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function addManualExpense() {
    const amount = Number(manual.amount);
    const taxAmount = Number(manual.taxAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(taxAmount) || taxAmount < 0) return;
    await api("/expenses", { method: "POST", body: JSON.stringify({ category: manual.category, amount, taxAmount, note: manual.note || undefined }) });
    setManual({ category: "Rent", amount: "", taxAmount: "", note: "" });
    refresh();
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  async function categorize() {
    if (!receiptText.trim() && !imageFile) {
      alert("Please enter receipt text or upload an image");
      return;
    }
    if (!receiptText.trim() && imageFile) {
      alert("Image OCR is not enabled yet. Please paste the receipt text before categorizing.");
      return;
    }

    setCategorizing(true);
    setLastResult(null);
    try {
      const textToProcess = receiptText.trim();

      const res = await api<any>("/ai/categorize-expense", {
        method: "POST",
        body: JSON.stringify({
          rawText: textToProcess,
          imageUrl: undefined,
        }),
      });

      setLastResult({
        category: res.expense.category,
        reasoning: res.aiReasoning,
        confidence: res.expense.aiCategoryConfidence || 0.8,
      });

      setReceiptText("");
      setImageFile(null);
      setImagePreview(null);
      refresh();
    } catch (error) {
      console.error("Error categorizing expense:", error);
      const message = error instanceof Error ? error.message : "AI categorization failed. Enter the expense manually and try again.";
      alert(message);
    } finally {
      setCategorizing(false);
    }
  }

  const now = new Date();
  const periodExpenses = expenses.filter((expense) => {
    if (period === "all") return true;
    const date = new Date(expense.createdAt);
    if (period === "current") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === period;
  });
  const filteredExpenses = filter === "all" ? periodExpenses : periodExpenses.filter((e) => e.category === filter);

  const categories = [...new Set(expenses.map((e) => e.category))].sort();
  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalTax = filteredExpenses.reduce((sum, e) => sum + e.taxAmount, 0);

  if (loading) {
    return <div className="expenses-loading">Loading expenses...</div>;
  }

  return (
    <div className="expenses-page">
      <h1>Expenses</h1>
      <p className="page-subtitle">Manage and categorize business expenses</p>

      <div className="categorize-section">
        <div className="categorize-header"><h2>Manual expense entry</h2><p>Record salaries, rent, bills, and any other business cost.</p></div>
        <div className="form-row">
          <div className="form-group"><label>Category</label><select value={manual.category} onChange={(e) => setManual({ ...manual, category: e.target.value })}>{expenseCategories.map((category) => <option key={category}>{category}</option>)}</select></div>
          <div className="form-group"><label>Amount *</label><input type="number" min="0.01" placeholder="e.g. 25000" value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} /></div>
          <div className="form-group"><label>GST/tax</label><input type="number" min="0" placeholder="0" value={manual.taxAmount} onChange={(e) => setManual({ ...manual, taxAmount: e.target.value })} /></div>
          <div className="form-group"><label>Note</label><input placeholder="Optional note" value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} /></div>
        </div>
        <button className="btn-primary" onClick={addManualExpense} disabled={!manual.amount}>Add expense</button>
      </div>

      {/* AI Categorization Section */}
      <div className="categorize-section">
        <div className="categorize-header">
          <h2>📸 Quick Expense Entry</h2>
          <p>Paste receipt text or upload an image for AI-powered categorization</p>
        </div>

        <div className="categorize-form">
          <div className="form-row">
            <div className="form-group">
              <label>Receipt Text *</label>
              <textarea
                value={receiptText}
                onChange={(e) => setReceiptText(e.target.value)}
                rows={4}
                placeholder="e.g. Sharma Electricals — Bill No 4521 — Total Rs. 2,360 (incl GST Rs. 360)…"
                disabled={categorizing}
              />
              <small>Paste OCR'd receipt text, bill details, or invoice information</small>
            </div>
            {imagePreview && (
              <div className="form-group">
                <label>Receipt Image</label>
                <img src={imagePreview} alt="Receipt" className="receipt-preview" />
              </div>
            )}
            {!imagePreview && (
              <div className="form-group">
                <label>Or Upload Receipt Image (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={categorizing}
                />
                <small>JPG, PNG, or PDF scans of receipts/bills</small>
              </div>
            )}
          </div>

          <button
            className="btn-primary"
            onClick={categorize}
            disabled={categorizing || (!receiptText && !imageFile)}
          >
            {categorizing ? "🤖 Analyzing..." : "✨ Categorize with AI"}
          </button>

          {lastResult && (
            <div className="result-box">
              <div className="result-header">
                <h3>✓ Expense Categorized</h3>
                <span className="confidence-badge">
                  {(lastResult.confidence * 100).toFixed(0)}% confident
                </span>
              </div>
              <div className="result-content">
                <div className="result-field">
                  <strong>Category:</strong>
                  <span className="category-tag">{lastResult.category}</span>
                </div>
                <div className="result-field">
                  <strong>Reasoning:</strong>
                  <p>{lastResult.reasoning}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Expenses List Section */}
      <div className="expenses-list-section">
        <div className="section-header">
          <h2>Expense History</h2>
          <div className="section-stats">
            <div className="stat">
              <span className="stat-label">Total</span>
              <span className="stat-value">₹{totalAmount.toLocaleString("en-IN")}</span>
            </div>
            <div className="stat">
              <span className="stat-label">GST</span>
              <span className="stat-value">₹{totalTax.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        <div className="filters">
          <label>Period<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="current">Current month</option><option value="all">All months</option>{[...new Set(expenses.map((expense) => expense.createdAt.slice(0, 7)))].sort().reverse().map((month) => <option key={month} value={month}>{month}</option>)}</select></label>
          <button
            className={`filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({expenses.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`filter-btn ${filter === cat ? "active" : ""}`}
              onClick={() => setFilter(cat)}
            >
              {cat} ({expenses.filter((e) => e.category === cat).length})
            </button>
          ))}
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="empty-state">
            <p>No expenses yet. Start by entering a receipt above!</p>
          </div>
        ) : (
          <table className="expenses-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
                <th>GST/Tax</th>
                <th>Confidence</th>
                <th>Note</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <span className="category-badge">{expense.category}</span>
                  </td>
                  <td className="numeral">₹{expense.amount.toLocaleString("en-IN")}</td>
                  <td className="numeral">₹{expense.taxAmount.toLocaleString("en-IN")}</td>
                  <td>
                    {expense.aiCategoryConfidence ? (
                      <span className="confidence-indicator">
                        {(expense.aiCategoryConfidence * 100).toFixed(0)}% 🤖
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="note">{expense.note || "—"}</td>
                  <td className="date">
                    {new Date(expense.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

