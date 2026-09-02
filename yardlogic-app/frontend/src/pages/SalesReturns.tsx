import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./Returns.css";

interface Invoice {
  id: string;
  number: string;
  customerId?: string;
  customer?: { name: string };
  grandTotal: number;
  amountPaid: number;
  status: string;
}

interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface SalesReturn {
  id: string;
  invoiceId: string;
  invoice: { number: string };
  customer?: { name: string };
  number: string;
  reason: string;
  amount: number;
  createdAt: string;
}

export const SalesReturns: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [refundMode, setRefundMode] = useState<"CREDIT_NOTE" | "REFUND">("CREDIT_NOTE");
  const [note, setNote] = useState("");

  const fetchReturns = async () => {
    try {
      const response = await api("/returns/sales-returns");
      setReturns(response.returns);
    } catch (error) {
      console.error("Error fetching returns:", error);
    }
  };

  const fetchInvoices = async () => {
    try {
      const response = await api("/invoices");
      // Filter to unpaid/partial only
      setInvoices(response.filter((inv: any) => inv.status !== "PAID" && inv.status !== "CANCELLED"));
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([fetchReturns(), fetchInvoices()]);
  }, []);

  const handleSelectInvoice = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    try {
      const invDetails = await api(`/invoices/${invoice.id}`);
      setInvoiceItems(invDetails.items || []);
    } catch (error) {
      console.error("Error fetching invoice details:", error);
    }
  };

  const handleToggleItem = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleCreateReturn = async () => {
    if (!selectedInvoice || selectedItems.size === 0) {
      alert("Please select items to return");
      return;
    }

    const returnItems = Array.from(selectedItems).map((invoiceItemId) => {
      const item = invoiceItems.find((i) => i.id === invoiceItemId);
      return {
        invoiceItemId,
        quantity: item?.quantity || 0,
        reason: note || "Customer return",
      };
    });

    try {
      await api("/returns/sales-returns", {
        method: "POST",
        body: JSON.stringify({
          invoiceId: selectedInvoice.id,
          items: returnItems,
          refundMode,
          note,
        }),
      });

      setShowReturnForm(false);
      setSelectedInvoice(null);
      setSelectedItems(new Set());
      setNote("");
      await fetchReturns();
      alert("Sales return created successfully");
    } catch (error) {
      console.error("Error creating return:", error);
      alert("Failed to create return");
    }
  };

  if (loading) {
    return <div className="returns-page">Loading...</div>;
  }

  return (
    <div className="returns-page">
      <div className="returns-header">
        <h2>Sales Returns</h2>
        <button className="btn-primary" onClick={() => setShowReturnForm(true)}>
          + Create Return
        </button>
      </div>

      <div className="returns-list">
        <h3>Recent Returns</h3>
        {returns.length === 0 ? (
          <p className="empty-state">No sales returns yet</p>
        ) : (
          <table className="returns-table">
            <thead>
              <tr>
                <th>Return #</th>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((ret) => (
                <tr key={ret.id}>
                  <td>{ret.number}</td>
                  <td>{ret.invoice.number}</td>
                  <td>{ret.customer?.name || "—"}</td>
                  <td>₹{ret.amount.toFixed(2)}</td>
                  <td>{new Date(ret.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showReturnForm && (
        <div className="modal-overlay" onClick={() => setShowReturnForm(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <h3>Create Sales Return</h3>

            <div className="form-group">
              <label>Invoice *</label>
              <select
                value={selectedInvoice?.id || ""}
                onChange={(e) => {
                  const inv = invoices.find((i) => i.id === e.target.value);
                  if (inv) handleSelectInvoice(inv);
                }}
              >
                <option value="">Select an invoice</option>
                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number} - {invoice.customer?.name || "Walk-in"} (₹
                    {invoice.grandTotal.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            {selectedInvoice && invoiceItems.length > 0 && (
              <div className="form-group">
                <label>Select Items to Return *</label>
                <div className="items-list">
                  {invoiceItems.map((item) => (
                    <div key={item.id} className="item-checkbox">
                      <input
                        type="checkbox"
                        id={`item-${item.id}`}
                        checked={selectedItems.has(item.id)}
                        onChange={() => handleToggleItem(item.id)}
                      />
                      <label htmlFor={`item-${item.id}`}>
                        <span className="item-name">{item.name}</span>
                        <span className="item-qty">Qty: {item.quantity}</span>
                        <span className="item-price">₹{item.lineTotal.toFixed(2)}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Refund Mode *</label>
                <select value={refundMode} onChange={(e) => setRefundMode(e.target.value as any)}>
                  <option value="CREDIT_NOTE">Credit Note (Adjust Invoice)</option>
                  <option value="REFUND">Refund (Return Payment)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Reason</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why is this being returned?"
                rows={3}
              />
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowReturnForm(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleCreateReturn}>
                Create Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
