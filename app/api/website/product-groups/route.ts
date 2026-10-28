/**
 * 📦 กลุ่มสินค้าของเว็บร้าน (ERP แท็บ 🏷 โปรโมชัน › กลุ่มสินค้า) : /api/website/product-groups
 * GET    ?shop=<slug>          → { groups, usedBy: { [groupId]: ชื่อโปรที่ใช้กลุ่มนี้[] } }
 * POST   { shopId, ...group }  → สร้าง
 * PATCH  { id, ...group }      → แก้ (โปรที่ใช้กลุ่มนี้เปลี่ยนตามทันที ~1 นาทีบนเว็บ)
 * DELETE ?id=                  → ลบ — ห้ามถ้ายังมีโปรใช้อยู่ (บอกชื่อโปร ให้เอาออกจากโปรก่อน)
 * สิทธิ์: กลุ่มงาน "โปรโมชัน" ของเว็บไซต์ (guardWebsite ดู/แก้ + สิทธิ์รายร้าน · lib/website-access) · ทุกการเปลี่ยนลง audit · กฎตรวจ lib/website-product-groups sanitizeGroup
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAudit } from "@/lib/audit";
import { groupFromRow, sanitizeGroup, type ProductGroupRow } from "@/lib/website-product-groups";
import { promotionFromRow } from "@/lib/website-promotions";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "store_product_groups";
const ENTITY = "store_product_group";

async function actor(request: NextRequest) {
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}

const toRow = (g: Omit<ProductGroupRow, "id" | "updatedAt">) => ({ name: g.name, mode: g.mode, codes: g.codes, match: g.match, note: g.note || null });

type Admin = ReturnType<typeof supabaseAdmin>;

/** โปรของร้านที่อ้างกลุ่มไหนบ้าง (ร่วม + ยกเว้น) → { groupId: ชื่อโปร[] } */
async function groupUsage(sb: Admin, shopId: string): Promise<Record<string, string[]>> {
  const { data } = await sb.from("store_promotions").select("*").eq("shop_id", shopId).limit(200);
  const used: Record<string, string[]> = {};
  for (const p of ((data ?? []) as Record<string, unknown>[]).map(promotionFromRow)) {
    for (const id of new Set([...(p.rule.scope.groups ?? []), ...(p.rule.scope.excludeGroups ?? [])])) (used[id] ??= []).push(p.name);
  }
  return used;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const slug = (request.nextUrl.searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const shop = await shopBySlug(sb, slug);
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const shopId = (shop as { id: string }).id;
  const { data, error } = await sb.from(TABLE).select("*").eq("shop_id", shopId).order("name").limit(200);
  if (error) return NextResponse.json({ error: "โหลดกลุ่มสินค้าไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ groups: ((data ?? []) as Record<string, unknown>[]).map(groupFromRow), usedBy: await groupUsage(sb, shopId) }, { headers: { "Cache-Control": "no-store" } });
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  const shopId = String(body.shopId ?? "");
  if (!shopId) return NextResponse.json({ error: "ต้องระบุร้าน" }, { status: 400 });
  const v = sanitizeGroup(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const sb = supabaseAdmin();
  const who = await actor(request);
  const { data, error } = await sb
    .from(TABLE)
    .insert({ ...toRow(v.group), shop_id: shopId, created_by: who.id, created_by_name: who.name })
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "บันทึกกลุ่มสินค้าไม่สำเร็จ" }, { status: 500 });
  const id = (data as { id: string }).id;
  await writeAudit(sb, { action: "create", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { shop_id: shopId, ...toRow(v.group) } });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "ต้องระบุกลุ่ม" }, { status: 400 });
  const v = sanitizeGroup(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบกลุ่ม (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const patch = toRow(v.group);
  const { error } = await sb.from(TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "บันทึกกลุ่มสินค้าไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  const b = before as Record<string, unknown>;
  await writeAudit(sb, { action: "update", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { before: { name: b.name, mode: b.mode, codes: b.codes, match: b.match }, after: patch } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const id = (request.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุกลุ่ม" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบกลุ่ม" }, { status: 404 });
  const names = (await groupUsage(sb, String((before as { shop_id: string }).shop_id)))[id] ?? [];
  if (names.length) return NextResponse.json({ error: `กลุ่มนี้ยังใช้อยู่ในโปร: ${names.join(", ")} — เอากลุ่มออกจากโปรก่อน แล้วค่อยลบ` }, { status: 409 });
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  await writeAudit(sb, { action: "delete", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: before as Record<string, unknown> });
  return NextResponse.json({ ok: true });
}
