/**
 * คิวรอตรวจ/อนุมัติ — งานย่อยที่ "ส่งมาแล้ว" (status=submitted) ทั้งหมด (ของงานที่ยัง active)
 * GET /api/creative-tasks/review-queue
 *   → [{ id, title, updated_at, task_id, task_no, task_title, brand_label, brand_color, assignees[], images[] }]
 * ใช้กับหน้า /tasks/review (ตาราง + popup ตรวจเร็ว) · อนุมัติจริงผ่าน PATCH subtasks (สิทธิ์เช็คฝั่ง server)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { subtaskAssigneesMap } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  // ?count=1 → นับจำนวน (รอตรวจ/อนุมัติแล้ว) เฉพาะงานที่ยัง active — เบา ไม่ดึงรูป/แบรนด์
  if (new URL(request.url).searchParams.get("count") === "1") {
    const { data: cs } = await admin.from("erp_creative_subtasks").select("status, task_id").in("status", ["submitted", "approved"]).limit(2000);
    const cr = (cs ?? []) as { status: string; task_id: string }[];
    const tIds = [...new Set(cr.map((r) => r.task_id))];
    const { data: tk } = tIds.length ? await admin.from("erp_creative_tasks").select("id").in("id", tIds).neq("is_active", false) : { data: [] as { id: string }[] };
    const active = new Set(((tk ?? []) as { id: string }[]).map((t) => String(t.id)));
    let pending = 0, approved = 0;
    for (const r of cr) { if (!active.has(String(r.task_id))) continue; if (r.status === "approved") approved++; else pending++; }
    return NextResponse.json({ pending, approved, error: null });
  }

  // รอตรวจ (submitted) + อนุมัติแล้ว (approved) — แยกกลุ่มในหน้า UI
  const { data: subs, error } = await admin.from("erp_creative_subtasks")
    .select("id, task_id, title, description, updated_at, status, image_sync_targets").in("status", ["submitted", "approved"])
    .order("updated_at", { ascending: false }).limit(400);
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  type Ist = { parent_ids?: string[]; sku_ids?: string[]; sku_images?: Record<string, string[]>; image_order?: string[] } | null;
  const rows = (subs ?? []) as { id: string; task_id: string; title: string; description: string | null; updated_at: string; status: string; image_sync_targets: Ist }[];
  if (!rows.length) return NextResponse.json({ data: [], error: null });

  const taskIds = [...new Set(rows.map((r) => r.task_id))];
  const subIds = rows.map((r) => r.id);
  const [{ data: tasks }, aMap, { data: atts }] = await Promise.all([
    admin.from("erp_creative_tasks").select("id, task_no, title, description, brand_id, is_active").in("id", taskIds),
    subtaskAssigneesMap(admin, subIds),
    admin.from("erp_creative_attachments").select("subtask_id, r2_key, file_name, kind").in("subtask_id", subIds),
  ]);
  const taskMap = new Map(((tasks ?? []) as Record<string, unknown>[]).filter((t) => t.is_active !== false).map((t) => [String(t.id), t]));
  const brandIds = [...new Set(((tasks ?? []) as { brand_id?: string | null }[]).map((t) => t.brand_id).filter(Boolean))] as string[];
  const { data: brands } = brandIds.length ? await admin.from("brands").select("id, name, color").in("id", brandIds) : { data: [] as Record<string, unknown>[] };
  const brandMap = new Map(((brands ?? []) as Record<string, unknown>[]).map((b) => [String(b.id), b]));

  const imgBy = new Map<string, { r2_key: string; file_name: string | null }[]>();
  for (const a of ((atts ?? []) as { subtask_id: string; r2_key: string | null; file_name: string | null; kind: string }[])) {
    if (a.kind !== "image" || !a.r2_key) continue;
    const k = String(a.subtask_id); const arr = imgBy.get(k) ?? []; arr.push({ r2_key: a.r2_key, file_name: a.file_name }); imgBy.set(k, arr);
  }
  // เรียงรูปตาม image_order ที่บันทึกไว้ (ผู้ตรวจจัดลำดับ) — คีย์ที่ไม่อยู่ใน order ต่อท้าย
  for (const r of rows) {
    const ord = r.image_sync_targets?.image_order;
    if (ord && ord.length) { const arr = imgBy.get(r.id); if (arr) arr.sort((a, b) => { const ia = ord.indexOf(a.r2_key), ib = ord.indexOf(b.r2_key); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); }); }
  }

  // resolve ป้ายปลายทาง (Parent SKU / SKU) เพื่อโชว์ในป๊อปอัปตรวจงาน
  const allParentIds = new Set<string>(), allSkuIds = new Set<string>();
  for (const r of rows) { const ist = r.image_sync_targets; if (!ist) continue; for (const p of ist.parent_ids ?? []) allParentIds.add(p); for (const s of ist.sku_ids ?? []) allSkuIds.add(s); }
  const [{ data: pRows }, { data: sRows }] = await Promise.all([
    allParentIds.size ? admin.from("parent_skus_v2").select("id, code").in("id", [...allParentIds]) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    allSkuIds.size ? admin.from("skus_v2").select("id, code").in("id", [...allSkuIds]) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const pMap = new Map(((pRows ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), String(p.code ?? p.id)]));
  const sMap = new Map(((sRows ?? []) as Record<string, unknown>[]).map((s) => [String(s.id), String(s.code ?? s.id)]));

  const out = rows.map((r) => {
    const tk = taskMap.get(String(r.task_id)); if (!tk) return null;   // งานถูกลบ/ปิด → ข้าม
    const br = tk.brand_id ? brandMap.get(String(tk.brand_id)) : null;
    const ist = r.image_sync_targets;
    return {
      id: r.id, title: r.title, description: r.description ?? null, updated_at: r.updated_at, status: r.status,
      task_id: r.task_id, task_no: (tk.task_no as string) ?? null, task_title: (tk.title as string) ?? "", task_desc: (tk.description as string) ?? null,
      brand_label: (br?.name as string) ?? null, brand_color: (br?.color as string) ?? null,
      assignees: aMap.get(r.id) ?? [],
      images: imgBy.get(r.id) ?? [],
      image_sync_targets: ist ?? null,
      dest: {
        parents: (ist?.parent_ids ?? []).map((id) => ({ id, code: pMap.get(id) ?? id })),
        skus: (ist?.sku_ids ?? []).map((id) => ({ id, code: sMap.get(id) ?? id })),
      },
    };
  }).filter(Boolean);

  return NextResponse.json({ data: out, error: null });
}
