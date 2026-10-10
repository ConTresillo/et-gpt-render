import Form from "next/form";

import { Input } from "../ui/input";
import { Label } from "../ui/label";

export function AuthForm({
  action,
  children,
  defaultEmail = "",
  passwordAutoComplete = "current-password",
}: {
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultEmail?: string;
  passwordAutoComplete?: "current-password" | "new-password";
}) {
  return (
    <Form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label className="font-medium text-slate-600" htmlFor="email">
          Email
        </Label>
        <Input
          autoComplete="email"
          autoFocus
          className="h-12 rounded-xl border-slate-200 bg-slate-50 text-slate-900 text-sm transition-colors focus:border-[#003399] focus:bg-white"
          defaultValue={defaultEmail}
          id="email"
          name="email"
          placeholder="you@company.com"
          required
          type="email"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="font-medium text-slate-600" htmlFor="password">
          Password
        </Label>
        <Input
          className="h-12 rounded-xl border-slate-200 bg-slate-50 text-slate-900 text-sm transition-colors focus:border-[#003399] focus:bg-white"
          id="password"
          name="password"
          autoComplete={passwordAutoComplete}
          placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
          required
          type="password"
        />
      </div>

      {children}
    </Form>
  );
}
