"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle, XCircle, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Proposal = {
  id: string;
  createdAt: string;
  action: "new" | "improve";
  name: string;
  description: string;
  triggerPatterns: string[];
  promptTemplate: string;
  rationale: string;
  exampleQueries: string[];
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewedAt: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ProposalsPage() {
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [running, setRunning] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const { data, isLoading, mutate } = useSWR(
    `/api/admin/skills/proposals?status=${tab}`,
    fetcher,
    { refreshInterval: tab === "pending" ? 10_000 : 0 }
  );
  const proposals: Proposal[] = data?.proposals ?? [];

  async function triggerEvolution() {
    setRunning(true);
    try {
      const r = await fetch("/api/admin/skills/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowDays: 30 }),
      });
      if (r.ok) { toast.success("Skill evolution job queued — check back in a minute"); }
      else toast.error("Failed to queue job");
    } finally {
      setRunning(false);
    }
  }

  async function reviewProposal(id: string, action: "approve" | "reject") {
    const r = await fetch(`/api/admin/skills/proposals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reviewNote: reviewNote || null }),
    });
    if (r.ok) {
      toast.success(action === "approve" ? "Skill approved and activated" : "Proposal rejected");
      setReviewingId(null);
      setReviewNote("");
      mutate();
    } else {
      const j = await r.json();
      toast.error(j.error ?? "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/skills" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Skill Proposals</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              AI-generated proposals from real user queries. Approve to activate, reject to dismiss.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={triggerEvolution} disabled={running}>
          {running ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 mr-1.5" />
          )}
          Run evolution
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["pending", "approved", "rejected"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 h-40 animate-pulse" />
          ))}
        </div>
      ) : proposals.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm">
          {tab === "pending"
            ? 'No pending proposals. Click "Run evolution" to analyse recent conversations.'
            : `No ${tab} proposals.`}
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-5 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{p.name}</span>
                    <Badge variant={p.action === "improve" ? "secondary" : "default"} className="text-xs">
                      {p.action === "improve" ? "improve existing" : "new skill"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(p.createdAt), "dd MMM yyyy HH:mm")}
                </span>
              </div>

              {/* Rationale */}
              <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Rationale · </span>
                {p.rationale}
              </div>

              {/* Example queries */}
              {p.exampleQueries.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Example queries that triggered this</p>
                  <ul className="space-y-0.5">
                    {p.exampleQueries.slice(0, 5).map((q, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex gap-2">
                        <span className="text-primary/60">›</span>
                        <span className="truncate">{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Trigger patterns */}
              {p.triggerPatterns.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.triggerPatterns.map((pat) => (
                    <Badge key={pat} variant="outline" className="text-xs font-normal">{pat}</Badge>
                  ))}
                </div>
              )}

              {/* Prompt template */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Prompt template</p>
                <pre className="text-xs bg-muted/50 rounded-md p-3 whitespace-pre-wrap font-mono">{p.promptTemplate}</pre>
              </div>

              {/* Review note if already reviewed */}
              {p.reviewNote && (
                <p className="text-sm text-muted-foreground italic">Note: {p.reviewNote}</p>
              )}

              {/* Actions for pending */}
              {p.status === "pending" && (
                <div className="space-y-2 border-t pt-3">
                  {reviewingId === p.id ? (
                    <>
                      <Textarea
                        placeholder="Optional review note…"
                        rows={2}
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => reviewProposal(p.id, "approve")}
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                          Approve &amp; activate
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => reviewProposal(p.id, "reject")}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                          Reject
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setReviewingId(null); setReviewNote(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setReviewingId(p.id)}>
                        Review
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {p.status !== "pending" && (
                <div className="border-t pt-3">
                  <Badge variant={p.status === "approved" ? "default" : "destructive"}>
                    {p.status}
                  </Badge>
                  {p.reviewedAt && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {format(new Date(p.reviewedAt), "dd MMM yyyy")}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
