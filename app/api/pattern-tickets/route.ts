/**
 * /api/pattern-tickets — ตั๋วงานช่าง Pattern
 *
 * GET  ?view=open|done|all&type=<key>&q=  → { data: ticket[], types, open_counts, me, error }   (pattern.view)
 *      open_counts = { <type_key>: จำนวนตั๋วที่ยังไม่ปิด } — ป้าย "ค้าง X" บนแผ่นประเภทงาน (นับทุกตั๋ว ไม่ขึ้นกับ view/q)
 * PATCH /api/pattern-tickets/types = เปลี่ยนไอคอนประเภทงาน (ดู types/route.ts)
 *      open (ค่าเริ่ม) = ยังไม่ปิด · done = เสร็จ/ยกเลิก (ล่าสุด 300) · all = ทั้งหมด
 * POST { type_key, title, title_en?, sku_code?, parent_sku_id?, description_th? (ไม่ใส่ก็ได้), description_en?, priority?, due_date?, assignee_id?, assignee_name?, links? }
 *      → สร้างตั๋ว (pattern.create) · เลขตั๋วจาก erp_next_number('pattern_ticket') · เช็กลิสต์ตั้งต้นตามประเภทงาน
 * กติกาสถานะดู lib/pattern-tickets.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { checklistFromTemplate, cleanLinks, OPEN_STATUSES, openCountsByType } from "@/lib/pattern-tickets";
import { loadActor, PATTERN_TABLE, PATTERN_TYPES_TABLE } from "@/lib/pattern-tickets-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIST_COLS = "id,ticket_no,type_key,title,title_en,sku_code,status,priority,due_date,requester_id,requester_name,requester_dept,assignee_id,assignee_name,checklist,drive_folder_url,created_at,updated_at,done_at";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;
  const view = sp.get("view") ?? "open";
  const type = sp.get("type");
  const q = (sp.get("q") ?? "").trim();

  let query = admin.from(PATTERN_TABLE).select(LIST_COLS);
  if (view === "open") query = query.in("status", ["new", "doing", "review", "fix"]).order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(500);
  else if (view === "done") query = query.in("status", ["done", "cancelled"]).order("updated_at", { ascending: false }).limit(300);
  else query = query.order("created_at", { ascending: false }).limit(500);
  if (type) query = query.eq("type_key", type);
  if (q) {
    const s = q.replace(/[,()%]/g, " ").trim();
    if (s) query = query.or(`title.ilike.%${s}%,title_en.ilike.%${s}%,ticket_no.ilike.%${s}%,sku_code.ilike.%${s}%,assignee_name.ilike.%${s}%,requester_name.ilike.%${s}%`);
  }

  const [list, types, openRows, actor] = await Promise.all([
    query,
    admin.from(PATTERN_TYPES_TABLE).select("*").order("sort_order"),
    admin.from(PATTERN_TABLE).select("type_key,status").in("status", OPEN_STATUSES).limit(5000),
    loadActor(request, admin),
  ]);
  if (list.error) return NextResponse.json({ data: [], types: [], me: null, error: "โหลดตั๋วงานไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  return NextResponse.json({
    data: list.data ?? [],
    types: types.data ?? [],
    open_counts: openCountsByType((openRows.data ?? []) as { type_key: string; status: string }[]),
    me: { id: actor.userId, name: actor.name, role_label: actor.roleLabel, can_work: actor.canWork, can_manage: actor.canManage, can_create: actor.canCreate },
    error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.create"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const title = String(body.title ?? "").trim().slice(0, 200);
  const typeKey = String(body.type_key ?? "").trim();
  const descTh = String(body.description_th ?? "").trim().slice(0, 8000);
  if (!typeKey) return NextResponse.json({ error: "เลือกประเภทงานก่อน" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "ใส่ชื่องานก่อน" }, { status: 400 });
  const due = typeof body.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null;

  const admin = supabaseAdmin();
  const { data: type } = await admin.from(PATTERN_TYPES_TABLE).select("key, checklist, is_active").eq("key", typeKey).maybeSingle();
  if (!type || type.is_active === false) return NextResponse.json({ error: "ไม่พบประเภทงานนี้" }, { status: 400 });

  const actor = await loadActor(request, admin);
  let ticketNo: string | null = null;
  try { const { data: n } = await admin.rpc("erp_next_number", { p_key: "pattern_ticket", p_branch: null }); if (n) ticketNo = String(n); } catch { /* ไม่มีเลข = ปล่อยว่าง */ }

  const assigneeId = typeof body.assignee_id === "string" && body.assignee_id ? body.assignee_id : null;
  const row = {
    ticket_no: ticketNo,
    type_key: typeKey,
    title,
    title_en: String(body.title_en ?? "").trim().slice(0, 200),   // แปลอัตโนมัติจากหน้าจอ (โหมด English)
    sku_code: String(body.sku_code ?? "").trim().slice(0, 80) || null,
    parent_sku_id: typeof body.parent_sku_id === "string" && body.parent_sku_id ? body.parent_sku_id : null,
    description_th: descTh,
    description_en: String(body.description_en ?? "").trim().slice(0, 8000),
    en_edited: !!body.en_edited,
    priority: body.priority === "urgent" ? "urgent" : "normal",
    due_date: due,
    requester_id: actor.userId,
    requester_name: actor.name,
    requester_dept: actor.roleLabel,
    assignee_id: assigneeId,
    assignee_name: assigneeId ? String(body.assignee_name ?? "").trim() || null : null,
    checklist: checklistFromTemplate(type.checklist),
    links: cleanLinks(body.links),
  };
  const { data, error } = await admin.from(PATTERN_TABLE).insert(row).select("id, ticket_no").single();
  if (error || !data) return NextResponse.json({ error: "สร้างตั๋วไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });

  await writeAudit(admin, {
    action: "create", entityType: PATTERN_TABLE, entityId: data.id, actorId: actor.userId, actorName: actor.name,
    metadata: { ticket_no: data.ticket_no, type: typeKey, title, assignee: row.assignee_name },
  });
  return NextResponse.json({ data, error: null });
}
