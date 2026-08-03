/**
 * คำขอเพิ่มวัตถุดิบ — /api/master/material-requests
 *   GET    ?status=pending|approved|rejected|all  → รายการคำขอ (+ nb ตัวนับ pending)
 *   POST   { values, labels?, family_tag_id?, family_tag_name?, note?, image_key? } → ขอเพิ่ม (กรอกไม่ครบก็ได้)
 *   PATCH  { id, action: "approve"|"reject"|"cancel", sku_id?, sku_code?, reason? }
 *
 * ⚠️ การ "อนุมัติ" ไม่ได้สร้าง SKU ที่นี่ — ฝั่งหน้าเว็บจะเปิด SkuWizard (prefill ค่าที่ขอมา) ให้ผู้อนุมัติ
 *    เติม/แก้ก่อนกดสร้างจริงผ่าน /api/skus/wizard-create แล้วค่อยส่ง sku_id กลับมาปิดคำขอ
 *    → ไม่มีตัวสร้าง SKU ซ้ำสองที่ (กติกา/รหัสซ้ำ/ผูกแท็ก ใช้ของเดิมทั้งหมด)
 * ของกลาง: guardApi + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MaterialRequest = {
  id: string;
  values: Record<string, unknown>;
  labels: Record<string, string>;
  family_tag_id: string | null; family_tag_name: string | null;
  note: string | null; image_key: string | null;
  status: "pending" | "approved" | "rejected";
  created_sku_id: string | null; created_sku_code: string | null;
  reject_reason: string | null;
  requested_by_name: string | null; created_at: string;
  reviewed_by_name: string | null; reviewed_at: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const status = (new URL(request.url).searchParams.get("status") ?? "pending").trim();
  const admin = supabaseAdmin();

  let q = admin.from("material_requests")
    .select("id, values, labels, family_tag_id, family_tag_name, note, image_key, status, created_sku_id, created_sku_code, reject_reason, requested_by_name, created_at, reviewed_by_name, reviewed_at")
    .order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);

  const [{ data, error }, { count }] = await Promise.all([
    q,
    admin.from("material_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (error) return NextResponse.json({ data: [], pending: 0, error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as MaterialRequest[], pending: count ?? 0, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;   // พนักงานทั่วไปที่เห็นสินค้าได้ ขอเพิ่มได้
  let body: {
    values?: Record<string, unknown>; labels?: Record<string, string>;
    family_tag_id?: string | null; family_tag_name?: string | null; note?: string; image_key?: string | null;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const values = body.values ?? {};
  const hasSomething = ["code", "name_th", "color"].some((k) => String(values[k] ?? "").trim()) || String(body.note ?? "").trim();
  if (!hasSomething) return NextResponse.json({ error: "ใส่อย่างน้อย ชื่อ หรือ รหัส หรือ หมายเหตุ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { data, error } = await admin.from("material_requests").insert({
    values, labels: body.labels ?? {},
    family_tag_id: body.family_tag_id ?? null, family_tag_name: body.family_tag_name ?? null,
    note: (body.note ?? "").trim() || null, image_key: body.image_key ?? null,
    requested_by: user?.id ?? null, requested_by_name: user?.email ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "material_requests", entityId: (data as { id: string }).id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { code: values.code ?? null, name: values.name_th ?? null, tag: body.family_tag_name ?? null },
  }).catch(() => { /* audit ห้ามบล็อกงานหลัก */ });

  return NextResponse.json({ id: (data as { id: string }).id, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: { id?: string; action?: string; sku_id?: string; sku_code?: string; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  const action = (body.action ?? "").trim();
  if (!id || !["approve", "reject", "cancel"].includes(action)) return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });

  // ยกเลิกคำขอของตัวเอง = แค่สิทธิ์ดู · อนุมัติ/ไม่อนุมัติ = ต้องแก้ข้อมูลสินค้าได้
  const denied = await guardApi(request, action === "cancel" ? "products.view" : "products.edit"); if (denied) return denied;

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("material_requests").select("id, status, values, requested_by").eq("id", id).maybeSingle();
  const row = cur as Record<string, unknown> | null;
  if (!row) return NextResponse.json({ error: "ไม่พบคำขอนี้" }, { status: 404 });
  if (row.status !== "pending") return NextResponse.json({ error: "คำขอนี้ถูกดำเนินการไปแล้ว" }, { status: 400 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (action === "cancel" && row.requested_by && String(row.requested_by) !== String(user?.id ?? "")) {
    return NextResponse.json({ error: "ยกเลิกได้เฉพาะคำขอของตัวเอง" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {
    status: action === "approve" ? "approved" : "rejected",
    reviewed_by: user?.id ?? null, reviewed_by_name: user?.email ?? null, reviewed_at: new Date().toISOString(),
  };
  if (action === "approve") { patch.created_sku_id = body.sku_id ?? null; patch.created_sku_code = body.sku_code ?? null; }
  if (action === "reject") patch.reject_reason = (body.reason ?? "").trim() || null;
  if (action === "cancel") patch.reject_reason = "ผู้ขอยกเลิกเอง";

  const { error } = await admin.from("material_requests").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action, entityType: "material_requests", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { sku_code: body.sku_code ?? null, reason: body.reason ?? null },
  }).catch(() => { /* ignore */ });

  return NextResponse.json({ ok: true, error: null });
}
