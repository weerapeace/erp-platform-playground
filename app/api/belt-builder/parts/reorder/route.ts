/**
 * Belt Builder — จัดลำดับชิ้นส่วน (ลากในสตูดิโอ) · POST /api/belt-builder/parts/reorder
 *   body: { shop_id: string; ids: string[] }   → ตั้ง sort_order = ตำแหน่งในอาเรย์ × 10 ให้ทุก id (เฉพาะชิ้นของร้านนี้)
 *   ตอบ { data: { updated: number } }
 * สิทธิ์ belt_builder.edit · audit 1 แถว action "reorder" (เก็บลำดับใหม่ทั้งชุด)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { EDIT_PERM } from "../../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  let body: { shop_id?: unknown; ids?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "ข้อมูลที่ส่งมาไม่ใช่ JSON" }, { status: 400 }); }
  const shopId = typeof body.shop_id === "string" ? body.shop_id.trim() : "";
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  if (!shopId) return NextResponse.json({ data: null, error: "ต้องระบุร้าน (shop_id)" }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ data: null, error: "ไม่มีรายการให้จัดลำดับ" }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ data: null, error: "จัดลำดับได้ครั้งละไม่เกิน 500 ชิ้น" }, { status: 400 });

  const admin = supabaseAdmin();
  // ยืนยันว่าทุก id เป็นของร้านนี้ (กันส่ง id ร้านอื่นมาปน)
  const { data: rows, error: readErr } = await admin.from("belt_parts").select("id, sort_order").eq("shop_id", shopId).in("id", ids);
  if (readErr) return NextResponse.json({ data: null, error: "อ่านรายการไม่สำเร็จ" }, { status: 500 });
  const known = new Map((rows ?? []).map((r) => [r.id as string, Number(r.sort_order)]));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length) return NextResponse.json({ data: null, error: `มี ${missing.length} รายการที่ไม่ใช่ของร้านนี้หรือถูกลบไปแล้ว — รีเฟรชหน้าแล้วลองใหม่` }, { status: 400 });

  const now = new Date().toISOString();
  const jobs = ids.map((id, i) => ({ id, sort: (i + 1) * 10 })).filter((j) => known.get(j.id) !== j.sort);
  const results = await Promise.all(jobs.map((j) => admin.from("belt_parts").update({ sort_order: j.sort, updated_at: now }).eq("id", j.id)));
  const failed = results.filter((r) => r.error).length;
  if (failed) return NextResponse.json({ data: null, error: `บันทึกลำดับไม่สำเร็จ ${failed} รายการ` }, { status: 500 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "reorder", entityType: "belt_parts", entityId: null,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { shop_id: shopId, count: ids.length, updated: jobs.length, order: ids },
  });
  return NextResponse.json({ data: { updated: jobs.length }, error: null });
}
