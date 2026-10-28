export function formatKes(amount: number) {
  return `KSh ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function suggestedSellPrice(cost: number, markupPercent: number) {
  return roundMoney(Number(cost) * (1 + Number(markupPercent) / 100));
}

export function marginPercent(cost: number, sellPrice: number) {
  if (!sellPrice || sellPrice <= 0) return 0;
  return roundMoney(((sellPrice - cost) / sellPrice) * 100);
}
