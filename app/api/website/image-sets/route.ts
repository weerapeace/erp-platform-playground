/**
 * 🖼 ชุดรูปกลาง — /api/website/image-sets (ERP › เว็บไซต์ › 🖼 ชุดรูป)
 * GET    ?shop=<slug>[&lite=1]       → { sets, uses } (จัดคิวที่ถึงเวลาแล้วให้ก่อน · uses = ใช้อยู่ที่ไหนบ้าง จากหน้าแรก/หน้าเว็บ/ธีม ทั้งเผยแพร่+ร่าง)
 * POST   { shop, name }              → สร้างชุดใหม่ (ยังไม่มีรูป)
 * PATCH  { shop, id, action, ... }   → update {name?,link?,alt?,cur?} · draft {version} (📝 ร่าง ยังไม่ขึ้นเว็บ) · publish (ร่าง → เว็บจริง) · discard · schedule-add {entry} · schedule-remove {entryId} · undo
 * DELETE ?shop=&id=                  → ลบ (ยังมีที่ใช้อยู่ = 409 บอกว่าใช้ที่ไหน)
 * สิทธิ์ products.view / products.edit · ทุกการแก้ = audit + สั่งเว็บร้านล้างแคช (ขึ้นเว็บจริงทันที)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAuditFor } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { SECTION_SCHEMAS } from "@/lib/website-schema";
import { IMAGE_SET_SELECT } from "@/lib/website-image-sets-db";
import { issuePreviewKey } from "@/lib/storefront-preview-key";
import {
  IMAGE_SET_MAX,
  IMAGE_SET_QUEUE_MAX,
  cleanScheduled,
  cleanSetLink,
  cleanVersion,
  withImageSetDraft,
  findImageSetUses,
  publishImageSetDraft,
  rowToImageSet,
  settleImageSet,
  undoImageSet,
  withNewCurrent,
  type ImageSet,
} from "@/lib/website-image-sets";

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof supabaseAdmin>;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function shopOf(sb: Admin, slug: string): Promise<{ id: string; slug: string } | null> {
  const { data } = await sb.from("shops").select("id, slug").eq("slug", slug.trim()).maybeSingle();
  return (data as { id: string; slug: string } | null) ?? null;
}

/** ลิงก์เว็บร้าน + รหัสพรีวิว (ปุ่ม 👁 ดูตัวอย่างทุกที่) — ยังไม่ผูกโดเมน = null */
async function previewOf(sb: Admin, shop: { id: string; slug: string }) {
  const { data } = await sb.from("shop_domains").select("domain").eq("shop_id", shop.id).limit(1).maybeSingle();
  const raw = (data as { domain: string } | null)?.domain ?? null;
  const siteUrl = raw ? (raw.startsWith("http") ? raw : `https://${raw}`).replace(/\/$/, "") : null;
  return { siteUrl, previewKey: siteUrl ? issuePreviewKey(shop.slug) : null };
}

/** ตำแหน่งในธีม → ป้ายภาษาคน */
const THEME_LABEL: Record<string, string> = {
  menu: "เมนู",
  listing: "รูปคั่นสินค้า (หน้ารายการสินค้า)",
  logo: "โลโก้",
  header: "หัวเว็บ",
  footer: "ท้ายเว็บ",
  product: "หน้าสินค้า",
  cart: "ตะกร้า",
  checkout: "หน้าชำระเงิน",
};
const PAGE_LABEL: Record<string, string> = { thanks: "หน้าขอบคุณหลังสั่งซื้อ", popup: "ป๊อปอัปโปร", notFound: "หน้า 404", login: "หน้าเข้าสู่ระบบ", share: "รูปแชร์" };
function themeLabel(path: (string | number)[]): string {
  const [a, b] = path;
  if (a === "page" && typeof b === "string") return PAGE_LABEL[b] ?? `หน้าพิเศษ (${b})`;
  return THEME_LABEL[String(a)] ?? String(a ?? "");
}
/** ตำแหน่งในธีม → หน้าเว็บที่เห็นที่นั้น (เมนู/ป๊อปอัป = หน้าแรก) */
function themePath(path: (string | number)[]): string {
  const [a, b] = path;
  if (a === "listing") return "/shop";
  if (a === "page" && b === "thanks") return "/checkout?pv=thanks";
  return "/";
}
/** Section ในโครงหน้า → ลิงก์เลื่อนไปที่ Section นั้น */
const blockPath = (prefix: string) => (path: (string | number)[], root: unknown): string => {
  const b = Array.isArray(root) && typeof path[0] === "number" ? (root[path[0]] as Record<string, unknown> | undefined) : undefined;
  return typeof b?.id === "string" ? `${prefix}#s-${b.id}` : prefix;
};
function blockLabel(path: (string | number)[], root: unknown): string {
  const b = Array.isArray(root) && typeof path[0] === "number" ? (root[path[0]] as Record<string, unknown> | undefined) : undefined;
  if (!b) return "";
  const meta = SECTION_SCHEMAS[String(b.type)]?.meta;
  const title = typeof b.title === "string" && b.title.trim() ? ` “${b.title.trim().slice(0, 30)}”` : "";
  return `${meta ? `${meta.icon} ${meta.label}` : String(b.type)}${title}`;
}

/** ใช้อยู่ที่ไหนบ้าง (หน้าแรก · หน้าเว็บ · ธีม — ทั้งเผยแพร่และร่าง) */
async function usesOf(sb: Admin, shopId: string) {
  const [{ data: shop }, { data: pages }] = await Promise.all([
    sb.from("shops").select("home_layout, home_layout_draft, theme, theme_draft").eq("id", shopId).maybeSingle(),
    sb.from("store_pages").select("title, slug, layout, draft_layout").eq("shop_id", shopId),
  ]);
  const s = (shop ?? {}) as Record<string, unknown>;
  const docs: Parameters<typeof findImageSetUses>[0] = [
    { label: "หน้าแรก", state: "live", data: s.home_layout, labelOf: blockLabel, pathOf: blockPath("/") },
    { label: "หน้าแรก", state: "draft", data: s.home_layout_draft, labelOf: blockLabel, pathOf: blockPath("/") },
    { label: "ดีไซน์", state: "live", data: s.theme, labelOf: themeLabel, pathOf: themePath },
    { label: "ดีไซน์", state: "draft", data: s.theme_draft, labelOf: themeLabel, pathOf: themePath },
  ];
  for (const p of (pages ?? []) as { title: string; slug: string; layout: unknown; draft_layout: unknown }[]) {
    const label = `หน้า “${p.title || p.slug}”`;
    const pathOf = blockPath(`/${encodeURIComponent(p.slug)}`);
    docs.push({ label, state: "live", data: p.layout, labelOf: blockLabel, pathOf }, { label, state: "draft", data: p.draft_layout, labelOf: blockLabel, pathOf });
  }
  return findImageSetUses(docs);
}

const toRow = (s: ImageSet) => ({ name: s.name, link: s.link, alt: s.alt, cur: s.cur, draft: s.draft, queue: s.queue, history: s.history });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const shop = await shopOf(sb, request.nextUrl.searchParams.get("shop") ?? "");
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const { data } = await sb.from("store_image_sets").select(IMAGE_SET_SELECT).eq("shop_id", shop.id).order("name");
  const rows = (data ?? []) as Record<string, unknown>[];
  // ⏰ รูปตั้งเวลาที่ถึงเวลาแล้ว (ถาวร) → เป็นรูปหลัก · ช่วงเวลาที่จบแล้ว → ทิ้ง (เว็บร้านใช้รูปตามเวลาอยู่แล้ว ที่นี่แค่จัดรายการให้ตรง)
  const sets: (ImageSet & { updatedAt: string | null; updatedBy: string | null })[] = [];
  for (const r of rows) {
    const { set, changed } = settleImageSet(rowToImageSet(r));
    if (changed) await sb.from("store_image_sets").update(toRow(set)).eq("id", set.id);
    sets.push({ ...set, updatedAt: (r.updated_at as string) ?? null, updatedBy: (r.updated_by_name as string) ?? null });
  }
  // lite=1 = แค่รายชื่อชุด (ปุ่ม 🔗 ชุดรูป ในช่องรูป) ไม่ต้องไล่หาว่าใช้ที่ไหน
  if (request.nextUrl.searchParams.get("lite") === "1") return json({ sets });
  return json({ sets, uses: await usesOf(sb, shop.id), shop: await previewOf(sb, shop) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { shop?: string; name?: string } | null;
  const sb = supabaseAdmin();
  const shop = await shopOf(sb, body?.shop ?? "");
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const name = String(body?.name ?? "").trim().slice(0, 60);
  if (!name) return json({ error: "ตั้งชื่อชุดก่อน เช่น New Arrival" }, 400);
  const { count } = await sb.from("store_image_sets").select("id", { count: "exact", head: true }).eq("shop_id", shop.id);
  if ((count ?? 0) >= IMAGE_SET_MAX) return json({ error: `มีชุดรูปครบ ${IMAGE_SET_MAX} ชุดแล้ว — ลบชุดที่ไม่ใช้ก่อน` }, 400);
  const { data, error } = await sb.from("store_image_sets").insert({ shop_id: shop.id, name }).select(IMAGE_SET_SELECT).maybeSingle();
  if (error || !data) return json({ error: "สร้างชุดไม่สำเร็จ กรุณาลองใหม่" }, 500);
  const set = rowToImageSet(data as Record<string, unknown>);
  await writeAuditFor(request, sb, { action: "create", entityType: "store_image_sets", entityId: set.id, metadata: { shop_id: shop.id, name } });
  return json({ set }, 201);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const sb = supabaseAdmin();
  const shop = await shopOf(sb, String(body?.shop ?? ""));
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const id = String(body?.id ?? "");
  const { data: row } = await sb.from("store_image_sets").select(IMAGE_SET_SELECT).eq("id", id).eq("shop_id", shop.id).maybeSingle();
  if (!row) return json({ error: "ไม่พบชุดรูป" }, 404);
  const before = rowToImageSet(row as Record<string, unknown>);
  let next: ImageSet = before;
  const action = String(body?.action ?? "update");
  if (action === "update") {
    if (typeof body?.name === "string") {
      const name = body.name.trim().slice(0, 60);
      if (!name) return json({ error: "ชื่อชุดว่างไม่ได้" }, 400);
      next = { ...next, name };
    }
    if (body && "link" in body) next = { ...next, link: cleanSetLink(body.link) };
    if (typeof body?.alt === "string") next = { ...next, alt: body.alt.trim().slice(0, 160) };
    if (body && "cur" in body) {
      const v = cleanVersion(body.cur);
      // เปลี่ยนรูป = รูปเดิมเข้าประวัติ · แค่ขยับจุดสำคัญ (รูปเดิม) = ไม่นับเป็นประวัติ
      next = v.desk === next.cur.desk && v.mob === next.cur.mob ? { ...next, cur: v } : withNewCurrent(next, v);
    }
  } else if (action === "draft") {
    // 📝 แก้รูป/จุดสำคัญ = เก็บเป็นร่าง (เอารูปออกหมดก็เป็นร่าง "ไม่มีรูป") — lib/website-image-sets
    next = withImageSetDraft(next, body?.version);
  } else if (action === "publish") {
    const p = publishImageSetDraft(next);
    if (!p) return json({ error: "ยังไม่มีร่างให้ใช้" }, 400);
    next = p;
  } else if (action === "discard") {
    next = { ...next, draft: null };
  } else if (action === "schedule-add") {
    const e = cleanScheduled(body?.entry);
    if (!e) return json({ error: "ตั้งเวลาไม่ครบ — ต้องมีรูป (คอมหรือมือถือ) และวันเวลาที่เริ่มใช้" }, 400);
    if (next.queue.length >= IMAGE_SET_QUEUE_MAX) return json({ error: `ตั้งล่วงหน้าได้สูงสุด ${IMAGE_SET_QUEUE_MAX} รายการ` }, 400);
    next = { ...next, queue: [...next.queue, { ...e, id: `q${Date.now().toString(36)}` }].sort((a, b) => a.at.localeCompare(b.at)) };
  } else if (action === "schedule-remove") {
    next = { ...next, queue: next.queue.filter((q) => q.id !== String(body?.entryId ?? "")) };
  } else if (action === "undo") {
    const u = undoImageSet(next);
    if (!u) return json({ error: "ยังไม่มีรูปก่อนหน้าให้ย้อน" }, 400);
    next = u;
  } else return json({ error: "คำสั่งไม่ถูกต้อง" }, 400);

  const { data: saved, error } = await sb
    .from("store_image_sets")
    .update({ ...toRow(next), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(IMAGE_SET_SELECT)
    .maybeSingle();
  if (error || !saved) return json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, 500);
  await writeAuditFor(request, sb, {
    action: action === "undo" ? "revert" : action === "publish" ? "publish" : "update",
    entityType: "store_image_sets",
    entityId: id,
    metadata: { shop_id: shop.id, name: next.name, op: action, from: before.cur, to: next.cur, link: next.link, queue: next.queue.length },
  });
  // ร่าง/ทิ้งร่าง = เว็บจริงไม่เปลี่ยน ไม่ต้องล้างแคช
  const purged = action === "draft" || action === "discard" ? false : await purgeStorefrontCache(sb, shop.id);
  return json({ set: rowToImageSet(saved as Record<string, unknown>), purged });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const p = request.nextUrl.searchParams;
  const shop = await shopOf(sb, p.get("shop") ?? "");
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const id = p.get("id") ?? "";
  const { data: row } = await sb.from("store_image_sets").select("id, name").eq("id", id).eq("shop_id", shop.id).maybeSingle();
  if (!row) return json({ error: "ไม่พบชุดรูป" }, 404);
  const uses = (await usesOf(sb, shop.id)).filter((u) => u.setId === id);
  if (uses.length) return json({ error: "ชุดนี้ยังใช้อยู่ — เลิกผูกที่ช่องรูปเหล่านี้ก่อน (ร่างด้วย)", uses }, 409);
  const { error } = await sb.from("store_image_sets").delete().eq("id", id);
  if (error) return json({ error: "ลบไม่สำเร็จ" }, 500);
  await writeAuditFor(request, sb, { action: "delete", entityType: "store_image_sets", entityId: id, metadata: { shop_id: shop.id, name: (row as { name: string }).name } });
  return json({ ok: true });
}
