import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";

const Dashboard = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })));
const Invoices = lazy(() => import("./pages/Invoices").then((module) => ({ default: module.Invoices })));
const Items = lazy(() => import("./pages/Items").then((module) => ({ default: module.Items })));
const Reports = lazy(() => import("./pages/Reports").then((module) => ({ default: module.Reports })));
const Ask = lazy(() => import("./pages/Ask").then((module) => ({ default: module.Ask })));
const Estimates = lazy(() => import("./pages/Estimates").then((module) => ({ default: module.Estimates })));
const Challans = lazy(() => import("./pages/Challans").then((module) => ({ default: module.Challans })));
const Contacts = lazy(() => import("./pages/Contacts").then((module) => ({ default: module.Contacts })));
const Expenses = lazy(() => import("./pages/Expenses").then((module) => ({ default: module.Expenses })));
const BankStatements = lazy(() => import("./pages/BankStatements").then((module) => ({ default: module.BankStatements })));
const Suppliers = lazy(() => import("./pages/Suppliers").then((module) => ({ default: module.Suppliers })));
const PurchaseBills = lazy(() => import("./pages/PurchaseBills").then((module) => ({ default: module.PurchaseBills })));
const PurchaseReturns = lazy(() => import("./pages/PurchaseReturns").then((module) => ({ default: module.PurchaseReturns })));
const SalesReturns = lazy(() => import("./pages/SalesReturns").then((module) => ({ default: module.SalesReturns })));
const CreditDebitNotes = lazy(() => import("./pages/CreditDebitNotes").then((module) => ({ default: module.CreditDebitNotes })));
const StockMovements = lazy(() => import("./pages/StockMovements").then((module) => ({ default: module.StockMovements })));
const BusinessProfile = lazy(() => import("./pages/BusinessProfile").then((module) => ({ default: module.BusinessProfile })));
const Operations = lazy(() => import("./pages/Operations").then((module) => ({ default: module.Operations })));
const Growth = lazy(() => import("./pages/Growth").then((module) => ({ default: module.Growth })));
const Approvals = lazy(() => import("./pages/Approvals").then((module) => ({ default: module.Approvals })));

function isAuthed() {
  return Boolean(localStorage.getItem("token"));
}

function businessId() {
  return localStorage.getItem("businessId") || "";
}

export default function App() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Loading YardLogic...</div>}>
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
          <Route path="operations" element={<Operations />} />
          <Route path="growth" element={<Growth />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="ask" element={<Ask />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
