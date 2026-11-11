import { guardPage } from "@/lib/require-page-permission";

export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  await guardPage("purchasing.view");
  return children;
}
