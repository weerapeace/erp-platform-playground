/**
 * /api/dashboard/dept-items?dept=production|purchasing|sales|qc|design|tasks
 * รายการ "ที่ต้องจัดการ" ต่อแผนก (สำหรับ Popup กดจากการ์ดผู้บริหาร)
 *
 * GET → RPC erp_admin_dept_items(p_dept) → [{ key, label, link, items:[{title,subtitle,link}] }]
 * gate admin.users (user JWT) แล้วเรียก RPC ผ่าน service-role (RPC จำกัดให้ service_role เท่านั้น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DeptItem = { title: string; subtitle: string; link: string };
export type DeptItemGroup = { key: string; label: string; link: string; items: DeptItem[] };
export type DeptItemsResponse = { data: DeptItemGroup[]; error: string | null };

const VALID = ["production", "purchasing", "sales", "qc", "design", "tasks"];

export async function GET(request: NextRequest) {
  const supabase = supabaseFromRequest(request);
  const { data: allowed, error: canErr } = await supabase.rpc("erp_can", { p_permission: "admin.users" });
  if (canErr) return NextResponse.json({ data: [], error: canErr.message }, { status: 500 });
  if (allowed !== true) return NextResponse.json({ data: [], error: "ไม่มีสิทธิ์" }, { status: 403 });

  const dept = new URL(request.url).searchParams.get("dept") ?? "";
  if (!VALID.includes(dept)) return NextResponse.json({ data: [], error: "แผนกไม่ถูกต้อง" }, { status: 400 });

  const { data, error } = await supabaseAdmin().rpc("erp_admin_dept_items", { p_dept: dept });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json(
    { data: (data ?? []) as DeptItemGroup[], error: null },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
