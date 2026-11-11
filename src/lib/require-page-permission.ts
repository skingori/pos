import { requirePermission } from "./session";
import type { Permission } from "./permissions";

/** Use in route `layout.tsx` to hard-gate pages by permission. */
export async function guardPage(permission: Permission) {
  await requirePermission(permission);
}
