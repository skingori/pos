import { guardPage } from "@/lib/require-page-permission";

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await guardPage("inventory.view");
  return children;
}
