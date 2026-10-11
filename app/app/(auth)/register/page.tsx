"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { AuthForm } from "@/components/chat/auth-form";
import { SubmitButton } from "@/components/chat/submit-button";
import { toast } from "@/components/chat/toast";
import { type RegisterActionState, register } from "../client-actions";

export default function Page() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<RegisterActionState, FormData>(
    register,
    { status: "idle" }
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: router is a stable ref
  useEffect(() => {
    if (state.status === "user_exists") {
      toast({ description: "Account already exists!", type: "error" });
    } else if (state.status === "failed") {
      toast({ description: "Failed to create account!", type: "error" });
    } else if (state.status === "invalid_data") {
      toast({
        description: "Failed validating your submission!",
        type: "error",
      });
    } else if (state.status === "success") {
      toast({
        description: "Account created. Continue to sign in. If verification is enabled, verify your email first.",
        type: "success",
      });
      router.push("/login");
      setIsSuccessful(true);
    }
  }, [state.status]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
      <p className="text-sm text-slate-500">Create your EarthTekniks account</p>
      <AuthForm action={handleSubmit} defaultEmail={email} passwordAutoComplete="new-password">
        <SubmitButton isSuccessful={isSuccessful}>Sign up</SubmitButton>
        <p className="text-center text-[13px] text-slate-500">
          {"Have an account? "}
          <Link
            className="text-[#003399] underline-offset-4 hover:underline"
            href="/login"
          >
            Sign in
          </Link>
        </p>
      </AuthForm>
    </>
  );
}
