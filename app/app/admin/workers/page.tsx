"use client";

import useSWR from "swr";
import { format } from "date-fns";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type QueueInfo = {
  name: string;
  created_on: string;
  is_partitioned: boolean;
  retry_limit: number;
  expire_seconds: number | null;
};

export default function WorkersPage() {
  const { data, isLoading, mutate } = useSWR("/api/admin/workers", fetcher, {
    refreshInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workers</h1>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Background jobs are managed by pg-boss — a Postgres-native job queue. No Redis required.
        Jobs run in the same Postgres instance as the rest of the app.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            {data?.bossRunning ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            )}
            <span className="font-medium text-sm">pg-boss</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {data?.bossRunning ? "Running — polling for jobs" : "Not started"}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs text-muted-foreground mb-1">Registered queues</p>
          <p className="text-2xl font-bold">{data?.queues?.length ?? 0}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : (data?.queues ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          No queues registered yet. Queues are created when the first job is scheduled.
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Queue</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Created</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Retry limit</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Expiry</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Partitioned</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(data.queues as QueueInfo[]).map((q) => (
                <tr key={q.name} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs">{q.name}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {q.created_on && !Number.isNaN(new Date(q.created_on).getTime())
                      ? format(new Date(q.created_on), "dd MMM yyyy")
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline">{q.retry_limit}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {q.expire_seconds ? `${q.expire_seconds}s` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {q.is_partitioned ? "yes" : "no"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-sm">Registered workers</p>
        <p>
          {data?.workers?.length ? data.workers.join(" · ") : "No active worker heartbeat. Restart the background worker service."}
        </p>
      </div>
    </div>
  );
}
