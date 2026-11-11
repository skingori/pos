import { NextResponse } from "next/server";
import { getShopSettings } from "@/lib/settings";

export async function GET() {
  const settings = await getShopSettings();
  return NextResponse.json({ shopName: settings.shopName || "Shop" });
}
