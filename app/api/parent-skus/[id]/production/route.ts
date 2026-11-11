/**
 * /api/parent-skus/[id]/production — ข้อมูลแท็บ "🏭 ผลิต" ของ Parent SKU (components/parent-production-tab)
 *   • SKU ลูก (สี · รูป) — สูตรผลิตผูกกับ SKU ลูก ไม่ใช่ Parent
 *   • สูตร (bom_headers) ทุกเวอร์ชันของ SKU ลูก + บรรทัดวัตถุดิบ (bom_lines + รูปวัตถุดิบ) + งานเหมา (bom_piecework_lines) + ค่าแรง (bom_labor_rates)
 *   • ประวัติการผลิต: ใบสั่งผลิตของ SKU ลูก (ล่าสุด 100 ใบ) + จ่ายแล้ว/รับคืน/ใครทำ จากใบจ่ายงาน (mo_work_orders)
 * อ่านอย่างเดียว · guardApi products.view · กฎรวม/เรียง = lib/parent-production
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { summarizeWorkOrders, type WorkOrderLite } from "@/lib/parent-production";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const a = supabaseAdmin();

  const { data: skuData, error: skuErr } = await a.from("skus_v2")
    .select("id, code, name_th, color, color_th, cover_image_r2_key, is_active").eq("parent_sku_id", id).order("code");
  if (skuErr) return NextResponse.json({ error: "โหลด SKU ลูกไม่สำเร็จ" }, { status: 500 });
  const skus = (skuData ?? []) as Row[];
  const codes = skus.map((s) => String(s.code)).filter(Boolean);
  if (codes.length === 0) return NextResponse.json({ skus: [], boms: [], mos: [], error: null });

  // สูตร + ใบสั่งผลิต (ขนานกัน)
  const [{ data: bomData }, { data: moData }] = await Promise.all([
    a.from("bom_headers").select("id, bom_code, product_sku, product_name, version, status, is_default, note, effective_from, updated_at, is_active")
      .in("product_sku", codes).not("is_active", "is", false),
    a.from("manufacturing_orders").select("id, mo_no, product_sku, qty, status, is_active, order_date, created_at, due_date, finished_received_at, bom_version")
      .in("product_sku", codes).order("created_at", { ascending: false }).limit(100),
  ]);
  const boms = (bomData ?? []) as Row[];
  const mos = (moData ?? []) as Row[];
  const bomCodes = boms.map((b) => String(b.bom_code)).filter(Boolean);
  const moNos = mos.map((m) => String(m.mo_no)).filter(Boolean);

  // บรรทัดสูตร/งานเหมา/ค่าแรง ทีละ 20 สูตร (กันชนเพดาน 1,000 แถวต่อครั้ง) · ใบจ่ายงานทีละ 50 ใบสั่งผลิต
  const [lineParts, pieceParts, laborParts, woParts] = await Promise.all([
    Promise.all(chunk(bomCodes, 20).map((cs) => a.from("bom_lines")
      .select("bom_code, component_sku, component_name, qty, uom, waste_percent, slot_code, sequence, material_type")
      .in("bom_code", cs).not("is_active", "is", false).order("sequence"))),
    Promise.all(chunk(bomCodes, 20).map((cs) => a.from("bom_piecework_lines")
      .select("bom_code, job_name, rate, qty_per, sequence").in("bom_code", cs).not("is_active", "is", false).order("sequence"))),
    Promise.all(chunk(bomCodes, 20).map((cs) => a.from("bom_labor_rates")
      .select("bom_code, craftsman_name, rate, is_current").in("bom_code", cs).not("is_active", "is", false))),
    Promise.all(chunk(moNos, 50).map((ns) => a.from("mo_work_orders")
      .select("mo_no, status, qty, received_qty, assignee_name, department_name, assignees").in("mo_no", ns).not("is_active", "is", false))),
  ]);
  const lines = lineParts.flatMap((r) => (r.data ?? []) as Row[]);
  const pieces = pieceParts.flatMap((r) => (r.data ?? []) as Row[]);
  const labors = laborParts.flatMap((r) => (r.data ?? []) as Row[]);
  const wos = woParts.flatMap((r) => (r.data ?? []) as Row[]);

  // รูปวัตถุดิบ (รหัสวัตถุดิบ = skus_v2.code)
  const compCodes = [...new Set(lines.map((l) => String(l.component_sku ?? "")).filter(Boolean))];
  const compImg = new Map<string, string | null>();
  const compParts = await Promise.all(chunk(compCodes, 100).map((cs) => a.from("skus_v2").select("code, cover_image_r2_key").in("code", cs)));
  for (const r of compParts.flatMap((p) => (p.data ?? []) as Row[])) compImg.set(String(r.code), (r.cover_image_r2_key as string) ?? null);

  const byBom = <T extends Row>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) { const k = String(r.bom_code); m.set(k, [...(m.get(k) ?? []), r]); }
    return m;
  };
  const linesBy = byBom(lines); const piecesBy = byBom(pieces); const laborBy = byBom(labors);
  const woBy = new Map<string, WorkOrderLite[]>();
  for (const w of wos) { const k = String(w.mo_no); woBy.set(k, [...(woBy.get(k) ?? []), w as unknown as WorkOrderLite]); }

  return NextResponse.json({
    skus: skus.map((s) => ({
      id: s.id, code: s.code, name: s.name_th ?? null, color: (s.color_th as string) || (s.color as string) || null,
      image_key: s.cover_image_r2_key ?? null, is_active: s.is_active !== false,
    })),
    boms: boms.map((b) => ({
      id: b.id, bom_code: b.bom_code, product_sku: b.product_sku, product_name: b.product_name, version: b.version,
      status: b.status, is_default: !!b.is_default, note: b.note ?? null, effective_from: b.effective_from ?? null, updated_at: b.updated_at ?? null,
      lines: (linesBy.get(String(b.bom_code)) ?? []).map((l) => ({
        component_sku: l.component_sku, component_name: l.component_name, qty: l.qty, uom: l.uom, waste_percent: l.waste_percent,
        slot_code: l.slot_code, material_type: l.material_type, image_key: compImg.get(String(l.component_sku ?? "")) ?? null,
      })),
      piecework: (piecesBy.get(String(b.bom_code)) ?? []).map((p) => ({ job_name: p.job_name, rate: p.rate, qty_per: p.qty_per })),
      labor: (laborBy.get(String(b.bom_code)) ?? []).map((l) => ({ craftsman_name: l.craftsman_name, rate: l.rate, is_current: !!l.is_current })),
    })),
    mos: mos.map((m) => {
      const w = summarizeWorkOrders(woBy.get(String(m.mo_no)) ?? []);
      return {
        id: m.id, mo_no: m.mo_no, product_sku: m.product_sku, qty: Number(m.qty) || 0,
        // ใบสั่งผลิตที่ถูกยกเลิก = is_active false (ระบบเดิม) → ส่งเป็นสถานะ cancelled
        status: m.is_active === false ? "cancelled" : m.status,
        date: (m.order_date as string) || String(m.created_at ?? "").slice(0, 10) || null,
        due_date: m.due_date ?? null, finished_received_at: m.finished_received_at ?? null, bom_version: m.bom_version ?? null,
        ...w,
      };
    }),
    error: null,
  }, { headers: { "Cache-Control": "no-store" } });
}
