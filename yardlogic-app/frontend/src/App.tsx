import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { IbimWorkspace } from "./pages/IbimWorkspace";
import { ResetPassword } from "./pages/ResetPassword";
import { VerifyEmail } from "./pages/VerifyEmail";
import { api } from "./lib/api";

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

const applicationId = import.meta.env.VITE_APPLICATION_ID;
const isMultiApplication = !applicationId || applicationId === "ALL";
const isIbim = isMultiApplication || applicationId === "IBIM";
const isYardLogic = isMultiApplication || applicationId === "YARDLOGIC";

function selectedApplication() {
  return localStorage.getItem("applicationPreference") || "";
}

function isAuthed() {
  return Boolean(localStorage.getItem("token"));
}

function businessId() {
  return localStorage.getItem("businessId") || "";
}

export default function App() {
  if (!isIbim && !isYardLogic) {
    return <div style={{ padding: 32 }}>Application configuration is missing.</div>;
  }

  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Loading workspace...</div>}>
      <Routes>
        <Route path="/select-application" element={<ApplicationHome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        {isIbim && <Route path="/ibim" element={isAuthed() && Boolean(businessId()) && (!isMultiApplication || selectedApplication() === "IBIM") ? <IbimWorkspace /> : <Navigate to={isMultiApplication ? "/select-application" : "/login"} replace />} />}
        {isYardLogic && <Route path="/" element={isMultiApplication && !selectedApplication() ? <ApplicationHome /> : isAuthed() ? <Layout /> : <Navigate to="/login" />}>
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
        </Route>}
      </Routes>
    </Suspense>
  );
}

function ApplicationHome() {
  const [unassigned, setUnassigned] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [message, setMessage] = useState("");
  useEffect(() => { if (localStorage.getItem("token")) void api<{ businesses: Array<{ id: string; name: string; applicationId: string; role: string }> }>("/auth/application/businesses").then((result) => setUnassigned(result.businesses.filter((business) => business.applicationId === "UNASSIGNED"))).catch(() => {}); }, []);
  function choose(application: "IBIM" | "YARDLOGIC") {
    localStorage.setItem("applicationPreference", application);
    window.location.assign(application === "IBIM" ? "/login?application=IBIM" : "/login?application=YARDLOGIC");
  }

  async function classify(id: string, applicationId: "IBIM" | "YARDLOGIC") { try { await api(`/auth/application/businesses/${id}`, { method: "PATCH", body: JSON.stringify({ applicationId }) }); setUnassigned((items) => items.filter((item) => item.id !== id)); setMessage("Business classified. Select its application to continue."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to classify business"); } }
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#142b2a" }}><section style={{ width: "min(900px, 100%)", color: "#f4f0e7" }}><p className="eyebrow">Choose your workspace</p><h1 style={{ fontSize: "clamp(36px, 7vw, 72px)", margin: "12px 0 16px" }}>What are you here to run?</h1><p style={{ maxWidth: 620, color: "rgba(244,240,231,.72)", lineHeight: 1.7 }}>Select a platform to create an account or sign in. You can return here later to switch workspace.</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 34 }}><button type="button" onClick={() => choose("IBIM")} style={{ textAlign: "left", padding: 26, minHeight: 180, background: "#d98654", color: "#191312", border: 0 }}><strong style={{ display: "block", fontSize: 25 }}>iBIM</strong><span style={{ display: "block", marginTop: 12 }}>Insurance mutual operations, proposals, renewals, policies, and broker reporting.</span></button><button type="button" onClick={() => choose("YARDLOGIC")} style={{ textAlign: "left", padding: 26, minHeight: 180, background: "#f0bf67", color: "#191312", border: 0 }}><strong style={{ display: "block", fontSize: 25 }}>YardLogic</strong><span style={{ display: "block", marginTop: 12 }}>Stock, invoicing, purchasing, GST, payments, and business operations.</span></button></div>{message && <p style={{ marginTop: 20 }}>{message}</p>}{unassigned.length > 0 && <section style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,.2)" }}><h2>Classify existing workspace</h2>{unassigned.map((business) => <div key={business.id} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}><span>{business.name}</span><span><button type="button" onClick={() => void classify(business.id, "IBIM")}>iBIM</button><button type="button" onClick={() => void classify(business.id, "YARDLOGIC")}>YardLogic</button></span></div>)}</section>}</section></main>;
}
