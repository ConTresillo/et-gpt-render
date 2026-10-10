import "server-only";
import { PostgresStore } from "@mastra/pg";
import { Memory } from "@mastra/memory";

const globalRuntime = globalThis as typeof globalThis & { etMastraStore?: Promise<{ storage: PostgresStore; memory: Memory }> };
export function getMastraStorage() {
  if (!globalRuntime.etMastraStore) globalRuntime.etMastraStore = (async () => {
    const connectionString = process.env.MASTRA_DATABASE_URL ?? process.env.POSTGRES_URL_ADMIN;
    if (!connectionString) throw new Error("Mastra requires MASTRA_DATABASE_URL or POSTGRES_URL_ADMIN");
    const storage = new PostgresStore({ id: "earthtekniks-storage", connectionString, schemaName: "et_mastra", max: 3 });
    await storage.init();
    await storage.db.none('REVOKE ALL ON SCHEMA et_mastra FROM PUBLIC; REVOKE ALL ON ALL TABLES IN SCHEMA et_mastra FROM PUBLIC');
    await storage.db.none(`DO $security$ DECLARE relation record; BEGIN FOR relation IN SELECT tablename FROM pg_tables WHERE schemaname='et_mastra' LOOP EXECUTE format('ALTER TABLE et_mastra.%I ENABLE ROW LEVEL SECURITY', relation.tablename); END LOOP; END $security$;`);
    const memory = new Memory({ storage, options: { lastMessages: 0, semanticRecall: false, workingMemory: { enabled: true, scope: "thread" } } });
    return { storage, memory };
  })().catch(error => { globalRuntime.etMastraStore = undefined; throw error; });
  return globalRuntime.etMastraStore;
}
