import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./CreditDebitNotes.css";

interface CreditNote {
  id: string;
  number: string;
  customerId?: string;
  customer?: { name: string };
  invoiceId?: string;
  invoice?: { number: string };
  reason: string;
  amount: number;
  taxAmount: number;
  createdAt: string;
}

interface DebitNote {
  id: string;
  number: string;
  supplierId?: string;
  supplier?: { name: string };
  reason: string;
  amount: number;
  taxAmount: number;
  createdAt: string;
}

type Tab = "credit" | "debit";

export const CreditDebitNotes: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [tab, setTab] = useState<Tab>("credit");
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [debitNotes, setDebitNotes] = useState<DebitNote[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formType, setFormType] = useState<"credit" | "debit">("credit");
  const [formData, setFormData] = useState({
    number: "",
    customerId: "",
    supplierId: "",
    reason: "",
    amount: 0,
    taxAmount: 0,
  });

  const fetchCreditNotes = async () => {
    try {
      const response = await api("/notes/credit-notes");
      setCreditNotes(response.creditNotes);
    } catch (error) {
      console.error("Error fetching credit notes:", error);
    }
  };

  const fetchDebitNotes = async () => {
    try {
      const response = await api("/notes/debit-notes");
      setDebitNotes(response.debitNotes);
    } catch (error) {
      console.error("Error fetching debit notes:", error);
    }
  };

  useEffect(() => {
    Promise.all([fetchCreditNotes(), fetchDebitNotes()]).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!formData.number || formData.amount <= 0) {
      alert("Please fill all required fields");
      return;
    }

    try {
      if (formType === "credit") {
        await api("/notes/credit-notes", {
          method: "POST",
          body: JSON.stringify({
            number: formData.number,
            customerId: formData.customerId || undefined,
            reason: formData.reason,
            amount: formData.amount,
            taxAmount: formData.taxAmount,
          }),
        });
      } else {
        await api("/notes/debit-notes", {
          method: "POST",
          body: JSON.stringify({
            number: formData.number,
            supplierId: formData.supplierId || undefined,
            reason: formData.reason,
            amount: formData.amount,
            taxAmount: formData.taxAmount,
          }),
        });
      }

      setShowForm(false);
      setFormData({ number: "", customerId: "", supplierId: "", reason: "", amount: 0, taxAmount: 0 });
      if (formType === "credit") {
        await fetchCreditNotes();
      } else {
        await fetchDebitNotes();
      }
      alert(`${formType === "credit" ? "Credit" : "Debit"} note created`);
    } catch (error) {
      console.error("Error saving note:", error);
      alert("Failed to save note");
    }
  };

  const handleDelete = async (id: string, type: "credit" | "debit") => {
    if (confirm("Delete this note?")) {
      try {
        const endpoint = type === "credit" ? `/notes/credit-notes/${id}` : `/notes/debit-notes/${id}`;
        await api(endpoint, { method: "DELETE" });
        if (type === "credit") {
          await fetchCreditNotes();
        } else {
          await fetchDebitNotes();
        }
        alert("Note deleted");
      } catch (error) {
        console.error("Error deleting note:", error);
      }
    }
  };

  if (loading) {
    return <div className="notes-page">Loading...</div>;
  }

  return (
    <div className="notes-page">
      <div className="notes-header">
        <h2>Credit & Debit Notes</h2>
        <button
          className="btn-primary"
          onClick={() => {
            setShowForm(true);
            setFormType(tab === "credit" ? "credit" : "debit");
          }}
        >
          + Add Note
        </button>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === "credit" ? "active" : ""}`}
          onClick={() => setTab("credit")}
        >
          Credit Notes
        </button>
        <button
          className={`tab ${tab === "debit" ? "active" : ""}`}
          onClick={() => setTab("debit")}
        >
          Debit Notes
        </button>
      </div>

      {tab === "credit" ? (
        <div className="notes-content">
          <h3>Credit Notes (Customer Returns)</h3>
          {creditNotes.length === 0 ? (
            <p className="empty-state">No credit notes yet</p>
          ) : (
            <table className="notes-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Customer</th>
                  <th>Invoice</th>
                  <th>Reason</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {creditNotes.map((note) => (
                  <tr key={note.id}>
                    <td className="number">{note.number}</td>
                    <td>{note.customer?.name || "—"}</td>
                    <td>{note.invoice?.number || "—"}</td>
                    <td>{note.reason}</td>
                    <td className="amount">₹{note.amount.toFixed(2)}</td>
                    <td>{new Date(note.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn-delete-sm"
                        onClick={() => handleDelete(note.id, "credit")}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="notes-content">
          <h3>Debit Notes (Supplier Returns)</h3>
          {debitNotes.length === 0 ? (
            <p className="empty-state">No debit notes yet</p>
          ) : (
            <table className="notes-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Supplier</th>
                  <th>Reason</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {debitNotes.map((note) => (
                  <tr key={note.id}>
                    <td className="number">{note.number}</td>
                    <td>{note.supplier?.name || "—"}</td>
                    <td>{note.reason}</td>
                    <td className="amount">₹{note.amount.toFixed(2)}</td>
                    <td>{new Date(note.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn-delete-sm"
                        onClick={() => handleDelete(note.id, "debit")}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{formType === "credit" ? "Create Credit Note" : "Create Debit Note"}</h3>

            <div className="form-group">
              <label>Note Number *</label>
              <input
                type="text"
                value={formData.number}
                onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                placeholder={formType === "credit" ? "CN-001" : "DN-001"}
              />
            </div>

            {formType === "credit" && (
              <div className="form-group">
                <label>Customer (Optional)</label>
                <input
                  type="text"
                  placeholder="Customer name or ID"
                  value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                />
              </div>
            )}

            {formType === "debit" && (
              <div className="form-group">
                <label>Supplier (Optional)</label>
                <input
                  type="text"
                  placeholder="Supplier name or ID"
                  value={formData.supplierId}
                  onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                />
              </div>
            )}

            <div className="form-group">
              <label>Reason *</label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Why is this note being created?"
                rows={3}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Amount *</label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Tax Amount</label>
                <input
                  type="number"
                  value={formData.taxAmount}
                  onChange={(e) =>
                    setFormData({ ...formData, taxAmount: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSave}>
                Create Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
