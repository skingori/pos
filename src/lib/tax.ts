import { roundMoney } from "./money";

/** Split inclusive or exclusive VAT from a net-after-discount amount. */
export function computeTax(opts: {
  amountAfterDiscount: number;
  vatPercent: number;
  pricesIncludeVat: boolean;
}) {
  const rate = Number(opts.vatPercent) || 0;
  const amount = Number(opts.amountAfterDiscount) || 0;
  if (rate <= 0) {
    return { taxAmount: 0, total: roundMoney(amount), net: roundMoney(amount) };
  }
  if (opts.pricesIncludeVat) {
    const net = roundMoney(amount / (1 + rate / 100));
    const taxAmount = roundMoney(amount - net);
    return { taxAmount, total: roundMoney(amount), net };
  }
  const taxAmount = roundMoney(amount * (rate / 100));
  return { taxAmount, total: roundMoney(amount + taxAmount), net: roundMoney(amount) };
}
