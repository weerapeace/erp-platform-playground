/**
 * ตั๋วงานช่าง Pattern — ของฝั่งเซิร์ฟเวอร์ (ใช้ใน API เท่านั้น)
 *   loadActor   = ใครเรียก + มีสิทธิ์อะไร (ใช้กับกติกาใน lib/pattern-tickets)
 *   ensureTicketFolder = โฟลเดอร์ Drive ของตั๋ว  <โฟลเดอร์แม่ "งาน ERP"> / ตั๋วงาน Pattern / <PT-xxxx ชื่องาน>
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiCan } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { DRIVE_ROOT_FOLDER_ID, driveConfigured, driveEnsureFolder, driveGetFolder } from "@/lib/google-drive";
import { safeDriveName } from "@/lib/content-drive";
import type { PatternActor } from "@/lib/pattern-tickets";

export const PATTERN_TABLE = "pattern_tickets";
export const PATTERN_TYPES_TABLE = "pattern_ticket_types";
export const PATTERN_DRIVE_PARENT = "ตั๋วงาน Pattern";

export type PatternActorFull = PatternActor & { name: string | null; roleLabel: string | null };

export async function loadActor(request: Request, admin: SupabaseClient): Promise<PatternActorFull> {
  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(request).auth.getUser(); userId = data.user?.id ?? null; } catch { /* ไม่มีตัวตน */ }
  const [canWork, canManage, canCreate] = await Promise.all([
    apiCan(request, "pattern.work"), apiCan(request, "pattern.manage"), apiCan(request, "pattern.create"),
  ]);
  let name: string | null = null, roleLabel: string | null = null;
  if (userId) {
    const { data: p } = await admin.from("user_profiles").select("display_name, email, role").eq("id", userId).maybeSingle();
    name = (p?.display_name as string | null) || (p?.email as string | null) || null;
    if (p?.role) {
      const { data: r } = await admin.from("erp_roles").select("label").eq("key", p.role).maybeSingle();
      roleLabel = (r?.label as string | null) ?? String(p.role);
    }
  }
  return { userId, name, roleLabel, canWork, canManage, canCreate };
}

/** หาหรือสร้างโฟลเดอร์ Drive ของตั๋ว (เก็บ id/url กลับลงตั๋ว) · Drive ยังไม่ตั้งค่า = throw ข้อความภาษาคน */
export async function ensureTicketFolder(admin: SupabaseClient, t: { id: string; ticket_no: string | null; title: string; drive_folder_id: string | null; drive_folder_url: string | null }): Promise<{ folderId: string; folderUrl: string }> {
  if (!driveConfigured()) throw new Error("ยังไม่ได้เชื่อม Google Drive (แจ้งผู้ดูแลระบบ)");
  if (t.drive_folder_id) {
    const still = await driveGetFolder(t.drive_folder_id).catch(() => null);   // ถูกลบไปแล้ว = สร้างใหม่
    if (still) return { folderId: t.drive_folder_id, folderUrl: t.drive_folder_url || still.webViewLink };
  }
  const parent = await driveEnsureFolder(PATTERN_DRIVE_PARENT, DRIVE_ROOT_FOLDER_ID);
  const folderId = await driveEnsureFolder(safeDriveName(`${t.ticket_no ?? ""} ${t.title}`) || t.id, parent);
  const info = await driveGetFolder(folderId);
  const folderUrl = info?.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`;
  await admin.from(PATTERN_TABLE).update({ drive_folder_id: folderId, drive_folder_url: folderUrl }).eq("id", t.id);
  return { folderId, folderUrl };
}
