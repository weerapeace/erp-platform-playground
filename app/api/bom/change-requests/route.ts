/**
 * คำขอเพิ่ม/แก้สูตรการผลิต (BOM) — /api/bom/change-requests
 *   GET   ?status=pending|all&product_sku=&mo_no=   → รายการคำขอ (+ นับ pending)
 *   POST  { bom_id?, bom_code?, bom_version?, product_sku, product_name?, mo_no?, base_lines, lines, note? }
 *   PATCH { id, action: "approve"|"reject"|"cancel", applied_bom_id?, applied_bom_code?, reason? }
 *
 * ⚠️ "อนุมัติ" ไม่ได้เขียน BOM ที่นี่ — ฝั่งหน้าเว็บจะยิง `PATCH /api/bom/[id]` (ตัวบันทึกสูตรเดิม)
 *    ด้วย lines ที่เสนอ แล้วค่อยส่งผลกลับมาปิดคำขอ → ไม่มีตัวเขียน BOM ซ้ำสองที่
 * ของกลาง: guardApi + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { notifyEvent } from "@/lib/board-notify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * บรรทัดสูตรที่เสนอ — เก็บ "ทั้งก้อน" ในรูปเดียวกับที่หน้า /master/bom ส่งตอนเซฟ
 * (มี calc_mode / cut_block_id / cut_block_code / slot_code / pieces / size_values … ครบ)
 * → ตอนอนุมัติส่งต่อเข้า PATCH /api/bom/[id] ได้ตรง ๆ ไม่ต้องประกอบใหม่ = ข้อมูลไม่หาย
 */
export type BomReqLine = {
  component_sku: string | null;
  component_name: string | null;
  qty: number;
  uom: string | null;
  waste_percent?: number | null;
  cut_block_code?: string | null;
  slot_code?: string | null;
  sequence?: number | null;
  [key: string]: unknown;
};
export type BomChangeRequest = {
  id: string;
  bom_id: string | null; bom_code: string | null; bom_version: string | null;
  product_sku: string | null; product_name: string | null; mo_no: string | null;
  base_lines: BomReqLine[]; lines: BomReqLine[];
  note: string | null;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  requested_by_name: string | null; created_at: string;
  reviewed_by_name: string | null; reviewed_at: string | null;
  applied_bom_id: string | null; applied_bom_code: string | null;
};

const COLS = "id, bom_id, bom_code, bom_version, product_sku, product_name, mo_no, base_lines, lines, note, status, reject_reason, requested_by_name, created_at, reviewed_by_name, reviewed_at, applied_bom_id, applied_bom_code";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const status = (sp.get("status") ?? "pending").trim();
  const productSku = (sp.get("product_sku") ?? "").trim();
  const moNo = (sp.get("mo_no") ?? "").trim();
  const admin = supabaseAdmin();

  let q = admin.from("bom_change_requests").select(COLS).order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  if (productSku) q = q.eq("product_sku", productSku);
  if (moNo) q = q.eq("mo_no", moNo);

  const [{ data, error }, { count }] = await Promise.all([
    q,
    admin.from("bom_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (error) return NextResponse.json({ data: [], pending: 0, error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as unknown as BomChangeRequest[], pending: count ?? 0, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;   // ช่าง/คนเตรียมของ เสนอได้
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const lines = Array.isArray(body.lines) ? (body.lines as BomReqLine[]) : [];
  if (lines.length === 0 && !String(body.note ?? "").trim()) {
    return NextResponse.json({ error: "ต้องมีวัตถุดิบอย่างน้อย 1 รายการ หรือเขียนหมายเหตุ" }, { status: 400 });
  }
  if (lines.length > 300) return NextResponse.json({ error: "รายการเยอะเกินไป (สูงสุด 300)" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { data, error } = await admin.from("bom_change_requests").insert({
    bom_id: (body.bom_id as string) ?? null,
    bom_code: (body.bom_code as string) ?? null,
    bom_version: (body.bom_version as string) ?? null,
    product_sku: (body.product_sku as string) ?? null,
    product_name: (body.product_name as string) ?? null,
    mo_no: (body.mo_no as string) ?? null,
    base_lines: Array.isArray(body.base_lines) ? body.base_lines : [],
    lines,
    note: String(body.note ?? "").trim() || null,
    requested_by: user?.id ?? null, requested_by_name: user?.email ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "bom_change_requests", entityId: (data as { id: string }).id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { product_sku: body.product_sku ?? null, bom_code: body.bom_code ?? null, mo_no: body.mo_no ?? null, lines: lines.length },
  }).catch(() => { /* audit ห้ามบล็อกงานหลัก */ });

  // แจ้งคนดูแลสูตร (กฎ bom_request.created → role manager+admin) — best-effort
  await notifyEvent(admin, "bom_request.created", "bom_change_requests", (data as { id: string }).id, user?.id ?? null, {
    sku: String(body.product_sku ?? "—"),
    actor: user?.email ?? "—",
    lines: String(lines.length),
    note: body.note ? ` · ${String(body.note)}` : "",
  });

  return NextResponse.json({ id: (data as { id: string }).id, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: { id?: string; action?: string; applied_bom_id?: string; applied_bom_code?: string; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  const action = (body.action ?? "").trim();
  if (!id || !["approve", "reject", "cancel"].includes(action)) return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });

  const denied = await guardApi(request, action === "cancel" ? "products.view" : "products.edit"); if (denied) return denied;

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("bom_change_requests").select("id, status, requested_by, requested_by_name, product_sku, bom_code").eq("id", id).maybeSingle();
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
  if (action === "approve") { patch.applied_bom_id = body.applied_bom_id ?? null; patch.applied_bom_code = body.applied_bom_code ?? null; }
  if (action === "reject") patch.reject_reason = (body.reason ?? "").trim() || null;
  if (action === "cancel") patch.reject_reason = "ผู้ขอยกเลิกเอง";

  const { error } = await admin.from("bom_change_requests").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action, entityType: "bom_change_requests", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { product_sku: row.product_sku, bom_code: body.applied_bom_code ?? row.bom_code, reason: body.reason ?? null },
  }).catch(() => { /* ignore */ });

  // แจ้งผู้ขอว่าคำขอได้ผลแล้ว — ยิงตรงถึง user id (ตัวเลือก "requester" ของ rule engine ใช้ได้เฉพาะใบขอซื้อ)
  if (action !== "cancel" && row.requested_by && String(row.requested_by) !== String(user?.id ?? "")) {
    const ok = action === "approve";
    await admin.rpc("erp_notify", {
      p_user_ids: [String(row.requested_by)],
      p_event_type: "bom_request.result",
      p_title: `${ok ? "✅ อนุมัติแล้ว" : "❌ ไม่อนุมัติ"} · แก้สูตร ${String(row.product_sku ?? "")}`,
      p_body: ok ? `เขียนลงสูตร ${body.applied_bom_code ?? row.bom_code ?? ""} แล้ว` : (body.reason ? `เหตุผล: ${body.reason}` : "ดูรายละเอียดในคิวคำขอ"),
      p_link_url: "/master/work-board",
      p_entity_type: "bom_change_requests",
      p_entity_id: id,
      p_priority: "normal",
    }).then(() => {}, () => { /* แจ้งเตือนล้มไม่กระทบการบันทึก */ });
  }

  return NextResponse.json({ ok: true, error: null });
}
