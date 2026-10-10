export default function AdminLoading() {
  return <div role="status" aria-label="Loading admin page" className="space-y-4">
    <p className="text-sm text-muted-foreground">Loading page…</p>
    <div className="h-10 w-48 rounded bg-muted animate-pulse" />
    <div className="h-48 rounded-xl border bg-muted/30 animate-pulse" />
  </div>;
}
