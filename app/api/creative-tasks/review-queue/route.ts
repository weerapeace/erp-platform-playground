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

  const { data: subs, error } = await admin.from("erp_creative_subtasks")
    .select("id, task_id, title, updated_at, status").eq("status", "submitted")
    .order("updated_at", { ascending: false }).limit(300);
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  const rows = (subs ?? []) as { id: string; task_id: string; title: string; updated_at: string }[];
  if (!rows.length) return NextResponse.json({ data: [], error: null });

  const taskIds = [...new Set(rows.map((r) => r.task_id))];
  const subIds = rows.map((r) => r.id);
  const [{ data: tasks }, aMap, { data: atts }] = await Promise.all([
    admin.from("erp_creative_tasks").select("id, task_no, title, brand_id, is_active").in("id", taskIds),
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

  const out = rows.map((r) => {
    const tk = taskMap.get(String(r.task_id)); if (!tk) return null;   // งานถูกลบ/ปิด → ข้าม
    const br = tk.brand_id ? brandMap.get(String(tk.brand_id)) : null;
    return {
      id: r.id, title: r.title, updated_at: r.updated_at,
      task_id: r.task_id, task_no: (tk.task_no as string) ?? null, task_title: (tk.title as string) ?? "",
      brand_label: (br?.name as string) ?? null, brand_color: (br?.color as string) ?? null,
      assignees: aMap.get(r.id) ?? [],
      images: imgBy.get(r.id) ?? [],
    };
  }).filter(Boolean);

  return NextResponse.json({ data: out, error: null });
}
