/**
 * ของช่วยร่วมของ API ใบแจ้งลูกค้า (route.ts ต้อง export แค่ handler — ของช่วยอยู่ไฟล์นี้)
 */
import type { NextRequest } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { cleanNoticeCalc, cleanNoticeDisplay, cleanNoticeImages, noticeKindOf, type NoticeRecord } from "@/lib/design-sheet-notice";

export const NOTICE_COLS = "id, sheet_id, kind, title, images, img_cols, calc, note, show, created_by_name, created_at, updated_at";

/** แถวในตาราง → ใบแจ้ง (ตรวจค่าทุกครั้ง เผื่อข้อมูลเก่า/ผิดรูป) */
export function noticeFromRow(r: Record<string, unknown>): NoticeRecord {
  const cols = Number(r.img_cols);
  return {
    id: String(r.id), sheet_id: String(r.sheet_id), kind: noticeKindOf(r.kind),
    title: String(r.title ?? ""), images: cleanNoticeImages(r.images),
    img_cols: cols >= 1 && cols <= 4 ? cols : 2,
    calc: cleanNoticeCalc(r.calc), note: String(r.note ?? ""), display: cleanNoticeDisplay(r.show),
    created_by_name: (r.created_by_name as string | null) ?? null,
    created_at: String(r.created_at ?? ""), updated_at: String(r.updated_at ?? ""),
  };
}

/** ใครทำ — ชื่อจากโปรไฟล์ หาไม่ได้ใช้อีเมล (เหมือน print-logs) */
export async function noticeActor(request: NextRequest, admin: ReturnType<typeof supabaseAdmin>) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return { id: null as string | null, name: null as string | null, email: null as string | null };
  const { data: p } = await admin.from("user_profiles").select("display_name, email").eq("id", user.id).maybeSingle();
  const prof = p as { display_name: string | null; email: string | null } | null;
  return { id: user.id, name: prof?.display_name?.trim() || prof?.email || user.email || null, email: user.email ?? null };
}
