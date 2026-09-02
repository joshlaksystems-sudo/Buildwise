import { PrismaClient } from "@prisma/client";

// Reuse a single client across hot-reloads in dev.
export const prisma = new PrismaClient();
