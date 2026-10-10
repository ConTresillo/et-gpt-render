"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart2, MessageSquare, Users, Lightbulb, LogOut, Cpu, Wand2, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin", label: "Overview", icon: BarChart2, exact: true },
  { href: "/admin/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/insights", label: "Insights", icon: Lightbulb },
  { href: "/admin/workers", label: "Workers", icon: Cpu },
  { href: "/admin/skills", label: "Skills", icon: Wand2 },
  { href: "/admin/settings", label: "Settings", icon: Cpu },
  { href: "/admin/logs",   label: "Logs",   icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r bg-sidebar flex flex-col">
        <div className="h-14 flex items-center px-4 border-b">
          <span className="font-semibold text-sm tracking-tight" style={{ color: "#003399" }}>
            ET-GPT Admin
          </span>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? path === href : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Back to Chat
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
