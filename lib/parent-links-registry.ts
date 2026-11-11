/**
 * ทะเบียนกลาง "รายการที่ผูกกับรุ่นสินค้า (Parent SKU)" — แหล่งเดียวของแท็บภาพรวม → "รายการที่เชื่อมกับสินค้านี้"
 *
 * เจ้าของขอ 2026-11-11: "ตรงภาพรวมอยากให้โชว์รายการที่ลิ้งค์กับ Parent SKU นี้ทั้งหมด · ถ้ามีเพิ่มรายการใหม่ให้มาเพิ่มตรงนี้
 *   (บางทีลืม) ทำเป็นของกลาง · ต้องเชื่อมกลับได้ กดไปที่รายการนั้นได้ · ถ้าเป็นงาน creative หรือ Content อยากให้โชว์รูปด้วย"
 *
 * วิธีเพิ่มแหล่งใหม่: ใส่ 1 ก้อนใน PARENT_LINK_SOURCES (ตาราง · วิธีผูก · หน้าตาแถว · ลิงก์) — หน้าจอ/API ไม่ต้องแก้
 * กันลืม: เทสต์ lib/__tests__/parent-links-registry.test.ts อ่าน supabase/migrations ทุกไฟล์
 *   ตารางไหนมีคอลัมน์ parent_sku* แต่ไม่อยู่ในทะเบียนนี้ และไม่อยู่ใน PARENT_LINK_IGNORED (พร้อมเหตุผล) → เทสต์ไม่ผ่าน
 * ผู้ใช้: lib/parent-links-server (อ่านข้อมูลตามทะเบียน) → GET /api/parent-skus/[id]/links → components/parent-linked-records
 * ฝั่ง server เท่านั้น (มีฟังก์ชันแปลงแถว) — หน้าเว็บได้แค่ผลลัพธ์จาก API
 */

export type LinkGroup = "creative" | "design" | "production" | "sales" | "web" | "marketing" | "purchase";

export const LINK_GROUPS: { key: LinkGroup; label: string; icon: string }[] = [
  { key: "creative", label: "งานครีเอทีฟ / คอนเทนต์", icon: "🎬" },
  { key: "design", label: "ออกแบบ / แพทเทิร์น", icon: "📐" },
  { key: "production", label: "ผลิต", icon: "🏭" },
  { key: "sales", label: "ขาย / แพลตฟอร์ม", icon: "🏬" },
  { key: "web", label: "เว็บร้าน", icon: "🛍" },
  { key: "marketing", label: "การตลาด", icon: "📣" },
  { key: "purchase", label: "จัดซื้อ", icon: "🛒" },
];

/** วิธีหาแถวที่ผูกกับรุ่นนี้ (ใช้หลายวิธีได้ ระบบรวม + ตัดซ้ำด้วย id) */
export type LinkMatch =
  | { by: "parent_id"; column: string }                       // คอลัมน์เก็บ id ของ Parent
  | { by: "parent_code"; column: string }                     // คอลัมน์ข้อความเก็บรหัส Parent
  | { by: "parent_codes"; column: string }                    // คอลัมน์ jsonb array (["WK46", ...]) ที่มีรหัส Parent อยู่
  | { by: "sku_ids"; column: string }                         // คอลัมน์เก็บ id ของ SKU ลูก
  | { by: "sku_codes"; column: string }                       // คอลัมน์เก็บรหัส SKU ลูก
  | { by: "via"; table: string; parentColumn: string; idColumn: string }    // ตารางเชื่อม: parent id → id ของตารางหลัก
  /** บรรทัดเอกสารที่เก็บ SKU ลูก (รหัสหรือ id) → id หัวเอกสาร เช่น บรรทัดใบเสนอราคา.sku → quote_id */
  | { by: "via_sku"; table: string; skuColumn: string; skuKind: "code" | "id"; idColumn: string };

export type LinkOpen = { kind: "listing" | "mo"; id: string };
export type LinkItem = {
  id: string; title: string; sub?: string | null; date?: string | null; status?: string | null;
  /** รูป: key ใน R2 หรือ url ตรง (http) */
  image?: { key?: string | null; url?: string | null } | null;
  href?: string | null; external?: boolean;
  /** เปิดป๊อปของกลางแทนการไปหน้าอื่น (รายการบนร้าน = ListingDrawer · ใบสั่งผลิต = MoStatusModal) */
  open?: LinkOpen | null;
};

type Row = Record<string, unknown>;
export type ParentLinkSource = {
  key: string; group: LinkGroup; label: string; icon: string;
  table: string; select: string; match: LinkMatch[];
  order?: { column: string; ascending?: boolean };
  /** กรองเพิ่ม: คอลัมน์ที่ต้องไม่เป็น false (is_active) / ต้องเป็น null (trashed_at) */
  notFalse?: string; mustBeNull?: string;
  /** โชว์เป็นกริดรูป (งานครีเอทีฟ/คอนเทนต์/รูปในคลัง) */
  thumbnails?: boolean;
  /**
   * ค้นช้า (ตารางใหญ่ไม่มีดัชนี) → ไม่โหลดตอนเปิดแท็บ · หน้าจอโชว์ปุ่ม "ค้น…" ให้กดโหลดเอง (API ?only=<key>)
   * assets: ยังไม่มีดัชนีบน parent_sku_codes (migration 202612030300 รอเจ้าของอนุมัติ) — ใส่ดัชนีแล้วเอา lazy ออกได้
   */
  lazy?: boolean;
  /** บอกผู้ใช้ว่าดู/แก้ที่ไหน เมื่อแถวไม่มีลิงก์ของตัวเอง เช่น "ดูในแท็บผลิต" */
  hint?: string;
  /** ลิงก์ "ดูทั้งหมด" ของหมวดนี้ */
  listHref?: (ctx: { parentId: string; parentCode: string }) => string | null;
  toItem: (r: Row) => LinkItem;
};

const s = (v: unknown) => (v == null ? "" : String(v).trim());
const join = (...xs: unknown[]) => xs.map(s).filter(Boolean).join(" · ");
const day = (...xs: unknown[]) => { for (const x of xs) if (s(x)) return s(x).slice(0, 10); return null; };
const firstOf = (v: unknown) => (Array.isArray(v) && v.length ? s(v[0]) || null : null);
const isHttp = (v: unknown) => /^https?:\/\//i.test(s(v));
const money = (v: unknown) => (v == null || v === "" ? null : `฿${(Number(v) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`);

export const PARENT_LINK_SOURCES: ParentLinkSource[] = [
  // ── งานครีเอทีฟ / คอนเทนต์ (มีรูป) ──
  {
    key: "creative_tasks", group: "creative", label: "งาน / ถ่าย / โพสต์", icon: "🗂", thumbnails: true,
    table: "erp_creative_tasks", select: "id, task_no, title, status, due_date, created_at, cover_image_r2_key",
    match: [
      { by: "parent_id", column: "parent_sku_id" },
      { by: "via", table: "erp_creative_task_parent_skus", parentColumn: "parent_sku_id", idColumn: "task_id" },
      { by: "sku_ids", column: "sku_id" },
    ],
    order: { column: "created_at", ascending: false },
    toItem: (r) => ({ id: s(r.id), title: join(r.task_no, r.title) || "(ไม่มีชื่อ)", status: s(r.status) || null, date: day(r.due_date, r.created_at),
      image: { key: s(r.cover_image_r2_key) || null }, href: `/tasks?task=${encodeURIComponent(s(r.id))}` }),
  },
  {
    key: "creative_content", group: "creative", label: "คอนเทนต์", icon: "📝", thumbnails: true,
    table: "erp_creative_content", select: "id, content_no, title, status, post_status, created_at, ref_image_keys",
    match: [
      { by: "parent_id", column: "parent_sku_id" },
      { by: "via", table: "erp_creative_content_products", parentColumn: "parent_sku_id", idColumn: "content_id" },
      { by: "sku_ids", column: "sku_id" },
    ],
    order: { column: "created_at", ascending: false },
    toItem: (r) => ({ id: s(r.id), title: join(r.content_no, r.title) || "(ไม่มีชื่อ)", status: s(r.post_status) || s(r.status) || null, date: day(r.created_at),
      image: { key: firstOf(r.ref_image_keys) }, href: `/tasks/content?content=${encodeURIComponent(s(r.id))}` }),
  },
  {
    key: "content_albums", group: "creative", label: "อัลบั้มคอนเทนต์", icon: "🖼", thumbnails: true,
    table: "content_albums", select: "id, phase, due_date, created_at, picked_asset_ids", mustBeNull: "trashed_at",
    match: [{ by: "parent_codes", column: "parent_sku_codes" }],
    order: { column: "created_at", ascending: false },
    // รูปปก = ไฟล์แรกที่เลือกไว้ (เติมใน lib/parent-links-server → _cover_key)
    toItem: (r) => ({ id: s(r.id), title: `อัลบั้ม${s(r.due_date) ? ` ส่ง ${s(r.due_date)}` : ""}`, status: s(r.phase) || null, date: day(r.due_date, r.created_at),
      image: { key: s(r._cover_key) || null }, href: `/master/assets?source=contents&album=${encodeURIComponent(s(r.id))}` }),
  },
  {
    key: "assets", group: "creative", label: "ไฟล์ในคลังรูป", icon: "🗃", thumbnails: true, lazy: true,
    table: "assets", select: "id, title, file_name, r2_key, status, created_at",
    match: [{ by: "parent_codes", column: "parent_sku_codes" }],
    order: { column: "created_at", ascending: false },
    toItem: (r) => ({ id: s(r.id), title: s(r.title) || s(r.file_name) || "(ไม่มีชื่อ)", status: s(r.status) || null, date: day(r.created_at),
      image: { key: s(r.r2_key) || null }, href: `/master/assets?asset=${encodeURIComponent(s(r.id))}` }),
  },
  {
    key: "creative_projects", group: "creative", label: "โปรเจกต์ครีเอทีฟ", icon: "📁",
    table: "erp_creative_projects", select: "id, code, name, status, created_at, google_slides_url, drive_folder_url",
    match: [
      { by: "parent_id", column: "parent_sku_id" },
      { by: "via", table: "erp_creative_project_skus", parentColumn: "parent_sku_id", idColumn: "project_id" },
    ],
    toItem: (r) => {
      const ext = s(r.google_slides_url) || s(r.drive_folder_url);
      return { id: s(r.id), title: join(r.code, r.name) || "(ไม่มีชื่อ)", status: s(r.status) || null, date: day(r.created_at), href: ext || null, external: !!ext };
    },
  },
  {
    key: "creative_board_items", group: "creative", label: "ไอเดียบนบอร์ด", icon: "📌", thumbnails: true,
    table: "erp_creative_board_items", select: "id, title, url, r2_key, thumbnail_url, status, created_at",
    match: [{ by: "parent_id", column: "parent_sku_id" }, { by: "sku_ids", column: "sku_id" }],
    toItem: (r) => ({ id: s(r.id), title: s(r.title) || "(ไม่มีชื่อ)", status: s(r.status) || null, date: day(r.created_at),
      image: { key: s(r.r2_key) || null, url: isHttp(r.thumbnail_url) ? s(r.thumbnail_url) : null },
      href: isHttp(r.url) ? s(r.url) : null, external: isHttp(r.url) }),
  },

  // ── ออกแบบ / แพทเทิร์น ──
  {
    key: "design_sheets", group: "design", label: "ใบออกแบบ", icon: "📐",
    table: "design_sheets", select: "id, code, name, status, order_date, created_at",
    match: [{ by: "parent_code", column: "parent_sku_code" }, { by: "parent_codes", column: "parent_sku_codes" }],
    order: { column: "created_at", ascending: false },
    toItem: (r) => ({ id: s(r.id), title: join(r.code, r.name) || "(ไม่มีชื่อ)", status: s(r.status) || null, date: day(r.order_date, r.created_at),
      href: `/master/design-dashboard/sheet/${encodeURIComponent(s(r.id))}` }),
  },
  {
    key: "pattern_tickets", group: "design", label: "ตั๋วแพทเทิร์น", icon: "✂️",
    table: "pattern_tickets", select: "id, ticket_no, title, status, due_date, assignee_name, created_at",
    match: [{ by: "parent_id", column: "parent_sku_id" }],
    order: { column: "created_at", ascending: false },
    toItem: (r) => ({ id: s(r.id), title: join(r.ticket_no, r.title) || "(ไม่มีชื่อ)", sub: s(r.assignee_name) || null, status: s(r.status) || null,
      date: day(r.due_date, r.created_at), href: `/design/pattern-tickets?id=${encodeURIComponent(s(r.id))}` }),
  },

  // ── ผลิต (ผูกผ่าน SKU ลูก) ──
  {
    key: "manufacturing_orders", group: "production", label: "ใบสั่งผลิต", icon: "🏭",
    table: "manufacturing_orders", select: "id, mo_no, product_sku, qty, status, order_date, created_at, is_active",
    match: [{ by: "sku_codes", column: "product_sku" }],
    order: { column: "created_at", ascending: false },
    toItem: (r) => ({ id: s(r.id), title: s(r.mo_no), sub: join(r.product_sku, `${Number(r.qty) || 0} ชิ้น`),
      status: r.is_active === false ? "cancelled" : s(r.status) || null, date: day(r.order_date, r.created_at), open: { kind: "mo", id: s(r.id) } }),
  },
  {
    key: "bom_headers", group: "production", label: "สูตรผลิต (BOM)", icon: "🧾", notFalse: "is_active",
    table: "bom_headers", select: "id, bom_code, product_sku, version, status, updated_at",
    match: [{ by: "sku_codes", column: "product_sku" }],
    hint: "ดูทุกเวอร์ชันในแท็บ “ผลิต”",
    toItem: (r) => ({ id: s(r.id), title: join(r.bom_code, r.version), sub: s(r.product_sku) || null, status: s(r.status) || null, date: day(r.updated_at),
      href: s(r.product_sku) ? `/master/bom?open=${encodeURIComponent(s(r.product_sku))}` : null }),
  },
  {
    key: "parent_sku_issues", group: "production", label: "ปัญหาของสินค้า", icon: "⚠️", notFalse: "is_active",
    table: "parent_sku_issues", select: "id, problem_text, sku, created_by_name, created_at",
    match: [{ by: "parent_id", column: "parent_sku_id" }],
    hint: "เพิ่ม/แก้ในแท็บ “ผลิต”",
    toItem: (r) => ({ id: s(r.id), title: s(r.problem_text) || "(ไม่มีรายละเอียด)", sub: join(r.sku, r.created_by_name) || null, date: day(r.created_at) }),
  },

  // ── ขาย / แพลตฟอร์ม ──
  {
    key: "platform_catalog_listings", group: "sales", label: "สินค้าบนร้าน (จับคู่แล้ว)", icon: "🏬",
    table: "platform_catalog_listings", select: "id, title, sku_code, status, external_product_id, created_at",
    match: [{ by: "parent_id", column: "matched_parent_sku_id" }],
    toItem: (r) => ({ id: s(r.id), title: s(r.title) || s(r.sku_code) || "(ไม่มีชื่อ)", sub: join(r.sku_code, s(r.external_product_id) ? `#${s(r.external_product_id)}` : ""),
      status: s(r.status) || null, date: day(r.created_at), open: { kind: "listing", id: s(r.id) } }),
  },
  {
    key: "platform_listing_drafts", group: "sales", label: "ร่างลงร้าน", icon: "📝",
    table: "platform_listing_drafts", select: "id, title, status, last_sync_status, updated_at",
    match: [{ by: "parent_id", column: "parent_sku_id" }],
    hint: "แก้ในแท็บ “แพลตฟอร์ม”",
    toItem: (r) => ({ id: s(r.id), title: s(r.title) || "(ยังไม่ตั้งชื่อ)", status: s(r.last_sync_status) || s(r.status) || null, date: day(r.updated_at) }),
  },
  {
    key: "platform_order_items", group: "sales", label: "ออเดอร์จากร้าน", icon: "🧾",
    table: "platform_order_items", select: "id, order_id, sku_code, name, qty, price",
    match: [{ by: "parent_id", column: "matched_parent_sku_id" }, { by: "sku_ids", column: "matched_sku_id" }],
    listHref: () => "/master/platform-orders",
    toItem: (r) => ({ id: s(r.id), title: s(r.name) || s(r.sku_code) || "(ไม่มีชื่อ)",
      sub: join(r.sku_code, `${Number(r.qty) || 0} × ฿${(Number(r.price) || 0).toLocaleString("th-TH")}`) }),
  },

  // ── เอกสารขาย (ผูกผ่านบรรทัดที่มี SKU ลูก) ──
  {
    key: "quotations", group: "sales", label: "ใบเสนอราคา", icon: "📄",
    table: "erp_playground_quotations", select: "id, quote_number, status, customer_name, grand_total, quote_date, updated_at",
    match: [{ by: "via_sku", table: "erp_playground_quote_lines", skuColumn: "sku", skuKind: "code", idColumn: "quote_id" }],
    order: { column: "quote_date", ascending: false },
    toItem: (r) => ({ id: s(r.id), title: join(r.quote_number, r.customer_name) || "(ไม่มีเลข)", sub: money(r.grand_total),
      status: s(r.status) || null, date: day(r.quote_date, r.updated_at), href: `/quotations?open=${encodeURIComponent(s(r.id))}` }),
  },
  {
    key: "sales_orders", group: "sales", label: "ใบสั่งขาย", icon: "🧾",
    table: "erp_playground_sales_orders", select: "id, so_number, status, customer_name, grand_total, order_date, updated_at",
    match: [{ by: "via_sku", table: "erp_playground_so_lines", skuColumn: "sku", skuKind: "code", idColumn: "so_id" }],
    order: { column: "order_date", ascending: false },
    toItem: (r) => ({ id: s(r.id), title: join(r.so_number, r.customer_name) || "(ไม่มีเลข)", sub: money(r.grand_total),
      status: s(r.status) || null, date: day(r.order_date, r.updated_at), href: `/sales-orders?open=${encodeURIComponent(s(r.id))}` }),
  },
  {
    key: "so_orders", group: "sales", label: "ใบสั่งขาย (ระบบใหม่)", icon: "🧾",
    table: "so_orders", select: "id, order_no, status, customer_name, grand_total, order_date, cancelled_at, updated_at",
    match: [{ by: "via_sku", table: "so_order_lines", skuColumn: "sku", skuKind: "code", idColumn: "order_id" }],
    order: { column: "order_date", ascending: false },
    toItem: (r) => ({ id: s(r.id), title: join(r.order_no, r.customer_name) || "(ไม่มีเลข)", sub: money(r.grand_total),
      status: s(r.cancelled_at) ? "cancelled" : s(r.status) || null, date: day(r.order_date, r.updated_at), href: `/sales/orders?open=${encodeURIComponent(s(r.id))}` }),
  },
  {
    key: "delivery_notes", group: "sales", label: "ใบส่งของ", icon: "🚚",
    table: "erp_playground_delivery_notes", select: "id, dn_number, status, customer_name, delivery_date, updated_at",
    match: [{ by: "via_sku", table: "erp_playground_delivery_note_lines", skuColumn: "sku", skuKind: "code", idColumn: "delivery_note_id" }],
    order: { column: "delivery_date", ascending: false },
    toItem: (r) => ({ id: s(r.id), title: join(r.dn_number, r.customer_name) || "(ไม่มีเลข)", status: s(r.status) || null,
      date: day(r.delivery_date, r.updated_at), href: `/delivery-notes?id=${encodeURIComponent(s(r.id))}` }),
  },

  // ── เว็บร้าน ──
  {
    key: "store_listings", group: "web", label: "ลงขายบนเว็บร้าน", icon: "🛍", thumbnails: true,
    table: "store_listings", select: "id, web_name, web_images, created_at",
    match: [{ by: "parent_id", column: "parent_sku_id" }],
    hint: "แก้ในแท็บ “เว็บไซต์”",
    toItem: (r) => ({ id: s(r.id), title: s(r.web_name) || "รายการบนเว็บ", date: day(r.created_at), image: { key: firstOf(r.web_images) } }),
  },
  {
    key: "store_print_designs", group: "web", label: "ลายสั่งพิมพ์ของลูกค้า", icon: "🖨",
    table: "store_print_designs", select: "id, code, status, review_status, created_at",
    match: [{ by: "parent_id", column: "parent_sku_id" }],
    toItem: (r) => ({ id: s(r.id), title: s(r.code) || "ลายพิมพ์", status: s(r.review_status) || s(r.status) || null, date: day(r.created_at) }),
  },
  {
    key: "store_restock_requests", group: "web", label: "ลูกค้าขอให้แจ้งเมื่อของเข้า", icon: "🔔",
    table: "store_restock_requests", select: "id, name, status, created_at",
    match: [{ by: "parent_id", column: "parent_sku_id" }],
    toItem: (r) => ({ id: s(r.id), title: s(r.name) || "ลูกค้า", status: s(r.status) || null, date: day(r.created_at) }),
  },
  {
    key: "store_wishlists", group: "web", label: "ลูกค้ากดถูกใจ", icon: "❤️",
    table: "store_wishlists", select: "id, created_at",
    match: [{ by: "parent_id", column: "parent_sku_id" }],
    toItem: (r) => ({ id: s(r.id), title: "ถูกใจ", date: day(r.created_at) }),
  },

  // ── การตลาด ──
  {
    key: "marketing_skus", group: "marketing", label: "อยู่ในรายการสินค้าการตลาด", icon: "📣",
    table: "marketing_skus", select: "id, note, created_at",
    match: [{ by: "parent_id", column: "parent_sku_id" }],
    listHref: () => "/marketing/skus",
    toItem: (r) => ({ id: s(r.id), title: s(r.note) || "รายการสินค้าการตลาด", date: day(r.created_at), href: "/marketing/skus" }),
  },
  {
    key: "marketing_work_job_items", group: "marketing", label: "งานโปรโมชัน / ตั้งราคา", icon: "🏷",
    table: "marketing_work_job_items", select: "id, job_id, note, created_at",
    match: [{ by: "parent_id", column: "parent_sku_id" }],
    toItem: (r) => ({ id: s(r.id), title: s(r.note) || "งานการตลาด", date: day(r.created_at),
      href: s(r.job_id) ? `/marketing/skus?job=${encodeURIComponent(s(r.job_id))}` : "/marketing/skus" }),
  },

  // ── จัดซื้อ ──
  {
    key: "purchase_orders", group: "purchase", label: "ใบสั่งซื้อ (PO)", icon: "🛒",
    table: "purchase_orders_v2", select: "id, po_no, status, order_date, grand_total, is_active, updated_at",
    match: [{ by: "via_sku", table: "purchase_order_lines_v2", skuColumn: "item_sku_id", skuKind: "id", idColumn: "po_id" }],
    order: { column: "order_date", ascending: false },
    toItem: (r) => ({ id: s(r.id), title: s(r.po_no) || "(ไม่มีเลข)", sub: money(r.grand_total),
      status: r.is_active === false ? "cancelled" : s(r.status) || null, date: day(r.order_date, r.updated_at),
      href: `/purchasing/po-list?open=${encodeURIComponent(s(r.id))}` }),
  },
  {
    key: "purchase_requests", group: "purchase", label: "ใบขอซื้อ (สินค้านี้ / ซื้อเพื่อผลิตสินค้านี้)", icon: "📝", notFalse: "is_active",
    table: "purchase_requests_v2", select: "id, pr_no, status, order_date, needed_date, source_mo_no, updated_at",
    match: [{ by: "sku_ids", column: "item_sku_id" }, { by: "sku_ids", column: "used_for_sku_id" }],
    order: { column: "updated_at", ascending: false },
    listHref: () => "/purchasing",
    toItem: (r) => ({ id: s(r.id), title: s(r.pr_no) || "(ไม่มีเลข)", sub: s(r.source_mo_no) ? `จากใบสั่งผลิต ${s(r.source_mo_no)}` : null,
      status: s(r.status) || null, date: day(r.order_date, r.needed_date, r.updated_at) }),
  },
  {
    key: "taobao_products", group: "purchase", label: "สินค้าจาก Taobao", icon: "🛒", thumbnails: true,
    table: "taobao_products", select: "id, translated_name, original_name, image_url, taobao_url, status, created_at",
    match: [{ by: "parent_id", column: "matched_parent_sku_id" }, { by: "sku_ids", column: "matched_sku_id" }],
    toItem: (r) => ({ id: s(r.id), title: s(r.translated_name) || s(r.original_name) || "(ไม่มีชื่อ)", status: s(r.status) || null, date: day(r.created_at),
      image: { url: isHttp(r.image_url) ? s(r.image_url) : null }, href: isHttp(r.taobao_url) ? s(r.taobao_url) : null, external: isHttp(r.taobao_url) }),
  },
];

/**
 * ตารางที่มีคอลัมน์ parent_sku* แต่ตั้งใจ "ไม่" โชว์ (พร้อมเหตุผล) — เทสต์กันลืมจะข้ามตารางพวกนี้
 * ตารางเชื่อม (via) ไม่ต้องใส่ — นับว่าอยู่ในทะเบียนแล้ว
 */
export const PARENT_LINK_IGNORED: Record<string, string> = {
  platform_email_sku_rules: "กฎจับคู่อีเมลออเดอร์ (ตั้งค่าระบบ ไม่ใช่เอกสาร)",
  platform_publish_jobs: "คิวส่งขึ้นร้านของระบบ (ดูผลในแท็บแพลตฟอร์ม)",
  marketing_sku_badge_map: "ป้ายบนการ์ดการตลาด (ตั้งค่า ไม่ใช่เอกสาร)",
};

/** ตารางทั้งหมดที่ทะเบียนนี้ครอบคลุม (รวมตารางเชื่อม) — ใช้ในเทสต์ */
export function registeredLinkTables(): Set<string> {
  const out = new Set<string>();
  for (const src of PARENT_LINK_SOURCES) {
    out.add(src.table);
    for (const m of src.match) if (m.by === "via" || m.by === "via_sku") out.add(m.table);
  }
  return out;
}
