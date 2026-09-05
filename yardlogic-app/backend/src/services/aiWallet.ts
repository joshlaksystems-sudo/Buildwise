import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export class AICreditExhaustedError extends Error {
  constructor(public readonly balance: number, public readonly required: number) {
    super("AI wallet balance is too low. Recharge the business AI wallet to continue.");
  }
}

const costs: Record<string, number> = {
  ask: Number(process.env.AI_COST_ASK || "1"),
  categorizeExpense: Number(process.env.AI_COST_CATEGORIZE_EXPENSE || "2"),
  generateReport: Number(process.env.AI_COST_GENERATE_REPORT || "5"),
  invoiceInsights: Number(process.env.AI_COST_INVOICE_INSIGHTS || "2"),
  extractPurchaseBill: Number(process.env.AI_COST_EXTRACT_PURCHASE_BILL || "3"),
};
const dailyFreeTokens = Number(process.env.AI_DAILY_FREE_TOKENS || "10");
const dailyFreeChats = Number(process.env.AI_DAILY_FREE_CHATS || "5");

export function aiOperationCost(operation: string) {
  const cost = costs[operation];
  if (!Number.isFinite(cost) || cost <= 0) throw new Error(`Invalid AI cost configured for ${operation}`);
  return cost;
}

export async function getAIWallet(businessId: string) {
  return prisma.aIWallet.upsert({
    where: { businessId },
    create: { businessId, balance: 0 },
    update: {},
  });
}

export async function chargeAICredit(businessId: string, userId: string, operation: string) {
  const cost = aiOperationCost(operation);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const usage = await prisma.aIDailyUsage.upsert({
    where: { userId_businessId_usageDate: { userId, businessId, usageDate: today } },
    create: { userId, businessId, usageDate: today },
    update: {},
  });
  const freeUpdated = await prisma.aIDailyUsage.updateMany({
    where: {
      id: usage.id,
      freeTokensUsed: { lte: dailyFreeTokens - cost },
      freeChatsUsed: { lt: dailyFreeChats },
    },
    data: { freeTokensUsed: { increment: cost }, freeChatsUsed: { increment: 1 } },
  });
  if (freeUpdated.count === 1) {
    await prisma.aIWalletTransaction.create({
      data: { businessId, walletId: (await getAIWallet(businessId)).id, amount: new Prisma.Decimal(cost), type: "FREE_DEBIT", operation },
    });
    return { amount: cost, source: "free" as const };
  }

  const wallet = await getAIWallet(businessId);
  const updated = await prisma.aIWallet.updateMany({
    where: { businessId, balance: { gte: new Prisma.Decimal(cost) } },
    data: { balance: { decrement: new Prisma.Decimal(cost) } },
  });

  if (updated.count !== 1) {
    throw new AICreditExhaustedError(Number(wallet.balance), cost);
  }

  await prisma.aIWalletTransaction.create({
    data: { businessId, walletId: wallet.id, amount: new Prisma.Decimal(cost), type: "DEBIT", operation },
  });
  return { amount: cost, source: "wallet" as const };
}

export async function refundAICredit(businessId: string, userId: string, operation: string, amount: number, source: "free" | "wallet") {
  const wallet = await getAIWallet(businessId);
  if (source === "free") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.aIDailyUsage.update({
      where: { userId_businessId_usageDate: { userId, businessId, usageDate: today } },
      data: { freeTokensUsed: { decrement: amount }, freeChatsUsed: { decrement: 1 } },
    });
  }
  await prisma.$transaction([
    ...(source === "wallet" ? [prisma.aIWallet.update({ where: { businessId }, data: { balance: { increment: new Prisma.Decimal(amount) } } })] : []),
    prisma.aIWalletTransaction.create({
      data: { businessId, walletId: wallet.id, amount: new Prisma.Decimal(amount), type: "REFUND", operation },
    }),
  ]);
}

export async function withAICredit<T>(businessId: string, userId: string, operation: string, work: () => Promise<T>) {
  const charge = await chargeAICredit(businessId, userId, operation);
  try {
    return await work();
  } catch (error) {
    await refundAICredit(businessId, userId, operation, charge.amount, charge.source);
    throw error;
  }
}