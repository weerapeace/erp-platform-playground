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

// สิทธิ์ที่ขอตอนเชื่อมต่อ — เฟสแรกขอเฉพาะ Facebook (IG เพิ่มเมื่อผ่านรีวิว)
export const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"];

// URL หน้าอนุญาต (OAuth dialog) ของ Facebook
export function metaAuthUrl(redirectUri: string, state: string, scopes: string[] = FB_SCOPES): string {
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
