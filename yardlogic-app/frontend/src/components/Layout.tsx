import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { NotificationBell } from "./NotificationBell";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/invoices", label: "Invoices" },
  { to: "/estimates", label: "Estimates" },
  { to: "/challans", label: "Delivery Challans" },
  { to: "/items", label: "Inventory" },
  { to: "/stock-movements", label: "Stock Adjustments" },
  { to: "/contacts", label: "Customers & Suppliers" },
  { to: "/suppliers", label: "Supplier Ledger" },
  { to: "/purchase-bills", label: "Purchase Bills" },
  { to: "/purchase-returns", label: "Purchase Returns" },
  { to: "/sales-returns", label: "Sales Returns" },
  { to: "/credit-debit-notes", label: "Credit/Debit Notes" },
  { to: "/expenses", label: "Expenses" },
  { to: "/reports", label: "Reports" },
  { to: "/bank", label: "Bank Reconciliation" },
  { to: "/business-profile", label: "Business Profile" },
  { to: "/ask", label: "Ask your business" },
];

interface BusinessMembership {
  business: { id: string; name: string };
  role: string;
}

export function Layout() {
  const [businesses, setBusinesses] = useState<BusinessMembership[]>([]);
  const [activeId, setActiveId] = useState(localStorage.getItem("businessId") || "");
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem("businesses");
    if (stored) setBusinesses(JSON.parse(stored));
  }, []);

  // Switching business changes X-Business-Id for every subsequent
  // request — every page re-fetches against the newly selected
  // business's data only, since the backend now verifies membership
  // per-request rather than trusting this value blindly.
  function switchBusiness(id: string) {
    localStorage.setItem("businessId", id);
    setActiveId(id);
    navigate(0); // reload so every page refetches under the new business
  }

  function logout() {
    localStorage.clear();
    navigate("/login");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 240,
          borderRight: "1px solid var(--rule)",
          padding: "24px 16px",
          background: "var(--paper-raised)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>{import.meta.env.VITE_PRODUCT_NAME || "Buildwise"}</h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 12, marginTop: 0, marginBottom: 16 }}>
          {import.meta.env.VITE_COMPANY_NAME || "JC Nexus"}
        </p>

        {businesses.length > 0 && (
          <select
            value={activeId}
            onChange={(e) => switchBusiness(e.target.value)}
            style={{ marginBottom: 20, fontSize: 13 }}
          >
            {businesses.map((b) => (
              <option key={b.business.id} value={b.business.id}>
                {b.business.name} ({b.role})
              </option>
            ))}
          </select>
        )}

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              style={({ isActive }) => ({
                padding: "8px 10px",
                borderRadius: 3,
                textDecoration: "none",
                color: isActive ? "var(--paper-raised)" : "var(--ink)",
                background: isActive ? "var(--ink)" : "transparent",
                fontSize: 14,
              })}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <button className="secondary" onClick={logout} style={{ fontSize: 13 }}>
          Log out
        </button>
      </aside>
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{
          padding: "16px 40px",
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          background: "var(--paper-raised)"
        }}>
          <NotificationBell />
        </div>
        <div style={{ padding: "32px 40px", overflow: "auto", flex: 1 }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
