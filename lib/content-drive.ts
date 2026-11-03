/**
 * โฟลเดอร์ Google Drive เก็บ "ต้นฉบับ" ของงานจริงที่ใช้ลง (รูป/วิดีโอในป๊อปโพสต์) — ฝั่งเซิร์ฟเวอร์
 * กติกา (เจ้าของเลือก 2026-11-02):
 *   1) โพสต์ที่มีต้นฉบับอยู่แล้ว → ใช้โฟลเดอร์เดียวกับไฟล์ที่ขึ้นไปก่อน
 *   2) โพสต์ผูกงานที่มีโฟลเดอร์ Drive → <โฟลเดอร์ของงาน>/<CN ชื่อโพสต์>
 *   3) ไม่งั้น → <โฟลเดอร์แบรนด์>/Content/<CN ชื่อโพสต์>
 *      (โฟลเดอร์แบรนด์ = ตั้งค่าแอปจัดการงาน "โฟลเดอร์ต่อแบรนด์" ก่อน · ไม่มีใช้ของคลัง Artwork)
 * หาโฟลเดอร์โพสต์จากเลข CN (ขึ้นต้นชื่อ) — เปลี่ยนชื่อโพสต์ทีหลังก็ยังเจอโฟลเดอร์เดิม
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveListChildFolders, driveCreateFolder, driveEnsureFolder, driveFindFolder, driveAccessToken } from "@/lib/google-drive";
import { getBrandParentFolder } from "@/lib/creative-tasks-server";

type Admin = ReturnType<typeof supabaseAdmin>;

export type ContentDriveTarget =
  | { ok: true; folderId: string | null; folderUrl: string | null; label: string }
  | { ok: false; reason: string };

export const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
/** ชื่อไฟล์/โฟลเดอร์ที่ Drive รับได้ (ตัดอักขระพิเศษ) */
export const safeDriveName = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);

async function driveParentOf(fileId: string): Promise<string | null> {
  try {
    const token = await driveAccessToken();
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=parents,trashed&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const j = await r.json() as { parents?: string[]; trashed?: boolean };
    return !j.trashed && j.parents?.[0] ? j.parents[0] : null;
  } catch { return null; }
}

/** โฟลเดอร์ <แบรนด์>/Content (ใช้ร่วม: ต้นฉบับโพสต์ + อัลบั้ม Contents) · create=false = ดูอย่างเดียว (folderId null = ยังไม่มี) */
export async function resolveBrandContentFolder(admin: Admin, brandId: string, create: boolean): Promise<{ ok: true; folderId: string | null; label: string } | { ok: false; reason: string }> {
  // โฟลเดอร์แบรนด์ = ตั้งค่าแอปจัดการงาน "โฟลเดอร์ต่อแบรนด์" ก่อน · ไม่มีใช้ของคลัง Artwork
  let brandFolder = (await getBrandParentFolder(admin, brandId))?.folder_id ?? null;
  if (!brandFolder) {
    const { data: bf } = await admin.from("erp_brand_drive_folders").select("folder_id").eq("brand_id", brandId).maybeSingle();
    brandFolder = ((bf as { folder_id?: string | null } | null)?.folder_id ?? "").trim() || null;
  }
  if (!brandFolder) return { ok: false, reason: "แบรนด์นี้ยังไม่ได้ตั้งโฟลเดอร์ Drive (ตั้งที่ แอปจัดการงาน › ตั้งค่า › โฟลเดอร์ต่อแบรนด์)" };
  const { data: b } = await admin.from("brands").select("name").eq("id", brandId).maybeSingle();
  const label = `${(b as { name?: string } | null)?.name ?? "แบรนด์"} › Content`;
  const folderId = create ? await driveEnsureFolder("Content", brandFolder) : await driveFindFolder("Content", brandFolder);
  return { ok: true, folderId, label };
}

/** หาโฟลเดอร์ปลายทางของโพสต์ · create=false = ดูอย่างเดียว (folderId อาจเป็น null = จะสร้างตอนอัปไฟล์แรก) */
export async function resolveContentDriveTarget(admin: Admin, contentId: string, create: boolean): Promise<ContentDriveTarget> {
  if (!driveConfigured()) return { ok: false, reason: "ระบบยังไม่ได้เชื่อม Google Drive" };
  const { data: c } = await admin.from("erp_creative_content").select("id, content_no, title, task_id, brand_id").eq("id", contentId).maybeSingle();
  const row = c as { id: string; content_no: string | null; title: string | null; task_id: string | null; brand_id: string | null } | null;
  if (!row) return { ok: false, reason: "ไม่พบคอนเทนต์" };
  const folderName = safeDriveName(`${row.content_no ?? ""} ${row.title ?? ""}`) || row.id;
  const key = row.content_no?.trim() || folderName;

  // 1) ต้นฉบับที่ขึ้นไปแล้ว → โฟลเดอร์เดียวกัน
  const { data: prev } = await admin.from("erp_creative_attachments").select("drive_file_id").eq("content_id", contentId).not("drive_file_id", "is", null).order("created_at", { ascending: false }).limit(1);
  const prevId = (prev?.[0] as { drive_file_id?: string } | undefined)?.drive_file_id;
  if (prevId) {
    const parent = await driveParentOf(prevId);
    if (parent) return { ok: true, folderId: parent, folderUrl: driveFolderUrl(parent), label: folderName };
  }

  // 2) โฟลเดอร์ของงานที่ผูก
  let baseId: string | null = null; let baseLabel = "";
  if (row.task_id) {
    const { data: t } = await admin.from("erp_creative_tasks").select("task_no, title, drive_folder_id").eq("id", row.task_id).maybeSingle();
    const task = t as { task_no?: string | null; title?: string | null; drive_folder_id?: string | null } | null;
    if (task?.drive_folder_id) { baseId = task.drive_folder_id; baseLabel = `งาน ${task.task_no ?? task.title ?? ""}`.trim(); }
  }
  // 3) โฟลเดอร์แบรนด์ › Content
  if (!baseId) {
    if (!row.brand_id) return { ok: false, reason: "ยังไม่ได้เลือกแบรนด์ของโพสต์ — เลือกแบรนด์ก่อน ระบบถึงรู้ว่าจะเก็บต้นฉบับไว้โฟลเดอร์ไหน" };
    const base = await resolveBrandContentFolder(admin, row.brand_id, create);
    if (!base.ok) return base;
    baseLabel = base.label;
    baseId = base.folderId;
    if (!baseId) return { ok: true, folderId: null, folderUrl: null, label: `${baseLabel} › ${folderName}` };
  }

  const label = `${baseLabel} › ${folderName}`;
  const kids = await driveListChildFolders(baseId).catch(() => [] as { id: string; name: string }[]);
  const found = kids.find((k) => k.name === folderName) ?? kids.find((k) => key && k.name.startsWith(key));
  if (found) return { ok: true, folderId: found.id, folderUrl: driveFolderUrl(found.id), label };
  if (!create) return { ok: true, folderId: null, folderUrl: null, label };
  const f = await driveCreateFolder(folderName, baseId);
  return { ok: true, folderId: f.id, folderUrl: f.webViewLink || driveFolderUrl(f.id), label };
}
