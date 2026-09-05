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
  amount: number;
  taxAmount: number;
  vendor?: string | null;
  reasoning: string;
  confidence: number;
}

interface ExpensePreview extends CategorizeResult {
  id: string;
  fileName: string;
}

async function getExpenseRequestId(file: File | null, receiptText: string, lineIndex: number, expense: CategorizeResult) {
  const source = file ? await file.arrayBuffer() : new TextEncoder().encode(receiptText).buffer;
  const sourceDigest = await crypto.subtle.digest("SHA-256", source);
  const line = new TextEncoder().encode(`${lineIndex}|${expense.category}|${expense.amount}|${expense.taxAmount}|${expense.vendor || ""}`);
  const lineDigest = await crypto.subtle.digest("SHA-256", line);
  const sourceHash = Array.from(new Uint8Array(sourceDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const lineHash = Array.from(new Uint8Array(lineDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `receipt-${sourceHash}-${lineHash}`.slice(0, 120);
}

export function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [receiptText, setReceiptText] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [categorizing, setCategorizing] = useState(false);
  const [previews, setPreviews] = useState<ExpensePreview[]>([]);
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
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImageFiles(files);
    const firstImage = files.find((file) => file.type.startsWith("image/"));
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    if (firstImage) reader.readAsDataURL(firstImage);
    else setImagePreview(null);
  };

  async function categorize() {
    if (!receiptText.trim() && !imageFiles.length) {
      alert("Please enter receipt text or upload an image");
      return;
    }

    setCategorizing(true);
    try {
      const files = imageFiles.length ? [...new Map(imageFiles.map((file) => [file.name + file.size + file.lastModified, file])).values()] : [null];
      const nextPreviews: ExpensePreview[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("rawText", receiptText.trim());
        if (file) form.append("file", file);
        const res = await api<any>("/ai/categorize-expense", { method: "POST", body: form });
        const results: CategorizeResult[] = res.previews || (res.preview ? [res.preview] : []);
        if (!results.length) throw new Error("Vertex AI did not return any expenses from this document");
        for (const [lineIndex, result] of results.entries()) {
          const id = await getExpenseRequestId(file, receiptText.trim(), lineIndex, result);
          nextPreviews.push({ id, fileName: file?.name || "Pasted receipt", ...result });
        }
      }
      setPreviews((current) => [...current, ...nextPreviews]);
      setReceiptText("");
      setImageFiles([]);
      setImagePreview(null);
    } catch (error) {
      console.error("Error categorizing expense:", error);
      const message = error instanceof Error ? error.message : "AI categorization failed. Enter the expense manually and try again.";
      alert(message);
    } finally {
      setCategorizing(false);
    }
  }

  async function confirmExpenses() {
    if (!previews.length) return;
    setCategorizing(true);
    try {
      for (const preview of previews) {
        await api("/ai/categorize-expense/confirm", {
          method: "POST",
          body: JSON.stringify({
            clientRequestId: preview.id,
            category: preview.category,
            amount: preview.amount,
            taxAmount: preview.taxAmount,
            note: preview.vendor ? `From ${preview.vendor}` : undefined,
            aiCategoryConfidence: preview.confidence,
          }),
        });
      }
      setPreviews([]);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to save reviewed expenses");
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
          <h2>Quick Expense Entry</h2>
          <p>Paste receipt text or upload a PDF or image for AI-powered categorization</p>
        </div>

        <div className="categorize-form">
          <div className="form-row">
            <div className="form-group">
              <label>Receipt Text</label>
              <textarea
                value={receiptText}
                onChange={(e) => setReceiptText(e.target.value)}
                rows={4}
                placeholder="e.g. Sharma Electricals — Bill No 4521 — Total Rs. 2,360 (incl GST Rs. 360)…"
                disabled={categorizing}
              />
              <small>Optional when the uploaded PDF or image contains the receipt details.</small>
            </div>
            {imagePreview && (
              <div className="form-group">
                <label>Receipt Image</label>
                <img src={imagePreview} alt="Receipt" className="receipt-preview" />
              </div>
            )}
            <div className="form-group">
              <label>Upload Receipt PDF or Image</label>
              <input
                type="file"
                accept="image/*,.pdf,application/pdf"
                multiple
                onChange={handleImageUpload}
                disabled={categorizing}
              />
              <small>JPG, PNG, or PDF scans. Each selected receipt becomes one expense.</small>
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={categorize}
            disabled={categorizing || (!receiptText && !imageFiles.length)}
          >
            {categorizing ? "Analyzing..." : "Preview with AI"}
          </button>

          {previews.length > 0 && (
            <div className="result-box">
              <div className="result-header">
                <h3>Review {previews.length} expense{previews.length === 1 ? "" : "s"}</h3>
                <button className="btn-primary" onClick={confirmExpenses} disabled={categorizing}>Confirm expenses</button>
              </div>
              {previews.map((preview) => (
                <div className="result-content" key={preview.id}>
                  <div className="result-field"><strong>{preview.fileName}</strong><span className="category-tag">{preview.category}</span></div>
                  <div className="result-field"><strong>Amount:</strong><span>₹{preview.amount.toLocaleString("en-IN")} (GST ₹{preview.taxAmount.toLocaleString("en-IN")})</span></div>
                  <div className="result-field"><strong>Reasoning:</strong><p>{preview.reasoning}</p></div>
                </div>
              ))}
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

