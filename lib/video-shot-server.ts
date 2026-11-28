/**
 * 🎬 Video Shot — ตัวช่วยฝั่งเซิร์ฟเวอร์ (ใช้ใน /api/learn/shots/*)
 *   resolveShotLink: ลิงก์สั้น → ลิงก์เต็ม · fetchShotMeta: ชื่อคลิป + ภาพปก (YouTube/TikTok oEmbed · Pinterest widget API)
 *   ไม่ดาวน์โหลดไฟล์วิดีโอ — อ่านแค่ข้อมูลหน้าปก
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { expandShortSocial, pinterestInfo, SOCIAL_UA } from "@/lib/social-embed-server";
import { parseShotLink, SHOT_COLS, SHOT_LIST_COLS, youtubeThumb, type ShotLink, type VideoShot, type VideoShotList } from "@/lib/video-shot";

export function rowToShot(r: Record<string, unknown>): VideoShot {
  return { ...(r as unknown as VideoShot), tags: Array.isArray(r.tags) ? (r.tags as string[]) : [] };
}

export async function loadShot(id: string): Promise<VideoShot | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabaseAdmin().from("erp_video_shots").select(SHOT_COLS).eq("id", id).maybeSingle();
  return data ? rowToShot(data as unknown as Record<string, unknown>) : null;
}

export async function loadShotList(id: string): Promise<VideoShotList | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabaseAdmin().from("erp_video_shot_lists").select(SHOT_LIST_COLS).eq("id", id).maybeSingle();
  return (data as unknown as VideoShotList) ?? null;
}

/** ลิงก์ที่วางมา → ลิงก์เต็มที่มีเลขคลิป (ลิงก์สั้นตามไปหาให้) · อ่านไม่ออก = null */
export async function resolveShotLink(raw: string): Promise<ShotLink | null> {
  const link = parseShotLink(raw);
  if (!link || link.id) return link;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const full = await expandShortSocial(link.url, ctrl.signal);
    return full?.id ? { platform: full.kind, id: full.id, short: false, url: full.url, startHint: null } : link;
  } catch { return link; } finally { clearTimeout(timer); }
}

export type ShotMeta = { title: string | null; thumb_url: string | null };

async function oembed(endpoint: string, url: string, signal: AbortSignal): Promise<{ title?: string; thumbnail_url?: string } | null> {
  const res = await fetch(`${endpoint}?format=json&url=${encodeURIComponent(url)}`, { signal, headers: { "User-Agent": SOCIAL_UA, Accept: "application/json" } });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as { title?: string; thumbnail_url?: string } | null;
}

/** ชื่อคลิป + ภาพปก (ดึงไม่ได้ = null · ไม่ทำให้บันทึกพัง) */
export async function fetchShotMeta(link: ShotLink): Promise<ShotMeta> {
  if (!link.id) return { title: null, thumb_url: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    if (link.platform === "youtube") {
      const j = await oembed("https://www.youtube.com/oembed", link.url, ctrl.signal).catch(() => null);
      return { title: j?.title?.trim() || null, thumb_url: youtubeThumb(link.id) };
    }
    if (link.platform === "tiktok") {
      const j = await oembed("https://www.tiktok.com/oembed", link.url, ctrl.signal).catch(() => null);
      return { title: j?.title?.trim().slice(0, 200) || null, thumb_url: j?.thumbnail_url && /^https:\/\//.test(j.thumbnail_url) ? j.thumbnail_url : null };
    }
    if (link.platform === "pinterest") {
      const p = await pinterestInfo(link.id, ctrl.signal).catch(() => null);
      return { title: p?.title?.slice(0, 200) ?? null, thumb_url: p?.image ?? null };
    }
    return { title: null, thumb_url: null };
  } finally { clearTimeout(timer); }
}
