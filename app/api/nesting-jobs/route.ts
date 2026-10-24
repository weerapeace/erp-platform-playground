/**
 * /api/nesting-jobs — งานจัดเรียงงานพิมพ์ (ตาราง erp_nesting_jobs · ดู shared.ts)
 *   GET  ?search=&status=  → รายการงาน (ล่าสุดก่อน) — nesting.view
 *   POST { name, print_type_id?, settings, items, result?, status? } → สร้างงาน — nesting.run
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  SELECT, actorOf, cleanItems, cleanName, cleanResult, cleanSettings, cleanStatus, cleanUuid, toJob,
} from "./shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const admin = supabaseAdmin();
  let q = admin.from("erp_nesting_jobs").select(SELECT).eq("is_active", true).order("updated_at", { ascending: false }).limit(500);
  const status = cleanStatus(sp.get("status"));
  if (status) q = q.eq("status", status);
  const search = (sp.get("search") ?? "").trim().replace(/[%,()]/g, " ");
  if (search) q = q.ilike("name", `%${search}%`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map((r) => toJob(r as Record<string, unknown>)), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.run"); if (denied) return denied;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = cleanName(b.name);
  if (!name) return NextResponse.json({ error: "ใส่ชื่องานก่อนบันทึก" }, { status: 400 });
  const settings = cleanSettings(b.settings ?? {});
  const items = cleanItems(b.items ?? []);
  if (!settings || !items) return NextResponse.json({ error: "ข้อมูลงานไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  const actor = await actorOf(request, admin);
  const { data, error } = await admin.from("erp_nesting_jobs").insert({
    name, settings, items,
    status: cleanStatus(b.status) ?? "draft",
    print_type_id: cleanUuid(b.print_type_id),
    result: b.result ? cleanResult(b.result) : null,
    created_by: actor.id, created_by_name: actor.name, updated_by: actor.id, updated_by_name: actor.name,
  }).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const job = toJob(data as Record<string, unknown>);
  await writeAuditFor(request, admin, { action: "create", entityType: "erp_nesting_jobs", entityId: job.id,
    metadata: { name, items: items.length } });
  return NextResponse.json({ data: job, error: null });
}
