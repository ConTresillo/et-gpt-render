"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { format } from "date-fns";
import { Plus, Archive, Edit2, CheckCircle, XCircle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Skill = {
  id: string;
  name: string;
  description: string;
  triggerPatterns: string[];
  promptTemplate: string;
  useCount: number;
  score: number;
  archived: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SkillsPage() {
  const { data, isLoading, mutate } = useSWR("/api/admin/skills", fetcher);
  const [showAdd, setShowAdd] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", triggerPatterns: "", promptTemplate: "" });
  const [saving, setSaving] = useState(false);

  const skills: Skill[] = data?.skills ?? [];
  const visible = skills.filter((s) => s.archived === showArchived);

  async function createSkill() {
    if (!form.name || !form.description || !form.promptTemplate) {
      toast.error("Name, description, and prompt template are required");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          triggerPatterns: form.triggerPatterns.split(",").map((s) => s.trim()).filter(Boolean),
          promptTemplate: form.promptTemplate,
        }),
      });
      if (r.ok) {
        toast.success("Skill created");
        setForm({ name: "", description: "", triggerPatterns: "", promptTemplate: "" });
        setShowAdd(false);
        mutate();
      } else {
        const j = await r.json();
        toast.error(j.error ?? "Failed to create skill");
      }
    } finally {
      setSaving(false);
    }
  }

  async function archiveSkill(id: string) {
    const r = await fetch(`/api/admin/skills/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Skill archived"); mutate(); }
    else toast.error("Failed to archive");
  }

  async function restoreSkill(id: string) {
    const r = await fetch(`/api/admin/skills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    if (r.ok) { toast.success("Skill restored"); mutate(); }
    else toast.error("Failed to restore");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Skills</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Active skills guide how the assistant handles specific query types.{" "}
            <Link href="/admin/skills/proposals" className="underline underline-offset-2 hover:text-foreground">
              Review proposals →
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "Show active" : "Show archived"}
          </Button>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add skill
          </Button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-medium text-sm">New skill</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name (snake_case)</label>
              <Input
                placeholder="pricing_inquiry"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Trigger keywords (comma-separated)</label>
              <Input
                placeholder="price, cost, quote"
                value={form.triggerPatterns}
                onChange={(e) => setForm((f) => ({ ...f, triggerPatterns: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Description</label>
            <Input
              placeholder="Handles queries about product pricing and quotes"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Prompt template (system instruction for this skill)</label>
            <Textarea
              placeholder="When the user asks about pricing, explain that EarthTekniks provides custom quotes..."
              rows={3}
              value={form.promptTemplate}
              onChange={(e) => setForm((f) => ({ ...f, promptTemplate: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={createSkill} disabled={saving}>
              {saving ? "Saving…" : "Create skill"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm">
          {showArchived ? "No archived skills." : "No active skills yet. Add one manually or approve an evolution proposal."}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => (
            <div key={s.id} className="rounded-xl border bg-card p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{s.name}</span>
                  <Badge variant={s.source === "evolved" ? "default" : "secondary"} className="text-xs">
                    {s.source}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {s.useCount} uses
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    score {s.score}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">{s.description}</p>
                {s.triggerPatterns.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.triggerPatterns.map((p) => (
                      <Badge key={p} variant="outline" className="text-xs font-normal">{p}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">{format(new Date(s.updatedAt), "dd MMM yy")}</span>
                {s.archived ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Restore"
                    onClick={() => restoreSkill(s.id)}
                  >
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Archive"
                    onClick={() => archiveSkill(s.id)}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
