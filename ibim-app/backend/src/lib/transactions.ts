import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const MAX_RETRIES = 3;

export async function serializableTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === MAX_RETRIES) throw error;
    }
  }
  throw new Error("Serializable transaction failed after retries");
}