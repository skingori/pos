# Role-based access control (RBAC)

Ops-focused permissions with **createable role groups** and **per-user assignment**.

## Groups

| Kind | Examples | Notes |
|---|---|---|
| System | Admin, Manager, Attendant | Seeded; cannot delete. Admin permissions locked to full set. |
| Custom | e.g. Warehouse, Supervisor | Create under **Users → Roles & groups**. Delete only when no users assigned. |

Each group has a permission template (`AccessGroupPermission`). Assigning a group to a user copies that template into `UserPermission` (snapshot). Changing a group later does **not** rewrite existing users until you **Reset to group defaults** on the user.

Legacy `Role` enum on `User` stays in sync for system groups (`ADMIN` / `MANAGER` / `ATTENDANT`). Custom groups map to `ATTENDANT` for that enum; **effective access is always `UserPermission`**.

## How assignment works

1. Admin creates/edits groups and their templates (`roles.manage`).
2. On user create/edit, pick a group → permissions prefill → optionally tweak → save.
3. JWT session carries `permissions` at login.

## Permission catalog

See `src/lib/permissions.ts` (`PERMISSIONS` / `PERMISSION_META`).

## Enforcement

- Pages: route `layout.tsx` + `requirePermission`
- APIs: `hasPermission(user, key)`
- Nav: sidebar `permission` keys

## APIs

- `GET/POST/PATCH/DELETE /api/access-groups` — list/create/update/delete groups
- `GET/POST/PATCH /api/users` — includes `groupId` + `permissions`
- `GET/PUT /api/roles/permissions` — legacy sync helpers for system roles

## Bootstrap

```bash
npx prisma migrate deploy
npx tsx scripts/backfill-rbac.ts
```
