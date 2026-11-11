import { guardPage } from "@/lib/require-page-permission";

export default async function ReceiptsLayout({ children }: { children: React.ReactNode }) {
  await guardPage("receipts.access");
  return children;
}
