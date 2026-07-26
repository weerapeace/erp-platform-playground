/**
 * รายงาน "รายการค้าง" (ข้อมูลที่ยังไม่ได้ใส่) — /api/pending-data?scope=purchasing|production
 *
 * ใช้ตอบคำถาม "อะไรยังรอใส่ข้อมูลอยู่บ้าง" ให้แดชบอร์ดจัดซื้อ/ผลิต
 * ทุกหัวข้อคืนรูปแบบเดียวกัน (PendingSection) → หน้าเว็บกับใบพิมพ์ A4 ใช้ของกลางตัวเดียวกัน
 *
 * ⚠️ กติกาสำคัญ: ฝั่งผลิตนับเฉพาะ "งานที่ยังทำอยู่" (ใบสั่งผลิต is_active + ไม่ cancelled/done)
 *   ถ้านับทั้งระบบจะได้ BOM ไม่มีค่าแรง 1,548 สูตร = พิมพ์ 30+ แผ่น ใช้งานจริงไม่ไหว
 *
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 1 หัวข้อค้าง — columns = หัวตาราง · rows = ข้อมูล · blanks = ช่องว่างให้เขียนมือตอนพิมพ์ A4 */
export type PendingSection = {
  key: string;
  title: string;          // ชื่อหัวข้อ (ภาษาคน)
  hint: string;           // อธิบายว่าไม่ใส่แล้วเกิดอะไร
  fixHref: string | null; // ลิงก์ไปหน้าที่แก้ได้
  fixLabel: string | null;
  count: number;          // จำนวนที่ค้างทั้งหมด (อาจมากกว่าจำนวนแถวที่ส่งมา)
  columns: string[];
  blanks: string[];       // หัวคอลัมน์ช่องว่าง (ใบพิมพ์เว้นให้เขียน)
  rows: string[][];
  truncated: boolean;     // true = ตัดมาบางส่วน (เกิน limit)
};
export type PendingDataResponse = { scope: string; sections: PendingSection[]; error: string | null };

const MAX_ROWS = 600;     // เพดานต่อหัวข้อ (กันดึงหนัก + ใบพิมพ์ยาวเกิน)
const s = (v: unknown) => (v == null ? "" : String(v));
const n0 = (v: unknown) => { const x = Number(v); return isFinite(x) ? String(x) : ""; };

type Row = Record<string, unknown>;

// ---------- จัดซื้อ ----------
async function purchasing(admin: ReturnType<typeof supabaseAdmin>): Promise<PendingSection[]> {
  const out: PendingSection[] = [];

  // 1) ร้านที่ยังไม่ตั้งเครดิตเทอม → ปฏิทินจ่ายเงินคำนวณกำหนดจ่ายให้ไม่ได้
  {
    const { data, count } = await admin.from("partners_v2")
      .select("code, name, phone, purchase_credit_term", { count: "exact" })
      .eq("is_active", true).eq("is_supplier", true)
      .or("purchase_credit_term.is.null,purchase_credit_term.eq.")
      .order("name", { ascending: true }).limit(MAX_ROWS);
    const rows = (data ?? []) as Row[];
    out.push({
      key: "supplier_credit_term",
      title: "ร้านที่ยังไม่ตั้งเครดิตเทอม (กี่วันจ่าย)",
      hint: "ไม่ตั้ง = ปฏิทินจ่ายเงินคิดวันครบกำหนดให้ไม่ได้ ต้องจำเอง",
      fixHref: "/master/partners", fixLabel: "ไปตั้งที่ข้อมูลร้าน",
      count: count ?? rows.length,
      columns: ["รหัสร้าน", "ชื่อร้าน", "โทร"],
      blanks: ["เครดิตกี่วัน", "หมายเหตุ"],
      rows: rows.map((r) => [s(r.code), s(r.name), s(r.phone)]),
      truncated: (count ?? 0) > rows.length,
    });
  }

  // 2) วัตถุดิบที่ผูกร้านไว้แล้วแต่ยังไม่ใส่ราคา → เทียบราคา/คิดต้นทุนไม่ได้
  {
    const { data, count } = await admin.from("supplier_items")
      .select("supplier_partner, item_sku, supplier_sku, purchase_uom, currency", { count: "exact" })
      .eq("is_active", true).or("price.is.null,price.eq.0")
      .order("supplier_partner", { ascending: true }).limit(MAX_ROWS);
    const rows = (data ?? []) as Row[];
    out.push({
      key: "supplier_item_price",
      title: "วัตถุดิบที่ผูกร้านแล้วแต่ยังไม่ใส่ราคา",
      hint: "ไม่ใส่ = เทียบราคาระหว่างร้านไม่ได้ และคิดต้นทุนสินค้าไม่ครบ",
      fixHref: "/master/supplier-items", fixLabel: "ไปใส่ที่ตารางร้านที่จำหน่าย",
      count: count ?? rows.length,
      columns: ["ร้าน", "รหัสวัตถุดิบ", "รหัสของร้าน", "หน่วยซื้อ"],
      blanks: ["ราคา", "สกุลเงิน", "หมายเหตุ"],
      rows: rows.map((r) => [s(r.supplier_partner), s(r.item_sku), s(r.supplier_sku), s(r.purchase_uom)]),
      truncated: (count ?? 0) > rows.length,
    });
  }
  return out;
}

// ---------- ผลิต (เฉพาะงานที่ยังทำอยู่) ----------
async function production(admin: ReturnType<typeof supabaseAdmin>): Promise<PendingSection[]> {
  const out: PendingSection[] = [];

  // ใบสั่งผลิตที่ "ยังทำอยู่" = ตัวตั้งของทุกหัวข้อฝั่งผลิต
  const { data: moData } = await admin.from("manufacturing_orders")
    .select("mo_no, product_sku, product_name, qty, bom_code, est_labor_cost, due_date")
    .eq("is_active", true).not("status", "in", "(cancelled,done)")
    .order("due_date", { ascending: true, nullsFirst: false }).limit(2000);
  const mos = (moData ?? []) as Row[];

  // 1) ใบที่ยังไม่ตั้งค่าแรงผลิต
  {
    const rows = mos.filter((m) => !(Number(m.est_labor_cost) > 0));
    out.push({
      key: "mo_labor",
      title: "ใบสั่งผลิตที่ยังไม่ตั้งค่าแรงผลิต",
      hint: "ไม่ตั้ง = คิดต้นทุน/กำไรของใบนั้นไม่ได้ และไม่รู้ว่าจ่ายงานกี่บาท",
      fixHref: "/master/work-board", fixLabel: "ตั้งที่เช็กลิสต์บนบอร์ดจ่ายงาน",
      count: rows.length,
      columns: ["เลขที่ใบ", "รหัสสินค้า", "ชื่อสินค้า", "จำนวน", "กำหนดเสร็จ"],
      blanks: ["ค่าแรง/ชิ้น", "รวม"],
      rows: rows.slice(0, MAX_ROWS).map((m) => [s(m.mo_no), s(m.product_sku), s(m.product_name), n0(m.qty), s(m.due_date)]),
      truncated: rows.length > MAX_ROWS,
    });
  }

  // 2) ใบที่ยังไม่ได้ผูกสูตร BOM → เบิกวัตถุดิบไม่ออก
  {
    const rows = mos.filter((m) => !s(m.bom_code).trim());
    out.push({
      key: "mo_no_bom",
      title: "ใบสั่งผลิตที่ยังไม่มีสูตร BOM",
      hint: "ไม่มีสูตร = ระบบไม่รู้ว่าต้องเตรียม/ตัดวัตถุดิบอะไรบ้าง",
      fixHref: "/master/manufacturing-orders", fixLabel: "ไปผูกสูตรที่ใบสั่งผลิต",
      count: rows.length,
      columns: ["เลขที่ใบ", "รหัสสินค้า", "ชื่อสินค้า", "จำนวน"],
      blanks: ["ใช้สูตรไหน", "หมายเหตุ"],
      rows: rows.slice(0, MAX_ROWS).map((m) => [s(m.mo_no), s(m.product_sku), s(m.product_name), n0(m.qty)]),
      truncated: rows.length > MAX_ROWS,
    });
  }

  // 3) สูตร BOM (ที่ใบพวกนี้ใช้อยู่) ที่ยังไม่มีค่าแรงกลาง → ตั้งครั้งเดียวใบใหม่ได้ใช้เลย
  const bomCodes = [...new Set(mos.map((m) => s(m.bom_code).trim()).filter(Boolean))];
  {
    const priced = new Set<string>();
    for (let i = 0; i < bomCodes.length; i += 300) {
      const { data } = await admin.from("bom_labor_rates").select("bom_code, rate")
        .in("bom_code", bomCodes.slice(i, i + 300))
        .is("craftsman_id", null).eq("is_current", true).eq("is_active", true);
      for (const r of (data ?? []) as Row[]) if (Number(r.rate) > 0) priced.add(s(r.bom_code));
    }
    const missing = bomCodes.filter((c) => !priced.has(c));
    // ชื่อสินค้าของแต่ละสูตร (เอาจากใบที่ใช้สูตรนั้น — ไม่ต้องยิง bom_headers เพิ่ม)
    const byBom = new Map<string, Row>();
    for (const m of mos) { const c = s(m.bom_code).trim(); if (c && !byBom.has(c)) byBom.set(c, m); }
    out.push({
      key: "bom_labor_rate",
      title: "สูตร BOM ที่ยังไม่มีค่าแรงกลาง (฿/ชิ้น)",
      hint: "ตั้งครั้งเดียวที่สูตร → ใบสั่งผลิตใหม่ของสินค้านั้นดึงไปใช้เป็นค่าตั้งต้นได้เลย",
      fixHref: "/master/bom", fixLabel: "ไปตั้งค่าแรงที่สูตร BOM",
      count: missing.length,
      columns: ["รหัสสูตร", "รหัสสินค้า", "ชื่อสินค้า"],
      blanks: ["ค่าแรงกลาง ฿/ชิ้น", "หมายเหตุ"],
      rows: missing.slice(0, MAX_ROWS).map((c) => { const m = byBom.get(c); return [c, s(m?.product_sku), s(m?.product_name)]; }),
      truncated: missing.length > MAX_ROWS,
    });
  }

  // 4) วัตถุดิบในใบที่ยังทำอยู่ ที่ยังไม่มีราคาต้นทุน → หน้าต้นทุนขึ้น "—"
  {
    const moNos = mos.map((m) => s(m.mo_no)).filter(Boolean);
    const matMap = new Map<string, { name: string; uom: string }>();
    for (let i = 0; i < moNos.length; i += 200) {
      const { data } = await admin.from("mo_material_summary")
        .select("component_sku, component_name, uom").in("mo_no", moNos.slice(i, i + 200)).eq("is_active", true);
      for (const r of (data ?? []) as Row[]) {
        const c = s(r.component_sku).trim();
        if (c && !matMap.has(c)) matMap.set(c, { name: s(r.component_name), uom: s(r.uom) });
      }
    }
    const codes = [...matMap.keys()];
    const priced = new Set<string>();
    for (let i = 0; i < codes.length; i += 300) {
      const { data } = await admin.from("skus_v2").select("code, standard_price").in("code", codes.slice(i, i + 300));
      for (const r of (data ?? []) as Row[]) if (Number(r.standard_price) > 0) priced.add(s(r.code));
    }
    const missing = codes.filter((c) => !priced.has(c)).sort((a, b) => a.localeCompare(b, "th"));
    out.push({
      key: "material_cost",
      title: "วัตถุดิบที่ใช้อยู่แต่ยังไม่มีราคาต้นทุน",
      hint: "ไม่มีราคา = ต้นทุนสินค้าคิดขาด (หน้าต้นทุนจะขึ้น “—” และยอดรวมต่ำกว่าจริง)",
      fixHref: "/master/skus", fixLabel: "ไปใส่ราคาต้นทุนที่ SKU",
      count: missing.length,
      columns: ["รหัสวัตถุดิบ", "ชื่อวัตถุดิบ", "หน่วย"],
      blanks: ["ราคาต้นทุน/หน่วย", "ซื้อจากร้าน"],
      rows: missing.slice(0, MAX_ROWS).map((c) => { const m = matMap.get(c)!; return [c, m.name, m.uom]; }),
      truncated: missing.length > MAX_ROWS,
    });
  }
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const scope = (new URL(request.url).searchParams.get("scope") ?? "").trim();
  const admin = supabaseAdmin();
  try {
    const sections = scope === "purchasing" ? await purchasing(admin)
      : scope === "production" ? await production(admin)
      : [];
    if (!sections.length && scope !== "purchasing" && scope !== "production") {
      return NextResponse.json({ scope, sections: [], error: "scope ต้องเป็น purchasing หรือ production" }, { status: 400 });
    }
    return NextResponse.json({ scope, sections, error: null } satisfies PendingDataResponse);
  } catch (e) {
    return NextResponse.json({ scope, sections: [], error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }, { status: 500 });
  }
}
