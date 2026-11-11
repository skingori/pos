import { guardPage } from "@/lib/require-page-permission";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  await guardPage("pos.access");
  return children;
}
