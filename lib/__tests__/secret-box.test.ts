import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted, hasMasterKey } from "@/lib/secret-box";

beforeAll(() => {
  // กุญแจหลักปลอมสำหรับเทส (32 ไบต์ → base64)
  process.env.PLATFORM_SECRET_KEY = Buffer.from(new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff)).toString("base64");
});

describe("secret-box (เข้ารหัส API Key ก่อนเก็บ)", () => {
  it("เข้ารหัสแล้วถอดกลับได้ค่าเดิม + ค่าที่เก็บไม่มีคีย์จริงโผล่", async () => {
    const secret = "line-shopping-api-key-ABC123xyz";
    const enc = await encryptSecret(secret);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain(secret);
    expect(await decryptSecret(enc)).toBe(secret);
  });

  it("iv สุ่มทุกครั้ง → เข้ารหัสค่าเดิมได้ผลต่างกัน แต่ถอดได้ค่าเดิม", async () => {
    const a = await encryptSecret("same");
    const b = await encryptSecret("same");
    expect(a).not.toBe(b);
    expect(await decryptSecret(a)).toBe("same");
    expect(await decryptSecret(b)).toBe("same");
  });

  it("ข้อความไม่มี prefix = ยังไม่เข้ารหัส (legacy) → คืนตรง ๆ", async () => {
    expect(await decryptSecret("plain-old-value")).toBe("plain-old-value");
    expect(isEncrypted("plain-old-value")).toBe(false);
    expect(isEncrypted("enc:v1:whatever")).toBe(true);
  });

  it("hasMasterKey อ่านจาก env", () => {
    expect(hasMasterKey()).toBe(true);
  });
});
