/**
 * /api/subscriptions/catalog — คลังแพ็กเกจของแอป (App Subscription)
 *
 * GET  → { data: CatalogApp[] }                         (subscriptions.view)
 * POST → เพิ่มแอปใหม่ { name, category?, site?, logo_url?, plans? }  (subscriptions.view — คลังเป็นข้อมูลอ้างอิงร่วม ใช้กับรายการส่วนตัวด้วย)
 *        ชื่อซ้ำ (ไม่สนตัวพิมพ์) = 409
 * กติกา: lib/subscription-catalog.ts · หาจากเว็บ: ./lookup
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { toCatalogApp, toCatalogRow, validateCatalogInput, type CatalogInput } from "@/lib/subscription-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;
  const { data, error } = await supabaseAdmin().from("subscription_app_catalog").select("*").order("name");
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: ((data ?? []) as Record<string, unknown>[]).map(toCatalogApp), error: null });
}

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;

  let body: CatalogInput;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const err = validateCatalogInput(body, true);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const db = supabaseAdmin();
  const row: Record<string, unknown> = { category: "", site: "", logo_url: "", plans: [], ...toCatalogRow(body), source: "manual" };
  const { data, error } = await db.from("subscription_app_catalog").insert(row).select("*").single();
  if (error?.code === "23505") return NextResponse.json({ error: `มีแอปชื่อ "${String(row.name ?? "")}" ในคลังอยู่แล้ว` }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "บันทึกไม่สำเร็จ" }, { status: 500 });

  const app = toCatalogApp(data as Record<string, unknown>);
  await writeAuditFor(request, db, {
    action: "create", entityType: "subscription_app_catalog", entityId: app.id,
    metadata: { name: app.name, plans: app.plans.map((p) => `${p.name} ${p.cost} ${p.currency}/${p.billing_cycle}`) },
  });
  return NextResponse.json({ data: app, error: null });
}
