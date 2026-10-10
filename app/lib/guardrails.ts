import type { RouteDecision } from "@/lib/router";

export const CONTACT_URL =
  process.env.CONTACT_URL ?? "https://www.etplautomation.com/contact.html";

export const CANNED = {
  injection:
    "I can't change my rules or share internal instructions. I'm happy to help with EarthTekniks products, optics calculations or machine-vision questions though.",
  offTopic:
    "I can only help with EarthTekniks products, machine vision, optics, inspection and automation. Is there something along those lines I can help with?",
  piiDown:
    "The privacy filter is temporarily unavailable, so I can't process messages right now. Please try again in a moment.",
  catalogDown:
    `The live product catalog is temporarily unavailable, so I can't confirm lens models or specifications right now. Please try again later or contact EarthTekniks at ${CONTACT_URL}.`,
};

// Thresholds are tunable; OpenJEV confidence is a signal, not a guarantee.
export const T = {
  ambiguous: Number(process.env.GUARDRAIL_T_AMBIGUOUS ?? 0.7),
  injection: Number(process.env.GUARDRAIL_T_INJECTION ?? 0.8),
  offTopic: Number(process.env.GUARDRAIL_T_OFFTOPIC ?? 0.85),
};

// Deterministic backstop that does not depend on the router being up.
const INJECTION_RE =
  /(ignore|disregard|forget)\s+(all\s+|the\s+|your\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompt)|reveal\s+(your\s+|the\s+)?(system\s+)?(prompt|instructions)|print\s+(your\s+)?system\s+prompt/i;

export function blockReason(text: string, r: RouteDecision | null): "injection" | "off_topic" | null {
  if (INJECTION_RE.test(text) || (r && r.injection >= T.injection)) {
    return "injection";
  }
  if (r && r.intent === "off_topic" && r.intentConfidence >= T.offTopic && (r.relevant === undefined || r.relevant <= 0.2)) {
    return "off_topic";
  }
  return null;
}

/** System-prompt hints derived from the routing decision (never block by themselves). */
export function routeHints(r: RouteDecision | null): string {
  if (!r) {
    return "";
  }
  const h: string[] = [];
  const needsDetail = ["catalog_lookup", "calculation", "chain"].includes(r.intent);
  if (r.intent === "greeting") {
    h.push("This is a greeting. Respond naturally. Do NOT call any tools.");
  } else if (r.intent === "company_info") {
    h.push(
      "This is a company question. Use search_knowledge_base before answering and ground your answer in its results."
    );
  } else if (r.intent === "price_quote") {
    h.push(`This is a price/quote request. Do not state any amount; direct the customer to ${CONTACT_URL}.`);
  } else if (needsDetail && r.ambiguous >= T.ambiguous) {
    h.push(
      "The latest request is underspecified. Read the selected skill and relevant calculator or catalog guidance to identify missing inputs, then ask one short clarifying question. Do not guess values or select products yet."
    );
  } else if (r.intent === "calculation") {
    h.push(
      "This is an optics calculation request. Use search_calculator, then get_calculator to read its actual required inputs. Ask for any missing required values without guessing. Once every required value is supplied, call proposeCalculation with all fields prefilled and wait for approval. Do not search unrelated company documents to choose a formula."
    );
  } else if (r.intent === "catalog_lookup") {
    h.push(
      "This is a product/catalog question. Use search_knowledge or lookup_model to identify the catalog table, then describe_table and search_products/get_product. The company knowledge base is not the product catalog."
    );
  } else if (r.intent === "chain") {
    h.push(
      "This is a multi-step request. Call createPlan FIRST with the ordered steps (knowledge, calculation inputs, calculation, catalog narrowing). If a calculation input cannot be obtained, say so explicitly."
    );
  }
  return h.join("\n");
}

const CURRENCY_RE = /(?:[$€£₹]\s?\d[\d,]*(?:\.\d+)?|\b(?:USD|INR|EUR|GBP|Rs\.?)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:USD|INR|EUR|GBP|rupees|dollars)\b)/gi;
const HOLD_RE = /^(?:USD|INR|EUR|GBP|Rs\.?|[$€£₹])$/i;

export function maskPrices(text: string) {
  return text.replace(CURRENCY_RE, "[price not shown]");
}

/**
 * Stream transform masking currency amounts in text deltas.
 * Words are buffered until whitespace; a trailing currency code/symbol is held
 * back so "USD" + " 500" cannot slip through split.
 * ponytail: an amount split inside a single word could slip through. Upgrade:
 * validate the finished message server-side.
 */
type Chunk = { type: string; id?: string; text?: string };

// Strip Nemotron chain-of-thought blocks that appear as plain text:
//   "Thought for N seconds\n...\nThus answer:" or "\nThus answer:"
// Everything up to and including the marker (inclusive) is dropped.
const THINKING_END_RE = /^[\s\S]*?(?:<\/think>|<\/tool_call>|thus,? answer:)\s*/i;
// Leading "Thought for N seconds\n" header that sometimes appears alone
const THINKING_HEADER_RE = /^(?:\s*<think>|\s*<tool_call>|\s*\[?\s*\{\s*"(?:name|tool|function)"\s*:|\s*Thought for \d+ seconds?|\s*Here'?s (?:a |the )?thinking process)/i;

export function stripThinkingTransform() {
  return () => {
    const buf = new Map<string, string>();
    const done = new Set<string>();
    const hidden = new Set<string>();
    return new TransformStream<Chunk, Chunk>({
      transform(chunk, controller) {
        if (chunk.type === "text-delta" && chunk.id !== undefined) {
          if (done.has(chunk.id)) {
            controller.enqueue(chunk);
            return;
          }
          const acc = (buf.get(chunk.id) ?? "") + (chunk.text ?? "");
          if (THINKING_HEADER_RE.test(acc)) hidden.add(chunk.id);
          // Check if we've seen the end marker
          const m = acc.match(THINKING_END_RE);
          if (m) {
            done.add(chunk.id);
            buf.delete(chunk.id);
            const after = acc.slice(m[0].length);
            if (after) controller.enqueue({ ...chunk, text: after });
          } else {
            // Hold only a short prefix to detect split thinking markers. Normal
            // answers stream immediately afterwards instead of buffering the turn.
            if (!hidden.has(chunk.id) && acc.length >= 64) {
              done.add(chunk.id);
              buf.delete(chunk.id);
              controller.enqueue({ ...chunk, text: acc });
            } else {
              buf.set(chunk.id, acc);
            }
          }
          return;
        }
        if (chunk.type === "text-end" && chunk.id !== undefined) {
          if (!done.has(chunk.id)) {
            const rest = buf.get(chunk.id);
            buf.delete(chunk.id);
            done.delete(chunk.id);
            if (rest && !hidden.has(chunk.id)) controller.enqueue({ ...chunk, id: chunk.id, type: "text-delta", text: rest } as Chunk);
          }
          done.delete(chunk.id);
          buf.delete(chunk.id);
          hidden.delete(chunk.id);
        }
        controller.enqueue(chunk);
      },
    });
  };
}

export function priceMaskTransform() {
  return () => {
    const held = new Map<string, string>();
    return new TransformStream<Chunk, Chunk>({
      transform(chunk, controller) {
        if (chunk.type === "text-delta" && chunk.id !== undefined) {
          const buf = (held.get(chunk.id) ?? "") + (chunk.text ?? "");
          const m = buf.match(/^([\s\S]*\s)(\S*)$/);
          let emit = m ? m[1] : "";
          let rest = m ? m[2] : buf;
          const last = emit.trimEnd().split(/\s/).pop() ?? "";
          if (emit && HOLD_RE.test(last)) {
            const cut = emit.trimEnd().length - last.length;
            rest = emit.slice(cut) + rest;
            emit = emit.slice(0, cut);
          }
          held.set(chunk.id, rest);
          if (emit) {
            controller.enqueue({ ...chunk, text: maskPrices(emit) });
          }
          return;
        }
        if (chunk.type === "text-end" && chunk.id !== undefined) {
          const rest = held.get(chunk.id);
          held.delete(chunk.id);
          if (rest) {
            controller.enqueue({ id: chunk.id, text: maskPrices(rest), type: "text-delta" });
          }
        }
        controller.enqueue(chunk);
      },
    });
  };
}
