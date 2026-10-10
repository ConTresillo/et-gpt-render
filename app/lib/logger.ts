import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const isServer = typeof window === "undefined";

// pino.transport() is a Node.js-only API — the browser bundle doesn't expose it.
// On the client pino writes to console automatically; we just skip the transport.
const destination =
  isDev && isServer
    ? pino.transport({
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      })
    : undefined;

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    base: isServer ? { service: "et-gpt" } : {},
  },
  destination,
);

export const log = {
  workers: logger.child({ module: "workers" }),
  mcp: logger.child({ module: "mcp" }),
  auth: logger.child({ module: "auth" }),
  chat: logger.child({ module: "chat" }),
  admin: logger.child({ module: "admin" }),
  pii: logger.child({ module: "pii" }),
  skills: logger.child({ module: "skills" }),
};
