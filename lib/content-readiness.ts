/**
 * ความพร้อมโพสต์ต่อแพลตฟอร์ม (ของกลาง · pure ไม่มี "use client" → ใช้ได้ทั้งหน้าจอและ API/test)
 *
 * ใช้ที่: ปฏิทินคอนเทนต์ (การ์ดลอย quick view · วงสีไอคอนแพลตฟอร์ม · ตัวกรอง ⚠ ยังไม่พร้อม)
 *
 * กติกา:
 *   - โพสต์แล้ว / ตั้งเวลาแล้ว / ข้าม → ตามสถานะโพสต์ (post_status) ไม่ต้องดูอย่างอื่น
 *   - แคปชั่น: ต้องมีข้อความ — ยกเว้น (ก) แพลตฟอร์มที่ตั้ง "ไม่ใช้แคปชั่น" (⚙️ ตั้งค่าแพลตฟอร์ม use_caption=false
 *     เช่น Shopee/Lazada ที่ลงแค่รูปตกแต่งร้าน) · (ข) แพลตฟอร์มที่ลงเป็น Story (platform_formats = "story") → มีรูปก็พร้อมโพสต์
 *   - รูป: รูปที่เลือกไว้ต่อแพลตฟอร์ม · ถ้ายังไม่เลือก = รูปแนบของโพสต์ (กติกาเดียวกับรูปที่ระบบเลือกให้ตอนกดโพสต์จริง)
 *     รูปที่อยู่แค่ในงานที่ผูกไว้ "ไม่นับ" จนกว่าจะเลือกมาใส่โพสต์ (เจ้าของเลือก 2026-10-16)
 */

export type ReadyState = "posted" | "scheduled" | "skip" | "ready" | "missing";
export type ReadyMissing = "caption" | "image";
export type PlatReady = {
  code: string;
  state: ReadyState;
  missing: ReadyMissing[];
  images: string[];        // รูปที่จะลง (ตัวอย่าง ≤4)
  captionOff: boolean;     // ไม่ต้องมีแคปชั่น (ตั้ง "ไม่ใช้แคปชั่น" หรือ ลงเป็น Story)
  isStory: boolean;        // แพลตฟอร์มนี้ลงเป็น Story
};

export type ReadinessInput = {
  platforms: string[];                          // แพลตฟอร์มที่จะลง
  captionPlatforms: string[];                   // แพลตฟอร์มที่เขียนแคปชั่นแล้ว (ข้อความไม่ว่าง)
  platformImages: Record<string, string[]>;     // รูปที่เลือกต่อแพลตฟอร์ม (ว่าง = ใช้รูปแนบทั้งหมด)
  imageKeys: string[];                          // รูปแนบของโพสต์
  postStatus: Record<string, string>;           // posted / scheduled / skip ต่อแพลตฟอร์ม
  formats?: Record<string, string>;             // รูปแบบโพสต์ต่อแพลตฟอร์ม (platform_formats) — "story" ไม่ต้องมีแคปชั่น
};

/** ตั้งค่าแพลตฟอร์มเท่าที่ต้องใช้ (รูปเดียวกับ PlatformSettings ใน app/tasks/data.ts) */
export type CaptionSettings = Record<string, { use_caption?: boolean } | undefined>;

/** แพลตฟอร์มนี้ต้องมีแคปชั่นไหม — ไม่ได้ตั้งไว้ = ต้องมี */
export function captionRequired(settings: CaptionSettings | null | undefined, platform: string): boolean {
  return settings?.[platform]?.use_caption !== false;
}

export function platformReadiness(e: ReadinessInput, settings?: CaptionSettings | null): PlatReady[] {
  return e.platforms.map((code) => {
    const st = e.postStatus[code];
    const picked = e.platformImages[code];
    const imgs = picked?.length ? picked : e.imageKeys;
    const isStory = e.formats?.[code] === "story";
    const captionOff = isStory || !captionRequired(settings, code);
    const missing: ReadyMissing[] = [];
    if (!captionOff && !e.captionPlatforms.includes(code)) missing.push("caption");
    if (!imgs.length) missing.push("image");
    const state: ReadyState = st === "posted" ? "posted" : st === "scheduled" ? "scheduled" : st === "skip" ? "skip" : missing.length ? "missing" : "ready";
    return { code, state, missing, images: imgs.slice(0, 4), captionOff, isStory };
  });
}
