"use client";

import { AppSidebar } from "@/components/chat/app-sidebar";
type User = { id?: string; email?: string | null; name?: string | null };

export function WidgetGuard({ user }: { user: User | undefined }) {
  // Keep navigation mounted inside the embed so its history button can open
  // the same responsive drawer as the standalone chat.
  return <AppSidebar user={user} />;
}
