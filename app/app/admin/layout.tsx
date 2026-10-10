import Link from "next/link";
import { Suspense } from "react";
import { auth } from "../(auth)/auth";
import AdminShell from "./_shell";

async function AdminAccess({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user.type !== "admin") return <main className="flex min-h-dvh items-center justify-center bg-[#f4f7fc] px-6 text-slate-900"><section className="w-full max-w-md space-y-5 rounded-2xl border border-blue-100 bg-white p-8 shadow-xl shadow-blue-950/5"><img src="/images/earthtekniks-logo.png" alt="Earth Tekniks" className="h-12 w-auto" /><p className="text-xs font-semibold uppercase tracking-widest text-[#003399]">Admin workspace</p><h1 className="text-2xl font-semibold">Not authorized</h1><p className="text-sm leading-relaxed text-slate-600">You need an administrator account to access this page.</p><Link className="flex h-12 items-center justify-center rounded-xl bg-[#003399] font-medium text-white hover:bg-[#00266f]" href="/login?redirectUrl=%2Fadmin">Sign in as admin</Link><p className="text-center text-sm"><Link className="text-slate-500 hover:text-[#003399]" href="/">Back to chat</Link></p></section></main>;
  return <AdminShell>{children}</AdminShell>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="p-8">Checking admin access…</main>}><AdminAccess>{children}</AdminAccess></Suspense>;
}
