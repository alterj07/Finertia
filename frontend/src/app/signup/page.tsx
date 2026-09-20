"use client";

import { Suspense, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

const INPUT =
  "w-full rounded-sm border border-rule bg-paper px-2.5 py-2 text-sm text-ink outline-none focus:border-ink-soft";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const signup = useAuthStore((s) => s.signup);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setPending(true);
    try {
      await signup(email, password, name);
      router.replace(params.get("next") ?? "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed");
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-[340px] border border-rule bg-paper-raised px-6 py-7">
        <div className="mb-6 flex items-center gap-2.5">
          <Image src="/logo.png" alt="" width={40} height={40} />
          <div>
            <div className="font-serif text-xl leading-none text-ink">Finertia</div>
            <div className="mt-1 text-2xs text-ink-soft">Agentic Finance OS</div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label htmlFor="signup-name" className="mb-1 block text-xs text-ink-soft">
              Full name
            </label>
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="signup-email" className="mb-1 block text-xs text-ink-soft">
              Company email
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="signup-pw" className="mb-1 block text-xs text-ink-soft">
              Password
            </label>
            <input
              id="signup-pw"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
            <p className="mt-1 text-2xs text-ink-soft">At least 8 characters</p>
          </div>
          <div>
            <label htmlFor="signup-pw2" className="mb-1 block text-xs text-ink-soft">
              Confirm password
            </label>
            <input
              id="signup-pw2"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={INPUT}
            />
          </div>
          {error && <p className="text-xs text-rust">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-sm bg-ink py-2 text-sm text-paper hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-ink-soft">
          Already have an account?{" "}
          <Link href="/login" className="text-ink underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
