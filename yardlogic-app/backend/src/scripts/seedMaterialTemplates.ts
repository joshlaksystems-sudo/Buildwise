import { prisma } from "../lib/prisma";
import { STARTER_TEMPLATES } from "../services/materialTemplateSeeds";

async function main() {
  for (const t of STARTER_TEMPLATES) {
    const existing = await prisma.materialTemplate.findFirst({ where: { businessId: null, name: t.name } });
    if (existing) {
      console.log(`Skipping "${t.name}" — already seeded`);
      continue;
    }
    await prisma.materialTemplate.create({ data: { ...t, businessId: null } as any });
    console.log(`Seeded template: ${t.name}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    prisma.$disconnect();
    process.exit(1);
  });
