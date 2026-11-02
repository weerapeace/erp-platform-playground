// ============================================================
// กติกากลางของตัวยิงโพสต์ (ไม่มี I/O — ทดสอบได้ · lib/__tests__/social-publish-rules.test.ts)
//  - normalizeMedia: เลือกสื่อตามรูปแบบโพสต์ (ใช้ทั้งตอนตั้งคิว [ตรวจก่อน] และตอนยิง)
//  - friendlyMetaError: แปล error ของ Meta เป็นภาษาคน
// ============================================================
import type { PostMedia } from "./media";
import { sanitizeFit } from "./fit";

const label = (platform: string) => (platform === "instagram" ? "Instagram" : "Facebook");

/** จัดสื่อตามรูปแบบที่เลือก (story/single/carousel/video/reels · ว่าง = เดาจากสื่อ) — ใช้ตรวจตอนตั้งคิวด้วย (บอกผู้ใช้ทันที ไม่ต้องรอพังตอนถึงเวลา) */
export function normalizeMedia(format: string, input: PostMedia[]): { media: PostMedia[] } | { error: string } {
  // คงค่าปรับขอบ (fit) ของรูปไว้ — ตรวจความถูกต้องก่อน (วิดีโอไม่มี fit)
  let media: PostMedia[] = input.filter((m) => m?.key).map((m) => {
    const type = m.type === "video" ? "video" : "image";
    const fit = type === "image" ? sanitizeFit(m.fit) : null;
    const fallback = type === "image" && typeof m.fallback === "string" && /^[a-zA-Z0-9._/-]+$/.test(m.fallback) ? m.fallback : null;
    return { key: m.key, type, ...(fit ? { fit } : {}), ...(fallback ? { fallback } : {}) };
  });
  if (format === "story" && media.length === 0) return { error: "Story นี้ยังไม่มีไฟล์ (รูปหรือวิดีโอ) — ใส่ไฟล์ก่อนแล้วค่อยโพสต์" };
  if (format === "story") media = media.slice(0, 1);   // Story = 1 ชิ้นต่อครั้ง
  if (format === "single") media = media.filter((m) => m.type !== "video").slice(0, 1);
  if (format === "carousel") media = media.filter((m) => m.type !== "video");
  if (format === "video" || format === "reels") {
    const v = media.find((m) => m.type === "video");
    if (!v) return { error: "เลือกรูปแบบเป็นวิดีโอ/Reels แต่ยังไม่ได้เลือกไฟล์วิดีโอ — เลือกวิดีโอในช่อง “รูปสำหรับแพลตฟอร์มนี้” ก่อน" };
    media = [v];
  }
  if (media.length === 0) return { error: "ยังไม่ได้เลือกรูป/วิดีโอสำหรับโพสต์นี้" };
  return { media };
}

/** แปล error ของ Meta ที่เจอบ่อยเป็นภาษาคน (เจ้าของอ่านแล้วรู้ว่าต้องทำอะไร) · code/subcode = รหัสจาก Graph API (ถ้ามี) */
export function friendlyMetaError(platform: string, raw: string, code?: number, subcode?: number): string {
  const m = raw || "ไม่ทราบสาเหตุ";
  // บัญชี Facebook ของคนที่กดเชื่อมเพจ ติดด่านตรวจสอบความปลอดภัย (190 / 459·464·490) — ต้องไปเคลียร์ที่ facebook.com เอง ระบบทำแทนไม่ได้
  if ((code === 190 && subcode != null && [459, 464, 490].includes(subcode)) || /cannot access the app till you log in|checkpoint/i.test(m))
    return `${label(platform)}: บัญชี Facebook ที่ใช้กดเชื่อมเพจ ติดด่านตรวจสอบของ Facebook — เข้า facebook.com ด้วยบัญชีนั้น ทำตามขั้นตอนที่ Facebook ขึ้นให้ครบ แล้วกลับมากด “เชื่อมใหม่” ที่หน้าบัญชีแพลตฟอร์ม (${m})`;
  if (code === 190)
    return `${label(platform)}: การเชื่อมต่อหมดอายุหรือถูกยกเลิก (เช่น เปลี่ยนรหัสผ่าน หรือถูกถอดจากแอดมินเพจ) — กด “เชื่อมใหม่” ที่หน้าบัญชีแพลตฟอร์ม (${m})`;
  if (/permission|\(#10\)|\(#200\)|OAuthException|access token|session has expired/i.test(m))
    return `${label(platform)}: สิทธิ์ไม่พอหรือการเชื่อมต่อหมดอายุ — ไปกด “เชื่อมต่อใหม่” ที่หน้าบัญชีแพลตฟอร์ม (${m})`;
  if (/aspect ratio/i.test(m)) return `${label(platform)}: สัดส่วนรูปไม่ผ่าน (IG รับ 4:5 ถึง 1.91:1 · Story/Reels = แนวตั้ง 9:16) — ${m}`;
  if (/(rate|request) limit|too many/i.test(m)) return `${label(platform)}: โพสต์ถี่เกินที่แพลตฟอร์มกำหนด — ลองใหม่ภายหลัง (${m})`;
  if (/media|video|image|download|fetch/i.test(m)) return `${label(platform)}: ดึงไฟล์ไม่สำเร็จ — ตรวจชนิด/ขนาดไฟล์ (วิดีโอ MP4/MOV) และการแชร์ไฟล์ Drive (${m})`;
  return `${label(platform)} ปฏิเสธ: ${m}`;
}

