/**
 * /api/subscriptions/settings — อัตราแลกเปลี่ยน + สกุลเงินที่แสดง (subscriptions.edit)
 * ใช้ตาราง app_settings id=1 ร่วมกับแอปเดิม/offer-sheets (คนละคอลัมน์ ไม่ชนกัน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import type { Currency } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CURRENCIES = new Set<Currency>(["THB", "USD", "EUR"]);

export async function PUT(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;

  let body: { exchange_rate?: number; eur_rate?: number; display_currency?: Currency };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if (body.exchange_rate !== undefined) {
    const n = Number(body.exchange_rate);
    if (isNaN(n) || n <= 0) return NextResponse.json({ error: "อัตรา USD ต้องมากกว่า 0" }, { status: 400 });
    patch.exchange_rate = n;
  }
  if (body.eur_rate !== undefined) {
    const n = Number(body.eur_rate);
    if (isNaN(n) || n <= 0) return NextResponse.json({ error: "อัตรา EUR ต้องมากกว่า 0" }, { status: 400 });
    patch.eur_rate = n;
  }
  if (body.display_currency !== undefined) {
    if (!CURRENCIES.has(body.display_currency)) return NextResponse.json({ error: "สกุลเงินไม่ถูกต้อง" }, { status: 400 });
    patch.display_currency = body.display_currency;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("app_settings").update(patch).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
