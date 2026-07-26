/**
 * POST /api/skus/merge — รวม/ยุบ SKU ซ้ำเข้าตัวหลัก (โอนความเชื่อมโยงทั้งหมด + ยุบตัวซ้ำเข้าถังขยะ)
 *   body { primary_id, duplicate_id, field_overrides?: {col: value} }  // field_overrides = ฟิลด์ที่เลือกใช้ค่าจากตัวซ้ำ
 *   1) อัปเดตฟิลด์ที่เลือก → ตัวหลัก (กันคอลัมน์สงวน) · 2) RPC โอนความเชื่อมโยง (transaction) · 3) audit
 *
 * GET  /api/skus/merge?primary=&duplicate= → พรีวิวจำนวนความเชื่อมโยงของตัวซ้ำ (อ่านอย่างเดียว)
 *
 * ⚠️ ยุบตัวซ้ำ = soft delete (is_active=false, กู้คืนได้) · ต้องสิทธิ์ products.delete
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// คอลัมน์สงวน — ห้ามให้ field override มาเขียนทับ (โดยเฉพาะ code เพราะ BOM/MO อ้างโค้ดตัวหลัก)
const PROTECTED = new Set(["id", "code", "is_active", "created_at", "updated_at", "created_by", "updated_by", "parent_sku_id"]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const primary = (sp.get("primary") ?? "").trim();
  const duplicate = (sp.get("duplicate") ?? "").trim();
  if (!primary || !duplicate) return NextResponse.json({ error: "ต้องระบุ primary + duplicate" }, { status: 400 });
  if (primary === duplicate) return NextResponse.json({ error: "SKU หลักและ SKU ซ้ำต้องต่างกัน" }, { status: 400 });

  const { data: preview, error } = await supabaseAdmin().rpc("erp_merge_skus_preview", { p_primary: primary, p_dup: duplicate });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preview, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.delete"); if (denied) return denied;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let body: { primary_id?: string; duplicate_id?: string; field_overrides?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const primary = (body.primary_id ?? "").trim();
  const duplicate = (body.duplicate_id ?? "").trim();
  if (!primary || !duplicate) return NextResponse.json({ error: "ต้องเลือก SKU หลักและ SKU ซ้ำ" }, { status: 400 });
  if (primary === duplicate) return NextResponse.json({ error: "SKU หลักและ SKU ซ้ำต้องต่างกัน" }, { status: 400 });

  const admin = supabaseAdmin();

  // ตรวจว่ามีจริงทั้งคู่ (เก็บโค้ดไว้ทำ audit)
  const { data: both } = await admin.from("skus_v2").select("id, code").in("id", [primary, duplicate]);
  const primaryRow = (both ?? []).find((r) => r.id === primary);
  const dupRow = (both ?? []).find((r) => r.id === duplicate);
  if (!primaryRow || !dupRow) return NextResponse.json({ error: "ไม่พบ SKU (อาจถูกยุบ/ลบไปแล้ว)" }, { status: 404 });

  // 1) ฟิลด์ที่เลือกใช้ค่าจากตัวซ้ำ → ใส่ให้ตัวหลัก (กันคอลัมน์สงวน)
  const overrides: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(body.field_overrides ?? {})) {
    if (!PROTECTED.has(k) && val !== undefined) overrides[k] = val;
  }
  if (Object.keys(overrides).length) {
    const { error: upErr } = await admin.from("skus_v2").update(overrides).eq("id", primary);
    if (upErr) return NextResponse.json({ error: `อัปเดตฟิลด์ตัวหลักไม่สำเร็จ: ${upErr.message}` }, { status: 400 });
  }

  // 2) โอนความเชื่อมโยง + ยุบตัวซ้ำ (RPC transaction เดียว)
  const { data: result, error } = await admin.rpc("erp_merge_skus_v2", { p_primary: primary, p_dup: duplicate });
  if (error) return NextResponse.json({ error: `รวม SKU ไม่สำเร็จ: ${error.message}` }, { status: 500 });

  // 3) audit
  await writeAudit(admin, {
    action: "merge", entityType: "skus_v2", entityId: primary, actorId: user.id, actorName: user.email ?? null,
    metadata: {
      merged_from: { id: duplicate, code: dupRow.code },
      into: { id: primary, code: primaryRow.code },
      field_overrides: Object.keys(overrides),
      result,
    },
  });

  return NextResponse.json({ ok: true, result, error: null });
}
