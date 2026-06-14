/**
 * Creative Projects API — โปรเจกต์คอนเทนต์ (Brainstorm) — list + create
 * GET  /api/creative-projects?search=&status=
 * POST /api/creative-projects  { name, sku_id?, brand_id?, campaign_id?, pm_id?, google_slides_url?, drive_folder_url? }
 *        → สร้าง project + board + ผูก SKU ตระกูลเดียวกัน + seed sections + SKU card
 * ของกลาง: guardApi (tasks.*) + writeAudit. ผูก parent_skus_v2/skus_v2/brands/campaigns/user_profiles
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";
import { userLabelMap } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SECTIONS = ["อ้างอิง / Reference", "ถ่ายรูป", "วิดีโอ", "Banner & ข้อความ", "Caption", "อนุมัติ", "เสร็จ / เผยแพร่"];

async function nextProjectCode(admin: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const yr = new Date().getFullYear();
  const prefix = `CP-${yr}-`;
  const { data } = await admin.from("erp_creative_projects").select("code").like("code", `${prefix}%`).order("code", { ascending: false }).limit(1);
  const last = data?.[0]?.code as string | undefined;
  const seq = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(4, "0")}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const status = (searchParams.get("status") ?? "").trim();
  const admin = supabaseAdmin();
  let q = admin.from("erp_creative_projects")
    .select("id, code, name, status, parent_sku_id, brand_id, campaign_id, pm_id, google_slides_url, drive_folder_url, updated_at, brand:brands!brand_id(name, color), parent:parent_skus_v2!parent_sku_id(code, name_th)")
    .eq("is_active", true).order("updated_at", { ascending: false }).limit(300);
  if (search) { const t = `%${search}%`; q = q.or(`name.ilike.${t},code.ilike.${t}`); }
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];
  const pmMap = await userLabelMap(admin, rows.map((r) => r.pm_id as string));
  const items = rows.map((r) => {
    const b = (Array.isArray(r.brand) ? r.brand[0] : r.brand) as { name?: string; color?: string | null } | null;
    const p = (Array.isArray(r.parent) ? r.parent[0] : r.parent) as { code?: string; name_th?: string } | null;
    return { id: r.id, code: r.code, name: r.name, status: r.status, brand_id: r.brand_id, brand_label: b?.name ?? null, brand_color: b?.color ?? null,
      parent_sku_id: r.parent_sku_id, parent_sku_code: p?.code ?? null, parent_sku_name: p?.name_th ?? null,
      pm_id: r.pm_id, pm_label: pmMap.get(String(r.pm_id)) ?? null, google_slides_url: r.google_slides_url, drive_folder_url: r.drive_folder_url, updated_at: r.updated_at };
  });
  return NextResponse.json({ data: items, error: null });
}

type Body = { name?: string; sku_id?: string | null; brand_id?: string | null; campaign_id?: string | null; pm_id?: string | null; google_slides_url?: string | null; drive_folder_url?: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่อโปรเจกต์" }, { status: 400 });

  const admin = supabaseAdmin();

  // หา parent SKU จากสินค้าที่เลือก (ถ้ามี)
  let parentSkuId: string | null = null;
  let familySkuIds: { id: string; parent_sku_id: string | null }[] = [];
  if (body.sku_id) {
    const { data: sku } = await admin.from("skus_v2").select("id, parent_sku_id").eq("id", body.sku_id).maybeSingle();
    parentSkuId = (sku?.parent_sku_id as string | null) ?? null;
    if (parentSkuId) {
      const { data: fam } = await admin.from("skus_v2").select("id, parent_sku_id").eq("parent_sku_id", parentSkuId);
      familySkuIds = (fam ?? []) as { id: string; parent_sku_id: string | null }[];
    } else if (sku) {
      familySkuIds = [{ id: sku.id as string, parent_sku_id: null }];
    }
  }

  const code = await nextProjectCode(admin);
  const { data: project, error } = await admin.from("erp_creative_projects").insert({
    code, name, parent_sku_id: parentSkuId, brand_id: body.brand_id || null, campaign_id: body.campaign_id || null,
    pm_id: body.pm_id || null, google_slides_url: body.google_slides_url?.trim() || null, drive_folder_url: body.drive_folder_url?.trim() || null, created_by: user?.id ?? null,
  }).select("id, code").single();
  if (error || !project) return NextResponse.json({ error: friendlyDbError(error?.message ?? "insert failed") }, { status: 400 });

  // board
  const { data: board } = await admin.from("erp_creative_boards").insert({ project_id: project.id }).select("id").single();

  // ผูก SKU ตระกูลเดียวกัน
  if (familySkuIds.length) {
    await admin.from("erp_creative_project_skus").insert(familySkuIds.map((s, i) => ({ project_id: project.id, sku_id: s.id, parent_sku_id: parentSkuId, role: i === 0 ? "primary" : "variation" })));
  }

  // seed sections + SKU card
  if (board) {
    const items: Record<string, unknown>[] = SECTIONS.map((title, i) => ({ board_id: board.id, item_type: "section", title, x: 40 + i * 360, y: 40, width: 340, height: 1000, color: "slate", created_by: user?.id ?? null }));
    if (parentSkuId) items.push({ board_id: board.id, item_type: "sku_card", parent_sku_id: parentSkuId, sku_id: body.sku_id || null, x: 40, y: 60, width: 280, height: 200, created_by: user?.id ?? null });
    await admin.from("erp_creative_board_items").insert(items);
  }

  await writeAudit(admin, { action: "create", entityType: "creative_project", entityId: project.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { code, name } });
  return NextResponse.json({ id: project.id, code, board_id: board?.id ?? null, error: null });
}
