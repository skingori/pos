import { guardPage } from "@/lib/require-page-permission";

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await guardPage("reports.view");
  return children;
}
