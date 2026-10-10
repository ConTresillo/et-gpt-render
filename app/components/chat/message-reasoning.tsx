"use client";

type MessageReasoningProps = {
  isLoading: boolean;
  reasoning: string;
};

export function MessageReasoning({
  isLoading,
  reasoning: _reasoning,
}: MessageReasoningProps) {
  return isLoading ? <div role="status" className="animate-pulse text-[13px] text-muted-foreground">Thinking…</div> : null;
}
