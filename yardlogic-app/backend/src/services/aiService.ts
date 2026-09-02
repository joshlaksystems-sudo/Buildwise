// Thin wrapper around the Anthropic API. Requires ANTHROPIC_API_KEY
// in the environment. Uses plain fetch so it has no extra dependency.

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

async function callClaude(system: string, userText: string) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((b: any) => b.type === "text")?.text ?? "";
  return text as string;
}

export interface ReceiptCategorization {
  category: string;
  amount: number;
  taxAmount: number;
  vendor?: string;
  confidence: number;
  reasoning: string;
}

export async function categorizeReceiptText(rawText: string): Promise<ReceiptCategorization> {
  const system = `You are an accounting classifier for a small Indian business. Given raw OCR text from a purchase receipt or bill, extract the total amount, the tax amount (GST if present), the vendor name if visible, and assign ONE expense category from this list: Inventory Purchase, Rent, Utilities, Salaries, Transport, Office Supplies, Marketing, Repairs, Other.

Respond ONLY with JSON, no preamble, no markdown fences, matching exactly:
{"category": string, "amount": number, "taxAmount": number, "vendor": string|null, "confidence": number between 0 and 1, "reasoning": short string}`;

  const raw = await callClaude(system, rawText);
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fail safe: never block the user's workflow because parsing failed —
    // fall back to an "Other" category they can correct manually.
    return { category: "Other", amount: 0, taxAmount: 0, confidence: 0, reasoning: "Could not parse receipt automatically." };
  }
}

export async function answerBusinessQuestion(
  question: string,
  data: { invoices: any[]; expenses: any[]; payments: any[]; gstFilings?: any[] }
): Promise<string> {
  const system = `You are a business assistant for a small Indian shop owner using their billing software. Answer the question using ONLY the JSON data provided, including GST return figures (GSTR-1/GSTR-3B) if present — you may summarize or explain them, but never claim to have filed or submitted a return; filing is a separate manual step outside this chat. Be concise — one to three sentences, plain language, use rupee amounts. If the data doesn't contain the answer, say so plainly instead of guessing.`;

  const userText = `Question: ${question}\n\nData:\n${JSON.stringify(data).slice(0, 12000)}`;
  return callClaude(system, userText);
}
