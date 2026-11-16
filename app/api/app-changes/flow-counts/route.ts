/**
 * /api/app-changes/flow-counts — จำนวนงานแก้ค้าง (open/in_progress) ต่อกล่อง/เส้นในแผนผังการทำงาน
 * GET → { counts: { "n:qt": 2, "e:S2": 1 } } · หน้าแผนผังใช้วาดป้าย "แก้ค้าง N" → ลิงก์ /admin/app-changes?flow=n:qt
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { FlowRef } from "@/lib/app-change";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "report.create");
  if (guard) return guard;
  const { data, error } = await supabaseAdmin().from("issue_reports").select("flow_refs")
    .in("status", ["open", "in_progress"]).not("page_path", "is", null).limit(1000);
  if (error) return NextResponse.json({ counts: {}, error: "โหลดงานแก้ไม่สำเร็จ" }, { status: 500 });
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as { flow_refs: FlowRef[] | null }[]) {
    for (const f of r.flow_refs ?? []) { const k = `${f.kind}:${f.ref}`; counts[k] = (counts[k] ?? 0) + 1; }
  }
  return NextResponse.json({ counts }, { headers: { "Cache-Control": "private, max-age=30" } });
}
