// ============================================================
// ตัวยิงโพสต์ Facebook / Instagram (ของกลาง · ฝั่งเซิร์ฟเวอร์)
// ใช้ 2 ทาง: ปุ่ม "โพสต์เลย" (/api/meta/publish) และคิวตามเวลา (lib/social-publish/queue ← /api/cron/social-publish)
// → กติกาเลือกสื่อ / ข้อความ error / การบันทึกผล เหมือนกันทุกทาง
// ทั้ง FB และ IG ใช้ connection เดียวกัน (แบรนด์ × facebook: page token + ig_user_id)
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit } from "@/lib/audit";
import {
  fbPublish, fbPublishVideo, fbPublishReel, fbPublishStory, fbPublishVideoStory,
  igPublishImages, igPublishStory, igCreateReels, igContainerStatus, igPublish, metaCheckToken, MetaApiError,
} from "@/lib/meta-graph";
import { getPlatformId, loadConn } from "@/app/api/meta/shared";
import { platformMediaUrl, type PostMedia } from "./media";
import { DEFAULT_IG_FIT } from "./fit";
import { normalizeMedia, friendlyMetaError } from "./rules";

export { normalizeMedia, friendlyMetaError };

/** แพลตฟอร์มที่ระบบยิงโพสต์เองได้ตอนนี้ */
export const META_AUTO_PLATFORMS = ["facebook", "instagram"] as const;
export const isMetaAutoPlatform = (p: string): boolean => (META_AUTO_PLATFORMS as readonly string[]).includes(p);

export type Actor = { id: string | null; name: string | null };
export type PublishResult =
  | { ok: true; state: "posted" | "scheduled"; url: string; story?: boolean }
  | { ok: true; state: "processing"; creationId: string }     // IG Reels — รอ IG ประมวลผล แล้วค่อย finalize
  | { ok: false; error: string; status?: number };

// error ใด ๆ → ข้อความภาษาคน (ใช้รหัสของ Meta ถ้ามี)
const metaErr = (platform: string, e: unknown): string => {
  const me = e instanceof MetaApiError ? e : null;
  return friendlyMetaError(platform, (e as Error)?.message ?? String(e), me?.code, me?.subcode);
};

type ContentRow = { id: string; brand_id: string | null; posted_links: Record<string, string> | null; post_status: Record<string, string> | null };

async function loadContentConn(admin: SupabaseClient, contentId: string) {
  const { data } = await admin.from("erp_creative_content").select("id, brand_id, posted_links, post_status").eq("id", contentId).maybeSingle();
  if (!data) return { error: "ไม่พบคอนเทนต์", status: 404 } as const;
  const c = data as ContentRow;
  if (!c.brand_id) return { error: "คอนเทนต์ยังไม่ได้เลือกแบรนด์ — ต้องมีแบรนด์เพื่อรู้ว่าโพสต์ขึ้นเพจ/บัญชีไหน", status: 400 } as const;
  const fbId = await getPlatformId(admin, "facebook");
  if (!fbId) return { error: "ไม่พบแพลตฟอร์ม facebook", status: 400 } as const;
  const conn = await loadConn(admin, c.brand_id, fbId);
  if (!conn?.token || conn.meta.stage !== "connected" || !conn.meta.page_id)
    return { error: "แบรนด์นี้ยังไม่ได้เชื่อมต่อ Facebook/Instagram — ไปเชื่อมต่อที่ 🏪 จัดการร้าน/บัญชีแพลตฟอร์มก่อน", status: 400 } as const;
  return { c, conn: { token: conn.token, pageId: conn.meta.page_id, pageName: conn.meta.page_name ?? null, igId: conn.meta.ig_user_id ?? null } } as const;
}

/** ตรวจว่าแบรนด์ของคอนเทนต์พร้อมยิงแพลตฟอร์มนี้ไหม (ใช้ตอนตั้งคิว) */
export async function checkMetaReady(admin: SupabaseClient, contentId: string, platform: string): Promise<string | null> {
  if (!isMetaAutoPlatform(platform)) return `${platform} ยังโพสต์อัตโนมัติไม่ได้`;
  const r = await loadContentConn(admin, contentId);
  if ("error" in r) return r.error ?? null;
  if (platform === "instagram" && !r.conn.igId) return "เพจที่เชื่อมยังไม่ได้ผูก Instagram (ต้องเป็น IG Business + ผูกกับเพจ)";
  // ลองเรียก Meta จริง 1 ครั้ง — การเชื่อมต่อเสีย (บัญชีติดด่านตรวจ/หมดอายุ) จะได้รู้ตอนตั้งคิว ไม่ใช่ไปล้มตอนถึงเวลา
  const bad = await metaCheckToken(r.conn.token);
  return bad ? metaErr(platform, bad) : null;
}

/** บันทึกผลลงคอนเทนต์ (post_status/posted_links เดิม) + audit — อ่านค่าล่าสุดก่อนเขียน (คิวหลายแพลตฟอร์มอาจจบพร้อมกัน) */
async function markContent(admin: SupabaseClient, contentId: string, platform: string, statusVal: string, link: string | null, actor: Actor, meta: Record<string, unknown>): Promise<void> {
  const { data } = await admin.from("erp_creative_content").select("posted_links, post_status").eq("id", contentId).maybeSingle();
  const row = (data ?? {}) as { posted_links?: Record<string, string> | null; post_status?: Record<string, string> | null };
  const postedLinks = link ? { ...(row.posted_links ?? {}), [platform]: link } : (row.posted_links ?? {});
  const postStatus = { ...(row.post_status ?? {}), [platform]: statusVal };
  await admin.from("erp_creative_content").update({ posted_links: postedLinks, post_status: postStatus, updated_at: new Date().toISOString() }).eq("id", contentId);
  if (statusVal === "posted" || statusVal === "scheduled")
    await writeAudit(admin, { action: "update", entityType: "creative_content", entityId: contentId, actorId: actor.id, actorName: actor.name, metadata: { published_to: platform, url: link, ...meta } });
}

/**
 * ยิงโพสต์ 1 แพลตฟอร์ม
 *  - scheduledTime (unix) = ให้ Facebook จัดคิวเอง (เส้นเดิมของปุ่ม — คิวของเราไม่ใช้ เพราะยิงตอนถึงเวลาอยู่แล้ว)
 *  - via = "manual" (กดเอง) | "queue" (ระบบโพสต์ตามเวลา) — เก็บใน audit
 */
export async function publishMeta(admin: SupabaseClient, input: {
  contentId: string; platform: string; caption: string; media: PostMedia[]; format?: string | null; scheduledTime?: number; actor: Actor; via: "manual" | "queue";
}): Promise<PublishResult> {
  const { contentId, platform, caption, actor, via } = input;
  const format = (input.format ?? "").trim();
  if (!isMetaAutoPlatform(platform)) return { ok: false, error: "แพลตฟอร์มนี้ยังยิงอัตโนมัติไม่ได้", status: 400 };
  const nm = normalizeMedia(format, input.media);
  if ("error" in nm) return { ok: false, error: nm.error, status: 400 };
  // IG ฟีด: รูปที่ไม่ได้ตั้งการปรับขอบ → เติมขอบขาวเฉพาะรูปที่สัดส่วนหลุดช่วง (กัน IG ปฏิเสธ · รวมคิว "ตั้งคิวทุกแพลตฟอร์ม")
  const igFeed = platform === "instagram" && format !== "story" && format !== "reels";
  const media = nm.media.map((m) => (igFeed && m.type !== "video" && !m.fit ? { ...m, fit: DEFAULT_IG_FIT } : m));
  const videoUrls = media.filter((m) => m.type === "video").map(platformMediaUrl);
  const imageUrls = media.filter((m) => m.type !== "video").map(platformMediaUrl);
  const sched = input.scheduledTime && input.scheduledTime > 0 ? input.scheduledTime : undefined;

  const r = await loadContentConn(admin, contentId);
  if ("error" in r) return { ok: false, error: r.error ?? "", status: r.status };
  const { token, pageId, pageName, igId } = r.conn;
  const done = async (state: "posted" | "scheduled", url: string, extra: Record<string, unknown> = {}): Promise<PublishResult> => {
    await markContent(admin, contentId, platform, state, url, actor, { page: pageName, via, format: format || null, ...extra });
    return { ok: true, state, url, ...(extra.story ? { story: true } : {}) };
  };

  try {
    if (platform === "facebook") {
      if (format === "story") {   // Story ของเพจ (24 ชม.) — แคปชั่นไม่ขึ้นใน Story
        const st = videoUrls.length ? await fbPublishVideoStory(pageId, token, videoUrls[0]) : await fbPublishStory(pageId, token, imageUrls[0]);
        return done("posted", st.url, { story: true });
      }
      // Reels ต้องใช้ Reels API (ถ้าส่ง /videos จะขึ้นเป็นวิดีโอธรรมดา) · วิดีโอที่ไม่ได้เลือก Reels = วิดีโอปกติ
      const posted = videoUrls.length
        ? (format === "reels" ? await fbPublishReel(pageId, token, caption, videoUrls[0], sched) : await fbPublishVideo(pageId, token, caption, videoUrls[0], sched))
        : await fbPublish(pageId, token, caption, imageUrls, sched);
      return done(posted.scheduled ? "scheduled" : "posted", posted.url);
    }
    // Instagram
    if (!igId) return { ok: false, error: "เพจที่เชื่อมยังไม่ได้ผูก Instagram (ต้องเป็น IG Business + ผูกกับเพจ)", status: 400 };
    if (sched) return { ok: false, error: "Instagram ตั้งเวลาในแอปเขาไม่ได้ — ใช้ “ตั้งคิวให้ระบบโพสต์” แทน", status: 400 };
    if (format === "story") {
      const st = await igPublishStory(igId, token, videoUrls[0] ?? imageUrls[0], videoUrls.length > 0);
      return done("posted", st.url, { story: true });
    }
    if (videoUrls.length) return { ok: true, state: "processing", creationId: await igCreateReels(igId, token, videoUrls[0], caption) };
    const posted = await igPublishImages(igId, token, caption, imageUrls);
    return done("posted", posted.url);
  } catch (e) {
    return { ok: false, error: metaErr(platform, e), status: 400 };
  }
}

/** IG Reels: เช็กว่าประมวลผลเสร็จยัง → เสร็จ = เผยแพร่ + บันทึกผล */
export async function finalizeIgReel(admin: SupabaseClient, input: { contentId: string; creationId: string; actor: Actor; via: "manual" | "queue" }): Promise<PublishResult> {
  const r = await loadContentConn(admin, input.contentId);
  if ("error" in r) return { ok: false, error: r.error ?? "", status: r.status };
  const { token, igId } = r.conn;
  if (!igId) return { ok: false, error: "ยังไม่ได้เชื่อมต่อ Instagram", status: 400 };
  let st: string;
  try { st = await igContainerStatus(token, input.creationId); }
  catch (e) { return { ok: false, error: `เช็กสถานะไม่สำเร็จ: ${(e as Error).message}`, status: 400 }; }
  if (st === "ERROR") return { ok: false, error: "Instagram ประมวลผลวิดีโอไม่สำเร็จ (ตรวจสเปกวิดีโอ: MP4/MOV แนวตั้ง 3วิ–15นาที)", status: 400 };
  if (st !== "FINISHED") return { ok: true, state: "processing", creationId: input.creationId };
  try {
    const posted = await igPublish(igId, token, input.creationId);
    await markContent(admin, input.contentId, "instagram", "posted", posted.url, input.actor, { reel: true, via: input.via });
    return { ok: true, state: "posted", url: posted.url };
  } catch (e) {
    return { ok: false, error: metaErr("instagram", e), status: 400 };
  }
}

/** ตั้งสถานะโพสต์ของแพลตฟอร์มบนคอนเทนต์ (scheduled/failed · null = ลบสถานะ) — ใช้ตอนตั้ง/ยกเลิก/ล้มของคิว */
export async function setContentPostStatus(admin: SupabaseClient, contentId: string, platform: string, value: string | null, onlyIf?: string[]): Promise<void> {
  const { data } = await admin.from("erp_creative_content").select("post_status").eq("id", contentId).maybeSingle();
  const cur = { ...(((data as { post_status?: Record<string, string> | null } | null)?.post_status) ?? {}) };
  if (onlyIf && !onlyIf.includes(cur[platform] ?? "")) return;
  if (value) cur[platform] = value; else delete cur[platform];
  await admin.from("erp_creative_content").update({ post_status: cur, updated_at: new Date().toISOString() }).eq("id", contentId);
}
