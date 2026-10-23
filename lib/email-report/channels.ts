/**
 * 🔌 สวิตช์ช่องทางรายงานทั้งระบบ (ฝั่งเซิร์ฟเวอร์) — ตาราง erp_report_channels แถวเดียว
 * ใช้ตอนส่งจริง (send.ts) · ป๊อปตอนเข้า ERP (popup.ts) · หน้าตั้งค่า (GET/PATCH /api/admin/email-reports[/channels])
 * อ่านไม่ได้ (เช่นยังไม่ได้รัน migration) = ถือว่าเปิดทุกช่อง (หน้าตาเดิม)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeReportChannels, type ReportChannels } from "@/lib/email-report/shared";

type Admin = ReturnType<typeof supabaseAdmin>;

export async function loadReportChannels(admin: Admin): Promise<ReportChannels & { updated_at: string | null; updated_by: string | null }> {
  const { data } = await admin.from("erp_report_channels").select("email, discord, popup, updated_at, updated_by").eq("id", 1).maybeSingle();
  const d = (data ?? {}) as { updated_at?: string | null; updated_by?: string | null };
  return { ...normalizeReportChannels(data), updated_at: d.updated_at ?? null, updated_by: d.updated_by ?? null };
}
