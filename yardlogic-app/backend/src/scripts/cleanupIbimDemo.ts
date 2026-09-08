import "dotenv/config";
import { prisma } from "../lib/prisma";

const businessId = process.env.IBIM_DEMO_BUSINESS_ID || "00000000-0000-0000-0000-000000000001";

async function main() {
  const members = await prisma.ibimMember.findMany({
    where: { businessId, externalRef: { startsWith: "DEMO-" } },
    orderBy: { externalRef: "asc" },
    take: 4,
    select: { id: true, externalRef: true },
  });
  const memberIds = members.map((member) => member.id);
  const policies = await prisma.ibimPolicy.findMany({ where: { businessId, memberId: { in: memberIds } }, select: { id: true } });
  const policyIds = policies.map((policy) => policy.id);
  await prisma.$transaction([
    prisma.ibimTransaction.deleteMany({ where: { businessId, policyId: { in: policyIds } } }),
    prisma.ibimWorkflowTask.deleteMany({ where: { businessId, OR: [{ memberId: { in: memberIds } }, { policyId: { in: policyIds } }] } }),
    prisma.ibimReconciliation.deleteMany({ where: { businessId, OR: [{ policyId: { in: policyIds } }, { externalRef: { in: members.map((member) => member.externalRef).filter((value): value is string => Boolean(value)) } }] } }),
    prisma.ibimPolicy.deleteMany({ where: { businessId, id: { in: policyIds } } }),
    prisma.ibimMember.deleteMany({ where: { businessId, id: { in: memberIds } } }),
  ]);
  console.log(`Removed ${members.length} seeded iBIM members and their policies from ${businessId}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
