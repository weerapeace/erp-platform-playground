/**
 * API สาธารณะ — หน้าเว็บที่สร้างจากหลังบ้าน : /api/public/storefront/page?shop=<slug>&page=<slug>
 *
 * ไม่ระบุ page → คืนรายการหน้าที่เผยแพร่แล้ว (ไว้ทำเมนู/แผนผังเว็บ)
 * ระบุ page    → คืนบล็อกของหน้านั้น (+ SEO)
 * preview=1    → ใช้ร่างและมองเห็นหน้าที่ยังไม่เผยแพร่ด้วย
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา + มี CORS (เหมือน products/site)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { allowDraftPreview } from "@/lib/storefront-preview-access";
import { normalizeBlocks } from "@/lib/website-blocks";
import { cleanPageMeta } from "@/lib/website-help-center";

const orUndef = (v: string) => v || undefined;

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
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
  const { data: shop } = await sb.from("shops").select("id, status").eq("slug", shopSlug).maybeSingle();
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const s = shop as { id: string; status: string };
  if (s.status !== "active") return json({ pages: [] });

  // รายการหน้า (ไว้ทำเมนู) — help = กลุ่มศูนย์ช่วยเหลือ (เว็บร้านไม่เอาไปใส่เมนูหลัก · ท้ายเว็บคอลัมน์ "ศูนย์ช่วยเหลือ" ใช้)
  // 🌐 *_en → เว็บร้านสลับเป็นอังกฤษเองบนหน้า /en (กฎ <key>_en)
  if (!pageSlug) {
    const q = sb
      .from("store_pages")
      .select("slug, title, status, seo, sort_order")
      .eq("shop_id", s.id)
      .eq("is_home", false)
      .order("sort_order")
      .order("created_at");
    const { data } = preview ? await q : await q.eq("status", "published");
    return json({
      pages: ((data ?? []) as { slug: string; title: string; status: string; seo: unknown }[]).map((p) => {
        const m = cleanPageMeta(p.seo);
        // helpKey = ชื่อกลุ่มไทย (ไม่มีคู่ _en → ไม่ถูกสลับภาษา) ใช้จับคู่กับคอลัมน์ท้ายเว็บ · help = ชื่อที่โชว์ (สลับ EN ได้)
        return { slug: p.slug, title: p.title, title_en: orUndef(m.name_en), help: orUndef(m.help), help_en: orUndef(m.help_en), helpKey: orUndef(m.help), ...(preview ? { status: p.status } : null) };
      }),
    });
  }

  const { data: p } = await sb
    .from("store_pages")
    .select("slug, title, status, seo, layout, draft_layout")
    .eq("shop_id", s.id)
    .eq("slug", pageSlug)
    .maybeSingle();
  if (!p) return json({ error: "ไม่พบหน้านี้" }, 404);

  const row = p as {
    slug: string;
    title: string;
    status: string;
    seo: unknown;
    layout: unknown;
    draft_layout: unknown;
  };

  // หน้าที่ยังไม่เผยแพร่ เห็นได้เฉพาะโหมดพรีวิว
  if (row.status !== "published" && !preview) return json({ error: "ไม่พบหน้านี้" }, 404);

  const layout = preview && row.draft_layout != null ? row.draft_layout : row.layout;
  const meta = cleanPageMeta(row.seo);

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

  return json({
    slug: row.slug,
    title: row.title,
    title_en: orUndef(meta.name_en),
    seo: { title: meta.title, description: meta.description, title_en: orUndef(meta.title_en), description_en: orUndef(meta.description_en) },
    layout: normalizeBlocks(layout),
    help,
  });
}
