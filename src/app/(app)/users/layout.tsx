import { guardPage } from "@/lib/require-page-permission";

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  await guardPage("users.manage");
  return children;
}
