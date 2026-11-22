/**
 * หน้า "จัดการ LINE" (/admin/line) — ข้อมูลภาพรวมที่ API เดิมไม่มี · เจ้าของเลือกแบบ A + ข้อ 1-5 (2026-11-22)
 * GET → { so_missing_due, company_qr_used, admins_linked, history[] }
 *   so_missing_due  ใบสั่งขายยืนยันแล้วที่ยังไม่ใส่วันนัดส่ง (ทางลัด)
 *   company_qr_used มีคนสแกน QR ไลน์บริษัทผ่านหน้าเล็กสำเร็จแล้วไหม (= ตั้งค่า LINE Developers แล้ว · เช็กลิสต์ขั้น 3)
 *   history         ประวัติเรื่อง LINE 60 รายการล่าสุด (audit_logs · กติกา lib/line-history)
 * ตัวเลขผูกไลน์/บอท/โควตา อ่านจาก /api/admin/line-company + /api/admin/line-console เดิม (ไม่ทำซ้ำ)
 * สิทธิ์: admin.users
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { LINE_HISTORY_ACTIONS, LINE_HISTORY_ENTITY_TYPES, describeLineHistory, isLineHistoryRow, type LineHistoryRow } from "@/lib/line-history";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const t = (v: unknown) => String(v ?? "").trim();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const admin = supabaseAdmin();
  const actions = LINE_HISTORY_ACTIONS.map((a) => `"${a}"`).join(",");
  const [so, phone, cus, admins, logs] = await Promise.all([
    admin.from("so_orders").select("id", { count: "exact", head: true }).eq("status", "confirmed").is("due_date", null).is("merged_into_id", null),
    admin.from("line_memberships").select("id", { count: "exact", head: true }).eq("link_method", "phone"),
    admin.from("line_customer_links").select("id", { count: "exact", head: true }).in("linked_via", ["shop_qr", "customer_qr"]),
    admin.from("user_profiles").select("id", { count: "exact", head: true }).not("line_user_id", "is", null).eq("active", true),
    admin.from("audit_logs").select("id,action,entity_type,created_at,metadata")
      .or(`entity_type.in.(${LINE_HISTORY_ENTITY_TYPES.join(",")}),action.in.(${actions})`)
      .order("created_at", { ascending: false }).limit(150),
  ]);
  if (logs.error) return NextResponse.json({ error: "โหลดประวัติไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const history = ((logs.data ?? []) as Row[])
    .filter((r) => isLineHistoryRow(t(r.action), t(r.entity_type)))
    .slice(0, 60)
    .map((r) => describeLineHistory({
      id: t(r.id), action: t(r.action), entity_type: t(r.entity_type), created_at: t(r.created_at),
      actor: null, metadata: (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as Record<string, unknown>,
    } as LineHistoryRow));
  return NextResponse.json({
    so_missing_due: so.count ?? 0,
    company_qr_used: (phone.count ?? 0) + (cus.count ?? 0) > 0,
    admins_linked: admins.count ?? 0,
    history,
    error: null,
  });
}
