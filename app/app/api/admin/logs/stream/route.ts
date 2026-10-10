import { type NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { appLog } from "@/lib/db/schema";
import { desc, eq, and, gt, sql } from "drizzle-orm";


const POLL_MS   = 3_000;   // how often the server checks for new rows
const HEARTBEAT = 25_000;  // SSE comment keepalive so proxies don't close the connection

export async function GET(req: NextRequest) {
  const s = await auth();
  try {
    assertCan(s?.user.type, "admin:access");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const level  = searchParams.get("level")  ?? "";
  const module = searchParams.get("module") ?? "";

  const encoder = new TextEncoder();

  // Fetch the list of distinct modules once so the client can populate its filter pills.
  const modulesRows = await adminDb
    .selectDistinct({ module: appLog.module })
    .from(appLog)
    .orderBy(appLog.module);
  const modules = modulesRows.map((r) => r.module);

  // Seed: send the 50 most recent rows immediately so the UI isn't blank on connect.
  const conditions: ReturnType<typeof eq>[] = [];
  if (level)  conditions.push(eq(appLog.level,  level));
  if (module) conditions.push(eq(appLog.module, module));
  const where = conditions.length ? and(...conditions) : undefined;

  const seed = await adminDb
    .select()
    .from(appLog)
    .where(where)
    .orderBy(desc(appLog.createdAt))
    .limit(50);

  // Track the newest ID we've sent so we only push deltas after that.
  let lastId: string | null = seed[0]?.id ?? null;

  const aborted = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Send initial seed + modules
      send("init", { rows: seed.toReversed(), modules });

      let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
      let pollTimer:      ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        if (pollTimer)      clearTimeout(pollTimer);
      };

      aborted.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch { /* already closed */ }
      });

      // Periodic heartbeat — an SSE comment keeps the connection alive through
      // load balancers and Vercel's 25-second response timeout.
      const heartbeat = () => {
        if (aborted.aborted) return;
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
        heartbeatTimer = setTimeout(heartbeat, HEARTBEAT);
      };
      heartbeatTimer = setTimeout(heartbeat, HEARTBEAT);

      // Poll loop — checks for new rows server-side; sends nothing if no change.
      const poll = async () => {
        if (aborted.aborted) return;
        try {
          const newConditions = [...conditions];
          if (lastId) newConditions.push(gt(appLog.id, sql`${lastId}::uuid`));
          const newWhere = newConditions.length ? and(...newConditions) : undefined;

          const fresh = await adminDb
            .select()
            .from(appLog)
            .where(newWhere)
            .orderBy(desc(appLog.createdAt))
            .limit(100);

          if (fresh.length > 0) {
            lastId = fresh[0].id;
            send("logs", { rows: fresh.toReversed() });
          }
        } catch {
          // DB error — keep the connection open; client will reconnect on fatal errors
        }
        if (!aborted.aborted) {
          pollTimer = setTimeout(poll, POLL_MS);
        }
      };
      pollTimer = setTimeout(poll, POLL_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no", // disable Nginx buffering
    },
  });
}
