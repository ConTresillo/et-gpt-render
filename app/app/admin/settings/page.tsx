"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ChatConfig } from "@/lib/chat-config";

export default function SettingsPage() {
  const { data, error, mutate } = useSWR("/api/admin/settings", async (url) => {
    const response = await fetch(url); if (!response.ok) throw new Error("Unable to load settings"); return response.json();
  });
  const [draft, setDraft] = useState<ChatConfig>();
  const [suitability, setSuitability] = useState("");
  const [fields, setFields] = useState("");
  const [topics, setTopics] = useState("");
  const [plan, setPlan] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data && !draft) { setDraft(data.settings); setSuitability(JSON.stringify(data.settings.suitabilityColumns, null, 2)); setFields(JSON.stringify(data.settings.comparisonFields, null, 2)); setTopics(JSON.stringify(data.settings.insightTopics, null, 2)); setPlan(JSON.stringify(data.settings.chainPlan, null, 2)); } }, [data, draft]);
  if (error) return <p role="alert">Settings could not be loaded. Please retry.</p>;
  if (!draft) return <p>Loading settings…</p>;
  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, suitabilityColumns: JSON.parse(suitability), chainPlan: JSON.parse(plan), comparisonFields: JSON.parse(fields), insightTopics: JSON.parse(topics) }) });
      if (!response.ok) throw new Error("Settings rejected. Check values and select active skills.");
      await mutate(); toast.success("Settings saved. New requests will use them.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save settings"); }
    finally { setSaving(false); }
  }
  return <div className="max-w-4xl space-y-5">
    <h1 className="text-xl font-semibold">Chatbot settings</h1>
    <p className="text-sm text-muted-foreground">Changes apply to new requests without restarting. Edit skill instructions and triggers under Skills. Calculation approval, grounded results and tool permissions remain enforced by the server.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm">Model<Input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} /></label>
      {(["timeBudgetSeconds", "maxSteps", "catalogLimit"] as const).map((key) => <label key={key} className="space-y-1 text-sm">{{ timeBudgetSeconds: "Request budget (seconds)", maxSteps: "Maximum model steps", catalogLimit: "Catalog result limit" }[key]}<Input type="number" value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} /></label>)}
      {Object.entries(draft.skills).map(([intent, name]) => <label key={intent} className="space-y-1 text-sm">{intent.replaceAll("_", " ")} skill<select className="block w-full rounded-md border bg-background p-2" value={name} onChange={(event) => setDraft({ ...draft, skills: { ...draft.skills, [intent]: event.target.value } })}>{data.skills.map((skill: { name: string }) => <option key={skill.name}>{skill.name}</option>)}</select></label>)}
      <label className="space-y-1 text-sm">Multiple-option tradeoff skill<select className="block w-full rounded-md border bg-background p-2" value={draft.tradeoffSkill} onChange={(event) => setDraft({ ...draft, tradeoffSkill: event.target.value })}>{data.skills.map((skill: { name: string }) => <option key={skill.name}>{skill.name}</option>)}</select></label>
    </div>
    <label className="block space-y-1 text-sm">Answer guidance<Textarea rows={12} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} /></label>
    <label className="block space-y-1 text-sm">Complex-request plan<Textarea rows={10} value={plan} onChange={event => setPlan(event.target.value)} /><span className="text-xs text-muted-foreground">Linear execution steps. Plans are stored privately and shown only in admin conversation debugging. Approval and tool permissions are enforced independently.</span></label>
    <label className="block space-y-1 text-sm">Lens compatibility columns<Textarea rows={10} value={suitability} onChange={event => setSuitability(event.target.value)} /><span className="text-xs text-muted-foreground">Verified catalog column aliases for image circle, mount, resolution, working-distance ranges and camera type. Millimetre bindings must refer to millimetre columns.</span></label>
    <label className="block space-y-1 text-sm">Comparison fields<Textarea rows={10} value={fields} onChange={(event) => setFields(event.target.value)} /><span className="text-xs text-muted-foreground">JSON list of catalog column keys and customer-facing labels. Only retrieved values appear; missing fields are marked as not retrieved.</span></label>
    <label className="block space-y-1 text-sm">Customer insight topics<Textarea rows={10} value={topics} onChange={(event) => setTopics(event.target.value)} /><span className="text-xs text-muted-foreground">JSON list of labels, keywords and optional recommendations. Counts use customer messages only. Automatic run thresholds are configured under Insights.</span></label>
    <label className="block space-y-1 text-sm">Maximum customer messages per insight report<Input type="number" value={draft.insightSampleLimit} onChange={(event) => setDraft({ ...draft, insightSampleLimit: Number(event.target.value) })} /></label>
    <Button disabled={saving} onClick={save}>{saving ? "Saving…" : "Save settings"}</Button>
    <p className="text-xs text-muted-foreground">Service URLs, database credentials and API keys are configured through environment variables. They are never sent to this page. See docs/local-testing.md for service and dependency setup.</p>
  </div>;
}
