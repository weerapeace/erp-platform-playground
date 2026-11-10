/**
 * 📁 โฟลเดอร์ Google Drive ของใบงานออกแบบ (ไฟล์งาน AI / PSD / PDF ฯลฯ — ไฟล์ใหญ่ ไม่เก็บใน R2)
 *   ที่วาง: <โฟลเดอร์แบรนด์>/ใบงานออกแบบ/<DS-xxxx ชื่องาน>
 *     โฟลเดอร์แบรนด์ = ตั้งค่าแอปจัดการงาน "โฟลเดอร์ต่อแบรนด์" ก่อน → ไม่มีใช้ของคลัง Artwork (erp_brand_drive_folders)
 *     → แบรนด์ที่ยังไม่ตั้ง = โฟลเดอร์กลาง "งาน ERP" (DRIVE_ROOT_FOLDER_ID)
 *   ใบงานที่ช่อง "ลิงก์ไฟล์งาน" เป็นโฟลเดอร์ Drive อยู่แล้ว = ใช้โฟลเดอร์นั้น
 *   สร้างโฟลเดอร์แล้วเติมลิงก์ลงช่อง drive_link ให้เอง (เฉพาะตอนช่องยังว่าง — ไม่ทับลิงก์ที่คนใส่ไว้)
 * ใช้ที่: /api/design-sheets/[id]/drive · ตัวไฟล์ส่งทีละชิ้นผ่าน /api/drive/upload-chunk (lib/drive-chunk-upload)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { DRIVE_ROOT_FOLDER_ID, driveConfigured, driveEnsureFolder, driveFindFolder, driveGetFolder, parseDriveFolderId } from "@/lib/google-drive";
import { getBrandParentFolder } from "@/lib/creative-tasks-server";
import { safeDriveName } from "@/lib/content-drive";

type Admin = ReturnType<typeof supabaseAdmin>;

/** ชื่อโฟลเดอร์ย่อยใต้โฟลเดอร์แบรนด์ ที่รวมใบงานออกแบบทุกใบ */
export const DESIGN_SHEET_DRIVE_PARENT = "ใบงานออกแบบ";

export type DesignSheetDriveRow = { id: string; code: string | null; name: string | null; brand_id: string | null; drive_link: string | null };

export const designSheetFolderName = (s: Pick<DesignSheetDriveRow, "id" | "code" | "name">) => safeDriveName(`${s.code ?? ""} ${s.name ?? ""}`) || s.id;
const folderUrlOf = (id: string, link?: string | null) => link || `https://drive.google.com/drive/folders/${id}`;

async function brandBaseFolder(admin: Admin, brandId: string | null): Promise<string> {
  if (brandId) {
    const task = await getBrandParentFolder(admin, brandId);
    if (task?.folder_id) return task.folder_id;
    const { data } = await admin.from("erp_brand_drive_folders").select("folder_id").eq("brand_id", brandId).maybeSingle();
    const art = ((data as { folder_id?: string | null } | null)?.folder_id ?? "").trim();
    if (art) return art;
  }
  return DRIVE_ROOT_FOLDER_ID;
}

/** ลิงก์ในช่อง drive_link เป็นโฟลเดอร์ที่ยังอยู่ไหม → id · ไม่ใช่โฟลเดอร์/ถูกลบ = null */
async function linkedFolder(link: string | null): Promise<{ id: string; url: string } | null> {
  const id = parseDriveFolderId((link ?? "").trim());
  if (!id) return null;
  const f = await driveGetFolder(id).catch(() => null);
  return f ? { id, url: folderUrlOf(id, f.webViewLink) } : null;
}

/** หาโฟลเดอร์ของใบงาน (ดูอย่างเดียว ไม่สร้าง) → null = ยังไม่มี (จะสร้างตอนอัปไฟล์แรก) */
export async function findDesignSheetFolder(admin: Admin, s: DesignSheetDriveRow): Promise<{ id: string; url: string } | null> {
  if (!driveConfigured()) return null;
  const linked = await linkedFolder(s.drive_link);
  if (linked) return linked;
  const parent = await driveFindFolder(DESIGN_SHEET_DRIVE_PARENT, await brandBaseFolder(admin, s.brand_id));
  if (!parent) return null;
  const id = await driveFindFolder(designSheetFolderName(s), parent);
  if (!id) return null;
  const f = await driveGetFolder(id).catch(() => null);
  return { id, url: folderUrlOf(id, f?.webViewLink) };
}

/** หา/สร้างโฟลเดอร์ของใบงาน + เติมลิงก์ลงช่อง drive_link ถ้าช่องยังว่าง → { id, url, linkSaved } */
export async function ensureDesignSheetFolder(admin: Admin, s: DesignSheetDriveRow): Promise<{ id: string; url: string; linkSaved: boolean }> {
  if (!driveConfigured()) throw new Error("ยังไม่ได้เชื่อม Google Drive (แจ้งผู้ดูแลระบบ)");
  const linked = await linkedFolder(s.drive_link);
  if (linked) return { ...linked, linkSaved: false };
  const parent = await driveEnsureFolder(DESIGN_SHEET_DRIVE_PARENT, await brandBaseFolder(admin, s.brand_id));
  const id = await driveEnsureFolder(designSheetFolderName(s), parent);
  const f = await driveGetFolder(id).catch(() => null);
  const url = folderUrlOf(id, f?.webViewLink);
  let linkSaved = false;
  if (!(s.drive_link ?? "").trim()) {
    // เติมเฉพาะตอนช่องยังว่างจริงในฐานข้อมูล (กันทับลิงก์ที่มีคนเพิ่งใส่)
    const { data } = await admin.from("design_sheets").update({ drive_link: url }).eq("id", s.id).or("drive_link.is.null,drive_link.eq.").select("id");
    linkSaved = (data ?? []).length > 0;
  }
  return { id, url, linkSaved };
}
