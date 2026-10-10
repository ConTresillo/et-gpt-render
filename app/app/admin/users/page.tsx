"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, ShieldCheck, ShieldX, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDebouncedCallback } from "use-debounce";
import { toast } from "sonner";

type Row = {
  id: string;
  email: string;
  name: string;
  role: string;
  isAnonymous: boolean;
  emailVerified: boolean;
  banned: boolean;
  createdAt: string;
  chatCount: number;
};

const fetcher = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error("Users could not load"); return r.json(); };
const col = createColumnHelper<Row>();

async function userAction(id: string, action: string, extra?: Record<string, unknown>) {
  const r = await fetch(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [type, setType] = useState("registered");
  const search = useDebouncedCallback((value: string) => { setQ(value); setPage(1); }, 300);
  const limit = 20;
  const { data, error, isLoading, mutate } = useSWR(
    `/api/admin/users?page=${page}&limit=${limit}&q=${encodeURIComponent(q)}&type=${type}`,
    fetcher
  );

  const columns = [
    col.accessor("email", {
      header: "Email",
      cell: (i) => <span className="font-mono text-xs">{i.getValue()}</span>,
    }),
    col.accessor("name", { header: "Name" }),
    col.accessor("role", {
      header: "Role",
      cell: (i) => (
        <select aria-label={`Role for ${i.row.original.email}`} className="border rounded px-2 py-1" value={i.getValue()} disabled={i.row.original.isAnonymous} onChange={async e => { try { await userAction(i.row.original.id, "set_role", { role: e.target.value }); await mutate(); toast.success("Role updated"); } catch { toast.error("Role could not be updated"); } }}><option value="user">User</option><option value="admin">Admin</option></select>
      ),
    }),
    col.accessor("isAnonymous", {
      header: "Type",
      cell: (i) => (
        <span className="text-xs text-muted-foreground">
          {i.getValue() ? "guest" : "registered"}
        </span>
      ),
    }),
    col.accessor("emailVerified", {
      header: "Verified",
      cell: (i) => (i.getValue() ? <span className="text-green-600 text-xs">✓</span> : <span className="text-muted-foreground text-xs">—</span>),
    }),
    col.accessor("chatCount", {
      header: "Chats",
      cell: (i) => <span className="tabular-nums">{Number(i.getValue())}</span>,
    }),
    col.accessor("banned", {
      header: "Status",
      cell: (i) => (
        <Badge variant={i.getValue() ? "destructive" : "outline"}>
          {i.getValue() ? "banned" : "active"}
        </Badge>
      ),
    }),
    col.accessor("createdAt", {
      header: "Joined",
      cell: (i) => (
        <span className="text-xs">{format(new Date(i.getValue()), "dd MMM yy")}</span>
      ),
    }),
    col.display({
      id: "actions",
      cell: ({ row }) => {
        const u = row.original;
        if (u.isAnonymous) return null;
        return (
          <div className="flex gap-1">
            {u.banned ? (
              <Button
                size="sm"
                variant="ghost"
                title="Unban"
                onClick={async () => {
                  try { await userAction(u.id, "unban"); toast.success("Unbanned"); mutate(); }
                  catch { toast.error("Failed"); }
                }}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                title="Ban"
                onClick={async () => {
                  if (!confirm(`Ban ${u.email}?`)) return;
                  try { await userAction(u.id, "ban"); toast.success("Banned"); mutate(); }
                  catch { toast.error("Failed"); }
                }}
              >
                <ShieldX className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
            {u.role !== "admin" && (
              <Button
                size="sm"
                variant="ghost"
                title="Promote to admin"
                onClick={async () => {
                  if (!confirm(`Promote ${u.email} to admin?`)) return;
                  try { await userAction(u.id, "set_role", { role: "admin" }); toast.success("Promoted"); mutate(); }
                  catch { toast.error("Failed"); }
                }}
              >
                <UserCog className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      },
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
        <h1 className="text-xl font-semibold">Users</h1>
        {data && <span className="text-sm text-muted-foreground">{data.total} total</span>}
      </div>

      <div className="flex flex-wrap gap-2"><Input className="max-w-sm" placeholder="Search by email or name…" aria-label="Search users" onChange={e => search(e.target.value)} /><select aria-label="User type" className="border rounded px-3" value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="registered">Registered users</option><option value="guest">Guest sessions</option><option value="all">All users</option></select></div>
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">
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
    </div>
  );
}
