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

  function refresh() {
    api("/expenses")
      .then(setExpenses)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

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
    if (!receiptText && !imageFile) {
      alert("Please enter receipt text or upload an image");
      return;
    }

    setCategorizing(true);
    setLastResult(null);
    try {
      let textToProcess = receiptText;

      // If image is uploaded, we would normally use OCR here
      // For now, we'll just use the text. In production, integrate with Tesseract or Google Vision API
      if (imageFile && !receiptText) {
        textToProcess = "[Image uploaded - please add receipt text or implement OCR]";
      }

      const res = await api<any>("/ai/categorize-expense", {
        method: "POST",
        body: JSON.stringify({
          rawText: textToProcess,
          imageUrl: imagePreview || undefined,
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
      alert("Failed to categorize expense");
    } finally {
      setCategorizing(false);
    }
  }

  const filteredExpenses =
    filter === "all" ? expenses : expenses.filter((e) => e.category === filter);

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

