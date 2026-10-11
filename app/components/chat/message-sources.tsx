"use client";

import type { EvidenceSource } from "@/lib/ai/evidence";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function MessageSources({ sources }: { sources: EvidenceSource[] }) {
  sources = [...new Map(sources.map(source => [source.id, source])).values()];
  if (!sources.length) return null;
  return <Collapsible defaultOpen={false} className="mt-3 text-xs" aria-label="Answer sources">
    <CollapsibleTrigger className="group flex min-h-9 items-center gap-2 rounded-md px-2 font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      Sources <span className="rounded-full bg-muted px-1.5 py-0.5">{sources.length}</span>
      <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-2 space-y-2">
    {sources.map((source) => <details key={source.id} className="rounded-lg border border-border/50 px-3 py-2">
      <summary className="cursor-pointer break-words">[{source.id}] {source.title}</summary>
      <p className="mt-2 text-muted-foreground">{source.kind.startsWith("catalog") ? "Product catalog" : source.kind === "calculation" ? "Approved calculator result" : "EarthTekniks knowledge"} · {source.locator}</p>
      <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words leading-relaxed">{source.text}</p>
    </details>)}
    </CollapsibleContent>
  </Collapsible>;
}
