import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { ibimPrisma?: PrismaClient };

export const prisma = globalForPrisma.ibimPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.ibimPrisma = prisma;
