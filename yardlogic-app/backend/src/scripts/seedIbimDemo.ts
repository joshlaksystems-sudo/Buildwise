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

const count = Number(process.env.IBIM_DEMO_RECORD_COUNT || 100);
const members = [];
for (let index = 1; index <= count; index += 1) {
  const suffix = String(index).padStart(3, "0");
  const id = `00000000-0000-0000-0000-000000000${String(100 + index).padStart(3, "0")}`;
  const member = await prisma.ibimMember.upsert({
    where: { id },
    update: { businessId: business.id, legalName: `Demo Member ${suffix}`, email: `member-${suffix}.demo@example.com`, externalRef: `DEMO-${suffix}`, status: "ACTIVE", source: "IMPORT" },
    create: { id, businessId: business.id, legalName: `Demo Member ${suffix}`, tradingName: `Demo Trade ${suffix}`, email: `member-${suffix}.demo@example.com`, externalRef: `DEMO-${suffix}`, status: "ACTIVE", source: "IMPORT" },
  });
  members.push(member);
  const renewalDate = index === 1 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : index === 2 ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) : new Date(Date.now() + ((index % 90) + 1) * 24 * 60 * 60 * 1000);
  await prisma.ibimPolicy.upsert({
    where: { businessId_policyNumber: { businessId: business.id, policyNumber: `DEMO-POL-${suffix}` } },
    update: { memberId: member.id, renewalDate },
    create: { businessId: business.id, memberId: member.id, policyNumber: `DEMO-POL-${suffix}`, insurerName: index % 2 ? "Demo Mutual Insurers" : "Northstar Underwriting", status: "ACTIVE", renewalDate, premium: 5000 + index * 100, commission: 500 + index * 10 },
  });
}
console.log(`Seeded ${members.length} iBIM demo members and policies in workspace ${business.id} for ${demoEmail}`);
await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
