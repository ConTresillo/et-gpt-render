// Repairs only malformed titles for the configured local admin. Dry-run by default.
import { config } from "dotenv";
import postgres from "postgres";
import { chatTitle } from "../lib/chat-title";
config({ path: ".env.local", quiet: true });
const db = postgres(process.env.POSTGRES_URL_ADMIN!, { max: 1 });
async function main() {
try {
  const rows = await db`
    select c.id, c.title, first.parts from "Chat" c
    join "User" u on u.id = c."userId"
    join lateral (select parts from "Message_v2" where "chatId" = c.id and role = 'user' order by "createdAt" asc limit 1) first on true
    where u.email = ${process.env.ADMIN_EMAIL!}
      and (c.title ilike '%thinking process%' or c.title ilike '%<think>%' or c.title in ('New chat', 'EarthTekniks conversation'))`;
  for (const row of rows) {
    const first = (row.parts as { type: string; text?: string }[]).filter((part) => part.type === "text").map((part) => part.text ?? "").join(" ");
    const title = chatTitle("", first);
    if (process.argv.includes("--apply")) await db`update "Chat" set title = ${title} where id = ${row.id}`;
  }
  console.log(`${process.argv.includes("--apply") ? "Repaired" : "Would repair"} ${rows.length} malformed titles`);
} finally { await db.end(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
