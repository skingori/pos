import { guardPage } from "@/lib/require-page-permission";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await guardPage("settings.manage");
  return children;
}
