/**
 * แพทเทิร์น (แอปสตูดิโอแพทเทิร์น) — ของฝั่งเซิร์ฟเวอร์ (ใช้ใน API เท่านั้น)
 *   loadProjectActor = ใครเรียก + แก้/ลบได้ไหม
 *   derivedColumns   = ช่องสรุปที่คิดจากชิ้น/ตะเข็บ (จำนวนชิ้น · พื้นที่ · ภาพย่อ) — หน้ารายการอ่านจากช่องพวกนี้ ไม่ต้องอ่านทั้งก้อน
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiCan } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { projectSummary, projectThumb, type ProjectPiece } from "@/lib/pattern-project";
import type { Seam } from "@/lib/pattern-seams";

export const PROJECT_TABLE = "pattern_projects";
export const PROJECT_LIST_COLS = "id,pattern_no,name,status,sku_code,piece_count,seam_count,area_cm2,thumb,owner_name,updated_by_name,created_at,updated_at";
export const PROJECT_PERM = { view: "pattern_studio.view", edit: "pattern_studio.edit", del: "pattern_studio.delete" } as const;

export type ProjectActor = { userId: string | null; name: string | null; canEdit: boolean; canDelete: boolean };

export async function loadProjectActor(request: Request, admin: SupabaseClient): Promise<ProjectActor> {
  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(request).auth.getUser(); userId = data.user?.id ?? null; } catch { /* ไม่มีตัวตน */ }
  const [canEdit, canDelete] = await Promise.all([apiCan(request, PROJECT_PERM.edit), apiCan(request, PROJECT_PERM.del)]);
  let name: string | null = null;
  if (userId) {
    const { data: p } = await admin.from("user_profiles").select("display_name, email").eq("id", userId).maybeSingle();
    name = (p?.display_name as string | null) || (p?.email as string | null) || null;
  }
  return { userId, name, canEdit, canDelete };
}

export function derivedColumns(pieces: ProjectPiece[], seams: Seam[], basis: "box" | "area") {
  const s = projectSummary(pieces, basis);
  return { piece_count: s.pieceCount, seam_count: seams.length, area_cm2: s.areaCm2, thumb: projectThumb(pieces) };
}
