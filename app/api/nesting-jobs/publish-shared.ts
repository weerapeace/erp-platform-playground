/**
 * ส่งงานจัดเรียงเข้าคลังงานพิมพ์ (เฟส 3) — ของใช้ร่วมฝั่งเซิร์ฟเวอร์ของ /api/nesting-jobs/[id]/drive + /publish
 *
 * ปลายทาง = [โฟลเดอร์ส่งร้านพิมพ์] / YYYY-MM-DD / <ประเภท> - <ชื่องาน> (ดู resolveJobFolder ด้านล่าง · docs/nesting-artwork-cards.md)
 * ไฟล์ใหญ่ไม่ผ่านเซิร์ฟเวอร์นี้ (ลิมิต body 4 MB ของ Vercel) — เปิดช่องอัปโหลด (resumable session) ให้ตัวช่วยในเครื่องส่งตรงเข้า Drive
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveEnsureFolder, driveGetFolder } from "@/lib/google-drive";

type Admin = ReturnType<typeof supabaseAdmin>;

export type PrintTypeRef = { id: string; code: string; name: string; drive_subpath: string | null };
export type JobFolder = { folderId: string; folderUrl: string; localPath: string; folderName: string };

const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/g;

/** ชื่อโฟลเดอร์/ไฟล์: ตัดตัวอักษรที่ Windows ห้ามใช้ (Drive ในเครื่องจะได้ชื่อเดียวกัน) */
export function safeName(v: unknown, max = 100): string {
  return String(v ?? "").replace(FORBIDDEN, " ").replace(/\s+/g, " ").trim().replace(/^[.\s]+|[.\s]+$/g, "").slice(0, max);
}

/** ไฟล์ผลลัพธ์จากตัวช่วย: sheet_01.pdf / sheet_01.eps / preview_01.png */
const HELPER_OUTPUT = /^(sheet|preview)_(\d{2,3})\.(pdf|eps|png)$/;

/** ชื่อบน Drive: แผ่นเดียว "<ชื่องาน>.pdf" · หลายแผ่น "<ชื่องาน> - 02.pdf" · รูปตัวอย่าง = .png ชื่อเดียวกัน */
export function driveFileName(base: string, key: string, sheets: number): { name: string; mime: string } | null {
  const m = HELPER_OUTPUT.exec(key);
  if (!m || (m[1] === "preview") !== (m[3] === "png")) return null;
  const ext = m[3];
  const mime = ext === "pdf" ? "application/pdf" : ext === "eps" ? "application/postscript" : "image/png";
  return { name: sheets > 1 ? `${base} - ${m[2]}.${ext}` : `${base}.${ext}`, mime };
}

/** จำนวนแผ่น = เลขแผ่นที่ไม่ซ้ำกันในรายการไฟล์ */
export function sheetCount(keys: string[]): number {
  return new Set(keys.map((k) => HELPER_OUTPUT.exec(k)?.[2]).filter(Boolean)).size;
}

export async function printTypeByCode(admin: Admin, code: unknown): Promise<PrintTypeRef | null> {
  const c = String(code ?? "").trim();
  if (!c) return null;
  const { data } = await admin.from("erp_print_types").select("id, code, name, drive_subpath").eq("code", c).eq("is_active", true).maybeSingle();
  return (data as PrintTypeRef | null) ?? null;
}

/** โฟลเดอร์แม่ของงานพิมพ์ (ตั้งที่คลังไฟล์ → ⚙️ จัดการประเภทงานพิมพ์) */
export async function printDriveRoot(admin: Admin): Promise<{ folder_id: string; local_base_path: string }> {
  const { data } = await admin.from("ui_config").select("value").eq("key", "print_drive_root").maybeSingle();
  const v = ((data?.value ?? {}) as Record<string, unknown>);
  return { folder_id: String(v.folder_id ?? "").trim(), local_base_path: String(v.local_base_path ?? "").trim() };
}

export const subpathOf = (pt: PrintTypeRef) => (pt.drive_subpath ?? "").trim() || pt.code;


// ---------------------------------------------------------------- ปลายทาง "ไฟล์ส่งร้านพิมพ์" (เจ้าของสั่ง 2026-11-16)
// [โฟลเดอร์ส่งร้านพิมพ์] / YYYY-MM-DD / <ประเภท> - <ชื่องาน>  + ลิงก์แชร์ "ทุกคนที่มีลิงก์ดูได้" ที่โฟลเดอร์ชื่องาน
// โฟลเดอร์ส่งร้านพิมพ์ = ui_config nesting_drive_root (ผู้ดูแลตั้งจากหน้าต่างส่ง) → ไม่มี = print_drive_root เดิม (คลังไฟล์ใช้ร่วม)
// ผู้ใช้เปลี่ยนปลายทางเองได้ (วางลิงก์โฟลเดอร์ · จำในเครื่อง) → ส่ง root_folder_id มา

export const DATE_FOLDER = /^\d{4}-\d{2}-\d{2}$/;

/** ชื่อโฟลเดอร์งาน: "<ประเภท> - <ชื่อ>" (ชื่อว่าง = "งานพิมพ์") */
export function jobFolderName(typeCode: string, name: string): string {
  const n = safeName(name) || "งานพิมพ์";
  const c = safeName(typeCode, 20);
  return c ? `${c} - ${n}`.slice(0, 120) : n;
}

/** วันที่โฟลเดอร์ (เครื่องผู้ใช้ส่งมา) — ผิดรูปแบบ = วันนี้ตามเวลาไทย */
export function dateFolderOf(v: unknown, now = new Date()): string {
  const s = String(v ?? "").trim();
  if (DATE_FOLDER.test(s)) return s;
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export type SendRoot = { folder_id: string; local_base_path: string; source: "nesting" | "print" };

/** โฟลเดอร์ส่งร้านพิมพ์ตั้งต้นของทุกคน */
export async function sendRootDefault(admin: Admin): Promise<SendRoot> {
  const { data } = await admin.from("ui_config").select("value").eq("key", "nesting_drive_root").maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const id = String(v.folder_id ?? "").trim();
  if (id) return { folder_id: id, local_base_path: String(v.local_base_path ?? "").trim(), source: "nesting" };
  const p = await printDriveRoot(admin);
  return { ...p, source: "print" };
}

export class RootMissingError extends Error {
  constructor() { super("หาโฟลเดอร์ปลายทางบน Drive ไม่เจอ (อาจถูกย้าย/ลบ หรือยังไม่ได้แชร์ให้ระบบ) — เลือกโฟลเดอร์ใหม่ในหน้าต่างส่ง"); }
}

/**
 * หา/สร้างโฟลเดอร์ของงาน (เรียกซ้ำได้ — มีอยู่แล้ว = ใช้ตัวเดิม)
 * rootOverride = โฟลเดอร์ที่ผู้ใช้เลือกเอง (ไม่ใส่ = ตั้งต้น) · หาโฟลเดอร์ปลายทางไม่เจอ = RootMissingError
 */
export async function resolveJobFolder(admin: Admin, p: { typeCode: string; name: string; date: string; rootOverride?: string | null }): Promise<JobFolder> {
  const def = await sendRootDefault(admin);
  const rootId = (p.rootOverride || "").trim() || def.folder_id;
  const root = rootId ? await driveGetFolder(rootId) : null;
  if (!root) throw new RootMissingError();
  const folderName = jobFolderName(p.typeCode, p.name);
  const dateId = await driveEnsureFolder(p.date, root.id);
  const folderId = await driveEnsureFolder(folderName, dateId);
  const info = await driveGetFolder(folderId);
  const useLocal = root.id === def.folder_id && def.local_base_path;
  const localPath = useLocal ? [def.local_base_path.replace(/[\/]+$/, ""), p.date, folderName].join("\\") : "";
  return { folderId, folderUrl: info?.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`, localPath, folderName };
}
