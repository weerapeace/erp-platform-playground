// ============================================================
// กติกากลางของตัวยิงโพสต์ (ไม่มี I/O — ทดสอบได้ · lib/__tests__/social-publish-rules.test.ts)
//  - normalizeMedia: เลือกสื่อตามรูปแบบโพสต์ (ใช้ทั้งตอนตั้งคิว [ตรวจก่อน] และตอนยิง)
//  - friendlyMetaError: แปล error ของ Meta เป็นภาษาคน
// ============================================================
import type { PostMedia } from "./media";

const label = (platform: string) => (platform === "instagram" ? "Instagram" : "Facebook");

/** จัดสื่อตามรูปแบบที่เลือก (story/single/carousel/video/reels · ว่าง = เดาจากสื่อ) — ใช้ตรวจตอนตั้งคิวด้วย (บอกผู้ใช้ทันที ไม่ต้องรอพังตอนถึงเวลา) */
export function normalizeMedia(format: string, input: PostMedia[]): { media: PostMedia[] } | { error: string } {
  let media = input.filter((m) => m?.key).map((m) => ({ key: m.key, type: m.type === "video" ? "video" : "image" }));
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

/** แปล error ของ Meta ที่เจอบ่อยเป็นภาษาคน (เจ้าของอ่านแล้วรู้ว่าต้องทำอะไร) */
export function friendlyMetaError(platform: string, raw: string): string {
  const m = raw || "ไม่ทราบสาเหตุ";
  if (/permission|\(#10\)|\(#200\)|OAuthException|access token|session has expired/i.test(m))
    return `${label(platform)}: สิทธิ์ไม่พอหรือการเชื่อมต่อหมดอายุ — ไปกด “เชื่อมต่อใหม่” ที่หน้าบัญชีแพลตฟอร์ม (${m})`;
  if (/aspect ratio/i.test(m)) return `${label(platform)}: สัดส่วนรูปไม่ผ่าน (IG รับ 4:5 ถึง 1.91:1 · Story/Reels = แนวตั้ง 9:16) — ${m}`;
  if (/(rate|request) limit|too many/i.test(m)) return `${label(platform)}: โพสต์ถี่เกินที่แพลตฟอร์มกำหนด — ลองใหม่ภายหลัง (${m})`;
  if (/media|video|image|download|fetch/i.test(m)) return `${label(platform)}: ดึงไฟล์ไม่สำเร็จ — ตรวจชนิด/ขนาดไฟล์ (วิดีโอ MP4/MOV) และการแชร์ไฟล์ Drive (${m})`;
  return `${label(platform)} ปฏิเสธ: ${m}`;
}

