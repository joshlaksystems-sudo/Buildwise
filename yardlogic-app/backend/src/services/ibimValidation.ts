import { z } from "zod";

export const memberSchema = z.object({
  externalRef: z.string().trim().max(120).optional(),
  legalName: z.string().trim().min(2).max(180),
  tradingName: z.string().trim().max(180).optional(),
  contactName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
});

export const proposalDataSchema = z.object({
  businessDescription: z.string().trim().min(2).max(2_000),
  tradeAssociation: z.string().trim().min(2).max(180),
  annualTurnover: z.number().nonnegative().finite(),
  employeeCount: z.number().int().nonnegative().max(1_000_000),
  requestedCover: z.string().trim().min(2).max(500),
});

export const proposalStatuses = [
  "DRAFT", "SUBMITTED", "PROPOSAL_RECEIVED", "IN_REVIEW", "AWAITING_UNDERWRITING",
  "QUOTE_APPROVED", "QUOTE_PREPARED", "QUOTE_SENT", "QUOTED", "ACCEPTED", "BOUND",
  "DECLINED", "RENEWAL_OVERDUE", "LAPSED",
] as const;

const proposalTransitions: Record<string, readonly string[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["PROPOSAL_RECEIVED", "IN_REVIEW", "DRAFT", "DECLINED"],
  PROPOSAL_RECEIVED: ["IN_REVIEW", "DRAFT", "DECLINED"],
  IN_REVIEW: ["AWAITING_UNDERWRITING", "DRAFT", "DECLINED"],
  AWAITING_UNDERWRITING: ["QUOTE_APPROVED", "DRAFT", "DECLINED"],
  QUOTE_APPROVED: ["QUOTE_PREPARED", "DRAFT", "DECLINED"],
  QUOTE_PREPARED: ["QUOTE_SENT", "DRAFT", "DECLINED"],
  QUOTE_SENT: ["QUOTED", "ACCEPTED", "DRAFT", "DECLINED"],
  QUOTED: ["ACCEPTED", "DRAFT", "DECLINED"],
  ACCEPTED: ["BOUND", "DECLINED"],
  RENEWAL_OVERDUE: ["PROPOSAL_RECEIVED", "LAPSED", "DECLINED"],
  DECLINED: [],
  BOUND: [],
  LAPSED: [],
};

export function canTransitionProposalStatus(current: string, next: string) {
  return current === next || proposalTransitions[current]?.includes(next) === true;
}

export function parseCsvRows(csv: string): Record<string, string>[] {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { values.push(value.trim()); value = ""; continue; }
    value += character;
  }
  values.push(value.trim());
  return values;
}

export function normalizeImportedMember(row: Record<string, string>) {
  return memberSchema.safeParse({
    externalRef: row.externalRef || row.external_ref || undefined,
    legalName: row.legalName || row.legal_name || row.name,
    tradingName: row.tradingName || row.trading_name || undefined,
    contactName: row.contactName || row.contact_name || undefined,
    email: row.email || undefined,
    phone: row.phone || undefined,
    address: row.address || undefined,
  });
}
