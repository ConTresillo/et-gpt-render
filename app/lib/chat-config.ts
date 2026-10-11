import { defaultSuitabilityColumns } from "@/lib/ai/lens-suitability";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { systemConfig } from "@/lib/db/schema";
import { regularPrompt } from "@/lib/ai/prompts";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { MAX_MODEL_STEPS, REQUEST_TIME_BUDGET_MS } from "@/lib/ratelimit";
import { log } from "@/lib/logger";

export const chatConfigSchema = z.object({
  model: z.string().trim().min(1).max(160),
  prompt: z.string().trim().min(1).max(16000),
  timeBudgetSeconds: z.number().int().min(15).max(180),
  maxSteps: z.number().int().min(4).max(20),
  contextTokenBudget: z.number().int().min(8000).max(96000).default(24000),
  catalogLimit: z.number().int().min(1).max(50),
  chainPlan: z.array(z.object({ area: z.enum(["knowledge", "calculation", "catalog", "answer"]), title: z.string().min(1).max(200) })).min(3).max(12).default([
    { area: "knowledge", title: "Load the relevant skills and discover available tool capabilities" },
    { area: "calculation", title: "Find the calculator for the unknown quantity and verify its input definitions" },
    { area: "calculation", title: "Collect stated inputs and wait for customer approval before calculating" },
    { area: "catalog", title: "Discover compatible catalog schemas and search using the approved requirements" },
    { area: "answer", title: "Compare grounded options, explain unknowns, and cite retrieved evidence" },
  ]),
  insightSampleLimit: z.number().int().min(50).max(5000).default(500),
  insightTopics: z.array(z.object({ label: z.string().min(1).max(80), keywords: z.array(z.string().min(1).max(100)).min(1).max(30), recommendation: z.string().max(500).optional() })).min(1).max(30).default([
    { label: "lens selection", keywords: ["lens", "catalog", "sensor", "mount"], recommendation: "Review recurring camera and lens requirements to improve catalog guidance." },
    { label: "optics calculations", keywords: ["calculate", "focal", "field of view", "working distance", "fov"], recommendation: "Review missing calculation inputs and improve input guidance." },
    { label: "inspection systems", keywords: ["garuda", "netra", "inspection", "defect", "bottle"], recommendation: "Expand application examples for the most requested inspection systems." },
    { label: "sales enquiries", keywords: ["quote", "price", "cost", "purchase"], recommendation: "Make the quotation contact path easy to find; keep pricing out of chatbot answers." },
    { label: "integration and support", keywords: ["install", "setup", "error", "integration", "support"], recommendation: "Review support questions and add verified troubleshooting documentation." },
  ]),
  tradeoffSkill: z.string().trim().min(1).max(80),
  skills: z.object({ company_info: z.string().min(1), catalog_lookup: z.string().min(1), calculation: z.string().min(1), chain: z.string().min(1) }),
  suitabilityColumns: z.object(Object.fromEntries(Object.entries(defaultSuitabilityColumns).map(([key, values]) => [key, z.array(z.string().min(1).max(80)).min(1).max(10).default(values)])) as { [K in keyof typeof defaultSuitabilityColumns]: z.ZodDefault<z.ZodArray<z.ZodString>> }).default(defaultSuitabilityColumns),
  comparisonFields: z.array(z.object({ keys: z.array(z.string().min(1).max(80)).min(1).max(5), label: z.string().min(1).max(80) })).min(1).max(10),
});
export type ChatConfig = z.infer<typeof chatConfigSchema>;
export const defaultChatConfig: ChatConfig = {
  model: DEFAULT_CHAT_MODEL, prompt: regularPrompt,
  timeBudgetSeconds: Math.min(180, Math.max(15, REQUEST_TIME_BUDGET_MS / 1000)),
  maxSteps: MAX_MODEL_STEPS, catalogLimit: 10, tradeoffSkill: "tradeoff",
  contextTokenBudget: 24000,
  chainPlan: chatConfigSchema.shape.chainPlan.parse(undefined),
  insightSampleLimit: 500,
  insightTopics: chatConfigSchema.shape.insightTopics.parse(undefined),
  skills: { company_info: "company-information", catalog_lookup: "lens-selection", calculation: "calc-with-approval", chain: "calc-then-catalog" },
  suitabilityColumns: defaultSuitabilityColumns,
  comparisonFields: [
    { keys: ["focus_length_mm", "focal_length_mm"], label: "Focal length (mm)" },
    { keys: ["sensor_size_raw", "sensor_raw"], label: "Listed sensor format" },
    { keys: ["mount_raw", "mount"], label: "Mount" },
    { keys: ["megapixel_rating"], label: "Resolution rating (MP)" },
    { keys: ["f_no_raw"], label: "Aperture (catalog)" },
    { keys: ["weight_g"], label: "Weight (g)" },
  ],
};

export async function getChatConfig(): Promise<ChatConfig> {
  try {
    const [row] = await adminDb.select().from(systemConfig).where(eq(systemConfig.key, "chatbot"));
    return row ? chatConfigSchema.parse(JSON.parse(row.value)) : defaultChatConfig;
  } catch (error) {
    log.chat.warn({ err: error }, "chatbot settings unavailable; using environment defaults");
    return defaultChatConfig;
  }
}
