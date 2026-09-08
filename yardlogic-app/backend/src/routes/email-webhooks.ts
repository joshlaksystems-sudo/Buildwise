import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";

export const emailWebhooksRouter = Router();

// ============================================================
// Email Webhook Handlers for Razormail, SendGrid, Mailgun
// ============================================================

// Razormail webhook: https://docs.razormail.com/webhooks
// POST /webhooks/email/razormail
emailWebhooksRouter.post("/email/razormail", async (req: Request, res: Response) => {
  try {
    const secret = process.env.RAZORMAIL_WEBHOOK_SECRET;
    if (!secret) {
      console.warn("Razormail webhook received but RAZORMAIL_WEBHOOK_SECRET not configured");
      return res.status(400).json({ error: "Razormail webhook not configured" });
    }

    // Razormail sends signature in X-Razormail-Signature header
    const signature = req.header("X-Razormail-Signature");
    if (!signature) {
      return res.status(401).json({ error: "Missing signature" });
    }

    // Verify signature
    const raw = JSON.stringify(req.body || {});
    const expected = crypto
      .createHmac("sha256", secret)
      .update(raw)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      console.warn("Invalid Razormail webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload = req.body as any;
    const eventType = payload.event; // bounce, delivery, open, click, complaint, send
    const messageId = payload.message_id || payload.messageId;
    const recipient = payload.recipient || payload.email;

    if (!messageId) {
      console.warn("Razormail webhook missing message_id");
      return res.status(400).json({ error: "Missing message_id" });
    }

    // Find matching email delivery by provider reference
    const delivery = await prisma.ibimEmailDelivery.findFirst({
      where: { providerRef: messageId },
    });

    if (!delivery) {
      console.warn(`Razormail webhook: no delivery found for message_id ${messageId}`);
      return res.json({ accepted: true, message: "No matching delivery" });
    }

    // Map Razormail events to our status
    let status = delivery.status;
    let deliveredAt = delivery.deliveredAt;
    let error = delivery.error;

    switch (eventType) {
      case "send":
        status = "SENT";
        break;
      case "delivery":
        status = "DELIVERED";
        deliveredAt = new Date(payload.timestamp * 1000 || Date.now());
        break;
      case "bounce":
      case "complaint":
        status = "BOUNCED";
        error = payload.bounce_type || payload.reason || "Bounced";
        break;
      case "open":
      case "click":
        // Update status only if not already bounced/failed
        if (status === "SENT" || status === "DELIVERED") {
          status = "DELIVERED";
          if (!deliveredAt) {
            deliveredAt = new Date(payload.timestamp * 1000 || Date.now());
          }
        }
        break;
    }

    // Store webhook event
    await prisma.ibimEmailWebhookEvent.create({
      data: {
        deliveryId: delivery.id,
        provider: "razormail",
        eventType,
        recipient: recipient || delivery.recipient,
        payload: req.body,
        processedAt: new Date(),
      },
    });

    // Update delivery with new status
    await prisma.ibimEmailDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        deliveredAt,
        error,
      },
    });

    console.log(
      `Razormail webhook processed: ${messageId} -> ${eventType} -> ${status}`
    );
    res.json({ accepted: true, status });
  } catch (error) {
    console.error("Error processing Razormail webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// SendGrid webhook: https://docs.sendgrid.com/for-developers/tracking-events/event
// POST /webhooks/email/sendgrid
emailWebhooksRouter.post("/email/sendgrid", async (req: Request, res: Response) => {
  try {
    const secret = process.env.SENDGRID_WEBHOOK_SECRET;
    if (!secret) {
      console.warn(
        "SendGrid webhook received but SENDGRID_WEBHOOK_SECRET not configured"
      );
      return res.status(400).json({ error: "SendGrid webhook not configured" });
    }

    // SendGrid sends signature in X-Twilio-Email-Event-Webhook-Signature header
    const signature = req.header("X-Twilio-Email-Event-Webhook-Signature");
    if (!signature) {
      return res.status(401).json({ error: "Missing signature" });
    }

    // Verify signature (SendGrid uses different format)
    const raw = JSON.stringify(req.body || {});
    const timestamp = req.header("X-Twilio-Email-Event-Webhook-Timestamp");
    if (!timestamp) {
      return res.status(401).json({ error: "Missing timestamp" });
    }

    const toSign = timestamp + raw;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(toSign)
      .digest("base64");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      console.warn("Invalid SendGrid webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    // SendGrid sends an array of events
    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const event of events) {
      const eventType = event.event; // processed, dropped, delivered, deferred, bounce, open, click, etc.
      const messageId = event.sg_message_id;
      const email = event.email;

      if (!messageId) {
        console.warn("SendGrid webhook missing sg_message_id");
        continue;
      }

      // Find matching email delivery
      const delivery = await prisma.ibimEmailDelivery.findFirst({
        where: { providerRef: messageId },
      });

      if (!delivery) {
        console.warn(
          `SendGrid webhook: no delivery found for message_id ${messageId}`
        );
        continue;
      }

      // Map SendGrid events to our status
      let status = delivery.status;
      let deliveredAt = delivery.deliveredAt;
      let error = delivery.error;

      switch (eventType) {
        case "processed":
          status = "SENT";
          break;
        case "delivered":
          status = "DELIVERED";
          deliveredAt = new Date((event.timestamp || Date.now() / 1000) * 1000);
          break;
        case "bounce":
          status = "BOUNCED";
          error = event.reason || event.bounce_type || "Bounced";
          break;
        case "dropped":
        case "deferred":
          status = "FAILED";
          error = event.reason || event.smtp_code || "Dropped/deferred";
          break;
        case "open":
        case "click":
          // Update only if not already failed
          if (status === "SENT" || status === "DELIVERED") {
            status = "DELIVERED";
            if (!deliveredAt) {
              deliveredAt = new Date((event.timestamp || Date.now() / 1000) * 1000);
            }
          }
          break;
      }

      // Store webhook event
      await prisma.ibimEmailWebhookEvent.create({
        data: {
          deliveryId: delivery.id,
          provider: "sendgrid",
          eventType,
          recipient: email || delivery.recipient,
          payload: event,
          processedAt: new Date(),
        },
      });

      // Update delivery
      await prisma.ibimEmailDelivery.update({
        where: { id: delivery.id },
        data: {
          status,
          deliveredAt,
          error,
        },
      });

      console.log(
        `SendGrid webhook processed: ${messageId} -> ${eventType} -> ${status}`
      );
    }

    res.json({ accepted: true, processed: events.length });
  } catch (error) {
    console.error("Error processing SendGrid webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mailgun webhook: https://documentation.mailgun.com/docs/mailgun/webhooks/
// POST /webhooks/email/mailgun
emailWebhooksRouter.post("/email/mailgun", async (req: Request, res: Response) => {
  try {
    const secret = process.env.MAILGUN_WEBHOOK_SECRET;
    if (!secret) {
      console.warn("Mailgun webhook received but MAILGUN_WEBHOOK_SECRET not configured");
      return res.status(400).json({ error: "Mailgun webhook not configured" });
    }

    // Mailgun sends signature in form data
    const timestamp = req.body.timestamp as string;
    const token = req.body.token as string;
    const signature = req.body.signature as string;

    if (!timestamp || !token || !signature) {
      return res.status(401).json({ error: "Missing signature components" });
    }

    // Verify Mailgun signature
    const toSign = `${timestamp}${token}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(toSign)
      .digest("hex");

    if (signature !== expected) {
      console.warn("Invalid Mailgun webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Parse Mailgun event
    const eventData = req.body["event-data"];
    if (!eventData) {
      return res.status(400).json({ error: "Missing event data" });
    }

    const eventType = eventData.event; // delivered, failed, opened, clicked, etc.
    const messageId = eventData.message?.headers?.["message-id"] || eventData.id;
    const recipient = eventData.recipient;

    if (!messageId) {
      console.warn("Mailgun webhook missing message-id");
      return res.status(400).json({ error: "Missing message-id" });
    }

    // Find delivery
    const delivery = await prisma.ibimEmailDelivery.findFirst({
      where: { providerRef: messageId },
    });

    if (!delivery) {
      console.warn(
        `Mailgun webhook: no delivery found for message_id ${messageId}`
      );
      return res.json({ accepted: true, message: "No matching delivery" });
    }

    // Map Mailgun events
    let status = delivery.status;
    let deliveredAt = delivery.deliveredAt;
    let error = delivery.error;

    switch (eventType) {
      case "delivered":
        status = "DELIVERED";
        deliveredAt = new Date(eventData.timestamp * 1000);
        break;
      case "failed":
        status = "BOUNCED";
        error =
          eventData.delivery?.message ||
          eventData.failure?.reason ||
          "Failed";
        break;
      case "opened":
      case "clicked":
        if (status === "SENT" || status === "DELIVERED") {
          status = "DELIVERED";
          if (!deliveredAt) {
            deliveredAt = new Date(eventData.timestamp * 1000);
          }
        }
        break;
    }

    // Store webhook event
    await prisma.ibimEmailWebhookEvent.create({
      data: {
        deliveryId: delivery.id,
        provider: "mailgun",
        eventType,
        recipient: recipient || delivery.recipient,
        payload: req.body,
        processedAt: new Date(),
      },
    });

    // Update delivery
    await prisma.ibimEmailDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        deliveredAt,
        error,
      },
    });

    console.log(
      `Mailgun webhook processed: ${messageId} -> ${eventType} -> ${status}`
    );
    res.json({ accepted: true, status });
  } catch (error) {
    console.error("Error processing Mailgun webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET endpoint to check delivery status
emailWebhooksRouter.get(
  "/email-deliveries/:deliveryId",
  async (req: Request, res: Response) => {
    try {
      const delivery = await prisma.ibimEmailDelivery.findUnique({
        where: { id: req.params.deliveryId },
      });

      if (!delivery) {
        return res.status(404).json({ error: "Delivery not found" });
      }

      const events = await prisma.ibimEmailWebhookEvent.findMany({
        where: { deliveryId: delivery.id },
        orderBy: { processedAt: "desc" },
        take: 10,
      });

      res.json({
        delivery: {
          id: delivery.id,
          recipient: delivery.recipient,
          subject: delivery.subject,
          status: delivery.status,
          sentAt: delivery.sentAt,
          deliveredAt: delivery.deliveredAt,
          error: delivery.error,
          provider: delivery.providerRef ? "configured" : "none",
        },
        events,
      });
    } catch (error) {
      console.error("Error fetching delivery status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
