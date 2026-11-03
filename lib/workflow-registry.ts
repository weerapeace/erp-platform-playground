/**
 * 🗺️ ทะเบียน workflow กลาง — "เส้นทางงานแต่ละเรื่อง กติกาอยู่ไฟล์ไหน แตะตารางไหน"
 *
 * เจ้าของสั่ง 2026-11-02: ก่อนแก้ workflow ต้องเช็กก่อนว่ามีระบบไหนใช้อยู่บ้าง
 *   → ก่อนแก้ ให้รัน  npm run where-used -- <key หรือชื่อไฟล์>  (scripts/where-used.mjs อ่านไฟล์นี้)
 *     แล้วแนบรายการ "หน้าไหนกระทบ" เป็นภาษาคนในแผนให้เจ้าของดูก่อน
 *
 * ไฟล์นี้เก็บแค่ "ของที่คนต้องบอก" (กติกาอยู่ไหน · ตารางไหน · ยังไม่เป็นของกลางตรงไหน)
 * ส่วน "ใครใช้บ้าง" ห้ามจดมือ — สคริปต์ไล่หาจากโค้ดจริงทุกครั้ง จะได้ไม่ตกหล่น/ไม่ล้าสมัย
 *
 * คู่กับทะเบียนกติกาธุรกิจภาษาคน (หน้า /master/logic · ตาราง erp_logic_registry) ผ่าน logicIds
 * เพิ่ม workflow ใหม่ / ย้ายกติกาไปไฟล์ใหม่ → แก้ที่ไฟล์นี้ที่เดียว (เทสต์เช็กว่าไฟล์ที่อ้างมีอยู่จริง)
 * ⚠️ ไฟล์นี้ต้อง pure (ไม่ import อะไร) — สคริปต์ Node อ่านตรง และหน้าเว็บใช้ได้
 */

export type WorkflowDef = {
  /** รหัสสั้น ใช้กับคำสั่ง where-used */
  key: string;
  /** ชื่อภาษาคน */
  label: string;
  /** เส้นทางสถานะแบบย่อ */
  flow: string;
  /** ไฟล์กติกากลาง (ของกลาง) — แก้กติกาที่นี่ */
  ruleFiles: string[];
  /** ประตูเปลี่ยนสถานะ (API ที่บันทึกสถานะจริง) */
  gates: string[];
  /** ตารางในฐานข้อมูลของ workflow นี้ */
  tables: string[];
  /** คอลัมน์/คำที่ถ้าไฟล์อื่นอ่านเอง = อาจคิดกติกาเอง (regex) */
  signals: string[];
  /** workflow อื่นที่ใช้ผลของ workflow นี้ → แก้ตัวนี้ ตัวนั้นกระทบด้วย */
  feeds?: string[];
  /** รหัสกติกาธุรกิจใน /master/logic */
  logicIds?: string[];
  /** จุดที่ยังไม่เป็นของกลาง (ภาษาคน) — งานค้างที่ควรเก็บ */
  gaps?: string[];
};

export const WORKFLOWS: WorkflowDef[] = [
  {
    key: "mo-production",
    label: "การผลิต (ใบสั่งผลิต)",
    flow: "เปิดใบ → เตรียม/ตัด → จ่ายงาน → ช่างส่งงาน → QC → ปิดใบ / ยกเลิก",
    ruleFiles: ["lib/mo-status.ts", "lib/mo-workflow.ts", "lib/mo-skip.ts", "lib/mo-dispatch.ts"],
    gates: ["app/api/mo/[id]/status/route.ts", "app/api/mo/work-orders/route.ts", "app/api/mo/work-orders/[id]/route.ts", "app/api/mo/submissions/route.ts"],
    tables: ["manufacturing_orders", "mo_work_orders"],
    signals: ["received_qty", "dispatch_date", "skipped_stages"],
    feeds: ["mo-materials", "piecework"],
    logicIds: ["LOG-WF-0001", "LOG-JOB-0001", "LOG-JOB-0004"],
    gaps: [
      "สถานะ MO ใน DB เป็น draft ทุกใบที่เปิดอยู่ — \"จ่ายงานแล้ว / จ่ายครบ / ส่งครบ\" ต้องถาม lib/mo-status moProgress (ใบเดียว) หรือ lib/mo-dispatch (หลายใบจาก DB) ห้ามดูจาก status",
      "สถานะใบจ่ายงานรายใบ (done / partial_return) ยังคิดสูตรเดียวกันอยู่ 3 ที่: /api/mo/submissions · /api/mo/work-orders/[id] · lib/mo-qty-reduce",
    ],
  },
  {
    key: "mo-materials",
    label: "วัตถุดิบของใบสั่งผลิต",
    flow: "ต้องซื้อ → ขอซื้อแล้ว → สั่งซื้อแล้ว (มี PO) → รับของแล้ว (บางส่วน) → ปิดงาน · ทางลัด: มีของแล้ว (กดเอง/สต๊อก) → ปิดงานเมื่อจ่ายงาน",
    ruleFiles: ["lib/mo-material-status.ts", "lib/mo-material-stage.ts", "lib/pr-line-code.ts", "lib/mo-group-materials.ts"],
    gates: ["app/api/mo/material/route.ts", "app/api/mo/material-line/route.ts", "app/api/mo/material-allocations/route.ts", "app/api/mo/[id]/mark-ready/route.ts"],
    tables: ["mo_material_summary", "mo_material_allocations"],
    signals: ["to_purchase_qty", "source_mo_nos"],
    logicIds: ["LOG-MFG-0002", "LOG-JOB-0005", "LOG-PR-0001"],
  },
  {
    key: "piecework",
    label: "จ่ายงานเหมา / ค่าแรงชิ้นงาน",
    flow: "จ่ายงานเหมา (งาน × คน) → รับคืนชิ้นงาน → คิดค่าเหมา",
    ruleFiles: ["lib/piecework-dispatch.ts"],
    gates: ["app/api/mo/piecework/route.ts"],
    tables: ["mo_piecework", "bom_piecework_lines"],
    signals: ["done_qty"],
    logicIds: ["LOG-LABOR-0001"],
  },
  {
    key: "qc-warehouse",
    label: "โกดัง QC + สต็อกสินค้าสำเร็จ",
    flow: "ช่างส่งงาน → รับเข้า QC (ดี +คลังสินค้าสำเร็จ / เสีย +คลังของเสีย) → ส่งออกจากชั้น (ไม่แตะสต็อก) → ใบขายกดจัดส่งแล้ว = ตัดของออกจากคลัง · ย้อนส่งออก / ดึงกลับ / คืนงานให้ช่าง",
    ruleFiles: ["lib/qc-ship.ts"],
    gates: ["app/api/qc-warehouse/items/route.ts"],
    tables: ["qc_warehouse_items", "qc_shelves", "erp_playground_stock_movements"],
    signals: ["qc_pulled_qty"],
    feeds: ["mo-production"],
    gaps: [
      "สต็อกลงเฉพาะของที่รับเข้าหลังต่อกลับ 2026-11-02 (จดใน audit qc.stock_in ต่อแถว) — ของเก่าบนชั้นไม่แตะสต็อก",
      "ตัดสต็อกตอนขาย = ใบขายกดจัดส่งแล้วที่เดียว (เจ้าของเลือก 2026-11-02) — ใบขายเก่าที่ยืนยันก่อน 2 พ.ย. ยังจองของค้าง กดจัดส่งจะตัดคลังจนติดลบ (หน้าใบขายเตือนก่อนกด)",
    ],
  },
  {
    key: "purchasing",
    label: "จัดซื้อ (ขอซื้อ → สั่งซื้อ → รับของ)",
    flow: "ขอซื้อ → อนุมัติ / ไม่อนุมัติ → ออก PO (ร่าง = สั่งแล้ว) → รับของ (ครบ / บางส่วน / ปิดยอด) → ใบสำคัญรับ",
    ruleFiles: ["lib/po-total.ts", "lib/po-line-price.ts", "lib/po-manual.ts", "lib/pr-cart.ts", "lib/purchase-voucher-server.ts", "components/receive-line-modal/index.tsx"],
    gates: [
      "app/api/purchasing/pr-approve/route.ts", "app/api/purchasing/pr-delete/route.ts", "app/api/purchasing/create-po/route.ts",
      "app/api/purchasing/receive/route.ts", "app/api/purchasing/cancel-line/route.ts",
    ],
    tables: ["purchase_requests_v2", "purchase_orders_v2", "purchase_order_lines_v2", "goods_receipts_v2", "goods_receipt_lines_v2"],
    signals: ["line_closed"],
    feeds: ["mo-materials"],
    logicIds: ["LOG-PUR-0001", "LOG-REC-0001", "LOG-PR-0001"],
    gaps: ["สถานะใบขอซื้อ / ใบสั่งซื้อยังไม่มีไฟล์กติกากลาง — แต่ละ API เปลี่ยนสถานะเอง (pr-approve, create-po, receive, lib/order-capture)"],
  },
  {
    key: "quotation",
    label: "ใบเสนอราคา",
    flow: "ร่าง → ส่งแล้ว → ตอบรับ → แปลงแล้ว (ดึงเข้าใบสั่งขาย หรือ แปลงเป็นใบขายตรง) · ปฏิเสธ / หมดอายุ / ยกเลิก · ยกเลิกใบสั่งขาย = กลับ \"ตอบรับแล้ว\"",
    ruleFiles: ["lib/quote-convert.ts", "lib/quote-pull.ts"],
    gates: ["app/api/quotations/[id]/transition/route.ts", "app/api/quotations/[id]/convert/route.ts", "app/api/so-orders/route.ts", "app/api/so-orders/[id]/route.ts"],
    tables: ["erp_playground_quotations", "erp_playground_quote_lines"],
    signals: ["converted_so_id", "quote_id"],
    feeds: ["so-order", "sales-order"],
    gaps: [
      "สถานะปกติ (ส่ง/ตอบรับ/ปฏิเสธ/ยกเลิก) อยู่ในตาราง erp_workflow_transitions + RPC erp_playground_quote_transition (ฐานข้อมูล) — \"แปลงแล้ว\" ทั้ง 2 ทางไม่อยู่ในตารางนั้น (RPC erp_playground_quote_to_so · lib/quote-convert)",
    ],
  },
  {
    key: "sales-order",
    label: "ใบขาย (SO)",
    flow: "ร่าง → ยืนยัน → กำลังผลิต → พร้อมส่ง → ส่งแล้ว → สำเร็จ / ยกเลิก",
    ruleFiles: ["lib/so-status.ts"],
    gates: [],
    tables: ["erp_playground_sales_orders"],
    signals: [],
    logicIds: ["LOG-SALES-0001", "LOG-SALES-0006"],
    gaps: ["มีแค่ป้าย/สีสถานะเป็นของกลาง — ยังไม่มีกติกา \"เปลี่ยนจากสถานะไหนไปไหนได้\""],
  },
  {
    key: "so-order",
    label: "ใบสั่งขาย (ออเดอร์ลูกค้า) + ชุด",
    flow: "ลงออเดอร์ (จัดชุด) → เปิดใบสั่งผลิต (เข้าชุดเอง) → กำลังผลิต → ทำเสร็จ → ส่งแล้ว (ออกใบขายได้) / ยกเลิก",
    ruleFiles: ["app/api/so-orders/open-mo.ts", "lib/so-order-stage.ts"],
    gates: ["app/api/so-orders/route.ts", "app/api/so-orders/[id]/route.ts"],
    tables: ["so_orders", "so_order_lines", "mo_groups"],
    signals: ["mo_group_id", "mo_opened_at"],
    feeds: ["mo-production", "sales-order"],
    gaps: ["สถานะใบสั่งขาย (confirmed/shipped/cancelled) ยังเปลี่ยนตรงใน /api/so-orders/[id] — ยังไม่มีไฟล์กติกา \"จากไหนไปไหนได้\""],
  },
  {
    key: "website-order",
    label: "ออเดอร์เว็บร้าน",
    flow: "รอดำเนินการ → กำลังเตรียม → ส่งแล้ว → สำเร็จ / ยกเลิก (+ สถานะจ่ายเงินแยก: ยังไม่จ่าย → จ่ายแล้ว → คืนเงิน)",
    ruleFiles: ["lib/website-order-status.ts"],
    gates: ["app/api/website/orders/route.ts"],
    tables: ["store_orders", "store_order_items"],
    signals: ["payment_status"],
    logicIds: ["LOG-MKT-0002", "LOG-MKT-0004"],
  },
  {
    key: "creative-task",
    label: "งานครีเอทีฟ / งานย่อย + อนุมัติผลงาน",
    flow: "ตั้งค่าได้ในระบบ (ตาราง erp_creative_statuses + เส้นทาง) · อนุมัติ / ตีกลับ / แก้ ต้องมีสิทธิ์ tasks.approve",
    ruleFiles: ["lib/creative-statuses-server.ts", "lib/creative-status-colors.ts", "lib/approval-token.ts"],
    gates: [],
    tables: ["erp_creative_statuses", "erp_creative_status_transitions"],
    signals: [],
  },
  {
    key: "status-labels",
    label: "ป้ายสถานะกลาง (ตาราง / การ์ดสรุป)",
    flow: "ชื่อ + สีป้ายสถานะที่ตารางกลางและการ์ดสรุปใช้ร่วมกัน (ตั้งทับรายโมดูลได้)",
    ruleFiles: ["lib/status-config.ts"],
    gates: [],
    tables: [],
    signals: [],
  },
];

/** หา workflow จาก key หรือชื่อไฟล์กติกา (เช่น "mo-dispatch" / "lib/mo-dispatch.ts") */
export function findWorkflows(q: string): WorkflowDef[] {
  const s = q.trim().toLowerCase().replace(/\\/g, "/");
  if (!s) return [];
  const byKey = WORKFLOWS.filter((w) => w.key === s);
  if (byKey.length) return byKey;
  return WORKFLOWS.filter((w) => w.ruleFiles.some((f) => {
    const name = f.toLowerCase();
    const base = name.split("/").pop()!.replace(/\.(ts|tsx)$/, "");
    return name === s || base === s || name.replace(/\.(ts|tsx)$/, "") === s || (base === "index" && name.includes(`/${s}/`));
  }));
}
