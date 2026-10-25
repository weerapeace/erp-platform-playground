/**
 * ส่งงานจัดเรียงเข้าคลังงานพิมพ์ (เฟส 3) — ของใช้ร่วมฝั่งเซิร์ฟเวอร์ของ /api/nesting-jobs/[id]/drive + /publish
 *
 * ปลายทาง = โครงเดียวกับ "เพิ่มงานพิมพ์" ในคลังไฟล์ (components/asset-library/print-modals.tsx):
 *   [โฟลเดอร์แม่ของงานพิมพ์ (ui_config print_drive_root)] / [ซับของประเภท เช่น Printed/DTF] / [โฟลเดอร์ย่อย?] / [ชื่องาน]
 * ไฟล์ใหญ่ไม่ผ่านเซิร์ฟเวอร์นี้ (ลิมิต body 4 MB ของ Vercel) — เปิดช่องอัปโหลด (resumable session) ให้ตัวช่วยในเครื่องส่งตรงเข้า Drive
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveGetFolder } from "@/lib/google-drive";
import { resolveArtworkDriveFolder } from "@/lib/artwork-drive";

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

/** หา/สร้างโฟลเดอร์ของงาน (เรียกซ้ำได้ — มีอยู่แล้ว = ใช้ตัวเดิม) + path ในเครื่อง (Google Drive บนเครื่อง) */
export async function resolveJobFolder(admin: Admin, jobName: string, pt: PrintTypeRef, group: string): Promise<JobFolder> {
  const root = await printDriveRoot(admin);
  const folderName = safeName(jobName) || "งานพิมพ์";
  const sub = subpathOf(pt);
  const folderId = await resolveArtworkDriveFolder(admin, {
    name: folderName, subpathOverride: [sub, group].filter(Boolean).join("/"), rootFolderId: root.folder_id || null,
  });
  const info = await driveGetFolder(folderId);
  const segs = [...sub.split(/[\\/]+/), group, folderName].map((s) => s.trim()).filter(Boolean);
  const localPath = root.local_base_path ? [root.local_base_path.replace(/[\\/]+$/, ""), ...segs].join("\\") : "";
  return { folderId, folderUrl: info?.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`, localPath, folderName };
}
