/**
 * ข้อมูลใบสั่งผลิตรวมทั้งรุ่น — /api/mo/family-print
 *   ?ids=<id>,<id>   ใบที่เลือก (ติ๊กหลายใบ) → แยกเป็นรุ่น ๆ ละ 1 แผ่น
 *   ?mo=<id>         ใบเดียว → ขยายเป็น "ทุกใบที่ยังเปิด" ของรุ่นเดียวกัน
 *   ?parent=<code>   รหัสสินค้าแม่ → ทุกใบที่ยังเปิดของรุ่นนั้น
 * คืนข้อมูลดิบต่อรุ่น (ใบ · สี · วัตถุดิบ+สถานะซื้อ · บล็อกตัด) → หน้าพิมพ์ประกอบเป็นตารางด้วย lib/family-print
 * ของกลาง: guardApi(products.view) · สถานะซื้อ = lib/mo-material-status (กติกาเดียวกับบอร์ด/หน้าขอซื้อ) · fetchAllPages กันตัด 1,000 แถว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { loadMoPurchaseLinks, computeMatStatus, linkKey } from "@/lib/mo-material-status";
import type { FamilyBuyLine, FamilyCutLine, FamilyInput, FamilyMo, FamilyPrintResponse } from "@/lib/family-print";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const MO_COLS = "id, mo_no, product_sku, qty, due_date, status, size_breakdown";
const CLOSED = "(done,cancelled)";
const MAX_MOS = 300;
const CHUNK = 100;
const chunks = <T,>(arr: T[], n = CHUNK) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const img = (key: unknown, w: number) => (key ? `/api/r2-image?key=${encodeURIComponent(String(key))}&w=${w}` : null);
const str = (v: unknown) => String(v ?? "").trim();

/** ใบที่ยังเปิดของรุ่น (ลูก SKU ทุกตัวของสินค้าแม่) */
async function openMosOfParent(admin: SupabaseClient, parentId: string): Promise<Row[]> {
  const { data: kids } = await admin.from("skus_v2").select("code").eq("parent_sku_id", parentId);
  const codes = [...new Set(((kids ?? []) as Row[]).map((k) => str(k.code)).filter(Boolean))];
  if (!codes.length) return [];
  const res = await Promise.all(chunks(codes, 200).map((c) =>
    admin.from("manufacturing_orders").select(MO_COLS).in("product_sku", c).eq("is_active", true).not("status", "in", CLOSED).limit(MAX_MOS)));
  return res.flatMap((r) => (r.data ?? []) as Row[]);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_MOS);
  const moId = (sp.get("mo") ?? "").trim();
  const parentCode = (sp.get("parent") ?? "").trim();
  if (!ids.length && !moId && !parentCode) return NextResponse.json({ data: null, error: "ต้องระบุใบสั่งผลิตหรือรหัสรุ่น" }, { status: 400 });
  const admin = supabaseAdmin();

  /* 1) ใบสั่งผลิตที่จะรวม */
  let mos: Row[] = [];
  if (ids.length) {
    const res = await Promise.all(chunks(ids).map((c) => admin.from("manufacturing_orders").select(MO_COLS).in("id", c).eq("is_active", true)));
    mos = res.flatMap((r) => (r.data ?? []) as Row[]);
  } else if (moId) {
    const { data: seed } = await admin.from("manufacturing_orders").select(MO_COLS).eq("id", moId).maybeSingle();
    if (!seed) return NextResponse.json({ data: null, error: "ไม่พบใบสั่งผลิตนี้" }, { status: 404 });
    const { data: sk } = await admin.from("skus_v2").select("parent_sku_id").eq("code", str((seed as Row).product_sku)).not("parent_sku_id", "is", null).limit(1).maybeSingle();
    const pid = (sk as Row | null)?.parent_sku_id;
    mos = pid ? await openMosOfParent(admin, String(pid)) : [];
    if (!mos.some((m) => m.id === (seed as Row).id)) mos.push(seed as Row);   // ใบตั้งต้นต้องอยู่เสมอ (แม้ปิดไปแล้ว)
  } else {
    const { data: par } = await admin.from("parent_skus_v2").select("id").eq("code", parentCode).limit(1).maybeSingle();
    if (!par) return NextResponse.json({ data: null, error: `ไม่พบรุ่น ${parentCode}` }, { status: 404 });
    mos = await openMosOfParent(admin, String((par as Row).id));
  }
  mos = mos.filter((m) => str(m.product_sku));
  if (!mos.length) return NextResponse.json({ data: { families: [] } satisfies FamilyPrintResponse, error: null });

  /* 2) SKU (สี/รูป) + สินค้าแม่ + วัตถุดิบ + บล็อกตัด + ใบขอซื้อ — ยิงพร้อมกัน */
  const moNos = [...new Set(mos.map((m) => str(m.mo_no)))];
  const skuCodes = [...new Set(mos.map((m) => str(m.product_sku)))];
  const [skuRes, sums, mats, links] = await Promise.all([
    Promise.all(chunks(skuCodes, 200).map((c) => admin.from("skus_v2").select("code, color_th, color, attribute_values, cover_image_r2_key, parent_sku_id").in("code", c).eq("is_active", true))),
    Promise.all(chunks(moNos).map((c) => fetchAllPages<Row>((from, to) => admin.from("mo_material_summary")
      .select("id, mo_no, component_sku, component_name, material_type, uom, qty_per, on_hand_qty, to_purchase_qty, is_ready, sequence")
      .in("mo_no", c).eq("is_active", true).order("mo_no").order("sequence", { ascending: true, nullsFirst: false }).order("id").range(from, to)))).then((x) => x.flat()),
    Promise.all(chunks(moNos).map((c) => fetchAllPages<Row>((from, to) => admin.from("mo_materials")
      .select("id, mo_no, component_sku, component_name, material_type, cut_block_code, cut_width, cut_length, pieces, size_label, cut_done, sequence")
      .in("mo_no", c).eq("is_active", true).order("mo_no").order("sequence", { ascending: true, nullsFirst: false }).order("id").range(from, to)))).then((x) => x.flat()),
    loadMoPurchaseLinks(admin, moNos),
  ]);
  const skuByCode = new Map<string, Row>();
  for (const s of skuRes.flatMap((r) => (r.data ?? []) as Row[])) if (!skuByCode.has(str(s.code))) skuByCode.set(str(s.code), s);
  const parentIds = [...new Set([...skuByCode.values()].map((s) => s.parent_sku_id).filter(Boolean).map(String))];

  // รูปวัตถุดิบ (cover SKU → fallback รูปสินค้าแม่ของวัตถุดิบ — เหมือน /api/mo/material-status) + ข้อมูลสินค้าแม่
  const compCodes = [...new Set([...sums, ...mats].map((r) => str(r.component_sku)).filter(Boolean))];
  const [compRes, parRes] = await Promise.all([
    Promise.all(chunks(compCodes, 200).map((c) => admin.from("skus_v2").select("code, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("code", c).eq("is_active", true))),
    parentIds.length ? admin.from("parent_skus_v2").select("id, code, name_th, sku_name, cover_image_r2_key").in("id", parentIds) : Promise.resolve({ data: [] as Row[] }),
  ]);
  const compImg = new Map<string, string>();
  for (const c of compRes.flatMap((r) => (r.data ?? []) as Row[])) {
    const rel = c.parent_skus_v2;
    const par = (Array.isArray(rel) ? rel[0] : rel) as { cover_image_r2_key?: string | null } | null;
    const u = img(c.cover_image_r2_key || par?.cover_image_r2_key, 120);
    if (u && !compImg.has(str(c.code))) compImg.set(str(c.code), u);
  }
  const parentById = new Map(((parRes.data ?? []) as Row[]).map((p) => [String(p.id), p]));

  /* 3) จัดกลุ่มตามรุ่น */
  const moByNo = new Map(mos.map((m) => [str(m.mo_no), m]));
  const groups = new Map<string, FamilyInput>();
  const groupOfMo = new Map<string, FamilyInput>();
  for (const m of mos) {
    const sku = skuByCode.get(str(m.product_sku));
    const pid = sku?.parent_sku_id ? String(sku.parent_sku_id) : null;
    const key = pid ? `p:${pid}` : `s:${str(m.product_sku)}`;
    let g = groups.get(key);
    if (!g) {
      const p = pid ? parentById.get(pid) : null;
      g = { key, parent: p ? { code: str(p.code), name: str(p.sku_name) || str(p.name_th) || null, image_url: img(p.cover_image_r2_key, 400) } : null, mos: [], skus: [], buy: [], cut: [] };
      groups.set(key, g);
    }
    const sizes = Array.isArray(m.size_breakdown) ? (m.size_breakdown as { label?: unknown; qty?: unknown }[]).map((s) => ({ label: str(s.label), qty: Number(s.qty) || 0 })) : null;
    const fm: FamilyMo = { id: String(m.id), mo_no: str(m.mo_no), product_sku: str(m.product_sku), qty: Number(m.qty) || 0, due_date: (m.due_date as string) ?? null, status: (m.status as string) ?? null, size_breakdown: sizes };
    g.mos.push(fm);
    groupOfMo.set(fm.mo_no, g);
    if (!g.skus.some((s) => s.code === fm.product_sku)) {
      // ชื่อตัวเลือกของ SKU (สี / ตัวเลือกย่อย) — สูตรเดียวกับ /api/product-spec (sku_variant)
      const opt = (sku?.attribute_values as { variant_option?: { value?: string } } | null)?.variant_option?.value;
      const variant = [str(sku?.color_th) || str(sku?.color), str(opt)].filter(Boolean).join(" / ") || null;
      const p = pid ? parentById.get(pid) : null;
      g.skus.push({ code: fm.product_sku, variant, image_url: img(sku?.cover_image_r2_key || p?.cover_image_r2_key, 200) });
    }
  }
  for (const s of sums) {
    const moNo = str(s.mo_no), g = groupOfMo.get(moNo); if (!g) continue;
    const code = str(s.component_sku) || null;
    const ln = code ? links.get(linkKey(moNo, code)) ?? [] : [];
    const calc = computeMatStatus(s, Number(moByNo.get(moNo)?.qty) || 0, ln);
    const line: FamilyBuyLine = {
      mo_no: moNo, code, name: (s.component_name as string) ?? null, type: (s.material_type as string) ?? null, uom: (s.uom as string) ?? null,
      qty_per: calc.qty_per, required: calc.required, remaining: calc.remaining, status: calc.status,
      po_nos: [...new Set(ln.map((l) => l.po_no).filter((x): x is string => !!x))],
      seq: Number(s.sequence) || 0, image_url: code ? compImg.get(code) ?? null : null,
    };
    g.buy.push(line);
  }
  for (const r of mats) {
    const moNo = str(r.mo_no), g = groupOfMo.get(moNo); if (!g) continue;
    const code = str(r.component_sku) || null;
    const line: FamilyCutLine = {
      mo_no: moNo, code, name: (r.component_name as string) ?? null, type: (r.material_type as string) ?? null,
      block: (r.cut_block_code as string) ?? null,
      width: r.cut_width != null ? Number(r.cut_width) : null, length: r.cut_length != null ? Number(r.cut_length) : null,
      pieces: r.pieces != null ? Number(r.pieces) : null, size_label: (r.size_label as string) ?? null,
      cut_done: !!r.cut_done, seq: Number(r.sequence) || 0, image_url: code ? compImg.get(code) ?? null : null,
    };
    g.cut.push(line);
  }

  const families = [...groups.values()].sort((a, b) => (a.parent?.code ?? a.mos[0].product_sku).localeCompare(b.parent?.code ?? b.mos[0].product_sku, "th", { numeric: true }));
  return NextResponse.json({ data: { families } satisfies FamilyPrintResponse, error: null });
}
