import { Role } from "@prisma/client";

export const PERMISSIONS = [
  "pos.access",
  "cash.access",
  "sales.view",
  "receipts.access",
  "customers.access",
  "customers.credit_limit",
  "receivables.write_off",
  "refunds.request",
  "refunds.approve",
  "sales.credit",
  "price.override",
  "inventory.view",
  "inventory.manage",
  "purchasing.view",
  "purchasing.manage",
  "reports.view",
  "accounting.view",
  "audit.view",
  "promotions.manage",
  "users.manage",
  "branches.manage",
  "settings.manage",
  "roles.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_META: {
  key: Permission;
  label: string;
  group: "Operations" | "Commerce" | "Stock" | "Insights" | "Admin";
}[] = [
  { key: "pos.access", label: "POS", group: "Operations" },
  { key: "cash.access", label: "Cash drawer", group: "Operations" },
  { key: "sales.view", label: "Sales history", group: "Operations" },
  { key: "receipts.access", label: "Receipts", group: "Commerce" },
  { key: "customers.access", label: "Customers & collect", group: "Commerce" },
  { key: "customers.credit_limit", label: "Set credit limits", group: "Commerce" },
  { key: "receivables.write_off", label: "Write off balances", group: "Commerce" },
  { key: "refunds.request", label: "Request refunds", group: "Commerce" },
  { key: "refunds.approve", label: "Approve refunds / void", group: "Commerce" },
  { key: "sales.credit", label: "Credit sales", group: "Commerce" },
  { key: "price.override", label: "Discount / price override", group: "Commerce" },
  { key: "inventory.view", label: "View inventory", group: "Stock" },
  { key: "inventory.manage", label: "Manage inventory", group: "Stock" },
  { key: "purchasing.view", label: "View purchasing", group: "Stock" },
  { key: "purchasing.manage", label: "Manage purchasing", group: "Stock" },
  { key: "reports.view", label: "Reports & AR aging", group: "Insights" },
  { key: "accounting.view", label: "Accounting", group: "Insights" },
  { key: "audit.view", label: "Audit logs", group: "Insights" },
  { key: "promotions.manage", label: "Promotions", group: "Admin" },
  { key: "users.manage", label: "Manage users", group: "Admin" },
  { key: "branches.manage", label: "Manage branches", group: "Admin" },
  { key: "settings.manage", label: "Shop settings", group: "Admin" },
  { key: "roles.manage", label: "Edit role templates", group: "Admin" },
];

/** Ops-focused defaults used to seed RolePermission templates. */
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [...PERMISSIONS],
  MANAGER: [
    "pos.access",
    "cash.access",
    "sales.view",
    "receipts.access",
    "customers.access",
    "customers.credit_limit",
    "receivables.write_off",
    "refunds.request",
    "refunds.approve",
    "sales.credit",
    "price.override",
    "inventory.view",
    "inventory.manage",
    "purchasing.view",
    "purchasing.manage",
    "reports.view",
    "accounting.view",
    "audit.view",
    "promotions.manage",
  ],
  ATTENDANT: [
    "pos.access",
    "cash.access",
    "sales.view",
    "receipts.access",
    "customers.access",
    "refunds.request",
    "sales.credit",
    "inventory.view",
    "purchasing.view",
  ],
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function normalizePermissions(values: string[] | undefined | null): Permission[] {
  if (!values?.length) return [];
  const set = new Set<Permission>();
  for (const v of values) {
    if (isPermission(v)) set.add(v);
  }
  return PERMISSIONS.filter((p) => set.has(p));
}

export function hasPermission(
  user: { permissions?: string[] | null; role?: Role } | null | undefined,
  permission: Permission
) {
  if (!user) return false;
  if (user.permissions?.includes(permission)) return true;
  // Fallback for sessions that predate permission loading
  if (!user.permissions?.length && user.role) {
    return ROLE_DEFAULT_PERMISSIONS[user.role]?.includes(permission) ?? false;
  }
  return false;
}

export function hasAnyPermission(
  user: { permissions?: string[] | null; role?: Role } | null | undefined,
  permissions: Permission[]
) {
  return permissions.some((p) => hasPermission(user, p));
}

/** @deprecated Prefer hasPermission(user, "price.override") */
export function canChangePrice(role: Role) {
  return ROLE_DEFAULT_PERMISSIONS[role].includes("price.override");
}

/** @deprecated Prefer hasPermission(user, "sales.credit") */
export function canSellCredit(role: Role) {
  return ROLE_DEFAULT_PERMISSIONS[role].includes("sales.credit");
}

/** @deprecated Prefer hasPermission(user, "refunds.approve") */
export function canApproveRefund(role: Role) {
  return ROLE_DEFAULT_PERMISSIONS[role].includes("refunds.approve");
}

/** @deprecated Prefer hasPermission(user, "inventory.manage") */
export function canManageInventory(role: Role) {
  return ROLE_DEFAULT_PERMISSIONS[role].includes("inventory.manage");
}

/** @deprecated Prefer hasPermission(user, "users.manage") */
export function canManageUsers(role: Role) {
  return ROLE_DEFAULT_PERMISSIONS[role].includes("users.manage");
}

/** @deprecated Prefer hasPermission(user, "audit.view") */
export function canViewAudit(role: Role) {
  return ROLE_DEFAULT_PERMISSIONS[role].includes("audit.view");
}

/** @deprecated Prefer hasPermission(user, "branches.manage") */
export function canManageBranches(role: Role) {
  return ROLE_DEFAULT_PERMISSIONS[role].includes("branches.manage");
}
