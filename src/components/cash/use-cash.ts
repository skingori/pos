"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CashData, DetailPayload } from "@/lib/cash-ui";

export function useCash(filters?: {
  branchId?: string;
  from?: string;
  to?: string;
  status?: string;
  userId?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<CashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters?.branchId) params.set("branchId", filters.branchId);
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    if (filters?.status && filters.status !== "all") params.set("status", filters.status);
    if (filters?.userId) params.set("userId", filters.userId);
    const res = await fetch(`/api/cash?${params}`);
    const body = await res.json();
    setData(body);
    setLoading(false);
    return body as CashData;
  }, [filters?.branchId, filters?.from, filters?.to, filters?.status, filters?.userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDay(openingFloat: number, branchId?: string) {
    setError("");
    setBusy(true);
    const res = await fetch("/api/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open", openingFloat, branchId }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Failed to open session");
      return false;
    }
    await load();
    router.refresh();
    return true;
  }

  async function closeDay(input: {
    countedCash: number;
    countedMpesa: number;
    note?: string;
  }) {
    setError("");
    setBusy(true);
    const res = await fetch("/api/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close", ...input }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Failed to close session");
      return null;
    }
    await load();
    router.refresh();
    return body;
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    const res = await fetch(`/api/cash?sessionId=${id}`);
    const body = await res.json();
    setDetailLoading(false);
    if (!res.ok) {
      setError(body.error || "Could not load session");
      return;
    }
    setDetail(body);
  }

  const branchName = data?.branch?.name || "Branch";
  const expectedCash = data?.expectedCash ?? data?.open?.openingFloat ?? 0;
  const formulaHint = data?.open
    ? `opening ${expectedCash.toFixed?.(2) ?? expectedCash} + cash sales - paid-out + paid-in`
    : "";

  return {
    data,
    loading,
    error,
    setError,
    busy,
    showMove,
    setShowMove,
    detail,
    setDetail,
    detailLoading,
    load,
    openDay,
    closeDay,
    openDetail,
    branchName,
    expectedCash: data?.expectedCash || 0,
    formulaHint: data
      ? `opening KSh ${(data.open?.openingFloat || 0).toLocaleString()} + cash sales KSh ${(data.cashSales || 0).toLocaleString()} + paid-in KSh ${(data.cashIn || 0).toLocaleString()} - paid-out KSh ${(data.cashOut || 0).toLocaleString()}`
      : "",
  };
}
