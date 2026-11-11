import { guardPage } from "@/lib/require-page-permission";

export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  await guardPage("audit.view");
  return children;
}
