import { auth, withPrincipal } from "@/app/(auth)/auth";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { convertToUIMessages } from "@/lib/utils";

async function GETImpl(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }

  const [session, chat, messages] = await Promise.all([
    auth(),
    getChatById({ id: chatId }),
    getMessagesByChatId({ id: chatId }),
  ]);

  if (!chat) {
    return Response.json({
      isReadonly: false,
      messages: [],
      userId: null,
      visibility: "private",
    });
  }

  if (
    chat.visibility === "private" &&
    (!session?.user || session.user.id !== chat.userId)
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const isReadonly = !session?.user || session.user.id !== chat.userId;

  return Response.json(
    {
      isReadonly,
      messages: convertToUIMessages(messages),
      userId: chat.userId,
      visibility: chat.visibility,
    },
    {
      headers: {
        // Messages don't change once persisted. Cache per-user for 30 s so
        // navigating back to a chat is instant.
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    }
  );
}

export const GET = withPrincipal(GETImpl);
