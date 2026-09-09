import "express-async-errors";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { checkBigQueryConnection, googleCloudStatus, initializeGoogleCloud } from "./services/googleCloud";
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
import { advancedWorkflowsRouter } from "./routes/advancedWorkflows";
import { operationsRouter } from "./routes/operations";
import { growthRouter } from "./routes/growth";
import { approvalsRouter } from "./routes/approvals";
import { whatsappRouter } from "./routes/whatsapp";
import { emailWebhooksRouter } from "./routes/email-webhooks";
import { ibimPublicRouter, ibimRouter } from "./routes/ibim";
import { billingRouter } from "./routes/billing";
import { prisma } from "./lib/prisma";
import crypto from "node:crypto";
import { reportUnhandledError } from "./services/monitoring";

const app = express();
const applicationId = process.env.APPLICATION_ID;
if (process.env.NODE_ENV === "production" && applicationId !== "IBIM" && applicationId !== "YARDLOGIC" && applicationId !== "ALL") {
	throw new Error("APPLICATION_ID must be configured in production as IBIM, YARDLOGIC, or ALL");
}
if (process.env.NODE_ENV === "production" && process.env.PHYSICAL_APP_SCHEMAS === "true" && (!process.env.DATABASE_SCHEMA || applicationId === "ALL")) {
	throw new Error("Physical app schemas require APPLICATION_ID=IBIM or YARDLOGIC and DATABASE_SCHEMA=ibim or yardlogic");
}
const allowedOrigins = [
	...(process.env.CORS_ORIGINS || "*").split(","),
	process.env.FRONTEND_URL || "",
]
	.map((origin) => origin.trim().replace(/\/$/, ""))
	.filter(Boolean);
const isVercelOrigin = (origin: string) => /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === "true";

app.use(cors({
	origin: (origin, callback) => {
		if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin) || (allowVercelPreviews && isVercelOrigin(origin))) {
			callback(null, true);
			return;
		}
		callback(null, false);
	},
}));
app.use(express.json({
	limit: "5mb",
	verify: (req, _res, buffer) => {
		(req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
	},
}));
app.use((_req, res, next) => {
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
	res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
	if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
	next();
});
app.use((req, res, next) => {
	const requestId = req.header("X-Request-Id") || crypto.randomUUID();
	res.setHeader("X-Request-Id", requestId);
	res.locals.requestId = requestId;
	next();
});
initializeGoogleCloud();

app.get("/", (_req, res) => res.json({ ok: true, service: applicationId }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/health/ready", async (_req, res) => {
	try {
		await prisma.$queryRaw`SELECT 1`;
		res.json({ ok: true, database: "connected", vertexAI: googleCloudStatus().vertexAIEnabled });
	} catch {
		res.status(503).json({ ok: false, database: "unavailable" });
	}
});
app.get("/health/db", async (_req, res) => {
	try {
		await prisma.$queryRaw`SELECT 1`;
		res.json({ ok: true, database: "connected" });
	} catch (error) {
		console.error("Database health check failed:", error);
		res.status(503).json({ ok: false, database: "unavailable" });
	}
});
app.get("/health/google-cloud", async (_req, res) => {
	const status = googleCloudStatus();
	const bigQueryConnection = await checkBigQueryConnection();
	const ready = status.bigQueryInitialized && status.vertexAIInitialized && bigQueryConnection.ok;
	res.status(ready ? 200 : 503).json({ ok: ready, ...status, bigQueryConnection });
});
app.use(whatsappRouter);
app.use("/webhooks", emailWebhooksRouter);
app.use("/auth", authRouter);
app.use("/business", businessRouter);
if (applicationId === "YARDLOGIC" || applicationId === "ALL") {
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
app.use("/advanced", advancedWorkflowsRouter);
app.use("/operations", operationsRouter);
app.use("/growth", growthRouter);
app.use("/approvals", approvalsRouter);
app.use("/billing", billingRouter);
}
if (applicationId === "IBIM" || applicationId === "ALL") {
	app.use("/ibim/public", ibimPublicRouter);
app.use("/ibim", ibimRouter);
}

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
	void reportUnhandledError(error, { requestId: res.locals.requestId, path: req.path, method: req.method });
	if (res.headersSent) return;
	res.status(500).json({ error: "Something went wrong. Please try again." });
});

export default app;
