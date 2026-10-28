"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const isProd = process.env.NODE_ENV === "production";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(isProd ? "" : "admin@example.com");
  const [password, setPassword] = useState(isProd ? "" : "admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: "/overview",
      });
      if (res?.error) {
        setError("Invalid email or password");
        return;
      }
      router.push(res?.url || "/overview");
      router.refresh();
    } catch {
      setError("Sign-in failed. Check you are on the same host as the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="absolute inset-0 bg-[var(--sf-sidebar)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#0d948840_0%,_transparent_50%),radial-gradient(ellipse_at_bottom_left,_#0f274480_0%,_transparent_55%)]" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:48px_48px]" />

      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-md rounded-2xl border border-white/15 bg-white/95 p-8 shadow-[0_30px_80px_-20px_rgb(0_0_0_/_55%)] backdrop-blur-xl"
      >
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--sf-accent)]">
          Stockflow POS
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">
          Kenya Hardware
        </h1>
        <p className="mt-1 text-sm text-[var(--sf-muted)]">Sign in to continue</p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
            {error}
          </p>
        )}

        <label className="mt-6 block text-sm font-medium text-slate-700">Email</label>
        <input
          className="sf-input mt-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="text"
          autoComplete="username"
          required
        />
        {!isProd && (
          <p className="mt-1 text-xs text-slate-400">Dev: admin@example.com / admin123</p>
        )}

        <label className="mt-4 block text-sm font-medium text-slate-700">Password</label>
        <input
          className="sf-input mt-1"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          autoComplete="current-password"
        />

        <button type="submit" disabled={loading} className="sf-btn sf-btn-accent mt-6 w-full py-2.5">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
