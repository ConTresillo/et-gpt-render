import { Suspense } from "react";
import { ConversationsClient } from "./_client";

export default function ConversationsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
      <ConversationsClient />
    </Suspense>
  );
}
