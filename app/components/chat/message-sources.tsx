"use client";

import type { EvidenceSource } from "@/lib/ai/evidence";

export function MessageSources({ sources }: { sources: EvidenceSource[] }) {
  sources = [...new Map(sources.map(source => [source.id, source])).values()];
  if (!sources.length) return null;
  return <div className="mt-3 space-y-2 text-xs" aria-label="Answer sources">
    <p className="font-medium text-muted-foreground">Sources</p>
    {sources.map((source) => <details key={source.id} className="rounded-lg border border-border/50 px-3 py-2">
      <summary className="cursor-pointer break-words">[{source.id}] {source.title}</summary>
      <p className="mt-2 text-muted-foreground">{source.kind.startsWith("catalog") ? "Product catalog" : source.kind === "calculation" ? "Approved calculator result" : "EarthTekniks knowledge"} · {source.locator}</p>
      <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words leading-relaxed">{source.text}</p>
    </details>)}
  </div>;
}
