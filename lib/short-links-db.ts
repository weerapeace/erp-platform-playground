// 🔗 ลิงก์สั้น — ฝั่ง server (service role) · กติกากลางอยู่ lib/short-links
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanTargetUrl, randomShortCode, shortUrlOf, type ShortLinkRow } from "@/lib/short-links";

export const SHORT_LINK_COLS = "id, code, target_url, label, source_module, source_id, custom_code, is_active, deleted_at, click_count, last_clicked_at, created_by, created_at, updated_at";

export type EnsureOpts = { label?: string | null; sourceModule?: string | null; sourceId?: string | null; userId?: string | null };

/** หาลิงก์เดิมที่ยังไม่ลบของปลายทางนี้ (ใช้ซ้ำ ยอดคลิกรวมที่เดียว) — ตัวที่ปิดอยู่ไม่เอา */
async function findReusable(admin: SupabaseClient, url: string): Promise<ShortLinkRow | null> {
  const { data } = await admin.from("short_links").select(SHORT_LINK_COLS)
    .eq("target_url", url).is("deleted_at", null).eq("is_active", true)
    .order("created_at", { ascending: true }).limit(1);
  return ((data ?? [])[0] as ShortLinkRow | undefined) ?? null;
}

/** สร้างแถวใหม่ (สุ่มรหัส ลองใหม่ถ้าชน) — code ระบุ = ชื่อตั้งเอง (ชนแล้วคืน error) */
export async function insertShortLink(admin: SupabaseClient, url: string, opts: EnsureOpts & { code?: string | null }): Promise<{ row: ShortLinkRow | null; error: string | null }> {
  const custom = !!opts.code;
  for (let i = 0; i < (custom ? 1 : 6); i++) {
    const code = custom ? opts.code! : randomShortCode(i < 3 ? 5 : 6);
    const { data, error } = await admin.from("short_links").insert({
      code, target_url: url, label: opts.label?.trim() || null, source_module: opts.sourceModule ?? null,
      source_id: opts.sourceId ?? null, custom_code: custom, created_by: opts.userId ?? null,
    }).select(SHORT_LINK_COLS).single();
    if (!error) return { row: data as ShortLinkRow, error: null };
    if (error.code !== "23505") return { row: null, error: "บันทึกลิงก์สั้นไม่สำเร็จ ลองใหม่อีกครั้ง" };
    if (custom) return { row: null, error: "ชื่อนี้มีคนใช้แล้ว ลองชื่ออื่น" };
  }
  return { row: null, error: "สุ่มชื่อลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง" };
}

/**
 * ย่อหลายลิงก์ทีเดียว (ใช้ลิงก์เดิมซ้ำถ้ามี) → { ลิงก์ยาว: ลิงก์สั้น } + แถวที่สร้างใหม่ (ไว้จด audit)
 * ลิงก์ที่ไม่ใช่ http/https ข้ามเงียบ ๆ
 */
export async function ensureShortLinks(admin: SupabaseClient, urls: string[], opts: EnsureOpts): Promise<{ map: Record<string, string>; created: ShortLinkRow[] }> {
  const map: Record<string, string> = {};
  const created: ShortLinkRow[] = [];
  const uniq = [...new Set(urls.map((u) => String(u ?? "").trim()).filter(Boolean))].slice(0, 30);
  for (const raw of uniq) {
    const url = cleanTargetUrl(raw);
    if (!url) continue;
    let row = await findReusable(admin, url);
    if (!row) {
      const r = await insertShortLink(admin, url, opts);
      row = r.row;
      if (row) created.push(row);
    }
    if (row) { map[raw] = shortUrlOf(row.code); if (url !== raw) map[url] = shortUrlOf(row.code); }
  }
  return { map, created };
}
