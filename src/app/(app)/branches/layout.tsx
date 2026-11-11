import { guardPage } from "@/lib/require-page-permission";

export default async function BranchesLayout({ children }: { children: React.ReactNode }) {
  await guardPage("branches.manage");
  return children;
}
