import { PrismaClient } from "@prisma/client";

function databaseUrl() {
	const rawUrl = process.env.DATABASE_URL;
	const schema = process.env.DATABASE_SCHEMA?.trim();
	if (!rawUrl || !schema) return rawUrl;
	if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
		throw new Error("DATABASE_SCHEMA must contain only letters, numbers, and underscores");
	}
	const url = new URL(rawUrl);
	url.searchParams.set("schema", schema);
	return url.toString();
}

// Reuse a single client across hot-reloads in dev.
export const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
