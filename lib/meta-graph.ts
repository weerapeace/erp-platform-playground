// ============================================================
// ตัวเชื่อม Meta Graph API (Facebook Page + Instagram) — ฝั่งเซิร์ฟเวอร์เท่านั้น
// เอกสาร: https://developers.facebook.com/docs/pages-api / instagram-platform/content-publishing
// ต้องมี env: META_APP_ID + META_APP_SECRET (ตั้งใน Vercel) · token เก็บเข้ารหัสใน platform_credentials.api_key
//
// เฟส 1 = Facebook Page (โพสต์รูป/ข้อความบนเพจตัวเอง ใช้ได้เลย ไม่ต้อง App Review)
// IG (instagram_content_publish) ต้องผ่าน App Review ก่อน — เตรียม ig_user_id ไว้แล้วในการเชื่อมต่อ
// ============================================================

export const META_VER = "v21.0";
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

// เรียก Graph API แล้วคืน json (โยน error ที่แปลเป็นข้อความอ่านง่าย)
async function graph(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const r = await fetch(url, init);
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || j.error) {
    const err = j.error as { message?: string; code?: number } | undefined;
    throw new Error(err?.message || `Meta HTTP ${r.status}`);
  }
  return j;
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
