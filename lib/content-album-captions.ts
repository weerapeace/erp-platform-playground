/**
 * แคปชั่นร่างแยกแพลตฟอร์มของอัลบั้ม Contents (pure · ใช้ทั้งเซิร์ฟเวอร์และหน้าจอ)
 *   เก็บที่ content_albums.caption_drafts = { platform: { caption, hashtags, caption_type } }
 *   แพลตฟอร์มที่ยังไม่มีของตัวเอง = ใช้ caption_draft เดิม (แคปชั่นกลาง) เป็นข้อความตั้งต้น
 */
export type AlbumCaptionDraft = { caption: string | null; hashtags: string | null; caption_type: string | null };
export type AlbumCaptionDrafts = Record<string, AlbumCaptionDraft>;

const MAX_PLATFORMS = 30;
const PLATFORM_RE = /^[a-z0-9_-]{1,40}$/i;
const str = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  const t = s.slice(0, max);
  return t.trim() ? t : null;
};

/** ตรวจ/ทำความสะอาดค่าที่อ่านจาก DB หรือที่หน้าจอส่งมา — รูปแบบผิด = ข้าม · ช่องว่างทั้งหมด = ไม่เก็บแพลตฟอร์มนั้น */
export function normalizeCaptionDrafts(v: unknown): AlbumCaptionDrafts {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: AlbumCaptionDrafts = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PLATFORMS) break;
    if (!PLATFORM_RE.test(k) || !raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const d: AlbumCaptionDraft = { caption: str(r.caption, 10000), hashtags: str(r.hashtags, 2000), caption_type: str(r.caption_type, 40) };
    if (d.caption || d.hashtags || d.caption_type) out[k] = d;
  }
  return out;
}

/** แคปชั่นของแพลตฟอร์มนั้น (ของตัวเอง → แคปชั่นกลางเดิม) · ไม่มีอะไรเลย = null */
export function captionForPlatform(drafts: AlbumCaptionDrafts, legacy: string | null | undefined, platform: string): AlbumCaptionDraft | null {
  const own = drafts[platform];
  if (own && (own.caption || own.hashtags)) return own;
  const base = (legacy ?? "").trim();
  if (base) return { caption: base, hashtags: null, caption_type: own?.caption_type ?? null };
  return own ?? null;
}

/** มีแคปชั่นแล้วหรือยัง (นับสถานะอัลบั้ม "รอหา Caption") — แคปชั่นกลาง หรือแพลตฟอร์มไหนก็ได้ที่เขียนแล้ว */
export function hasAnyCaption(drafts: AlbumCaptionDrafts, legacy: string | null | undefined): string | null {
  const base = (legacy ?? "").trim();
  if (base) return base;
  for (const d of Object.values(drafts)) if ((d.caption ?? "").trim()) return d.caption;
  return null;
}
