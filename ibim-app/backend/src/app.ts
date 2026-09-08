import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { authRouter } from "./routes/auth.js";
import { timeEntriesRouter } from "./routes/timeEntries.js";
import { aiRouter } from "./routes/ai.js";

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5175").split(",").map((origin) => origin.trim()).filter(Boolean);

app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)) }));
app.use(helmet());
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => res.json({ ok: true, service: "ibim-api", version: "0.1.0" }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "ibim-api" }));
app.use("/auth", authRouter);
app.use("/time-entries", timeEntriesRouter);
app.use("/ai", aiRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled IBim API error", error);
  if (!res.headersSent) res.status(500).json({ error: "Unexpected server error" });
});

export default app;
