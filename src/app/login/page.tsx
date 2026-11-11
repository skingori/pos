"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const isProd = process.env.NODE_ENV === "production";

function HardwareStage({ shopName }: { shopName: string }) {
  return (
    <div className="relative hidden h-full min-h-screen overflow-hidden bg-[#1a1410] lg:block">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,_#ea580c33_0%,_transparent_45%),radial-gradient(ellipse_at_80%_70%,_#b4530933_0%,_transparent_50%),linear-gradient(160deg,_#1c1917_0%,_#0c0a09_100%)]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(251,146,60,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(251,146,60,.35)_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="absolute -left-16 top-24 size-72 rounded-full bg-orange-500/20 blur-3xl" />
      <div className="absolute bottom-10 right-0 size-80 rounded-full bg-amber-700/20 blur-3xl" />

      <div className="relative z-10 flex h-full flex-col justify-between px-12 py-14 xl:px-16">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-orange-300/90">
            Point of Sale
          </p>
          <h1 className="sf-display mt-4 max-w-lg text-4xl font-extrabold leading-[1.05] tracking-tight text-white xl:text-5xl">
            {shopName}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-stone-300">
            Sell fasteners, tools, and trade supplies from the counter — stock, credit, and cash in
            one place.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-lg flex-1">
          <svg
            viewBox="0 0 520 420"
            className="absolute inset-x-0 top-[8%] h-[min(58vh,420px)] w-full drop-shadow-[0_30px_60px_rgba(0,0,0,.45)]"
            aria-hidden
          >
            <g className="origin-center animate-[login-float_7s_ease-in-out_infinite]">
              <rect x="70" y="250" width="380" height="18" rx="4" fill="#44403c" />
              <rect x="90" y="200" width="110" height="50" rx="6" fill="#57534e" />
              <rect x="210" y="170" width="130" height="80" rx="6" fill="#78716c" />
              <rect x="350" y="210" width="90" height="40" rx="6" fill="#57534e" />
              <rect x="100" y="140" width="70" height="60" rx="4" fill="#a8a29e" opacity="0.85" />
              <rect x="230" y="110" width="90" height="60" rx="4" fill="#d6d3d1" opacity="0.9" />
            </g>

            <g className="origin-[120px_280px] animate-[login-tilt_6s_ease-in-out_infinite]">
              <path
                d="M70 300c40-8 70-4 95 18l58-58 22 22-58 58c24 28 30 58 18 95l-28-12c8-24 4-46-12-64-18-18-40-24-66-16l-29-29z"
                fill="#f97316"
              />
              <circle cx="78" cy="308" r="16" fill="#fdba74" />
              <circle cx="78" cy="308" r="7" fill="#1c1917" />
            </g>

            <g className="origin-[380px_120px] animate-[login-float_5.5s_ease-in-out_infinite_reverse]">
              <rect x="350" y="70" width="22" height="110" rx="6" fill="#a8a29e" />
              <path d="M340 70h42l-8 28h-26l-8-28z" fill="#ea580c" />
              <rect x="356" y="175" width="10" height="48" rx="3" fill="#78716c" />
            </g>

            <g className="animate-[login-spin_18s_linear_infinite]" style={{ transformOrigin: "420px 300px" }}>
              <circle cx="420" cy="300" r="34" fill="none" stroke="#fb923c" strokeWidth="10" />
              <circle cx="420" cy="300" r="12" fill="#1c1917" stroke="#fdba74" strokeWidth="4" />
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <rect
                  key={deg}
                  x="412"
                  y="258"
                  width="16"
                  height="18"
                  rx="3"
                  fill="#f97316"
                  transform={`rotate(${deg} 420 300)`}
                />
              ))}
            </g>

            <g className="animate-[login-float_8s_ease-in-out_infinite]" style={{ transformOrigin: "200px 80px" }}>
              <circle cx="180" cy="70" r="18" fill="none" stroke="#fdba74" strokeWidth="7" />
              <circle cx="220" cy="70" r="18" fill="none" stroke="#fb923c" strokeWidth="7" />
              <line x1="198" y1="70" x2="202" y2="70" stroke="#a8a29e" strokeWidth="4" />
            </g>

            <text x="40" y="50" fill="#fdba74" fontSize="11" fontWeight="700" letterSpacing="2">
              TRADE COUNTER
            </text>
            <text x="380" y="380" fill="#a8a29e" fontSize="11" fontWeight="600" letterSpacing="1.5">
              TOOLS · FASTENERS · BUILD
            </text>
          </svg>
        </div>

        <p className="text-xs text-stone-500">
          Built for Kenyan hardware &amp; building supplies shops by @tarclink
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [shopName, setShopName] = useState("Shop");
  const [email, setEmail] = useState(isProd ? "" : "admin@example.com");
  const [password, setPassword] = useState(isProd ? "" : "admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/branding")
      .then((r) => r.json())
      .catch(() => null)
      .then((branding) => {
        if (cancelled || !branding?.shopName) return;
        setShopName(String(branding.shopName));
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div className="grid min-h-screen lg:grid-cols-2">
      <HardwareStage shopName={shopName} />

      <div className="relative flex min-h-screen items-center justify-center bg-[#f7f4f0] px-5 py-10 sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#fed7aa55_0%,_transparent_40%),radial-gradient(ellipse_at_bottom_left,_#e7e5e480_0%,_transparent_45%)]" />

        <form
          onSubmit={onSubmit}
          className="relative w-full max-w-[400px] rounded-2xl border border-stone-200/80 bg-white p-7 shadow-[0_24px_60px_-28px_rgba(28,25,23,.35)] sm:p-9"
        >
          <div className="mb-6 lg:hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--sf-accent)]">
              Point of Sale
            </p>
            <h1 className="sf-display mt-2 text-2xl font-extrabold tracking-tight text-stone-900">
              {shopName}
            </h1>
          </div>

          <div className="hidden lg:block">
            <h2 className="sf-display text-2xl font-extrabold tracking-tight text-stone-900">
              Sign in
            </h2>
            <p className="mt-1.5 text-sm text-stone-500">
              Use your staff account to open the till and sell.
            </p>
          </div>

          {error && (
            <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
              {error}
            </p>
          )}

          <label className="mt-6 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            Email
            <input
              className="sf-input mt-1.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="text"
              autoComplete="username"
              required
            />
          </label>
          <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            Password
            <input
              className="sf-input mt-1.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete="current-password"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="sf-btn sf-btn-accent mt-7 w-full py-2.5 text-sm font-bold tracking-wide"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>

    </div>
  );
}
