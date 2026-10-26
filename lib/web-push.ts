/**
 * 📲 ตัวส่ง Web Push (ของกลาง · ฝั่งเซิร์ฟเวอร์เท่านั้น) — ส่งแจ้งเตือนเด้งเข้ามือถือ/คอมผ่านบริการ push ของเบราว์เซอร์
 *
 * เขียนเองตามมาตรฐาน ไม่ต้องลงไลบรารีเพิ่ม (ใช้ node:crypto ล้วน):
 * - RFC 8291 + RFC 8188 (aes128gcm) — เข้ารหัสข้อความให้เปิดอ่านได้เฉพาะเครื่องปลายทาง
 * - RFC 8292 (VAPID) — ลายเซ็นยืนยันว่าเป็นเซิร์ฟเวอร์ของเรา (กุญแจคู่ P-256)
 * ทดสอบกับค่าตัวอย่างใน RFC 8291 ภาคผนวก A (lib/__tests__/web-push.test.ts)
 *
 * ปลายทางต้องเป็นบริการ push จริงเท่านั้น (isAllowedPushEndpoint) — กันคนแอบใส่ URL ภายในให้เซิร์ฟเวอร์เรายิงไปหา
 */
import crypto from "node:crypto";

export type PushSubscriptionKeys = { p256dh: string; auth: string };
export type PushTarget = { endpoint: string; keys: PushSubscriptionKeys };
/** กุญแจ VAPID: publicKey = จุด P-256 แบบไม่บีบ 65 ไบต์ (base64url) · privateKey = ค่า d 32 ไบต์ (base64url) */
export type VapidKeys = { publicKey: string; privateKey: string };

// ---- base64url ----
export function b64urlEncode(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// ---- บริการ push ที่ยอมให้ส่ง (Chrome/Android · Safari/iPhone · Firefox · Edge) ----
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch { return false; }
}

// ---- กุญแจ VAPID ----
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const priv = privateKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([0x04]), b64urlDecode(String(pub.x)), b64urlDecode(String(pub.y))]);
  return { publicKey: b64urlEncode(raw), privateKey: String(priv.d) };
}

function vapidPrivateKeyObject(keys: VapidKeys): crypto.KeyObject {
  const raw = b64urlDecode(keys.publicKey);
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error("VAPID public key ไม่ถูกต้อง");
  return crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64urlEncode(raw.subarray(1, 33)), y: b64urlEncode(raw.subarray(33, 65)) },
    format: "jwk",
  });
}

/** หัว Authorization แบบ VAPID (RFC 8292) — aud = ต้นทางของปลายทาง push · อายุ 12 ชม. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64urlEncode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: subject })));
  const unsigned = `${header}.${claims}`;
  const sig = crypto.sign("sha256", Buffer.from(unsigned), { key: vapidPrivateKeyObject(keys), dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${keys.publicKey}`;
}

// ---- เข้ารหัสข้อความ (RFC 8291 · aes128gcm ก้อนเดียว) ----
const RECORD_SIZE = 4096;

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, len: number): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));
}

/** ตัวเลือกสำหรับเทสต์เท่านั้น (ใส่ salt/กุญแจชั่วคราวตายตัวให้ผลตรงค่าตัวอย่าง RFC) */
export type EncryptOptions = { salt?: Buffer; localPrivateKey?: Buffer };

export function encryptPayload(keys: PushSubscriptionKeys, plaintext: Buffer, opts: EncryptOptions = {}): Buffer {
  const uaPublic = b64urlDecode(keys.p256dh);
  const authSecret = b64urlDecode(keys.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("กุญแจของเครื่องปลายทางไม่ถูกต้อง");
  if (plaintext.length > RECORD_SIZE - 16 - 1 - 86) throw new Error("ข้อความยาวเกินที่ส่งได้");

  const ecdh = crypto.createECDH("prime256v1");
  if (opts.localPrivateKey) ecdh.setPrivateKey(opts.localPrivateKey); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ?? crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  // 0x02 = ตัวคั่นท้าย "record สุดท้าย" (ไม่เติม padding เพิ่ม)
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([0x02])])), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4); rs.writeUInt32BE(RECORD_SIZE);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** ถอดรหัส (ใช้ในเทสต์ — เลียนแบบเครื่องปลายทาง) */
export function decryptPayload(uaPrivateKey: Buffer, keys: PushSubscriptionKeys, data: Buffer): Buffer {
  const salt = data.subarray(0, 16);
  const idLen = data[20];
  const asPublic = data.subarray(21, 21 + idLen);
  const ct = data.subarray(21 + idLen);
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivateKey);
  const ecdhSecret = ecdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), b64urlDecode(keys.p256dh), asPublic]);
  const ikm = hkdf(b64urlDecode(keys.auth), ecdhSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  const out = Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]);
  const end = out.lastIndexOf(0x02);
  return out.subarray(0, end < 0 ? out.length : end);
}

// ---- ส่งจริง ----
export type SendResult = {
  ok: boolean;
  status: number;
  /** true = เครื่องนี้ยกเลิกรับแล้ว/หมดอายุ (404/410) → ควรลบออกจากระบบ */
  gone: boolean;
  error?: string;
};

export async function sendWebPush(
  target: PushTarget,
  payload: unknown,
  vapid: VapidKeys,
  subject: string,
  opts: { ttlSec?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string } = {},
): Promise<SendResult> {
  if (!isAllowedPushEndpoint(target.endpoint)) return { ok: false, status: 0, gone: true, error: "ปลายทางไม่ใช่บริการ push ที่รู้จัก" };
  let body: Buffer;
  try { body = encryptPayload(target.keys, Buffer.from(JSON.stringify(payload))); }
  catch (e) { return { ok: false, status: 0, gone: false, error: e instanceof Error ? e.message : String(e) }; }

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    TTL: String(opts.ttlSec ?? 24 * 3600),
    Urgency: opts.urgency ?? "normal",
    Authorization: vapidAuthorization(target.endpoint, vapid, subject),
  };
  // Topic: ข้อความหัวเรื่องเดียวกันที่ยังไม่ถึงเครื่องจะถูกแทนที่ (ตัวอักษร base64url ≤ 32)
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);

  try {
    const res = await fetch(target.endpoint, { method: "POST", headers, body: new Uint8Array(body), signal: AbortSignal.timeout(10_000) });
    if (res.ok) return { ok: true, status: res.status, gone: false };
    const text = (await res.text().catch(() => "")).slice(0, 300);
    return { ok: false, status: res.status, gone: res.status === 404 || res.status === 410, error: text || res.statusText };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: e instanceof Error ? e.message : String(e) };
  }
}
