/**
 * ของกลางฝั่งเซิร์ฟเวอร์ — จัดโฟลเดอร์ Drive ของ artwork ให้ตรงโครง [แบรนด์] > [ซับตามชนิด] > [ชื่องาน]
 * ใช้ทั้ง /api/drive/upload (อัปทีละใบ) และ /api/assets/drive-folders (bulk สร้างโฟลเดอร์ + ก็อป preview)
 */
import { driveEnsureFolder, driveUploadFile, DRIVE_ROOT_FOLDER_ID } from "./google-drive";
import { supabaseAdmin } from "./supabase-admin";
import { r2GetObject } from "./r2";

type Admin = ReturnType<typeof supabaseAdmin>;

/** สร้างชั้นโฟลเดอร์ตาม path ซ้อนชั้น (เช่น "Printed/DTF") ใต้ parent → คืน folderId ชั้นล่างสุด */
async function ensureSubPath(parent: string, subpath: string): Promise<string> {
  let cur = parent;
  for (const seg of subpath.split(/[\\/]+/).map((s) => s.trim()).filter(Boolean)) cur = await driveEnsureFolder(seg, cur);
  return cur;
}

/** หา/สร้างโฟลเดอร์ Drive: [โฟลเดอร์แม่] > [ซับ] > [ชื่องาน] → คืน folderId
 *  subpathOverride = ใส่ path ซ้อนชั้นเอง (เช่น "Printed/DTF" ของงานพิมพ์) แทนการแม็ปตามชนิด artwork
 *  rootFolderId    = โฟลเดอร์แม่เฉพาะ (เช่น "โฟลเดอร์แม่ของงานพิมพ์") → ใช้ตัวนี้เป็นราก ไม่สนแบรนด์ */
export async function resolveArtworkDriveFolder(admin: Admin, opts: { brandId?: string | null; artworkType?: string | null; name: string; subpathOverride?: string | null; rootFolderId?: string | null }): Promise<string> {
  let brandFolder = (opts.rootFolderId ?? "").trim() || DRIVE_ROOT_FOLDER_ID;
  if (!(opts.rootFolderId ?? "").trim() && opts.brandId) {
    const { data } = await admin.from("erp_brand_drive_folders").select("folder_id").eq("brand_id", opts.brandId).maybeSingle();
    if (data?.folder_id) brandFolder = String(data.folder_id);
  }
  let parent = brandFolder;
  const override = (opts.subpathOverride ?? "").trim();
  if (override) {
    parent = await ensureSubPath(brandFolder, override);
  } else {
    const at = (opts.artworkType ?? "").trim();
    if (at) {
      const { data } = await admin.from("erp_artwork_drive_folders").select("subfolder_name").eq("artwork_type", at).maybeSingle();
      const subName = (data?.subfolder_name || at).trim();
      if (subName) parent = await driveEnsureFolder(subName, brandFolder);
    }
  }
  return driveEnsureFolder(opts.name.trim() || "artwork", parent);
}

const previewExtFromType = (ct?: string | null) => ct === "image/jpeg" ? ".jpg" : ct === "image/webp" ? ".webp" : ".png";

/** ก็อปรูป preview (จาก R2) เข้าโฟลเดอร์ Drive — ตั้งชื่อ <ชื่องาน><ext> · คืน true ถ้าสำเร็จ (best-effort) */
export async function copyAssetPreviewToDrive(folderId: string, opts: { r2_key: string; name: string; content_type?: string | null }): Promise<boolean> {
  if (!opts.r2_key) return false;
  const obj = await r2GetObject(opts.r2_key);
  if (!obj) return false;
  const bytes = new Uint8Array(await new Response(obj.body as ReadableStream).arrayBuffer());
  const mime = opts.content_type || obj.httpMetadata?.contentType || "image/png";
  await driveUploadFile(`${opts.name.trim() || "preview"}${previewExtFromType(mime)}`, mime, bytes, folderId);
  return true;
}
