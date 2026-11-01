// ============================================================
// ตัวช่วยฝั่ง server ของการ์ดรู้จักแบรนด์ — อ่านการ์ด + สินค้าเด่นตอนนี้ + แคปชั่นเก่า → บล็อกข้อความใส่ prompt
// ใช้ที่: /api/brand-ai-profile · /api/ai/brand-profile-draft · /api/ai/mass-plan · /api/ai/caption(-all) · /api/ai/product-detail
// แยกจากไฟล์ route เพราะ Next อนุญาตให้ route file export เฉพาะ handler/config
// ============================================================
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { BRAND_PROFILE_KEY, brandProfileLines, cleanBrandProfile, type BrandProfile } from "@/lib/marketing/brand-profile";

type Admin = ReturnType<typeof supabaseAdmin>;

/** การ์ดทุกแบรนด์ { [brand_id]: BrandProfile } */
export async function loadBrandProfiles(admin: Admin): Promise<Record<string, BrandProfile>> {
  const { data } = await admin.from("ui_config").select("value").eq("key", BRAND_PROFILE_KEY).maybeSingle();
  const raw = ((data as { value?: Record<string, unknown> } | null)?.value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(raw).map(([id, v]) => [id, cleanBrandProfile(v)]));
}

export async function loadBrandProfile(admin: Admin, brandId: string | null): Promise<BrandProfile | null> {
  if (!brandId) return null;
  return (await loadBrandProfiles(admin))[brandId] ?? null;
}

/**
 * สินค้าเด่นตอนนี้ของแบรนด์ = รุ่นที่ติดป้าย "NEW IN" (ก่อน) แล้วตามด้วย "Hero" ในหน้า SKU การตลาด · ล่าสุดก่อน
 * ไม่ได้เก็บในการ์ด — ดึงสดทุกครั้ง ทีมการตลาดเปลี่ยนป้ายเมื่อไร AI เห็นตามทันที
 */
export async function brandHighlights(admin: Admin, brandId: string | null, limit = 12): Promise<string[]> {
  if (!brandId) return [];
  const { data: labels } = await admin.from("marketing_sku_labels").select("id, name").eq("kind", "status");
  const ls = (labels ?? []) as { id: string; name: string }[];
  const newIn = ls.filter((l) => /new\s*in/i.test(l.name)).map((l) => l.id);
  const hero = ls.filter((l) => /hero/i.test(l.name)).map((l) => l.id);
  if (!newIn.length && !hero.length) return [];
  const { data } = await admin.from("marketing_sku_overview").select("name_th, code, label_id, marketing_updated_at")
    .eq("brand_id", brandId).in("label_id", [...newIn, ...hero])
    .order("marketing_updated_at", { ascending: false, nullsFirst: false }).limit(200);
  const rows = (data ?? []) as { name_th: string | null; code: string | null; label_id: string }[];
  const name = (r: { name_th: string | null; code: string | null }) => (r.name_th || r.code || "").trim().slice(0, 60);
  const half = Math.ceil(limit / 2);
  const pickedNew = rows.filter((r) => newIn.includes(r.label_id)).map(name).filter(Boolean).slice(0, half);
  const pickedHero = rows.filter((r) => hero.includes(r.label_id)).map(name).filter(Boolean);
  return [...new Set([...pickedNew, ...pickedHero])].slice(0, limit);
}

/** การ์ด (+ สินค้าเด่น ถ้าขอ) → ข้อความบล็อกเดียวพร้อมใส่ prompt · ไม่มีข้อมูล = "" */
export async function brandProfileBlock(admin: Admin, brandId: string | null, opts: { highlights?: boolean; forProduct?: boolean } = {}): Promise<string> {
  if (!brandId) return "";
  const [profile, highlights] = await Promise.all([
    loadBrandProfile(admin, brandId),
    opts.highlights ? brandHighlights(admin, brandId) : Promise.resolve([] as string[]),
  ]);
  return brandProfileLines(profile, { highlights, forProduct: opts.forProduct }).join("\n");
}

/** แคปชั่นเก่าของแบรนด์ (ใหม่ก่อน · ไม่ซ้ำ · ยาวพอเป็นตัวอย่าง) — ให้เลือกเป็นตัวอย่างในการ์ด และให้ AI ดูตอนร่างการ์ด */
export async function recentBrandCaptions(admin: Admin, brandId: string, limit = 30): Promise<{ platform: string; caption: string; title: string }[]> {
  const { data: contents } = await admin.from("erp_creative_content").select("id, title")
    .eq("brand_id", brandId).not("is_active", "is", false).order("updated_at", { ascending: false }).limit(150);   // ไม่เกิน 150 — รายการ id ไปอยู่ใน URL
  const list = (contents ?? []) as { id: string; title: string | null }[];
  if (!list.length) return [];
  const titleOf = new Map(list.map((c) => [c.id, c.title ?? ""]));
  const { data } = await admin.from("erp_creative_content_captions").select("content_id, platform, caption, updated_at")
    .in("content_id", list.map((c) => c.id)).order("updated_at", { ascending: false }).limit(400);
  const seen = new Set<string>();
  const out: { platform: string; caption: string; title: string }[] = [];
  for (const r of (data ?? []) as { content_id: string; platform: string; caption: string | null }[]) {
    const caption = (r.caption ?? "").trim();
    const key = caption.replace(/\s+/g, " ").slice(0, 120);
    if (caption.length < 40 || seen.has(key)) continue;
    seen.add(key);
    out.push({ platform: r.platform, caption: caption.slice(0, 1200), title: titleOf.get(r.content_id) ?? "" });
    if (out.length >= limit) break;
  }
  return out;
}
