/**
 * 🗂 รูปบนเว็บ — /api/website/site-images (ERP › เว็บไซต์ › 🗂 รูปบนเว็บ) · กฎ: lib/website-site-images
 * GET   ?shop=<slug>                              → { images, shop } รูป/วิดีโอทุกรูปที่ใช้บนเว็บ + ใช้อยู่ที่ไหน + คำอธิบาย + ข้อมูลไฟล์ (คลังไฟล์กลาง)
 * PATCH { shop, action:"replace", from, to }      → 🔄 เปลี่ยนรูปทุกที่ — แทนในร่างของ หน้าแรก/หน้าเว็บ/ดีไซน์ (เว็บจริงไม่เปลี่ยนจนกดเผยแพร่ที่แท็บนั้น)
 * PATCH { shop, action:"make-set", key, name }    → 🔗 สร้างชุดรูปกลางจากรูปนี้ + ผูกทุกที่ที่ใช้รูปนี้ (ลงร่างเหมือนกัน)
 * PATCH { shop, action:"alt", key, alt }          → 📝 คำอธิบายรูป (store_settings "image_alts") — ไม่เปลี่ยนหน้าตา ขึ้นเว็บทันที
 * ชุดมาใหม่ = ดูอย่างเดียว (แก้ที่แท็บ 🆕 มาใหม่) · สิทธิ์กลุ่ม "หน้าตาเว็บ" (lib/website-access) · ทุกการแก้ = audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAuditFor } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { issuePreviewKey } from "@/lib/storefront-preview-key";
import { IMAGE_SET_SELECT } from "@/lib/website-image-sets-db";
import { EMPTY_VERSION, IMAGE_SET_MAX, imgSetIdOf, imgSetRef, rowToImageSet } from "@/lib/website-image-sets";
import {
  IMAGE_ALTS_SETTING,
  blockLabel,
  blockPath,
  cleanImageAlts,
  collectSiteImages,
  isMediaKey,
  isReplacementValue,
  isVideoKey,
  placeDetail,
  replaceMedia,
  withImageAlt,
  type SiteDoc,
} from "@/lib/website-site-images";

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof supabaseAdmin>;
type Path = (string | number)[];
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function shopOf(sb: Admin, slug: string): Promise<{ id: string; slug: string } | null> {
  const { data } = await sb.from("shops").select("id, slug").eq("slug", slug.trim()).maybeSingle();
  return (data as { id: string; slug: string } | null) ?? null;
}

/** ลิงก์เว็บร้าน + รหัสพรีวิว (ปุ่ม 👁 ดูในพรีวิว) — ยังไม่ผูกโดเมน = null */
async function previewOf(sb: Admin, shop: { id: string; slug: string }) {
  const { data } = await sb.from("shop_domains").select("domain").eq("shop_id", shop.id).limit(1).maybeSingle();
  const raw = (data as { domain: string } | null)?.domain ?? null;
  const siteUrl = raw ? (raw.startsWith("http") ? raw : `https://${raw}`).replace(/\/$/, "") : null;
  return { siteUrl, previewKey: siteUrl ? issuePreviewKey(shop.slug) : null };
}

/** ชุดมาใหม่: ปก · รูปแทรก · โครงหน้าของชุด */
function dropLabel(p: Path, root: unknown): string {
  const r = (root ?? {}) as Record<string, unknown>;
  if (p[0] === "cover") return "ปก";
  if (p[0] === "coverMobile") return "ปก (มือถือ)";
  if (p[0] === "layout") return [blockLabel(p.slice(1), r.layout), placeDetail(p.slice(1), r.layout, 1)].filter(Boolean).join(" › ");
  return placeDetail(p, root, 0);
}

/** ทุกที่ของเว็บที่มีรูปที่ใส่เอง: หน้าแรก · ดีไซน์ · หน้าเว็บ · ชุดมาใหม่ (เผยแพร่ + ร่าง) */
async function loadDocs(sb: Admin, shopId: string): Promise<SiteDoc[]> {
  const [{ data: shop }, { data: pages }, { data: drops }] = await Promise.all([
    sb.from("shops").select("home_layout, home_layout_draft, theme, theme_draft").eq("id", shopId).maybeSingle(),
    sb.from("store_pages").select("id, title, slug, layout, draft_layout, is_home").eq("shop_id", shopId).order("sort_order"),
    sb.from("store_new_drops").select("id, title, image_key, image_mobile_key, inserts, layout, draft_layout").eq("shop_id", shopId),
  ]);
  const s = (shop ?? {}) as Record<string, unknown>;
  const docs: SiteDoc[] = [
    { kind: "home", id: "home", label: "หน้าแรก", live: s.home_layout ?? null, draft: s.home_layout_draft ?? null, editable: true },
    { kind: "theme", id: "theme", label: "ดีไซน์", live: s.theme ?? null, draft: s.theme_draft ?? null, editable: true },
  ];
  // หน้าแรกแบบเก่าใน store_pages (is_home) ไม่ได้ใช้แล้ว — หน้าแรกจริงอยู่ที่ shops.home_layout
  for (const p of (pages ?? []) as { id: string; title: string; slug: string; layout: unknown; draft_layout: unknown; is_home: boolean | null }[]) {
    if (p.is_home) continue;
    docs.push({ kind: "page", id: p.id, label: `หน้า “${p.title || p.slug}”`, live: p.layout ?? null, draft: p.draft_layout ?? null, editable: true, pathOf: blockPath(`/${encodeURIComponent(p.slug)}`) });
  }
  for (const d of (drops ?? []) as { id: string; title: string; image_key: string | null; image_mobile_key: string | null; inserts: unknown; layout: unknown; draft_layout: unknown }[]) {
    const live = { cover: d.image_key, coverMobile: d.image_mobile_key, inserts: d.inserts, layout: d.layout };
    docs.push({
      kind: "drop",
      id: d.id,
      label: `มาใหม่ “${d.title || "ไม่มีชื่อ"}”`,
      live,
      draft: d.draft_layout != null ? { ...live, layout: d.draft_layout } : null,
      editable: false,
      labelOf: dropLabel,
      pathOf: () => `/new/${encodeURIComponent(d.id)}`,
    });
  }
  return docs;
}

async function readAlts(sb: Admin, shopId: string) {
  const { data } = await sb.from("store_settings").select("value").eq("shop_id", shopId).eq("key", IMAGE_ALTS_SETTING).maybeSingle();
  return cleanImageAlts((data as { value: string | null } | null)?.value ?? null);
}

/** ข้อมูลไฟล์จากคลังไฟล์กลาง (ชื่อ · ขนาด · กว้างxสูง) — รูปที่ไม่ได้ลงคลัง = ไม่มี */
async function fileInfo(sb: Admin, keys: string[]) {
  const out = new Map<string, { name: string; size: number | null; w: number | null; h: number | null }>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await sb.from("assets").select("r2_key, title, file_name, size_bytes, width, height").in("r2_key", keys.slice(i, i + 100));
    for (const a of (data ?? []) as { r2_key: string; title: string | null; file_name: string | null; size_bytes: number | null; width: number | null; height: number | null }[])
      out.set(a.r2_key, { name: a.title || a.file_name || "", size: a.size_bytes, w: a.width, h: a.height });
  }
  return out;
}

/**
 * แทนรูปในร่างของทุกที่ที่แก้ได้ (หน้าแรก · ดีไซน์ · หน้าเว็บ) — ไม่มีร่าง = เริ่มร่างจากตัวที่เผยแพร่
 * คืนรายการที่เปลี่ยน (ป้าย · แท็บที่ต้องไปกดเผยแพร่) + จำนวนที่อยู่ในชุดมาใหม่ (ต้องเปลี่ยนเองที่แท็บ 🆕 มาใหม่)
 */
async function replaceEverywhere(sb: Admin, shopId: string, from: string, to: string) {
  const docs = await loadDocs(sb, shopId);
  const changed: { kind: SiteDoc["kind"]; id: string; label: string; count: number }[] = [];
  let readOnly = 0;
  for (const d of docs) {
    const base = d.draft != null ? d.draft : d.live;
    const r = replaceMedia(base, from, to);
    if (!r.count) continue;
    if (!d.editable) {
      readOnly += r.count;
      continue;
    }
    const q =
      d.kind === "home"
        ? sb.from("shops").update({ home_layout_draft: r.data }).eq("id", shopId)
        : d.kind === "theme"
          ? sb.from("shops").update({ theme_draft: r.data }).eq("id", shopId)
          : sb.from("store_pages").update({ draft_layout: r.data }).eq("id", d.id).eq("shop_id", shopId);
    const { error } = await q;
    if (error) throw new Error(`บันทึก${d.label}ไม่สำเร็จ`);
    changed.push({ kind: d.kind, id: d.id, label: d.label, count: r.count });
  }
  return { changed, readOnly };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const shop = await shopOf(sb, request.nextUrl.searchParams.get("shop") ?? "");
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const [docs, alts] = await Promise.all([loadDocs(sb, shop.id), readAlts(sb, shop.id)]);
  const images = collectSiteImages(docs);
  const files = await fileInfo(sb, images.map((i) => i.key));
  return json({
    images: images.map((i) => ({ ...i, alt: alts[i.key] ?? "", file: files.get(i.key) ?? null })),
    shop: await previewOf(sb, shop),
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const sb = supabaseAdmin();
  const shop = await shopOf(sb, String(body?.shop ?? ""));
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const action = String(body?.action ?? "");

  if (action === "alt") {
    const key = String(body?.key ?? "");
    if (!isMediaKey(key)) return json({ error: "ไม่พบรูปนี้" }, 400);
    const before = await readAlts(sb, shop.id);
    const next = withImageAlt(before, key, String(body?.alt ?? ""));
    const { error } = await sb.from("store_settings").upsert({ shop_id: shop.id, key: IMAGE_ALTS_SETTING, value: JSON.stringify(next), updated_at: new Date().toISOString() }, { onConflict: "shop_id,key" });
    if (error) return json({ error: "บันทึกคำอธิบายไม่สำเร็จ กรุณาลองใหม่" }, 500);
    await writeAuditFor(request, sb, { action: "update", entityType: "store_site_images", entityId: shop.id, metadata: { shop_id: shop.id, op: "alt", key, from: before[key] ?? "", to: next[key] ?? "" } });
    // คำอธิบายรูปไม่เปลี่ยนหน้าตา → ขึ้นเว็บทันที (ล้างแคชเว็บร้าน)
    const purged = await purgeStorefrontCache(sb, shop.id);
    return json({ ok: true, alt: next[key] ?? "", purged });
  }

  if (action === "replace") {
    const from = String(body?.from ?? "");
    const to = String(body?.to ?? "").trim();
    if (!isMediaKey(from)) return json({ error: "ไม่พบรูปเดิม" }, 400);
    if (!isReplacementValue(to) || to === from) return json({ error: "เลือกรูปใหม่ก่อน" }, 400);
    if (isVideoKey(from) !== isVideoKey(to) && !imgSetIdOf(to)) return json({ error: isVideoKey(from) ? "รูปเดิมเป็นวิดีโอ — เลือกวิดีโอมาแทน" : "รูปเดิมเป็นรูปภาพ — เลือกรูปภาพมาแทน" }, 400);
    const setId = imgSetIdOf(to);
    if (setId) {
      if (isVideoKey(from)) return json({ error: "ชุดรูปกลางใช้แทนวิดีโอไม่ได้" }, 400);
      const { data: set } = await sb.from("store_image_sets").select("id").eq("id", setId).eq("shop_id", shop.id).maybeSingle();
      if (!set) return json({ error: "ไม่พบชุดรูปนี้" }, 400);
    }
    try {
      const r = await replaceEverywhere(sb, shop.id, from, to);
      if (!r.changed.length && !r.readOnly) return json({ error: "ไม่พบรูปนี้ในหน้าที่แก้ได้แล้ว — ลองโหลดใหม่" }, 409);
      await writeAuditFor(request, sb, { action: "update", entityType: "store_site_images", entityId: shop.id, metadata: { shop_id: shop.id, op: "replace", from, to, changed: r.changed, read_only: r.readOnly } });
      return json({ ok: true, ...r });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "เปลี่ยนรูปไม่สำเร็จ" }, 500);
    }
  }

  if (action === "make-set") {
    const key = String(body?.key ?? "");
    const name = String(body?.name ?? "").trim().slice(0, 60);
    if (!isMediaKey(key) || isVideoKey(key)) return json({ error: "ทำชุดรูปได้เฉพาะรูปภาพ" }, 400);
    if (!name) return json({ error: "ตั้งชื่อชุดก่อน เช่น แบนเนอร์หน้าแรก" }, 400);
    const { count } = await sb.from("store_image_sets").select("id", { count: "exact", head: true }).eq("shop_id", shop.id);
    if ((count ?? 0) >= IMAGE_SET_MAX) return json({ error: `มีชุดรูปครบ ${IMAGE_SET_MAX} ชุดแล้ว — ลบชุดที่ไม่ใช้ก่อน (แท็บ 🖼 ชุดรูป)` }, 400);
    const { data, error } = await sb
      .from("store_image_sets")
      .insert({ shop_id: shop.id, name, cur: { ...EMPTY_VERSION, desk: key } })
      .select(IMAGE_SET_SELECT)
      .maybeSingle();
    if (error || !data) return json({ error: "สร้างชุดไม่สำเร็จ กรุณาลองใหม่" }, 500);
    const set = rowToImageSet(data as Record<string, unknown>);
    await writeAuditFor(request, sb, { action: "create", entityType: "store_image_sets", entityId: set.id, metadata: { shop_id: shop.id, name, from_image: key } });
    try {
      const r = await replaceEverywhere(sb, shop.id, key, imgSetRef(set.id));
      await writeAuditFor(request, sb, { action: "update", entityType: "store_site_images", entityId: shop.id, metadata: { shop_id: shop.id, op: "make-set", key, set_id: set.id, changed: r.changed, read_only: r.readOnly } });
      return json({ ok: true, set: { id: set.id, name: set.name }, ...r });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "ผูกชุดรูปไม่สำเร็จ", set: { id: set.id, name: set.name } }, 500);
    }
  }

  return json({ error: "คำสั่งไม่ถูกต้อง" }, 400);
}
