/**
 * /api/parent-skus/[id]/creative-items — รายการ "งาน + คอนเทนต์" ของ Parent SKU
 * ใช้ในป๊อปอัปการ์ด "คอนเทนต์/งาน" (แท็บภาพรวม 360°) — ไม่ต้องเปิดหน้า Tasks
 * งาน = erp_creative_tasks (parent_sku_id ตรง + ผูกผ่าน erp_creative_task_parent_skus)
 * คอนเทนต์ = erp_creative_content (parent_sku_id ตรง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CreativeTaskItem = { id: string; title: string; status: string | null; task_type: string | null; due_date: string | null };
export type CreativeContentItem = { id: string; title: string | null; status: string | null; post_type: string | null };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const a = supabaseAdmin();

  // งาน: รวม id จากที่ผูกตรง + ผ่านตารางเชื่อม แล้วดึงรายละเอียดครั้งเดียว
  const [{ data: direct }, { data: links }] = await Promise.all([
    a.from("erp_creative_tasks").select("id").eq("parent_sku_id", id),
    a.from("erp_creative_task_parent_skus").select("task_id").eq("parent_sku_id", id),
  ]);
  const taskIds = [...new Set([
    ...((direct ?? []) as { id: string }[]).map((d) => d.id),
    ...((links ?? []) as { task_id: string }[]).map((l) => l.task_id),
  ].filter(Boolean))];

  const [tasksRes, contentRes] = await Promise.all([
    taskIds.length
      ? a.from("erp_creative_tasks").select("id, title, status, task_type, due_date").in("id", taskIds).order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [] as CreativeTaskItem[] }),
    a.from("erp_creative_content").select("id, title, status, post_type").eq("parent_sku_id", id).order("created_at", { ascending: false }).limit(100),
  ]);

  return NextResponse.json({
    tasks: (tasksRes.data ?? []) as CreativeTaskItem[],
    content: (contentRes.data ?? []) as CreativeContentItem[],
    error: null,
  });
}
