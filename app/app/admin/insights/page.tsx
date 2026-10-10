"use client";

import { useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { Play, CheckCircle, XCircle, Clock, RefreshCw, Settings, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Report = {
  id: string;
  createdAt: string;
  windowDays: number;
  status: "pending" | "running" | "done" | "error";
  headline: string | null;
  overview: string | null;
  topTopics: Array<{ label: string; count: number }> | null;
  recommendations: string[] | null;
  errorMsg: string | null;
  analyzedCount: number | null;
  generatedAt: string | null;
  trendSummary: string | null;
  prevInsightId: string | null;
};

type ConfigRow = {
  key: string;
  value: string;
  label: string;
  description: string | null;
};

const fetcher = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error("Could not load insights. Please retry."); return r.json(); };

const STATUS_ICON = {
  pending: <Clock className="h-4 w-4 text-yellow-500" />,
  running: <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />,
  done: <CheckCircle className="h-4 w-4 text-green-500" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
} as const;

export default function InsightsPage() {
  const [generating, setGenerating] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftCfg, setDraftCfg] = useState<Record<string, string>>({});

  const { data, error, isLoading, mutate } = useSWR("/api/admin/insights", fetcher, {
    refreshInterval: (response) => response?.data?.some((report: Report) => ["pending", "running"].includes(report.status)) ? 3000 : 0,
  });
  const { data: cfgData, error: cfgError, mutate: mutateCfg } = useSWR(
    showConfig ? "/api/admin/insights/config" : null,
    fetcher
  );

  async function triggerInsights() {
    setGenerating(true);
    try {
      const r = await fetch("/api/admin/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (r.ok) { toast.success("Insight job queued"); mutate(); }
      else toast.error("Failed to queue job");
    } finally {
      setGenerating(false);
    }
  }

  async function saveConfig() {
    if (Object.keys(draftCfg).length === 0) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/insights/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(Object.entries(draftCfg).map(([k, v]) => [k, Number(v)]))
        ),
      });
      if (r.ok) {
        toast.success("Config saved");
        setDraftCfg({});
        mutateCfg();
      } else toast.error("Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  const configRows: ConfigRow[] = cfgData?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Insights</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfig((v) => !v)}
          >
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Trigger settings
          </Button>
          <Button onClick={triggerInsights} disabled={generating} size="sm">
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Generate report
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Insight reports are generated automatically when message activity crosses the threshold.
        Only the latest report is shown. Previous reports are retained for sliding-window trend comparisons.
      </p>

      {showConfig && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Auto-trigger configuration</h2>
          <p className="text-xs text-muted-foreground">
            A new insight run is queued automatically when the message count in the sliding window
            reaches the threshold, provided the cooldown period has passed since the last run.
          </p>
          {cfgError ? <p role="alert" className="text-sm text-destructive">Settings could not load. <button onClick={() => mutateCfg()}>Retry</button></p> : configRows.length === 0 ? (
            <p className="text-xs text-muted-foreground animate-pulse">Loading…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {configRows.map((row) => (
                <div key={row.key} className="space-y-1.5">
                  <Label htmlFor={row.key} className="text-xs">
                    {row.label}
                  </Label>
                  <Input
                    id={row.key}
                    type="number"
                    min={1}
                    defaultValue={row.value}
                    className="h-8 text-sm"
                    onChange={(e) =>
                      setDraftCfg((prev) => ({ ...prev, [row.key]: e.target.value }))
                    }
                  />
                  {row.description && (
                    <p className="text-xs text-muted-foreground">{row.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <Button
            size="sm"
            disabled={saving || Object.keys(draftCfg).length === 0}
            onClick={saveConfig}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}

      {error ? <p role="alert" className="text-destructive">{error.message} <button onClick={() => mutate()}>Retry</button></p> : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 h-32 animate-pulse" />
          ))}
        </div>
      ) : (data?.data ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm">
          No reports yet. Click "Generate report" to run the first analysis.
        </div>
      ) : (
        <div className="space-y-3">
          {(data?.data as Report[]).map((r) => (
            <div key={r.id} className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {STATUS_ICON[r.status] ?? STATUS_ICON.pending}
                  <Badge variant="outline">{r.windowDays}d window</Badge>
                  {r.prevInsightId && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <TrendingUp className="h-3 w-3" />
                      trend
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {r.createdAt && !Number.isNaN(new Date(r.createdAt).getTime())
                      ? format(new Date(r.createdAt), "dd MMM yyyy HH:mm")
                      : "—"}
                  </span>
                </div>
                <Badge
                  variant={
                    r.status === "done"
                      ? "default"
                      : r.status === "error"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {r.status}
                </Badge>
              </div>

              {r.status === "done" && (
                <>
                  {r.headline && <p className="font-medium text-sm">{r.headline}</p>}
                  {r.overview && (
                    <p className="text-sm text-muted-foreground">{r.overview}</p>
                  )}
                  {r.trendSummary && (
                    <div className="rounded-lg bg-muted px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground mb-0.5 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> Trend vs previous report
                      </p>
                      <p className="text-xs">{r.trendSummary}</p>
                    </div>
                  )}
                  {r.topTopics && r.topTopics.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Top topics</p>
                      <div className="flex flex-wrap gap-1.5">
                        {r.topTopics.map((t) => (
                          <Badge key={t.label} variant="secondary" className="text-xs">
                            {t.label} ({t.count})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.recommendations && r.recommendations.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Recommendations</p>
                      <ul className="space-y-1">
                        {r.recommendations.map((rec, i) => (
                          <li key={i} className="text-sm flex gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.analyzedCount !== null && (
                    <p className="text-xs text-muted-foreground">
                      {r.analyzedCount} messages analysed
                    </p>
                  )}
                </>
              )}

              {r.status === "error" && r.errorMsg && (
                <p className="text-sm text-destructive">{r.errorMsg}</p>
              )}

              {(r.status === "pending" || r.status === "running") && (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Analysis in progress…
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
