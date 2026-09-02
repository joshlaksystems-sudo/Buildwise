import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./Suppliers.css";

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  openingBalance: number;
  creditLimit?: number;
  paymentTerms?: string;
  isActive: boolean;
}

interface SupplierLedger {
  supplier: {
    id: string;
    name: string;
    gstin?: string;
  };
  openingBalance: number;
  closingBalance: number;
  ledgerItems: Array<{
    type: string;
    date: string;
    description: string;
    amount: number;
    balance: number;
  }>;
}

interface SupplierAging {
  current: number;
  _0_30: number;
  _30_60: number;
  _60_90: number;
  _90_plus: number;
  total: number;
}

export const Suppliers: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [ledger, setLedger] = useState<SupplierLedger | null>(null);
  const [aging, setAging] = useState<SupplierAging | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Partial<Supplier>>({});

  const fetchSuppliers = async () => {
    try {
      const response = await api("/contacts/suppliers");
      setSuppliers(response);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSupplierDetails = async (supplierId: string) => {
    try {
      const [ledgerRes, agingRes] = await Promise.all([
        api(`/contacts/suppliers/${supplierId}/ledger`),
        api(`/contacts/suppliers/${supplierId}/aging`),
      ]);
      setLedger(ledgerRes);
      setAging(agingRes);
    } catch (error) {
      console.error("Error fetching supplier details:", error);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    fetchSupplierDetails(supplier.id);
  };

  const handleSaveSupplier = async () => {
    try {
      if (formData.id) {
        // Update
        await api(`/contacts/suppliers/${formData.id}`, {
          method: "PATCH",
          body: JSON.stringify(formData),
        });
      } else {
        // Create
        await api("/contacts/suppliers", {
          method: "POST",
          body: JSON.stringify(formData),
        });
      }
      setShowForm(false);
      setFormData({});
      await fetchSuppliers();
    } catch (error) {
      console.error("Error saving supplier:", error);
    }
  };

  const handleDeleteSupplier = async (supplierId: string) => {
    if (confirm("Soft delete this supplier? They can be reactivated later.")) {
      try {
        await api(`/contacts/suppliers/${supplierId}`, { method: "DELETE" });
        await fetchSuppliers();
        setSelectedSupplier(null);
      } catch (error) {
        console.error("Error deleting supplier:", error);
      }
    }
  };

  if (loading) {
    return <div className="suppliers-page">Loading suppliers...</div>;
  }

  return (
    <div className="suppliers-page">
      <div className="suppliers-header">
        <h2>Suppliers</h2>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + Add Supplier
        </button>
      </div>

      <div className="suppliers-layout">
        {/* Supplier List */}
        <div className="suppliers-list">
          {suppliers.length === 0 ? (
            <p className="empty-state">No suppliers yet. Create one to get started.</p>
          ) : (
            suppliers.map((supplier) => (
              <div
                key={supplier.id}
                className={`supplier-card ${selectedSupplier?.id === supplier.id ? "active" : ""}`}
                onClick={() => handleSelectSupplier(supplier)}
              >
                <h3>{supplier.name}</h3>
                <p className="supplier-meta">
                  {supplier.phone && <span>{supplier.phone}</span>}
                  {supplier.gstin && <span>{supplier.gstin}</span>}
                </p>
                {supplier.openingBalance !== 0 && (
                  <p className="opening-balance">OB: ₹{supplier.openingBalance.toFixed(2)}</p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Supplier Details */}
        <div className="supplier-details">
          {selectedSupplier ? (
            <>
              <div className="details-header">
                <h3>{selectedSupplier.name}</h3>
                <div className="action-buttons">
                  <button className="btn-secondary" onClick={() => {
                    setFormData(selectedSupplier);
                    setShowForm(true);
                  }}>
                    Edit
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => handleDeleteSupplier(selectedSupplier.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="details-section">
                <h4>Contact Information</h4>
                <div className="detail-row">
                  <label>Email:</label>
                  <span>{selectedSupplier.email || "—"}</span>
                </div>
                <div className="detail-row">
                  <label>Phone:</label>
                  <span>{selectedSupplier.phone || "—"}</span>
                </div>
                <div className="detail-row">
                  <label>Address:</label>
                  <span>{selectedSupplier.address || "—"}</span>
                </div>
                <div className="detail-row">
                  <label>GSTIN:</label>
                  <span>{selectedSupplier.gstin || "—"}</span>
                </div>
              </div>

              <div className="details-section">
                <h4>Payment Terms</h4>
                <div className="detail-row">
                  <label>Terms:</label>
                  <span>{selectedSupplier.paymentTerms || "—"}</span>
                </div>
                <div className="detail-row">
                  <label>Credit Limit:</label>
                  <span>
                    {selectedSupplier.creditLimit
                      ? `₹${selectedSupplier.creditLimit.toFixed(2)}`
                      : "—"}
                  </span>
                </div>
              </div>

              {aging && (
                <div className="details-section">
                  <h4>Payables Aging</h4>
                  <div className="aging-summary">
                    <div className="aging-item current">
                      <span>Current:</span>
                      <strong>₹{aging.current.toFixed(2)}</strong>
                    </div>
                    <div className="aging-item _0_30">
                      <span>0-30 days:</span>
                      <strong>₹{aging._0_30.toFixed(2)}</strong>
                    </div>
                    <div className="aging-item _30_60">
                      <span>30-60 days:</span>
                      <strong>₹{aging._30_60.toFixed(2)}</strong>
                    </div>
                    <div className="aging-item _60_90">
                      <span>60-90 days:</span>
                      <strong>₹{aging._60_90.toFixed(2)}</strong>
                    </div>
                    <div className="aging-item overdue">
                      <span>90+ days:</span>
                      <strong>₹{aging._90_plus.toFixed(2)}</strong>
                    </div>
                  </div>
                  <div className="aging-total">
                    <strong>Total Outstanding:</strong>
                    <span>₹{aging.total.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {ledger && (
                <div className="details-section">
                  <h4>Ledger</h4>
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.ledgerItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>{new Date(item.date).toLocaleDateString()}</td>
                          <td>{item.description}</td>
                          <td
                            className={item.amount > 0 ? "positive" : "negative"}
                          >
                            ₹{Math.abs(item.amount).toFixed(2)}
                          </td>
                          <td>₹{item.balance.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">Select a supplier to view details</div>
          )}
        </div>
      </div>

      {/* Supplier Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{formData.id ? "Edit Supplier" : "Add Supplier"}</h3>
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Supplier name"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Email"
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={formData.phone || ""}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Phone"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Address</label>
              <textarea
                value={formData.address || ""}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Address"
                rows={3}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>GSTIN</label>
                <input
                  type="text"
                  value={formData.gstin || ""}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                  placeholder="GSTIN"
                />
              </div>
              <div className="form-group">
                <label>Opening Balance</label>
                <input
                  type="number"
                  value={formData.openingBalance || 0}
                  onChange={(e) =>
                    setFormData({ ...formData, openingBalance: parseFloat(e.target.value) })
                  }
                  placeholder="0"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Credit Limit</label>
                <input
                  type="number"
                  value={formData.creditLimit || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || undefined })
                  }
                  placeholder="Leave blank for no limit"
                />
              </div>
              <div className="form-group">
                <label>Payment Terms</label>
                <input
                  type="text"
                  value={formData.paymentTerms || ""}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                  placeholder="e.g., 30 days"
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveSupplier}>
                Save Supplier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
