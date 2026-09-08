import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

const email = process.env.IBIM_DEMO_EMAIL;
const password = process.env.IBIM_DEMO_PASSWORD;
if (!email || !password) throw new Error("Set IBIM_DEMO_EMAIL and IBIM_DEMO_PASSWORD before seeding demo data");
const demoEmail = email;
const demoPassword = password;

async function main() {
const passwordHash = await bcrypt.hash(demoPassword, 10);
const business = await prisma.business.upsert({
  where: { id: process.env.IBIM_DEMO_BUSINESS_ID || "00000000-0000-0000-0000-000000000001" },
  update: { applicationId: "IBIM", name: "iBIM Demo Workspace" },
  create: { id: process.env.IBIM_DEMO_BUSINESS_ID || "00000000-0000-0000-0000-000000000001", name: "iBIM Demo Workspace", applicationId: "IBIM" },
});
const user = await prisma.user.upsert({
  where: { email },
  update: { name: "iBIM Demo Owner", passwordHash },
  create: { name: "iBIM Demo Owner", email: demoEmail, passwordHash, emailVerifiedAt: new Date() },
});
await prisma.userBusiness.upsert({
  where: { userId_businessId: { userId: user.id, businessId: business.id } },
  update: { role: "OWNER" },
  create: { userId: user.id, businessId: business.id, role: "OWNER" },
});

const members = await Promise.all([
  prisma.ibimMember.upsert({ where: { id: "00000000-0000-0000-0000-000000000101" }, update: {}, create: { id: "00000000-0000-0000-0000-000000000101", businessId: business.id, legalName: "Northbridge Trade Association", tradingName: "Northbridge", email: "northbridge.demo@example.com", externalRef: "DEMO-001", status: "ACTIVE", source: "MANUAL" } }),
  prisma.ibimMember.upsert({ where: { id: "00000000-0000-0000-0000-000000000102" }, update: {}, create: { id: "00000000-0000-0000-0000-000000000102", businessId: business.id, legalName: "Harbour Engineering Group", tradingName: "Harbour Engineering", email: "harbour.demo@example.com", externalRef: "DEMO-002", status: "ACTIVE", source: "IMPORT" } }),
]);
await prisma.ibimPolicy.upsert({ where: { businessId_policyNumber: { businessId: business.id, policyNumber: "DEMO-POL-30" } }, update: { renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, create: { businessId: business.id, memberId: members[0].id, policyNumber: "DEMO-POL-30", insurerName: "Demo Mutual Insurers", status: "ACTIVE", renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), premium: 12500, commission: 1250 } });
await prisma.ibimPolicy.upsert({ where: { businessId_policyNumber: { businessId: business.id, policyNumber: "DEMO-POL-OVERDUE" } }, update: { renewalDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }, create: { businessId: business.id, memberId: members[1].id, policyNumber: "DEMO-POL-OVERDUE", insurerName: "Demo Mutual Insurers", status: "ACTIVE", renewalDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), premium: 9800, commission: 980 } });
console.log(`Seeded iBIM demo workspace ${business.id} for ${demoEmail}`);
await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
