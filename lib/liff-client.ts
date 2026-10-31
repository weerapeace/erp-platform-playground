// ============================================================
// ของกลางฝั่งเบราว์เซอร์สำหรับหน้าที่เปิดผ่าน LINE (LIFF) — โหลด SDK + อ่านพารามิเตอร์
// LIFF เดียวกับหน้าอนุมัติเล็ก (channel "ISG ERP Login" · endpoint /a) — ตั้ง env ทับได้
// ============================================================

export type LiffProfile = { userId: string; displayName: string; pictureUrl?: string };
export type LiffSdk = {
  init: (o: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  isInClient?: () => boolean;
  login: (o?: { redirectUri?: string }) => void;
  getIDToken: () => string | null;
  getProfile: () => Promise<LiffProfile>;
  getFriendship?: () => Promise<{ friendFlag: boolean }>;
  closeWindow?: () => void;
};

const LIFF_SCRIPT = "https://static.line-scdn.net/liff/edge/2/sdk.js";

/** LIFF ID เดียวกับ lib/approval-token (APPROVE_LIFF_ID) — ไฟล์นั้นใช้ crypto ฝั่ง server จึง import มาหน้าเว็บไม่ได้ */
export const liffId = () => process.env.NEXT_PUBLIC_LINE_LIFF_ID || process.env.NEXT_PUBLIC_LIFF_ID || "2010621559-NELkN0OU";

export const getLiff = () => (typeof window !== "undefined" ? (window as unknown as { liff?: LiffSdk }).liff : undefined);

export function loadLiff(): Promise<LiffSdk> {
  return new Promise((resolve, reject) => {
    const ready = getLiff();
    if (ready) return resolve(ready);
    const s = document.createElement("script");
    s.src = LIFF_SCRIPT;
    s.async = true;
    s.onload = () => { const lf = getLiff(); if (lf) resolve(lf); else reject(new Error("ไม่พบ LINE LIFF SDK")); };
    s.onerror = () => reject(new Error("โหลด LINE LIFF ไม่สำเร็จ"));
    document.head.appendChild(s);
  });
}

/**
 * เปิด LIFF → คืน id_token (ยังไม่ login ใน LINE = พาไป login แล้วกลับมาหน้าเดิม คืน null)
 * id_token ส่งให้ server ตรวจด้วย verifyLineIdToken เสมอ — ห้ามเชื่อ profile ฝั่งเบราว์เซอร์
 */
export async function initLiffIdToken(): Promise<{ liff: LiffSdk; idToken: string } | null> {
  const lf = await loadLiff();
  await lf.init({ liffId: liffId() });
  if (!lf.isLoggedIn()) { lf.login(); return null; }
  const idToken = lf.getIDToken();
  if (!idToken) throw new Error("อ่านข้อมูล LINE ไม่ได้ — กรุณาเปิดลิงก์นี้ในแอป LINE");
  return { liff: lf, idToken };
}

/** อ่านพารามิเตอร์จาก ?name= หรือจาก liff.state (LINE ห่อ query ไว้ตอนเด้งมาจาก LIFF) · ไม่มี = "" */
export function liffParam(name: string): string {
  try {
    const sp = new URLSearchParams(window.location.search);
    const direct = sp.get(name);
    if (direct) return direct;
    const st = sp.get("liff.state");
    if (st) {
      const q = new URLSearchParams(st.startsWith("?") ? st.slice(1) : st.split("?")[1] ?? "");
      return q.get(name) ?? "";
    }
  } catch {
    // อ่าน URL ไม่ได้ = ไม่มีพารามิเตอร์
  }
  return "";
}
