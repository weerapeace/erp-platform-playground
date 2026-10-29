/**
 * API สาธารณะ — หน้าเว็บที่สร้างจากหลังบ้าน : /api/public/storefront/page?shop=<slug>&page=<slug>
 *
 * ไม่ระบุ page → คืนรายการหน้าที่เผยแพร่แล้ว (ไว้ทำเมนู/แผนผังเว็บ)
 * ระบุ page    → คืนบล็อกของหน้านั้น (+ SEO)
 * preview=1    → ใช้ร่างและมองเห็นหน้าที่ยังไม่เผยแพร่ด้วย
 * posts=1      → 📝 รายการบทความ (page_type post · ถึงเวลาเผยแพร่แล้ว · ใหม่สุดก่อน) — หน้า /blog ของเว็บร้าน
 * ⏰ seo.publishAt = ตั้งเวลาเผยแพร่ · ก่อนถึงเวลา = ไม่อยู่ในรายการ + เปิดหน้าไม่ได้ (พรีวิวยังเห็น)
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา + มี CORS (เหมือน products/site)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { allowDraftPreview } from "@/lib/storefront-preview-access";
import { normalizeBlocks, toPublicBlocks } from "@/lib/website-blocks";
import { resolveForStorefront } from "@/lib/website-image-sets-db";
import { cleanPageMeta, pageLive } from "@/lib/website-help-center";
import { storefrontCors, corsPreflight } from "@/lib/storefront-cors";
import { shopBySlug } from "@/lib/website-shop";

const orUndef = (v: string) => v || undefined;

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = storefrontCors("GET");

export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}

/**
 * ไม่แคชที่ edge เลย — เว็บร้านแคชเอง 60 วิ (ISR + tag) และถูก ERP สั่งล้างตอนเผยแพร่ (lib/storefront-revalidate.ts)
 * ⚠️ เคยพลาด: Vercel edge แคชไว้ 60 วิ → เผยแพร่/บันทึกร่างแล้ว เว็บยังโชว์ของเก่า
 */
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { ...CORS, "Cache-Control": "no-store" },
  });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const shopSlug = (url.searchParams.get("shop") ?? "").trim();
  const pageSlug = (url.searchParams.get("page") ?? "").trim();
  // 🔑 ร่าง = ต้องมีรหัสพรีวิว/พนักงาน (lib/storefront-preview-access · ช่วงเปลี่ยนผ่านยังปล่อย + จด log)
  const preview = url.searchParams.get("preview") === "1" && !!shopSlug && (await allowDraftPreview(request, shopSlug, "page"));
  if (!shopSlug) return json({ error: "ต้องระบุ shop" }, 400);

  const sb = supabaseAdmin();
  const s = await shopBySlug<{ id: string; status: string }>(sb, shopSlug, "id, status");
  if (!s) return json({ error: "ไม่พบร้าน" }, 404);
  if (s.status !== "active") return json({ pages: [] });

  // 📝 รายการบทความ (บล็อก)
  if (!pageSlug && url.searchParams.get("posts") === "1") {
    const q = sb.from("store_pages").select("slug, title, status, seo, created_at, updated_at").eq("shop_id", s.id).eq("page_type", "post").limit(500);
    const { data } = preview ? await q : await q.eq("status", "published");
    const posts = ((data ?? []) as { slug: string; title: string; status: string; seo: unknown; created_at: string; updated_at: string }[])
      .map((p) => ({ p, m: cleanPageMeta(p.seo) }))
      .filter(({ m }) => preview || pageLive(m))
      .map(({ p, m }) => ({
        slug: p.slug,
        title: p.title,
        title_en: orUndef(m.name_en),
        excerpt: m.excerpt || m.description,
        excerpt_en: orUndef(m.excerpt_en || m.description_en),
        cover: m.cover || null,
        tags: m.tags,
        author: m.author || null,
        publishedAt: m.publishAt || p.created_at,
        updatedAt: p.updated_at,
        ...(preview ? { status: p.status } : null),
      }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    // 🖼 รูปปกที่ผูกชุดรูป → รูปปัจจุบันของชุด
    return json((await resolveForStorefront(sb, s.id, { posts }, { draft: preview })).parts);
  }

  // รายการหน้า (ไว้ทำเมนู) — help = กลุ่มศูนย์ช่วยเหลือ (เว็บร้านไม่เอาไปใส่เมนูหลัก · ท้ายเว็บคอลัมน์ "ศูนย์ช่วยเหลือ" ใช้)
  // 🌐 *_en → เว็บร้านสลับเป็นอังกฤษเองบนหน้า /en (กฎ <key>_en)
  if (!pageSlug) {
    const q = sb
      .from("store_pages")
      .select("slug, title, status, page_type, seo, sort_order")
      .eq("shop_id", s.id)
      .eq("is_home", false)
      .order("sort_order")
      .order("created_at");
    const { data } = preview ? await q : await q.eq("status", "published");
    return json({
      // บทความไม่ขึ้นเมนู · หน้าที่ตั้งเวลาไว้ยังไม่ถึง = ยังไม่โชว์
      pages: ((data ?? []) as { slug: string; title: string; status: string; page_type: string | null; seo: unknown }[]).filter((p) => p.page_type !== "post" && (preview || pageLive(cleanPageMeta(p.seo)))).map((p) => {
        const m = cleanPageMeta(p.seo);
        // helpKey = ชื่อกลุ่มไทย (ไม่มีคู่ _en → ไม่ถูกสลับภาษา) ใช้จับคู่กับคอลัมน์ท้ายเว็บ · help = ชื่อที่โชว์ (สลับ EN ได้)
        return { slug: p.slug, title: p.title, title_en: orUndef(m.name_en), help: orUndef(m.help), help_en: orUndef(m.help_en), helpKey: orUndef(m.help), ...(preview ? { status: p.status } : null) };
      }),
    });
  }

  const { data: p } = await sb
    .from("store_pages")
    .select("slug, title, status, page_type, seo, layout, draft_layout, created_at")
    .eq("shop_id", s.id)
    .eq("slug", pageSlug)
    .maybeSingle();
  if (!p) return json({ error: "ไม่พบหน้านี้" }, 404);

  const row = p as {
    slug: string;
    title: string;
    status: string;
    page_type: string | null;
    seo: unknown;
    layout: unknown;
    draft_layout: unknown;
    created_at: string;
  };

  // หน้าที่ยังไม่เผยแพร่ เห็นได้เฉพาะโหมดพรีวิว
  if (row.status !== "published" && !preview) return json({ error: "ไม่พบหน้านี้" }, 404);

  const layout = preview && row.draft_layout != null ? row.draft_layout : row.layout;
  const meta = cleanPageMeta(row.seo);
  // ⏰ ตั้งเวลาไว้ ยังไม่ถึง = ยังเปิดไม่ได้ (พรีวิวเห็น)
  if (!preview && !pageLive(meta)) return json({ error: "ไม่พบหน้านี้" }, 404);

  // 🧭 หน้าในศูนย์ช่วยเหลือ → ส่งรายชื่อหน้าในกลุ่มเดียวกันไปทำเมนูซ้าย (พรีวิว = รวมร่าง)
  let help: { group: string; group_en?: string; nav: { slug: string; title: string; title_en?: string }[] } | undefined;
  if (meta.help) {
    const nq = sb.from("store_pages").select("slug, title, status, seo").eq("shop_id", s.id).eq("is_home", false).eq("seo->>help", meta.help).order("sort_order").order("created_at");
    const { data: navRows } = preview ? await nq : await nq.eq("status", "published");
    help = {
      group: meta.help,
      group_en: orUndef(meta.help_en),
      nav: ((navRows ?? []) as { slug: string; title: string; seo: unknown }[]).map((n) => ({ slug: n.slug, title: n.title, title_en: orUndef(cleanPageMeta(n.seo).name_en) })),
    };
  }

  const body = {
    slug: row.slug,
    title: row.title,
    title_en: orUndef(meta.name_en),
    seo: { title: meta.title, description: meta.description, title_en: orUndef(meta.title_en), description_en: orUndef(meta.description_en) },
    layout: toPublicBlocks(normalizeBlocks(layout)),
    help,
    pageType: row.page_type === "post" ? "post" : "static",
    bare: meta.bare || undefined,
    ...(row.page_type === "post"
      ? { post: { cover: meta.cover || null, excerpt: meta.excerpt || meta.description, excerpt_en: orUndef(meta.excerpt_en || meta.description_en), tags: meta.tags, author: meta.author || null, publishedAt: meta.publishAt || row.created_at } }
      : null),
  };
  // 🖼 ชุดรูปกลาง: ช่องรูปที่ผูกชุด → รูปปัจจุบันของชุด · imageFocus = จุดสำคัญของรูป (เว็บร้านรวมกับของทั้งเว็บ)
  const resolved = await resolveForStorefront(sb, s.id, { layout: body.layout, post: "post" in body ? body.post : undefined }, { draft: preview });
  return json({ ...body, ...resolved.parts, ...(Object.keys(resolved.focus).length ? { imageFocus: resolved.focus } : {}) });
}
