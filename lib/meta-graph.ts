// ============================================================
// ตัวเชื่อม Meta Graph API (Facebook Page + Instagram) — ฝั่งเซิร์ฟเวอร์เท่านั้น
// เอกสาร: https://developers.facebook.com/docs/pages-api / instagram-platform/content-publishing
// ต้องมี env: META_APP_ID + META_APP_SECRET (ตั้งใน Vercel) · token เก็บเข้ารหัสใน platform_credentials.api_key
//
// เฟส 1 = Facebook Page (โพสต์รูป/ข้อความบนเพจตัวเอง ใช้ได้เลย ไม่ต้อง App Review)
// IG (instagram_content_publish) แอปโหมดพัฒนาโพสต์บัญชีตัวเองได้ · ถ้าจะให้คนนอกแอปเชื่อมต้องผ่าน App Review
// ============================================================

// ⚠️ แต่ละเวอร์ชันใช้ได้ ~2 ปี (v21 หมด 21 ม.ค. 2027) → v25 (ก.พ. 2026) · เปลี่ยนเวอร์ชันที่นี่ที่เดียว (meta-capi ใช้ค่านี้ด้วย)
export const META_VER = "v25.0";
export const META_API = `https://graph.facebook.com/${META_VER}`;

const APP_ID = () => (process.env.META_APP_ID ?? "").trim();
const APP_SECRET = () => (process.env.META_APP_SECRET ?? "").trim();
export function metaConfigured(): boolean { return !!(APP_ID() && APP_SECRET()); }

// สิทธิ์ที่ขอตอนเชื่อมต่อ
export const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"];
export const IG_SCOPES = ["instagram_basic", "instagram_content_publish"];
export const CONNECT_SCOPES = [...FB_SCOPES, ...IG_SCOPES];   // ขอทั้ง FB + IG ทีเดียว (IG โพสต์บัญชีตัวเองในโหมดพัฒนาได้ · ถ้าเมต้าขอรีวิว/ยืนยันธุรกิจค่อยทำ)

// URL หน้าอนุญาต (OAuth dialog) ของ Facebook
export function metaAuthUrl(redirectUri: string, state: string, scopes: string[] = CONNECT_SCOPES): string {
  const q = new URLSearchParams({ client_id: APP_ID(), redirect_uri: redirectUri, state, response_type: "code", scope: scopes.join(",") });
  return `https://www.facebook.com/${META_VER}/dialog/oauth?${q.toString()}`;
}

/** error จาก Graph API — เก็บรหัส code/subcode ไว้ (ตัวแปลข้อความใน lib/social-publish/rules ใช้บอกสาเหตุจริงเป็นภาษาคน) */
export class MetaApiError extends Error {
  code?: number; subcode?: number;
  constructor(message: string, code?: number, subcode?: number) { super(message); this.name = "MetaApiError"; this.code = code; this.subcode = subcode; }
}

// เรียก Graph API แล้วคืน json (โยน MetaApiError พร้อมรหัส)
async function graph(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const r = await fetch(url, init);
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || j.error) {
    const err = j.error as { message?: string; code?: number; error_subcode?: number } | undefined;
    throw new MetaApiError(err?.message || `Meta HTTP ${r.status}`, err?.code, err?.error_subcode);
  }
  return j;
}

/** ตรวจว่า token ยังใช้ได้ (เรียก /me เบา ๆ) — null = ใช้ได้ · ไม่งั้นคืน error ของ Meta (เช่น บัญชีติดด่านตรวจสอบ / token หมดอายุ) */
export async function metaCheckToken(token: string): Promise<MetaApiError | null> {
  try { await graph(`${META_API}/me?fields=id&access_token=${encodeURIComponent(token)}`); return null; }
  catch (e) { return e instanceof MetaApiError ? e : new MetaApiError((e as Error).message); }
}

/** อ่านข้อมูลพื้นฐานของเพจ/บัญชี IG (เช่น "link" ของเพจ · "username,name" ของ IG) — ใช้เติมชื่อร้าน/ลิงก์ให้อัตโนมัติ */
export async function metaGetFields(objectId: string, fields: string, token: string): Promise<Record<string, unknown>> {
  return graph(`${META_API}/${encodeURIComponent(objectId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`);
}

// code → access token ระยะสั้น
export async function metaExchangeCode(code: string, redirectUri: string): Promise<string> {
  const q = new URLSearchParams({ client_id: APP_ID(), client_secret: APP_SECRET(), redirect_uri: redirectUri, code });
  const j = await graph(`${META_API}/oauth/access_token?${q.toString()}`);
  return String(j.access_token ?? "");
}

// token ระยะสั้น → ระยะยาว (~60 วัน)
export async function metaLongLivedToken(shortToken: string): Promise<string> {
  const q = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: APP_ID(), client_secret: APP_SECRET(), fb_exchange_token: shortToken });
  const j = await graph(`${META_API}/oauth/access_token?${q.toString()}`);
  return String(j.access_token ?? "");
}

export type MetaPage = { id: string; name: string; access_token: string; ig_user_id: string | null };

// รายชื่อเพจที่ผู้ใช้เป็นแอดมิน (พร้อม page token + ig ที่ผูก)
export async function metaGetPages(userToken: string): Promise<MetaPage[]> {
  const q = new URLSearchParams({ fields: "id,name,access_token,instagram_business_account", access_token: userToken, limit: "100" });
  const j = await graph(`${META_API}/me/accounts?${q.toString()}`);
  const rows = Array.isArray(j.data) ? (j.data as Record<string, unknown>[]) : [];
  return rows.map((p) => ({
    id: String(p.id ?? ""),
    name: String(p.name ?? ""),
    access_token: String(p.access_token ?? ""),
    ig_user_id: (p.instagram_business_account as { id?: string } | null)?.id ? String((p.instagram_business_account as { id: string }).id) : null,
  }));
}

// โพสต์ขึ้น Facebook Page
//  - ไม่มีรูป      → โพสต์ข้อความ (/feed)
//  - รูปเดียว      → โพสต์รูป+แคปชั่น (/photos)
//  - หลายรูป       → อัปโหลดแบบยังไม่เผยแพร่ทีละรูป แล้วสร้างโพสต์ feed แนบรูปทั้งหมด (อัลบั้ม)
//  - scheduledTime → ตั้งเวลา (unix วินาที): FB จัดคิวโพสต์ให้เอง (published=false + scheduled_publish_time)
export async function fbPublish(pageId: string, pageToken: string, message: string, imageUrls: string[] = [], scheduledTime?: number): Promise<{ url: string; id: string; scheduled: boolean }> {
  const scheduled = !!scheduledTime && scheduledTime > 0;
  const withSchedule = (b: URLSearchParams) => { if (scheduled) { b.set("published", "false"); b.set("scheduled_publish_time", String(scheduledTime)); } return b; };
  const result = (id: string) => ({ id, url: id ? `https://www.facebook.com/${id}` : "", scheduled });

  if (imageUrls.length === 0) {
    const b = withSchedule(new URLSearchParams({ message, access_token: pageToken }));
    const j = await graph(`${META_API}/${pageId}/feed`, { method: "POST", body: b });
    return result(String(j.id ?? ""));
  }
  if (imageUrls.length === 1) {
    const b = withSchedule(new URLSearchParams({ url: imageUrls[0], caption: message, access_token: pageToken }));
    const j = await graph(`${META_API}/${pageId}/photos`, { method: "POST", body: b });
    return result(String(j.post_id ?? j.id ?? ""));
  }
  // หลายรูป: อัปทีละรูปแบบ published=false → เก็บ media_fbid → สร้างโพสต์เดียวแนบทั้งหมด
  const mediaIds: string[] = [];
  for (const url of imageUrls) {
    const b = new URLSearchParams({ url, published: "false", access_token: pageToken });
    const j = await graph(`${META_API}/${pageId}/photos`, { method: "POST", body: b });
    if (j.id) mediaIds.push(String(j.id));
  }
  const b = new URLSearchParams({ message, access_token: pageToken });
  mediaIds.forEach((mid, i) => b.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: mid })));
  withSchedule(b);
  const j = await graph(`${META_API}/${pageId}/feed`, { method: "POST", body: b });
  return result(String(j.id ?? ""));
}

// โพสต์วิดีโอขึ้น Facebook Page (/videos file_url) — รองรับตั้งเวลาเหมือนรูป
export async function fbPublishVideo(pageId: string, pageToken: string, description: string, videoUrl: string, scheduledTime?: number): Promise<{ url: string; id: string; scheduled: boolean }> {
  const scheduled = !!scheduledTime && scheduledTime > 0;
  const b = new URLSearchParams({ file_url: videoUrl, description, access_token: pageToken });
  if (scheduled) { b.set("published", "false"); b.set("scheduled_publish_time", String(scheduledTime)); }
  const j = await graph(`${META_API}/${pageId}/videos`, { method: "POST", body: b });
  const id = String(j.id ?? "");
  return { id, url: id ? `https://www.facebook.com/${id}` : "", scheduled };
}

// Facebook Reels (Reels Publishing API) — /videos ปกติจะขึ้นเป็น "วิดีโอ" ไม่ใช่ Reels จึงต้องใช้ทางนี้
//  start → ส่ง file_url ให้ rupload.facebook.com ดึงไฟล์เอง → finish (PUBLISHED / SCHEDULED)
//  ข้อจำกัด Meta: แนวตั้ง 9:16 · ≥540p · 3–90 วิ · ≤30 Reels/วัน/เพจ
export async function fbPublishReel(pageId: string, pageToken: string, description: string, videoUrl: string, scheduledTime?: number): Promise<{ url: string; id: string; scheduled: boolean }> {
  const init = await graph(`${META_API}/${pageId}/video_reels`, { method: "POST", body: new URLSearchParams({ upload_phase: "start", access_token: pageToken }) });
  const videoId = String(init.video_id ?? "");
  if (!videoId) throw new Error("เริ่มอัป Reels ไม่สำเร็จ");
  const uploadUrl = String(init.upload_url ?? "") || `https://rupload.facebook.com/video-upload/${META_VER}/${videoId}`;
  const up = await fetch(uploadUrl, { method: "POST", headers: { Authorization: `OAuth ${pageToken}`, file_url: videoUrl } });
  const uj = (await up.json().catch(() => ({}))) as { success?: boolean; debug_info?: { message?: string } };
  if (!up.ok || uj.success === false) throw new Error(uj.debug_info?.message || `อัปวิดีโอ Reels ไม่สำเร็จ (HTTP ${up.status})`);
  const scheduled = !!scheduledTime && scheduledTime > 0;
  const fin = new URLSearchParams({ upload_phase: "finish", video_id: videoId, video_state: scheduled ? "SCHEDULED" : "PUBLISHED", description, access_token: pageToken });
  if (scheduled) fin.set("scheduled_publish_time", String(scheduledTime));
  await graph(`${META_API}/${pageId}/video_reels`, { method: "POST", body: fin });
  return { id: videoId, url: `https://www.facebook.com/reel/${videoId}`, scheduled };
}

// ============================================================
// Instagram (ผ่านเพจที่ผูก IG Business) — 2 ขั้น: สร้าง "container" → media_publish
//  รูปเดียว/อัลบั้ม = เร็ว (สร้าง+เผยแพร่ในคำขอเดียว) · วิดีโอ (Reels) = ช้า ต้องรอ IG ประมวลผล → poll แยก
// ============================================================

// สร้าง container รูป (is_carousel_item=true ถ้าเป็นรูปในอัลบั้ม)
async function igImageContainer(igId: string, token: string, imageUrl: string, caption?: string, carouselItem?: boolean): Promise<string> {
  const b = new URLSearchParams({ image_url: imageUrl, access_token: token });
  if (caption) b.set("caption", caption);
  if (carouselItem) b.set("is_carousel_item", "true");
  const j = await graph(`${META_API}/${igId}/media`, { method: "POST", body: b });
  return String(j.id ?? "");
}

// สถานะ container (FINISHED = พร้อมเผยแพร่ · IN_PROGRESS = กำลังประมวลผล · ERROR = พัง)
export async function igContainerStatus(token: string, creationId: string): Promise<string> {
  const j = await graph(`${META_API}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`);
  return String(j.status_code ?? "");
}

// รอ container พร้อม (ใช้กับรูป/อัลบั้ม — เสร็จไว) จำกัดเวลาไม่ให้ค้าง
async function igWaitReady(token: string, creationId: string, tries = 6, delayMs = 2000): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const st = await igContainerStatus(token, creationId).catch(() => "");
    if (st === "FINISHED") return;
    if (st === "ERROR") throw new Error("Instagram ประมวลผลรูปไม่สำเร็จ");
    await new Promise((r) => setTimeout(r, delayMs));
  }
  // ไม่เสร็จในเวลา — ลองเผยแพร่ต่อ (บางเคส FINISHED ช้าเล็กน้อย)
}

// เผยแพร่ container ที่พร้อมแล้ว → คืน media id + ลิงก์
export async function igPublish(igId: string, token: string, creationId: string): Promise<{ url: string; id: string }> {
  const b = new URLSearchParams({ creation_id: creationId, access_token: token });
  const j = await graph(`${META_API}/${igId}/media_publish`, { method: "POST", body: b });
  const id = String(j.id ?? "");
  return { id, url: id ? `https://www.instagram.com/` : "" };   // permalink จริงต้องดึงเพิ่ม — คืนลิงก์ IG ทั่วไปพอ
}

// โพสต์รูป IG (เดี่ยว/อัลบั้ม) แบบครบขั้นในคำขอเดียว (รูปเสร็จไว)
export async function igPublishImages(igId: string, token: string, caption: string, imageUrls: string[]): Promise<{ url: string; id: string }> {
  if (imageUrls.length === 0) throw new Error("Instagram ต้องมีรูปอย่างน้อย 1 รูป");
  if (imageUrls.length === 1) {
    const cid = await igImageContainer(igId, token, imageUrls[0], caption);
    await igWaitReady(token, cid);
    return igPublish(igId, token, cid);
  }
  // อัลบั้ม (สูงสุด 10 รูป): สร้าง child ทุกใบ → container พาเรนต์ CAROUSEL → เผยแพร่
  const children: string[] = [];
  for (const url of imageUrls.slice(0, 10)) children.push(await igImageContainer(igId, token, url, undefined, true));
  for (const cid of children) await igWaitReady(token, cid);
  const b = new URLSearchParams({ media_type: "CAROUSEL", caption, access_token: token });
  children.forEach((cid, i) => b.set(`children[${i}]`, cid));
  const j = await graph(`${META_API}/${igId}/media`, { method: "POST", body: b });
  const parent = String(j.id ?? "");
  return igPublish(igId, token, parent);
}

// สร้าง container วิดีโอ Reels — คืน creation_id (ผู้เรียกต้อง poll สถานะ แล้วค่อย igPublish)
export async function igCreateReels(igId: string, token: string, videoUrl: string, caption: string): Promise<string> {
  const b = new URLSearchParams({ media_type: "REELS", video_url: videoUrl, caption, access_token: token });
  const j = await graph(`${META_API}/${igId}/media`, { method: "POST", body: b });
  return String(j.id ?? "");
}

// ── Story (24 ชม.) ────────────────────────────────────────────────────────────
// Facebook Page Story: อัปรูปแบบ published=false ก่อน (ได้ photo id) → /photo_stories
//   ต้องมีสิทธิ์ pages_manage_posts + เพจต้องผ่านเงื่อนไขของ Meta · ตั้งเวลาไม่ได้
export async function fbPublishStory(pageId: string, pageToken: string, imageUrl: string): Promise<{ url: string; id: string }> {
  const up = new URLSearchParams({ url: imageUrl, published: "false", access_token: pageToken });
  const photo = await graph(`${META_API}/${pageId}/photos`, { method: "POST", body: up });
  const photoId = String(photo.id ?? "");
  if (!photoId) throw new Error("อัปรูปสำหรับ Story ไม่สำเร็จ");
  const b = new URLSearchParams({ photo_id: photoId, access_token: pageToken });
  const j = await graph(`${META_API}/${pageId}/photo_stories`, { method: "POST", body: b });
  const id = String(j.post_id ?? j.id ?? "");
  return { id, url: id ? `https://www.facebook.com/stories/${pageId}` : "" };
}

// Facebook Page Story แบบวิดีโอ — ต้อง initialize → upload → finish (3 ขั้น)
export async function fbPublishVideoStory(pageId: string, pageToken: string, videoUrl: string): Promise<{ url: string; id: string }> {
  const init = await graph(`${META_API}/${pageId}/video_stories`, { method: "POST", body: new URLSearchParams({ upload_phase: "start", access_token: pageToken }) });
  const videoId = String(init.video_id ?? "");
  const uploadUrl = String(init.upload_url ?? "");
  if (!videoId || !uploadUrl) throw new Error("เริ่มอัป Story วิดีโอไม่สำเร็จ");
  const r = await fetch(uploadUrl, { method: "POST", headers: { Authorization: `OAuth ${pageToken}`, file_url: videoUrl } });
  if (!r.ok) throw new Error(`อัปวิดีโอ Story ไม่สำเร็จ (HTTP ${r.status})`);
  const fin = await graph(`${META_API}/${pageId}/video_stories`, { method: "POST", body: new URLSearchParams({ upload_phase: "finish", video_id: videoId, access_token: pageToken }) });
  const id = String(fin.post_id ?? videoId);
  return { id, url: `https://www.facebook.com/stories/${pageId}` };
}

// Instagram Story: container media_type=STORIES → publish (แคปชั่นไม่ขึ้นใน Story)
// ต้องมีสิทธิ์ instagram_content_publish (ของเรายังรอ App Review) — ถ้าไม่ผ่านจะได้ error จาก Meta ตรง ๆ
export async function igPublishStory(igId: string, token: string, mediaUrl: string, isVideo = false): Promise<{ url: string; id: string }> {
  const b = new URLSearchParams({ media_type: "STORIES", access_token: token });
  b.set(isVideo ? "video_url" : "image_url", mediaUrl);
  const j = await graph(`${META_API}/${igId}/media`, { method: "POST", body: b });
  const cid = String(j.id ?? "");
  if (!cid) throw new Error("สร้าง Story ของ Instagram ไม่สำเร็จ");
  await igWaitReady(token, cid);
  return igPublish(igId, token, cid);
}
