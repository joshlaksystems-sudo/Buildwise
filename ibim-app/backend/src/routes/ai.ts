import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { generateTeklaAssistantAnswer, vertexStatus } from "../services/vertex.js";

export const aiRouter = Router();
const aiRateLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

aiRouter.use(requireAuth, aiRateLimit);
aiRouter.get("/status", (_req, res) => res.json(vertexStatus()));

const assistantSchema = z.object({
  prompt: z.string().trim().min(3).max(8_000),
  teklaVersion: z.string().trim().min(1).max(40).default("Tekla 2024"),
});

aiRouter.post("/tekla-assistant", async (req: AuthenticatedRequest, res) => {
  const parsed = assistantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const answer = await generateTeklaAssistantAnswer(parsed.data);
    return res.json({ answer, provider: "vertex-ai", model: vertexStatus().model, location: vertexStatus().location });
  } catch (error) {
    const code = error instanceof Error ? error.message : "VERTEX_AI_ERROR";
    if (code === "VERTEX_AI_DISABLED") return res.status(503).json({ error: "Vertex AI is disabled" });
    if (code === "VERTEX_AI_TIMEOUT") return res.status(504).json({ error: "Vertex AI took too long to respond" });
    if (code === "VERTEX_AI_CREDENTIALS_INVALID" || code === "VERTEX_AI_PROJECT_NOT_CONFIGURED") return res.status(503).json({ error: "Vertex AI is not configured correctly" });
    console.error("IBim Vertex AI request failed", { code, userId: req.userId, organizationId: req.organizationId });
    return res.status(502).json({ error: "Vertex AI could not complete the request" });
  }
});
