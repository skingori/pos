import { guardPage } from "@/lib/require-page-permission";

export default async function PromotionsLayout({ children }: { children: React.ReactNode }) {
  await guardPage("promotions.manage");
  return children;
}
