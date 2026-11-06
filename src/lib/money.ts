/** Hard ceiling for a single unit price on the till (keeps layout & math sane). */
export const MAX_UNIT_PRICE = 99_999_999.99;

/** Amount only, always 2 decimals (for tight table columns). */
export function formatKesAmount(amount: number) {
  const n = Number.isFinite(amount) ? amount : 0;
  return n.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatKes(amount: number) {
  return `KSh ${formatKesAmount(amount)}`;
}

export function roundMoney(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function clampUnitPrice(n: number) {
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundMoney(Math.min(n, MAX_UNIT_PRICE));
}

export function suggestedSellPrice(cost: number, markupPercent: number) {
  return roundMoney(Number(cost) * (1 + Number(markupPercent) / 100));
}

export function marginPercent(cost: number, sellPrice: number) {
  if (!sellPrice || sellPrice <= 0) return 0;
  return roundMoney(((sellPrice - cost) / sellPrice) * 100);
}
