import { prisma } from "../lib/prisma";
import { sendGmailEmail } from "./notifyService";

async function claimRun(businessId: string, jobType: string, runKey: string) {
  try {
    await prisma.ibimAutomationRun.create({ data: { businessId, jobType, runKey } });
    return true;
  } catch (error: any) {
    if (error?.code === "P2002") return false;
    throw error;
  }
}

export async function runIbimAutomationForBusiness(businessId: string, now = new Date()) {
  const policies = await prisma.ibimPolicy.findMany({ where: { businessId, status: { in: ["ACTIVE", "BOUND"] }, renewalDate: { not: null } }, include: { member: true } });
  const cadence = new Map([[42, "INITIAL_RENEWAL"], [28, "RENEWAL_REMINDER_1"], [14, "RENEWAL_REMINDER_2"], [7, "FINAL_RENEWAL_REMINDER"], [-1, "OVERDUE_DAY_1"], [-7, "OVERDUE_DAY_7"], [-14, "OVERDUE_DAY_14"], [-21, "OVERDUE_DAY_21"]]);
  let campaignActions = 0;
  for (const policy of policies) {
    const renewalDate = policy.renewalDate!;
    const daysUntil = Math.round((renewalDate.getTime() - now.getTime()) / 86400000);
    const campaignType = [...cadence.entries()].find(([day]) => Math.abs(daysUntil - day) <= 0)?.[1];
    if (!campaignType) continue;
    const runKey = `${policy.id}:${renewalDate.toISOString().slice(0, 10)}:${campaignType}`;
    if (!await claimRun(businessId, campaignType, runKey)) continue;
    const prospect = await prisma.ibimProspect.upsert({ where: { businessId_companyName_renewalDate: { businessId, companyName: policy.member?.legalName || policy.policyNumber, renewalDate } }, update: { memberId: policy.memberId, policyId: policy.id, email: policy.member?.email, status: campaignType === "INITIAL_RENEWAL" ? "FLAGGED" : undefined }, create: { businessId, memberId: policy.memberId, policyId: policy.id, companyName: policy.member?.legalName || policy.policyNumber, email: policy.member?.email || undefined, renewalDate, source: "RENEWAL_POLICY" } });
    const taskType = daysUntil > 0 ? "PROSPECTING" : "CHASER";
    const task = await prisma.ibimWorkflowTask.create({ data: { businessId, memberId: policy.memberId, policyId: policy.id, type: taskType, status: "OPEN", dueAt: now, note: `${campaignType} for ${policy.policyNumber}` } });
    if (policy.member?.email) {
      const subject = daysUntil > 0 ? "Your renewal is approaching" : "Renewal information is overdue";
      const message = daysUntil > 0 ? "Please review and return your renewal information." : "Please provide the outstanding renewal information as soon as possible.";
      try {
        const messageId = await sendGmailEmail(policy.member.email, subject, message);
        await prisma.ibimEmailDelivery.create({ data: { businessId, memberId: policy.memberId, taskId: task.id, recipient: policy.member.email, subject, kind: daysUntil > 0 ? "RENEWAL" : "CHASER", status: messageId ? "SENT" : "FAILED", providerRef: messageId || undefined, error: messageId ? undefined : "Email provider is not configured" } });
      } catch (error) {
        await prisma.ibimEmailDelivery.create({ data: { businessId, memberId: policy.memberId, taskId: task.id, recipient: policy.member.email, subject, kind: "CHASER", status: "FAILED", error: error instanceof Error ? error.message : "Email send failed" } });
      }
    }
    await prisma.ibimProspect.update({ where: { id: prospect.id }, data: { status: "CONTACTED", lastContactedAt: now } });
    campaignActions += 1;
  }
  const boundPolicies = await prisma.ibimPolicy.findMany({ where: { businessId, status: "BOUND", premium: { not: null } }, select: { id: true, memberId: true, premium: true, renewalDate: true } });
  for (const policy of boundPolicies) {
    const existing = await prisma.ibimPayment.findFirst({ where: { businessId, policyId: policy.id, status: { not: "CANCELLED" } } });
    if (!existing) await prisma.ibimPayment.create({ data: { businessId, memberId: policy.memberId, policyId: policy.id, amountDue: policy.premium!, dueDate: new Date() } });
  }
  return { campaignActions, paymentsCreated: boundPolicies.length };
}

export async function runIbimAutomationForAllBusinesses() {
  const businesses = await prisma.business.findMany({ where: { applicationId: { in: ["IBIM", "UNASSIGNED"] } }, select: { id: true } });
  const results = [];
  for (const business of businesses) results.push(await runIbimAutomationForBusiness(business.id));
  return { businesses: businesses.length, results };
}

export function startIbimAutomationScheduler(intervalMs = 60 * 60 * 1000) {
  setTimeout(() => void runIbimAutomationForAllBusinesses().catch((error) => console.error("iBIM automation failed:", error)), 15_000);
  setInterval(() => void runIbimAutomationForAllBusinesses().catch((error) => console.error("iBIM automation failed:", error)), intervalMs);
}
