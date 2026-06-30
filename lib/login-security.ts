/**
 * Login Security (ของกลาง) — ตัวช่วยฝั่ง server สำหรับ "ประวัติการเข้าสู่ระบบ + เตือนอุปกรณ์ใหม่"
 * ใช้โดย /api/auth/login-event
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

/** แยกชนิดเบราว์เซอร์/ระบบ/อุปกรณ์ จาก User-Agent (แบบเบา ไม่พึ่ง lib) */
export function parseUserAgent(ua: string): { browser: string; os: string; deviceType: string } {
  const u = ua || "";
  let os = "ไม่ทราบ";
  if (/Windows NT/i.test(u)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(u)) os = "iOS";
  else if (/Android/i.test(u)) os = "Android";
  else if (/Mac OS X|Macintosh/i.test(u)) os = "macOS";
  else if (/Linux/i.test(u)) os = "Linux";

  let browser = "ไม่ทราบ";
  if (/Line\//i.test(u)) browser = "LINE";
  else if (/Edg\//i.test(u)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(u)) browser = "Opera";
  else if (/CriOS/i.test(u)) browser = "Chrome";
  else if (/Chrome\//i.test(u)) browser = "Chrome";
  else if (/Firefox\//i.test(u)) browser = "Firefox";
  else if (/Safari\//i.test(u) && /Version\//i.test(u)) browser = "Safari";

  let deviceType = "desktop";
  if (/iPad|Tablet/i.test(u)) deviceType = "tablet";
  else if (/Mobile|iPhone|Android.*Mobile/i.test(u)) deviceType = "mobile";
  return { browser, os, deviceType };
}

/** อ่าน IP + ตำแหน่งคร่าว ๆ จาก header (Vercel ก่อน → Cloudflare → ว่าง) */
export function geoFromHeaders(h: Headers): { ip: string; city: string; region: string; country: string } {
  const dec = (v: string | null) => { if (!v) return ""; try { return decodeURIComponent(v); } catch { return v; } };
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const city = dec(h.get("x-vercel-ip-city")) || dec(h.get("cf-ipcity")) || "";
  const region = dec(h.get("x-vercel-ip-country-region")) || "";
  const country = (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "").toUpperCase();
  return { ip, city, region, country };
}

export function locationLabel(g: { city: string; region: string; country: string }): string {
  const parts = [g.city, g.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "ตำแหน่งไม่ทราบ";
}

export function deviceLabel(deviceType: string, browser: string, os: string): string {
  const kind = deviceType === "mobile" ? "มือถือ" : deviceType === "tablet" ? "แท็บเล็ต" : "คอมพิวเตอร์";
  return `${kind} · ${browser}/${os}`;
}

/**
 * ส่งเตือนเข้า LINE (reuse line_config ของ china-pay) — เงียบถ้ายังไม่ตั้งค่า
 * ส่งไปกลุ่ม "security" ถ้ามี ไม่งั้นใช้กลุ่มหลัก (group_id)
 */
export async function pushSecurityLine(admin: Admin, text: string): Promise<void> {
  try {
    const { data: row } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
    const cfg = (row?.sval ?? {}) as { token?: string; group_id?: string; groups?: Record<string, string> };
    const target = cfg.groups?.security || cfg.group_id || "";
    if (!cfg.token || !target) return;
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ to: target, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
    });
  } catch { /* เงียบ — LINE ล้มไม่กระทบการบันทึก */ }
}
