import { redirect } from "next/navigation";

export default function OpenDayPage() {
  redirect("/cash/drawer-sessions?action=open");
}
