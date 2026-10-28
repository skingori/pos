"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ChangePasswordPage() {
  const { data, update } = useSession();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not change password");
        return;
      }
      await update({ mustChangePassword: false });
      router.replace("/overview");
      router.refresh();
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute inset-0 bg-[var(--sf-sidebar)]" />
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-md rounded-2xl border border-white/15 bg-white p-8 shadow-2xl"
      >
        <h1 className="text-xl font-semibold text-[var(--sf-brand)]">Change password</h1>
        <p className="mt-1 text-sm text-slate-500">
          {data?.user?.email
            ? `Signed in as ${data.user.email}. Set a strong password before using the POS.`
            : "Set a strong password before using the POS."}
        </p>
        {error && <p className="sf-alert sf-alert-error mt-4">{error}</p>}
        <label className="mt-5 block text-sm font-medium">Current password</label>
        <input
          type="password"
          className="sf-input mt-1"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <label className="mt-4 block text-sm font-medium">New password</label>
        <input
          type="password"
          className="sf-input mt-1"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="mt-1 text-xs text-slate-400">At least 8 characters. Not a demo password.</p>
        <label className="mt-4 block text-sm font-medium">Confirm new password</label>
        <input
          type="password"
          className="sf-input mt-1"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <button type="submit" disabled={loading} className="sf-btn sf-btn-accent mt-6 w-full py-2.5">
          {loading ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
