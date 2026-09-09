import { PrismaClient } from "@prisma/client";

const schema = process.env.DATABASE_SCHEMA?.trim();
if (!schema || !/^[a-z_][a-z0-9_]*$/i.test(schema)) {
  throw new Error("DATABASE_SCHEMA must be a valid PostgreSQL schema name, such as yardlogic or ibim");
}

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    console.log(`Database schema ready: ${schema}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
