"use client";

import { Suspense, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await login(identifier, password);
      router.replace(params.get("next") ?? "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed");
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
            <label htmlFor="login-id" className="mb-1 block text-xs text-ink-soft">
              Company email
            </label>
            <input
              id="login-id"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-sm border border-rule bg-paper px-2.5 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
          </div>
          <div>
            <label htmlFor="login-pw" className="mb-1 block text-xs text-ink-soft">
              Password
            </label>
            <input
              id="login-pw"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-sm border border-rule bg-paper px-2.5 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
          </div>
          {error && <p className="text-xs text-rust">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-sm bg-ink py-2 text-sm text-paper hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-ink-soft">
          Need an account?{" "}
          <Link href="/signup" className="text-ink underline underline-offset-2">
            Sign up
          </Link>
        </p>
        <p className="mt-3 text-center font-mono text-2xs text-ink-soft">
          Demo account: admin (password provided separately)
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
