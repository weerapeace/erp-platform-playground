/**
 * สร้างงานเหมาย้อนกลับจากใบสั่งซื้อ — /api/piecework/from-po
 * POST { job_name, rate?, is_detail?, note?, product_sku? }
 *   1) หา/สร้างงานในทะเบียนกลาง piecework_jobs (+ ประวัติราคา)
 *   2) ถ้าระบุ product_sku → ผูกเข้า BOM ที่ใช้งานของสินค้านั้น (เพิ่มแถว bom_piecework_lines)
 * ของกลาง: guardApi(production.piecework) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown, d = 0) => { const n = Number(v); return isFinite(n) ? n : d; };

type Body = { job_name?: string; rate?: unknown; is_detail?: boolean; note?: string; product_sku?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "production.piecework"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: Body; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (b.job_name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องระบุชื่องาน" }, { status: 400 });
  const rate = num(b.rate);
  const sku = (b.product_sku ?? "").trim();

  const admin = supabaseAdmin();

  // 1) หา/สร้างงานในทะเบียนกลาง (ชื่อซ้ำ = ใช้ตัวเดิม)
  const { data: existing } = await admin.from("piecework_jobs").select("id, default_rate").eq("is_active", true).ilike("name", name).limit(1).maybeSingle();
  let jobId: string;
  if (existing) {
    jobId = String((existing as { id: string }).id);
  } else {
    const { data: maxRow } = await admin.from("piecework_jobs").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const nextOrder = (num((maxRow as { sort_order?: number } | null)?.sort_order) || 0) + 1;
    const { data: ins, error: insErr } = await admin.from("piecework_jobs").insert({
      name, default_rate: rate, is_detail: !!b.is_detail, note: (b.note ?? "").trim() || null, sort_order: nextOrder,
    }).select("id").single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    jobId = String((ins as { id: string }).id);
    if (rate > 0) await admin.from("piecework_rate_history").insert({ job_id: jobId, rate, note: "สร้างจากใบสั่งซื้อ", created_by: user?.id ?? null }).then(() => {}, () => {});
  }

  // 2) ผูกเข้า BOM ของสินค้า (ถ้าระบุ SKU)
  let attached = false; let bomCode: string | null = null; let warn: string | null = null;
  if (sku) {
    const { data: bom } = await admin.from("bom_headers").select("bom_code").eq("product_sku", sku).eq("is_active", true)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    bomCode = (bom as { bom_code?: string } | null)?.bom_code ?? null;
    if (!bomCode) { warn = `ไม่พบ BOM ที่ใช้งานของสินค้า ${sku} — สร้างงานในทะเบียนแล้ว แต่ยังไม่ได้ผูกเข้า BOM`; }
    else {
      // กันซ้ำ: ถ้างานนี้อยู่ใน BOM แล้ว ไม่เพิ่มซ้ำ
      const { data: dup } = await admin.from("bom_piecework_lines").select("id").eq("bom_code", bomCode).eq("job_id", jobId).eq("is_active", true).limit(1).maybeSingle();
      if (dup) { attached = true; }
      else {
        const { data: maxSeq } = await admin.from("bom_piecework_lines").select("sequence").eq("bom_code", bomCode).order("sequence", { ascending: false }).limit(1).maybeSingle();
        const seq = (num((maxSeq as { sequence?: number } | null)?.sequence) || 0) + 1;
        const { error: bErr } = await admin.from("bom_piecework_lines").insert({
          bom_code: bomCode, job_id: jobId, job_name: name, rate, is_detail: !!b.is_detail, note: (b.note ?? "").trim() || null, qty_per: 1, sequence: seq, is_active: true,
        });
        if (bErr) return NextResponse.json({ error: bErr.message }, { status: 400 });
        attached = true;
      }
    }
  }

  await writeAudit(admin, { action: "create", entityType: "piecework_from_po", entityId: jobId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name, rate, product_sku: sku || null, bom_code: bomCode, attached } });
  return NextResponse.json({ job_id: jobId, bom_code: bomCode, attached, warn, error: null });
}
