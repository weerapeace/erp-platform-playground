/**
 * Reference ของรายการที่อยากได้ / อัลบั้ม Contents (ของกลาง · pure → ใช้ได้ทั้งหน้าจอ / API / test)
 *   ลิงก์ → รู้ว่ามาจากไหน (TikTok/YouTube/Instagram/Pinterest/Facebook/เว็บ) + ลิงก์ฝังเล่นในหน้า (เท่าที่แพลตฟอร์มยอมให้ฝัง)
 *   TikTok/Pinterest ใช้ตัวแยกลิงก์กลาง lib/social-embed (ตัวเดียวกับกระดาน) · ลิงก์สั้น (vt.tiktok / pin.it) ฝังไม่ได้จนกว่าจะเปิดดูต้นทาง
 */
import { parseSocialLink, socialEmbedSrc } from "@/lib/social-embed";

export type RefKind = "image" | "link" | "text";
export type RefProvider = "tiktok" | "youtube" | "instagram" | "pinterest" | "facebook" | "web";

/** ชื่อแหล่งที่มา · โลโก้ใช้ PlatformIcon กลาง (code ตรงกับรหัสแพลตฟอร์ม) · web = ไอคอนเว็บ */
export const REF_PROVIDER_META: Record<RefProvider, { label: string }> = {
  tiktok: { label: "TikTok" }, youtube: { label: "YouTube" }, instagram: { label: "Instagram" },
  pinterest: { label: "Pinterest" }, facebook: { label: "Facebook" }, web: { label: "Web" },
};

/** ลิงก์ http/https ที่ใช้ได้ (ตัดช่องว่าง) · ไม่ใช่ = null */
export function cleanRefUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().replace(/\s+/g, "");
  try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}

export function refProvider(url: string): RefProvider {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\.|^m\./, ""); } catch { return "web"; }
  if (host.endsWith("tiktok.com")) return "tiktok";
  if (host === "youtu.be" || host.endsWith("youtube.com")) return "youtube";
  if (host.endsWith("instagram.com")) return "instagram";
  if (host === "pin.it" || /(^|\.)pinterest\.[a-z.]+$/.test(host)) return "pinterest";
  if (host.endsWith("facebook.com") || host === "fb.watch") return "facebook";
  return "web";
}

/** เลขคลิป YouTube (watch?v= · youtu.be/ · shorts/ · embed/) */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (!host.endsWith("youtube.com")) return null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = /^\/(shorts|embed|live)\/([\w-]{6,})/.exec(u.pathname);
    return m?.[2] ?? null;
  } catch { return null; }
}

/** ลิงก์ฝังเล่นในหน้า (iframe) · ฝังไม่ได้ = null (เปิดลิงก์ต้นทางแทน) */
export function refEmbedUrl(url: string): { src: string; ratio: number } | null {
  const p = refProvider(url);
  if (p === "youtube") { const id = youtubeId(url); return id ? { src: `https://www.youtube-nocookie.com/embed/${id}`, ratio: /\/shorts\//.test(url) ? 9 / 16 : 16 / 9 } : null; }
  if (p === "tiktok" || p === "pinterest") {
    const s = parseSocialLink(url);
    return s?.id ? { src: socialEmbedSrc(s.kind, s.id), ratio: p === "tiktok" ? 9 / 16 : 3 / 4 } : null;
  }
  return null;
}
