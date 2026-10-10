"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import { RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, AlertCircle, Info, Bug, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type LogEntry = {
  id: string;
  level: string;
  module: string;
  message: string;
  data: Record<string, unknown> | null;
  createdAt: string;
};

const LEVEL_STYLES: Record<string, { cls: string; icon: React.ElementType; label: string }> = {
  fatal: { cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",      icon: AlertCircle,   label: "Fatal" },
  error: { cls: "bg-red-50  text-red-700  dark:bg-red-900/30 dark:text-red-400",     icon: AlertCircle,   label: "Error" },
  warn:  { cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertTriangle, label: "Warn"  },
  info:  { cls: "bg-blue-50 text-blue-700  dark:bg-blue-900/30 dark:text-blue-400",  icon: Info,          label: "Info"  },
  debug: { cls: "bg-gray-50 text-gray-600  dark:bg-gray-800 dark:text-gray-400",     icon: Bug,           label: "Debug" },
};

const ALL_LEVELS = ["fatal", "error", "warn", "info", "debug"];
const PAGE_SIZE  = 50;

type ConnState = "connecting" | "open" | "closed";

export function LogsClient() {
  const [logs,     setLogs]     = useState<LogEntry[]>([]);
  const [modules,  setModules]  = useState<string[]>([]);
  const [level,    setLevel]    = useState("");
  const [module,   setModule]   = useState("");
  const [page,     setPage]     = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [connState, setConnState] = useState<ConnState>("connecting");
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const params = new URLSearchParams();
    if (level)  params.set("level",  level);
    if (module) params.set("module", module);

    setConnState("connecting");
    const es = new EventSource(`/api/admin/logs/stream?${params}`);
    esRef.current = es;

    es.addEventListener("init", (e) => {
      const { rows, modules: mods } = JSON.parse(e.data) as { rows: LogEntry[]; modules: string[] };
      setLogs(rows);
      setModules(mods);
      setPage(1);
      setConnState("open");
    });

    es.addEventListener("logs", (e) => {
      const { rows } = JSON.parse(e.data) as { rows: LogEntry[] };
      // Prepend new rows, keep the most recent 500 to avoid unbounded memory growth
      setLogs((prev) => [...rows, ...prev].slice(0, 500));
    });

    es.onerror = () => {
      setConnState("closed");
      // EventSource auto-reconnects; we just reflect the state
    };

    es.onopen = () => setConnState("open");
  }, [level, module]);

  // Reconnect whenever filters change
  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Paginate client-side over the in-memory log buffer
  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const visible    = logs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Logs</h1>
        <div className="flex items-center gap-2">
          {/* Connection status indicator */}
          <span className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium",
            connState === "open"       ? "text-green-600 dark:text-green-400" :
            connState === "connecting" ? "text-amber-500" :
                                         "text-red-500"
          )}>
            {connState === "open"
              ? <Wifi className="h-3.5 w-3.5" />
              : <WifiOff className="h-3.5 w-3.5" />
            }
            {connState === "open" ? "Live" : connState === "connecting" ? "Connecting…" : "Reconnecting…"}
          </span>
          <span className="text-sm text-muted-foreground">{logs.length} entries</span>
          <Button variant="ghost" size="sm" onClick={connect} title="Reconnect">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Level pills */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => { setLevel(""); setPage(1); }}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
              !level ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"
            )}
          >
            All levels
          </button>
          {ALL_LEVELS.map((l) => {
            const s = LEVEL_STYLES[l];
            return (
              <button
                key={l}
                onClick={() => { setLevel(l); setPage(1); }}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  level === l ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {s?.label ?? l}
              </button>
            );
          })}
        </div>

        {/* Module pills */}
        {modules.length > 1 && (
          <div className="flex gap-1 flex-wrap items-center border-l pl-2">
            <button
              onClick={() => { setModule(""); setPage(1); }}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                !module ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              All modules
            </button>
            {modules.map((m) => (
              <button
                key={m}
                onClick={() => { setModule(m); setPage(1); }}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  module === m ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Log entries */}
      <div className="space-y-1.5">
        {connState === "connecting" && logs.length === 0
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))
          : visible.length === 0
          ? (
              <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
                No log entries{level ? ` at level "${level}"` : ""}{module ? ` from "${module}"` : ""}
              </div>
            )
          : visible.map((entry) => {
              const style = LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.info;
              const Icon  = style.icon;
              const isOpen  = expanded.has(entry.id);
              const hasData = entry.data && Object.keys(entry.data).length > 0;

              return (
                <div key={entry.id} className="rounded-lg border overflow-hidden">
                  <button
                    className={cn(
                      "w-full text-left flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30",
                      isOpen && "bg-muted/20"
                    )}
                    onClick={() => hasData && toggle(entry.id)}
                  >
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shrink-0 mt-0.5", style.cls)}>
                      <Icon className="h-3 w-3" />
                      {style.label}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0 mt-0.5">{entry.module}</Badge>
                    <span className="flex-1 text-sm truncate">{entry.message}</span>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {format(new Date(entry.createdAt), "dd MMM HH:mm:ss")}
                    </span>
                    {hasData && (
                      <span className="text-xs text-muted-foreground shrink-0 ml-1">{isOpen ? "▲" : "▼"}</span>
                    )}
                  </button>
                  {isOpen && hasData && (
                    <div className="border-t bg-muted/10 px-3 py-2.5">
                      <pre className="text-xs overflow-auto max-h-48 text-muted-foreground">
                        {JSON.stringify(entry.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span className="text-sm text-muted-foreground">Page {safePage} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
