/**
 * POST /api/subscriptions/catalog/lookup — ให้ AI ค้นเว็บหาแพ็กเกจ/ราคา/เว็บทางการของแอป แล้วบันทึกเข้าคลัง
 *
 * body: { name }  → { data: CatalogApp | null, found, note, citations, merged }
 * ผ่านศูนย์ AI ที่เสียเงิน key "ai.subscription_lookup" (ปิดอยู่ / เกินงบ = 409 พร้อมข้อความภาษาคน)
 * สิทธิ์ subscriptions.view (ใช้ได้ทั้งรายการงานและส่วนตัว) · ทุกครั้งบันทึกประวัติ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { BudgetExceededError, ServiceOffError } from "@/lib/paid-services-server";
import { lookupAppPlans } from "@/lib/subscription-catalog-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;

  let body: { name?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (name.length < 2) return NextResponse.json({ error: "พิมพ์ชื่อแอปอย่างน้อย 2 ตัวอักษร" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: cats } = await db.from("subscriptions").select("category").neq("category", "");
  const categories = [...new Set(((cats ?? []) as { category: string }[]).map((c) => c.category).filter(Boolean))];

  try {
    const out = await lookupAppPlans(name, categories, { request });
    await writeAuditFor(request, db, {
      action: "ai_lookup", entityType: "subscription_app_catalog", entityId: out.app?.id ?? null,
      metadata: { query: name, found: out.result.found, name: out.result.name, plans: out.result.plans.length, merged: out.merged, sources: out.citations.map((c) => c.url) },
    });
    return NextResponse.json({ data: out.app, found: out.result.found, note: out.result.note, citations: out.citations, merged: out.merged, error: null });
  } catch (e) {
    if (e instanceof ServiceOffError || e instanceof BudgetExceededError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "ค้นข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
