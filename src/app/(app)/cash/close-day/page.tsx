import { redirect } from "next/navigation";

export default function CloseDayPage() {
  redirect("/cash/drawer-sessions?action=close");
}
