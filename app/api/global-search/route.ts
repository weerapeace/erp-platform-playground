import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { tokenize, scoreRow, ilikeOr } from "@/lib/search-score";

// ---- Types ----

export type SearchEntity =
  | "page" | "guide"
  | "sku" | "partner"
  | "po" | "pv"
  | "mo"
  | "invoice" | "quotation" | "billing" | "delivery" | "cn"
  | "task" | "employee"
  | "user" | "asset";

export type SearchHit = {
  entity_type: SearchEntity;
  id:          string;
  label:       string;
  sublabel:    string | null;
  link_url:    string;
  score:       number;
};

export type GlobalSearchResponse = {
  data:  SearchHit[];
  error: string | null;
};

// ---- helpers ----

const norm = (s: unknown) => String(s ?? "").toLowerCase().trim();
/** แยกคำค้นเป็นคำ ๆ (เว้นวรรค) — ทุกคำต้องเจอ (AND) — ใช้กับหน้า/คู่มือ */
const tokensOf = (q: string) => norm(q).split(/\s+/).filter(Boolean);

/** ป้ายสถานะภาษาคน (ใช้ร่วมทุกเอกสาร) */
const STATUS_TH: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", cancelled: "ยกเลิก", done: "เสร็จ", completed: "เสร็จสิ้น",
  in_production: "กำลังผลิต", ready: "พร้อมส่ง", shipped: "ส่งแล้ว", delivered: "ส่งแล้ว",
  issued: "ออกแล้ว", paid: "จ่ายแล้ว", unpaid: "ยังไม่จ่าย", purchase: "สั่งแล้ว", partial: "รับบางส่วน", received: "รับครบ",
  sent: "ส่งแล้ว", accepted: "ตอบรับ", rejected: "ปฏิเสธ", converted: "เปิดใบขายแล้ว", expired: "หมดอายุ",
  dispatched: "จ่ายงานแล้ว", backlog: "รอคิว", in_progress: "กำลังทำ", need_review: "รอตรวจ", approved: "อนุมัติ", revision: "แก้ไข",
};
const st = (s: unknown) => { const k = String(s ?? ""); return k ? (STATUS_TH[k] ?? k) : ""; };
const money = (n: unknown) => { const v = Number(n); return Number.isFinite(v) && v !== 0 ? `฿${v.toLocaleString("th-TH", { maximumFractionDigits: 2 })}` : ""; };
const join = (...parts: (string | null | undefined)[]) => parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");

type MenuRowLite = {
  id: string; label: string; href: string; section: string | null; icon: string | null;
  app_keys: string[] | null; permission_key: string | null; is_active: boolean;
  search_keywords?: string[] | null;   // คำค้นเพิ่ม/คำพ้อง (ตั้งที่ /admin/menu)
};
type AppGroupLite = { key: string; label: string; permission_key: string | null; is_active: boolean };

// cache ทะเบียนเมนู/แอป สั้น ๆ (60 วิ) — ตารางเล็ก (~200 แถว) แต่ค้นถี่ (ทุกครั้งที่พิมพ์)
let menuCache: { at: number; rows: MenuRowLite[]; apps: AppGroupLite[] } | null = null;
const MENU_TTL = 60_000;

async function loadMenuRegistry() {
  if (menuCache && Date.now() - menuCache.at < MENU_TTL) return menuCache;
  const admin = supabaseAdmin();
  const [{ data: rows }, { data: apps }] = await Promise.all([
    admin.from("erp_menu_items").select("*").eq("is_active", true),
    admin.from("erp_app_groups").select("key, label, permission_key, is_active"),
  ]);
  menuCache = { at: Date.now(), rows: (rows ?? []) as MenuRowLite[], apps: (apps ?? []) as AppGroupLite[] };
  return menuCache;
}

type CanFn = (key: string | null | undefined) => boolean;

/** สิทธิ์ของคนที่ค้น — ใช้กรองเมนู/แอป/โมดูลที่เขาเห็นได้เท่านั้น (admin = เห็นหมด) */
async function loadMyAccess(sb: ReturnType<typeof supabaseFromRequest>, userId: string): Promise<{ can: CanFn }> {
  const [{ data: perms }, { data: prof }] = await Promise.all([
    sb.rpc("erp_my_permissions"),
    supabaseAdmin().from("user_profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  const isAdmin = (prof as { role?: string } | null)?.role === "admin";
  const set = new Set<string>(Array.isArray(perms) ? (perms as string[]) : []);
  return { can: (key) => !key || isAdmin || set.has(key) };
}

// ---- 📄 หน้า/เมนู — จากทะเบียนเมนูกลาง (erp_menu_items) ----

async function searchPages(q: string, can: CanFn, limit: number): Promise<SearchHit[]> {
  const toks = tokensOf(q);
  if (toks.length === 0) return [];
  const { rows, apps } = await loadMenuRegistry();
  const appByKey = new Map(apps.map((a) => [a.key, a]));
  const full = norm(q);

  const hits: SearchHit[] = [];
  const seenHref = new Set<string>();
  for (const r of rows) {
    if (!r.is_active || !r.href || !r.label) continue;
    if (!can(r.permission_key)) continue;
    // แอปที่เมนูนี้สังกัด + คนนี้เข้าได้ (ถ้าเมนูไม่สังกัดแอปไหน = เห็นได้ถ้าสิทธิ์เมนูผ่าน)
    const myApps = (r.app_keys ?? []).map((k) => appByKey.get(k)).filter((a): a is AppGroupLite => !!a && a.is_active && can(a.permission_key));
    if ((r.app_keys ?? []).length > 0 && myApps.length === 0) continue;
    if (seenHref.has(r.href)) continue;

    const label = norm(r.label);
    const section = norm(r.section);
    const keywords = (r.search_keywords ?? []).map(norm).filter(Boolean);
    const appLabels = myApps.map((a) => norm(a.label));
    let hrefText = r.href.toLowerCase();
    try { hrefText = decodeURIComponent(r.href).toLowerCase(); } catch { /* href เพี้ยน ใช้ดิบ */ }

    // ทุกคำต้องเจอที่ไหนสักแห่ง (ชื่อ / คำพ้อง / หมวด / ชื่อแอป / ลิงก์)
    const hay = [label, section, ...keywords, ...appLabels, hrefText];
    if (!toks.every((t) => hay.some((h) => h.includes(t)))) continue;

    let score = 0; let via: string | null = null;
    const kwExact = keywords.find((k) => k === full);
    const kwPart  = keywords.find((k) => k.includes(full) || full.includes(k));
    const kwToks  = keywords.find((k) => toks.some((t) => k.includes(t)));
    if (label.startsWith(full)) score = 100;
    else if (label.includes(full)) score = 85;
    else if (kwExact) { score = 80; via = kwExact; }
    else if (kwPart)  { score = 70; via = kwPart; }
    else if (toks.every((t) => label.includes(t))) score = 65;
    else if (toks.every((t) => keywords.some((k) => k.includes(t)))) { score = 60; via = kwToks ?? null; }
    else if (appLabels.some((a) => a.includes(full)) || section.includes(full)) score = 40;
    else score = 30;

    seenHref.add(r.href);
    const where = [myApps.map((a) => a.label).join(" / "), r.section].filter(Boolean).join(" · ");
    hits.push({
      entity_type: "page", id: r.id, label: `${r.icon && !/^https?:|^\//.test(r.icon) ? `${r.icon} ` : ""}${r.label}`,
      sublabel: (via ? `${where} · ตรงกับคำค้น "${via}"` : where) || null,
      link_url: r.href, score,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "th"));
  return hits.slice(0, limit);
}

// ---- 📖 วิธีใช้งาน — คู่มือทีละขั้น (erp_help_guides + steps) ----

type GuideRow = { id: string; title: string; description: string | null; category: string | null; icon: string | null };
type StepRow  = { guide_id: string; title: string | null; body: string | null; step_no: number };

async function searchGuides(q: string, limit: number): Promise<SearchHit[]> {
  const toks = tokensOf(q);
  if (toks.length === 0) return [];
  const admin = supabaseAdmin();
  const { data: guides } = await admin.from("erp_help_guides").select("id, title, description, category, icon").eq("is_active", true);
  const list = (guides ?? []) as GuideRow[];
  if (list.length === 0) return [];
  const { data: steps } = await admin.from("erp_help_guide_steps").select("guide_id, title, body, step_no").in("guide_id", list.map((g) => g.id));
  const stepsBy = new Map<string, StepRow[]>();
  for (const s of (steps ?? []) as StepRow[]) { const a = stepsBy.get(s.guide_id) ?? []; a.push(s); stepsBy.set(s.guide_id, a); }
  const full = norm(q);

  const hits: SearchHit[] = [];
  for (const g of list) {
    const title = norm(g.title), desc = norm(g.description), cat = norm(g.category);
    const gSteps = (stepsBy.get(g.id) ?? []).sort((a, b) => a.step_no - b.step_no);
    const stepHay = gSteps.map((s) => ({ s, text: `${norm(s.title)} ${norm(s.body)}` }));
    const hay = [title, desc, cat, ...stepHay.map((x) => x.text)];
    if (!toks.every((t) => hay.some((h) => h.includes(t)))) continue;

    let score = 0; let matchedStep: StepRow | null = null;
    if (title.startsWith(full)) score = 95;
    else if (title.includes(full)) score = 85;
    else if (toks.every((t) => title.includes(t))) score = 70;
    else if (desc.includes(full) || cat.includes(full)) score = 55;
    else {
      // เจอในเนื้อหาขั้นตอน → บอกด้วยว่าขั้นไหน
      matchedStep = stepHay.find((x) => toks.every((t) => x.text.includes(t)))?.s ?? stepHay.find((x) => x.text.includes(toks[0]))?.s ?? null;
      score = 35;
    }

    const base = g.description || `${gSteps.length} ขั้นตอน`;
    hits.push({
      entity_type: "guide", id: g.id, label: `${g.icon ? `${g.icon} ` : ""}${g.title}`,
      sublabel: matchedStep ? `${base} · ขั้นที่ ${matchedStep.step_no}: ${matchedStep.title ?? ""}` : base,
      link_url: `/master/help-guides?guide=${g.id}`, score,
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

// ---- 📦🏢🧾🏭 ข้อมูลธุรกิจจริง — ทะเบียนแหล่งค้น (1 แถว = 1 ชนิดข้อมูล) ----
//
// กติกาเดียวกันทุกชนิด (มาตรฐาน lib/search-score):
//   token-AND ที่ DB (ilike ต่อ token) ดึงผู้สมัคร ~40 → scoreRow ใน JS (รหัสตรงเป๊ะขึ้นก่อน) → เอา top N
//   เห็นเฉพาะโมดูลที่มีสิทธิ์ (permission ตรงกับที่ API/หน้าของโมดูลนั้นใช้)

type Row = Record<string, unknown>;
/** query builder ขั้นต่ำที่ใช้ (กัน type ของ supabase-js ที่ generic ซับซ้อน) */
type QB = {
  eq: (c: string, v: unknown) => QB;
  neq: (c: string, v: unknown) => QB;
  not: (c: string, op: string, v: unknown) => QB;
  or: (f: string) => QB;
  limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }>;
};
type Source = {
  entity: SearchEntity;
  table: string;
  /** สิทธิ์ที่ต้องมี (ทุกตัว) — ตรงกับ guard ของโมดูลนั้น */
  perms: string[];
  select: string;
  /** คอลัมน์ที่ค้นด้วย ilike (token-AND) */
  cols: string[];
  /** กรองเพิ่ม (ตัดที่ยกเลิก/พักใช้) */
  filter?: (q: QB) => QB;
  /** รหัส/เลขเอกสาร (ตรงเป๊ะ = ขึ้นบนสุด) */
  code: (r: Row) => string | null;
  /** ข้อความอื่นที่นับเป็น match */
  texts: (r: Row) => (string | null | undefined)[];
  label: (r: Row) => string;
  sublabel: (r: Row, can: CanFn) => string | null;
  link: (r: Row) => string;
  perEntity: number;
};

const s = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));

const SOURCES: Source[] = [
  {
    entity: "sku", table: "skus_v2", perms: ["products.view"],
    select: "id, code, name_th, barcode, color_th, color, list_price, standard_price, is_active",
    cols: ["code", "name_th", "barcode"],
    filter: (q) => q.eq("is_active", true),
    code: (r) => s(r, "code"), texts: (r) => [s(r, "name_th"), s(r, "barcode")],
    label: (r) => s(r, "code") || s(r, "name_th"),
    // ราคาทุน (standard_price) โชว์เฉพาะคนมีสิทธิ์ products.cost.view · ราคาขายโชว์ได้
    sublabel: (r, can) => join(s(r, "name_th"), s(r, "color_th") || s(r, "color"), money(r.list_price) && `ขาย ${money(r.list_price)}`, can("products.cost.view") && money(r.standard_price) ? `ทุน ${money(r.standard_price)}` : ""),
    link: (r) => `/master/skus?open=${s(r, "id")}`, perEntity: 5,
  },
  {
    entity: "partner", table: "partners_v2", perms: ["products.view"],
    select: "id, code, name_th, name_en, display_name, phone, mobile, tax_id, is_customer, is_supplier, is_taobao, province, is_active",
    cols: ["code", "name_th", "name_en", "display_name", "phone", "mobile", "tax_id"],
    filter: (q) => q.eq("is_active", true),
    code: (r) => s(r, "code"), texts: (r) => [s(r, "display_name"), s(r, "name_th"), s(r, "name_en"), s(r, "phone"), s(r, "mobile"), s(r, "tax_id")],
    label: (r) => s(r, "display_name") || s(r, "name_th") || s(r, "name_en") || s(r, "code"),
    sublabel: (r) => join(s(r, "code"), [r.is_customer ? "ลูกค้า" : "", r.is_supplier ? (r.is_taobao ? "ร้านจีน" : "ซัพพลายเออร์") : ""].filter(Boolean).join("/"), s(r, "phone") || s(r, "mobile"), s(r, "province")),
    link: (r) => `/master/partners?open=${s(r, "id")}`, perEntity: 4,
  },
  {
    entity: "po", table: "purchase_orders_v2", perms: ["products.view"],
    select: "id, po_no, seller_name, status, payment_status, grand_total, currency, order_date",
    cols: ["po_no", "seller_name"],
    filter: (q) => q.neq("status", "cancelled"),
    code: (r) => s(r, "po_no"), texts: (r) => [s(r, "seller_name")],
    label: (r) => s(r, "po_no") || "(PO)",
    sublabel: (r) => join(s(r, "seller_name"), st(r.status), r.payment_status ? `จ่าย: ${st(r.payment_status)}` : "", s(r, "order_date")),
    link: (r) => `/purchasing/po-list?open=${s(r, "id")}`, perEntity: 4,
  },
  {
    entity: "pv", table: "purchase_vouchers_v2", perms: ["products.cost.view"],
    select: "id, pv_no, seller_name, status, grand_total_thb, voucher_date, tracking_no, carrier_name, is_active",
    cols: ["pv_no", "seller_name", "tracking_no", "carrier_name"],
    filter: (q) => q.not("is_active", "is", false).neq("status", "cancelled"),
    code: (r) => s(r, "pv_no"), texts: (r) => [s(r, "seller_name"), s(r, "tracking_no"), s(r, "carrier_name")],
    label: (r) => s(r, "pv_no") || "(ใบสำคัญรับ)",
    sublabel: (r) => join(s(r, "seller_name"), st(r.status), money(r.grand_total_thb), s(r, "tracking_no") && `พัสดุ ${s(r, "tracking_no")}`),
    link: (r) => `/purchasing/vouchers/${s(r, "id")}`, perEntity: 3,
  },
  {
    entity: "mo", table: "manufacturing_orders", perms: ["products.view"],
    select: "id, mo_no, product_sku, product_name, qty, status, due_date, so_order_no, is_active",
    cols: ["mo_no", "product_sku", "product_name", "so_order_no"],
    filter: (q) => q.eq("is_active", true).neq("status", "cancelled"),
    code: (r) => s(r, "mo_no"), texts: (r) => [s(r, "product_sku"), s(r, "product_name"), s(r, "so_order_no")],
    label: (r) => s(r, "mo_no") || "(MO)",
    sublabel: (r) => join(s(r, "product_sku"), s(r, "product_name"), r.qty != null ? `${Number(r.qty).toLocaleString("th-TH")} ชิ้น` : "", st(r.status), s(r, "due_date") && `กำหนด ${s(r, "due_date")}`),
    // ใบที่ยังอยู่บนบอร์ด → เปิดบนบอร์ดจ่ายงานเลย · ใบเสร็จแล้วบอร์ดไม่โชว์ → ไปหน้ารายการ MO
    link: (r) => (s(r, "status") === "done" ? "/master/manufacturing-orders" : `/master/work-board?mo=${s(r, "id")}`), perEntity: 4,
  },
  {
    entity: "invoice", table: "erp_playground_sales_orders", perms: ["so.view"],
    select: "id, so_number, tax_invoice_no, customer_name, customer_code, status, grand_total, order_date",
    cols: ["so_number", "tax_invoice_no", "customer_name", "customer_code"],
    code: (r) => s(r, "so_number"), texts: (r) => [s(r, "tax_invoice_no"), s(r, "customer_name"), s(r, "customer_code")],
    label: (r) => s(r, "so_number") || s(r, "tax_invoice_no") || "(ใบขาย)",
    sublabel: (r) => join(s(r, "tax_invoice_no") && `ใบกำกับ ${s(r, "tax_invoice_no")}`, s(r, "customer_name"), st(r.status), money(r.grand_total), s(r, "order_date")),
    link: (r) => `/sales-orders?open=${s(r, "id")}`, perEntity: 4,
  },
  {
    entity: "quotation", table: "erp_playground_quotations", perms: ["qt.view"],
    select: "id, quote_number, customer_name, customer_code, status, grand_total, quote_date",
    cols: ["quote_number", "customer_name", "customer_code"],
    code: (r) => s(r, "quote_number"), texts: (r) => [s(r, "customer_name"), s(r, "customer_code")],
    label: (r) => s(r, "quote_number") || "(ใบเสนอราคา)",
    sublabel: (r) => join(s(r, "customer_name"), st(r.status), money(r.grand_total), s(r, "quote_date")),
    link: () => "/quotations", perEntity: 3,
  },
  {
    entity: "billing", table: "erp_playground_billing_notes", perms: ["so.view"],
    select: "id, bill_number, customer_name, customer_code, status, grand_total, bill_date",
    cols: ["bill_number", "customer_name", "customer_code"],
    code: (r) => s(r, "bill_number"), texts: (r) => [s(r, "customer_name"), s(r, "customer_code")],
    label: (r) => s(r, "bill_number") || "(ใบวางบิล)",
    sublabel: (r) => join(s(r, "customer_name"), st(r.status), money(r.grand_total), s(r, "bill_date")),
    link: (r) => `/billing-notes?open=${s(r, "id")}`, perEntity: 3,
  },
  {
    entity: "delivery", table: "erp_playground_delivery_notes", perms: ["so.view"],
    select: "id, dn_number, customer_name, customer_code, status, so_numbers, delivery_date",
    cols: ["dn_number", "customer_name", "customer_code"],
    code: (r) => s(r, "dn_number"), texts: (r) => [s(r, "customer_name"), s(r, "customer_code"), Array.isArray(r.so_numbers) ? (r.so_numbers as string[]).join(" ") : ""],
    label: (r) => s(r, "dn_number") || "(ใบส่งสินค้า)",
    sublabel: (r) => join(s(r, "customer_name"), st(r.status), Array.isArray(r.so_numbers) && (r.so_numbers as string[]).length ? `จากใบขาย ${(r.so_numbers as string[]).join(", ")}` : "", s(r, "delivery_date")),
    link: (r) => `/delivery-notes?id=${s(r, "id")}`, perEntity: 3,
  },
  {
    entity: "cn", table: "erp_playground_credit_notes", perms: ["cn.view"],
    select: "id, cn_number, ref_invoice_no, customer_name, status, grand_total, cn_date",
    cols: ["cn_number", "ref_invoice_no", "customer_name"],
    code: (r) => s(r, "cn_number"), texts: (r) => [s(r, "ref_invoice_no"), s(r, "customer_name")],
    label: (r) => s(r, "cn_number") || "(ใบลดหนี้)",
    sublabel: (r) => join(s(r, "ref_invoice_no") && `อ้างใบกำกับ ${s(r, "ref_invoice_no")}`, s(r, "customer_name"), st(r.status), money(r.grand_total)),
    link: (r) => `/credit-notes?open=${s(r, "id")}`, perEntity: 2,
  },
  {
    entity: "task", table: "erp_creative_tasks", perms: ["tasks.view"],
    select: "id, task_no, title, product_name, status, due_date, is_active",
    cols: ["task_no", "title", "product_name"],
    filter: (q) => q.eq("is_active", true),
    code: (r) => s(r, "task_no"), texts: (r) => [s(r, "title"), s(r, "product_name")],
    label: (r) => s(r, "title") || s(r, "task_no"),
    sublabel: (r) => join(s(r, "task_no"), s(r, "product_name"), st(r.status), s(r, "due_date") && `กำหนด ${s(r, "due_date")}`),
    link: (r) => `/tasks?task=${s(r, "id")}`, perEntity: 4,
  },
  {
    // พนักงาน — ต้องมีทั้งสิทธิ์เข้าแอป payroll และ employees.view (ตาม guardPayroll) · ไม่ค้น/ไม่โชว์เลขบัตร ปชช./บัญชี
    entity: "employee", table: "employees", perms: ["app.payroll", "employees.view"],
    select: "id, employee_code, nickname, first_name, last_name, first_name_th, last_name_th, phone, employment_status",
    cols: ["employee_code", "nickname", "first_name", "last_name", "first_name_th", "last_name_th", "phone"],
    filter: (q) => q.eq("employment_status", "active"),
    code: (r) => s(r, "employee_code"), texts: (r) => [s(r, "nickname"), `${s(r, "first_name_th") || s(r, "first_name")} ${s(r, "last_name_th") || s(r, "last_name")}`, s(r, "phone")],
    label: (r) => join(s(r, "nickname") && `${s(r, "nickname")}`, `${s(r, "first_name_th") || s(r, "first_name")} ${s(r, "last_name_th") || s(r, "last_name")}`.trim()) || s(r, "employee_code"),
    sublabel: (r) => join(s(r, "employee_code"), s(r, "phone")),
    link: (r) => `/payroll/employees/${s(r, "id")}`, perEntity: 4,
  },
  {
    entity: "user", table: "user_profiles", perms: ["admin.users"],
    select: "id, display_name, email, username, role, active",
    cols: ["display_name", "email", "username"],
    filter: (q) => q.eq("active", true),
    code: (r) => s(r, "username"), texts: (r) => [s(r, "display_name"), s(r, "email")],
    label: (r) => s(r, "display_name") || s(r, "email"),
    sublabel: (r) => join(s(r, "email"), s(r, "role")),
    link: (r) => `/admin/users?id=${s(r, "id")}`, perEntity: 3,
  },
];

const CANDIDATES = 40;   // ดึงผู้สมัครต่อชนิดแล้วค่อยจัดอันดับใน JS (ตามมาตรฐาน picker)

async function searchSource(src: Source, q: string, toks: string[], can: CanFn): Promise<SearchHit[]> {
  if (!src.perms.every((p) => can(p))) return [];
  const admin = supabaseAdmin();
  let query = admin.from(src.table).select(src.select) as unknown as QB;
  if (src.filter) query = src.filter(query);
  for (const t of toks) query = query.or(ilikeOr(src.cols, t));   // token-AND
  const { data, error } = await query.limit(CANDIDATES);
  if (error || !Array.isArray(data)) return [];
  const rows = data as Row[];
  return rows
    .map((r) => ({ r, score: scoreRow(q, toks, { code: src.code(r), texts: src.texts(r) }) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, src.perEntity)
    .map(({ r, score }) => ({
      entity_type: src.entity, id: s(r, "id"),
      label: src.label(r), sublabel: src.sublabel(r, can) || null,
      link_url: src.link(r), score,
    }));
}

/** ค้นทุกชนิดพร้อมกัน (เฉพาะที่มีสิทธิ์) → คงลำดับกลุ่มตามทะเบียน */
async function searchData(q: string, can: CanFn): Promise<SearchHit[]> {
  const toks = tokenize(q);
  if (toks.length === 0) return [];
  const results = await Promise.all(SOURCES.map((src) => searchSource(src, q, toks, can).catch(() => [] as SearchHit[])));
  return results.flat();
}

// ---- 🖼️ ไฟล์/artwork จากคลังกลาง ----

async function searchAssets(q: string): Promise<SearchHit[]> {
  const admin = supabaseAdmin();
  let aq = admin.from("assets").select("id, title, file_name, source").eq("status", "active");
  for (const raw of q.split(/\s+/)) {
    const t = raw.replace(/[,()%*]/g, " ").trim();
    if (t) aq = aq.or(`title.ilike.%${t}%,file_name.ilike.%${t}%,keywords.ilike.%${t}%`);
  }
  const { data: assets } = await aq.limit(6);
  return (assets ?? []).map((a) => {
    const r = a as { id: string; title: string | null; file_name: string; source: string };
    return {
      entity_type: "asset" as const, id: r.id, label: r.title || r.file_name,
      sublabel: r.source === "artwork" ? "Artwork" : r.source === "odoo_product" ? "รูปสินค้า" : "ไฟล์ในคลัง",
      link_url: "/master/assets", score: 0,
    };
  });
}

// ---- GET ?q=...&limit=8 ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (!q) return NextResponse.json({ data: [], error: null } satisfies GlobalSearchResponse);

  const sb = supabaseFromRequest(request);
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ data: [], error: "กรุณาเข้าสู่ระบบ" } satisfies GlobalSearchResponse, { status: 401 });

  const access = await loadMyAccess(sb, auth.user.id).catch((): { can: CanFn } => ({ can: (k) => !k }));

  // ยิงพร้อมกัน: หน้า/เมนู · คู่มือ · ข้อมูลธุรกิจ (ทุกโมดูลที่มีสิทธิ์) · ไฟล์ — ตัวไหนพังไม่กระทบตัวอื่น
  const [pageHits, guideHits, dataHits, assetHits] = await Promise.all([
    searchPages(q, access.can, 6).catch(() => [] as SearchHit[]),
    searchGuides(q, 3).catch(() => [] as SearchHit[]),
    searchData(q, access.can).catch(() => [] as SearchHit[]),
    searchAssets(q).catch(() => [] as SearchHit[]),
  ]);

  // ลำดับกลุ่ม: หน้า/เมนู → วิธีใช้งาน → ข้อมูล (SKU/คู่ค้า/PO/…/พนักงาน/ผู้ใช้) → ไฟล์
  const hits = [...pageHits, ...guideHits, ...dataHits, ...assetHits];
  return NextResponse.json({ data: hits, error: null } satisfies GlobalSearchResponse);
}
