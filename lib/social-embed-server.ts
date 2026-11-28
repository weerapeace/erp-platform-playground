/**
 * Social Embed — ตัวช่วยฝั่งเซิร์ฟเวอร์ (ของกลาง · ใช้ใน /api/social-embed และ /api/learn/shots)
 *   expandShortSocial: ลิงก์สั้น pin.it / vt.tiktok.com → ลิงก์เต็ม (ยอมเด้งเฉพาะโดเมน Pinterest/TikTok/Instagram · HEAD ไม่อ่าน body)
 *   pinterestInfo: ข้อมูลพินจาก widget API สาธารณะ (รูป · สัดส่วน · คำอธิบาย · พินลบ = available false)
 */
import { isSocialHost, parseSocialLink, type SocialLink } from "@/lib/social-embed";

export const SOCIAL_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** ลิงก์สั้น → ลิงก์เต็ม (ตามการเด้งทีละขั้น สูงสุด 6 ครั้ง · ออกนอก Pinterest/TikTok = หยุด) */
export async function expandShortSocial(url: string, signal: AbortSignal): Promise<SocialLink | null> {
  let cur = url;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(cur, { method: "HEAD", redirect: "manual", signal, headers: { "User-Agent": SOCIAL_UA } });
    const loc = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !loc) break;
    const next = new URL(loc, cur);
    if (next.protocol !== "https:" || !isSocialHost(next.hostname)) return null;
    cur = next.toString();
    const l = parseSocialLink(cur);
    if (l?.id) return l;
  }
  return null;
}

export async function pinterestInfo(id: string, signal: AbortSignal): Promise<{ available: boolean; ratio: number | null; image: string | null; title: string | null }> {
  const res = await fetch(`https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${encodeURIComponent(id)}`, { signal, headers: { "User-Agent": SOCIAL_UA, Accept: "application/json" } });
  if (!res.ok) return { available: true, ratio: null, image: null, title: null }; // ถามไม่ได้ = ไม่รู้ → ลองฝังไปก่อน
  const j = await res.json() as { data?: Array<{ description?: string; title?: string; images?: Record<string, { width: number; height: number; url: string }> } | null> };
  const pin = j.data?.[0];
  const img = pin?.images?.["564x"] ?? pin?.images?.["237x"] ?? pin?.images?.["236x"];
  if (!img) return { available: false, ratio: null, image: null, title: null };
  const title = (pin?.title || pin?.description || "").trim() || null;
  return { available: true, ratio: img.height > 0 ? img.width / img.height : null, image: img.url, title };
}
