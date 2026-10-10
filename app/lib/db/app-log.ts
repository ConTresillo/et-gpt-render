import "server-only";
import { adminDb } from "@/lib/db/admin";
import { appLog } from "@/lib/db/schema";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export async function dbLog(
  level: LogLevel,
  module: string,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await adminDb.insert(appLog).values({ level, module, message, data: data ?? null });
  } catch {
    // Never crash the caller — DB logging is best-effort
  }
}
