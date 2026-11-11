import { guardPage } from "@/lib/require-page-permission";

export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  await guardPage("accounting.view");
  return children;
}
