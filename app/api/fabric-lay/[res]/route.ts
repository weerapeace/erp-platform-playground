/**
 * ✂️ วางแบบบนผ้าลาย — รายการ / สร้างใหม่   (res = fabrics | patterns | plans)
 * GET  /api/fabric-lay/<res>?trash=1                    → { data: rows[] } (ไม่ส่งก้อนชิ้น/ตำแหน่ง · trash=1 = ในถังขยะ)
 *      patterns?ids=a,b&full=1                          → แบบตัดพร้อมชิ้น (ตัววางแผนใช้)
 *      plans?fabric_id=<id>                             → แผนของผ้าผืนนั้น
 * POST /api/fabric-lay/<res>                            → { data: row }
 * สิทธิ์ fabric_lay.view / fabric_lay.edit · audit create
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { RESOURCES, PATTERNS, PLANS, UUID, VIEW_PERM, EDIT_PERM, auditSummary, bad, knownDbError } from "../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ res: string }> };

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const r = RESOURCES[(await ctx.params).res];
  if (!r) return bad("ไม่พบข้อมูล", 404);
  const sp = new URL(request.url).searchParams;
  const trash = sp.get("trash") === "1";
  const admin = supabaseAdmin();
  let q = admin.from(r.table).select(r === PATTERNS && sp.get("full") === "1" ? `${r.listCols}, pieces` : r.listCols);
  const ids = (sp.get("ids") ?? "").split(",").filter((x) => UUID.test(x)).slice(0, 50);
  if (ids.length) q = q.in("id", ids);
  else q = q.eq("is_active", !trash);
  const fabricId = sp.get("fabric_id");
  if (r === PLANS && fabricId && UUID.test(fabricId)) q = q.eq("fabric_id", fabricId);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(2000);
  if (error) return bad(friendlyDbError(error.message), 500);
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  const r = RESOURCES[(await ctx.params).res];
  if (!r) return bad("ไม่พบข้อมูล", 404);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const v = r.clean(body, false, null);
  if (!v.ok) return bad(v.error);
  const admin = supabaseAdmin();
  const { data, error } = await admin.from(r.table).insert({ ...v.patch, is_active: true }).select("*").single();
  if (error) return bad(knownDbError(error.message) ?? friendlyDbError(error.message));
  await writeAuditFor(request, admin, {
    action: "create", entityType: r.entity, entityId: data.id,
    metadata: { code: data.code, name: data.name, ...auditSummary(r, data) },
  });
  return NextResponse.json({ data, error: null });
}
