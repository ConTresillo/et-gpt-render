/**
 * seed-demo.mjs
 * Populates the dev DB with believable demo data.
 * Uses POSTGRES_URL_ADMIN (owner) — safe to run repeatedly (idempotent via prefix check).
 *
 * Run: node scripts/seed-demo.mjs
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { randomUUID } from "crypto";

const require = createRequire(import.meta.url);

// Load .env.local so we have POSTGRES_URL_ADMIN
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env.local");
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
} catch {
  console.error(".env.local not found — set POSTGRES_URL_ADMIN manually");
}

const postgres = (await import("postgres")).default;
const sql = postgres(process.env.POSTGRES_URL_ADMIN, { max: 1 });

// ─── helpers ─────────────────────────────────────────────────────────────────

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

// ─── data ────────────────────────────────────────────────────────────────────

const DEMO_PREFIX = "demo_seed_";

const USERS = [
  { name: "Alice Mercer",      email: "alice@acmecorp.io",       role: "user",  verified: true,  daysAgo: 42 },
  { name: "Ben Okafor",        email: "ben@greenfields.co",       role: "user",  verified: true,  daysAgo: 37 },
  { name: "Carmen Silva",      email: "carmen@brightbuild.com",   role: "user",  verified: false, daysAgo: 28 },
  { name: "Dan Xu",            email: "dan@techstack.dev",        role: "user",  verified: true,  daysAgo: 21 },
  { name: "Evelyn Park",       email: "evelyn@soilfirst.org",     role: "user",  verified: true,  daysAgo: 14 },
  { name: "Frank Mensah",      email: "frank@mensahconstruct.gh", role: "user",  verified: true,  daysAgo: 10 },
  { name: "Grace O'Brien",     email: "grace@structurelab.ie",    role: "user",  verified: false, daysAgo: 5  },
  { name: "Hiro Tanaka",       email: "hiro@tanaka-infra.jp",     role: "user",  verified: true,  daysAgo: 3  },
];

const CONVERSATIONS = [
  {
    userIdx: 0,
    title: "Soil bearing capacity for a 3-storey building",
    daysAgo: 40,
    messages: [
      { role: "user",      text: "What soil bearing capacity do I need for a 3-storey residential building?" },
      { role: "assistant", text: "For a standard 3-storey building, a minimum bearing capacity of 100 kPa is generally required. However, this depends on load distribution, foundation type, and local soil conditions. I'd recommend a geotechnical survey first." },
      { role: "user",      text: "We have sandy loam at about 1.5 m depth. Will that work?" },
      { role: "assistant", text: "Sandy loam typically has a bearing capacity of 80–150 kPa depending on density and moisture content. At 1.5 m depth with well-compacted sandy loam, you should be in acceptable range — your structural engineer should confirm with plate load tests." },
    ],
  },
  {
    userIdx: 1,
    title: "Retaining wall design for a sloped site",
    daysAgo: 35,
    messages: [
      { role: "user",      text: "I have a 2 m cut slope. What type of retaining wall do you recommend?" },
      { role: "assistant", text: "For a 2 m retained height, a reinforced concrete cantilever wall or a gravity gabion wall are both viable. The choice depends on your budget, timeline, and surcharge loads. Do you expect vehicular loading near the wall?" },
      { role: "user",      text: "Yes, occasional light vehicles" },
      { role: "assistant", text: "In that case, design for at least 10 kPa surcharge. A cantilever RC wall with heel extension would be safer and more economical than gabions here. Ensure adequate drainage behind the wall — this is the leading cause of retaining wall failure." },
    ],
  },
  {
    userIdx: 2,
    title: "Concrete mix design for foundations",
    daysAgo: 27,
    messages: [
      { role: "user",      text: "What concrete grade should I use for strip foundations?" },
      { role: "assistant", text: "C25/30 (characteristic cylinder/cube strength) is the standard minimum for reinforced strip foundations in most codes. For sulfate-rich soils or high groundwater, upgrade to C30/37 with sulfate-resisting cement." },
    ],
  },
  {
    userIdx: 3,
    title: "Reinforcement detailing for beam-column joints",
    daysAgo: 20,
    messages: [
      { role: "user",      text: "How do I detail stirrups at beam-column joints for seismic zones?" },
      { role: "assistant", text: "In seismic design, the joint core should be fully confined with closed stirrups at spacing ≤ d/4 or 100 mm, whichever is smaller (per Eurocode 8 or ACI 318-19 Chapter 18). Ensure at least 135° hooks on stirrups. The joint shear must be checked against the panel zone capacity." },
      { role: "user",      text: "We're in a low-seismic zone. Does the same apply?" },
      { role: "assistant", text: "In low seismic zones (PGA < 0.1 g) you can relax the ductile detailing requirements. Spacing of stirrups within the joint can follow non-seismic rules — typically d/2 or code minimum. Still use closed stirrups with 135° hooks for robustness." },
    ],
  },
  {
    userIdx: 4,
    title: "Steel vs concrete for a 5-span bridge",
    daysAgo: 13,
    messages: [
      { role: "user",      text: "Which is better for a rural 5-span bridge: steel or concrete?" },
      { role: "assistant", text: "For rural locations, reinforced or prestressed concrete is typically preferred due to lower maintenance and better corrosion resistance. Steel is faster to erect and lighter, but requires regular painting and inspection in humid environments. What are your span lengths?" },
      { role: "user",      text: "Each span is about 18 m" },
      { role: "assistant", text: "At 18 m, precast prestressed concrete I-beams (e.g. Y-beams) are very cost-effective and widely available. They can be placed quickly and require minimal maintenance. This would be my recommendation for a rural setting." },
    ],
  },
  {
    userIdx: 5,
    title: "Foundation options on expansive clay",
    daysAgo: 9,
    messages: [
      { role: "user",      text: "My site has highly expansive black cotton soil. What foundation type?" },
      { role: "assistant", text: "For highly expansive soils, the safest options are: (1) raft foundation with adequate stiffening beams, (2) bored piles to stable non-expansive strata, or (3) under-reamed piles. Raft is economical for small buildings; piles are better for taller structures. Avoid isolated strip footings — differential movement will crack the superstructure." },
    ],
  },
  {
    userIdx: 6,
    title: "Load path for open-plan floor",
    daysAgo: 6,
    messages: [
      { role: "user",      text: "We removed an internal wall on a ground floor. How do I check the load path is OK?" },
      { role: "assistant", text: "You need to: (1) Identify all loads the removed wall was carrying — beams, floor, walls above. (2) Design a steel or reinforced concrete transfer beam of adequate depth. (3) Check the columns / pads at both ends of the beam for the new combined load. (4) Check deflection of the transfer beam under service load. Has a structural engineer reviewed this?" },
    ],
  },
  {
    userIdx: 7,
    title: "What is the safe working load of a 12 mm rebar?",
    daysAgo: 2,
    messages: [
      { role: "user",      text: "What is the safe working load of a 12 mm high-yield rebar in tension?" },
      { role: "assistant", text: "For fy = 500 MPa (B500B/Grade 60) 12 mm rebar: Area = π(6)² = 113 mm². Design tensile force = 0.87 × 500 × 113 = ~49 kN. This is the factored design resistance per Eurocode 2 (γs = 1.15). For allowable stress design (ASD) at 0.6 fy, safe working load ≈ 34 kN." },
    ],
  },
  // Extra chats on same users for realistic density
  {
    userIdx: 0,
    title: "Pile cap design for 4-pile group",
    daysAgo: 38,
    messages: [
      { role: "user",      text: "How do I size a pile cap for 4 piles of 400 mm diameter?" },
      { role: "assistant", text: "For a 4-pile group with 400 mm piles, pile spacing should be 3× pile diameter = 1200 mm c/c. The cap extends 150–250 mm beyond the outer pile face. Minimum depth is typically 1.5× pile diameter = 600 mm to develop the truss strut. Use truss model (strut-and-tie) for force transfer design." },
    ],
  },
  {
    userIdx: 1,
    title: "Drainage design for a parking lot",
    daysAgo: 30,
    messages: [
      { role: "user",      text: "What minimum slope and drain spacing for a 2000 m² car park?" },
      { role: "assistant", text: "Minimum cross-fall of 1.5–2.5% is recommended for outdoor parking. Place linear drains or gully pots at low points — for 2000 m², two cross-drains at mid-bay with a perimeter drain should suffice. Size outlets for a 1-in-10-year storm event using the Rational Method (Q = CIA)." },
    ],
  },
  {
    userIdx: 3,
    title: "Flat slab punching shear check",
    daysAgo: 17,
    messages: [
      { role: "user",      text: "How do I check punching shear in a flat slab around a column?" },
      { role: "assistant", text: "Per Eurocode 2 Clause 6.4: check shear stress on the basic control perimeter at 2d from the column face. vEd = VEd / (u1 × d) must be ≤ vRd,c. If it fails, add stud rails or column drops. A rough rule: flat slabs without shear reinforcement are safe up to about V/(b0×d) ≤ 0.6 MPa." },
    ],
  },
  {
    userIdx: 5,
    title: "Steel connection bolt grades",
    daysAgo: 8,
    messages: [
      { role: "user",      text: "Should I use 8.8 or 10.9 bolts for a moment connection?" },
      { role: "assistant", text: "8.8 bolts are standard for most structural connections; 10.9 are used where space is constrained and higher preload is needed. For moment connections with tension flanges, 10.9 HSFG (High Strength Friction Grip) bolts in slip-resistant category are common. Ensure the connected plies can carry the higher clamping force." },
    ],
  },
];

// ─── run ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding demo data...");

  // Check existing seeded data
  const existing = await sql`SELECT id FROM "User" WHERE email LIKE ${DEMO_PREFIX + "%"} LIMIT 1`;
  if (existing.length > 0) {
    console.log("Demo data already seeded (found demo users). Delete them first to reseed.");
    await sql.end();
    return;
  }

  // Insert demo users
  const userIds = [];
  for (const u of USERS) {
    const id = randomUUID();
    const email = DEMO_PREFIX + u.email;
    const createdAt = daysAgo(u.daysAgo);
    await sql`
      INSERT INTO "User" (id, email, name, role, "emailVerified", "isAnonymous", banned, "createdAt", "updatedAt")
      VALUES (${id}, ${email}, ${u.name}, ${u.role}, ${u.verified}, false, false, ${createdAt}, ${createdAt})
    `;
    userIds.push(id);
    console.log(`  + user ${u.name} <${email}>`);
  }

  // Insert chats + messages
  for (const conv of CONVERSATIONS) {
    const chatId = randomUUID();
    const userId = userIds[conv.userIdx];
    const createdAt = daysAgo(conv.daysAgo);
    await sql`
      INSERT INTO "Chat" (id, title, "userId", visibility, "createdAt")
      VALUES (${chatId}, ${conv.title}, ${userId}, 'private', ${createdAt})
    `;
    for (const msg of conv.messages) {
      const parts = JSON.stringify([{ type: "text", text: msg.text }]);
      const attachments = JSON.stringify([]);
      await sql`
        INSERT INTO "Message_v2" (id, "chatId", role, parts, attachments, "createdAt")
        VALUES (${randomUUID()}, ${chatId}, ${msg.role}, ${parts}::json, ${attachments}::json, ${createdAt})
      `;
    }
    console.log(`  + chat "${conv.title}" (${conv.messages.length} messages)`);
  }

  // Insert one completed InsightReport
  const reportId = randomUUID();
  await sql`
    INSERT INTO "InsightReport" (id, "createdAt", "windowDays", status, headline, overview, "topTopics", recommendations, "analyzedCount", "generatedAt")
    VALUES (
      ${reportId},
      ${daysAgo(1)},
      30,
      'done',
      'Foundation design queries dominate; users want actionable next steps',
      'Over the past 30 days, 68% of conversations related to foundation and soil topics. Users show strong preference for Eurocode references and quick rule-of-thumb numbers. Seismic detailing and bridge materials are emerging topics.',
      ${JSON.stringify([
        { label: "foundations", count: 8 },
        { label: "concrete", count: 6 },
        { label: "soil", count: 5 },
        { label: "retaining walls", count: 3 },
        { label: "steel connections", count: 3 },
        { label: "bridges", count: 2 },
        { label: "seismic", count: 2 },
      ])},
      ${JSON.stringify([
        "Add pre-formatted Eurocode tables to the knowledge base for faster lookup responses.",
        "Consider a calculator widget for bearing capacity and punching shear checks.",
        "Users who ask about foundations often ask follow-up questions about drainage — group these in a guided flow.",
      ])},
      28,
      ${daysAgo(1)}
    )
  `;
  console.log("  + InsightReport (done)");

  console.log("\n✅ Demo seed complete.");
  await sql.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
