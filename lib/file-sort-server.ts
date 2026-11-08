/**
 * 🗂️ สูตรแยกไฟล์ — ตัวช่วยฝั่งเซิร์ฟเวอร์ (อ่านค่าตั้งจาก ui_config + ชื่อโฟลเดอร์แบรนด์/ชนิด)
 * ใช้ร่วม: /api/file-sort/config · /api/file-sort/plan
 */
import type { supabaseAdmin } from "./supabase-admin";
import { FILE_SORT_CONFIG_KEY, cleanFileSortConfig, type FileSortConfig } from "./file-sort";

type Admin = ReturnType<typeof supabaseAdmin>;

export async function loadFileSortConfig(admin: Admin): Promise<FileSortConfig> {
  const { data } = await admin.from("ui_config").select("value").eq("key", FILE_SORT_CONFIG_KEY).maybeSingle();
  return cleanFileSortConfig((data as { value?: unknown } | null)?.value ?? null);
}

/** ชื่อโฟลเดอร์ของแบรนด์ (= ชื่อโฟลเดอร์ฐานบน Drive เช่น "[01] Louis Montini") · ไม่มี = null */
export async function brandFolderName(admin: Admin, brandId: string): Promise<{ name: string | null; folder: string | null }> {
  const [b, f] = await Promise.all([
    admin.from("brands").select("name").eq("id", brandId).maybeSingle(),
    admin.from("erp_brand_drive_folders").select("folder_label").eq("brand_id", brandId).maybeSingle(),
  ]);
  return {
    name: ((b.data as { name?: string } | null)?.name ?? null),
    folder: (((f.data as { folder_label?: string | null } | null)?.folder_label ?? "").trim() || null),
  };
}

/** ชื่อซับโฟลเดอร์ของชนิด (เช่น โลโก้ → "01_Logo") · ไม่ได้ตั้ง = ใช้ชื่อชนิด (ตรงกับ resolveArtworkDriveFolder) */
export async function artworkTypeFolderName(admin: Admin, artworkType: string): Promise<string> {
  const at = artworkType.trim();
  if (!at) return "";
  const { data } = await admin.from("erp_artwork_drive_folders").select("subfolder_name").eq("artwork_type", at).maybeSingle();
  return (((data as { subfolder_name?: string | null } | null)?.subfolder_name ?? "").trim()) || at;
}
