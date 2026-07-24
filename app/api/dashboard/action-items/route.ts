/**
 * GET /api/dashboard/action-items — "งานที่ต้องจัดการ/อนุมัติ" รวมทุก module (สำหรับแท็บรายการ)
 * รวมผลจาก RPC erp_admin_dept_items ของทุกแผนก (ยิงพร้อมกัน) → จัดกลุ่มตามระบบ
 * gate admin.users (RPC จำกัด service_role) — เหมือน /api/dashboard/dept-items
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { DeptItemGroup } from "@/app/api/dashboard/dept-items/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEPTS = [
  { dept: "purchasing", label: "จัดซื้อ", icon: "🛒" },
  { dept: "production", label: "ผลิต", icon: "🏭" },
  { dept: "tasks", label: "จัดการงาน / ออกแบบ", icon: "🗂️" },
  { dept: "qc", label: "QC", icon: "✅" },
  { dept: "design", label: "ออกแบบ", icon: "🎨" },
  { dept: "sales", label: "ขาย", icon: "💰" },
];

export type ActionModule = { dept: string; label: string; icon: string; total: number; groups: DeptItemGroup[] };
export type ActionItemsResponse = { modules: ActionModule[]; error: string | null };

export async function GET(request: NextRequest) {
  const supabase = supabaseFromRequest(request);
  const { data: allowed, error: canErr } = await supabase.rpc("erp_can", { p_permission: "admin.users" });
  if (canErr) return NextResponse.json({ modules: [], error: canErr.message }, { status: 500 });
  if (allowed !== true) return NextResponse.json({ modules: [], error: "ไม่มีสิทธิ์" }, { status: 403 });

  const admin = supabaseAdmin();
  const results = await Promise.all(DEPTS.map(async (d) => {
    const { data } = await admin.rpc("erp_admin_dept_items", { p_dept: d.dept });
    const groups = ((data ?? []) as DeptItemGroup[]).filter((g) => (g.items?.length ?? 0) > 0);
    const total = groups.reduce((s, g) => s + (g.items?.length ?? 0), 0);
    return { ...d, total, groups };
  }));
  const modules = results.filter((m) => m.total > 0);
  return NextResponse.json(
    { modules, error: null },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
