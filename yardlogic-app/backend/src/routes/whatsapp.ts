import { Router } from "express";

export const whatsappRouter = Router();

// Meta calls this endpoint once when registering the webhook.
whatsappRouter.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_WHATSAPP_VERIFY_TOKEN && typeof challenge === "string") {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Meta sends incoming messages and delivery events here.
whatsappRouter.post("/webhook/whatsapp", (req, res) => {
  const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
  console.log("WhatsApp webhook received", { entries: entries.length });
  return res.sendStatus(200);
});
