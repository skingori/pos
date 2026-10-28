import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveBranch } from "@/lib/branch";
import { format } from "date-fns";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/change-password");

  const branch = await resolveBranch(user);
  const open = await prisma.posSession.findFirst({
    where: { status: "OPEN", branchId: branch.id },
    include: { openedBy: true, branch: true },
    orderBy: { createdAt: "desc" },
  });

  const sessionLabel = open
    ? `${branch.name} OPEN since ${format(open.createdAt, "MMM d")} by ${open.openedBy.name} · opening ${open.openingFloat.toFixed(2)}`
    : `${branch.name} — no open session (open the day from Cash)`;

  return (
    <AppShell
      sessionLabel={sessionLabel}
      activeBranch={{ id: branch.id, name: branch.name, code: branch.code }}
      tillOpen={Boolean(open)}
    >
      {children}
    </AppShell>
  );
}
