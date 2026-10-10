import { createMCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import type { UserType } from "@/app/(auth)/auth";
import { type Action, can } from "@/lib/authz";
import { adminSql } from "@/lib/db/admin";
import { log } from "@/lib/logger";

// MCP servers are configured, not hard-coded: MCP_SERVERS='[{"name":"et","url":"http://host:8001/mcp","headers":{}}]'
type ServerCfg = { name: string; url: string; headers?: Record<string, string> };
export function serverConfigs(): ServerCfg[] {
  try {
    return JSON.parse(
      process.env.MCP_SERVERS ?? '[{"name":"et","url":"http://127.0.0.1:8001/mcp"}]'
    );
  } catch {
    return [];
  }
}

/**
 * Role permission per MCP tool. "hidden" tools are never offered to the model
 * (calculate runs only after human approval, from the server).
 */
const READ: Action = "tool:read";
const PERMISSIONS: Record<string, Action | "hidden" | "admin:access"> = {
  search_calculator: READ,
  get_calculator: READ,
  search_lookups: READ,
  get_reference: READ,
  lookup: READ,
  search_knowledge_base: READ,
  get_document: READ,
  list_families: READ,
  list_tables: READ,
  describe_table: READ,
  search_knowledge: READ,
  get_table_knowledge: READ,
  lookup_model: READ,
  get_product: READ,
  search_products: READ,
  calculate: "hidden",
  run_select: "admin:access", // raw SQL: admins only
};
export function actionFor(tool: string): Action | "hidden" {
  return PERMISSIONS[tool] ?? "hidden";
}

async function logTool(userId: string, tool: string, ok: boolean, chatId?: string) {
  try {
    await adminSql`insert into "ToolLog" ("userId", "chatId", tool, ok) values (${userId}, ${chatId ?? null}, ${tool}, ${ok})`;
  } catch (e) {
    log.mcp.error({ err: e }, "tool log failed");
  }
}

export type McpSession = {
  /** Tools visible to this role (permission checked again at call time). */
  tools: ToolSet;
  /** Names of every tool the servers expose (before role filtering). */
  discovered: string[];
  degraded: boolean;
  /** Execute a tool directly (server-initiated, e.g. approved calculation). */
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  close: () => Promise<void>;
};

export function parseToolResult(r: unknown): unknown {
  const res = r as { structuredContent?: unknown; content?: { type: string; text?: string }[]; isError?: boolean };
  if (res?.structuredContent) {
    return res.structuredContent;
  }
  const texts = (res?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "");
  const parsed = texts.map((t) => {
    try {
      return JSON.parse(t);
    } catch {
      return t;
    }
  });
  return parsed.length === 1 ? parsed[0] : parsed;
}

export async function openMcp(role: UserType, userId: string, chatId?: string): Promise<McpSession> {
  const clients: { close: () => Promise<void> }[] = [];
  const all: ToolSet = {};
  let degraded = false;
  for (const cfg of serverConfigs()) {
    try {
      const client = await createMCPClient({
        transport: { headers: cfg.headers, type: "http", url: cfg.url },
      });
      clients.push(client);
      Object.assign(all, await client.tools());
    } catch (e) {
      degraded = true;
      log.mcp.error({ err: e, server: cfg.name }, "MCP server unavailable");
    }
  }

  const needed = (tool: string): Action => {
    const a = actionFor(tool);
    return a === "hidden" ? "admin:access" : a;
  };
  const guard = async (name: string, args: unknown, exec: (a: never, o: never) => unknown, o: unknown) => {
    if (!can(role, needed(name))) {
      await logTool(userId, name, false, chatId);
      return { error: "You don't have permission to use this tool." };
    }
    try {
      const out = await exec(args as never, o as never);
      await logTool(userId, name, !(out as { isError?: boolean })?.isError, chatId);
      return out;
    } catch (e) {
      await logTool(userId, name, false, chatId);
      return { error: `Tool ${name} failed: ${e instanceof Error ? e.message : "unknown error"}` };
    }
  };

  const visible: ToolSet = {};
  for (const [name, t] of Object.entries(all)) {
    if (actionFor(name) === "hidden" || !can(role, needed(name))) {
      continue; // role-filtered at discovery
    }
    const exec = (t as { execute?: (a: never, o: never) => unknown }).execute;
    if (exec) {
      visible[name] = { ...t, execute: (a: never, o: never) => guard(name, a, exec, o) } as never;
    }
  }

  return {
    call: async (name, args) => {
      const t = all[name] as { execute?: (a: unknown, o: unknown) => unknown } | undefined;
      if (!t?.execute) {
        throw new Error(`Tool ${name} not available`);
      }
      // server-initiated calls still run through the permission + audit wrapper
      const needAction: Action = name === "calculate" ? "tool:calculate" : needed(name);
      if (!can(role, needAction)) {
        await logTool(userId, name, false, chatId);
        throw new Error("forbidden");
      }
      try {
        const out = await t.execute(args, { messages: [], toolCallId: `srv-${Date.now()}` });
        await logTool(userId, name, !(out as { isError?: boolean })?.isError, chatId);
        return out;
      } catch (e) {
        await logTool(userId, name, false, chatId);
        throw e;
      }
    },
    close: async () => {
      await Promise.allSettled(clients.map((c) => c.close()));
    },
    degraded,
    discovered: Object.keys(all),
    tools: visible,
  };
}
