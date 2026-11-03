/**
 * สถานะอัลบั้ม Contents (ของกลาง · pure ไม่มี "use client" → ใช้ได้ทั้งหน้าจอ / API / test)
 *
 * อัลบั้ม = กองรูป/วิดีโอจากการถ่าย 1 ครั้ง → แตกได้หลายโพสต์ในปฏิทินคอนเทนต์ (เจ้าของเลือกแบบ ข 2026-11-03)
 * สถานะ "ไม่เก็บ" — คิดสดจากโพสต์ที่ผูก (erp_creative_content.album_id) ทุกครั้ง → ไม่มีใครต้องกดเปลี่ยน
 *
 * กติกา (ต่อแพลตฟอร์ม = แพลตฟอร์มที่ตั้งใจลง ∪ แพลตฟอร์มของโพสต์ที่ผูก ที่ยังไม่ยกเลิก):
 *   - มีโพสต์ลงแพลตฟอร์มนั้น → ใช้ความพร้อมของโพสต์ (lib/content-readiness — กติกาเดียวกับปฏิทิน)
 *       โพสต์แล้ว = ลงแล้ว · ตั้งเวลา/ล้ม/พร้อม = รอลง · ขาดแคปชั่น = รอหา Caption · ขาดรูป = รอจัดการ · ข้าม = ไม่นับ
 *   - ตั้งใจลงแต่ยังไม่มีโพสต์ → มีแคปชั่นร่าง (หรือแพลตฟอร์มไม่ใช้แคปชั่น) = รอลง · ไม่มี = รอหา Caption
 * สถานะอัลบั้ม = ขั้นที่ช้าที่สุด: รอจัดการ > รอหา Caption > รอลง Social > ลงแล้ว
 *   ยังไม่มีไฟล์ หรือยังไม่เลือกแพลตฟอร์มเลย = รอจัดการ · ปิดอัลบั้มเอง = ปิดแล้ว
 */
import { captionRequired, platformReadiness, type CaptionSettings, type ReadinessInput } from "@/lib/content-readiness";

export type AlbumStage = "manage" | "caption" | "ready" | "posted" | "closed";
export type AlbumPlatState = "manage" | "caption" | "ready" | "scheduled" | "failed" | "posted";

export const ALBUM_STAGES: AlbumStage[] = ["manage", "caption", "ready", "posted", "closed"];
export const ALBUM_STAGE_META: Record<AlbumStage, { th: string; en: string; tone: "neutral" | "warning" | "accent" | "success" | "muted" }> = {
  manage: { th: "รอจัดการ", en: "To organise", tone: "neutral" },
  caption: { th: "รอหา Caption", en: "Needs caption", tone: "warning" },
  ready: { th: "รอลง Social", en: "Ready to post", tone: "accent" },
  posted: { th: "ลงแล้ว", en: "Posted", tone: "success" },
  closed: { th: "ปิดแล้ว", en: "Closed", tone: "muted" },
};
export const ALBUM_PLAT_META: Record<AlbumPlatState, { th: string; en: string }> = {
  manage: { th: "รอจัดการ", en: "To organise" },
  caption: { th: "รอแคปชั่น", en: "Needs caption" },
  ready: { th: "รอลง", en: "Ready" },
  scheduled: { th: "ตั้งเวลาแล้ว", en: "Scheduled" },
  failed: { th: "โพสต์ไม่สำเร็จ", en: "Failed" },
  posted: { th: "ลงแล้ว", en: "Posted" },
};

/** โพสต์ที่ผูกกับอัลบั้ม — ข้อมูลความพร้อมรูปเดียวกับปฏิทิน + สถานะโพสต์ */
export type AlbumPostInput = ReadinessInput & { status: string; isActive: boolean };

export type AlbumStatusInput = {
  plannedPlatforms: string[];
  captionDraft: string | null;
  fileCount: number;
  closed: boolean;
  posts: AlbumPostInput[];
};

export type AlbumPlatStatus = { code: string; state: AlbumPlatState; posts: number };
export type AlbumStatus = { stage: AlbumStage; platforms: AlbumPlatStatus[] };

const STAGE_ORDER: Record<Exclude<AlbumStage, "closed">, number> = { manage: 0, caption: 1, ready: 2, posted: 3 };
// ชิปต่อแพลตฟอร์มโชว์ "ไปไกลสุด" (มีโพสต์หนึ่งลงแล้ว = ลงแล้ว) · สถานะอัลบั้มดูจาก "ช้าสุด"
const PLAT_PROGRESS: Record<AlbumPlatState, number> = { manage: 0, caption: 1, failed: 2, ready: 3, scheduled: 4, posted: 5 };
const platStage = (s: AlbumPlatState): Exclude<AlbumStage, "closed"> =>
  s === "posted" ? "posted" : s === "manage" ? "manage" : s === "caption" ? "caption" : "ready";

/** โพสต์ที่ยังนับ (ไม่ถูกยกเลิก/ปิด) */
export const isLiveAlbumPost = (p: { status: string; isActive: boolean }) => p.isActive && p.status !== "cancelled";

export function albumStatus(input: AlbumStatusInput, settings?: CaptionSettings | null): AlbumStatus {
  const live = input.posts.filter(isLiveAlbumPost);
  // แพลตฟอร์ม → สถานะของแต่ละโพสต์ที่ลงแพลตฟอร์มนั้น
  const perPlat = new Map<string, AlbumPlatState[]>();
  for (const p of live) {
    for (const r of platformReadiness(p, settings)) {
      if (r.state === "skip") continue;
      const s: AlbumPlatState = r.state === "missing" ? (r.missing.includes("image") ? "manage" : "caption") : r.state;
      (perPlat.get(r.code) ?? perPlat.set(r.code, []).get(r.code)!).push(s);
    }
  }
  const hasDraft = !!(input.captionDraft ?? "").trim();
  for (const code of input.plannedPlatforms) {
    if (perPlat.has(code) || live.some((p) => p.platforms.includes(code))) continue;   // มีโพสต์แล้ว (รวมที่ตั้งข้าม)
    perPlat.set(code, [hasDraft || !captionRequired(settings, code) ? "ready" : "caption"]);
  }

  const platforms: AlbumPlatStatus[] = [...perPlat.entries()].map(([code, states]) => ({
    code,
    state: states.reduce((a, b) => (PLAT_PROGRESS[b] > PLAT_PROGRESS[a] ? b : a)),
    posts: live.filter((p) => p.platforms.includes(code)).length,
  }));

  if (input.closed) return { stage: "closed", platforms };
  if (input.fileCount === 0 && live.length === 0) return { stage: "manage", platforms };
  const all = [...perPlat.values()].flat();
  if (!all.length) return { stage: "manage", platforms };
  const slowest = all.map(platStage).reduce((a, b) => (STAGE_ORDER[b] < STAGE_ORDER[a] ? b : a));
  return { stage: slowest, platforms };
}
