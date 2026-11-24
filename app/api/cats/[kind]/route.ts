/**
 * 🐾 ทะเบียนแมว — เพิ่มรายการ (kind = cats | clinics | vaccinations | treatments | weights)
 * POST /api/cats/<kind>                 body = ช่องของชนิดนั้น (lib/cats CAT_KINDS) → { data: row }
 * POST /api/cats/weights {items:[…]}    ชั่งหลายตัวทีเดียว (สูงสุด 50) → { data: rows }
 * สิทธิ์ cats.edit · ตรวจค่าด้วย cleanCatBody · audit create
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { CATS_EDIT, cleanCatBody, recordLabel } from "@/lib/cats";
import { bad, kindOf } from "./_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ kind: string }> };

export async function POST(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, CATS_EDIT); if (denied) return denied;
  const k = kindOf((await ctx.params).kind);
  if (!k) return bad("ไม่รู้จักชนิดข้อมูลนี้", 404);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const admin = supabaseAdmin();

  // ชั่งหลายตัวทีเดียว
  if (Array.isArray(body.items)) {
    if (k.kind !== "weights") return bad("บันทึกหลายรายการได้เฉพาะน้ำหนัก");
    const items = body.items as Record<string, unknown>[];
    if (!items.length) return bad("ยังไม่ได้กรอกน้ำหนัก");
    if (items.length > 50) return bad("บันทึกได้ครั้งละไม่เกิน 50 ตัว");
    const rows: Record<string, unknown>[] = [];
    for (const it of items) {
      const v = cleanCatBody("weights", it ?? {}, false);
      if (!v.ok) return bad(v.error);
      rows.push({ ...v.patch, is_active: true });
    }
    const { data, error } = await admin.from(k.table).insert(rows).select("*");
    if (error) return bad(friendlyDbError(error.message));
    for (const r of data ?? []) {
      await writeAuditFor(request, admin, { action: "create", entityType: k.table, entityId: r.id, metadata: { name: recordLabel("weights", r), cat_id: r.cat_id, bulk: true } });
    }
    return NextResponse.json({ data: data ?? [], error: null });
  }

  const v = cleanCatBody(k.kind, body, false);
  if (!v.ok) return bad(v.error);
  const { data, error } = await admin.from(k.table).insert({ ...v.patch, is_active: true }).select("*").single();
  if (error) return bad(friendlyDbError(error.message));
  await writeAuditFor(request, admin, {
    action: "create", entityType: k.table, entityId: data.id,
    metadata: { name: recordLabel(k.kind, data), ...("cat_id" in data ? { cat_id: data.cat_id } : {}) },
  });
  return NextResponse.json({ data, error: null });
}
