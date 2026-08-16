/**
 * งวดส่งของใบสั่งผลิต — /api/mo/delivery-plan
 * "ใบนี้ 1,000 ชิ้น ส่ง 300 วันที่ 20 · อีก 700 วันที่ 28"
 *
 *   GET    ?mo_id=<id>            → งวดส่งของใบนั้น (เรียงตามวัน)
 *   POST   { mo_id, due_date, qty, note? }   → เพิ่มงวด
 *   PATCH  { id, due_date?, qty?, note? }    → แก้งวด (ลากเลื่อนวันในปฏิทินก็ใช้อันนี้)
 *   DELETE ?id=<id>               → ลบงวด (จำนวนกลับไปเป็น "ยังไม่แบ่งงวด")
 *
 * ของกลาง: guardApi (products.view / products.edit) + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const moId = sp.get("mo_id");
  const admin = supabaseAdmin();

  // view=alerts → งวดที่ "ยังไม่ส่ง" ถึงวันที่กำหนด (ใช้เตือนบนหน้าแรก + สรุปยอดต้องส่ง)
  //   ต้องส่งวันไหน = due_date · today ต้องส่งมาจากฝั่ง client (เวลาไทย UTC+7 — ห้ามใช้ CURRENT_DATE ของ DB)
  if (sp.get("view") === "alerts") {
    const today = (sp.get("today") ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const days = Math.max(0, Math.min(60, Number(sp.get("days") ?? 7)));
    const until = new Date(`${today}T00:00:00Z`); until.setUTCDate(until.getUTCDate() + days);
    const { data, error } = await admin.from("mo_delivery_plan")
      .select("id, mo_id, mo_no, due_date, qty, note, dn_number, delivery_note_id, shipped")
      .eq("is_active", true).eq("shipped", false)
      .lte("due_date", until.toISOString().slice(0, 10))
      .order("due_date", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const rows = data ?? [];
    // เติมชื่อ/รหัสสินค้าจากใบสั่งผลิต + ตัดใบที่ปิด/ยกเลิกไปแล้วออก
    const ids = [...new Set(rows.map((r) => String(r.mo_id)))];
    const { data: mos } = ids.length
      ? await admin.from("manufacturing_orders").select("id, product_sku, product_name, status, is_active").in("id", ids)
      : { data: [] as Record<string, unknown>[] };
    const moBy = new Map((mos ?? []).map((m) => [String(m.id), m]));
    const out = rows.filter((r) => {
      const m = moBy.get(String(r.mo_id));
      return m && m.is_active !== false && !["cancelled", "done"].includes(String(m.status));
    }).map((r) => {
      const m = moBy.get(String(r.mo_id));
      return { ...r, product_sku: (m?.product_sku as string) ?? null, product_name: (m?.product_name as string) ?? null,
        overdue: String(r.due_date).slice(0, 10) < today, today: String(r.due_date).slice(0, 10) === today };
    });
    return NextResponse.json({ data: out, error: null });
  }

  let q = admin.from("mo_delivery_plan").select("*").eq("is_active", true).order("due_date", { ascending: true });
  if (moId) q = q.eq("mo_id", moId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { mo_id?: string; due_date?: string; qty?: number; note?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const due = day(body.due_date);
  const qty = Number(body.qty) || 0;
  if (!body.mo_id || !due) return NextResponse.json({ error: "ต้องระบุใบสั่งผลิตและวันที่ส่ง" }, { status: 400 });
  if (!(qty > 0)) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: mo } = await admin.from("manufacturing_orders").select("mo_no").eq("id", body.mo_id).single();
  if (!mo) return NextResponse.json({ error: "ไม่พบใบสั่งผลิต" }, { status: 404 });

  const { data, error } = await admin.from("mo_delivery_plan")
    .insert({ mo_id: body.mo_id, mo_no: mo.mo_no, due_date: due, qty, note: body.note ?? null, created_by: user?.id ?? null })
    .select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, { action: "create", entityType: "mo_delivery_plan", entityId: String(data.id),
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { mo_no: mo.mo_no, due_date: due, qty } });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { id?: string; due_date?: string; qty?: number; note?: string | null;
    delivery_note_id?: string | null; dn_number?: string | null; shipped?: boolean; shipped_at?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ไม่ระบุงวดส่ง" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("due_date" in body) {
    const d = day(body.due_date);
    if (!d) return NextResponse.json({ error: "งวดส่งต้องมีวันที่" }, { status: 400 });
    patch.due_date = d;
  }
  if ("qty" in body) {
    const n = Number(body.qty) || 0;
    if (!(n > 0)) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });
    patch.qty = n;
  }
  if ("note" in body) patch.note = body.note ?? null;
  if ("delivery_note_id" in body) patch.delivery_note_id = body.delivery_note_id || null;
  if ("dn_number" in body) patch.dn_number = body.dn_number || null;
  if ("shipped" in body) {
    patch.shipped = !!body.shipped;
    // ติ๊กส่งแล้วโดยไม่ระบุวัน = ลงวันที่ส่งเป็นวันกำหนดของงวดนั้น (client ส่ง shipped_at มาทับได้)
    if (!("shipped_at" in body)) patch.shipped_at = body.shipped ? null : null;
  }
  if ("shipped_at" in body) patch.shipped_at = day(body.shipped_at);

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("mo_delivery_plan").update(patch).eq("id", body.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, { action: "update", entityType: "mo_delivery_plan", entityId: String(body.id),
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { ...patch, mo_no: data?.mo_no } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ไม่ระบุงวดส่ง" }, { status: 400 });

  const admin = supabaseAdmin();
  // ปิดใช้งานแทนการลบจริง — ยังตามรอยได้ว่าเคยวางแผนไว้ยังไง
  const { data, error } = await admin.from("mo_delivery_plan")
    .update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id).select("mo_no, due_date, qty").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, { action: "delete", entityType: "mo_delivery_plan", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { ...data } });
  return NextResponse.json({ ok: true, error: null });
}
