import { guardPage } from "@/lib/require-page-permission";

export default async function CustomersLayout({ children }: { children: React.ReactNode }) {
  await guardPage("customers.access");
  return children;
}
