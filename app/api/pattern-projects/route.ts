/**
 * /api/pattern-projects — แพทเทิร์นของแอปสตูดิโอแพทเทิร์น
 *
 * GET  ?q=&status=draft|ready|archived|all  → { data: แถวสรุป[], me: { can_edit, can_delete }, error }   (pattern_studio.view)
 *      ค่าเริ่ม = ไม่รวมที่เก็บเข้ากรุ · ล่าสุดก่อน · ไม่ส่งชิ้น/ตะเข็บ (หน้ารายการใช้ช่องสรุป + ภาพย่อ)
 * POST { name, sku_code?, pieces?, seams?, basis?, template? }  → สร้างแพทเทิร์น (pattern_studio.edit) · เลขจาก erp_next_number('pattern_project')
 * ตรวจข้อมูลด้วย lib/pattern-project (cleanProjectPatch) · รูปทรงผิด = ไม่บันทึก
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { PATTERN_PROJECT_STATUSES, cleanProjectPatch } from "@/lib/pattern-project";
import { PROJECT_LIST_COLS, PROJECT_PERM, PROJECT_TABLE, derivedColumns, loadProjectActor } from "@/lib/pattern-project-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PROJECT_PERM.view); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status") ?? "";
  const q = (sp.get("q") ?? "").replace(/[,()%]/g, " ").trim();

  let query = admin.from(PROJECT_TABLE).select(PROJECT_LIST_COLS).eq("is_active", true).order("updated_at", { ascending: false }).limit(500);
  if ((PATTERN_PROJECT_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  else if (status !== "all") query = query.neq("status", "archived");
  if (q) query = query.or(`name.ilike.%${q}%,pattern_no.ilike.%${q}%,sku_code.ilike.%${q}%,owner_name.ilike.%${q}%`);

  const [list, actor] = await Promise.all([query, loadProjectActor(request, admin)]);
  if (list.error) return NextResponse.json({ data: [], me: null, error: "โหลดรายการแพทเทิร์นไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  return NextResponse.json({ data: list.data ?? [], me: { can_edit: actor.canEdit, can_delete: actor.canDelete }, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PROJECT_PERM.edit); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!("name" in body)) body.name = "";
  const { patch, error } = cleanProjectPatch(body, []);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const admin = supabaseAdmin();
  const actor = await loadProjectActor(request, admin);
  let patternNo: string | null = null;
  try { const { data: n } = await admin.rpc("erp_next_number", { p_key: "pattern_project", p_branch: null }); if (n) patternNo = String(n); } catch { /* ไม่มีเลข = ปล่อยว่าง */ }

  const pieces = patch.pieces ?? [], seams = patch.seams ?? [], basis = patch.basis ?? "box";
  const row = {
    pattern_no: patternNo, name: patch.name!, sku_code: patch.sku_code ?? null, note: patch.note ?? "",
    pieces, seams, basis, template: patch.template ?? null, ...derivedColumns(pieces, seams, basis),
    owner_id: actor.userId, owner_name: actor.name, updated_by_name: actor.name,
  };
  const { data, error: e } = await admin.from(PROJECT_TABLE).insert(row).select("id, pattern_no").single();
  if (e || !data) return NextResponse.json({ error: "สร้างแพทเทิร์นไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });

  await writeAudit(admin, {
    action: "create", entityType: PROJECT_TABLE, entityId: data.id, actorId: actor.userId, actorName: actor.name,
    metadata: { pattern_no: data.pattern_no, name: row.name, piece_count: row.piece_count, seam_count: row.seam_count },
  });
  return NextResponse.json({ data, error: null });
}
