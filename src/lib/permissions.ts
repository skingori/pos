import { Role } from "@prisma/client";

export function canChangePrice(role: Role) {
  return role === Role.ADMIN || role === Role.MANAGER;
}

export function canSellCredit(role: Role) {
  return role === Role.ADMIN || role === Role.MANAGER;
}

export function canApproveRefund(role: Role) {
  return role === Role.ADMIN || role === Role.MANAGER;
}

export function canManageInventory(role: Role) {
  return role === Role.ADMIN || role === Role.MANAGER;
}

export function canManageUsers(role: Role) {
  return role === Role.ADMIN;
}

export function canViewAudit(role: Role) {
  return role === Role.ADMIN || role === Role.MANAGER;
}

export function canManageBranches(role: Role) {
  return role === Role.ADMIN;
}
