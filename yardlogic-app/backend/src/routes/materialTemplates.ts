import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const materialTemplatesRouter = Router();
materialTemplatesRouter.use(requireAuth);

// Global starter templates (businessId null) + anything this
// business has cloned/created of its own.
materialTemplatesRouter.get("/", async (req: AuthedRequest, res) => {
  const templates = await prisma.materialTemplate.findMany({
    where: { OR: [{ businessId: null }, { businessId: req.businessId }] },
    orderBy: { name: "asc" },
  });
  res.json(templates);
});

// "Clone Nearest Template → Rename Fields → Adjust HSN/GST Rate →
// Ready" — exactly the workflow from the build doc, as one call.
const cloneSchema = z.object({
  sourceTemplateId: z.string(),
  name: z.string().min(1),
  unitOptions: z.array(z.string()).optional(),
  attributeSchema: z.array(z.record(z.any())).optional(),
  defaultHsnCode: z.string().optional(),
  defaultGstRate: z.number().optional(),
});

materialTemplatesRouter.post("/clone", async (req: AuthedRequest, res) => {
  const parsed = cloneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { sourceTemplateId, name, unitOptions, attributeSchema, defaultHsnCode, defaultGstRate } = parsed.data;

  const source = await prisma.materialTemplate.findFirst({
    where: { id: sourceTemplateId, OR: [{ businessId: null }, { businessId: req.businessId }] },
  });
  if (!source) return res.status(404).json({ error: "Source template not found" });

  const clone = await prisma.materialTemplate.create({
    data: {
      businessId: req.businessId!,
      name,
      unitOptions: (unitOptions ?? source.unitOptions) as any,
      attributeSchema: (attributeSchema ?? source.attributeSchema) as any,
      defaultHsnCode: defaultHsnCode ?? source.defaultHsnCode,
      defaultGstRate: defaultGstRate ?? source.defaultGstRate,
    },
  });

  await writeAudit({
    businessId: req.businessId!,
    userId: req.userId,
    action: "materialTemplate.clone",
    entityType: "MaterialTemplate",
    entityId: clone.id,
    detail: { clonedFrom: source.name },
  });

  res.status(201).json(clone);
});

const createSchema = z.object({
  name: z.string().min(1),
  unitOptions: z.array(z.string()).min(1),
  attributeSchema: z.array(z.record(z.any())).default([]),
  defaultHsnCode: z.string().optional(),
  defaultGstRate: z.number().optional(),
});

materialTemplatesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const template = await prisma.materialTemplate.create({
    data: { ...parsed.data, businessId: req.businessId! } as any,
  });
  res.status(201).json(template);
});
