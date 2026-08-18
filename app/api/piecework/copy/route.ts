/**
 * คัดลอกงานเหมาจากสินค้าตัวอื่น — /api/piecework/copy
 *
 * GET ?sku=CODE        → งานเหมาใน BOM ที่ใช้งานของสินค้านั้น (ไว้ดูก่อนคัดลอก)
 * GET ?siblings=CODE   → รุ่นเดียวกัน (Parent SKU เดียวกัน) + บอกว่าตัวไหนมีงานเหมากี่รายการ
 * POST { from_sku, to_sku, job_names?: string[], all_siblings?: boolean, mode?: "add" | "replace" }
 *      → คัดลอกเข้า BOM ของ to_sku (all_siblings = ใส่ให้ทุกตัวที่ Parent SKU เดียวกันด้วย)
 *        mode=replace = ล้างงานเหมาเดิมของปลายทางก่อน · ค่าเริ่มต้น add = เพิ่มเฉพาะที่ยังไม่มี
 *
 * ของกลาง: guardApi (GET=products.view, POST=production.piecework) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown, d = 0) => { const n = Number(v); return isFinite(n) ? n : d; };

type Admin = ReturnType<typeof supabaseAdmin>;

/** BOM ที่ใช้งานล่าสุดของสินค้า */
async function bomOf(admin: Admin, sku: string): Promise<string | null> {
  const { data } = await admin.from("bom_headers").select("bom_code").eq("product_sku", sku)
    .eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return (data as { bom_code?: string } | null)?.bom_code ?? null;
}

/** รหัสสินค้าทุกตัวที่อยู่ใต้ Parent SKU เดียวกัน (รวมตัวเอง) */
async function siblingsOf(admin: Admin, sku: string): Promise<{ parent_id: string | null; codes: string[] }> {
  const { data: me } = await admin.from("skus_v2").select("parent_sku_id").eq("code", sku).maybeSingle();
  const parentId = (me as { parent_sku_id?: string } | null)?.parent_sku_id ?? null;
  if (!parentId) return { parent_id: null, codes: [sku] };
  const { data } = await admin.from("skus_v2").select("code").eq("parent_sku_id", parentId).limit(500);
  const codes = (data ?? []).map((r) => String((r as { code: string }).code));
  return { parent_id: parentId, codes: codes.length ? codes : [sku] };
}

async function linesOf(admin: Admin, bomCode: string) {
  const { data } = await admin.from("bom_piecework_lines")
    .select("id, job_id, job_name, rate, qty_per, is_detail, note, sequence")
    .eq("bom_code", bomCode).eq("is_active", true).order("sequence", { ascending: true });
  return (data ?? []) as Record<string, unknown>[];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = request.nextUrl.searchParams;

  const sib = sp.get("siblings");
  if (sib) {
    const { codes } = await siblingsOf(admin, sib);
    const others = codes.filter((c) => c !== sib);
    if (!others.length) return NextResponse.json({ data: [], error: null });
    const { data: boms } = await admin.from("bom_headers").select("bom_code, product_sku")
      .in("product_sku", others).eq("is_active", true);
    const bomBySku = new Map<string, string>();
    for (const b of (boms ?? []) as Record<string, unknown>[]) bomBySku.set(String(b.product_sku), String(b.bom_code));
    const bomCodes = [...new Set(bomBySku.values())];
    const { data: lines } = bomCodes.length
      ? await admin.from("bom_piecework_lines").select("bom_code").in("bom_code", bomCodes).eq("is_active", true)
      : { data: [] as Record<string, unknown>[] };
    const cnt = new Map<string, number>();
    for (const l of (lines ?? []) as Record<string, unknown>[]) cnt.set(String(l.bom_code), (cnt.get(String(l.bom_code)) ?? 0) + 1);
    const data = others.map((code) => {
      const bc = bomBySku.get(code) ?? null;
      return { code, bom_code: bc, piece_count: bc ? (cnt.get(bc) ?? 0) : 0 };
    }).sort((a, b) => b.piece_count - a.piece_count || a.code.localeCompare(b.code));
    return NextResponse.json({ data, error: null });
  }

  const sku = sp.get("sku");
  if (!sku) return NextResponse.json({ error: "ต้องระบุ sku" }, { status: 400 });
  const bomCode = await bomOf(admin, sku);
  if (!bomCode) return NextResponse.json({ bom_code: null, data: [], error: null });
  return NextResponse.json({ bom_code: bomCode, data: await linesOf(admin, bomCode), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "production.piecework"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { from_sku?: string; to_sku?: string; job_names?: string[]; all_siblings?: boolean; mode?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const from = (b.from_sku ?? "").trim(), to = (b.to_sku ?? "").trim();
  if (!from || !to) return NextResponse.json({ error: "ต้องระบุสินค้าต้นทางและปลายทาง" }, { status: 400 });
  if (from === to && !b.all_siblings) return NextResponse.json({ error: "ต้นทางกับปลายทางเป็นตัวเดียวกัน" }, { status: 400 });

  const admin = supabaseAdmin();
  const srcBom = await bomOf(admin, from);
  if (!srcBom) return NextResponse.json({ error: `ไม่พบ BOM ที่ใช้งานของ ${from}` }, { status: 404 });
  let src = await linesOf(admin, srcBom);
  if (Array.isArray(b.job_names) && b.job_names.length) {
    const keep = new Set(b.job_names.map((n) => String(n).trim()));
    src = src.filter((l) => keep.has(String(l.job_name).trim()));
  }
  if (!src.length) return NextResponse.json({ error: "สินค้าต้นทางไม่มีงานเหมาให้คัดลอก" }, { status: 400 });

  const targets = b.all_siblings ? (await siblingsOf(admin, to)).codes : [to];
  const replace = b.mode === "replace";
  const report: { sku: string; added: number; skipped: number; warn?: string }[] = [];

  for (const t of targets) {
    if (t === from) { report.push({ sku: t, added: 0, skipped: 0, warn: "ตัวต้นทางเอง" }); continue; }
    const bomCode = await bomOf(admin, t);
    if (!bomCode) { report.push({ sku: t, added: 0, skipped: 0, warn: "ไม่มี BOM ที่ใช้งาน" }); continue; }

    if (replace) await admin.from("bom_piecework_lines").update({ is_active: false }).eq("bom_code", bomCode);

    const cur = await linesOf(admin, bomCode);
    const have = new Set(cur.map((l) => String(l.job_name).trim().toLowerCase()));
    let seq = cur.reduce((m, l) => Math.max(m, num(l.sequence)), 0);
    const rows = src.filter((l) => !have.has(String(l.job_name).trim().toLowerCase())).map((l) => ({
      bom_code: bomCode, job_id: l.job_id ?? null, job_name: l.job_name, rate: num(l.rate),
      qty_per: num(l.qty_per, 1) || 1, is_detail: !!l.is_detail, note: (l.note as string) ?? null,
      sequence: ++seq, is_active: true,
    }));
    if (rows.length) {
      const { error } = await admin.from("bom_piecework_lines").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    report.push({ sku: t, added: rows.length, skipped: src.length - rows.length });
  }

  const added = report.reduce((n, r) => n + r.added, 0);
  await writeAudit(admin, {
    action: "create", entityType: "bom_piecework_copy", entityId: to,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { from_sku: from, to_sku: to, all_siblings: !!b.all_siblings, mode: replace ? "replace" : "add", jobs: src.length, added, targets: targets.length },
  });
  return NextResponse.json({ ok: true, added, targets: targets.length, report, error: null });
}
