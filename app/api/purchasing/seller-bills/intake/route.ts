/**
 * POST /api/purchasing/seller-bills/intake { refs: string[] } — โยนรูปบิลร้าน (ป๊อป ＋ ออกใบสำคัญรับ แท็บ บิลร้าน)
 *   AI อ่านไฟล์ทั้งหมดรอบเดียว → บิลแยกตามร้าน + ร้านในทะเบียนที่น่าจะใช่ (เหตุผล/ความมั่นใจ) + สกุล/วันที่/เรท + บิลที่เคยออกใบแล้ว
 *   ยังไม่สร้างอะไร — คนยืนยันร้านแล้วค่อยเรียก /api/purchasing/seller-bills/create
 * logic: lib/seller-bill-intake.ts · สิทธิ์ products.edit · audit ai_seller_bill_intake (AI มีค่าใช้จ่าย)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { isRefForCategory } from "@/lib/file-ref";
import { readBillIntake, MAX_INTAKE_FILES } from "@/lib/seller-bill-intake";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 90;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { refs?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const refs = Array.isArray(body.refs) ? [...new Set(body.refs.map((r) => String(r ?? "").trim()).filter(Boolean))] : [];
  if (refs.length === 0) return NextResponse.json({ error: "ยังไม่ได้แนบรูปบิล" }, { status: 400 });
  if (refs.length > MAX_INTAKE_FILES) return NextResponse.json({ error: `แนบได้ครั้งละไม่เกิน ${MAX_INTAKE_FILES} ไฟล์` }, { status: 400 });
  // ไฟล์ต้องเป็นหมวดบิลซัพพลายเออร์ (กันยัดไฟล์หมวดอื่นมาให้ AI อ่าน)
  if (refs.some((r) => !isRefForCategory(r, "supplier_bills"))) return NextResponse.json({ error: "ไฟล์แนบไม่ถูกต้อง — แนบไฟล์ใหม่อีกครั้ง" }, { status: 400 });
  const admin = supabaseAdmin();
  try {
    const r = await readBillIntake(admin, refs, { request });
    await writeAudit(admin, { action: "ai_seller_bill_intake", entityType: "purchase_delivery_bills", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { files: refs.length, bills: r.bills.length, model: r.model, picked: r.bills.filter((b) => b.picked).length, unreadable: r.unreadable_reason } });
    return NextResponse.json({ ok: true, bills: r.bills, unreadable_reason: r.unreadable_reason, error: null });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 });
  }
}
