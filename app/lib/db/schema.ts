import type { InferSelectModel } from "drizzle-orm";
import {
  bigint,
  boolean,
  foreignKey,
  integer,
  json,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Identity tables follow Better Auth's schema (anonymous + admin plugins).
// Guest = isAnonymous; verified user = emailVerified; admin = role "admin".
export const user = pgTable("User", {
  banExpires: timestamp("banExpires"),
  banReason: text("banReason"),
  banned: boolean("banned").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  image: text("image"),
  isAnonymous: boolean("isAnonymous").notNull().default(false),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default("user"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("Session", {
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  expiresAt: timestamp("expiresAt").notNull(),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  impersonatedBy: text("impersonatedBy"),
  ipAddress: text("ipAddress"),
  token: text("token").notNull().unique(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  userAgent: text("userAgent"),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("Account", {
  accessToken: text("accessToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  accountId: text("accountId").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  idToken: text("idToken"),
  password: text("password"),
  providerId: text("providerId").notNull(),
  refreshToken: text("refreshToken"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const verification = pgTable("Verification", {
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  expiresAt: timestamp("expiresAt").notNull(),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  identifier: text("identifier").notNull(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  value: text("value").notNull(),
});

export const authRateLimit = pgTable("AuthRateLimit", {
  count: bigint("count", { mode: "number" }).notNull(),
  id: text("id").primaryKey().notNull(),
  key: text("key").notNull(),
  lastRequest: bigint("lastRequest", { mode: "number" }).notNull(),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  createdAt: timestamp("createdAt").notNull(),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable("Message_v2", {
  attachments: json("attachments").notNull(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  createdAt: timestamp("createdAt").notNull(),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  parts: json("parts").notNull(),
  role: varchar("role").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    isUpvoted: boolean("isUpvoted").notNull(),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    content: text("content"),
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    title: text("title").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    createdAt: timestamp("createdAt").notNull(),
    description: text("description"),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    documentId: uuid("documentId").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    isResolved: boolean("isResolved").notNull().default(false),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
    pk: primaryKey({ columns: [table.id] }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").notNull().defaultRandom(),
  },
  (table) => ({
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
    pk: primaryKey({ columns: [table.id] }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

export const toolLog = pgTable("ToolLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId").notNull(),
  chatId: uuid("chatId"),
  tool: text("tool").notNull(),
  ok: boolean("ok").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type ToolLog = InferSelectModel<typeof toolLog>;

export const insightReport = pgTable("InsightReport", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  windowDays: integer("windowDays").notNull().default(30),
  status: text("status").notNull().default("pending"),
  headline: text("headline"),
  overview: text("overview"),
  topTopics: jsonb("topTopics"),
  recommendations: jsonb("recommendations"),
  errorMsg: text("errorMsg"),
  analyzedCount: integer("analyzedCount"),
  generatedAt: timestamp("generatedAt"),
  prevInsightId: uuid("prevInsightId"),
  trendSummary: text("trendSummary"),
});

export type InsightReport = InferSelectModel<typeof insightReport>;

export const systemConfig = pgTable("SystemConfig", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type SystemConfig = InferSelectModel<typeof systemConfig>;

export const skill = pgTable("Skill", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  triggerPatterns: jsonb("triggerPatterns").notNull().default([]),
  promptTemplate: text("promptTemplate").notNull(),
  useCount: integer("useCount").notNull().default(0),
  score: integer("score").notNull().default(50),
  archived: boolean("archived").notNull().default(false),
  source: text("source").notNull().default("manual"),
});

export type Skill = InferSelectModel<typeof skill>;

export const proposedSkill = pgTable("ProposedSkill", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  action: text("action").notNull().default("new"),
  targetSkillId: uuid("targetSkillId"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  triggerPatterns: jsonb("triggerPatterns").notNull().default([]),
  promptTemplate: text("promptTemplate").notNull(),
  rationale: text("rationale").notNull(),
  sourceQueryIds: jsonb("sourceQueryIds").notNull().default([]),
  exampleQueries: jsonb("exampleQueries").notNull().default([]),
  status: text("status").notNull().default("pending"),
  reviewedBy: uuid("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  reviewNote: text("reviewNote"),
});

export type ProposedSkill = InferSelectModel<typeof proposedSkill>;

export const appLog = pgTable("AppLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  level: text("level").notNull(),
  module: text("module").notNull().default("app"),
  message: text("message").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export type AppLog = InferSelectModel<typeof appLog>;

export const userMemory = pgTable("UserMemory", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  chatId: uuid("chatId"),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export type UserMemory = InferSelectModel<typeof userMemory>;
