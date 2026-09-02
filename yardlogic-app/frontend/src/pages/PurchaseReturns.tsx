import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./Returns.css";

interface PurchaseBill {
  id: string;
  number: string;
  supplierId?: string;
  supplier?: { name: string };
  grandTotal: number;
  amountPaid: number;
  status: string;
}

interface BillItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface PurchaseReturn {
  id: string;
  billId?: string;
  number: string;
  amount: number;
  createdAt: string;
  supplier?: { name: string };
}

export const PurchaseReturns: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [selectedBill, setSelectedBill] = useState<PurchaseBill | null>(null);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [refundMode, setRefundMode] = useState<"CREDIT" | "REFUND">("CREDIT");
  const [note, setNote] = useState("");

  const fetchReturns = async () => {
    try {
      const response = await api("/returns/purchase-returns");
      setReturns(response.returns);
    } catch (error) {
      console.error("Error fetching returns:", error);
    }
  };

  const fetchBills = async () => {
    try {
      const response = await api("/purchase-bills");
      // Filter to unpaid/partial only
      setBills(response.filter((bill: any) => bill.status !== "PAID" && bill.status !== "CANCELLED"));
    } catch (error) {
      console.error("Error fetching bills:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([fetchReturns(), fetchBills()]);
  }, []);

  const handleSelectBill = async (bill: PurchaseBill) => {
    setSelectedBill(bill);
    try {
      const billDetails = await api(`/purchase-bills/${bill.id}`);
      setBillItems(billDetails.items || []);
    } catch (error) {
      console.error("Error fetching bill details:", error);
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
    if (!selectedBill || selectedItems.size === 0) {
      alert("Please select items to return");
      return;
    }

    const returnItems = Array.from(selectedItems).map((billItemId) => {
      const item = billItems.find((i) => i.id === billItemId);
      return {
        billItemId,
        quantity: item?.quantity || 0,
        reason: note || "Supplier return",
      };
    });

    try {
      await api("/returns/purchase-returns", {
        method: "POST",
        body: JSON.stringify({
          billId: selectedBill.id,
          items: returnItems,
          refundMode,
          note,
        }),
      });

      setShowReturnForm(false);
      setSelectedBill(null);
      setSelectedItems(new Set());
      setNote("");
      await fetchReturns();
      alert("Purchase return created successfully");
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
        <h2>Purchase Returns</h2>
        <button className="btn-primary" onClick={() => setShowReturnForm(true)}>
          + Create Return
        </button>
      </div>

      <div className="returns-list">
        <h3>Recent Returns</h3>
        {returns.length === 0 ? (
          <p className="empty-state">No purchase returns yet</p>
        ) : (
          <table className="returns-table">
            <thead>
              <tr>
                <th>Return #</th>
                <th>Supplier</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((ret) => (
                <tr key={ret.id}>
                  <td>{ret.number}</td>
                  <td>{ret.supplier?.name || "—"}</td>
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
            <h3>Create Purchase Return</h3>

            <div className="form-group">
              <label>Purchase Bill *</label>
              <select
                value={selectedBill?.id || ""}
                onChange={(e) => {
                  const bill = bills.find((b) => b.id === e.target.value);
                  if (bill) handleSelectBill(bill);
                }}
              >
                <option value="">Select a bill</option>
                {bills.map((bill) => (
                  <option key={bill.id} value={bill.id}>
                    {bill.number} - {bill.supplier?.name || "Unknown"} (₹
                    {bill.grandTotal.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            {selectedBill && billItems.length > 0 && (
              <div className="form-group">
                <label>Select Items to Return *</label>
                <div className="items-list">
                  {billItems.map((item) => (
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
                  <option value="CREDIT">Credit Note (Reduce Payable)</option>
                  <option value="REFUND">Refund (Receive Payment)</option>
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
