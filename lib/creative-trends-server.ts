// ============================================================
// ตัวช่วยฝั่ง server ของโมดูลเทรนด์ — ปะรูปปก (ภาพถ่ายกระดาน) + ชื่อแบรนด์ + % ความครบ
// แยกออกจากไฟล์ route เพราะ Next อนุญาตให้ route file export เฉพาะ handler/config
// ใช้ที่: /api/creative-trends (list/create) และ /api/creative-trends/[id]
// ============================================================
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { trendProgress, type TrendChecklist } from "@/lib/creative-trends-meta";

export type TrendItem = {
  id: string; title: string; summary: string | null; heat: string;
  brand_id: string | null; brand_name: string | null;
  platforms: string[]; tags: string[]; source_url: string | null;
  start_date: string | null; end_date: string | null;
  checklist: TrendChecklist; done: number; total: number; percent: number; missing_core: string[];
  cover_url: string | null; is_active: boolean; updated_at: string;
};

type Row = Record<string, unknown>;

/** ปะรูปปก (ภาพถ่ายกระดานของเทรนด์นั้น) + ชื่อแบรนด์ + คิด % ความครบ ให้แต่ละเทรนด์ */
export async function decorateTrends(admin: ReturnType<typeof supabaseAdmin>, rows: Row[]): Promise<TrendItem[]> {
  const ids = rows.map((r) => String(r.id));
  const coverById = new Map<string, string>();
  if (ids.length) {
    const { data: sketches } = await admin.from("erp_canvas_sketches")
      .select("entity_id, preview_r2_key").eq("entity_type", "creative_trend").in("entity_id", ids);
    for (const s of ((sketches ?? []) as { entity_id: string; preview_r2_key: string | null }[])) {
      if (s.preview_r2_key) coverById.set(String(s.entity_id), `/api/r2-image?key=${encodeURIComponent(s.preview_r2_key)}`);
    }
  }
  const brandIds = [...new Set(rows.map((r) => r.brand_id).filter(Boolean).map(String))];
  const brandName = new Map<string, string>();
  if (brandIds.length) {
    const { data: bs } = await admin.from("brands").select("id, name").in("id", brandIds);
    for (const b of ((bs ?? []) as { id: string; name: string }[])) brandName.set(String(b.id), b.name);
  }
  return rows.map((r) => {
    const checklist = (r.checklist ?? {}) as TrendChecklist;
    const p = trendProgress(checklist);
    return {
      id: String(r.id), title: String(r.title ?? ""), summary: (r.summary as string) ?? null,
      heat: String(r.heat ?? "rising"),
      brand_id: (r.brand_id as string) ?? null, brand_name: r.brand_id ? (brandName.get(String(r.brand_id)) ?? null) : null,
      platforms: Array.isArray(r.platforms) ? (r.platforms as string[]) : [],
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      source_url: (r.source_url as string) ?? null,
      start_date: (r.start_date as string) ?? null, end_date: (r.end_date as string) ?? null,
      checklist, done: p.done, total: p.total, percent: p.percent,
      missing_core: p.missingCore.map((c) => c.key),
      cover_url: coverById.get(String(r.id)) ?? null,
      is_active: r.is_active !== false, updated_at: String(r.updated_at ?? ""),
    };
  });
}
