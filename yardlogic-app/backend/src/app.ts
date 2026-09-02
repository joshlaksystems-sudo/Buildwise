import "express-async-errors";
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
import { notificationsRouter } from "./routes/notifications";
import { prisma } from "./lib/prisma";

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || "*")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);
const isVercelOrigin = (origin: string) => /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

app.use(cors({
	origin: (origin, callback) => {
		if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin) || isVercelOrigin(origin)) {
			callback(null, true);
			return;
		}
		callback(new Error("Origin is not allowed by CORS"));
	},
}));
app.use(express.json({ limit: "5mb" }));
initializeGoogleCloud();

app.get("/", (_req, res) => res.json({ ok: true, service: "yardlogic-backend" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/health/db", async (_req, res) => {
	try {
		await prisma.$queryRaw`SELECT 1`;
		res.json({ ok: true, database: "connected" });
	} catch (error) {
		console.error("Database health check failed:", error);
		res.status(503).json({ ok: false, database: "unavailable" });
	}
});
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

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	console.error("Unhandled API error:", error);
	if (res.headersSent) return;
	res.status(500).json({ error: "Something went wrong. Please try again." });
});

export default app;
