export type CashTab = "open" | "close" | "sessions" | "recon";

export const CASH_TABS: {
  id: CashTab;
  href: string;
  label: string;
}[] = [
  { id: "open", href: "/cash/open-day", label: "Open day" },
  { id: "close", href: "/cash/close-day", label: "Close day" },
  { id: "sessions", href: "/cash/drawer-sessions", label: "Drawer sessions" },
  { id: "recon", href: "/cash/reconciliation", label: "Reconciliation" },
];

export type BranchRef = { id: string; name: string; code: string };
export type StaffRef = { id: string; name: string; email?: string };

export type Movement = {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  createdAt: string;
  user?: { name: string };
};

export type SessionRow = {
  id: string;
  status: string;
  openingFloat: number;
  createdAt: string;
  closedAt: string | null;
  expectedCash: number | null;
  countedCash: number | null;
  expectedMpesa: number | null;
  countedMpesa: number | null;
  cashDifference: number | null;
  mpesaDifference: number | null;
  note: string | null;
  openedBy: { id?: string; name: string; email?: string };
  closedBy?: { id?: string; name: string; email?: string } | null;
  branch?: BranchRef | null;
  _count?: { sales: number; movements?: number; refunds?: number };
};

export type Totals = {
  expectedCash: number;
  expectedMpesa: number;
  cashSales: number;
  mpesaSales: number;
  cashRefunds: number;
  mpesaRefunds: number;
  creditRefunds: number;
  cashIn: number;
  cashOut: number;
};

export type CashData = {
  open: null | (SessionRow & { movements: Movement[] });
  branch?: BranchRef | null;
  filterBranch?: BranchRef | null;
  branches?: BranchRef[];
  staff?: StaffRef[];
  sessions?: SessionRow[];
  openElsewhere?: {
    id: string;
    createdAt: string;
    openingFloat: number;
    branch: BranchRef | null;
    openedBy: { name: string };
  }[];
} & Partial<Totals>;

export type DetailPayload = {
  session: SessionRow & { movements: Movement[] };
  totals: Totals;
};

export function varianceClass(n: number | null | undefined) {
  if (n == null) return "text-slate-500";
  if (Math.abs(n) < 0.005) return "text-emerald-700";
  return n > 0 ? "text-amber-700" : "text-rose-700";
}

export function formatSessionWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}
