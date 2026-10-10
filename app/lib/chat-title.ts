/** Titles must remain usable even when a provider returns reasoning or Markdown. */
export function chatTitle(candidate: string, firstMessage: string): string {
  const fallback = firstMessage.trim().split(/\s+/).slice(0, 6).join(" ") || "EarthTekniks conversation";
  const cleaned = candidate.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const keywords = firstMessage.toLowerCase().match(/[a-z0-9]{4,}/g)?.filter((word) => !["what", "which", "with", "does", "have", "need", "tell", "about", "please", "this", "that", "your"].includes(word)) ?? [];
  const unrelated = keywords.length > 0 && !keywords.some((word) => cleaned.toLowerCase().includes(word));
  const unsafe = unrelated || cleaned.split(/\s+/).length > 8 || /thinking process|analy[sz]e user|here'?s.*thinking|<think>|thought for|^here (?:are|is)|^(?:the|a) .* (?:is|are) /i.test(cleaned);
  const title = unsafe ? fallback : cleaned.split(/\r?\n/)[0].replace(/^\s*(?:title:\s*)?[#*"`]+|[#*"`]+$/gi, "").trim() || fallback;
  return title.length > 60 ? `${title.slice(0, 57)}…` : title;
}
