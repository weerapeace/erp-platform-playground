/**
 * Creative Hashtags API — คลัง hashtag กลาง
 *
 * GET    /api/creative-hashtags?search=&brand_id=&platform=&category=
 *          → คืน hashtag ของแบรนด์ที่ระบุ + ของกลาง (brand_id null) เรียงตามถูกใช้บ่อย
 * POST   /api/creative-hashtags  { text, brand_id?, category?, platform? }  (อัปเซิร์ตตาม text)
 * DELETE /api/creative-hashtags?id=...
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeTag(s: string): string {
  let t = s.trim().replace(/\s+/g, "");
  if (!t) return "";
  if (!t.startsWith("#")) t = `#${t}`;
  return t;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search   = (searchParams.get("search") ?? "").trim();
  const brandId  = (searchParams.get("brand_id") ?? "").trim();
  const platform = (searchParams.get("platform") ?? "").trim();
  const category = (searchParams.get("category") ?? "").trim();

  const admin = supabaseAdmin();
  let q = admin.from("erp_creative_hashtags").select("*").eq("status", "active")
    .order("usage_count", { ascending: false }).order("text", { ascending: true }).limit(500);
  // แบรนด์ที่ระบุ + ของกลาง (ไม่มีแบรนด์)
  if (brandId) q = q.or(`brand_id.eq.${brandId},brand_id.is.null`);
  if (platform) q = q.or(`platform.eq.${platform},platform.is.null`);
  if (category) q = q.eq("category", category);
  if (search) q = q.ilike("text", `%${search.replace(/^#/, "")}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { text?: string; brand_id?: string | null; category?: string; platform?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const text = normalizeTag(body.text ?? "");
  if (!text || text === "#") return NextResponse.json({ error: "กรุณาใส่ hashtag" }, { status: 400 });

  const admin = supabaseAdmin();
  // อัปเซิร์ตตาม text (unique)
  const { data: existing } = await admin.from("erp_creative_hashtags").select("*").eq("text", text).maybeSingle();
  if (existing) return NextResponse.json({ data: existing, error: null });

  const { data, error } = await admin.from("erp_creative_hashtags").insert({
    text, brand_id: body.brand_id || null, category: body.category || "general", platform: body.platform || null, created_by: user?.id ?? null,
  }).select("*").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "creative_hashtag", entityId: data.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { text } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_hashtags").delete().eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "creative_hashtag", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ success: true, error: null });
}
