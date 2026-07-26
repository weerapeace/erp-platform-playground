/**
 * รายงาน "รายการค้าง" (ข้อมูลที่ยังไม่ได้ใส่) — /api/pending-data
 *   GET   ?scope=purchasing|production  → รายการค้างแยกหัวข้อ
 *   PATCH { key, id, value, qty? }      → "ใส่ค่าเร็ว" กลับไปที่ต้นทางจริง (ราคา/ค่าแรง/เครดิต)
 *
 * ใช้ตอบคำถาม "อะไรยังรอใส่ข้อมูลอยู่บ้าง" ให้แดชบอร์ดจัดซื้อ/ผลิต
 * ทุกหัวข้อคืนรูปแบบเดียวกัน (PendingSection) → หน้าเว็บกับใบพิมพ์ A4 ใช้ของกลางตัวเดียวกัน
 *
 * ⚠️ กติกาสำคัญ: ฝั่งผลิตนับเฉพาะ "งานที่ยังทำอยู่" (ใบสั่งผลิต is_active + ไม่ cancelled/done)
 *   ถ้านับทั้งระบบจะได้ BOM ไม่มีค่าแรง 1,548 สูตร = พิมพ์ 30+ แผ่น ใช้งานจริงไม่ไหว
 *
 * ⚠️ supplier_items: คอลัมน์ text (supplier_partner/item_sku) ว่างทั้งตาราง — ของจริงอยู่ที่ FK
 *   (supplier_partner_id → partners_v2 · item_sku_id → skus_v2) ต้อง join เอาชื่อ
 *
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 1 แถวของรายการค้าง */
export type PendingRow = {
  cells: string[];
  image?: string | null;      // R2 key รูปสินค้า (โชว์ในตาราง + ใบพิมพ์)
  id?: string | null;         // id ที่ใช้บันทึกค่า (ตามชนิดของหัวข้อ)
  openHref?: string | null;   // ปุ่ม ↗ ไปหน้าจัดการ "พร้อมเปิดรายการนั้น"
  qty?: number;               // ใช้ตอนแปลง ค่าแรง/ชิ้น → ยอดรวม
};
/** ตั้งค่า "ใส่ค่าเร็ว" ของหัวข้อนั้น (ไม่มี = แก้ตรงนี้ไม่ได้ ต้องกด ↗ ไปหน้าจริง) */
export type PendingEdit = { field: string; label: string; kind: "number" | "credit_term"; suffix?: string };

export type PendingSection = {
  key: string;
  title: string;          // ชื่อหัวข้อ (ภาษาคน)
  hint: string;           // อธิบายว่าไม่ใส่แล้วเกิดอะไร
  fixHref: string | null; // ลิงก์รวมไปหน้าที่แก้ได้
  fixLabel: string | null;
  count: number;          // จำนวนที่ค้างทั้งหมด (อาจมากกว่าจำนวนแถวที่ส่งมา)
  columns: string[];
  blanks: string[];       // หัวคอลัมน์ช่องว่าง (ใบพิมพ์เว้นให้เขียน)
  rows: PendingRow[];
  edit: PendingEdit | null;
  hasImage: boolean;      // หัวข้อนี้มีรูปไหม (ตาราง/ใบพิมพ์จะเพิ่มคอลัมน์รูป)
  truncated: boolean;
};
export type PendingDataResponse = { scope: string; sections: PendingSection[]; error: string | null };

const MAX_ROWS = 600;     // เพดานต่อหัวข้อ (กันดึงหนัก + ใบพิมพ์ยาวเกิน)
const s = (v: unknown) => (v == null ? "" : String(v));
const n0 = (v: unknown) => { const x = Number(v); return isFinite(x) ? String(x) : ""; };
const blank = (v: unknown) => !s(v).trim();     // null หรือ "" → ถือว่ายังไม่ได้ใส่

type Row = Record<string, unknown>;

/** ดึงรูปปกของ SKU ตามรหัส (แบ่งก้อนละ 300 กัน URL ยาวเกิน) */
async function skuImages(admin: ReturnType<typeof supabaseAdmin>, codes: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const uniq = [...new Set(codes.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await admin.from("skus_v2").select("code, cover_image_r2_key").in("code", uniq.slice(i, i + 300));
    for (const r of (data ?? []) as Row[]) if (r.cover_image_r2_key) m.set(s(r.code), s(r.cover_image_r2_key));
  }
  return m;
}

// ---------- จัดซื้อ ----------
async function purchasing(admin: ReturnType<typeof supabaseAdmin>): Promise<PendingSection[]> {
  const out: PendingSection[] = [];

  // 1) ร้านที่ยังไม่ตั้งเครดิตเทอม → ปฏิทินจ่ายเงินคำนวณกำหนดจ่ายให้ไม่ได้
  //    ⚠️ กรองใน JS ไม่ใช้ .or(...eq.) ของ PostgREST — ค่าว่างเขียนเป็น filter ไม่ได้ ทำให้ได้ 0 แถว
  {
    // ⚠️ partners_v2 ไม่มีคอลัมน์ "name" — มี name_th / display_name (เคยพลาดตรงนี้ → query error → ได้ 0 แถว)
    const { data } = await admin.from("partners_v2")
      .select("id, code, name_th, display_name, phone, purchase_credit_term")
      .eq("is_active", true).eq("is_supplier", true)
      .order("name_th", { ascending: true }).limit(2000);
    const miss = ((data ?? []) as Row[]).filter((r) => blank(r.purchase_credit_term));
    out.push({
      key: "supplier_credit_term",
      title: "ร้านที่ยังไม่ตั้งเครดิตเทอม (กี่วันจ่าย)",
      hint: "ไม่ตั้ง = ปฏิทินจ่ายเงินคิดวันครบกำหนดให้ไม่ได้ ต้องจำเอง",
      fixHref: "/master/partners", fixLabel: "ไปตั้งที่ข้อมูลร้าน",
      count: miss.length,
      columns: ["รหัสร้าน", "ชื่อร้าน", "โทร"],
      blanks: ["เครดิตกี่วัน", "หมายเหตุ"],
      rows: miss.slice(0, MAX_ROWS).map((r) => ({
        cells: [s(r.code), s(r.name_th) || s(r.display_name), s(r.phone)],
        id: s(r.id), openHref: `/master/partners?open=${s(r.id)}`,
      })),
      edit: { field: "purchase_credit_term", label: "เครดิต", kind: "credit_term" },
      hasImage: false,
      truncated: miss.length > MAX_ROWS,
    });
  }

  // 2) วัตถุดิบที่ผูกร้านไว้แล้วแต่ยังไม่ใส่ราคา → เทียบราคา/คิดต้นทุนไม่ได้
  {
    const { data, count } = await admin.from("supplier_items")
      .select("id, supplier_partner_id, item_sku_id, supplier_sku, purchase_uom, currency", { count: "exact" })
      .eq("is_active", true).or("price.is.null,price.eq.0")
      .limit(MAX_ROWS);
    const rows = (data ?? []) as Row[];

    // ชื่อร้าน + รหัส/ชื่อ/รูป วัตถุดิบ มาจาก FK (คอลัมน์ text ในตารางนี้ว่าง)
    const pIds = [...new Set(rows.map((r) => s(r.supplier_partner_id)).filter(Boolean))];
    const sIds = [...new Set(rows.map((r) => s(r.item_sku_id)).filter(Boolean))];
    const pMap = new Map<string, string>(), sMap = new Map<string, { code: string; name: string; img: string }>();
    for (let i = 0; i < pIds.length; i += 300) {
      const { data: ps } = await admin.from("partners_v2").select("id, name_th, display_name, code").in("id", pIds.slice(i, i + 300));
      for (const p of (ps ?? []) as Row[]) pMap.set(s(p.id), s(p.name_th) || s(p.display_name) || s(p.code));
    }
    for (let i = 0; i < sIds.length; i += 300) {
      const { data: sk } = await admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key").in("id", sIds.slice(i, i + 300));
      for (const x of (sk ?? []) as Row[]) sMap.set(s(x.id), { code: s(x.code), name: s(x.name_th), img: s(x.cover_image_r2_key) });
    }

    out.push({
      key: "supplier_item_price",
      title: "วัตถุดิบที่ผูกร้านแล้วแต่ยังไม่ใส่ราคา",
      hint: "ไม่ใส่ = เทียบราคาระหว่างร้านไม่ได้ และคิดต้นทุนสินค้าไม่ครบ",
      fixHref: "/master/supplier-items", fixLabel: "ไปใส่ที่ตารางร้านที่จำหน่าย",
      count: count ?? rows.length,
      columns: ["ร้าน", "รหัสวัตถุดิบ", "ชื่อวัตถุดิบ", "รหัสของร้าน", "หน่วยซื้อ"],
      blanks: ["ราคา", "สกุลเงิน"],
      rows: rows.map((r) => {
        const sk = sMap.get(s(r.item_sku_id));
        return {
          cells: [pMap.get(s(r.supplier_partner_id)) ?? "", sk?.code ?? "", sk?.name ?? "", s(r.supplier_sku), s(r.purchase_uom)],
          image: sk?.img || null,
          id: s(r.id), openHref: `/master/supplier-items?open=${s(r.id)}`,
        };
      }),
      edit: { field: "price", label: "ราคา", kind: "number", suffix: "฿" },
      hasImage: true,
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
    .select("id, mo_no, product_sku, product_name, qty, bom_code, est_labor_cost, due_date")
    .eq("is_active", true).not("status", "in", "(cancelled,done)")
    .order("due_date", { ascending: true, nullsFirst: false }).limit(2000);
  const mos = (moData ?? []) as Row[];
  const imgMap = await skuImages(admin, mos.map((m) => s(m.product_sku)));

  // 1) ใบที่ยังไม่ตั้งค่าแรงผลิต — ใส่เป็น "฿/ชิ้น" แล้วระบบคูณจำนวนเป็นยอดรวมให้
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
      rows: rows.slice(0, MAX_ROWS).map((m) => ({
        cells: [s(m.mo_no), s(m.product_sku), s(m.product_name), n0(m.qty), s(m.due_date)],
        image: imgMap.get(s(m.product_sku)) ?? null,
        id: s(m.id), qty: Number(m.qty) || 0,
        openHref: `/master/work-board?mo=${s(m.id)}`,
      })),
      edit: { field: "est_labor_rate", label: "ค่าแรง/ชิ้น", kind: "number", suffix: "฿" },
      hasImage: true,
      truncated: rows.length > MAX_ROWS,
    });
  }

  // 2) ใบที่ยังไม่ได้ผูกสูตร BOM → งานใหญ่ (ต้องเลือกสูตร) จึงมีแต่ปุ่มไปหน้าจริง
  {
    const rows = mos.filter((m) => blank(m.bom_code));
    out.push({
      key: "mo_no_bom",
      title: "ใบสั่งผลิตที่ยังไม่มีสูตร BOM",
      hint: "ไม่มีสูตร = ระบบไม่รู้ว่าต้องเตรียม/ตัดวัตถุดิบอะไรบ้าง",
      fixHref: "/master/manufacturing-orders", fixLabel: "ไปผูกสูตรที่ใบสั่งผลิต",
      count: rows.length,
      columns: ["เลขที่ใบ", "รหัสสินค้า", "ชื่อสินค้า", "จำนวน"],
      blanks: ["ใช้สูตรไหน", "หมายเหตุ"],
      rows: rows.slice(0, MAX_ROWS).map((m) => ({
        cells: [s(m.mo_no), s(m.product_sku), s(m.product_name), n0(m.qty)],
        image: imgMap.get(s(m.product_sku)) ?? null,
        id: s(m.id), openHref: `/master/work-board?mo=${s(m.id)}`,
      })),
      edit: null,
      hasImage: true,
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
      rows: missing.slice(0, MAX_ROWS).map((c) => {
        const m = byBom.get(c);
        const sku = s(m?.product_sku);
        return {
          cells: [c, sku, s(m?.product_name)],
          image: imgMap.get(sku) ?? null,
          id: c,                                   // bom_labor_rate ใช้ "รหัสสูตร" เป็น id
          openHref: sku ? `/master/bom?open=${encodeURIComponent(sku)}` : "/master/bom",
        };
      }),
      edit: { field: "rate", label: "ค่าแรงกลาง", kind: "number", suffix: "฿/ชิ้น" },
      hasImage: true,
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
    const skuIdImg = new Map<string, { id: string; img: string }>();
    for (let i = 0; i < codes.length; i += 300) {
      const { data } = await admin.from("skus_v2").select("id, code, standard_price, cover_image_r2_key").in("code", codes.slice(i, i + 300));
      for (const r of (data ?? []) as Row[]) {
        if (Number(r.standard_price) > 0) priced.add(s(r.code));
        skuIdImg.set(s(r.code), { id: s(r.id), img: s(r.cover_image_r2_key) });
      }
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
      rows: missing.slice(0, MAX_ROWS).map((c) => {
        const m = matMap.get(c)!; const sk = skuIdImg.get(c);
        return {
          cells: [c, m.name, m.uom],
          image: sk?.img || null,
          id: sk?.id ?? null,                       // material_cost ใช้ "id ของ SKU"
          openHref: sk?.id ? `/master/skus?open=${sk.id}` : "/master/skus",
        };
      }),
      edit: { field: "standard_price", label: "ราคาต้นทุน", kind: "number", suffix: "฿" },
      hasImage: true,
      truncated: missing.length > MAX_ROWS,
    });
  }
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const scope = (new URL(request.url).searchParams.get("scope") ?? "").trim();
  if (scope !== "purchasing" && scope !== "production") {
    return NextResponse.json({ scope, sections: [], error: "scope ต้องเป็น purchasing หรือ production" }, { status: 400 });
  }
  const admin = supabaseAdmin();
  try {
    const sections = scope === "purchasing" ? await purchasing(admin) : await production(admin);
    return NextResponse.json({ scope, sections, error: null } satisfies PendingDataResponse);
  } catch (e) {
    return NextResponse.json({ scope, sections: [], error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }, { status: 500 });
  }
}

// ---------- ใส่ค่าเร็ว: บันทึกกลับ "ต้นทางจริง" ของแต่ละหัวข้อ ----------
type PatchBody = { key?: string; id?: string; value?: unknown; qty?: number };

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let b: PatchBody; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = s(b.key), id = s(b.id);
  if (!key || !id) return NextResponse.json({ error: "ต้องระบุ key และ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };
  const numVal = Number(b.value);

  try {
    switch (key) {
      case "supplier_credit_term": {
        const term = s(b.value).trim();
        if (!term) return NextResponse.json({ error: "ยังไม่ได้เลือกเครดิต" }, { status: 400 });
        const { error } = await admin.from("partners_v2").update({ purchase_credit_term: term }).eq("id", id);
        if (error) throw new Error(error.message);
        await writeAudit(admin, { action: "update", entityType: "partner", entityId: id, ...actor, metadata: { purchase_credit_term: term, via: "pending-data" } });
        break;
      }
      case "supplier_item_price": {
        if (!(numVal > 0)) return NextResponse.json({ error: "ราคาต้องมากกว่า 0" }, { status: 400 });
        const { error } = await admin.from("supplier_items").update({ price: numVal }).eq("id", id);
        if (error) throw new Error(error.message);
        await writeAudit(admin, { action: "update", entityType: "supplier_item", entityId: id, ...actor, metadata: { price: numVal, via: "pending-data" } });
        break;
      }
      case "material_cost": {
        if (!(numVal > 0)) return NextResponse.json({ error: "ราคาต้องมากกว่า 0" }, { status: 400 });
        const { error } = await admin.from("skus_v2").update({ standard_price: numVal }).eq("id", id);
        if (error) throw new Error(error.message);
        await writeAudit(admin, { action: "update", entityType: "sku", entityId: id, ...actor, metadata: { standard_price: numVal, via: "pending-data" } });
        break;
      }
      case "mo_labor": {
        // ผู้ใช้กรอก "฿/ชิ้น" — ระบบเก็บเป็นยอดรวม (est_labor_cost) ให้ตรงกับที่อื่นในระบบ
        if (!(numVal > 0)) return NextResponse.json({ error: "ค่าแรงต้องมากกว่า 0" }, { status: 400 });
        const qty = Number(b.qty) > 0 ? Number(b.qty) : 0;
        if (!qty) return NextResponse.json({ error: "ใบนี้ไม่มีจำนวน คิดยอดรวมไม่ได้" }, { status: 400 });
        const total = Math.round(numVal * qty * 100) / 100;
        const { error } = await admin.from("manufacturing_orders").update({ est_labor_cost: total }).eq("id", id);
        if (error) throw new Error(error.message);
        await writeAudit(admin, { action: "update", entityType: "mo", entityId: id, ...actor, metadata: { est_labor_cost: total, rate: numVal, qty, via: "pending-data" } });
        break;
      }
      case "bom_labor_rate": {
        // id = bom_code · ทำแบบเดียวกับ /api/bom/labor-rates (ของเดิม is_current=false แล้วใส่แถวใหม่ = เก็บประวัติ)
        if (!(numVal > 0)) return NextResponse.json({ error: "ค่าแรงต้องมากกว่า 0" }, { status: 400 });
        const { data: cur } = await admin.from("bom_labor_rates").select("id")
          .eq("bom_code", id).is("craftsman_id", null).eq("is_active", true).eq("is_current", true);
        for (const r of (cur ?? []) as Row[]) await admin.from("bom_labor_rates").update({ is_current: false }).eq("id", s(r.id));
        const { error } = await admin.from("bom_labor_rates").insert({
          bom_code: id, craftsman_id: null, craftsman_name: "ราคากลาง", rate: numVal, is_current: true, created_by: user?.id ?? null,
        });
        if (error) throw new Error(error.message);
        await writeAudit(admin, { action: "create", entityType: "bom_labor_rate", entityId: id, ...actor, metadata: { bom_code: id, rate: numVal, via: "pending-data" } });
        break;
      }
      default:
        return NextResponse.json({ error: `หัวข้อ "${key}" ยังใส่ค่าเร็วไม่ได้` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 400 });
  }
}
