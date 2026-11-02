// ============================================================
// Social Embed (ของกลาง) — แปลงลิงก์ Pinterest / TikTok → ตัวฝังทางการของแต่ละเว็บ
//
// Pinterest: assets.pinterest.com/ext/embed.html?id=<pin> (โชว์รูป · พินวิดีโอเล่นได้)
// TikTok:    www.tiktok.com/player/v1/<video>          (ตัวเล่นวิดีโอทางการ)
// ลิงก์สั้น (pin.it · vt./vm.tiktok.com · tiktok.com/t/) ยังไม่มีเลขพิน/คลิป → ต้องให้ /api/social-embed ย่อเป็นลิงก์เต็มก่อน
//
// ใช้ที่: กระดาน CanvasSketch (วางลิงก์ → โชว์รูป/วิดีโอ) · API /api/social-embed
// doc: docs/canvas-sketch.md
// ============================================================

export type SocialKind = "pinterest" | "tiktok";
/** id = เลขพิน/เลขคลิป (null = ลิงก์สั้น ยังไม่รู้เลข) · url = ลิงก์มาตรฐานที่เก็บบนกระดาน */
export type SocialLink = { kind: SocialKind; id: string | null; short: boolean; url: string };
/** ผลจาก /api/social-embed — available=false คือพิน/คลิปถูกลบหรือเป็นส่วนตัว */
export type SocialEmbedInfo = { kind: SocialKind; id: string; url: string; width: number; height: number; available: boolean; image: string | null };

// pinterest.com · es./th./www.pinterest.com · pinterest.co.uk · pinterest.com.au ฯลฯ
const PIN_HOST = /^(?:[a-z]{2,3}\.)?pinterest\.[a-z]{2,3}(?:\.[a-z]{2})?$/;
const TIKTOK_HOST = /^(?:[a-z0-9-]+\.)?tiktok\.com$/;
// ลิงก์ที่ไม่มี https:// นำหน้า (เช่น copy มาแค่ pin.it/xxx) → เติมให้เฉพาะโดเมนที่รู้จัก
const BARE_HOST = /^(?:[a-z]{2,3}\.)?(?:pinterest\.[a-z.]+|pin\.it|tiktok\.com|v[tm]\.tiktok\.com)\//i;

/** ข้อความ/ลิงก์ → ลิงก์ Pinterest/TikTok ที่ฝังได้ (ไม่ใช่ = null)
 *  ตัดช่องว่าง/ขึ้นบรรทัดทิ้งก่อน เพราะลิงก์ในกล่องข้อความบนกระดานมักถูกตัดบรรทัด */
export function parseSocialLink(raw: string | null | undefined): SocialLink | null {
  const s = (raw ?? "").replace(/\s+/g, "");
  if (!s) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : BARE_HOST.test(s) ? `https://${s}` : ""); } catch { return null; }
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "pin.it") return parts[0] ? { kind: "pinterest", id: null, short: true, url: `https://pin.it/${parts[0]}` } : null;
  if (PIN_HOST.test(host)) {
    // /pin/<เลข>/ · /pin/<ชื่อ>--<เลข>/
    const m = u.pathname.match(/^\/pin\/(?:[^/]*--)?(\d{6,})(?:\/|$)/);
    return m ? { kind: "pinterest", id: m[1], short: false, url: `https://www.pinterest.com/pin/${m[1]}/` } : null;
  }

  if (TIKTOK_HOST.test(host)) {
    if ((host === "vt.tiktok.com" || host === "vm.tiktok.com") && parts[0]) return { kind: "tiktok", id: null, short: true, url: `https://${host}/${parts[0]}/` };
    if (parts[0] === "t" && parts[1]) return { kind: "tiktok", id: null, short: true, url: `https://www.tiktok.com/t/${parts[1]}/` };
    // /@user/video/<เลข> · /@user/photo/<เลข> · /embed/v2/<เลข> · /player/v1/<เลข> · /v/<เลข>.html
    const m = u.pathname.match(/\/(?:video|photo|embed(?:\/v2)?|player\/v1|v)\/(\d{8,})/);
    if (!m) return null;
    const user = parts[0]?.startsWith("@") ? parts[0] : null;
    return { kind: "tiktok", id: m[1], short: false, url: user ? `https://www.tiktok.com/${user}/video/${m[1]}` : `https://www.tiktok.com/embed/v2/${m[1]}` };
  }
  return null;
}

/** โดเมนที่ยอมให้ลิงก์สั้นเด้งไป (กันลิงก์สั้นพาไปเว็บอื่น) */
export function isSocialHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "pin.it" || PIN_HOST.test(h) || TIKTOK_HOST.test(h);
}

/** ลิงก์ iframe ของตัวฝังทางการ */
export function socialEmbedSrc(kind: SocialKind, id: string): string {
  return kind === "pinterest"
    ? `https://assets.pinterest.com/ext/embed.html?id=${encodeURIComponent(id)}`
    : `https://www.tiktok.com/player/v1/${encodeURIComponent(id)}?music_info=1&description=1`;
}

// ตัวฝังพินกว้าง 345 = ขนาดกลางของ Pinterest · ท้ายการ์ด (ชื่อ/ผู้ปักหมุด) สูง ~97px
// ตัวฝังพินยืดได้แค่กว้าง ~160–600 (เกินนี้ถูกตัด/ไม่โตตาม) และสูงตามรูปเสมอ → ต้องย่อ/ขยายทั้งก้อนเอง (pinterestFit)
const PIN_W = 345, PIN_FOOTER = 97, PIN_MIN_W = 236, PIN_MAX_W = 600;
const validRatio = (ratio?: number | null) => (ratio && ratio > 0.2 && ratio < 5 ? ratio : null);
/** ขนาดกรอบบนกระดาน — ratio = กว้าง/สูง ของรูปพิน (ไม่รู้ = ใช้ขนาดกลาง ๆ แล้วให้ผู้ใช้ยืดเอง) */
export function socialEmbedSize(kind: SocialKind, ratio?: number | null): { width: number; height: number } {
  if (kind === "tiktok") return { width: 325, height: 578 };
  return { width: PIN_W, height: Math.round(PIN_W / (validRatio(ratio) ?? 0.66) + PIN_FOOTER) };
}

/** สัดส่วนรูปพินจากขนาดกรอบที่ API คืน (กว้าง 345 · สูง = รูป + ท้ายการ์ด) */
export function pinRatioFromSize(size: { width: number; height: number }): number | null {
  return validRatio(size.width / Math.max(1, size.height - PIN_FOOTER));
}

/** วางตัวฝังพินในกล่องขนาดใดก็ได้: วาดที่ขนาดที่ตัวฝังรับได้ (กว้าง 236–600 สูงตามรูป) แล้วย่อ/ขยายทั้งก้อนให้พอดี + จัดกลาง
 *  ratio ไม่รู้ = ถือว่ากล่องเป็นสัดส่วนเดียวกับพิน */
export function pinterestFit(boxW: number, boxH: number, ratio?: number | null): { frameW: number; frameH: number; scale: number; left: number; top: number } {
  const w = Math.max(1, boxW), h = Math.max(1, boxH);
  const frameW = Math.round(Math.min(PIN_MAX_W, Math.max(PIN_MIN_W, w)));
  const r = validRatio(ratio);
  const frameH = r ? Math.round(frameW / r + PIN_FOOTER) : Math.round(frameW * h / w);
  const scale = Math.min(w / frameW, h / frameH);
  return { frameW, frameH, scale, left: (w - frameW * scale) / 2, top: (h - frameH * scale) / 2 };
}
