/**
 * POST /api/assets/usages  — บันทึก "ไฟล์นี้ถูกใช้ที่ record ไหน" (sync แบบ declarative)
 *   body: { module, record_id, record_label?, field?, asset_ids: string[] }
 *   → ลบ usage เดิมของ (module, record_id, field) ทั้งหมด แล้วใส่ใหม่ตาม asset_ids
 *   ใช้ตอนโมดูลเจ้าของ (offer sheet/สินค้า ฯลฯ) บันทึก record ที่มีรูปจากคลัง
 *
 * DELETE /api/assets/usages?module=&record_id=&field=  — ล้าง usage ของ record นั้น (เช่นลบ record ทิ้ง)
 *
 * เมื่อมี usage ระบบจะกันลบไฟล์นั้นจากคลัง (ดู /api/assets/[id] DELETE)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;

  let b: { module?: string; record_id?: string; record_label?: string; field?: string | null; asset_ids?: string[]; r2_keys?: string[] };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const module = String(b.module ?? "").trim();
  const recordId = String(b.record_id ?? "").trim();
  if (!module || !recordId) return NextResponse.json({ error: "ต้องมี module + record_id" }, { status: 400 });

  const field = b.field ?? null;
  const admin = supabaseAdmin();

  // รับได้ทั้ง asset_ids ตรงๆ หรือ r2_keys (โมดูลที่เก็บแต่ key เช่น offer item) → resolve เป็น id
  let assetIds = Array.isArray(b.asset_ids) ? [...new Set(b.asset_ids.filter(Boolean))] : [];
  if (assetIds.length === 0 && Array.isArray(b.r2_keys) && b.r2_keys.length) {
    const keys = [...new Set(b.r2_keys.filter(Boolean))];
    const { data: found } = await admin.from("assets").select("id").in("r2_key", keys);
    assetIds = (found ?? []).map((r) => (r as { id: string }).id);
  }

  // ลบ usage เดิมของ record นี้ (เฉพาะ field เดียวกัน) แล้วใส่ชุดใหม่
  let del = admin.from("asset_usages").delete().eq("module", module).eq("record_id", recordId);
  del = field === null ? del.is("field", null) : del.eq("field", field);
  const { error: delErr } = await del;
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (assetIds.length) {
    const rows = assetIds.map((asset_id) => ({
      asset_id, module, record_id: recordId, record_label: b.record_label ?? null, field,
    }));
    const { error } = await admin.from("asset_usages")
      .upsert(rows, { onConflict: "asset_id,module,record_id,field", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, linked: assetIds.length, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const module = (sp.get("module") ?? "").trim();
  const recordId = (sp.get("record_id") ?? "").trim();
  if (!module || !recordId) return NextResponse.json({ error: "ต้องมี module + record_id" }, { status: 400 });

  const admin = supabaseAdmin();
  let q = admin.from("asset_usages").delete().eq("module", module).eq("record_id", recordId);
  const field = sp.get("field");
  if (field !== null) q = field === "" ? q.is("field", null) : q.eq("field", field);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
