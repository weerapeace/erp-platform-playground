/**
 * 🧭 ทะเบียนแผนผังการทำงาน (หน้า /master/flow-map) — "กดอะไร แล้วไปอัปเดตอะไรต่อ" ของ ซื้อ · ผลิต · จ่ายงาน · ขาย
 *
 * กล่อง (FLOW_NODES) = เอกสาร / หน้าจอ · เส้น (FLOW_EDGES) = การส่งต่อข้อมูล แยก 4 แบบ:
 *   auto    = ระบบทำให้เองในจังหวะเดียวกัน
 *   live    = ไม่ได้บันทึก แต่อีกหน้าคิดใหม่จากข้อมูลนี้ทุกครั้งที่เปิด
 *   manual  = คนต้องไปอีกหน้าแล้วกดเอง
 *   missing = ควรเชื่อมแต่ยังไม่เชื่อม (ช่องโหว่)
 * ทุกเส้นจด "ไฟล์ที่ทำจริง" (files) → เทสต์ lib/__tests__/flow-map.test.ts เช็กว่ายังมีอยู่
 *   ย้าย/ลบไฟล์ หรือแก้ workflow ให้การส่งต่อเปลี่ยน → แก้ไฟล์นี้ด้วย (คู่กับทะเบียน lib/workflow-registry.ts)
 * ตัวเลขสดของแต่ละกล่อง (metrics) คิดที่ /api/flow-map/health
 * ⚠️ ไฟล์นี้ต้อง pure (ไม่ import อะไร) — เทสต์และหน้าเว็บใช้ร่วมกัน
 * สำรวจของจริง + ปรับตามที่แก้ 2026-11-02 (ดู docs/flow-map.md)
 */

export type FlowEdgeType = "auto" | "live" | "manual" | "missing";
export type FlowArea = "buy" | "make" | "dispatch" | "sell" | "stock" | "hr";

export type FlowNode = {
  label: string;
  /** บรรทัดเล็กใต้ชื่อในกล่อง (สั้น ๆ) */
  sub: string;
  area: FlowArea;
  /** หน้าที่เปิดดู/ทำงานนี้ (ปุ่ม "เปิดหน้า") */
  href?: string;
  /** หน้าอื่นที่เกี่ยวข้อง (ข้อความ) */
  pages: string;
  /** เก็บที่ตารางไหน */
  tables: string;
  statuses: string;
  /** ช่องโหว่ / ข้อควรระวัง (ภาษาคน) */
  gaps?: string[];
  /** ตัวเลขสดจาก /api/flow-map/health */
  metrics?: FlowMetricKey[];
};

export type FlowEdge = {
  from: string;
  to: string;
  type: FlowEdgeType;
  /** กด/ทำอะไร */
  title: string;
  /** แล้วระบบทำอะไรต่อ */
  detail: string;
  /** ข้อควรระวัง */
  warn?: string;
  /** ไฟล์ที่ทำการส่งต่อนี้จริง (เทสต์เช็กว่ามีอยู่) */
  files: string[];
  /** key ใน lib/workflow-registry.ts (ถ้ามี) */
  workflow?: string;
  metrics?: FlowMetricKey[];
  /** แก้ครั้งล่าสุด (YYYY-MM-DD + เปลี่ยนอะไร) → หน้าแผนผังขึ้นป้าย "เพิ่งแก้" ภายใน FLOW_RECENT_DAYS วัน · แก้เส้นเมื่อไรให้อัปเดตช่องนี้ */
  changed?: { date: string; note: string };
};

/** ป้าย "เพิ่งแก้" โชว์กี่วันนับจากวันที่แก้ */
export const FLOW_RECENT_DAYS = 30;

export type FlowMetricKey =
  | "qt_open" | "so_open" | "bill_draft" | "bill_unshipped" | "bill_old_reserved" | "dn_unlinked" | "bn_open" | "rc_30d" | "cn_issued"
  | "ds_active" | "mo_open" | "mat_not_ready" | "wo_open" | "sub_30d" | "qc_shelf"
  | "pr_waiting" | "pr_mo_nosku_open" | "po_lines_nosku_open" | "po_unpaid" | "gr_30d" | "pv_draft"
  | "stock_raw" | "stock_wip" | "stock_fg" | "fg_reserved";

/** ชื่อ + ความหมายของตัวเลขสด · bad = ยิ่งมากยิ่งต้องตาม (ขึ้นสีแดงเมื่อ > 0) */
export const FLOW_METRICS: Record<FlowMetricKey, { label: string; unit: string; bad?: boolean }> = {
  qt_open: { label: "ใบเสนอราคาที่ยังเปิด (ร่าง/ส่งแล้ว)", unit: "ใบ" },
  so_open: { label: "ใบสั่งขายที่ยังไม่ส่ง", unit: "ใบ" },
  bill_draft: { label: "ใบขายร่าง", unit: "ใบ" },
  bill_unshipped: { label: "ใบขายยืนยันแล้ว ยังไม่จัดส่ง", unit: "ใบ" },
  bill_old_reserved: { label: "ใบขายเก่า (ก่อน 2 พ.ย.) ยังจองของ — กดจัดส่งคลังจะติดลบ", unit: "ใบ", bad: true },
  dn_unlinked: { label: "ใบส่งของที่ไม่ผูกใบขาย", unit: "ใบ", bad: true },
  bn_open: { label: "ใบวางบิลที่ยังไม่ชำระ", unit: "ใบ" },
  rc_30d: { label: "ใบรับชำระ 30 วันล่าสุด", unit: "ใบ" },
  cn_issued: { label: "ใบลดหนี้ที่ออกแล้ว", unit: "ใบ" },
  ds_active: { label: "ใบงานออกแบบที่ยังทำอยู่", unit: "ใบ" },
  mo_open: { label: "ใบสั่งผลิตที่เปิดอยู่", unit: "ใบ" },
  mat_not_ready: { label: "รายการวัตถุดิบที่ยังไม่พร้อม", unit: "รายการ" },
  wo_open: { label: "ใบจ่ายงานที่ช่างยังทำอยู่", unit: "ใบ" },
  sub_30d: { label: "ครั้งที่ช่างส่งงาน 30 วันล่าสุด", unit: "ครั้ง" },
  qc_shelf: { label: "รายการบนชั้น QC", unit: "รายการ" },
  pr_waiting: { label: "ใบขอซื้อรออนุมัติ", unit: "ใบ" },
  pr_mo_nosku_open: { label: "ใบขอซื้อจาก MO ไม่มีรหัสสินค้า (ยังไม่ออก PO)", unit: "ใบ", bad: true },
  po_lines_nosku_open: { label: "บรรทัด PO ค้างรับที่ไม่มีรหัสสินค้า (ระบบหาจากชื่อให้ตอนรับ)", unit: "บรรทัด" },
  po_unpaid: { label: "ใบสั่งซื้อยังไม่ติ๊กจ่ายเงิน", unit: "ใบ" },
  gr_30d: { label: "รับของในระบบ 30 วันล่าสุด", unit: "ครั้ง" },
  pv_draft: { label: "ใบสำคัญรับร่าง", unit: "ใบ" },
  stock_raw: { label: "ยอดคลังวัตถุดิบ (WH-RAW) รวม", unit: "หน่วย" },
  stock_wip: { label: "ยอดงานระหว่างทำ (WH-WIP) รวม", unit: "หน่วย" },
  stock_fg: { label: "ยอดคลังสินค้าสำเร็จ (WH-FG) รวม", unit: "ชิ้น" },
  fg_reserved: { label: "ของในคลังสินค้าสำเร็จที่ถูกใบขายจอง", unit: "ชิ้น" },
};

export const FLOW_EDGE_TYPES: Record<FlowEdgeType, { label: string; color: string; dash: string }> = {
  auto: { label: "ระบบทำให้เอง", color: "#16a34a", dash: "" },
  live: { label: "คิดสดตอนเปิดดู", color: "#2563eb", dash: "7 4" },
  manual: { label: "คนต้องไปกด", color: "#d97706", dash: "3 3" },
  missing: { label: "ยังไม่เชื่อม", color: "#dc2626", dash: "1 5" },
};

export const FLOW_NODES: Record<string, FlowNode> = {
  // ── ขาย ──
  qt: { label: "ใบเสนอราคา", sub: "/quotations", area: "sell", href: "/quotations", pages: "/quotations", tables: "erp_playground_quotations",
    statuses: "ร่าง → ส่งแล้ว → ตอบรับ → แปลงแล้ว · ปฏิเสธ / หมดอายุ / ยกเลิก", metrics: ["qt_open"],
    gaps: ["มี 2 ทางไปต่อ: “แปลงเป็น SO” สร้างใบขายตรง (ข้ามใบสั่งขาย ไม่เปิดผลิต) · ดึงเข้าใบสั่งขายไม่เปลี่ยนสถานะใบเสนอราคา จึงดึงซ้ำได้"] },
  so: { label: "ใบสั่งขาย", sub: "/sales/orders", area: "sell", href: "/sales/orders", pages: "/sales/orders (ตาราง · ปฏิทิน · ตามชุด)", tables: "so_orders + so_order_lines + ชุด (mo_groups)",
    statuses: "ยืนยันแล้ว → ส่งแล้ว · ยกเลิก — ขั้นงานรายบรรทัดคิดสด: รอเปิดผลิต → เปิดผลิตแล้ว → กำลังผลิต → ทำเสร็จ → ส่งลูกค้าแล้ว", metrics: ["so_open"],
    gaps: ["ยกเลิกใบสั่งขาย → ใบสั่งผลิตยังผูกและยังเปิด ใบขายที่ออกแล้วยังอยู่", "สถานะหัวใบไม่ขยับตามการผลิต ต้องกด “ส่งแล้ว” เอง · ขั้นงานโชว์เฉพาะบรรทัดที่อยู่ในชุด"] },
  bill: { label: "ใบขาย/ใบกำกับ", sub: "/sales-orders", area: "sell", href: "/sales-orders", pages: "/sales-orders", tables: "erp_playground_sales_orders",
    statuses: "ร่าง → ยืนยัน (จองของ) → กำลังผลิต → พร้อมส่ง → จัดส่งแล้ว (ตัดของ) → สำเร็จ · ยกเลิก (ปลดจอง)", metrics: ["bill_unshipped", "bill_draft", "bill_old_reserved"],
    gaps: ["ใบเก่าที่ยืนยันก่อน 2 พ.ย. ยังจองของค้าง — กดจัดส่งจะตัดคลังจนติดลบ (หน้าใบขายเตือนก่อนกด)", "กำลังผลิต / พร้อมส่ง / สำเร็จ เป็นปุ่มกดมือ ไม่มีอะไรขยับให้"] },
  dn: { label: "ใบส่งของ", sub: "/delivery-notes", area: "sell", href: "/delivery-notes", pages: "/delivery-notes", tables: "erp_playground_delivery_notes",
    statuses: "ร่าง → ส่งแล้ว · ยกเลิก", metrics: ["dn_unlinked"],
    gaps: ["เป็นเอกสารล้วน: กด “ส่งของ” ไม่เปลี่ยนใบขาย และไม่ตัดสต็อก (ตัดที่ใบขาย “จัดส่งแล้ว”)", "ใบส่งของจากรอบส่งบนบอร์ดไม่มีลูกค้า/เลขออเดอร์"] },
  bn: { label: "ใบวางบิล", sub: "/billing-notes", area: "sell", href: "/billing-notes", pages: "/billing-notes", tables: "erp_playground_billing_notes",
    statuses: "ร่าง → ออกแล้ว → ชำระแล้ว · ยกเลิก", metrics: ["bn_open"],
    gaps: ["กด “ชำระแล้ว” เปลี่ยนแค่ใบวางบิล — ใบขายข้างในยังค้างชำระ", "ยอดถูกคัดลอกตอนสร้าง ใบขายแก้ทีหลังไม่ตาม"] },
  rc: { label: "รับชำระ", sub: "/receipts", area: "sell", href: "/receipts", pages: "/receipts", tables: "customer_receipts",
    statuses: "ร่าง → ยืนยัน · ยกเลิก", metrics: ["rc_30d"],
    gaps: ["ยืนยันแล้วลดยอดค้างให้ แต่ไม่เปลี่ยนใบวางบิลเป็น “ชำระแล้ว” ไม่ปิดใบขาย และไม่หักใบลดหนี้/ภาษีหัก ณ ที่จ่าย"] },
  cn: { label: "ใบลดหนี้", sub: "/credit-notes", area: "sell", href: "/credit-notes", pages: "/credit-notes", tables: "erp_playground_credit_notes",
    statuses: "ร่าง → ออกแล้ว · ยกเลิก", metrics: ["cn_issued"],
    gaps: ["ออกใบลดหนี้แล้ว ยอดค้าง สต็อก รายงานขาย ไม่เปลี่ยน — หักเฉพาะตอนดูในจอใบวางบิล"] },
  // ── ผลิต ──
  ds: { label: "ใบงานออกแบบ", sub: "Design Dashboard", area: "make", href: "/master/design-dashboard", pages: "/master/design-dashboard", tables: "design_sheets",
    statuses: "ตั้งในระบบ: ออกแบบ · เสนอราคา · ส่งลูกค้า · แก้ไข · อนุมัติ · สร้าง SKU แล้ว · ยกเลิก", metrics: ["ds_active"],
    gaps: ["ไม่เห็นว่าแบบนี้ผลิตถึงไหนแล้ว (Dashboard ไม่อ่านใบสั่งผลิต)", "BOM ที่สร้างจากตารางต้นทุน บรรทัดไม่มีรหัสวัตถุดิบ ซื้อไม่ได้"] },
  sku: { label: "SKU + สูตร BOM", sub: "/master/bom", area: "make", href: "/master/bom", pages: "/master/skus · /master/bom", tables: "skus_v2 · bom_headers · bom_lines",
    statuses: "BOM: ร่าง (ไม่มีใครเช็ก)",
    gaps: ["ใบสั่งผลิตที่เปิดจากใบสั่งขายใช้ BOM “ล่าสุด” แต่ฟอร์ม MO ใช้ BOM “หลัก”", "แก้ BOM แล้วใบสั่งผลิตที่เปิดอยู่ไม่ตาม (ต้องกดอัพเดตตาม BOM เอง)"] },
  mo: { label: "ใบสั่งผลิต (MO)", sub: "หน้า MO · บอร์ด", area: "make", href: "/master/manufacturing-orders", pages: "/master/manufacturing-orders · /master/mo-backlog · /master/production-dashboard", tables: "manufacturing_orders",
    statuses: "ในฐานข้อมูลเป็น “ร่าง” ทุกใบที่เปิดอยู่ — ความคืบหน้าจริงคิดสดจากใบจ่ายงาน: รอจ่าย → จ่ายบางส่วน → จ่ายครบ → ส่งงานครบ → ปิด (กดเอง)", metrics: ["mo_open"],
    gaps: ["ช่องสถานะในฟอร์มตั้ง “เสร็จ/ยกเลิก” ได้ตรง ๆ ข้ามกติกาปิดงาน", "ปิดได้แม้ของยังค้างชั้น QC · ยกเลิกแล้วใบขอซื้อยังค้าง (แค่เตือน)", "หน้าสถานะ MO และแดชบอร์ดผลิตอ่านช่อง “เตรียมแล้ว” ที่ไม่มีใครเขียน จึงขึ้น 0 เสมอ"] },
  mat: { label: "วัตถุดิบของ MO", sub: "กางจาก BOM", area: "make", href: "/purchasing", pages: "ในหน้า MO · บอร์ด “ซื้อของ” · /purchasing แท็บ MO", tables: "mo_material_summary (+ mo_materials รายบล็อกตัด)",
    statuses: "คิดสด: ต้องซื้อ → ขอซื้อแล้ว → สั่งซื้อแล้ว → รับของแล้ว → มีของ/พร้อม → ปิด", metrics: ["mat_not_ready"],
    gaps: ["“ต้องซื้อ” คิดอยู่ 2–3 สูตร (หน้าขอซื้อ vs สถานะวัตถุดิบ) ผลอาจไม่ตรงกันหลังปิดยอด PO"] },
  ready: { label: "ความพร้อมวัตถุดิบ", sub: "material-readiness", area: "make", href: "/master/material-readiness", pages: "/master/material-readiness (อ่านอย่างเดียว · มีปุ่มใส่ตะกร้า)", tables: "อ่าน mo_material_summary",
    statuses: "พร้อม · กำลังเตรียม · รอของ · ไม่มี BOM",
    gaps: ["รับของแล้วไม่ขยับ ต้องกด “จัดสรรให้ MO” เองในป๊อปรับของ", "ไม่รู้ว่าใบไหนจ่ายงานไปแล้ว จึงยังโชว์ว่าขาด"] },
  // ── จ่ายงาน ──
  prep: { label: "เตรียม / ตัด", sub: "ติ๊กในบอร์ด", area: "dispatch", href: "/master/work-board", pages: "/master/work-board (เช็กลิสต์) · หน้าสแกน", tables: "mo_material_summary.is_ready · mo_materials.cut_done",
    statuses: "ติ๊ก / ไม่ติ๊ก · ข้ามขั้นได้ (แอดมิน)" },
  wo: { label: "ใบจ่ายงาน", sub: "บอร์ดจ่ายงาน", area: "dispatch", href: "/master/work-board", pages: "/master/work-board · หน้า MO", tables: "mo_work_orders",
    statuses: "จ่ายแล้ว → คืนบางส่วน → เสร็จ · ยกเลิก", metrics: ["wo_open"],
    gaps: ["เซิร์ฟเวอร์ไม่เช็กว่าจ่ายเกินจำนวน MO", "“ใช้แผนจ่ายงาน” เป็นอีกทางที่ไม่ตั้งค่าแรง ไม่ย้ายวัตถุดิบ ไม่แจ้ง LINE", "สถานะรายใบคิด 3 ที่ สูตรไม่ตรงกัน"] },
  sub: { label: "ช่างส่งงาน", sub: "บันทึกรับคืน", area: "dispatch", href: "/master/work-submissions", pages: "/master/work-submissions · ป๊อปในบอร์ด", tables: "wo_submissions",
    statuses: "บันทึกทีละครั้ง (+ ข้อมูลค้างกรอก)", metrics: ["sub_30d"],
    gaps: ["ปุ่ม “รับงานคืน” ในหน้า MO แก้ยอดตรง ๆ ไม่บันทึกการส่งงาน จึงไม่มีค่าแรงและไม่แจ้ง QC"] },
  qc: { label: "QC / ชั้นวาง", sub: "qc-warehouse", area: "dispatch", href: "/master/qc-warehouse", pages: "/master/qc-warehouse", tables: "qc_warehouse_items (ดี / เสีย / ซ่อม)",
    statuses: "ดี · เสีย · ซ่อม", metrics: ["qc_shelf"],
    gaps: ["ของที่อยู่บนชั้นก่อน 2 พ.ย. ไม่ได้นับในคลัง (เริ่มนับจากวันต่อกลับ)", "“ส่งออก” ไม่ตัดสต็อก — ตัดตอนใบขายกด “จัดส่งแล้ว”"] },
  ship: { label: "ส่งออก", sub: "คลังขาย / ขายเลย", area: "dispatch", href: "/master/qc-warehouse", pages: "ป๊อป QC · หน้าต่างอัปเดตงานจากใบขาย (บอร์ด)", tables: "จดในประวัติ (audit_logs)",
    statuses: "ส่งออกแล้ว = ส่ง − ดึงกลับ (คิดจากประวัติ)",
    gaps: ["“ส่งออกแล้ว” อยู่ในประวัติอย่างเดียว ไม่มีตารางรองรับ"] },
  pw: { label: "งานเหมา", sub: "piecework-dispatch", area: "dispatch", href: "/master/piecework-dispatch", pages: "/master/piecework-dispatch · ป๊อปในบอร์ด", tables: "mo_piecework · piecework_jobs",
    statuses: "รอจ่าย → จ่ายแล้ว → เสร็จ",
    gaps: ["ค่าเหมา “ทำได้จริง” คิด 3 สูตรในบอร์ด / รายงาน / ป๊อปสถานะ"] },
  labor: { label: "รายงานค่าแรง", sub: "รวมตามชื่อช่าง", area: "dispatch", href: "/print/labor-summary", pages: "/print/labor-summary", tables: "อ่าน wo_submissions + mo_piecework",
    statuses: "—", gaps: ["จับคู่คนด้วยชื่อ (ตัวหนังสือ) ไม่ใช่รหัสพนักงาน จึงซ้ำ/ตกหล่น/ผิดคนได้"] },
  pay: { label: "เงินเดือน", sub: "พิมพ์มือ", area: "hr", href: "/payroll/manual-input", pages: "/payroll/manual-input", tables: "payroll_adjustments (หมวดงานเหมา)",
    statuses: "อนุมัติ", gaps: ["ค่าแรงจากการส่งงาน/งานเหมาไม่ไหลเข้าเงินเดือน ฝ่ายบุคคลต้องพิมพ์ใหม่"] },
  // ── ซื้อ ──
  pr: { label: "ใบขอซื้อ", sub: "/purchasing", area: "buy", href: "/purchasing", pages: "/purchasing (ช้อป + แท็บ MO) · /purchasing/orders (อนุมัติ)", tables: "purchase_requests_v2 (1 สินค้า = 1 ใบ)",
    statuses: "รออนุมัติ → อนุมัติ / ไม่อนุมัติ → ออก PO แล้ว (ไม่มีสถานะรับแล้ว)", metrics: ["pr_waiting", "pr_mo_nosku_open"],
    gaps: ["อนุมัติไม่บังคับจริง: กดสร้าง PO แล้วใบที่รออยู่ถูกอนุมัติให้เอง", "สถานะไม่ขยับหลัง “ออก PO แล้ว” ตัวเตือนสั่งซ้ำจึงนับใบเก่าว่ายังค้าง", "“เก็บส่วนที่เหลือ” สร้างใบใหม่ที่หลุดลิงก์ MO และใช้เลขเดิม"] },
  po: { label: "ใบสั่งซื้อ (PO)", sub: "/purchasing/po-list", area: "buy", href: "/purchasing/po-list", pages: "/purchasing/po-list · /purchasing/orders · /purchasing/line-orders", tables: "purchase_orders_v2 + purchase_order_lines_v2",
    statuses: "ร่าง (= สั่งแล้ว) → รับบางส่วน → รับครบ · ยกเลิก · บรรทัด: รอ → บางส่วน → รับครบ / ปิดยอด", metrics: ["po_lines_nosku_open", "po_unpaid"],
    gaps: ["สถานะหัว PO คิด 4 ที่", "หน้าทั่วไป (/m/…) แก้สถานะ/จ่ายเงินได้ตรง ๆ ข้ามประตูกติกา"] },
  line: { label: "สั่งเอง / จาก LINE", sub: "ไม่ผ่านใบขอซื้อ", area: "buy", href: "/purchasing/line-orders", pages: "/purchasing/line-orders · สร้าง PO มือ", tables: "purchase_order_captures → purchase_orders_v2",
    statuses: "เก็บข้อความ → รอยืนยัน → ยืนยัน", gaps: ["PO ที่ไม่มีใบขอซื้อ MO มองไม่เห็นว่าสั่งแล้ว (เลข MO อยู่แค่ในหมายเหตุ)"] },
  gr: { label: "รับของ", sub: "/purchasing/receive", area: "buy", href: "/purchasing/receive", pages: "/purchasing/receive · สแกน · ป๊อปในแท็บ MO", tables: "goods_receipts_v2",
    statuses: "เสร็จ · ยกเลิก (ครบ / ค้างรับ / ปิดยอด / ของเสีย)", metrics: ["gr_30d"],
    gaps: ["คนยังแทบไม่ได้รับของในระบบ สต็อก/ความพร้อม/ใบสำคัญ จึงไม่มีข้อมูลป้อน", "ของเสียไม่มีทางคืนซัพหรือขอลดหนี้"] },
  pv: { label: "ใบสำคัญรับ", sub: "/vouchers", area: "buy", href: "/purchasing/vouchers", pages: "/purchasing/vouchers", tables: "purchase_vouchers_v2",
    statuses: "ร่าง → ยืนยัน · ยกเลิก", metrics: ["pv_draft"],
    gaps: ["ยืนยันแล้วแก้ราคา PO/สินค้า แต่ไม่แก้ต้นทุนของที่รับเข้าคลังไปแล้ว · ค่าขนส่งไม่เข้าต้นทุน"] },
  paypo: { label: "จ่ายเงินซัพ", sub: "ติ๊กใน PO", area: "buy", href: "/purchasing/dashboard", pages: "/purchasing/dashboard (ติ๊กจ่ายแล้ว) · China pay", tables: "purchase_orders_v2.payment_status · china_bills (ผูกมือ)",
    statuses: "ยังไม่จ่าย / จ่ายแล้ว", metrics: ["po_unpaid"],
    gaps: ["จ่ายเงินไม่ผูกใบสำคัญรับหรือ China pay · มี 2 ทางติ๊กจ่าย (ทางหนึ่งข้ามกติกา)"] },
  // ── คลัง ──
  raw: { label: "คลังวัตถุดิบ", sub: "WH-RAW", area: "stock", href: "/inventory/map", pages: "/inventory · /inventory/map", tables: "erp_playground_stock_balances / _movements",
    statuses: "—", metrics: ["stock_raw"], gaps: ["ยอดติดลบ เพราะย้ายออกไป WIP ตอนจ่ายงาน โดยแทบไม่เคยรับของเข้า"] },
  wip: { label: "งานระหว่างทำ", sub: "WH-WIP", area: "stock", href: "/inventory/map", pages: "/inventory/map", tables: "erp_playground_stock_balances",
    statuses: "—", metrics: ["stock_wip"] },
  fg: { label: "สินค้าสำเร็จ", sub: "WH-FG", area: "stock", href: "/inventory/map", pages: "/inventory/map", tables: "erp_playground_stock_balances",
    statuses: "—", metrics: ["stock_fg", "fg_reserved"] },
  stockrw: { label: "สต็อก RAW → WIP", sub: "ย้ายตอนจ่ายงาน", area: "stock", href: "/inventory/map", pages: "/inventory/map", tables: "erp_playground_stock_movements (mo_issue_wip)",
    statuses: "—", metrics: ["stock_raw", "stock_wip"], gaps: ["ย้ายทั้งสูตรแม้จ่ายงานบางส่วน"] },
};

export const FLOW_EDGES: Record<string, FlowEdge> = {
  // ── ซื้อ ──
  P1: { changed: { date: "2026-11-02", note: "ขอซื้อจากหน้า MO/บอร์ด ติดรหัสสินค้าให้เองแล้ว (เดิมไม่ติด)" }, from: "mat", to: "pr", type: "manual", title: "ขาดของ → ใส่ตะกร้า → กดขอซื้อ", workflow: "mo-materials",
    detail: "ทำที่ /purchasing แท็บ MO, บอร์ด “ซื้อของ” หรือหน้าความพร้อม · ระบบออกเลขใบขอซื้อ จำเลข MO ต้นทาง ติดรหัสสินค้าจาก [รหัส] ให้ + ดึงร้าน/ราคาหลัก แจ้งกระดิ่ง + LINE",
    files: ["app/api/purchasing/create-pr/route.ts", "lib/pr-line-code.ts"], metrics: ["pr_mo_nosku_open"] },
  P2: { from: "pr", to: "mat", type: "live", title: "MO เห็น “ขอซื้อแล้ว / สั่งแล้ว / รับแล้ว”", workflow: "mo-materials",
    detail: "ไม่ได้บันทึกลง MO — หน้าจอคิดใหม่ทุกครั้งที่เปิด โดยจับคู่รหัสวัตถุดิบ", warn: "ตัวเลข “ต้องซื้อ” ที่เก็บไว้ใน MO ไม่เปลี่ยน",
    files: ["lib/mo-material-status.ts"] },
  P3: { from: "pr", to: "po", type: "auto", title: "กดสร้าง PO", workflow: "purchasing",
    detail: "จัดกลุ่มตามร้าน + สกุลเงิน → PO ร่าง (= สั่งแล้ว) · ใบขอซื้อเปลี่ยนเป็น “ออก PO แล้ว” พร้อมเลข PO", warn: "ใบที่ยังรออนุมัติถูกอนุมัติให้เองตอนนี้",
    files: ["app/api/purchasing/create-po/route.ts"] },
  P4: { from: "line", to: "po", type: "auto", title: "สั่งเอง / ยืนยันจาก LINE", workflow: "purchasing",
    detail: "สร้างหรือเติม PO ทันที ไม่ผ่านใบขอซื้อ", files: ["lib/po-manual.ts", "lib/order-capture.ts"] },
  P5: { from: "line", to: "mat", type: "missing", title: "ของที่สั่งเองไม่ขึ้นใน MO",
    detail: "PO ที่ไม่มีใบขอซื้อ MO มองไม่เห็น ยังขึ้น “ต้องซื้อ” จึงอาจสั่งซ้ำ", files: ["lib/mo-material-status.ts"] },
  P6: { from: "po", to: "gr", type: "manual", title: "ของมาถึง → กดรับของ", workflow: "purchasing",
    detail: "ออกเลขรับของ · บวกยอดรับในบรรทัด PO · PO เปลี่ยนเป็น รับบางส่วน / รับครบ ให้เอง · แจ้ง LINE",
    files: ["app/api/purchasing/receive/route.ts", "components/receive-line-modal/index.tsx"], metrics: ["gr_30d"] },
  P7: { changed: { date: "2026-11-02", note: "รับของบรรทัดเก่าที่ไม่มีรหัส ระบบหาจากชื่อให้ ของเข้าคลังได้แล้ว" }, from: "gr", to: "raw", type: "auto", title: "ของดีเข้าคลังวัตถุดิบ", workflow: "purchasing",
    detail: "บวกสต็อก WH-RAW ทันที · ต้นทุน = ราคา PO (ถ้าเป็นบาท) ไม่งั้นราคามาตรฐาน · บรรทัดเก่าที่ไม่มีรหัส ระบบหาจาก [รหัส] ในชื่อแล้วติดให้ · ของเสียไม่เข้า",
    warn: "บรรทัดที่หารหัสไม่เจอยังข้าม (เดิม 3 จาก 338 บรรทัด)", files: ["app/api/purchasing/receive/route.ts", "lib/pr-line-code.ts"], metrics: ["po_lines_nosku_open"] },
  P8: { from: "gr", to: "ready", type: "missing", title: "รับของแล้ว ความพร้อมไม่ขยับ",
    detail: "ต้องกด “จัดสรรให้ MO” เองในป๊อปรับของ ไม่งั้นหน้าความพร้อมยังขึ้นว่ารอของ · ยอดที่จัดสรรไม่ได้กันของในคลังไว้ จึงนับซ้ำได้",
    files: ["components/receive-line-modal/index.tsx", "app/api/mo/material-allocations/route.ts"] },
  P9: { from: "gr", to: "pv", type: "manual", title: "รวมใบรับของ → ใบสำคัญรับ", workflow: "purchasing",
    detail: "เลือกใบรับของ (สกุลเงินเดียวกัน) → ใบสำคัญร่าง + ผูกใบรับของไว้", files: ["lib/purchase-voucher-server.ts"] },
  P10: { from: "pv", to: "po", type: "auto", title: "ยืนยันใบสำคัญ → ราคาจริงกลับไปที่ PO", workflow: "purchasing",
    detail: "ออกเลขใบสำคัญ · แก้ราคาบรรทัด PO, ยอด PO, ราคาซัพ, ราคาสินค้า · ยกเลิกใบสำคัญ = คืนราคาเดิม", warn: "ไม่แก้ต้นทุนของที่รับเข้าคลังไปแล้ว",
    files: ["app/api/purchasing/vouchers/[id]/confirm/route.ts"] },
  P11: { from: "pv", to: "paypo", type: "missing", title: "จ่ายเงินไม่ผูกใบสำคัญ",
    detail: "ติ๊ก “จ่ายแล้ว” แยกใน PO (มี 2 ทาง) · China pay ผูกมือ ไม่มีลิงก์กลับ", files: ["app/api/purchasing/mark-paid/route.ts"], metrics: ["po_unpaid"] },
  // ── ผลิต ──
  M1: { from: "ds", to: "sku", type: "auto", title: "กดสร้าง SKU จากใบงาน",
    detail: "สร้างสินค้าแม่ + ลูกทุกสี · ใบงานเปลี่ยนเป็น “สร้าง SKU แล้ว”", files: ["app/api/design-sheets/[id]/create-skus/route.ts"] },
  M2: { from: "ds", to: "sku", type: "manual", title: "สร้าง BOM จากตารางต้นทุน",
    detail: "ตัวช่วยสร้าง BOM จากต้นทุนในใบงาน", warn: "บรรทัด BOM ไม่มีรหัสวัตถุดิบ จึงซื้อ/กางสูตรไม่ได้", files: ["components/design-sheet-detail/bom-from-cost-wizard.tsx"] },
  M3: { from: "ds", to: "so", type: "manual", title: "ลงออเดอร์จาก Design Dashboard",
    detail: "ติ๊กใบงาน → เปิดป๊อปลงออเดอร์หลายรายการ (ใบที่ไม่มี SKU ลงเป็นชื่อไว้ก่อน)", files: ["components/order-batch-entry/index.tsx"] },
  M4: { from: "mo", to: "ds", type: "missing", title: "สถานะผลิตไม่กลับไปที่ใบงาน",
    detail: "Design Dashboard อ่านแค่ใบงาน/ใบเสนอราคา ไม่รู้ว่าแบบนี้เปิดผลิตหรือทำเสร็จหรือยัง", files: ["components/design-dashboard/index.tsx"] },
  M5: { from: "so", to: "mo", type: "auto", title: "บันทึกใบสั่งขาย = เปิด/ผูกใบสั่งผลิต", workflow: "so-order",
    detail: "บรรทัดที่ดึงจาก MO → ผูกเลขออเดอร์ + สถานะยืนยัน · บรรทัดใหม่ → เปิด MO + กางสูตร + เข้าชุดให้",
    warn: "บรรทัดที่ไม่มี SKU ถูกข้ามเงียบ ๆ · ใช้ BOM ล่าสุด ไม่ใช่ BOM หลัก", files: ["app/api/so-orders/open-mo.ts"], metrics: ["so_open"] },
  M6: { changed: { date: "2026-11-02", note: "แก้จำนวน/สูตร/ไซซ์ ไม่ล้างติ๊กเตรียม/ตัดแล้ว" }, from: "mo", to: "mat", type: "auto", title: "เปิด / แก้ MO → กางสูตรเป็นรายการวัตถุดิบ", workflow: "mo-production",
    detail: "คำนวณวัตถุดิบที่ต้องใช้จาก BOM × จำนวน · แก้จำนวน/สูตร/ไซซ์ เก็บติ๊กเตรียม/ตัด/ยอดมีของเดิมไว้ · “ต้องซื้อ” คิดใหม่ตามจำนวนใหม่ (ยกเว้นที่พิมพ์ทับเอง)",
    files: ["app/api/mo/[id]/route.ts", "app/api/mo/shared.ts"] },
  M7: { from: "sku", to: "mo", type: "auto", title: "ใช้ BOM ตอนเปิด MO", workflow: "mo-production",
    detail: "ดึงสูตรมากางตอนเปิดใบ", warn: "แก้ BOM ทีหลัง ใบที่เปิดแล้วไม่ตาม · 2 ทางเลือก BOM คนละแบบ", files: ["app/api/mo/shared.ts"] },
  M8: { from: "mo", to: "so", type: "live", title: "ขั้นงานของใบสั่งขาย/ชุด คิดจาก MO", workflow: "so-order",
    detail: "รอเปิดผลิต → เปิดแล้ว → กำลังผลิต → ทำเสร็จ คิดสดจากการจ่าย/ส่งงาน", warn: "เฉพาะบรรทัดที่อยู่ในชุด · สถานะหัวใบไม่ขยับเอง",
    files: ["lib/so-order-stage.ts"] },
  M9: { from: "mat", to: "ready", type: "live", title: "หน้าความพร้อมอ่านรายการวัตถุดิบ",
    detail: "% พร้อม = ติ๊กพร้อม หรือ มีของ ≥ ต้องใช้ ถ่วงตามความสำคัญวัตถุดิบ", warn: "ไม่รู้ว่าใบไหนจ่ายงานแล้ว", files: ["app/api/mo/material-readiness/route.ts"] },
  M10: { from: "mo", to: "pr", type: "missing", title: "ยกเลิก MO → ใบขอซื้อยังค้าง",
    detail: "ระบบแค่ส่งรายชื่อใบขอซื้อกลับมาเตือน ไม่ยกเลิกให้", files: ["app/api/mo/bulk-status/route.ts"] },
  M11: { from: "so", to: "mo", type: "missing", title: "ยกเลิกใบสั่งขาย → MO ยังเปิด",
    detail: "เปลี่ยนแค่ใบสั่งขาย · MO ยังผูกเลขออเดอร์และยังยืนยัน · ใบขายที่ออกแล้วยังอยู่", files: ["app/api/so-orders/[id]/route.ts"] },
  // ── จ่ายงาน ──
  X1: { from: "prep", to: "mat", type: "auto", title: "ติ๊กเตรียม / ตัด", workflow: "mo-materials",
    detail: "วัตถุดิบรายการนั้นเป็น “พร้อม” (ตัดครบ = พร้อม · เอาติ๊กออก = ไม่พร้อม)",
    files: ["app/api/mo/material-line/route.ts", "app/api/mo/[id]/mark-ready/route.ts"] },
  X2: { from: "prep", to: "wo", type: "manual", title: "ครบแล้ว → กดจ่ายงาน", workflow: "mo-production",
    detail: "เลือกช่าง/โต๊ะ + จำนวน → ใบจ่ายงาน “จ่ายแล้ว” · ตั้งค่าแรงตั้งต้นจากแผน/BOM · แจ้ง LINE กลุ่ม + ช่าง", warn: "ไม่เช็กว่าจ่ายเกินจำนวน MO",
    files: ["app/api/mo/work-orders/route.ts"] },
  X3: { from: "wo", to: "stockrw", type: "auto", title: "ใบจ่ายงานใบแรก → ย้ายวัตถุดิบ RAW→WIP", workflow: "mo-production",
    detail: "ย้ายวัตถุดิบทั้งสูตรของ MO ครั้งเดียว (ถ้าพลาดไม่บล็อกการจ่ายงาน)", warn: "จ่ายบางส่วนก็ย้ายทั้งหมด", files: ["app/api/mo/work-orders/route.ts"], metrics: ["stock_raw", "stock_wip"] },
  X4: { from: "wo", to: "mo", type: "live", title: "จ่ายแล้ว → MO นับเป็นจ่ายงาน", workflow: "mo-production",
    detail: "ความคืบหน้า MO คิดสดจากใบจ่ายงาน · วัตถุดิบของใบที่จ่ายแล้วหลุดจาก “ต้องซื้อ”", warn: "หน้าความพร้อมวัตถุดิบไม่ใช้ข้อมูลนี้",
    files: ["lib/mo-status.ts", "lib/mo-dispatch.ts"] },
  X5: { from: "wo", to: "sub", type: "manual", title: "ช่างส่งงาน → บันทึกรับคืน", workflow: "mo-production",
    detail: "บวกยอดรับคืนในใบจ่ายงาน · ครบ = “เสร็จ” · คิดค่าแรงในใบใหม่ · แจ้ง QC (กระดิ่ง + LINE)", warn: "ส่งบางส่วนไม่ตั้ง “คืนบางส่วน” (ตั้งเฉพาะตอนแก้)",
    files: ["app/api/mo/submissions/route.ts", "lib/wo-labor.ts"], metrics: ["sub_30d"] },
  X6: { from: "sub", to: "mo", type: "live", title: "ส่งงานครบ → MO พร้อมปิด", workflow: "mo-production",
    detail: "ปิด MO ต้องกดเอง (หน้าค้างผลิต / บอร์ด) · กติกา: ส่งคืนครบ + ไม่มีใบจ่ายค้าง", warn: "ไม่บังคับผ่าน QC/ส่งของก่อนปิด",
    files: ["lib/mo-workflow.ts", "app/api/mo/bulk-status/route.ts"] },
  X7: { from: "sub", to: "qc", type: "live", title: "คิวรอ QC", workflow: "qc-warehouse",
    detail: "คิว = ยอดรับคืน − ที่ดึงเข้า QC แล้ว (คิดสด) · QC กดรับ → ขึ้นชั้น ดี/เสีย + แจ้งช่างถ้าเสีย", files: ["app/api/qc-warehouse/route.ts"] },
  X8: { changed: { date: "2026-11-02", note: "ต่อ QC → คลังสินค้าสำเร็จกลับมาแล้ว (หลุดไปตั้งแต่ 11 ก.ค.)" }, from: "qc", to: "fg", type: "auto", title: "รับเข้า QC → เข้าคลังสินค้าสำเร็จ", workflow: "qc-warehouse",
    detail: "ของดี +คลังสินค้าสำเร็จ (ตัดวัตถุดิบออกจาก WIP ตามสัดส่วน) · ของเสีย +คลังของเสีย · ซ่อมได้กลับเข้าคลัง · ดึงกลับ/ลบ = ย้อนให้",
    warn: "ต่อกลับเมื่อ 2 พ.ย. (หลุดไปตั้งแต่ 11 ก.ค.) — ของที่อยู่บนชั้นก่อนหน้าไม่นับย้อนหลัง", files: ["app/api/qc-warehouse/items/route.ts"], metrics: ["stock_fg"] },
  X9: { changed: { date: "2026-11-02", note: "ส่งออกไม่ตัดสต็อกแล้ว — ตัดที่ใบขาย “จัดส่งแล้ว” ที่เดียว" }, from: "qc", to: "ship", type: "manual", title: "ส่งออก (คลังขาย / ขายเลย)", workflow: "qc-warehouse",
    detail: "ลบ/ลดของบนชั้น + จดประวัติ · ย้อนกลับได้ · ไม่แตะสต็อก (ของยังนับในคลังจนใบขายกด “จัดส่งแล้ว”)", files: ["app/api/qc-warehouse/items/route.ts", "lib/qc-ship.ts"] },
  X10: { from: "ship", to: "bill", type: "manual", title: "ผูกใบสั่งผลิต ↔ ใบขาย",
    detail: "หน้าต่าง “อัปเดตงานจากใบขาย” จับคู่ SKU (ใบเก่าก่อน) แล้วกดผูก + ไปถึงขั้นส่งออก", warn: "ผูกแล้วไม่ไปกดใบขายเป็น “จัดส่งแล้ว” ให้ — ต้องกดที่หน้าใบขาย",
    files: ["app/api/mo/sales-match/route.ts", "lib/mo-sales-match.ts"] },
  X11: { from: "sub", to: "labor", type: "live", title: "ค่าแรงจากการส่งงาน → รายงานค่าแรง", workflow: "piecework",
    detail: "รวมค่าแรงตามวันที่ส่ง + งานเหมาที่เสร็จ แยกตามชื่อช่าง", files: ["app/api/mo/labor-summary/route.ts"] },
  X12: { from: "pw", to: "labor", type: "live", title: "งานเหมาเสร็จ → รายงานค่าแรง", workflow: "piecework",
    detail: "กด “เสร็จ” ในงานเหมา (ตั้งจำนวนที่ทำได้ เก็บส่วนที่เหลือได้)", warn: "ไม่ผูกกับการส่งงาน/QC", files: ["app/api/mo/piecework/route.ts"] },
  X13: { from: "labor", to: "pay", type: "missing", title: "ค่าแรงไม่เข้าเงินเดือนเอง",
    detail: "ฝ่ายบุคคลต้องพิมพ์ยอดงานเหมาใหม่ในหน้าเงินเดือน · จับคู่คนด้วยชื่อ ไม่ใช่รหัสพนักงาน", warn: "เสี่ยงซ้ำ ตกหล่น หรือผิดคน",
    files: ["app/payroll/manual-input/page.tsx"] },
  X14: { changed: { date: "2026-11-02", note: "กู้ปุ่ม “คืนงานกลับให้ช่าง” กลับมาในหน้า QC" }, from: "qc", to: "wo", type: "manual", title: "คืนงานกลับให้ช่าง (รับผิด / ต้องแก้ใหม่)", workflow: "qc-warehouse",
    detail: "ลดยอดรับคืนส่วนที่ยังไม่ดึงเข้า QC · เปิดใบจ่ายงานกลับ · ดึงค่าแรงรอบนั้นกลับ · แจ้งช่าง", files: ["app/api/qc-warehouse/items/route.ts"] },
  // ── ขาย ──
  S1: { from: "qt", to: "bill", type: "auto", title: "กด “แปลงเป็น SO”", workflow: "sales-order",
    detail: "สร้างใบขาย (ร่าง) ทันที + ใบเสนอราคาเป็น “แปลงแล้ว”", warn: "ข้ามใบสั่งขาย จึงไม่เปิดใบสั่งผลิตและไม่มีขั้นงาน",
    files: ["app/api/quotations/[id]/convert/route.ts"] },
  S2: { from: "qt", to: "so", type: "missing", title: "ดึงใบเสนอราคาเข้าใบสั่งขาย",
    detail: "คัดลอกบรรทัดได้ แต่ใบเสนอราคาไม่เปลี่ยนสถานะ ไม่จำว่ามาจากใบไหน · ดึงใบร่าง/ปฏิเสธ/แปลงแล้วซ้ำได้", files: ["app/api/so-orders/sources/route.ts"] },
  S3: { changed: { date: "2026-11-02", note: "ออกใบขายแล้วยืนยัน + จัดส่งให้ทันที (ติดบริษัท/คลัง/รหัสสินค้า)" }, from: "so", to: "bill", type: "auto", title: "กด “ส่งแล้ว + ออกใบขาย”", workflow: "so-order",
    detail: "ใบสั่งขายเป็น “ส่งแล้ว” · ออกใบขาย (ติดบริษัท คลัง รหัสสินค้า) แล้วยืนยัน + จัดส่งให้ทันที = ตัดของออกจากคลัง",
    warn: "ทำไม่สำเร็จ (เช่น ไม่มีสิทธิ์) ใบขายค้างสถานะเดิม ระบบเตือนให้ไปกดต่อ · ไม่สร้างใบส่งของ", files: ["app/api/so-orders/[id]/route.ts"] },
  S4: { changed: { date: "2026-11-02", note: "ใบขายจัดส่งแล้ว = จุดเดียวที่ตัดสต็อกตอนขาย · ปุ่มจัดส่งหลายใบ + เตือนใบเก่า" }, from: "bill", to: "fg", type: "auto", title: "ยืนยัน = จองของ · จัดส่งแล้ว = ตัดของ (จุดเดียว)", workflow: "sales-order",
    detail: "ทำผ่านกติกาสถานะของใบขาย (ยืนยัน → จอง · จัดส่งแล้ว → ปลดจอง + ตัดออกจากคลัง · ยกเลิก → ปลดจอง) · กดหลายใบได้ที่หน้าใบขาย",
    warn: "ใบเก่าก่อน 2 พ.ย. ยังจองค้าง — กดจัดส่งจะตัดคลังจนติดลบ (มีป๊อปเตือน)", files: ["app/api/sales-orders/[id]/transition/route.ts", "app/sales-orders/page.tsx"],
    metrics: ["bill_old_reserved", "fg_reserved"] },
  S5: { from: "bill", to: "dn", type: "manual", title: "ดึงจากใบขาย → ใบส่งของ",
    detail: "คัดลอกบรรทัด + จำเลขใบขาย", files: ["app/delivery-notes/page.tsx"] },
  S6: { from: "dn", to: "bill", type: "missing", title: "ส่งของแล้ว ใบขายไม่รู้",
    detail: "กด “ส่งของ” เปลี่ยนแค่ใบส่งของ — ใบขายไม่เป็นจัดส่งแล้ว (ตัดสต็อกต้องกดที่ใบขาย)", files: ["app/api/delivery-notes/[id]/transition/route.ts"], metrics: ["dn_unlinked"] },
  S7: { from: "bill", to: "bn", type: "manual", title: "เลือกใบขาย → ใบวางบิล",
    detail: "รวมหลายใบขายของบริษัทเดียวกัน (รวมใบร่างได้) · คัดลอกยอดไว้", files: ["app/api/billing-notes/route.ts"] },
  S8: { from: "bn", to: "rc", type: "manual", title: "ลูกค้าจ่าย → ออกใบรับชำระ",
    detail: "เลือกใบวางบิล/ใบขายที่ค้าง", files: ["app/api/receipts/route.ts"], metrics: ["rc_30d"] },
  S9: { from: "rc", to: "bn", type: "auto", title: "ยืนยันรับชำระ → ลดยอดค้าง",
    detail: "คิดยอดค้างในใบขาย + ใบวางบิลใหม่", warn: "ไม่เปลี่ยนใบวางบิลเป็น “ชำระแล้ว” · ไม่ปิดใบขาย · ไม่หักใบลดหนี้", files: ["app/api/receipts/route.ts"] },
  S10: { from: "bn", to: "bill", type: "missing", title: "วางบิล “ชำระแล้ว” แต่ใบขายยังค้าง",
    detail: "ปุ่มชำระแล้วในใบวางบิลเปลี่ยนแค่ใบวางบิล", files: ["app/api/billing-notes/route.ts"] },
  S11: { from: "cn", to: "bn", type: "live", title: "หักใบลดหนี้ในจอใบวางบิล",
    detail: "หักยอดเฉพาะตอนแสดงในจอใบวางบิล", files: ["app/api/billing-notes/route.ts"] },
  S12: { from: "cn", to: "fg", type: "missing", title: "ใบลดหนี้ไม่คืนของ ไม่ลดยอดค้าง",
    detail: "ออกใบลดหนี้แล้ว สต็อก ยอดค้างใบขาย กระแสเงินสด รายงานขาย ไม่เปลี่ยน", files: ["app/api/credit-notes/[id]/transition/route.ts"] },
};

/** ตำแหน่งกล่องในผัง: [คอลัมน์ 0–3, แถว 0.. หรือ "s" = แถวคลังล่างสุด] */
export type FlowPos = [number, number | "s"];
/** เส้นในผัง: [id เส้น, ด้านออก, เลื่อน, ด้านเข้า, เลื่อน, ตัวเลือก] · ด้าน l/r/t/b · c = แนวเลี้ยว · bf = ตำแหน่งเลขบนเส้น · a/b = เปลี่ยนต้น/ปลายในผังนี้ */
export type FlowViewEdge = [string, "l" | "r" | "t" | "b", number, "l" | "r" | "t" | "b", number, { c?: number; bf?: number; a?: string; b?: string }?];
export type FlowView = { key: string; label: string; height: number; bands?: boolean; own?: string[]; gray?: string[]; pos: Record<string, FlowPos>; edges: FlowViewEdge[] };

export const FLOW_VIEWS: FlowView[] = [
  { key: "ov", label: "ภาพรวม", height: 524, bands: true, gray: ["pay", "raw", "wip", "fg"],
    pos: { ds: [1, 0], qt: [3, 0], mo: [1, 1], so: [3, 1], pr: [0, 2], mat: [1, 2], wo: [2, 2], po: [0, 3], pay: [1, 3], sub: [2, 3], bill: [3, 3], gr: [0, 4], qc: [2, 4], bn: [3, 4], raw: [0, "s"], wip: [2, "s"], fg: [3, "s"] },
    edges: [["M5", "l", -12, "r", -12, { bf: 0.3 }], ["M8", "r", 2, "l", 2, { bf: 0.3 }], ["M4", "t", 0, "b", 0], ["M6", "b", 0, "t", 0], ["S2", "b", 0, "t", 0],
      ["S1", "r", -8, "r", -10, { c: 657 }], ["S3", "b", 0, "t", 0], ["S4", "r", 10, "r", 0, { c: 669 }], ["S7", "b", 0, "t", 0], ["P1", "l", -10, "r", -10], ["P2", "r", 10, "l", 10],
      ["X2", "r", -10, "l", -10, { a: "mat" }], ["X4", "l", 10, "r", 10, { b: "mat" }], ["X6", "l", -10, "r", 14, { c: 345, bf: 0.85 }], ["P3", "b", 0, "t", 0], ["P6", "b", 0, "t", 0],
      ["P7", "b", 0, "t", 0, { bf: 0.3 }], ["X5", "b", 0, "t", 0], ["X13", "l", 10, "r", 10, { a: "sub" }], ["X7", "b", 0, "t", 0], ["X10", "r", 0, "l", 10, { a: "qc", c: 497 }],
      ["X8", "b", 0, "t", -20, { c: 410 }], ["X3", "r", 0, "l", 0, { a: "raw", b: "wip" }]] },
  { key: "buy", label: "ซื้อ", height: 272, own: ["pr", "po", "line", "gr", "pv", "paypo"],
    pos: { mat: [0, 0], line: [1, 0], ready: [2, 0], paypo: [3, 0], pr: [0, 1], po: [1, 1], gr: [2, 1], pv: [3, 1], raw: [2, 2] },
    edges: [["P1", "b", -12, "t", -12], ["P2", "t", 12, "b", 12], ["P5", "l", 0, "r", 0], ["P4", "b", 0, "t", 0], ["P3", "r", 0, "l", 0], ["P6", "r", 0, "l", 0],
      ["P8", "t", 0, "b", 0], ["P7", "b", -12, "t", -12], ["P9", "r", 0, "l", 0], ["P10", "b", -25, "b", 12, { c: 252 }], ["P11", "t", 15, "b", 15]] },
  { key: "make", label: "ผลิต", height: 274, own: ["ds", "sku", "mo", "mat", "ready"],
    pos: { ds: [0, 0], sku: [1, 0], so: [3, 0], mo: [1, 1], pr: [0, 2], mat: [1, 2], ready: [2, 2], wo: [3, 2] },
    edges: [["M1", "r", -10, "l", -10], ["M2", "r", 10, "l", 10], ["M3", "t", 0, "t", 0, { c: 24 }], ["M7", "b", 0, "t", 0], ["M4", "l", -10, "b", 0], ["M10", "l", 10, "t", 12],
      ["M5", "b", -10, "r", -10], ["M8", "r", 10, "b", 12], ["M6", "b", 0, "t", 0], ["P1", "l", -10, "r", -10], ["P2", "r", 10, "l", 10], ["M9", "r", 0, "l", 0],
      ["X4", "b", 0, "b", 12, { b: "mat", c: 254 }]] },
  { key: "dispatch", label: "จ่ายงาน", height: 332, own: ["prep", "wo", "sub", "qc", "ship", "pw", "labor"],
    pos: { mat: [0, 0], prep: [1, 0], fg: [3, 0], mo: [0, 1], wo: [1, 1], sub: [2, 1], qc: [3, 1], stockrw: [1, 2], labor: [2, 2], ship: [3, 2], pw: [1, 3], pay: [2, 3], bill: [3, 3] },
    edges: [["X1", "l", 0, "r", 0], ["X2", "b", 0, "t", 0, { bf: 0.3125 }], ["X4", "l", 0, "r", 0], ["X3", "b", 0, "t", 0], ["X5", "r", 0, "l", 0], ["X6", "t", -20, "t", 20, { c: 110, bf: 0.207 }],
      ["X7", "r", 0, "l", 0], ["X8", "t", 0, "b", 0], ["X9", "b", 0, "t", 0], ["X10", "b", 0, "t", 0], ["X11", "b", 0, "t", 0, { bf: 0.3125 }], ["X12", "r", -14, "l", 8, { c: 332 }],
      ["X13", "b", 0, "t", 0], ["X14", "b", -25, "b", 25, { c: 184, bf: 0.196 }]] },
  { key: "sell", label: "ขาย", height: 332, own: ["qt", "so", "bill", "dn", "bn", "rc", "cn"],
    pos: { qt: [0, 0], so: [1, 0], mo: [3, 0], bill: [1, 1], ship: [3, 1], fg: [0, 2], dn: [1, 2], bn: [2, 2], rc: [3, 2], cn: [2, 3] },
    edges: [["S2", "r", 0, "l", 0], ["M5", "r", -12, "l", -12, { bf: 0.3 }], ["M8", "l", 0, "r", 0], ["M11", "r", 12, "l", 12, { bf: 0.7 }], ["S1", "b", 0, "l", -10],
      ["S3", "b", 0, "t", 0], ["X10", "l", 0, "r", 0, { bf: 0.25 }], ["S4", "l", 12, "t", 20], ["S5", "b", -12, "t", -12], ["S6", "t", 12, "b", 12], ["S7", "r", 12, "t", -20],
      ["S10", "t", 20, "r", -10], ["S8", "r", -10, "l", -10], ["S9", "l", 10, "r", 10], ["S11", "t", 0, "b", 0], ["S12", "l", 0, "b", 0]] },
];

export const FLOW_AREA_LABEL: Record<FlowArea, string> = { buy: "ซื้อ", make: "ผลิต", dispatch: "จ่ายงาน", sell: "ขาย", stock: "คลัง", hr: "บุคคล" };

/**
 * แท็บ "ออเดอร์ 1 ใบ เดินทางยังไง" — ไล่ทีละขั้นตั้งแต่ลงออเดอร์จนเก็บเงิน
 * แต่ละขั้นอ้าง id เส้นใน FLOW_EDGES → แก้เส้น (แบบ/ข้อความ) แล้วแท็บนี้เปลี่ยนตามเอง ไม่ต้องแก้ซ้ำ
 */
export type FlowJourneyStep = { node: string; title: string; edges: string[] };
export const FLOW_JOURNEY: FlowJourneyStep[] = [
  { node: "so", title: "ลงใบสั่งขาย", edges: ["M5"] },
  { node: "mo", title: "ใบสั่งผลิต + รายการวัตถุดิบ", edges: ["M6", "P1"] },
  { node: "pr", title: "ใบขอซื้อ → ใบสั่งซื้อ", edges: ["P3", "P2", "P6"] },
  { node: "gr", title: "รับของ", edges: ["P7", "P8"] },
  { node: "prep", title: "เตรียม / ตัด → จ่ายงาน", edges: ["X1", "X2"] },
  { node: "wo", title: "ใบจ่ายงาน", edges: ["X3", "X4", "X5"] },
  { node: "sub", title: "ช่างส่งงาน", edges: ["X7", "M8", "X13"] },
  { node: "qc", title: "QC / ชั้นวาง", edges: ["X8", "X14", "X9", "X10"] },
  { node: "so", title: "กด “ส่งแล้ว” ในใบสั่งขาย", edges: ["S3"] },
  { node: "bill", title: "ใบขาย / ใบกำกับ", edges: ["S4", "S5", "S7"] },
  { node: "dn", title: "ใบส่งของ", edges: ["S6"] },
  { node: "bn", title: "ใบวางบิล → รับชำระ", edges: ["S8", "S9", "S10"] },
  { node: "mo", title: "ปิดใบสั่งผลิต", edges: ["X6"] },
];

/** ส่งคำขอแก้เข้า "แจ้งปัญหาการใช้งาน" (/issue-report) — ส่วนของกล่อง → ชื่อแอปในรายการ issue_report_apps */
export const FLOW_ISSUE_APP: Record<FlowArea, string> = { buy: "จัดซื้อ", make: "ผลิต", dispatch: "จ่ายงาน", sell: "ขาย", stock: "คลังสินค้า", hr: "Payroll (HR)" };
