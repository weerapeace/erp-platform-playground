/**
 * Google Drive (Shared Drive) — สร้างโฟลเดอร์ / อัปไฟล์ ผ่าน Service Account (JWT, ไม่ต้อง login)
 * env: GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY (จากไฟล์ JSON service account)
 *      GOOGLE_DRIVE_ROOT_FOLDER_ID (โฟลเดอร์แม่ใน Shared Drive · มี default hardcode)
 * ⚠️ ต้องแชร์โฟลเดอร์แม่ใน Shared Drive ให้อีเมล service account (สิทธิ์ Content manager) ก่อน
 */
import crypto from "crypto";

// รับได้ทั้งชื่อเดิมและชื่อสำรอง (เผื่อตั้ง env คนละชื่อ)
const CLIENT_EMAIL = (process.env.GOOGLE_SA_CLIENT_EMAIL || process.env.GOOGLE_SA_EMAIL || "").trim();
const PRIVATE_KEY = (process.env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
export const DRIVE_ROOT_FOLDER_ID = (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_SHARED_DRIVE_ID || "1Fv2HTcbcfXY_LfKF120pATNokF-N61a5").trim();

/** ตั้งค่าครบพร้อมใช้ไหม (มีอีเมล + กุญแจ) */
export function driveConfigured(): boolean { return !!CLIENT_EMAIL && !!PRIVATE_KEY; }

let cachedToken: { token: string; exp: number } | null = null;

/** ขอ access token จาก service account (เซ็น JWT RS256) — แคช ~55 นาที */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  if (!driveConfigured()) throw new Error("ยังไม่ได้ตั้งค่า Google Drive (env GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY)");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(JSON.stringify({
    iss: CLIENT_EMAIL, scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })).toString("base64url");
  const signingInput = `${header}.${claim}`;
  let signature: string;
  try { signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), PRIVATE_KEY).toString("base64url"); }
  catch (e) { throw new Error(`กุญแจ (private key) ไม่ถูกต้อง: ${(e as Error).message}`); }
  const jwt = `${signingInput}.${signature}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`ขอ token Google ไม่สำเร็จ: ${j.error_description || j.error || res.status}`);
  cachedToken = { token: j.access_token as string, exp: Date.now() + Number(j.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

/** สร้างโฟลเดอร์ใน Shared Drive → คืน { id, webViewLink } */
export async function driveCreateFolder(name: string, parentId = DRIVE_ROOT_FOLDER_ID): Promise<{ id: string; webViewLink: string }> {
  const token = await getAccessToken();
  const res = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.id) throw new Error(`สร้างโฟลเดอร์ Drive ไม่สำเร็จ: ${j.error?.message || res.status} (เช็คว่าแชร์โฟลเดอร์แม่ให้ service account แล้ว)`);
  return { id: j.id as string, webViewLink: (j.webViewLink as string) || `https://drive.google.com/drive/folders/${j.id}` };
}

/** ค้นหาโฟลเดอร์ตามชื่อ (ในโฟลเดอร์แม่ถ้าระบุ parentId) → คืน id หรือ null · ครอบทั้ง My Drive(ที่แชร์ให้ SA)/Shared Drive */
export async function driveFindFolder(name: string, parentId?: string): Promise<string | null> {
  const token = await getAccessToken();
  const esc = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = [`name = '${esc}'`, "mimeType = 'application/vnd.google-apps.folder'", "trashed = false", parentId ? `'${parentId}' in parents` : ""].filter(Boolean).join(" and ");
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)&pageSize=5`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json().catch(() => ({}));
  const files = (j.files as { id: string }[] | undefined) ?? [];
  return files[0]?.id ?? null;
}

/** ไล่โฟลเดอร์ลูก (folders) ในโฟลเดอร์แม่ → [{id,name}] (รองรับ paging) */
export async function driveListChildFolders(parentId: string): Promise<{ id: string; name: string }[]> {
  const token = await getAccessToken();
  const q = [`'${parentId}' in parents`, "mimeType = 'application/vnd.google-apps.folder'", "trashed = false"].join(" and ");
  const out: { id: string; name: string }[] = [];
  let pageToken = "";
  do {
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(id,name)&pageSize=1000&orderBy=name${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await res.json().catch(() => ({}));
    for (const f of (j.files ?? []) as { id: string; name: string }[]) out.push({ id: f.id, name: f.name });
    pageToken = (j.nextPageToken as string) ?? "";
  } while (pageToken);
  return out;
}

/** ไฟล์รูปในโฟลเดอร์ (image/*) → [{id,name,mimeType}] (สูงสุด 20) */
export async function driveListImages(parentId: string): Promise<{ id: string; name: string; mimeType: string }[]> {
  const token = await getAccessToken();
  const q = [`'${parentId}' in parents`, "mimeType contains 'image/'", "trashed = false"].join(" and ");
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,size)&pageSize=20&orderBy=name`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json().catch(() => ({}));
  return (j.files ?? []) as { id: string; name: string; mimeType: string }[];
}

/** โหลดไฟล์จาก Drive → { bytes, mimeType, name } หรือ null */
export async function driveDownloadFile(fileId: string): Promise<{ bytes: Uint8Array; mimeType: string; name: string } | null> {
  const token = await getAccessToken();
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=name,mimeType`, { headers: { Authorization: `Bearer ${token}` } });
  const m = await meta.json().catch(() => ({} as Record<string, unknown>));
  const dl = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!dl.ok) return null;
  const bytes = new Uint8Array(await dl.arrayBuffer());
  return { bytes, mimeType: (m.mimeType as string) || "image/png", name: (m.name as string) || "preview" };
}

/** หาโฟลเดอร์ตามชื่อในโฟลเดอร์แม่ — ไม่มีก็สร้างให้ → คืน id */
export async function driveEnsureFolder(name: string, parentId: string): Promise<string> {
  const found = await driveFindFolder(name, parentId);
  if (found) return found;
  return (await driveCreateFolder(name, parentId)).id;
}

/**
 * โฟลเดอร์เก็บรูปปก: [01] Catalogs > 02_Contents > 02_cover (แคชผลไว้ในหน่วยความจำ) → คืน id หรือ null
 * "[01] Catalogs" = env GOOGLE_DRIVE_CATALOGS_FOLDER_ID (ถ้าตั้ง) ไม่งั้นค้นหาตามชื่อ (ต้องแชร์โฟลเดอร์นี้ให้ service account)
 */
let coverFolderCache: string | null = null;
export async function resolveCoverFolderId(overrideFolderId?: string | null): Promise<string | null> {
  const ov = (overrideFolderId || "").trim();
  if (ov) return ov;   // ผู้ใช้ตั้งโฟลเดอร์เองที่หน้าตั้งค่า → ใช้ตรง ๆ
  if (coverFolderCache) return coverFolderCache;
  if (!driveConfigured()) return null;
  try {
    let catalogsId = (process.env.GOOGLE_DRIVE_CATALOGS_FOLDER_ID || "").trim() || null;
    if (!catalogsId) catalogsId = await driveFindFolder("[01] Catalogs");
    if (!catalogsId) { console.error("[drive] ไม่พบโฟลเดอร์ '[01] Catalogs' — แชร์ให้ service account แล้วหรือยัง? (หรือตั้ง env GOOGLE_DRIVE_CATALOGS_FOLDER_ID)"); return null; }
    const contentsId = await driveEnsureFolder("02_Contents", catalogsId);
    const coverId = await driveEnsureFolder("02_cover", contentsId);
    coverFolderCache = coverId;
    return coverId;
  } catch (e) { console.error("[drive] resolveCoverFolderId failed:", e); return null; }
}

/** อ่านข้อมูลโฟลเดอร์ตาม id (ตรวจว่าเข้าถึงได้ + เป็นโฟลเดอร์) → คืน { id, name, webViewLink } หรือ null */
export async function driveGetFolder(id: string): Promise<{ id: string; name: string; webViewLink: string } | null> {
  const fid = (id || "").trim(); if (!fid) return null;
  const token = await getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fid)}?supportsAllDrives=true&fields=id,name,webViewLink,mimeType`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.id || j.mimeType !== "application/vnd.google-apps.folder") return null;
  return { id: j.id as string, name: (j.name as string) ?? "", webViewLink: (j.webViewLink as string) || `https://drive.google.com/drive/folders/${j.id}` };
}

/** ดึง folder id จากลิงก์ Drive (…/folders/<id>) — ลิงก์ที่ไม่ใช่ folders = null */
export function parseDriveFolderId(url: string): string | null {
  const m = (url || "").match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** เปลี่ยนชื่อโฟลเดอร์ใน Drive (คืน true ถ้าสำเร็จ) */
export async function driveRenameFolder(id: string, name: string): Promise<boolean> {
  const fid = (id || "").trim(); const nm = (name || "").trim();
  if (!fid || !nm) return false;
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fid)}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nm }),
  });
  return res.ok;
}

/** ย้ายโฟลเดอร์ (พร้อมไฟล์ข้างใน) ไป "ถังขยะของ Drive" — กู้คืนได้ ไม่ลบถาวร (คืน true ถ้าสำเร็จ) */
export async function driveTrashFolder(id: string): Promise<boolean> {
  const fid = (id || "").trim(); if (!fid) return false;
  const token = await getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fid)}?supportsAllDrives=true`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  return res.ok;
}

/** อัปไฟล์ขึ้นโฟลเดอร์ (multipart) → คืน { id, webViewLink } · ใช้เฟสอัปไฟล์ */
export async function driveUploadFile(name: string, mimeType: string, data: ArrayBuffer | Uint8Array, parentId: string): Promise<{ id: string; webViewLink: string }> {
  const token = await getAccessToken();
  const boundary = "erpdrive" + crypto.randomBytes(8).toString("hex");
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const pre = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId] })}\r\n--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`);
  const post = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([pre, Buffer.from(bytes), post]);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.id) throw new Error(`อัปไฟล์ขึ้น Drive ไม่สำเร็จ: ${j.error?.message || res.status}`);
  return { id: j.id as string, webViewLink: (j.webViewLink as string) || `https://drive.google.com/file/d/${j.id}/view` };
}

/**
 * เริ่ม resumable upload session → คืน "upload URL" ให้เบราว์เซอร์ PUT ไฟล์ตรงเข้า Drive
 * (สำหรับไฟล์ใหญ่ — เลี่ยงลิมิตขนาด body ของเซิร์ฟเวอร์ Vercel)
 */
export async function driveCreateResumableSession(name: string, mimeType: string, parentId: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mimeType || "application/octet-stream" },
    body: JSON.stringify({ name, parents: [parentId] }),
  });
  if (!res.ok) throw new Error(`เริ่ม upload session ไม่สำเร็จ: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const loc = res.headers.get("location");
  if (!loc) throw new Error("ไม่ได้ upload URL จาก Drive");
  return loc;
}
