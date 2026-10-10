import type { NextRequest } from "next/server";
import { auth, withPrincipal } from "@/app/(auth)/auth";
import { deleteAllChatsByUserId, getChatsByUserId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

async function GETImpl(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") || "10", 10), 1),
    50
  );
  const startingAfter = searchParams.get("starting_after");
  const endingBefore = searchParams.get("ending_before");

  if (startingAfter && endingBefore) {
    return new ChatbotError(
      "bad_request:api",
      "Only one of starting_after or ending_before can be provided."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chats = await getChatsByUserId({
    endingBefore,
    id: session.user.id,
    limit,
    startingAfter,
  });

  return Response.json(chats, {
    headers: {
      // Cache per-user in the browser for 10 s; stale for 60 s while revalidating.
      // "private" prevents shared/CDN caches from storing user-specific data.
      "Cache-Control": "private, max-age=10, stale-while-revalidate=60",
    },
  });
}

async function DELETEImpl() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const result = await deleteAllChatsByUserId({ userId: session.user.id });

  return Response.json(result, { status: 200 });
}

export const GET = withPrincipal(GETImpl);

export const DELETE = withPrincipal(DELETEImpl);
