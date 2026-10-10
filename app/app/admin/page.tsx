"use client";
import useSWR from "swr";
import Link from "next/link";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
const fetcher = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error("Dashboard could not load"); return r.json(); };
export default function AdminOverviewPage() {
 const { data, error, isLoading } = useSWR("/api/admin/stats", fetcher, { refreshInterval: 30000 });
 const { data: insights } = useSWR("/api/admin/insights", fetcher);
 const latest = insights?.data?.[0]; const totals = data?.totals;
 return <div className="space-y-6"><h1 className="text-xl font-semibold">Overview</h1>{error && <p role="alert">{error.message}</p>}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[["Registered users", totals?.users], ["Guest sessions", totals?.guests], ["Total chats", totals?.chats], ["Active users (7d)", totals?.activeUsers7d]].map(([label,value]) => <div key={String(label)} className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-3">{isLoading ? "…" : Number(value ?? 0).toLocaleString()}</p></div>)}</div>
 <section className="rounded-xl border bg-card p-5 space-y-3"><div className="flex justify-between"><h2 className="font-medium">Current customer insights</h2><Link className="text-sm text-primary" href="/admin/insights">View insights</Link></div>{latest ? <><p className="text-sm font-medium">{latest.headline ?? `Analysis ${latest.status}`}</p><p className="text-sm text-muted-foreground">{latest.overview}</p>{latest.trendSummary && <p className="text-sm">{latest.trendSummary}</p>}<ul className="text-sm space-y-1">{latest.recommendations?.map((value: string, index: number) => <li key={index}>{value}</li>)}</ul></> : <p className="text-sm text-muted-foreground">No report yet.</p>}</section>
 {[["Messages per day (last 30 days)", data?.daily ?? [], "messages"], ["New users per day (last 30 days)", data?.dailyUsers ?? [], "users"]].map(([label,rows,key]) => <section key={String(key)} className="rounded-xl border bg-card p-5"><h2 className="text-sm font-medium mb-4">{String(label)}</h2><ResponsiveContainer width="100%" height={220}><AreaChart data={rows as any[]}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="day" tickFormatter={value => String(value).slice(5,10)}/><YAxis allowDecimals={false}/><Tooltip/><Area dataKey={String(key)} stroke="#003399" fill="#003399" fillOpacity={0.15}/></AreaChart></ResponsiveContainer></section>)}
 </div>;
}
