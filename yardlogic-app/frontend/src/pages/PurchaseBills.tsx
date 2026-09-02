import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./PurchaseBills.css";

interface PurchaseBill {
  id: string;
  businessId: string;
  supplierId?: string;
  supplier?: { name: string };
  number: string;
  status: "DRAFT" | "RECEIVED" | "PARTIAL" | "PAID" | "CANCELLED";
  subTotal: number;
  discount: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
  paymentMode?: string;
  dueDate?: string;
  referenceNumber?: string;
  createdAt: string;
  items?: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number;
    lineTotal: number;
  }>;
}

interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export const PurchaseBills: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedBill, setSelectedBill] = useState<PurchaseBill | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formData, setFormData] = useState<Partial<PurchaseBill>>({});
  const [items, setItems] = useState<any[]>([]);
  const [newItem, setNewItem] = useState({
    itemId: "",
    name: "",
    quantity: 0,
    unitPrice: 0,
    discount: 0,
    taxRate: 0,
  });

  const fetchBills = async () => {
    try {
      const response = await api<{ bills?: PurchaseBill[] } | PurchaseBill[]>("/purchase-bills");
      setBills(Array.isArray(response) ? response : response.bills || []);
      setError("");
    } catch (error) {
      console.error("Error fetching bills:", error);
      setError(error instanceof Error ? error.message : "Unable to load purchase bills");
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await api("/contacts/suppliers");
      setSuppliers(response);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      setError(error instanceof Error ? error.message : "Unable to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([fetchBills(), fetchSuppliers()]);
  }, []);

  const handleSelectBill = async (bill: PurchaseBill) => {
    setSelectedBill(bill);
    try {
      const billDetail = await api(`/purchase-bills/${bill.id}`);
      setItems(billDetail.items || []);
    } catch (error) {
      console.error("Error fetching bill detail:", error);
    }
  };

  const handleOpenForm = (bill?: PurchaseBill) => {
    if (bill && bill.status === "DRAFT") {
      setFormData(bill);
      setItems(bill.items || []);
    } else {
      setFormData({ status: "DRAFT", subTotal: 0, discount: 0, taxTotal: 0, grandTotal: 0 });
      setItems([]);
    }
    setNewItem({ itemId: "", name: "", quantity: 0, unitPrice: 0, discount: 0, taxRate: 0 });
    setShowForm(true);
  };

  const handleAddItem = () => {
    if (!newItem.name || newItem.quantity <= 0 || newItem.unitPrice < 0) {
      alert("Please fill all item fields");
      return;
    }

    const lineTotal = newItem.quantity * newItem.unitPrice - newItem.discount + (newItem.quantity * newItem.unitPrice - newItem.discount) * (newItem.taxRate / 100);
    const item = { ...newItem, lineTotal, id: Math.random().toString() };
    setItems([...items, item]);
    setNewItem({ itemId: "", name: "", quantity: 0, unitPrice: 0, discount: 0, taxRate: 0 });
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    let subTotal = 0;
    let taxTotal = 0;

    for (const item of items) {
      const base = item.quantity * item.unitPrice - (item.discount || 0);
      const tax = base * ((item.taxRate || 0) / 100);
      subTotal += base;
      taxTotal += tax;
    }

    return { subTotal, taxTotal, grandTotal: subTotal + taxTotal };
  };

  const handleSaveBill = async () => {
    if (!formData.supplierId || items.length === 0) {
      alert("Please select a supplier and add items");
      return;
    }

    const { subTotal, taxTotal, grandTotal } = calculateTotals();

    try {
      const billPayload = {
        supplierId: formData.supplierId,
        status: formData.status || "DRAFT",
        subTotal,
        discount: formData.discount || 0,
        taxTotal,
        grandTotal,
        amountPaid: formData.amountPaid || 0,
        paymentMode: formData.paymentMode,
        dueDate: formData.dueDate,
        referenceNumber: formData.referenceNumber,
        items: items.map((item) => ({
          itemId: item.itemId || undefined,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          taxRate: item.taxRate || 0,
        })),
      };

      if (formData.id) {
        // Update
        await api(`/purchase-bills/${formData.id}`, {
          method: "PATCH",
          body: JSON.stringify(billPayload),
        });
      } else {
        // Create
        await api("/purchase-bills", {
          method: "POST",
          body: JSON.stringify(billPayload),
        });
      }

      setShowForm(false);
      setFormData({});
      setItems([]);
      await fetchBills();
      alert("Bill saved successfully");
    } catch (error) {
      console.error("Error saving bill:", error);
      alert("Failed to save bill");
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedBill) return;

    const amountToPayString = prompt(`Enter payment amount (Outstanding: ₹${(selectedBill.grandTotal - selectedBill.amountPaid).toFixed(2)})`);
    if (!amountToPayString) return;

    const amountToPay = parseFloat(amountToPayString);
    if (isNaN(amountToPay) || amountToPay <= 0) {
      alert("Invalid amount");
      return;
    }

    try {
      await api(`/purchase-bills/${selectedBill.id}/pay`, {
        method: "POST",
        body: JSON.stringify({
          amount: amountToPay,
          mode: "BANK_TRANSFER",
        }),
      });

      await fetchBills();
      setSelectedBill(null);
      alert("Payment recorded successfully");
    } catch (error) {
      console.error("Error recording payment:", error);
      alert("Failed to record payment");
    }
  };

  const handleCancelBill = async () => {
    if (!selectedBill || !confirm("Cancel this bill? Stock will be reversed.")) return;

    try {
      await api(`/purchase-bills/${selectedBill.id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      await fetchBills();
      setSelectedBill(null);
      alert("Bill cancelled");
    } catch (error) {
      console.error("Error cancelling bill:", error);
      alert("Failed to cancel bill");
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      DRAFT: "draft",
      RECEIVED: "received",
      PARTIAL: "partial",
      PAID: "paid",
      CANCELLED: "cancelled",
    };
    return badges[status] || "default";
  };

  const filteredBills = bills.filter((b) => statusFilter === "all" || b.status === statusFilter);

  if (loading) {
    return <div className="purchase-bills-page">Loading...</div>;
  }

  return (
    <div className="purchase-bills-page">
      <div className="bills-header">
        <h2>Purchase Bills</h2>
        <button className="btn-primary" onClick={() => handleOpenForm()}>
          + Create Bill
        </button>
      </div>

      {error && (
        <div className="error-state">
          <p>{error}</p>
          <button className="btn-secondary" onClick={() => { void fetchBills(); void fetchSuppliers(); }}>Retry</button>
        </div>
      )}

      <div className="status-filter">
        {["all", "DRAFT", "RECEIVED", "PARTIAL", "PAID", "CANCELLED"].map((status) => (
          <button
            key={status}
            className={`filter-btn ${statusFilter === status ? "active" : ""}`}
            onClick={() => setStatusFilter(status)}
          >
            {status === "all" ? "All" : status}
          </button>
        ))}
      </div>

      <div className="bills-layout">
        <div className="bills-list">
          {filteredBills.length === 0 ? (
            <p className="empty-state">No bills found</p>
          ) : (
            filteredBills.map((bill) => (
              <div
                key={bill.id}
                className={`bill-card ${selectedBill?.id === bill.id ? "active" : ""}`}
                onClick={() => handleSelectBill(bill)}
              >
                <div className="bill-header">
                  <h4>{bill.number}</h4>
                  <span className={`status ${getStatusBadge(bill.status)}`}>{bill.status}</span>
                </div>
                <p className="supplier-name">{bill.supplier?.name || "Unknown"}</p>
                <p className="bill-amount">₹{bill.grandTotal.toFixed(2)}</p>
                <p className="bill-paid">Paid: ₹{bill.amountPaid.toFixed(2)}</p>
              </div>
            ))
          )}
        </div>

        <div className="bill-details">
          {selectedBill ? (
            <>
              <div className="details-header">
                <h3>{selectedBill.number}</h3>
                <div className="header-actions">
                  {selectedBill.status === "DRAFT" && (
                    <button className="btn-secondary" onClick={() => handleOpenForm(selectedBill)}>
                      Edit
                    </button>
                  )}
                  {(selectedBill.status === "RECEIVED" || selectedBill.status === "PARTIAL") && (
                    <button className="btn-primary" onClick={handleRecordPayment}>
                      Record Payment
                    </button>
                  )}
                  {selectedBill.status === "DRAFT" && (
                    <button className="btn-danger" onClick={handleCancelBill}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              <div className="details-section">
                <h4>Supplier Information</h4>
                <div className="detail-row">
                  <label>Supplier:</label>
                  <span>{selectedBill.supplier?.name || "—"}</span>
                </div>
                <div className="detail-row">
                  <label>Reference #:</label>
                  <span>{selectedBill.referenceNumber || "—"}</span>
                </div>
                <div className="detail-row">
                  <label>Due Date:</label>
                  <span>{selectedBill.dueDate ? new Date(selectedBill.dueDate).toLocaleDateString() : "—"}</span>
                </div>
              </div>

              <div className="details-section">
                <h4>Items</h4>
                {items.length === 0 ? (
                  <p className="empty">No items</p>
                ) : (
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Tax %</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.name}</td>
                          <td>{item.quantity}</td>
                          <td>₹{item.unitPrice.toFixed(2)}</td>
                          <td>{item.taxRate}%</td>
                          <td>₹{item.lineTotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="details-section">
                <h4>Summary</h4>
                <div className="summary-row">
                  <label>Subtotal:</label>
                  <span>₹{selectedBill.subTotal.toFixed(2)}</span>
                </div>
                <div className="summary-row">
                  <label>Discount:</label>
                  <span>₹{selectedBill.discount.toFixed(2)}</span>
                </div>
                <div className="summary-row">
                  <label>Tax:</label>
                  <span>₹{selectedBill.taxTotal.toFixed(2)}</span>
                </div>
                <div className="summary-row total">
                  <label>Grand Total:</label>
                  <span>₹{selectedBill.grandTotal.toFixed(2)}</span>
                </div>
                <div className="summary-row paid">
                  <label>Amount Paid:</label>
                  <span>₹{selectedBill.amountPaid.toFixed(2)}</span>
                </div>
                <div className="summary-row outstanding">
                  <label>Outstanding:</label>
                  <span>₹{(selectedBill.grandTotal - selectedBill.amountPaid).toFixed(2)}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">Select a bill to view details</div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <h3>{formData.id ? "Edit Bill" : "Create Purchase Bill"}</h3>

            <div className="form-group">
              <label>Supplier *</label>
              <select
                value={formData.supplierId || ""}
                onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
              >
                <option value="">Select a supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Reference Number</label>
                <input
                  type="text"
                  value={formData.referenceNumber || ""}
                  onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                  placeholder="PO-001"
                />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input
                  type="date"
                  value={formData.dueDate || ""}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>
            </div>

            <div className="form-section">
              <h4>Add Items</h4>

              <div className="form-row">
                <div className="form-group">
                  <label>Item Name *</label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="Item name"
                  />
                </div>
                <div className="form-group">
                  <label>Quantity *</label>
                  <input
                    type="number"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
                <div className="form-group">
                  <label>Unit Price *</label>
                  <input
                    type="number"
                    value={newItem.unitPrice}
                    onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Discount</label>
                  <input
                    type="number"
                    value={newItem.discount}
                    onChange={(e) => setNewItem({ ...newItem, discount: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>Tax %</label>
                  <input
                    type="number"
                    value={newItem.taxRate}
                    onChange={(e) => setNewItem({ ...newItem, taxRate: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
                <div className="form-group">
                  <button className="btn-add-item" onClick={handleAddItem}>
                    Add Item
                  </button>
                </div>
              </div>

              {items.length > 0 && (
                <table className="form-items-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.name}</td>
                        <td>{item.quantity}</td>
                        <td>₹{item.unitPrice.toFixed(2)}</td>
                        <td>₹{item.lineTotal.toFixed(2)}</td>
                        <td>
                          <button
                            className="btn-remove"
                            onClick={() => handleRemoveItem(idx)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveBill}>
                Save Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
