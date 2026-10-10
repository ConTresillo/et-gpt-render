import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { systemConfig } from "@/lib/db/schema";
import { chatConfigSchema, getChatConfig } from "@/lib/chat-config";
import { effectiveSkills } from "@/lib/skills";
import { ChatbotError } from "@/lib/errors";

export async function GET() {
  try {
    const session = await auth(); assertCan(session?.user.type, "admin:access");
    return Response.json({ settings: await getChatConfig(), skills: (await effectiveSkills()).map(({ name, description }) => ({ name, description })) });
  } catch (error) { if (error instanceof ChatbotError) return error.toResponse(); throw error; }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth(); assertCan(session?.user.type, "admin:access");
    const parsed = chatConfigSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    const names = new Set((await effectiveSkills()).map((skill) => skill.name));
    if ([...Object.values(parsed.data.skills), parsed.data.tradeoffSkill].some((name) => !names.has(name))) return Response.json({ error: "Select existing, active skill names." }, { status: 400 });
    const value = JSON.stringify(parsed.data);
    await adminDb.insert(systemConfig).values({ key: "chatbot", value, label: "Chatbot settings", description: "Model, workflow skills, answer guidance and catalog presentation" })
      .onConflictDoUpdate({ target: systemConfig.key, set: { value, updatedAt: new Date() } });
    return Response.json({ settings: parsed.data });
  } catch (error) { if (error instanceof ChatbotError) return error.toResponse(); throw error; }
}
