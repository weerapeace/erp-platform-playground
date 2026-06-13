/**
 * งานเหมารายชิ้นในแต่ละ BOM (bom_piecework_lines) — /api/bom/piecework
 * GET ?bom_code=  → list งานเหมาของสูตรนั้น (เรียง sequence)
 * PUT { bom_code, lines:[...] } → แทนที่ทั้งชุด (ลบของเดิม + ใส่ใหม่)
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type BomPieceworkLine = {
  id: string; job_id: string | null; job_name: string; rate: number;
  note: string | null; is_detail: boolean; qty_per: number; sequence: number;
};

const num = (v: unknown, d = 0) => { const n = Number(v); return isFinite(n) ? n : d; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const bomCode = (new URL(request.url).searchParams.get("bom_code") ?? "").trim();
  if (!bomCode) return NextResponse.json({ data: [], error: null });
  const { data, error } = await supabaseAdmin()
    .from("bom_piecework_lines").select("id, job_id, job_name, rate, note, is_detail, qty_per, sequence")
    .eq("bom_code", bomCode).eq("is_active", true).order("sequence", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const out: BomPieceworkLine[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id), job_id: (r.job_id as string) ?? null, job_name: String(r.job_name ?? ""), rate: num(r.rate),
    note: (r.note as string) ?? null, is_detail: !!r.is_detail, qty_per: num(r.qty_per, 1), sequence: num(r.sequence),
  }));
  return NextResponse.json({ data: out, error: null });
}

type PutBody = { bom_code?: string; lines?: Array<{ job_id?: string | null; job_name?: string; rate?: unknown; note?: string | null; is_detail?: boolean; qty_per?: unknown }> };

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: PutBody; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const bomCode = (b.bom_code ?? "").trim();
  if (!bomCode) return NextResponse.json({ error: "ต้องระบุ bom_code" }, { status: 400 });

  const admin = supabaseAdmin();
  // แทนที่ทั้งชุด: ลบของเดิมของสูตรนี้ก่อน
  const { error: delErr } = await admin.from("bom_piecework_lines").delete().eq("bom_code", bomCode);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  const rows = (b.lines ?? [])
    .filter((l) => (l.job_name ?? "").trim())
    .map((l, i) => ({
      bom_code: bomCode, job_id: l.job_id ?? null, job_name: (l.job_name ?? "").trim(),
      rate: num(l.rate), note: (l.note ?? "")?.toString().trim() || null, is_detail: !!l.is_detail,
      qty_per: num(l.qty_per, 1), sequence: i + 1, is_active: true,
    }));
  if (rows.length > 0) {
    const { error: insErr } = await admin.from("bom_piecework_lines").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
  }
  await writeAudit(admin, { action: "update", entityType: "bom_piecework", entityId: bomCode, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { bom_code: bomCode, count: rows.length } });
  return NextResponse.json({ data: { count: rows.length }, error: null });
}
