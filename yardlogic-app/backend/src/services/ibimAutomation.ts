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
  const inSixWeeks = new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000);
  const prospectPolicies = await prisma.ibimPolicy.findMany({ where: { businessId, status: { in: ["ACTIVE", "BOUND"] }, renewalDate: { gt: now, lte: inSixWeeks } }, include: { member: true } });
  let prospecting = 0;
  for (const policy of prospectPolicies) {
    const runKey = `${policy.id}:${policy.renewalDate?.toISOString().slice(0, 10)}`;
    if (!await claimRun(businessId, "SIX_WEEK_PROSPECT", runKey)) continue;
    const existing = await prisma.ibimProposal.findFirst({ where: { businessId, memberId: policy.memberId, type: "RENEWAL", status: { notIn: ["DECLINED", "BOUND"] }, previousProposalId: { not: null } } });
    const proposal = existing || await prisma.ibimProposal.create({ data: { businessId, memberId: policy.memberId, type: "RENEWAL", status: "DRAFT", formVersion: "1", data: { source: "SIX_WEEK_RENEWAL_CAMPAIGN", policyNumber: policy.policyNumber, renewalDate: policy.renewalDate, requestedCover: "Confirm existing cover" }, effectiveDate: policy.renewalDate } });
    await prisma.ibimWorkflowTask.create({ data: { businessId, memberId: policy.memberId, proposalId: proposal.id, policyId: policy.id, type: "PROSPECTING", status: "OPEN", dueAt: now, note: `Six-week renewal campaign for ${policy.policyNumber}` } }).catch(() => undefined);
    if (policy.member?.email) {
      try {
        const messageId = await sendGmailEmail(policy.member.email, "Your renewal is approaching", "Your insurance renewal is approaching. Please review and return your renewal information.");
        await prisma.ibimEmailDelivery.create({ data: { businessId, memberId: policy.memberId, proposalId: proposal.id, recipient: policy.member.email, subject: "Your renewal is approaching", kind: "RENEWAL", status: messageId ? "SENT" : "FAILED", providerRef: messageId || undefined, error: messageId ? undefined : "Email provider is not configured" } });
      } catch (error) {
        await prisma.ibimEmailDelivery.create({ data: { businessId, memberId: policy.memberId, proposalId: proposal.id, recipient: policy.member.email, subject: "Your renewal is approaching", kind: "RENEWAL", status: "FAILED", error: error instanceof Error ? error.message : "Email send failed" } });
      }
    }
    prospecting += 1;
  }

  const inFourteenDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const renewalPolicies = await prisma.ibimPolicy.findMany({ where: { businessId, status: { in: ["ACTIVE", "BOUND"] }, renewalDate: { gt: now, lte: inFourteenDays } }, include: { member: true } });
  let renewalChases = 0;
  for (const policy of renewalPolicies) {
    const runKey = `${policy.id}:${now.toISOString().slice(0, 10)}`;
    if (!await claimRun(businessId, "FOURTEEN_DAY_RENEWAL_CHASE", runKey)) continue;
    const task = await prisma.ibimWorkflowTask.create({ data: { businessId, memberId: policy.memberId, policyId: policy.id, type: "CHASER", status: "OPEN", dueAt: now, note: `14-day renewal chase for ${policy.policyNumber}` } });
    if (policy.member?.email) {
      try {
        const messageId = await sendGmailEmail(policy.member.email, "Renewal information required", "Your renewal date is approaching. Please provide the outstanding renewal information.");
        await prisma.ibimEmailDelivery.create({ data: { businessId, memberId: policy.memberId, taskId: task.id, recipient: policy.member.email, subject: "Renewal information required", kind: "CHASER", status: messageId ? "SENT" : "FAILED", providerRef: messageId || undefined, error: messageId ? undefined : "Email provider is not configured" } });
      } catch (error) {
        await prisma.ibimEmailDelivery.create({ data: { businessId, memberId: policy.memberId, taskId: task.id, recipient: policy.member.email, subject: "Renewal information required", kind: "CHASER", status: "FAILED", error: error instanceof Error ? error.message : "Email send failed" } });
      }
    }
    renewalChases += 1;
  }
  return { prospecting, renewalChases };
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
