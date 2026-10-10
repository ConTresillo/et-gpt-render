import { ArrowLeft, Camera, Ruler, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Toaster } from "sonner";

const FEATURES = [
  { icon: Camera, title: "Product knowledge", text: "Explore inspection systems and catalog specifications." },
  { icon: Ruler, title: "Optics guidance", text: "Review inputs and approve calculations before they run." },
  { icon: ShieldCheck, title: "Your workspace", text: "Return to saved conversations and continue your work." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-[#f4f7fc] text-slate-900 lg:grid lg:grid-cols-2">
    <Toaster position="top-center" theme="light" />
    <section className="relative hidden overflow-hidden bg-[#003399] px-12 py-8 text-white lg:flex lg:flex-col xl:px-20">
      <div className="absolute -right-32 top-32 h-96 w-96 rounded-full border-[48px] border-white/5" aria-hidden="true" />
      <div className="absolute -bottom-40 -left-32 h-[32rem] w-[32rem] rounded-full border-[64px] border-white/5" aria-hidden="true" />
      <Link href="/" className="relative w-fit rounded-xl bg-white px-5 py-3"><img src="/images/earthtekniks-logo.png" alt="Earth Tekniks" className="h-12 w-auto" /></Link>
      <div className="relative my-auto max-w-lg space-y-6 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200">Automation · Inspection · Machine vision</p>
        <h2 className="text-4xl font-semibold leading-tight">Expert guidance.<br />For your next inspection solution.</h2>
        <p className="text-lg leading-relaxed text-blue-100">Explore EarthTekniks products, work through optics calculations, and find answers grounded in our technical knowledge.</p>
        <div className="space-y-4">{FEATURES.map(({ icon: Icon, title, text }) => <div key={title} className="flex gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10"><Icon className="size-5" /></span><div><h3 className="font-medium">{title}</h3><p className="mt-1 text-sm leading-relaxed text-blue-100/80">{text}</p></div></div>)}</div>
      </div>
      <p className="relative text-xs text-blue-100/70">Earth Tekniks · Industrial automation since 2004</p>
    </section>
    <section className="flex min-h-dvh flex-col px-6 py-7 sm:px-12 lg:px-16">
      <Link href="/" className="flex w-fit items-center gap-2 text-sm text-slate-500 hover:text-[#003399]"><ArrowLeft className="size-4" />Back to assistant</Link>
      <div className="mx-auto my-auto w-full max-w-md py-10">
        <img src="/images/earthtekniks-logo.png" alt="Earth Tekniks" className="mb-8 h-12 w-auto lg:hidden" />
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-blue-950/5 sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#003399]">EarthTekniks Assistant</p>
          {children}
        </div>
        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">Need administrator access? Sign in with your administrator account.</p>
      </div>
    </section>
  </main>;
}
