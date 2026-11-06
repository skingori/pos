import { formatKes, roundMoney } from "@/lib/money";

export type ReceiptPayment = { method: string; amount: number; mpesaReceipt?: string | null };

export type AccountSlipLine = { label: string; value: string; bold?: boolean };

/** Short, clear account lines for bill/receipt slips (no raw negatives). */
export function buildAccountSlipLines(opts: {
  prevBal: number | null;
  payments: ReceiptPayment[];
  isBill: boolean;
}): AccountSlipLine[] | null {
  const payments = opts.payments || [];
  const creditAmt = roundMoney(
    payments.filter((p) => p.method === "CREDIT").reduce((s, p) => s + Number(p.amount || 0), 0)
  );
  const collectNow = roundMoney(
    payments
      .filter((p) => p.method !== "CREDIT")
      .reduce((s, p) => s + Number(p.amount || 0), 0)
  );
  const prev = opts.prevBal != null && Number.isFinite(opts.prevBal) ? roundMoney(opts.prevBal) : null;
  const storeCredit = prev != null ? Math.max(0, -prev) : 0;
  const owing = prev != null ? Math.max(0, prev) : 0;

  const usingStoreCreditOnly =
    creditAmt > 0.009 && storeCredit > 0.009 && creditAmt <= storeCredit + 0.01;
  const puttingOnAccount = creditAmt > 0.009 && !usingStoreCreditOnly;

  if (
    creditAmt <= 0.009 &&
    !(opts.isBill && prev != null && (storeCredit > 0.009 || owing > 0.009))
  ) {
    return null;
  }

  const lines: AccountSlipLine[] = [];

  if (prev != null) {
    if (storeCredit > 0.009) {
      lines.push({ label: "Your store credit", value: formatKes(storeCredit) });
    } else if (owing > 0.009) {
      lines.push({ label: "Your balance owing", value: formatKes(owing) });
    } else {
      lines.push({ label: "Account balance", value: formatKes(0) });
    }
  }

  if (usingStoreCreditOnly) {
    lines.push({ label: "Store credit applied", value: `−${formatKes(creditAmt)}` });
    if (opts.isBill && collectNow > 0.009) {
      lines.push({ label: "Amount due", value: formatKes(collectNow) });
    }
    if (prev != null) {
      const left = roundMoney(storeCredit - creditAmt);
      lines.push({
        label: left > 0.009 ? "Store credit remaining" : "Account balance",
        value: formatKes(Math.max(0, left)),
        bold: true,
      });
    }
    return lines;
  }

  if (puttingOnAccount) {
    lines.push({
      label: opts.isBill ? "This bill on account" : "Charged to account",
      value: formatKes(creditAmt),
    });
    if (opts.isBill && collectNow > 0.009) {
      lines.push({ label: "Deposit toward bill", value: `−${formatKes(collectNow)}` });
    }
    if (prev != null) {
      const after = roundMoney(prev + creditAmt);
      if (after > 0.009) {
        lines.push({
          label: opts.isBill ? "Balance after this bill" : "Your balance",
          value: formatKes(after),
          bold: true,
        });
      } else if (after < -0.009) {
        lines.push({
          label: "Store credit remaining",
          value: formatKes(Math.abs(after)),
          bold: true,
        });
      } else {
        lines.push({ label: "Account balance", value: formatKes(0), bold: true });
      }
    }
    return lines;
  }

  return lines.length ? lines : null;
}

export function paymentMethodLabel(method: string) {
  switch (method) {
    case "CASH":
      return "Cash";
    case "MPESA":
      return "M-Pesa";
    case "CARD":
      return "Card";
    case "BANK":
      return "Bank";
    case "CREDIT":
      return "On account";
    default:
      return method;
  }
}
