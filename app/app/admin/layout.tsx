import Link from "next/link";
import { Suspense } from "react";
import { auth } from "../(auth)/auth";
import AdminShell from "./_shell";

async function AdminAccess({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user.type !== "admin") return <main className="mx-auto max-w-lg p-8 space-y-4"><h1 className="text-xl font-semibold">Not authorized</h1><p>You need an administrator account to access this page.</p><Link className="underline" href="/login?redirectUrl=%2Fadmin">Sign in as admin</Link><p><Link className="underline" href="/">Back to chat</Link></p></main>;
  return <AdminShell>{children}</AdminShell>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="p-8">Checking admin access…</main>}><AdminAccess>{children}</AdminAccess></Suspense>;
}
