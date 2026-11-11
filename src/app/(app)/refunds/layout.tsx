import { guardPage } from "@/lib/require-page-permission";

export default async function RefundsLayout({ children }: { children: React.ReactNode }) {
  await guardPage("refunds.request");
  return children;
}