"use client";

import { PanelLeftIcon, PenSquareIcon } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import type { VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId: _chatId,
  selectedVisibilityType: _v,
  isReadonly: _r,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const { toggleSidebar, setOpenMobile } = useSidebar();
  const { data, isPending } = authClient.useSession();
  const pathname = usePathname();
  const params = useSearchParams();
  const destination = pathname + (params.size ? `?${params.toString()}` : "");

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border/40 bg-sidebar px-3">
      <Button
        aria-label="Open conversation history"
        onClick={toggleSidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      <span className="flex-1 text-sm font-semibold text-primary">EarthTekniks</span>
      {!isPending && (!data?.user || data.user.isAnonymous) && <Button asChild size="sm" className="bg-[#003399] text-white hover:bg-[#00266f]"><Link href={`/login?redirectUrl=${encodeURIComponent(destination)}`}>Sign in</Link></Button>}
      {!isPending && data?.user.role === "admin" && <Button asChild size="sm" variant="ghost"><Link href="/admin">Admin</Link></Button>}
      <Button asChild size="sm" variant="ghost">
        <Link href="/" onClick={() => setOpenMobile(false)}><PenSquareIcon className="size-4" />New chat</Link>
      </Button>
    </header>
  );
}

export const ChatHeader = memo(
  PureChatHeader,
  (prevProps, nextProps) =>
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
);
