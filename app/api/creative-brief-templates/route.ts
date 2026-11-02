/**
 * เทมเพลตบรีฟ ("รายการงานที่ต้องการ" ในป๊อปโพสต์) — list / create / reorder
 *
 * GET  /api/creative-brief-templates?all=1   → [{ id, name, tags, brief, ref_image_keys, ref_links, brand_id, sort_order, is_active }]
 *      (ไม่ส่ง all = เฉพาะที่เปิดใช้)
 * POST /api/creative-brief-templates         → สร้าง { name, tags?, brief?, ref_image_keys?, ref_links?, brand_id? }
 * PUT  /api/creative-brief-templates         → เรียงลำดับ { ids: [...] } (ตำแหน่งใน array = sort_order)
 *
 * สิทธิ์: ดู = tasks.view · สร้าง/แก้/เรียง = tasks.edit (เจ้าของเลือก "ทุกคนที่แก้คอนเทนต์ได้") · ทุกการแก้เขียน audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { cleanBriefTemplateInput } from "@/lib/brief-templates";
import { friendlyDbError } from "../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "id, name, tags, brief, ref_image_keys, ref_links, brand_id, sort_order, is_active, updated_at";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const all = request.nextUrl.searchParams.get("all") === "1";
  let q = supabaseAdmin().from("erp_creative_brief_templates").select(COLS).order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (!all) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const c = cleanBriefTemplateInput(body);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  // ต่อท้ายรายการ (ลำดับถัดจากตัวท้ายสุด)
  const { data: last } = await admin.from("erp_creative_brief_templates").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const sort_order = ((last?.[0]?.sort_order as number | undefined) ?? -1) + 1;
  const { data, error } = await admin.from("erp_creative_brief_templates")
    .insert({ ...c.row, sort_order, created_by: user?.id ?? null, updated_by: user?.id ?? null }).select(COLS).single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAuditFor(request, admin, { action: "create", entityType: "creative_brief_template", entityId: String(data.id), metadata: { name: data.name, brand_id: data.brand_id } });
  return NextResponse.json({ data, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  let body: { ids?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && !!x) : [];
  if (!ids.length || ids.length > 500) return NextResponse.json({ error: "ลำดับไม่ถูกต้อง" }, { status: 400 });
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  for (const [i, id] of ids.entries()) {
    const { error } = await admin.from("erp_creative_brief_templates").update({ sort_order: i, updated_at: now }).eq("id", id);
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  }
  await writeAuditFor(request, admin, { action: "reorder", entityType: "creative_brief_template", entityId: null, metadata: { ids } });
  return NextResponse.json({ data: { ok: true }, error: null });
}
