import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  b64urlDecode, b64urlEncode, decryptPayload, encryptPayload, generateVapidKeys,
  isAllowedPushEndpoint, vapidAuthorization,
} from "@/lib/web-push";

// ค่าตัวอย่างจาก RFC 8291 ภาคผนวก A
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("web-push encryption (RFC 8291)", () => {
  it("ได้ผลตรงค่าตัวอย่างใน RFC", () => {
    const out = encryptPayload(
      { p256dh: RFC.uaPublic, auth: RFC.auth },
      Buffer.from(RFC.plaintext),
      { salt: b64urlDecode(RFC.salt), localPrivateKey: b64urlDecode(RFC.asPrivate) },
    );
    expect(b64urlEncode(out)).toBe(RFC.body);
  });

  it("เครื่องปลายทางถอดรหัสกลับได้ (กุญแจสุ่ม)", () => {
    const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
    const keys = { p256dh: b64urlEncode(ua.getPublicKey()), auth: b64urlEncode(crypto.randomBytes(16)) };
    const msg = JSON.stringify({ title: "ทดสอบ 🔔", body: "งานใหม่รอตรวจ" });
    const enc = encryptPayload(keys, Buffer.from(msg));
    expect(decryptPayload(ua.getPrivateKey(), keys, enc).toString()).toBe(msg);
  });

  it("ปฏิเสธกุญแจเครื่องปลายทางที่ผิดรูป", () => {
    expect(() => encryptPayload({ p256dh: "abc", auth: RFC.auth }, Buffer.from("x"))).toThrow();
  });
});

describe("VAPID", () => {
  it("ลายเซ็นตรวจสอบได้ด้วยกุญแจสาธารณะ + claims ถูก", () => {
    const keys = generateVapidKeys();
    expect(b64urlDecode(keys.publicKey).length).toBe(65);
    const h = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, "https://erp.example.com", 1_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
    expect(m).not.toBeNull();
    const [, head, claims, sig, k] = m!;
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(b64urlDecode(claims).toString())).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_000_000 + 12 * 3600, sub: "https://erp.example.com" });
    const raw = b64urlDecode(keys.publicKey);
    const pub = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64urlEncode(raw.subarray(1, 33)), y: b64urlEncode(raw.subarray(33)) }, format: "jwk" });
    expect(crypto.verify("sha256", Buffer.from(`${head}.${claims}`), { key: pub, dsaEncoding: "ieee-p1363" }, b64urlDecode(sig))).toBe(true);
  });
});

describe("isAllowedPushEndpoint", () => {
  it("รับเฉพาะบริการ push จริงแบบ https", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evil.example.com/push.apple.com")).toBe(false);
    expect(isAllowedPushEndpoint("https://localhost/x")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
  });
});
