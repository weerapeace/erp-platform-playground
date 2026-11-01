/**
 * 📌 กฎที่จำไว้ ของการจับคู่สินค้าจากเมลแพลตฟอร์ม — /api/platform-email/rules  (platform_orders.manage)
 * GET    ?platform=&level=sku|model&q=&page=&size=      → รายการกฎทีละหน้า (+ ชื่อสินค้าตัวอย่าง · จำนวนรายการ · ผู้ยืนยัน)
 * PATCH  { id, sku_id } | { id, parent_sku_id }         → เปลี่ยนเป้าหมาย + ย้ายรายการที่ผูกด้วยกฎนี้ตามไป (ยกเว้นออเดอร์ที่ตัดสต๊อกแล้ว)
 * DELETE { id, release }                                → ลบกฎ · release=true ส่งรายการกลับไปรอยืนยัน แล้วให้ระบบจับคู่ใหม่
 * ทุกการแก้/ลบ บันทึก audit · logic อยู่ที่ lib/platform-email/rules.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { deleteRule, rulesPage, updateRule } from "@/lib/platform-email/rules";
import { rematchPendingItems } from "@/lib/platform-email/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const fail = (e: unknown, fallback: string) => NextResponse.json(
  { error: e instanceof Error ? e.message : fallback },
  { status: (e as { status?: number })?.status ?? 500 });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  try { return NextResponse.json(await rulesPage(supabaseAdmin(), new URL(request.url).searchParams)); }
  catch (e) { return fail(e, "โหลดกฎที่จำไว้ไม่สำเร็จ กรุณาลองใหม่"); }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  let body: { id?: string; sku_id?: string; parent_sku_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ไม่ได้ระบุกฎ" }, { status: 400 });
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  try {
    const r = await updateRule(admin, body.id, { sku_id: body.sku_id ?? null, parent_sku_id: body.parent_sku_id ?? null });
    await writeAudit(admin, { action: "update", entityType: "platform_email_sku_rule", entityId: body.id, actorId: actor.id, actorName: actor.name,
      metadata: { platform_code: r.rule.platform_code, item_key: r.rule.item_key, from: r.rule.sku_id ? { sku_id: r.rule.sku_id } : { parent_sku_id: r.rule.parent_sku_id }, to: r.next, moved: r.moved, locked: r.locked } });
    return NextResponse.json({ ok: true, code: r.next.code, level: r.next.level, moved: r.moved, locked: r.locked, error: null });
  } catch (e) { return fail(e, "แก้กฎไม่สำเร็จ"); }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  let body: { id?: string; release?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ไม่ได้ระบุกฎ" }, { status: 400 });
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  try {
    const r = await deleteRule(admin, body.id, !!body.release);
    // รายการที่ส่งกลับ → ให้ระบบจับคู่ใหม่ (อัปเดตเหตุผล/คำแนะนำในแท็บรอยืนยัน · อาจผูกเองได้ถ้ารหัสชัด)
    const re = r.released ? await rematchPendingItems(admin) : null;
    await writeAudit(admin, { action: "delete", entityType: "platform_email_sku_rule", entityId: body.id, actorId: actor.id, actorName: actor.name,
      metadata: { platform_code: r.rule.platform_code, item_key: r.rule.item_key, sku_id: r.rule.sku_id, parent_sku_id: r.rule.parent_sku_id, released: r.released, locked: r.locked, rematched: re?.matched ?? 0 } });
    return NextResponse.json({ ok: true, released: r.released, locked: r.locked, rematched: re?.matched ?? 0, error: null });
  } catch (e) { return fail(e, "ลบกฎไม่สำเร็จ"); }
}
