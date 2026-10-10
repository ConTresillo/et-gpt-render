"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { Eye, Trash2, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

type Row = {
  id: string;
  title: string;
  visibility: string;
  createdAt: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  messageCount: number;
  score?: number;
};

type Mode = "auto" | "exact" | "bm25" | "fuzzy";

const MODES: { id: Mode; label: string; desc: string }[] = [
  { id: "auto",  label: "Auto",   desc: "Blends exact, BM25 and fuzzy" },
  { id: "exact", label: "Exact",  desc: "Title contains the query string" },
  { id: "bm25",  label: "BM25",   desc: "Full-text relevance ranking" },
  { id: "fuzzy", label: "Fuzzy",  desc: "Trigram similarity" },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const col = createColumnHelper<Row>();

export function ConversationsClient() {
  const [page, setPage]     = useState(1);
  const [q, setQ]           = useState("");
  const [inputVal, setInput] = useState("");
  const [mode, setMode]     = useState<Mode>("auto");
  const [detail, setDetail] = useState<{ chat: any; messages: any[]; workflow?: any } | null>(null);
  const [sort, setSort] = useState("newest");
  const limit = 20;

  const debounced = useDebouncedCallback((v: string) => {
    setQ(v);
    setPage(1);
  }, 350);

  const buildUrl = () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    params.set("sort", sort);
    if (q) { params.set("q", q); params.set("mode", mode); }
    return `/api/admin/conversations?${params}`;
  };

  const { data, isLoading, mutate } = useSWR(buildUrl(), fetcher);

  const columns = [
    col.accessor("title", {
      header: "Title",
      cell: (i) => <span className="max-w-xs truncate block">{i.getValue()}</span>,
    }),
    col.accessor("userEmail", {
      header: "User",
      cell: (i) => <span className="text-xs text-muted-foreground">{i.getValue() ?? "—"}</span>,
    }),
    col.accessor("messageCount", {
      header: "Messages",
      cell: (i) => <span className="tabular-nums">{Number(i.getValue())}</span>,
    }),
    col.accessor("visibility", {
      header: "Visibility",
      cell: (i) => (
        <Badge variant={i.getValue() === "public" ? "default" : "secondary"}>
          {i.getValue()}
        </Badge>
      ),
    }),
    col.accessor("createdAt", {
      header: "Created",
      cell: (i) => <span className="text-xs">{format(new Date(i.getValue()), "dd MMM yyyy")}</span>,
    }),
    ...(q ? [col.accessor("score" as keyof Row, {
      header: "Score",
      cell: (i) => {
        const v = i.getValue() as number | undefined;
        return <span className="text-xs tabular-nums text-muted-foreground">{v != null ? v.toFixed(3) : "—"}</span>;
      },
    })] : []),
    col.display({
      id: "actions",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const r = await fetch(`/api/admin/conversations/${row.original.id}`);
              if (r.ok) setDetail(await r.json());
            }}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              if (!confirm("Delete this conversation?")) return;
              const r = await fetch(`/api/admin/conversations/${row.original.id}`, { method: "DELETE" });
              if (r.ok) { toast.success("Deleted"); mutate(); }
              else toast.error("Failed to delete");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Conversations</h1>
        {data && <span className="text-sm text-muted-foreground">{data.total} total</span>}
      </div>

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 pr-8"
            placeholder="Search conversations…"
            value={inputVal}
            onChange={(e) => {
              setInput(e.target.value);
              debounced(e.target.value);
            }}
          />
          {inputVal && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setInput(""); setQ(""); setPage(1); }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select aria-label="Sort conversations" className="border rounded px-3 py-2 text-sm" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="newest">Newest first</option><option value="user">User A–Z</option><option value="oldest">Oldest first</option></select>
        {/* Mode pills — only shown while searching */}
        {q && (
          <div className="flex gap-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                title={m.desc}
                onClick={() => { setMode(m.id); setPage(1); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  mode === m.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((_, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.length === 0
              ? (
                  <tr>
                    <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      {q ? `No conversations match "${q}"` : "No conversations yet"}
                    </td>
                  </tr>
                )
              : table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate">{detail?.chat?.title}</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-3">
            User: {detail?.chat?.userEmail ?? "—"} ·{" "}
            {detail?.chat?.createdAt && format(new Date(detail.chat.createdAt), "dd MMM yyyy HH:mm")}
          </div>
          <div className="space-y-3">
            {detail && <Button variant="outline" size="sm" onClick={() => { const blob = new Blob([JSON.stringify(detail, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `agent-audit-${detail.chat.id}.json`; link.click(); URL.revokeObjectURL(url); }}>Export audit JSON</Button>}
            {detail?.workflow && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Internal workflow · {detail.workflow.status}</summary><ol className="list-decimal pl-5 mt-3 space-y-2">{detail.workflow.steps.map((step: any, index: number) => <li key={index}>{step.title} — {step.status}</li>)}</ol><pre className="text-xs whitespace-pre-wrap break-words mt-3">{JSON.stringify(detail.workflow, null, 2)}</pre></details>}
            {detail?.messages?.map((m: any) => {
              const text = Array.isArray(m.parts)
                ? m.parts.map((p: any) => p.text ?? "").join("")
                : JSON.stringify(m.parts);
              return (
                <div
                  key={m.id}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-primary/10 ml-8" : "bg-muted mr-8"
                  }`}
                >
                  <span className="text-xs font-medium text-muted-foreground block mb-1">{m.role}</span>
                  <p className="whitespace-pre-wrap break-words">{text}</p>
                  {Array.isArray(m.parts) && m.parts.filter((part: any) => part.type.startsWith("tool-") || part.type === "dynamic-tool" || part.type === "data-calculationDecision").map((part: any, index: number) => <details key={index} className="mt-2 rounded border p-2 text-xs"><summary className="cursor-pointer">{part.toolName ?? part.type.replace("tool-", "")} · {part.state ?? "approval"}</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(part, null, 2)}</pre></details>)}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
