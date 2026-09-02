import "dotenv/config";
import express from "express";
import cors from "cors";
import { initializeGoogleCloud } from "./services/googleCloud";
import { authRouter } from "./routes/auth";
import { itemsRouter } from "./routes/items";
import { invoicesRouter } from "./routes/invoices";
import { reportsRouter } from "./routes/reports";
import { contactsRouter } from "./routes/contacts";
import { aiRouter } from "./routes/ai";
import { estimatesRouter } from "./routes/estimates";
import { challansRouter } from "./routes/challans";
import { expensesRouter } from "./routes/expenses";
import { publicInvoicesRouter } from "./routes/publicInvoices";
import { gstRouter } from "./routes/gst";
import { syncRouter } from "./routes/sync";
import { materialTemplatesRouter } from "./routes/materialTemplates";
import { forecastRouter } from "./routes/forecast";
import { bankRouter } from "./routes/bank";
import businessRouter from "./routes/business";
import { purchaseBillsRouter } from "./routes/purchaseBills";
import { returnsRouter } from "./routes/returns";
import { creditDebitNotesRouter } from "./routes/creditDebitNotes";
import { bankStatementsRouter } from "./routes/bankStatements";
import { notificationsRouter, startNotificationScheduler } from "./routes/notifications";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Initialize Google Cloud services
initializeGoogleCloud();

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/business", businessRouter);
app.use("/items", itemsRouter);
app.use("/invoices", invoicesRouter);
app.use("/purchase-bills", purchaseBillsRouter);
app.use("/returns", returnsRouter);
app.use("/notes", creditDebitNotesRouter);
app.use("/reports", reportsRouter);
app.use("/contacts", contactsRouter);
app.use("/ai", aiRouter);
app.use("/estimates", estimatesRouter);
app.use("/challans", challansRouter);
app.use("/expenses", expensesRouter);
app.use("/public/invoices", publicInvoicesRouter);
app.use("/gst", gstRouter);
app.use("/sync", syncRouter);
app.use("/material-templates", materialTemplatesRouter);
app.use("/forecast", forecastRouter);
app.use("/bank", bankRouter);
app.use("/bank", bankStatementsRouter);
app.use("/notifications", notificationsRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Vyapar+ API listening on :${port}`));
startNotificationScheduler();
