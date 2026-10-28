/**
 * 🆕 จัดการ "มาใหม่เป็นชุด" ของร้าน — /api/website/new-drops (แท็บ 🆕 มาใหม่ ในหน้าจัดการเว็บร้าน)
 *
 * GET    ?shop=<slug>|shopId=<uuid>          → { drops: NewDrop[] (เปิดล่าสุดก่อน) }
 * POST   { shopId, drop }                    → สร้างชุด + audit
 * PATCH  { shopId, id, drop }                → แก้ชุด + audit (เก็บค่าก่อนแก้)
 * DELETE ?id=<uuid>                          → ลบชุด + audit (สินค้าไม่ถูกลบ — แค่เลิกเป็นชุด)
 *
 * ของกลาง: guardWebsite (สิทธิ์เว็บไซต์ · lib/website-access) + writeAudit · ตรวจค่า lib/website-new-drops (normalizeDropInput)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAudit } from "@/lib/audit";
import { dropFromRow, dropToRow, normalizeDropInput } from "@/lib/website-new-drops";
import { normalizeListingInserts } from "@/lib/website-listing";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id, title, title_en, subtitle, subtitle_en, image_key, image_mobile_key, codes, start_at, end_at, hide_until_start, inserts";

/** 🖼 รูปแทรกของชุด → ทำความสะอาดด้วยของกลางหน้ารายการสินค้า (ไม่ส่งมา = คงเดิม) */
const cleanInserts = <T extends { inserts?: unknown[] }>(v: T): T => (v.inserts ? { ...v, inserts: normalizeListingInserts(v.inserts) } : v);

async function shopIdOf(sb: ReturnType<typeof supabaseAdmin>, p: URLSearchParams): Promise<string | null> {
  const id = (p.get("shopId") ?? "").trim();
  if (UUID.test(id)) return id;
  const slug = (p.get("shop") ?? "").trim();
  if (!slug) return null;
  const data = await shopBySlug(sb, slug);
  return (data as { id: string } | null)?.id ?? null;
}

async function actor(request: NextRequest) {
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const shopId = await shopIdOf(sb, new URL(request.url).searchParams);
  if (!shopId) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const { data, error } = await sb.from("store_new_drops").select(COLS).eq("shop_id", shopId).order("start_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "โหลดชุดมาใหม่ไม่สำเร็จ", drops: [] }, { status: 500 });
  // 🧱 ชุดไหนจัดหน้าเองแล้ว / มีร่างค้าง (ป้ายบนการ์ด) — ดึงแค่ id ไม่ดึง Section ทั้งก้อน
  const [{ data: pub }, { data: dr }] = await Promise.all([
    sb.from("store_new_drops").select("id").eq("shop_id", shopId).not("layout", "is", null),
    sb.from("store_new_drops").select("id").eq("shop_id", shopId).not("draft_layout", "is", null),
  ]);
  const pubIds = new Set(((pub ?? []) as { id: string }[]).map((r) => r.id));
  const draftIds = new Set(((dr ?? []) as { id: string }[]).map((r) => r.id));
  return NextResponse.json({
    drops: ((data ?? []) as Record<string, unknown>[]).map(dropFromRow),
    pages: Object.fromEntries([...new Set([...pubIds, ...draftIds])].map((id) => [id, { custom: pubIds.has(id), draft: draftIds.has(id) }])),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  let body: { shopId?: unknown; drop?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const shopId = typeof body.shopId === "string" && UUID.test(body.shopId) ? body.shopId : null;
  if (!shopId) return NextResponse.json({ error: "ต้องระบุร้าน" }, { status: 400 });
  const v = normalizeDropInput(body.drop);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const who = await actor(request);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("store_new_drops")
    .insert({ ...dropToRow(cleanInserts(v.value)), shop_id: shopId, created_by: who.name })
    .select(COLS)
    .single();
  if (error || !data) return NextResponse.json({ error: "สร้างชุดไม่สำเร็จ" }, { status: 500 });
  const drop = dropFromRow(data as Record<string, unknown>);
  await writeAudit(sb, { action: "create", entityType: "store_new_drop", entityId: drop.id, actorId: who.id, actorName: who.name, metadata: { shop_id: shopId, drop } });
  return NextResponse.json({ ok: true, drop });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  let body: { shopId?: unknown; id?: unknown; drop?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ error: "ต้องระบุชุด" }, { status: 400 });
  const v = normalizeDropInput(body.drop);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const who = await actor(request);
  const sb = supabaseAdmin();
  const { data: before } = await sb.from("store_new_drops").select(`${COLS}, shop_id`).eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบชุดนี้" }, { status: 404 });
  const { data, error } = await sb
    .from("store_new_drops")
    .update({ ...dropToRow(cleanInserts(v.value)), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLS)
    .single();
  if (error || !data) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  const drop = dropFromRow(data as Record<string, unknown>);
  await writeAudit(sb, {
    action: "update",
    entityType: "store_new_drop",
    entityId: id,
    actorId: who.id,
    actorName: who.name,
    metadata: { shop_id: (before as { shop_id: string }).shop_id, before: dropFromRow(before as Record<string, unknown>), after: drop },
  });
  return NextResponse.json({ ok: true, drop });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!UUID.test(id)) return NextResponse.json({ error: "ต้องระบุชุด" }, { status: 400 });
  const who = await actor(request);
  const sb = supabaseAdmin();
  const { data: before } = await sb.from("store_new_drops").select(`${COLS}, shop_id`).eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบชุดนี้" }, { status: 404 });
  const { error } = await sb.from("store_new_drops").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  await writeAudit(sb, {
    action: "delete",
    entityType: "store_new_drop",
    entityId: id,
    actorId: who.id,
    actorName: who.name,
    metadata: { shop_id: (before as { shop_id: string }).shop_id, drop: dropFromRow(before as Record<string, unknown>) },
  });
  return NextResponse.json({ ok: true });
}
