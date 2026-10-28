import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { roundMoney } from "@/lib/money";
import { getSessionMoneyTotals } from "@/lib/session-totals";
import { postCashMovementJournal, postJournal, CODES, ensureChartOfAccounts } from "@/lib/gl";
import { cookies } from "next/headers";
import { BRANCH_COOKIE, resolveBranch, resolveBranchId } from "@/lib/branch";

function startOfDay(ymd: string) {
  return new Date(`${ymd}T00:00:00`);
}

function endOfDay(ymd: string) {
  return new Date(`${ymd}T23:59:59.999`);
}

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const detailId = searchParams.get("sessionId");

  const person = { select: { id: true, name: true, email: true } };

  if (detailId) {
    const session = await prisma.posSession.findUnique({
      where: { id: detailId },
      include: {
        openedBy: person,
        closedBy: person,
        branch: { select: { id: true, code: true, name: true } },
        movements: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { name: true } } },
        },
        _count: { select: { sales: true, refunds: true } },
      },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (
      user.role === "ATTENDANT" &&
      user.branchId &&
      session.branchId !== user.branchId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const totals = await getSessionMoneyTotals(session.id);
    return NextResponse.json({ session, totals });
  }

  const activeBranchId = await resolveBranchId(user);
  const activeBranch = await prisma.branch.findUnique({ where: { id: activeBranchId } });

  const canPickBranch = user.role === "ADMIN" || user.role === "MANAGER";
  const filterBranchId = canPickBranch
    ? searchParams.get("branchId") || activeBranchId
    : activeBranchId;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");
  const userId = searchParams.get("userId");

  const open = await prisma.posSession.findFirst({
    where: { status: "OPEN", branchId: activeBranchId },
    include: {
      openedBy: person,
      closedBy: person,
      branch: { select: { id: true, code: true, name: true } },
      movements: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      },
      _count: { select: { sales: true, refunds: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const where: {
    branchId: string;
    status?: "OPEN" | "CLOSED";
    openedById?: string;
    createdAt?: { gte?: Date; lte?: Date };
  } = { branchId: filterBranchId };

  if (status === "OPEN" || status === "CLOSED") where.status = status;
  if (userId) where.openedById = userId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = startOfDay(from);
    if (to) where.createdAt.lte = endOfDay(to);
  }

  const sessions = await prisma.posSession.findMany({
    where,
    take: 100,
    orderBy: { createdAt: "desc" },
    include: {
      openedBy: person,
      closedBy: person,
      branch: { select: { id: true, code: true, name: true } },
      _count: { select: { sales: true, movements: true, refunds: true } },
    },
  });

  const [branches, staff] = await Promise.all([
    canPickBranch
      ? prisma.branch.findMany({
          where: { active: true },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true },
        })
      : activeBranch
        ? Promise.resolve([activeBranch])
        : Promise.resolve([]),
    prisma.user.findMany({
      where: {
        active: true,
        ...(canPickBranch ? {} : user.branchId ? { branchId: user.branchId } : { id: user.id }),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  let openElsewhere: {
    id: string;
    createdAt: Date;
    openingFloat: number;
    branch: { id: string; code: string; name: string } | null;
    openedBy: { name: string };
  }[] = [];

  if (canPickBranch) {
    openElsewhere = await prisma.posSession.findMany({
      where: {
        status: "OPEN",
        ...(open ? { id: { not: open.id } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        openedBy: { select: { name: true } },
        branch: { select: { id: true, code: true, name: true } },
      },
    });
  }

  const filterBranch =
    branches.find((b) => b.id === filterBranchId) || activeBranch;

  if (!open) {
    return NextResponse.json({
      open: null,
      sessions,
      branch: activeBranch,
      filterBranch,
      branches,
      staff,
      openElsewhere,
    });
  }

  const totals = await getSessionMoneyTotals(open.id);

  return NextResponse.json({
    open,
    sessions,
    branch: activeBranch,
    filterBranch,
    branches,
    staff,
    openElsewhere,
    ...totals,
  });
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const body = await req.json();
  const action = body.action as string;

  if (action === "open") {
    const branch =
      body.branchId && (user.role === "ADMIN" || user.role === "MANAGER")
        ? await prisma.branch.findFirst({ where: { id: body.branchId, active: true } })
        : await resolveBranch(user);
    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 400 });
    }

    const existing = await prisma.posSession.findFirst({
      where: { status: "OPEN", branchId: branch.id },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Till already open at ${branch.name}` },
        { status: 400 }
      );
    }

    const floatAmt = roundMoney(Number(body.openingFloat) || 0);
    if (floatAmt < 0) {
      return NextResponse.json({ error: "Opening float cannot be negative" }, { status: 400 });
    }

    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.posSession.create({
        data: {
          openedById: user.id,
          branchId: branch.id,
          openingFloat: floatAmt,
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          openedBy: { select: { id: true, name: true } },
        },
      });
      if (floatAmt > 0) {
        await ensureChartOfAccounts(tx);
        await postJournal(tx, {
          memo: `Opening float ${branch.code} session ${s.id.slice(0, 8)}`,
          sourceType: "PosSession",
          sourceId: s.id,
          lines: [
            { code: CODES.CASH, debit: floatAmt },
            { code: CODES.EQUITY, credit: floatAmt },
          ],
        });
      }
      return s;
    });
    if (user.role === "ADMIN" || user.role === "MANAGER") {
      const jar = await cookies();
      jar.set(BRANCH_COOKIE, branch.id, {
        path: "/",
        sameSite: "lax",
        httpOnly: false,
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    await writeAudit({
      userId: user.id,
      action: "OPEN_SESSION",
      entity: "PosSession",
      entityId: session.id,
      detail: `${branch.code} float ${floatAmt}`,
    });
    return NextResponse.json(session, { status: 201 });
  }

  if (action === "move") {
    const branchId = await resolveBranchId(user);
    const open = await prisma.posSession.findFirst({
      where: { status: "OPEN", branchId },
    });
    if (!open) return NextResponse.json({ error: "No open drawer session" }, { status: 400 });

    const amount = roundMoney(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter a valid amount greater than 0" }, { status: 400 });
    }
    const type = body.type === "OUT" ? "OUT" : "IN";
    const note = String(body.note || "").trim() || null;

    const movement = await prisma.$transaction(async (tx) => {
      const m = await tx.cashMovement.create({
        data: {
          sessionId: open.id,
          userId: user.id,
          type,
          amount,
          note,
        },
      });
      await postCashMovementJournal(tx, m);
      return m;
    });
    await writeAudit({
      userId: user.id,
      action: "CASH_MOVE",
      entity: "CashMovement",
      entityId: movement.id,
      detail: `${type} ${amount}${note ? ` — ${note}` : ""}`,
    });
    return NextResponse.json(movement, { status: 201 });
  }

  if (action === "close") {
    const branchId = await resolveBranchId(user);
    const open = await prisma.posSession.findFirst({
      where: { status: "OPEN", branchId },
      include: { branch: true },
    });
    if (!open) return NextResponse.json({ error: "No open drawer session" }, { status: 400 });

    const countedCash = Number(body.countedCash);
    const countedMpesa = Number(body.countedMpesa);
    if (!Number.isFinite(countedCash) || countedCash < 0) {
      return NextResponse.json({ error: "Enter counted cash" }, { status: 400 });
    }
    if (!Number.isFinite(countedMpesa) || countedMpesa < 0) {
      return NextResponse.json({ error: "Enter counted M-Pesa" }, { status: 400 });
    }

    const totals = await getSessionMoneyTotals(open.id);
    const cashDifference = roundMoney(countedCash - totals.expectedCash);
    const mpesaDifference = roundMoney(countedMpesa - totals.expectedMpesa);

    const closed = await prisma.posSession.update({
      where: { id: open.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedById: user.id,
        expectedCash: totals.expectedCash,
        expectedMpesa: totals.expectedMpesa,
        countedCash: roundMoney(countedCash),
        countedMpesa: roundMoney(countedMpesa),
        cashDifference,
        mpesaDifference,
        note: String(body.note || "").trim() || null,
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        openedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await writeAudit({
      userId: user.id,
      action: "CLOSE_SESSION",
      entity: "PosSession",
      entityId: closed.id,
      detail: `${open.branch?.code || "branch"} cash diff ${cashDifference}, mpesa diff ${mpesaDifference}`,
    });

    return NextResponse.json({ ...closed, totals });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
