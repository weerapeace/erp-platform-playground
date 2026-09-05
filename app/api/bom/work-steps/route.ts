/**
 * ขั้นตอนงาน (Work Steps) ของสูตรผลิต — /api/bom/work-steps
 *   GET ?mo_id= | ?bom_code= | ?product_sku=  → ขั้นตอนเรียงลำดับ (+ชื่อ/ราคางานเหมาที่ผูก)
 *   PUT { bom_code, steps:[{ step_name, instruction?, piecework_job_id?, station? }] } → เขียนทับทั้งชุด (เหมือน /api/bom/piecework)
 *
 * ขั้นตอนเก็บที่ "สูตร BOM" (ของสินค้า) ไม่ใช่ต่อใบสั่งผลิต — แก้ครั้งเดียวใช้ทุกใบ
 * ผูกงานเหมาได้ผ่าน piecework_job_id (ทะเบียน piecework_jobs) → หน้าจอโชว์ราคา/จำนวนจากแท็บ 🧵 ให้
 * สิทธิ์: อ่าน products.view · เขียน products.edit · เขียน audit ทุกครั้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type WorkStep = {
  id: string; bom_code: string; sequence: number;
  step_name: string; instruction: string | null; station: string | null;
  piecework_job_id: string | null; job_name: string | null; job_rate: number | null;
};

type Admin = ReturnType<typeof supabaseAdmin>;

/** หา bom_code จากใบสั่งผลิต / รหัสสินค้า (สูตรที่ใช้งานอยู่ตัวล่าสุด) */
async function resolveBomCode(admin: Admin, q: { mo_id?: string | null; bom_code?: string | null; product_sku?: string | null }): Promise<string | null> {
  if (q.bom_code) return q.bom_code;
  let sku = q.product_sku ?? null;
  if (q.mo_id) {
    const { data: mo } = await admin.from("manufacturing_orders").select("bom_code, product_sku").eq("id", q.mo_id).maybeSingle();
    const m = mo as { bom_code: string | null; product_sku: string | null } | null;
    if (m?.bom_code) return m.bom_code;
    sku = sku ?? m?.product_sku ?? null;
  }
  if (!sku) return null;
  const { data } = await admin.from("bom_headers").select("bom_code, updated_at").eq("product_sku", sku).eq("is_active", true)
    .order("updated_at", { ascending: false }).limit(1);
  return ((data ?? [])[0] as { bom_code: string | null } | undefined)?.bom_code ?? null;
}

async function listSteps(admin: Admin, bomCode: string): Promise<WorkStep[]> {
  const { data } = await admin.from("bom_work_steps")
    .select("id, bom_code, sequence, step_name, instruction, station, piecework_job_id")
    .eq("bom_code", bomCode).eq("is_active", true).order("sequence", { ascending: true });
  const rows = (data ?? []) as Record<string, unknown>[];
  const jobIds = [...new Set(rows.map((r) => r.piecework_job_id as string | null).filter(Boolean))] as string[];
  const jobOf = new Map<string, { name: string; rate: number }>();
  if (jobIds.length) {
    const { data: jobs } = await admin.from("piecework_jobs").select("id, name, default_rate").in("id", jobIds);
    for (const j of (jobs ?? []) as { id: string; name: string; default_rate: number | null }[]) jobOf.set(j.id, { name: j.name, rate: Number(j.default_rate) || 0 });
  }
  return rows.map((r) => {
    const jid = (r.piecework_job_id as string) ?? null;
    return {
      id: String(r.id), bom_code: String(r.bom_code), sequence: Number(r.sequence) || 0,
      step_name: String(r.step_name ?? ""), instruction: (r.instruction as string) ?? null, station: (r.station as string) ?? null,
      piecework_job_id: jid, job_name: jid ? (jobOf.get(jid)?.name ?? null) : null, job_rate: jid ? (jobOf.get(jid)?.rate ?? null) : null,
    };
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  const bomCode = await resolveBomCode(admin, { mo_id: sp.get("mo_id"), bom_code: sp.get("bom_code"), product_sku: sp.get("product_sku") });
  if (!bomCode) return NextResponse.json({ data: [], bom_code: null, error: null });
  return NextResponse.json({ data: await listSteps(admin, bomCode), bom_code: bomCode, error: null });
}

type PutBody = {
  bom_code?: string;
  steps?: { step_name?: string; instruction?: string | null; piecework_job_id?: string | null; station?: string | null }[];
};

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: PutBody;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const bomCode = (b.bom_code ?? "").trim();
  if (!bomCode) return NextResponse.json({ error: "ต้องระบุรหัสสูตร (bom_code)" }, { status: 400 });
  const steps = (b.steps ?? []).map((s) => ({
    step_name: (s.step_name ?? "").trim(), instruction: (s.instruction ?? "")?.trim() || null,
    piecework_job_id: s.piecework_job_id || null, station: (s.station ?? "")?.trim() || null,
  })).filter((s) => s.step_name);

  const admin = supabaseAdmin();
  // เขียนทับทั้งชุด (soft: ปิดของเก่า แล้วใส่ชุดใหม่) — ลำดับ = ลำดับในอาร์เรย์
  const { error: offErr } = await admin.from("bom_work_steps").update({ is_active: false, updated_at: new Date().toISOString() }).eq("bom_code", bomCode).eq("is_active", true);
  if (offErr) return NextResponse.json({ error: offErr.message }, { status: 400 });
  if (steps.length) {
    const { error } = await admin.from("bom_work_steps").insert(steps.map((s, i) => ({ bom_code: bomCode, sequence: i + 1, ...s, is_active: true })));
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await writeAudit(admin, { action: "bom.work_steps.update", entityType: "bom", entityId: bomCode,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { steps: steps.length, names: steps.map((s) => s.step_name) } });
  return NextResponse.json({ data: await listSteps(admin, bomCode), bom_code: bomCode, error: null });
}
