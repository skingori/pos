import { guardPage } from "@/lib/require-page-permission";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  await guardPage("sales.view");
  return children;
}
