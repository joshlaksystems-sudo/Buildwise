import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Invoices } from "./pages/Invoices";
import { Items } from "./pages/Items";
import { Reports } from "./pages/Reports";
import { Ask } from "./pages/Ask";
import { Estimates } from "./pages/Estimates";
import { Challans } from "./pages/Challans";
import { Contacts } from "./pages/Contacts";
import { Expenses } from "./pages/Expenses";
import { BankStatements } from "./pages/BankStatements";
import { Suppliers } from "./pages/Suppliers";
import { PurchaseBills } from "./pages/PurchaseBills";
import { PurchaseReturns } from "./pages/PurchaseReturns";
import { SalesReturns } from "./pages/SalesReturns";
import { CreditDebitNotes } from "./pages/CreditDebitNotes";
import { StockMovements } from "./pages/StockMovements";
import { BusinessProfile } from "./pages/BusinessProfile";

function isAuthed() {
  return Boolean(localStorage.getItem("token"));
}

function businessId() {
  return localStorage.getItem("businessId") || "";
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={isAuthed() ? <Layout /> : <Navigate to="/login" />}>
        <Route index element={<Dashboard />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="items" element={<Items />} />
        <Route path="estimates" element={<Estimates />} />
        <Route path="challans" element={<Challans />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="suppliers" element={<Suppliers businessId={businessId()} />} />
        <Route path="purchase-bills" element={<PurchaseBills businessId={businessId()} />} />
        <Route path="purchase-returns" element={<PurchaseReturns businessId={businessId()} />} />
        <Route path="sales-returns" element={<SalesReturns businessId={businessId()} />} />
        <Route path="credit-debit-notes" element={<CreditDebitNotes businessId={businessId()} />} />
        <Route path="stock-movements" element={<StockMovements businessId={businessId()} />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="reports" element={<Reports />} />
        <Route path="bank" element={<BankStatements businessId={businessId()} />} />
        <Route path="business-profile" element={<BusinessProfile businessId={businessId()} />} />
        <Route path="ask" element={<Ask />} />
      </Route>
    </Routes>
  );
}
