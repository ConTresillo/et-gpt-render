import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
process.env.RUN_WORKERS = "1";

async function main() {
  const { getBoss, stopBoss } = await import("../lib/workers/boss");
  await getBoss();
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, async () => {
      await stopBoss();
      process.exit(0);
    });
  }
}
main().catch((error) => { console.error("Worker startup failed", error); process.exit(1); });
