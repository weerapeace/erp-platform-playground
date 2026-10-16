/**
 * 💾 ธีมที่บันทึกไว้ (ตาราง website_saved_themes) — บันทึกหน้าตาเว็บที่ปรับแล้วไว้ใช้ซ้ำ/ใช้กับร้านอื่น
 *
 * GET                                  → { themes: SavedTheme[] } (ทุกร้าน ใหม่สุดก่อน — หน้าจอแยก "ร้านนี้ / ร้านอื่น")
 * POST   { shopId, name, scope, theme } → บันทึกธีมปัจจุบัน (เก็บเฉพาะส่วนหน้าตา themeLookOf)
 * PATCH  { id, name }                  → แก้ชื่อ
 * DELETE ?id=                          → ลบ (ร้านที่เคยใช้ไปแล้วไม่กระทบ — ใช้แล้วคือคัดลอกค่าไป)
 *
 * ทำความสะอาดด้วยตัวกลาง lib/website-saved-themes · ทุกการกระทำลง audit log · แบบเดียวกับ /api/website/section-templates
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { cleanSavedThemeName, cleanSavedThemeScope, themeLookOf, type SavedTheme, type SavedThemeScope } from "@/lib/website-saved-themes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "website_saved_themes";
const ENTITY = "website_saved_theme";

type Row = { id: string; shop_id: string | null; name: string; scope: SavedThemeScope; theme: Record<string, unknown>; created_by_name: string | null; updated_at: string; shops?: { name?: string } | null };

async function actor(request: NextRequest) {
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from(TABLE)
    .select("id, shop_id, name, scope, theme, created_by_name, updated_at, shops(name)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "โหลดธีมที่บันทึกไว้ไม่สำเร็จ" }, { status: 500 });
  const themes: SavedTheme[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    shopId: r.shop_id,
    shopName: r.shops?.name ?? null,
    name: r.name,
    scope: r.scope,
    theme: r.theme,
    createdByName: r.created_by_name,
    updatedAt: r.updated_at,
  }));
  return NextResponse.json({ themes }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  let body: { shopId?: string; name?: string; scope?: string; theme?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = cleanSavedThemeName(body.name);
  if (!name) return NextResponse.json({ error: "ตั้งชื่อธีมก่อน" }, { status: 400 });
  const scope = cleanSavedThemeScope(body.scope);
  if (!scope) return NextResponse.json({ error: "เลือกว่าจะบันทึกทั้งชุดหรือเฉพาะสี" }, { status: 400 });
  if (!body.theme || typeof body.theme !== "object") return NextResponse.json({ error: "ไม่มีธีมให้บันทึก" }, { status: 400 });
  const theme = themeLookOf(body.theme, scope);

  const sb = supabaseAdmin();
  const who = await actor(request);
  const { data: row, error } = await sb
    .from(TABLE)
    .insert({ shop_id: body.shopId || null, name, scope, theme, created_by: who.id, created_by_name: who.name })
    .select("id")
    .maybeSingle();
  if (error || !row) return NextResponse.json({ error: "บันทึกธีมไม่สำเร็จ" }, { status: 500 });
  const id = (row as { id: string }).id;
  await writeAudit(sb, { action: "create", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { name, scope, shop_id: body.shopId ?? null } });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  let body: { id?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุธีม" }, { status: 400 });
  const name = cleanSavedThemeName(body.name);
  if (!name) return NextResponse.json({ error: "ชื่อธีมว่างไม่ได้" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("id, name").eq("id", body.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบธีม (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await sb.from(TABLE).update({ name, updated_at: new Date().toISOString() }).eq("id", body.id);
  if (error) return NextResponse.json({ error: "บันทึกชื่อไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  await writeAudit(sb, { action: "update", entityType: ENTITY, entityId: body.id, actorId: who.id, actorName: who.name, metadata: { name_before: (before as { name: string }).name, name_after: name } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุธีม" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("id, name, shop_id, scope").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบธีม (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบธีมไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  const b = before as { name: string; shop_id: string | null; scope: string };
  await writeAudit(sb, { action: "delete", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { name: b.name, scope: b.scope, shop_id: b.shop_id } });
  return NextResponse.json({ ok: true });
}
