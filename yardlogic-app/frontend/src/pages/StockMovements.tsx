import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./StockMovements.css";

interface StockMovement {
  id: string;
  itemId: string;
  item: {
    name: string;
    sku: string;
  };
  change: number;
  reason: string;
  note?: string;
  createdAt: string;
}

interface Item {
  id: string;
  name: string;
  sku: string;
  currentStock: number;
}

const ADJUSTMENT_REASONS = ["ADJUSTMENT", "DAMAGE", "LOSS", "STOCK_CORRECTION"];

export const StockMovements: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    itemId: "",
    quantity: 0,
    reason: "ADJUSTMENT",
    note: "",
  });
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  const fetchMovements = async () => {
    try {
      const response = await api("/returns/stock-adjustments");
      setMovements(response.movements);
    } catch (error) {
      console.error("Error fetching movements:", error);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api("/items");
      setItems(response);
    } catch (error) {
      console.error("Error fetching items:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([fetchMovements(), fetchItems()]);
  }, []);

  const handleCreateAdjustment = async () => {
    if (!formData.itemId) {
      alert("Please select an item");
      return;
    }

    try {
      const response = await api("/returns/stock-adjustments", {
        method: "POST",
        body: JSON.stringify({
          itemId: formData.itemId,
          quantity: parseFloat(formData.quantity.toString()),
          reason: formData.reason,
          note: formData.note,
        }),
      });

      setShowAdjustmentForm(false);
      setFormData({ itemId: "", quantity: 0, reason: "ADJUSTMENT", note: "" });
      await fetchMovements();
      alert("Stock adjustment recorded");
    } catch (error) {
      console.error("Error creating adjustment:", error);
      alert("Failed to create adjustment");
    }
  };

  if (loading) {
    return <div className="stock-movements-page">Loading...</div>;
  }

  return (
    <div className="stock-movements-page">
      <div className="movements-header">
        <h2>Stock Adjustments</h2>
        <button className="btn-primary" onClick={() => setShowAdjustmentForm(true)}>
          + Adjust Stock
        </button>
      </div>

      <div className="reason-filter">
        <button
          className={`filter-btn ${selectedReason === null ? "active" : ""}`}
          onClick={() => setSelectedReason(null)}
        >
          All
        </button>
        {ADJUSTMENT_REASONS.map((reason) => (
          <button
            key={reason}
            className={`filter-btn ${selectedReason === reason ? "active" : ""}`}
            onClick={() => setSelectedReason(reason)}
          >
            {reason.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      <div className="movements-table">
        {movements.length === 0 ? (
          <p className="empty-state">No stock movements yet</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th>SKU</th>
                <th>Change</th>
                <th>Reason</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {movements
                .filter((m) => !selectedReason || m.reason === selectedReason)
                .map((movement) => (
                  <tr key={movement.id}>
                    <td>{new Date(movement.createdAt).toLocaleDateString()}</td>
                    <td>{movement.item.name}</td>
                    <td className="sku">{movement.item.sku}</td>
                    <td className={movement.change > 0 ? "positive" : "negative"}>
                      {movement.change > 0 ? "+" : ""}
                      {movement.change}
                    </td>
                    <td className="reason">{movement.reason.replace(/_/g, " ")}</td>
                    <td>{movement.note || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdjustmentForm && (
        <div className="modal-overlay" onClick={() => setShowAdjustmentForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Adjust Stock</h3>

            <div className="form-group">
              <label>Item *</label>
              <select
                value={formData.itemId}
                onChange={(e) => setFormData({ ...formData, itemId: e.target.value })}
              >
                <option value="">Select an item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} (Current: {item.currentStock})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Quantity Change *</label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="Positive or negative number"
                />
                <small>Positive = add stock, Negative = remove stock</small>
              </div>

              <div className="form-group">
                <label>Reason *</label>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                >
                  {ADJUSTMENT_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Note</label>
              <textarea
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="Why are we adjusting this stock?"
                rows={3}
              />
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAdjustmentForm(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleCreateAdjustment}>
                Record Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
