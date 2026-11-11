import { guardPage } from "@/lib/require-page-permission";

export default async function CashLayout({ children }: { children: React.ReactNode }) {
  await guardPage("cash.access");
  return children;
}
