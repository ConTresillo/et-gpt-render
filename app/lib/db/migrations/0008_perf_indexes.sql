-- Performance indexes for the two most-hit queries:
--   getChatsByUserId     → Chat(userId, createdAt DESC)
--   getMessagesByChatId  → Message_v2(chatId, createdAt ASC)
-- Without these every sidebar load and every chat open is a sequential scan.

CREATE INDEX IF NOT EXISTS "Chat_userId_createdAt_idx"
  ON "Chat" ("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Message_v2_chatId_createdAt_idx"
  ON "Message_v2" ("chatId", "createdAt" ASC);

-- Supports getVotesByChatId and cascade deletes on chat
CREATE INDEX IF NOT EXISTS "Vote_v2_chatId_idx"
  ON "Vote_v2" ("chatId");

-- Supports getDocumentsById / getDocumentById ordering
CREATE INDEX IF NOT EXISTS "Document_id_createdAt_idx"
  ON "Document" ("id", "createdAt" DESC);

-- Supports stream lookups on chat resume
CREATE INDEX IF NOT EXISTS "Stream_chatId_createdAt_idx"
  ON "Stream" ("chatId", "createdAt" ASC);
