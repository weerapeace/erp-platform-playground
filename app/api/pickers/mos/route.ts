/**
 * รายการใบสั่งผลิต (ใบงาน) ให้ตัวเลือกใบงานกลาง — GET /api/pickers/mos   (components/mo-picker · MoMultiPickerModal)
 *   ?scope=not_in_qc (ค่าตั้งต้น) = ยังไม่ปิด/ยกเลิก และยังไม่ส่งเข้า QC ครบ (รอจ่าย + อยู่ที่ช่าง)
 *   ?scope=open                    = ทุกใบที่ยังไม่ปิด/ยกเลิก (รวมที่เข้า QC ครบแล้ว)
 *   ?scope=history                 = รวมใบที่ปิดแล้ว (ไม่รวมยกเลิก) ล่าสุด 1,500 ใบ — ก๊อปชิ้นตัดจากใบเก่า (/fabric-calc)
 * คืน: เลขใบ · SKU · ชื่อ · จำนวน · รูป (ปก SKU → ปกสินค้าแม่) · อยู่ที่ไหน (โต๊ะ · คน) · ขั้น · สินค้าแม่ (จัดกลุ่ม) · วันกำหนด
 * ของกลาง: guardApi(products.view) · fetchAllPages (ข้อมูลเกิน 1,000 แถว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export type MoPickStage = "waiting" | "at_craftsman" | "in_qc";
export type MoPickRow = {
  id: string; mo_no: string; mo_id: string; sku: string | null; name: string | null; qty: number; status: string;
  image_url: string | null; where: string; stage: MoPickStage;
  parent_code: string | null; parent_name: string | null; due_date: string | null;
  /** ใบสั่งขายที่ใบนี้ผูกอยู่ (null = ยังไม่ผูก) */
  so_order_no?: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams.get("scope");
  const scope = sp === "open" ? "open" : sp === "history" ? "history" : "not_in_qc";
  const admin = supabaseAdmin();

  const MO_COLS = "id, mo_no, qty, status, product_sku, product_name, due_date, internal_due_date, so_order_no";
  const mos = scope === "history"
    ? (((await admin.from("manufacturing_orders").select(MO_COLS).eq("is_active", true).neq("status", "cancelled")
      .order("created_at", { ascending: false }).limit(1500)).data ?? []) as Row[])
    : await fetchAllPages<Row>((from, to) => admin.from("manufacturing_orders").select(MO_COLS)
      .eq("is_active", true).not("status", "in", "(done,cancelled,closed)").order("mo_no").range(from, to));
  const closed = (m: Row) => m.status === "done" || m.status === "closed";
  const moNos = mos.filter((m) => !closed(m)).map((m) => String(m.mo_no));   // ใบที่ปิดแล้วไม่ต้องดูว่าอยู่ที่ช่างไหน
  const wos: Row[] = [];
  for (let i = 0; i < moNos.length; i += 300) {
    wos.push(...await fetchAllPages<Row>((from, to) => admin.from("mo_work_orders").select("id, mo_no, assignee_name, department_id, qty, qc_pulled_qty, status")
      .in("mo_no", moNos.slice(i, i + 300)).eq("is_active", true).order("id").range(from, to)));
  }
  const deptIds = [...new Set(wos.map((w) => w.department_id as string).filter(Boolean))];
  const { data: depts } = deptIds.length ? await admin.from("departments").select("id, name").in("id", deptIds) : { data: [] as Row[] };
  const deptName = new Map(((depts ?? []) as Row[]).map((d) => [String(d.id), String(d.name ?? "")]));
  const byMo = new Map<string, Row[]>();
  for (const w of wos) { if (w.status === "cancelled") continue; const k = String(w.mo_no); byMo.set(k, [...(byMo.get(k) ?? []), w]); }

  // รูป + สินค้าแม่
  const skus = [...new Set(mos.map((m) => String(m.product_sku ?? "")).filter(Boolean))];
  const info = new Map<string, { image_url: string | null; parent_code: string | null; parent_name: string | null }>();
  for (let i = 0; i < skus.length; i += 300) {
    const { data } = await admin.from("skus_v2").select("code, cover_image_r2_key, parent:parent_skus_v2!parent_sku_id ( code, name_th, sku_name, cover_image_r2_key )").in("code", skus.slice(i, i + 300));
    for (const s of (data ?? []) as Row[]) {
      const p = (Array.isArray(s.parent) ? s.parent[0] : s.parent) as { code?: string | null; name_th?: string | null; sku_name?: string | null; cover_image_r2_key?: string | null } | null;
      const key = (s.cover_image_r2_key as string | null) || p?.cover_image_r2_key || null;
      info.set(String(s.code), { image_url: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null, parent_code: p?.code ?? null, parent_name: p?.name_th || p?.sku_name || null });
    }
  }

  const out: MoPickRow[] = [];
  for (const m of mos) {
    const moNo = String(m.mo_no), ws = byMo.get(moNo) ?? [];
    const open = ws.filter((w) => num(w.qc_pulled_qty) < num(w.qty));
    const stage: MoPickStage = closed(m) ? "in_qc" : !ws.length ? "waiting" : open.length ? "at_craftsman" : "in_qc";
    if (scope === "not_in_qc" && stage === "in_qc") continue;
    const where = closed(m) ? "ปิดแล้ว" : stage === "waiting" ? "รอจ่าย" : stage === "in_qc" ? "เข้า QC ครบแล้ว"
      : [...new Set(open.map((w) => [w.department_id ? deptName.get(String(w.department_id)) : null, w.assignee_name].filter(Boolean).join(" · ") || "อยู่ที่ช่าง"))].join(", ");
    const sku = (m.product_sku as string) ?? null, inf = sku ? info.get(sku) : undefined;
    out.push({ id: moNo, mo_no: moNo, mo_id: String(m.id), sku, name: (m.product_name as string) ?? null, qty: num(m.qty), status: String(m.status ?? ""),
      image_url: inf?.image_url ?? null, where, stage, parent_code: inf?.parent_code ?? null, parent_name: inf?.parent_name ?? null,
      due_date: (m.internal_due_date as string) ?? (m.due_date as string) ?? null, so_order_no: (m.so_order_no as string) ?? null });
  }
  return NextResponse.json({ data: out, error: null });
}
