// PII redaction — for long-term storage boundaries (mem0) only.
// Working-memory context (in-session model calls) may contain PII: intentional.
//
// Primary path: POST /redact-batch to the Presidio + spaCy NER service (proper name detection).
// Fallback: in-process regex for structured entities only — no PERSON detection (too many
//           false positives on city/country/product names with regex alone).

const PII_SERVICE_URL = (process.env.PII_SERVICE_URL ?? "http://localhost:8010").replace(/\/$/, "");

const PATTERNS: Array<{ type: string; re: RegExp }> = [
  { type: "EMAIL_ADDRESS",  re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
  { type: "US_SSN",         re: /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g },
  { type: "CREDIT_CARD",    re: /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g },
  // AMEX: 15-digit starting with 34 or 37 (not matched by the 16-digit pattern above)
  { type: "CREDIT_CARD",    re: /(?<!\d)3[47]\d{13}(?!\d)/g },
  { type: "IP_ADDRESS",     re: /(?<!\d)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?!\d)/g },
  { type: "IN_PAN",         re: /(?<![A-Za-z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Za-z0-9])/g },
  { type: "IN_AADHAAR",     re: /(?<![\d.])\d{4}\s\d{4}\s\d{4}(?![\d.])/g },
  { type: "IN_MOBILE",      re: /(?<![\d.])(?:\+?91[\s-]?)?[6-9]\d{9}(?![\d.])/g },
  { type: "IN_MOBILE_SPLIT",re: /(?<![\d.])[6-9]\d{4}[\s-]\d{5}(?![\d.])/g },
  { type: "US_PHONE",       re: /(?<!\d)\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?!\d)/g },
  { type: "PASSPORT",       re: /(?<![A-Za-z0-9])[A-Z]\d{7}(?![A-Za-z0-9])/g },
  { type: "PHONE_GROUPED",  re: /(?<![\d.])(?:\+\d{1,3}[\s-])?\(?\d{2,5}\)?[\s-]\d{3,5}[\s-]\d{4}(?![\d.])/g },
  // Compact IBAN (no spaces): e.g. DE89370400440532013000
  { type: "IBAN_CODE",      re: /(?<![A-Za-z0-9])[A-Z]{2}\d{2}[A-Z0-9]{11,30}(?![A-Za-z0-9])/g },
  // PERSON intentionally omitted: regex fires on "New York", "Open Source", etc.
  // The HTTP service uses spaCy NER which understands context correctly.
];

export class PiiUnavailableError extends Error {
  constructor() {
    super("Privacy filter unavailable");
  }
}

function redactRegex(texts: string[]): string[] {
  return texts.map((t) => {
    if (!t) return t;
    let out = t;
    for (const { type, re } of PATTERNS) {
      out = out.replace(re, `<${type}>`);
    }
    return out;
  });
}

/** Redact PII from texts. Use before writing to long-term storage (mem0).
 *  Tries the Presidio HTTP service (full NER including names); falls back to
 *  in-process regex for structured entities only. */
export async function redactTexts(texts: string[]): Promise<string[]> {
  try {
    const res = await fetch(`${PII_SERVICE_URL}/redact-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      return (await res.json() as { texts: string[] }).texts;
    }
  } catch {
    // pii-service unavailable — fall back to regex (no name detection)
  }
  return redactRegex(texts);
}
