/**
 * 🎬 Video Shot — กติกากลางของคลังช็อต (ศูนย์เรียนรู้ /misc/learn แท็บ Video Shot · ตัวเล่นตัดช่วง components/video-segment)
 *   ช็อต = ลิงก์คลิป (ไม่ดาวน์โหลดไฟล์) + ช่วงเริ่ม/จบ + ป้าย (ขนาดภาพ · การเคลื่อนกล้อง · แท็ก) + อยู่ในชุดช็อตได้ 1 ชุด
 *   ตัดช่วงได้แค่ไหนขึ้นกับแพลตฟอร์ม (SHOT_PLATFORMS.segment):
 *     full = เล่นเฉพาะช่วง หยุด/วนเองได้ (YouTube)
 *     seek = ตัวเล่นที่ฝังสั่งกระโดด/หยุด/วนได้ (ทดสอบจริง 2026-11-28 ผ่าน) แต่ลิงก์ที่เปิดออกไปใส่เวลาไม่ได้ (TikTok)
 *     none = ตั้งเวลาไม่ได้เลย → เล่นทั้งคลิป + ป้ายบอกช่วงที่ควรดู (Pinterest · Instagram)
 * ตาราง erp_video_shots / erp_video_shot_lists · เทสต์ lib/__tests__/video-shot.test.ts · คู่มือ docs/learning-center.md
 */
import { formatTimeText, parseTimeText } from "@/lib/learn";
import { parseSocialLink, socialEmbedSrc } from "@/lib/social-embed";

export type ShotPlatform = "youtube" | "tiktok" | "pinterest" | "instagram";
export type SegmentSupport = "full" | "seek" | "none";

export const SHOT_PLATFORMS: Record<ShotPlatform, { label: string; segment: SegmentSupport; note: string }> = {
  youtube: { label: "YouTube", segment: "full", note: "เล่นเฉพาะช่วงที่ตัด แล้วหยุด/วนเอง · กดเปิดลิงก์ = เริ่มตรงเวลา (YouTube ไม่หยุดให้ตอนจบ)" },
  tiktok: { label: "TikTok", segment: "seek", note: "เล่นในหน้า = เฉพาะช่วงที่ตัด หยุด/วนเองได้ · กดเปิดในแอป TikTok = ใส่เวลาไม่ได้ (เริ่มต้นคลิป)" },
  pinterest: { label: "Pinterest", segment: "none", note: "Pinterest ตั้งเวลาเริ่ม/จบไม่ได้ — เล่นทั้งคลิป แล้วดูช่วงตามป้าย" },
  instagram: { label: "Instagram", segment: "none", note: "Instagram ตั้งเวลาเริ่ม/จบไม่ได้ — เล่นทั้งคลิป แล้วดูช่วงตามป้าย" },
};

export const SEGMENT_LABEL: Record<SegmentSupport, string> = { full: "ตัดช่วงได้ครบ", seek: "ตัดช่วงได้ (เล่นในหน้า)", none: "ตัดช่วงไม่ได้ (ดูตามป้าย)" };

/** ขนาดภาพ (เก็บ key · โชว์ label) */
export const SHOT_SIZES = [
  { key: "xwide", label: "กว้างมาก", en: "Extreme wide" },
  { key: "wide", label: "กว้าง", en: "Wide" },
  { key: "medium", label: "กลาง", en: "Medium" },
  { key: "close", label: "ใกล้", en: "Close-up" },
  { key: "macro", label: "ใกล้มาก", en: "Macro / detail" },
] as const;

/** การเคลื่อนกล้อง */
export const CAMERA_MOVES = [
  { key: "static", label: "นิ่ง", en: "Static" },
  { key: "pan", label: "แพน (หมุนซ้าย-ขวา)", en: "Pan" },
  { key: "tilt", label: "ทิลต์ (ก้ม-เงย)", en: "Tilt" },
  { key: "dolly", label: "ดอลลี่ (เข้า-ออก)", en: "Dolly" },
  { key: "slide", label: "สไลด์ข้าง", en: "Truck / slide" },
  { key: "orbit", label: "โคจรรอบสินค้า", en: "Orbit" },
  { key: "zoom", label: "ซูม", en: "Zoom" },
  { key: "handheld", label: "ถือมือ", en: "Handheld" },
  { key: "topdown", label: "มุมบนลงล่าง", en: "Top-down" },
] as const;

export const sizeLabel = (k: string | null | undefined) => SHOT_SIZES.find((s) => s.key === k)?.label ?? null;
export const moveLabel = (k: string | null | undefined) => CAMERA_MOVES.find((s) => s.key === k)?.label ?? null;

export type ShotLink = {
  platform: ShotPlatform;
  /** เลขคลิป · null = ลิงก์สั้น (pin.it / vt.tiktok.com) ต้องให้เซิร์ฟเวอร์ย่อก่อน */
  id: string | null;
  short: boolean;
  /** ลิงก์ที่จัดรูปแล้ว (เก็บลงฐานข้อมูล) */
  url: string;
  /** เวลาเริ่มที่ติดมากับลิงก์ (YouTube ?t=) */
  startHint: number | null;
};

const YT_HOST = /(^|\.)youtube\.com$/;

/** ลิงก์ที่ copy มา → แพลตฟอร์ม + เลขคลิป (ไม่รองรับ = null) */
export function parseShotLink(raw: string | null | undefined): ShotLink | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let u: URL | null = null;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { u = null; }
  if (u && !u.username && !u.password) {
    const host = u.hostname.replace(/^(www|m|music)\./, "").toLowerCase();
    let yt: string | null = null;
    if (host === "youtu.be") yt = u.pathname.slice(1).split("/")[0] || null;
    else if (YT_HOST.test(host)) yt = u.searchParams.get("v") || u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1] || null;
    if (yt && /^[\w-]{6,20}$/.test(yt)) {
      const startHint = parseTimeText(u.searchParams.get("t") ?? u.searchParams.get("start"));
      return { platform: "youtube", id: yt, short: false, url: `https://www.youtube.com/watch?v=${yt}`, startHint: startHint && startHint > 0 ? startHint : null };
    }
  }
  const so = parseSocialLink(s);
  if (!so) return null;
  return { platform: so.kind, id: so.id, short: so.short, url: so.url, startHint: null };
}

/** ภาพปก YouTube คำนวณจากเลขคลิปได้เลย (ไม่ต้องเก็บ) */
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/** ลิงก์ "เปิดลิงก์ช่วงนี้" — YouTube เริ่มตรงเวลา · แพลตฟอร์มอื่นใส่เวลาไม่ได้ = ลิงก์เดิม */
export function shotWatchUrl(platform: ShotPlatform, url: string, id: string | null, start: number | null): string {
  if (platform === "youtube" && id) return `https://www.youtube.com/watch?v=${id}${start && start > 0 ? `&t=${Math.floor(start)}s` : ""}`;
  return url;
}

/** ลิงก์ iframe ของตัวเล่น (YouTube เปิด JS API ไว้คุมการวน · TikTok player v1 คุมด้วยข้อความได้) */
export function shotEmbedSrc(platform: ShotPlatform, id: string, opt: { start?: number | null; end?: number | null; autoplay?: boolean; origin?: string } = {}): string {
  const st = opt.start && opt.start > 0 ? Math.floor(opt.start) : null;
  const en = opt.end && opt.end > 0 ? Math.ceil(opt.end) : null;
  if (platform === "youtube") {
    const q = new URLSearchParams({ enablejsapi: "1", playsinline: "1", rel: "0", modestbranding: "1" });
    if (st) q.set("start", String(st));
    if (en) q.set("end", String(en));
    if (opt.autoplay) q.set("autoplay", "1");
    if (opt.origin) q.set("origin", opt.origin);
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${q.toString()}`;
  }
  if (platform === "tiktok") {
    const q = new URLSearchParams({ rel: "0", music_info: "1", description: "1", autoplay: opt.autoplay ? "1" : "0", loop: "0" });
    return `https://www.tiktok.com/player/v1/${encodeURIComponent(id)}?${q.toString()}`;
  }
  return socialEmbedSrc(platform, id);
}

/** "0:03–0:07" · มีแค่เริ่ม = "ตั้งแต่ 0:03" · ไม่มีเลย = "" */
export function rangeText(start: number | null | undefined, end: number | null | undefined): string {
  const a = start !== null && start !== undefined && start >= 0 ? formatTimeText(start) : "";
  const b = end !== null && end !== undefined && end > 0 ? formatTimeText(end) : "";
  if (a && b) return `${a}–${b}`;
  if (b) return `0:00–${b}`;
  if (a && start) return `ตั้งแต่ ${a}`;
  return "";
}

export type VideoShot = {
  id: string;
  list_id: string | null;
  title: string;
  url: string;
  platform: ShotPlatform;
  video_id: string | null;
  start_sec: number | null;
  end_sec: number | null;
  shot_size: string | null;
  camera_move: string | null;
  tags: string[];
  note: string | null;
  thumb_url: string | null;
  sort_order: number;
  is_active: boolean;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoShotList = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export const SHOT_COLS = "id, list_id, title, url, platform, video_id, start_sec, end_sec, shot_size, camera_move, tags, note, thumb_url, sort_order, is_active, deleted_at, created_by, updated_by, created_at, updated_at";
export const SHOT_LIST_COLS = "id, name, description, sort_order, is_active, deleted_at, created_by, updated_by, created_at, updated_at";

/** แท็ก: array หรือข้อความคั่นด้วย , / ขึ้นบรรทัด → ตัดว่าง/ซ้ำ · ≤20 แท็ก */
export function cleanTags(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n#]/) : [];
  const out: string[] = [];
  for (const x of arr) {
    const t = String(x ?? "").trim().slice(0, 40);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

const str = (v: unknown, max: number): string | null => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };
const UUID = /^[0-9a-f-]{36}$/i;

type ShotPatch = Partial<Pick<VideoShot, "list_id" | "title" | "url" | "platform" | "video_id" | "start_sec" | "end_sec" | "shot_size" | "camera_move" | "tags" | "note" | "thumb_url" | "sort_order" | "is_active">>;

/** ตรวจข้อมูลช็อตที่ส่งมา (partial = แก้บางช่อง) · ลิงก์สั้นต้องย่อก่อนเรียก (resolved) */
export function cleanShotBody(body: Record<string, unknown>, partial: boolean, before?: Pick<VideoShot, "start_sec" | "end_sec"> | null): { ok: true; patch: ShotPatch } | { ok: false; error: string } {
  const p: ShotPatch = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (!partial || has("url")) {
    const link = parseShotLink(String(body.url ?? ""));
    if (!link) return { ok: false, error: "ลิงก์นี้ยังไม่รองรับ — ใช้ลิงก์ YouTube / TikTok / Pinterest / Instagram" };
    if (!link.id) return { ok: false, error: "ลิงก์สั้นนี้เปิดไม่ได้ ลองเปิดในแอปแล้ว copy ลิงก์เต็มมาวาง" };
    p.url = link.url; p.platform = link.platform; p.video_id = link.id;
  }
  if (!partial || has("title")) {
    const t = str(body.title, 200);
    if (!t) return { ok: false, error: "ต้องใส่ชื่อช็อต" };
    p.title = t;
  }
  for (const k of ["start_sec", "end_sec"] as const) {
    if (!partial || has(k)) {
      const raw = body[k];
      const v = raw === null || raw === undefined || raw === "" ? null : parseTimeText(raw);
      if (raw !== null && raw !== undefined && raw !== "" && v === null) return { ok: false, error: `${k === "start_sec" ? "เวลาเริ่ม" : "เวลาจบ"}ต้องเป็นแบบ 1:20 หรือ 80` };
      p[k] = v;
    }
  }
  const st = p.start_sec !== undefined ? p.start_sec : before?.start_sec ?? null;
  const en = p.end_sec !== undefined ? p.end_sec : before?.end_sec ?? null;
  if (st !== null && en !== null && en <= st) return { ok: false, error: "เวลาจบต้องมากกว่าเวลาเริ่ม" };

  if (has("shot_size")) { const v = str(body.shot_size, 20); p.shot_size = v && SHOT_SIZES.some((s) => s.key === v) ? v : null; }
  if (has("camera_move")) { const v = str(body.camera_move, 20); p.camera_move = v && CAMERA_MOVES.some((s) => s.key === v) ? v : null; }
  if (has("tags")) p.tags = cleanTags(body.tags);
  if (has("note")) p.note = str(body.note, 4000);
  if (has("thumb_url")) { const v = str(body.thumb_url, 1000); p.thumb_url = v && /^https:\/\//i.test(v) ? v : null; }
  if (has("list_id")) { const v = str(body.list_id, 40); p.list_id = v && UUID.test(v) ? v : null; }
  if (has("sort_order")) { const n = Number(body.sort_order); if (Number.isFinite(n)) p.sort_order = Math.floor(n); }
  if (has("is_active")) p.is_active = body.is_active === true;
  if (!partial) { p.tags = p.tags ?? []; }
  return { ok: true, patch: p };
}

export function cleanShotListBody(body: Record<string, unknown>, partial: boolean): { ok: true; patch: Partial<Pick<VideoShotList, "name" | "description" | "sort_order" | "is_active">> } | { ok: false; error: string } {
  const p: Partial<Pick<VideoShotList, "name" | "description" | "sort_order" | "is_active">> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  if (!partial || has("name")) { const n = str(body.name, 120); if (!n) return { ok: false, error: "ต้องตั้งชื่อชุดช็อต" }; p.name = n; }
  if (has("description")) p.description = str(body.description, 2000);
  if (has("sort_order")) { const n = Number(body.sort_order); if (Number.isFinite(n)) p.sort_order = Math.floor(n); }
  if (has("is_active")) p.is_active = body.is_active === true;
  return { ok: true, patch: p };
}

/** ค้นช็อต: ชื่อ · โน้ต · แท็ก · ป้าย · แพลตฟอร์ม */
export function shotMatches(s: VideoShot, q: string): boolean {
  const k = q.trim().toLowerCase();
  if (!k) return true;
  const hay = [s.title, s.note ?? "", s.tags.join(" "), sizeLabel(s.shot_size) ?? "", moveLabel(s.camera_move) ?? "", SHOT_PLATFORMS[s.platform]?.label ?? ""].join(" ").toLowerCase();
  return k.split(/\s+/).every((w) => hay.includes(w));
}

/** ลำดับใหม่หลังเลื่อนช็อตขึ้น/ลง (คืน id เรียงใหม่ · เลื่อนไม่ได้ = null) */
export function moveInOrder(ids: string[], id: string, dir: -1 | 1): string[] | null {
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const out = [...ids]; [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** ข้อความสรุปช็อตสำหรับ audit */
export function shotDigest(s: Pick<VideoShot, "title" | "platform" | "start_sec" | "end_sec">): string {
  return `${s.title} [${SHOT_PLATFORMS[s.platform]?.label ?? s.platform} ${rangeText(s.start_sec, s.end_sec) || "ทั้งคลิป"}]`;
}
