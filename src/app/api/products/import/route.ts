import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveBranchId } from "@/lib/branch";
import { setStock } from "@/lib/branch-stock";

function parseCsv(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] || "").trim();
    });
    return row;
  });
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Match existing category (case-insensitive) or create it — CSV is not limited to known names. */
async function ensureCategoryId(
  rawName: string,
  byName: Record<string, string>
): Promise<{ id: string; created: boolean }> {
  const name = rawName.trim().replace(/\s+/g, " ");
  const key = name.toLowerCase();
  if (!key) throw new Error("Category name is empty");

  const cached = byName[key];
  if (cached) return { id: cached, created: false };

  const existing = await prisma.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    byName[key] = existing.id;
    byName[existing.name.toLowerCase()] = existing.id;
    return { id: existing.id, created: false };
  }

  try {
    const created = await prisma.category.create({ data: { name } });
    byName[key] = created.id;
    return { id: created.id, created: true };
  } catch {
    const again = await prisma.category.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (again) {
      byName[key] = again.id;
      byName[again.name.toLowerCase()] = again.id;
      return { id: again.id, created: false };
    }
    throw new Error(`Could not create category "${name}"`);
  }
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "inventory.manage")) return forbidden();

  const branchId = await resolveBranchId(user);
  const contentType = req.headers.get("content-type") || "";
  let text = "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file required" }, { status: 400 });
    }
    text = await file.text();
  } else {
    text = await req.text();
  }

  const rows = parseCsv(text);
  if (!rows.length) {
    return NextResponse.json({ error: "No data rows found" }, { status: 400 });
  }

  const categories = await prisma.category.findMany();
  const byName = Object.fromEntries(categories.map((c) => [c.name.toLowerCase(), c.id]));

  let created = 0;
  let updated = 0;
  let categoriesCreated = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    try {
      const row = rows[i];
      const name = row.name || row.product || "";
      const sku = row.sku || "";
      if (!name || !sku) {
        errors.push(`Row ${rowNum}: name and sku are required`);
        continue;
      }
      const cost = Number(row.cost ?? row.buying ?? row.buying_price ?? 0);
      const sellPrice = Number(row.sellprice ?? row.sell_price ?? row.sell ?? 0);
      if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(sellPrice) || sellPrice <= 0) {
        errors.push(`Row ${rowNum}: valid cost and sell price required`);
        continue;
      }

      let categoryId: string | null = null;
      const catName = row.category || row.category_name || "";
      if (catName.trim()) {
        const resolved = await ensureCategoryId(catName, byName);
        categoryId = resolved.id;
        if (resolved.created) categoriesCreated++;
      }

      const qty = Number(row.qty ?? row.quantity ?? 0) || 0;
      const reorderLevel = Number(row.reorder ?? row.reorder_level ?? 0) || 0;
      const data = {
        name,
        barcode: row.barcode || null,
        categoryId,
        cost,
        sellPrice,
        unit: row.unit || "pc",
        trackSerial: ["1", "true", "yes"].includes(
          (row.trackserial || row.track_serial || "").toLowerCase()
        ),
        active: true,
      };

      const existing = await prisma.product.findUnique({ where: { sku } });
      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        await setStock(prisma, branchId, existing.id, { qty, reorderLevel });
        updated++;
      } else {
        const createdProduct = await prisma.product.create({ data: { ...data, sku } });
        await setStock(prisma, branchId, createdProduct.id, { qty, reorderLevel });
        created++;
      }
    } catch (e) {
      errors.push(
        `Row ${rowNum}: ${e instanceof Error ? e.message : "Could not import this row"}`
      );
    }
  }

  await writeAudit({
    userId: user.id,
    action: "IMPORT",
    entity: "Product",
    detail: `created ${created}, updated ${updated}, categoriesCreated ${categoriesCreated}, errors ${errors.length}, branch ${branchId}`,
  });

  return NextResponse.json({
    created,
    updated,
    categoriesCreated,
    errors: errors.slice(0, 20),
    errorCount: errors.length,
  });
}
