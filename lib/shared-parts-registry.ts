/**
 * ทะเบียนของกลาง (Shared parts registry) — "มีของกลางอะไรบ้าง ใช้ทำอะไร ใช้เมื่อไหร่ ห้ามใช้เมื่อไหร่ ตัวไหนซ้ำ ตัวไหนเลิกแล้ว"
 *
 * เจ้าของสั่ง 2026-11-06: หน้า /admin/plugins เดิมกรอกมือ 19 ตัว (ตาราง erp_plugins) ตกยุค ตัวเลขพิมพ์เอง สวิตช์ไม่มีผล
 *   → ย้ายมาเป็นทะเบียนในโค้ด + ตัวนับ "ใครใช้บ้าง" จากโค้ดจริงทุกครั้งที่ build (scripts/shared-parts-scan.mjs → lib/shared-parts-usage.json)
 *
 * ไฟล์นี้เก็บแค่ "ของที่คนต้องบอก" (ชื่อ · หมวด · ใช้ทำอะไร · ใช้/ห้ามใช้เมื่อไหร่ · กลุ่มงานเดียวกัน · ตัวเก่า)
 * ส่วน "ใช้กี่ที่ ที่ไหน" ห้ามจดมือ — สคริปต์นับให้ (เหมือน lib/workflow-registry + scripts/where-used.mjs)
 *
 * กติกา:
 *   - สร้างของกลางใหม่ → ค้นที่นี่ก่อนว่ามีตัวที่ทำงานเดียวกันไหม (ช่อง sameJob) · ถ้าไม่มีค่อยสร้าง แล้วลงทะเบียน
 *   - source.path = โฟลเดอร์/ไฟล์ (ไม่ต้องใส่นามสกุล) · source.names = นับเฉพาะชื่อที่ import (ใช้กับไฟล์ที่รวมหลายตัว เช่น components/pickers)
 *   - ⚠️ เขียน source เป็นบรรทัดเดียวแบบ  source: { path: "…", names: ["…"] }  — สคริปต์ build อ่านด้วย regex (ไม่ต้องพึ่ง Node รุ่นที่อ่าน .ts ได้)
 *   - ย้าย/ลบไฟล์ → แก้ทะเบียน (เทสต์ lib/__tests__/shared-parts-registry.test.ts เช็กว่า path มีจริง)
 * ⚠️ ไฟล์นี้ต้อง pure (ไม่ import อะไร) — ใช้ได้ทั้ง API และหน้าจอ
 * คู่มือ: docs/shared-parts-registry.md
 */

export type PartCategory = "layout" | "table" | "popup" | "input" | "pick" | "file" | "data" | "state" | "print" | "notify" | "system" | "feature";

export const PART_CATEGORIES: { key: PartCategory; label: string; icon: string }[] = [
  { key: "layout", label: "โครงหน้า / ส่วนประกอบทั่วไป", icon: "i:layout-dashboard" },
  { key: "table", label: "ตาราง / ปฏิทิน", icon: "i:table" },
  { key: "popup", label: "ป๊อปอัป", icon: "i:layout-sidebar-right" },
  { key: "input", label: "ช่องกรอก / ฟอร์ม", icon: "i:forms" },
  { key: "pick", label: "เลือกข้อมูล", icon: "i:search" },
  { key: "file", label: "รูปและไฟล์", icon: "i:photo" },
  { key: "data", label: "นำเข้า-ส่งออก", icon: "i:file-import" },
  { key: "state", label: "สถานะหน้าจอ", icon: "i:hourglass" },
  { key: "print", label: "พิมพ์", icon: "i:printer" },
  { key: "notify", label: "แจ้งเตือน", icon: "i:bell" },
  { key: "system", label: "ระบบ / สิทธิ์", icon: "i:settings" },
  { key: "feature", label: "ชิ้นงานธุรกิจ (ป๊อป/แผงใหญ่ที่หลายหน้าเปิดใช้)", icon: "i:briefcase" },
];

export type PartSource = {
  /** โฟลเดอร์หรือไฟล์ เช่น "components/data-table", "lib/audit" (ไม่ต้องใส่ .ts/.tsx) */
  path: string;
  /** นับเฉพาะ import ชื่อเหล่านี้ (ไฟล์ที่รวมหลายตัว) — ไม่ใส่ = นับทุกการ import */
  names?: string[];
};

export type SharedPart = {
  /** รหัสสั้น ไม่ซ้ำ */
  key: string;
  /** ชื่อภาษาคน */
  label: string;
  /** ชื่อในโค้ด (ให้ทีมค้นเจอ) */
  code: string;
  category: PartCategory;
  source: PartSource;
  /** ใช้ทำอะไร (ภาษาคน 1-2 ประโยค) */
  what: string;
  /** ใช้เมื่อไหร่ */
  when?: string;
  /** ห้ามใช้เมื่อไหร่ / ใช้ตัวไหนแทน */
  notWhen?: string;
  /** คู่มือใน docs/ (ชื่อไฟล์) */
  doc?: string;
  /** กลุ่มงานเดียวกัน — มีมากกว่า 1 ตัวในกลุ่ม = "ทำงานซ้ำกัน" */
  sameJob?: string;
  /** ตัวหลักของกลุ่ม (ตัวอื่นในกลุ่มควรย้ายมาใช้ตัวนี้) */
  primary?: boolean;
  /** ตัวเก่า ควรเลิกใช้ → ย้ายไปตัวนี้ (key) */
  replacedBy?: string;
  /** รหัสในทะเบียนเดิม (ตาราง erp_plugins) */
  legacyKey?: string;
  /** หมายเหตุสำคัญที่เจ้าของควรรู้ */
  note?: string;
};

/** ชื่อกลุ่มงานเดียวกัน (ภาษาคน) */
export const SAME_JOB_LABEL: Record<string, string> = {
  "line-items": "ตารางบรรทัดเอกสาร",
  "popup": "ป๊อปอัป",
  "select": "ช่องเลือกแบบพิมพ์ค้นหา",
  "file-field": "ช่องไฟล์ในฟอร์ม",
  "markup": "วาดรูปทรง / ข้อความบนรูป",
  "image-box": "ลากกรอบ / จุดบนรูป",
  "drawing-board": "กระดานวาด / แผนผัง",
  "icon-pick": "เลือกไอคอน",
};

/**
 * คำตัดสินของแต่ละกลุ่ม "คล้ายกัน" — เจ้าของงงว่า "ซ้ำ = รวมทุกอย่างไหม" (2026-11-07) → บอกชัดต่อกลุ่ม
 *   merge      = ทำงานเดียวกัน → ย้ายหน้าที่ใช้ตัวรองไปตัวหลัก (ต้องมี primary 1 ตัว) แล้วค่อยขออนุญาตลบตัวรอง
 *   check-data = หน้าตาคล้ายแต่เก็บ/อ่านข้อมูลคนละตาราง → ต้องตัดสินว่าข้อมูลจริงอยู่ไหนก่อน (ถามเจ้าของ)
 *   keep       = คล้ายแต่ตั้งใจใช้คนละงาน → ไม่รวม
 * ทุกกลุ่มใน SAME_JOB_LABEL ต้องมีคำตัดสิน (เทสต์เช็ก)
 */
export type JobVerdict = "merge" | "check-data" | "keep";

export const JOB_VERDICT_LABEL: Record<JobVerdict, { label: string; hint: string }> = {
  merge: { label: "ควรรวม", hint: "ทำงานเดียวกัน — ย้ายหน้าที่ใช้ตัวรองไปใช้ตัวหลัก พอตัวรองไม่มีใครใช้แล้วค่อยขออนุญาตลบ" },
  "check-data": { label: "ต้องเช็กข้อมูลก่อน", hint: "หน้าตาคล้ายกันแต่เก็บข้อมูลคนละตาราง — ต้องตัดสินใจก่อนว่าข้อมูลจริงอยู่ที่ไหน แล้วค่อยรวม" },
  keep: { label: "ใช้คนละงาน เก็บทั้งคู่", hint: "คล้ายกันแต่ตั้งใจใช้คนละสถานการณ์ — ไม่ต้องรวม ดูว่าตัวไหนใช้เมื่อไหร่ในรายละเอียด" },
};

export const SAME_JOB_VERDICT: Record<string, { verdict: JobVerdict; why: string }> = {
  "icon-pick": { verdict: "merge", why: "2026-11-23 รวมแล้ว: ช่องไอคอนทุกที่ใช้ IconField · IconPicker ชื่อเดิมเป็นแค่ทางผ่านไป IconField · ป๊อปใหญ่ IconPickerModal เป็นส่วน \"ดูทั้งหมด\" ของ IconField (ใช้ตรงที่ /admin/icons)" },
  "select": { verdict: "keep", why: "ดูโค้ดแล้ว (2026-11-07) ไม่ใช่ตัวซ้ำ: แบบที่ 2 พิมพ์แล้วสั่งทำทันที + ปักดาวโปรด (ใช้ย้ายหมวดในหน้าจัดเว็บร้าน) · ตัวหลักเป็นช่องเลือกที่เก็บค่าในฟอร์ม" },
  "popup": { verdict: "keep", why: "ดูโค้ดแล้ว (2026-11-07) ไม่ใช่ตัวซ้ำ: ป๊อปฝังหน้าอื่นต้องใช้พื้นที่เต็มไม่มีขอบ มีปุ่มเปิดเต็มจอ และกันเมาส์หลุดตอนลาก ซึ่งป๊อปอัปกลางยังไม่มี · ใช้ผ่าน EmbedModal เท่านั้น" },
  "file-field": { verdict: "merge", why: "ช่องหลายไฟล์ใช้จุดเดียว และยังไม่ทำตามกฎที่เก็บไฟล์ ควรให้ช่องไฟล์เดี่ยวรับหลายไฟล์ได้แทน" },
  "markup": { verdict: "merge", why: "ทั้งคู่วาดรูปทรง/ข้อความบนรูป ตัวกลางที่เลือกไว้คือกระดานวาดของใบงานออกแบบ · งานใหญ่ ต้องลองกับรูปสินค้าจริงก่อน" },
  "image-box": { verdict: "merge", why: "ทั้งคู่ลากกรอบบนรูปเป็น % ของรูป · ตัวหลักต้องเพิ่มทรงกรอบ (วงรี/หัวใจ) ก่อน กรอบบนรูปถึงย้ายมาได้" },
  "line-items": { verdict: "keep", why: "ตารางขายมีส่วนลด ภาษี สีของสินค้า เฉพาะเอกสารขาย · ถ้าจะเปลี่ยนหน้าตาตารางขายต้องถามเจ้าของก่อน" },
  "drawing-board": { verdict: "keep", why: "เจ้าของเลือกเอง (2026-11-08): กระดานวาดอิสระ (Excalidraw) ไว้วางรูป/การ์ด/วาดมือ · กระดาน flowchart (React Flow) ไว้ผังกล่องต่อเส้นที่เส้นติดกล่องเสมอ · เก็บตารางเดียวกันแต่รูปแบบข้อมูลคนละแบบ ย้ายข้ามกันไม่ได้" },
};

export const SHARED_PARTS: SharedPart[] = [
  // ───────── ตาราง ─────────
  {
    key: "data-table", label: "ตารางกลาง", code: "DataTable", category: "table",
    source: { path: "components/data-table" },
    what: "ตารางรายการครบชุด: ค้นหา กรอง เรียง มุมมองที่บันทึก จัดคอลัมน์ ติ๊กหลายแถว แก้หลายรายการ ส่งออก · ปุ่ม 📌 ตรึงคอลัมน์แรกไว้ซ้าย · ปุ่ม Σ รวม = แถวรวม/เฉลี่ยคอลัมน์ตัวเลขที่เห็นอยู่ (คอลัมน์ไม่มีสิทธิ์ไม่ถูกรวม · lib/table-totals)",
    when: "หน้ารายการหลักที่ต้องค้น กรอง ส่งออก หรือแก้หลายรายการพร้อมกัน",
    notWhen: "ตารางย่อยในป๊อปอัปหรือแท็บ ให้ใช้ตารางเล็ก (MiniTable) · หน้าข้อมูลหลักแบบตาราง+ลิ้นชัก ให้ใช้ MasterCRUD",
    legacyKey: "data_table",
  },
  {
    key: "master-crud", label: "หน้าจัดการข้อมูลหลัก", code: "MasterCRUD", category: "table",
    source: { path: "components/master-crud" },
    what: "สร้างหน้า ตาราง + ลิ้นชักดู/แก้ ครบชุดจากการตั้งค่า (ฟิลด์ สิทธิ์ ประวัติ ไฟล์แนบ) ไม่ต้องเขียนหน้าเอง · ลิ้นชัก: ลูกศร ← → เปิดรายการก่อน/ถัดไป · ⧉ ทำสำเนา (รหัส/ช่องห้ามซ้ำเว้นว่าง · ปิดด้วย duplicate:false) · Ctrl+S บันทึก · ลบชั่วคราว = แจ้ง + ปุ่มย้อนกลับ 5 วินาที (toast.undo) · กู้ข้อมูลที่พิมพ์ค้าง (formDraft:false = ปิด)",
    when: "หน้าข้อมูลหลัก เช่น ลูกค้า คลัง หน่วย แผนก สินค้า",
    notWhen: "หน้าที่มีขั้นตอนเฉพาะมาก เช่น บอร์ดจ่ายงาน หน้าแดชบอร์ด",
    doc: "crud-complete.md",
  },
  {
    key: "mini-table", label: "ตารางเล็ก", code: "MiniTable", category: "table",
    source: { path: "components/mini-table" },
    what: "ตารางย่อยในป๊อปอัป แผงข้าง แท็บ มีค้นหา เรียง จัดกลุ่ม ติ๊กเลือก กางแถว ในตัว · ปุ่ม ⬇ Excel ในตัว (exportOpts · ตัดคอลัมน์ไม่มีสิทธิ์ exportPermission · บันทึกประวัติส่งออก)",
    when: "ตารางย่อยที่ไม่ต้องกรองละเอียดหรือส่งออก",
    notWhen: "หน้ารายการหลักที่ต้องมีมุมมอง/ส่งออก ให้ใช้ตารางกลาง (DataTable)",
    doc: "mini-table.md",
  },
  {
    key: "line-items-grid", label: "ตารางบรรทัดเอกสาร", code: "LineItemsGrid", category: "table",
    source: { path: "components/line-items-grid" },
    what: "ตารางรายการในเอกสาร (สินค้า จำนวน ราคา) แก้ในตารางได้ เพิ่ม/ลบบรรทัด",
    when: "บรรทัดรายการในเอกสาร เช่น BOM ใบสั่งผลิต",
    doc: "line-items-grid.md", sameJob: "line-items",
  },
  {
    key: "sales-line-items", label: "ตารางบรรทัดเอกสารขาย", code: "SalesLineItems", category: "table",
    source: { path: "components/sales-line-items" },
    what: "บรรทัดสินค้าในใบเสนอราคา ใบสั่งขาย ใบส่งของ (เลือก SKU หน่วย ราคา ส่วนลด)",
    when: "เอกสารฝั่งขาย",
    notWhen: "เอกสารที่ไม่ใช่ฝั่งขาย (BOM, PR, PO, ใบรับของ) ให้ใช้ตารางบรรทัดเอกสารกลาง (LineItemsGrid)",
    sameJob: "line-items",
  },
  {
    key: "pager", label: "แถบแบ่งหน้า", code: "Pager", category: "table",
    source: { path: "components/pager" },
    what: "บอกจำนวนทั้งหมด + ปุ่มหน้าก่อน/ถัดไป + เลือกจำนวนต่อหน้า · ไม่รู้จำนวนทั้งหมดก็ได้ (ส่ง count + hasMore)",
    when: "รายการยาวที่ต้องแบ่งหน้า (ตารางกลางมีให้ในตัวแล้ว) รวมถึงรายการในป๊อปค้นหา",
  },
  {
    key: "bulk-action-bar", label: "แถบคำสั่งหลายรายการ", code: "BulkActionBar", category: "table",
    source: { path: "components/bulk-action-bar" },
    what: "แถบลอยล่างจอเมื่อติ๊กหลายแถว: แก้หลายรายการ ส่งออก ลบ เปลี่ยนสถานะ",
    when: "ทุกตาราง/กริดที่ติ๊กเลือกหลายรายการได้ · ในป๊อปอัปใช้ placement=\"inline\" (ติดขอบล่างกล่องเลื่อนของป๊อป ไม่จมใต้ป๊อป/ไม่บังปุ่มท้ายป๊อป)",
    notWhen: "ห้ามทำแถบปุ่มหลายรายการเองในหน้า",
    doc: "bulk-action-bar.md",
  },
  {
    key: "select-mode", label: "โหมดเลือก + Shift เลือกเป็นช่วง", code: "useSelectMode · SelectModeBar", category: "table",
    source: { path: "components/select-mode" },
    what: "เลือกหลายรายการแบบกดง่าย — Shift+กด = เลือกทั้งช่วงตามลำดับที่เห็น (ตัวตั้งต้นไม่ได้ติ๊ก = เอาออกทั้งช่วง แบบ Gmail) · ติ๊กช่องแรก = เข้าโหมดเลือกเอง (ไม่มีปุ่ม \"เลือก\" — เจ้าของ 2026-11-23) กดตรงไหนของแถว/การ์ดก็ติ๊ก แทนการเปิดรายละเอียด · ล้างหมด = ออก · มือถือกดค้าง ~0.45 วิ = ติ๊กตัวนั้น · Ctrl+A = เลือกทั้งหมดที่เห็น · กฎ pure lib/range-select (มีเทสต์)",
    when: "มีให้ในตัวแล้วในตารางกลาง MiniTable (selectable) และ DataTable (ช่องติ๊ก) — ทุกหน้าได้เอง · รายการ/กริดที่เขียนเองและติ๊กได้ ให้เรียก useSelectMode แทนการเขียน shift/โหมดเลือกเอง",
    notWhen: "ห้ามเขียน shift-click / โหมดเลือก / กดค้างเลือกเองในหน้า · เรียงลำดับด้วยการลากใช้ SortableList (มีเลือกหลายตัวของมันเอง)",
    doc: "select-mode.md",
  },
  {
    key: "sort-th", label: "หัวคอลัมน์กดเรียง", code: "SortTh", category: "table",
    source: { path: "components/sort-th" },
    what: "หัวคอลัมน์ที่กดแล้วเรียงน้อยไปมาก / มากไปน้อย",
    notWhen: "ตารางใหม่ให้ใช้ MiniTable หรือ DataTable ซึ่งเรียงได้ในตัว",
  },
  {
    key: "stat-filter-cards", label: "การ์ดตัวเลขกดกรอง", code: "StatFilterCards", category: "table",
    source: { path: "components/stat-filter-cards" },
    what: "แถวการ์ดตัวเลขสรุปที่กดแล้วกรองรายการด้านล่าง · ใบแรก = ทั้งหมด · กดใบที่เลือกซ้ำ = กลับใบแรก · ตัวเลขยังไม่มา = ขึ้นแถบรอ · การ์ดที่เป็น 0 ซ่อนเอง (ยกเว้นใบแรก/ใบที่เลือก · keep หรือ showZero = โชว์)",
    when: "หัวรายการที่อยากให้ตัวเลขสรุปเป็นปุ่มกรองในชิ้นเดียว เช่น สินค้าบนแพลตฟอร์ม (จับคู่แล้ว/รอยืนยัน) · กองงานในมุมมองหน้าร้าน",
    notWhen: "ตัวเลขที่ไม่ได้กรองอะไร (แดชบอร์ด/สรุปเฉย ๆ) — คนจะกดแล้วงง",
  },

  // ───────── ป๊อปอัป ─────────
  {
    key: "modal", label: "หน้าต่างเด้ง + ยืนยัน + ลิ้นชัก", code: "ERPModal · ConfirmDialog · Drawer · BottomSheet", category: "popup",
    source: { path: "components/modal" },
    what: "ป๊อปอัปกลางทุกแบบ ถามก่อนปิดเมื่อมีข้อมูลยังไม่บันทึก มีแบบปุ่มอันตราย จำขนาดที่ผู้ใช้ลากไว้ · BottomSheet = แผ่นเลื่อนจากล่างสำหรับจอมือถือ · Esc ปิดทีละชั้น (กองกลาง lib/esc-stack ร่วมกับดูรูปเต็มจอ/แผ่นล่าง — ชั้นลอยใหม่ใช้ useEscLayer) · ปุ่ม ➖ ย่อเป็นแถบมุมจอ ดูหน้าข้างหลังแล้วกลับมาทำต่อ (ข้อมูลไม่หาย · ป๊อปเล็ก size=sm ไม่มี)",
    when: "ทุกป๊อปอัป ทุกการยืนยันลบ / อนุมัติ / ยกเลิก ทุกลิ้นชักด้านข้าง",
    notWhen: "ห้ามเขียนป๊อปอัปเองในหน้า",
    doc: "popup-policy.md", sameJob: "popup", primary: true, legacyKey: "erp_modal",
  },
  {
    key: "resizable-modal", label: "ป๊อปฝังหน้าอื่น (ลากขยายได้)", code: "ResizableModal", category: "popup",
    source: { path: "components/resizable-modal" },
    what: "ป๊อปที่ฝังทั้งหน้าอื่นไว้ข้างใน (iframe) ใช้พื้นที่เต็มไม่มีขอบ หัวมีปุ่มเปิดเต็มจอ กันเมาส์หลุดตอนลากขอบ",
    when: "เปิดหน้าอื่นทั้งหน้าเป็นป๊อป — เรียกผ่าน EmbedModal",
    notWhen: "ป๊อปทั่วไป (ฟอร์ม ยืนยัน รายละเอียด) ให้ใช้ป๊อปอัปกลาง ERPModal",
    sameJob: "popup",
  },
  {
    key: "popover", label: "เมนูลอยเล็ก", code: "Popover", category: "popup",
    source: { path: "components/popover" },
    what: "เมนูหรือแผงเล็กที่ลอยออกมาจากปุ่ม ไม่โดนกล่องอื่นบัง",
    when: "เมนูตัวเลือกเล็ก ๆ ข้างปุ่ม",
    notWhen: "เนื้อหายาวหรือมีฟอร์ม ให้ใช้ป๊อปอัปกลาง",
  },
  {
    key: "floating-dropdown", label: "ตัวช่วยให้ dropdown ลอยทับ", code: "FloatingDropdown", category: "popup",
    source: { path: "components/floating-dropdown" },
    what: "ทำให้รายการ dropdown ลอยทับเนื้อหา ไม่โดนตารางหรือป๊อปอัปตัดขอบ",
    when: "สร้างช่องเลือกแบบใหม่ที่ต้องมีรายการลอย",
  },
  {
    key: "pip-window", label: "หน้าต่างจิ๋วลอยทับทุกโปรแกรม", code: "usePipWindow · PipPortal", category: "popup",
    source: { path: "components/pip-window" },
    what: "ดึงตัวเลข/สถานะเล็ก ๆ ออกไปเป็นหน้าต่างจิ๋วที่ลอยทับทุกโปรแกรม ไปทำงานแท็บอื่นก็ยังเห็น (Chrome/Edge บนคอม)",
    when: "อยากให้เห็นตลอดขณะทำอย่างอื่น เช่น นับถอยหลังขึ้นเว็บ (/admin/deploy) จับเวลา สถานะงานยาว",
    notWhen: "แผงลอยแค่ในหน้าเว็บ ให้ใช้ FloatingPanel · ฟอร์มที่ต้องกรอก ให้ใช้ป๊อปอัปกลาง · แจ้งผลสั้น ๆ ให้ใช้ Toast",
    doc: "pip-window.md",
  },
  {
    key: "menu-bar", label: "แถบเมนูชี้แล้วเด้ง", code: "MenuBar", category: "popup",
    source: { path: "components/menu-bar" },
    what: "รวมปุ่มเยอะ ๆ ในแถบเครื่องมือเป็นเมนูไม่กี่หัว ชี้เมาส์แล้วเมนูโผล่ (จอสัมผัสกดเปิด) มีเมนูย่อยซ้อน ตัวเลือกแบบเลือก 1/ติ๊ก/สวิตช์ ไอคอนเส้น · เมนูที่กำลังกรองอยู่เป็นสีฟ้า มี × ล้าง",
    when: "แถบเครื่องมือ/แถบปุ่มล่างของป๊อปที่ปุ่มเรียงยาวจนรก (Design Dashboard · ป๊อปใบงานออกแบบ แท็บตีราคา + ปุ่มล่าง) · เด้งขึ้นด้านบนได้ (placement=\"up\")",
    notWhen: "เมนูเล็กกดเปิดข้างปุ่มเดียว ให้ใช้ Popover · เนื้อหายาวหรือมีฟอร์มหลายช่อง ให้ใช้ป๊อปอัปกลาง",
    doc: "menu-bar.md",
  },

  // ───────── ช่องกรอก / ฟอร์ม ─────────
  {
    key: "form", label: "ฟอร์มกลาง", code: "ERPForm", category: "input",
    source: { path: "components/form" },
    what: "ฟอร์มพร้อมตรวจข้อมูล ช่องบังคับ ข้อความผิดพลาด บันทึกร่าง กันกดซ้ำ สิทธิ์รายช่อง · Ctrl+S บันทึก (useSaveShortcut ใช้ร่วมกับ SaveBar/ลิ้นชัก MasterCRUD) · กู้ข้อมูลที่พิมพ์ค้าง useFormDraft (เก็บในเครื่อง ไม่เก็บช่องลับ · ลิ้นชัก MasterCRUD ใช้แล้ว)",
    when: "ฟอร์มสร้าง/แก้ข้อมูลที่ไม่ได้อยู่ใน MasterCRUD",
    legacyKey: "erp_form",
  },
  {
    key: "money-input", label: "ช่องจำนวนเงิน", code: "MoneyInput", category: "input",
    source: { path: "components/money-input" },
    what: "ใส่คอมมาให้ ปัดทศนิยม กันพิมพ์ผิด · พิมพ์สูตรได้ เช่น 1200*3+50 แล้ว Enter (lib/calc-expression ไม่ใช้ eval)",
    when: "ทุกช่องที่เป็นเงิน",
    notWhen: "ช่องจำนวนชิ้น ให้ใช้ StepInput หรือช่องตัวเลขปกติ",
    doc: "money-input.md",
  },
  {
    key: "fx-rate-quick", label: "ตัวตั้งเรทเงินวันนี้", code: "FxRateQuickModal", category: "input",
    source: { path: "components/fx-rate-quick" },
    what: "ป๊อปเปลี่ยนเรท ฿/สกุลต่างประเทศของเอกสาร · ติ๊ก \"ตั้งเป็นเรทกลางวันนี้ด้วย\" = อัปเดตเรทหยวนกลาง (daily_rates) ผ่าน API กลาง /api/master-v2/daily-rates · บอกเรทกลางล่าสุด + ป้าย \"เรทกลางเก่า n วัน\" (RateStaleChip · เกิน 3 วัน) · ตั้งเรทกลางแล้วมีปุ่มย้อนกลับ · กติกาใน lib/daily-rate",
    when: "เอกสารที่มีเรทแปลงเงิน (ใบสำคัญรับ · ต่อไป PO / บิลจีน) และอยากให้คนออกเอกสารอัปเดตเรทกลางได้ทันที",
    notWhen: "เอกสารที่ล็อกแล้ว (ยืนยัน/ไม่มีสิทธิ์แก้) · หน้าจัดการเรทเต็ม (ประวัติ/ลบ) ยังอยู่ที่แอปโอนเงินจีน แท็บเรท",
    doc: "fx-rate-quick.md",
  },
  {
    key: "date-input", label: "ช่องวันที่", code: "DateInput", category: "input",
    source: { path: "components/date-input" },
    what: "ช่องเลือกวันที่/เวลา แบบ 24 ชั่วโมง ใช้เหมือนกันทุกหน้า · คลิกช่องมีปุ่มลัด วันนี้/พรุ่งนี้/+7 วัน/สิ้นเดือน (เวลาไทย) · เลือกช่วงวันที่ในปฏิทินเดียว = DateRangeInput (components/date-input/range · คลิก/ลาก + ปุ่ม 7 วัน/เดือนนี้/เดือนก่อน)",
    when: "ทุกช่องวันที่",
  },
  {
    key: "date-cards", label: "การ์ดวันสำคัญ + เส้นเวลา", code: "DateCards", category: "input",
    source: { path: "components/date-cards" },
    what: "การ์ดวันละใบ เลขวันตัวใหญ่ + ป้าย อีก/เลยกี่วัน (สีตามความใกล้) กดการ์ดเลือกวัน + เส้นเวลาจากวันเริ่มถึงกำหนด ที่แคบเป็นแถวเตี้ย",
    when: "หัวเอกสารที่มีวันสำคัญ 2-4 วันให้เห็นทันที เช่น วันสั่ง / วันนัด / Deadline (เริ่มที่ใบงานออกแบบ)",
    notWhen: "ช่องกรอกวันที่ทั่วไปในฟอร์ม ให้ใช้ DateInput · มุมมองปฏิทินทั้งเดือน ให้ใช้ปฏิทินเอกสาร",
    doc: "date-cards.md",
  },
  {
    key: "step-input", label: "ช่องตัวเลข + ปุ่ม −/+", code: "StepInput", category: "input",
    source: { path: "components/step-input" },
    what: "ช่องตัวเลขที่กด −/+ หรือหมุนลูกกลิ้งเมาส์ปรับทีละขั้น",
    when: "จำนวนชิ้น จำนวนแถว ค่าที่ปรับทีละนิด",
    doc: "step-input.md",
  },
  {
    key: "save-bar", label: "แถบบันทึกติดขอบล่างหน้า", code: "SaveBar", category: "input",
    source: { path: "components/save-bar" },
    what: "ปุ่มบันทึก/ยกเลิก โผล่ติดขอบล่างเมื่อมีการแก้ไข · Ctrl+S = บันทึก (แป้นไทยใช้ได้)",
    when: "หน้าตั้งค่า/หน้าแก้ข้อมูลเต็มหน้า",
    notWhen: "แท็บย่อยในป๊อปอัปหรือลิ้นชัก ให้ใช้ FooterSave",
    doc: "save-bar.md",
  },
  {
    key: "save-all", label: "บันทึกทั้งหมด (แก้หลายแถว)", code: "useSaveAll / SaveAllBar", category: "input",
    source: { path: "components/save-bar/save-all" },
    what: "แก้หลายแถวแล้วกด \"บันทึกทั้งหมด (N)\" ครั้งเดียว · แถวที่แก้ค้างมีแถบส้ม · บอกผลสำเร็จ/พลาด · ย้อนกลับได้ · Ctrl+S",
    when: "ตาราง/ป๊อปที่แต่ละแถวแก้ได้และต้องบันทึก เช่น ค่าเริ่มต้น SKU ต่อประเภท · เทอมจ่ายร้าน",
    notWhen: "ฟอร์มเดียว ใช้ SaveBar · หน้าที่บันทึกทันทีทุกการแก้ไม่ต้องมีปุ่ม",
    doc: "save-bar.md",
  },
  {
    key: "split-panes", label: "กล่องแบ่งซ้าย-ขวา ดันกันได้", code: "SplitPanes", category: "input",
    source: { path: "components/split-panes" },
    what: "แบ่งหน้าเป็น 2 กล่องซ้าย-ขวา กดกล่องไหนกล่องนั้นขยายดันอีกฝั่งให้แคบ (หรือพับเหลือแถบ) จำฝั่งที่ขยายต่อคน ที่แคบเรียงบน-ล่างเอง",
    when: "ฟอร์มที่มีข้อมูล 2 ก้อนใช้คู่กัน เช่น ช่องข้อมูล + กล่องรายละเอียดยาว (เริ่มที่ใบงานออกแบบ แท็บข้อมูลงาน)",
    notWhen: "เนื้อหาคนละเรื่องที่ไม่ต้องดูพร้อมกัน ให้ใช้แท็บ · ปรับขนาดหน้าต่างทั้งใบ ให้ใช้ป๊อปอัปกลาง · แบ่งทั้งจอเป็น 2 หน้า ให้ใช้ SplitScreen",
    doc: "split-panes.md",
  },
  {
    key: "split-screen", label: "แบ่งจอ 2 หน้า (Ctrl+คลิก/ลากแท็บ)", code: "SplitScreenHost / openSplit", category: "input",
    source: { path: "components/split-screen" },
    what: "กด Ctrl ค้างแล้วคลิกหรือลากแท็บไปขอบขวา = แบ่งจอทั้งแอป หน้าเดิมซ้าย แท็บนั้นขวา (หน้าจริงฝัง) ลากเส้นกลางปรับขนาด · วางที่ app/layout ครั้งเดียว ใช้ได้กับแท็บทุกหน้าที่มี role=tab / data-tab-key / กลุ่มปุ่มสลับ",
    when: "อยากดู 2 มุมมองพร้อมกัน เช่น ปฏิทินซ้าย กระดานขวา · แท็บใหม่ใส่ role=\"tab\" + data-split-href (ลิงก์เปิดแท็บนั้นตรง ๆ) ก็แบ่งจอได้เลย",
    notWhen: "2 กล่องในหน้าเดียวกัน ให้ใช้ SplitPanes · จอแคบกว่า 1024px / มือถือ ไม่ทำงาน",
    doc: "split-screen.md",
  },
  {
    key: "footer-save", label: "ปุ่มบันทึกที่แถบล่างของป๊อปอัป", code: "FooterSave", category: "input",
    source: { path: "components/footer-save" },
    what: "ย้ายปุ่มบันทึกของแท็บย่อยไปอยู่แถบล่างของหน้าต่าง",
    when: "แท็บย่อยในลิ้นชัก/ป๊อปอัป",
    notWhen: "หน้าเต็ม ให้ใช้ SaveBar",
  },
  {
    key: "searchable-select", label: "ช่องเลือกแบบพิมพ์ค้นหา", code: "SearchableSelect · SearchableMultiSelect", category: "input",
    source: { path: "components/searchable-select" },
    what: "dropdown ที่พิมพ์กรองรายการได้ ใช้แทน select ธรรมดา · แบบเลือกหลายค่า (SearchableMultiSelect) = ติ๊กได้หลายตัว ชิปไม่กางเต็มจอ (+N) ป้ายค่าที่ระบบแนะนำ พิมพ์ค่าเองได้ · ค้นไม่ต้องตรงเป๊ะ (lib/fuzzy-rank: เป๊ะก่อน · ข้ามตัวคั่น · ลืมสลับแป้นไทย/อังกฤษ) · ปุ่ม + สร้างใหม่ท้ายรายการ (onCreate + createPermission · Enter สร้าง) · ค้นไม่ต้องตรงเป๊ะ (lib/fuzzy-rank: เป๊ะก่อน · ข้ามตัวคั่น · ลืมสลับแป้นไทย/อังกฤษ) · ปุ่ม + สร้างใหม่ท้ายรายการ (onCreate + createPermission · Enter สร้าง) · ค้นไม่ต้องตรงเป๊ะ (lib/fuzzy-rank: เป๊ะก่อน · ข้ามตัวคั่น · ลืมสลับแป้นไทย/อังกฤษ) · ปุ่ม + สร้างใหม่ท้ายรายการ (onCreate + createPermission · Enter สร้าง)",
    when: "รายการตัวเลือกยาวกว่า ~10 ตัว · ช่องเลือกหลายค่า เช่น คุณลักษณะของหมวดร้านค้า (LazadaAttrField ใช้อยู่)",
    notWhen: "เลือกข้อมูลหลัก (สินค้า ร้าน ลูกค้า) ให้ใช้ Picker เฉพาะของมัน",
    sameJob: "select", primary: true,
  },
  {
    key: "free-text-picker", label: "ช่องพิมพ์ชื่อเอง + รายการประจำ", code: "FreeTextPicker", category: "input",
    source: { path: "components/free-text-picker" },
    what: "ช่องพิมพ์ข้อความอิสระ กดแล้วมีรายการชื่อที่ใช้บ่อย (ใช้บ่อยขึ้นก่อน) · พิมพ์ชื่อใหม่ใช้ครั้งเดียวได้ หรือกดเพิ่มเข้ารายการ · แก้ชื่อ/ลบในรายการ (สิทธิ์ products.edit) · แยกชุดด้วย kind (ตาราง free_text_names) · เก็บเป็นข้อความ ไม่ผูก id",
    when: "ช่องชื่อที่ยังไม่มีรหัสจริงแต่อยากให้เลือกซ้ำได้ — kind=\"bom_material\" วัตถุดิบในคำขอแก้สูตร · kind=\"cut_piece\" ชื่อชิ้นตัด (สูตร BOM · หน้าคิดผ้า /fabric-calc) · ช่องใหม่ = ตั้ง kind ใหม่ ไม่ต้องสร้างตาราง",
    notWhen: "เลือกจากรายการตายตัวที่ห้ามพิมพ์เอง → SearchableSelect · เลือกข้อมูลหลัก (สินค้า ผ้า ร้าน) → Picker เฉพาะของมัน",
  },
  {
    key: "search-pick", label: "ช่องพิมพ์ค้นแล้วสั่งทำทันที (มีดาวโปรด)", code: "SearchPick", category: "input",
    source: { path: "components/search-pick" },
    what: "พิมพ์ค้น กดรายการแล้วสั่งทำทันที (ไม่ได้เก็บค่า) + ปักดาวรายการโปรด เช่น ย้ายสินค้าไปหมวดอื่น",
    when: "ปุ่มลัดแบบ เลือกแล้วทำเลย ที่รายการยาว",
    notWhen: "ช่องในฟอร์มที่ต้องเก็บค่าที่เลือก ให้ใช้ SearchableSelect",
    sameJob: "select",
  },

  // ───────── เลือกข้อมูล ─────────
  {
    key: "sku-picker", label: "เลือกสินค้า (SKU)", code: "SkuPicker", category: "pick",
    source: { path: "components/pickers", names: ["SkuPicker"] },
    what: "ค้นหาสินค้าด้วยรหัสหรือชื่อ มีรูปย่อ จำตัวที่เลือกล่าสุด · ยิงบาร์โค้ดเข้าช่องค้นได้ (แป้นไทยก็ถูก · ตรงเป๊ะตัวเดียว = เลือกให้เลย · useScanInBox)",
    when: "ทุกช่องที่ต้องเลือกสินค้า 1 ตัว",
    notWhen: "เลือกหลายตัวพร้อมกัน ให้ใช้ SkuMultiPicker",
    note: "ตัวที่ใช้จริงทั้งระบบ — ProductPicker ตัวเก่า (สินค้าชุดทดลอง) ลบแล้ว 2026-11-07",
  },
  {
    key: "sku-multi-picker", label: "เลือกสินค้าหลายตัว", code: "SkuMultiPickerModal", category: "pick",
    source: { path: "components/sku-multi-picker" },
    what: "ป๊อปเลือกสินค้าหลายตัวพร้อมกัน กรองตามแท็ก/แบรนด์ · วางรหัสหลายตัวจาก Excel ในช่องค้น → ติ๊กให้ + บอกรหัสที่ไม่พบ (POST /api/pickers/skus { codes }) · วางรหัสหลายตัวจาก Excel ในช่องค้น → ติ๊กให้ + บอกรหัสที่ไม่พบ (POST /api/pickers/skus { codes }) · วางรหัสหลายตัวจาก Excel ในช่องค้น → ติ๊กให้ + บอกรหัสที่ไม่พบ (POST /api/pickers/skus { codes })",
    when: "ส่งสินค้าหลายตัวเข้าเอกสารหรือแผน",
  },
  {
    key: "parent-sku-picker", label: "เลือกรุ่นสินค้า (Parent SKU)", code: "ParentSkuPicker", category: "pick",
    source: { path: "components/pickers", names: ["ParentSkuPicker"] },
    what: "ค้นหารุ่นสินค้า (แม่ของหลายสี/ไซซ์)",
    when: "งานที่ผูกกับรุ่น ไม่ใช่ SKU รายตัว",
  },
  {
    key: "supplier-picker", label: "เลือกร้าน / ผู้จำหน่าย", code: "SupplierPicker", category: "pick",
    source: { path: "components/supplier-picker" },
    what: "ค้นร้านจากทะเบียนคู่ค้าจริง (partners) + ปุ่มเพิ่มร้านใหม่",
    when: "ทุกช่องเลือกร้าน",
    notWhen: "ตัวเก่าใน components/pickers (ร้านทดลอง 5 ร้าน) ลบแล้ว 2026-11-07 — ใช้ตัวนี้ตัวเดียว",
  },
  {
    key: "customer-picker", label: "เลือกลูกค้า", code: "CustomerPicker", category: "pick",
    source: { path: "components/pickers", names: ["CustomerPicker"] },
    what: "ค้นหาลูกค้าด้วยรหัส/ชื่อ จำตัวล่าสุด",
    when: "เอกสารขายทุกใบ",
    note: "เลือกหลายราย: ใส่ onPickMany (ติ๊กหลายรายการ + ติ๊กทั้งหมดที่ค้นเจอ) + exclude (ซ่อนตัวที่เลือกแล้ว) — มีในทุก Picker ข้อมูลหลักที่สร้างจาก createMasterPicker (ลูกค้า ผู้ใช้ คลัง แผนก หน่วย ภาษี) · ใช้ที่หน้าแบรนด์ (ลูกค้าประจำหลายสาขา)",
  },
  {
    key: "menu-page-picker", label: "เลือกหน้าใน ERP (จากเมนูจริง)", code: "MenuPagePickerModal", category: "pick",
    source: { path: "components/menu-page-picker" },
    what: "ป๊อปเลือกหน้าในระบบจากเมนูจริง (erp_menu_items + erp_app_groups) จัดกลุ่มตามแอป ค้นชื่อหน้า/ลิงก์/ชื่อแอป ไม่ต้องพิมพ์ลิงก์เอง · มี useMenuPages ไว้เช็กว่าหน้ายังอยู่ในเมนูไหม",
    when: "อยากให้ผู้ใช้ชี้ไปหน้าใดหน้าหนึ่งในระบบ เช่น กล่อง \"หน้าใน ERP\" ในกระดาน flowchart (แผนผังการเก็บไฟล์)",
    notWhen: "เพิ่ม/เอาเมนูออกจากแอป → แท็บ \"เมนูและคนเห็น\" ใน ⚙️ ตั้งค่าแอป (components/app-settings-panel — ตัวเลือกในนั้นทำงานคนละแบบ: เติมเมนูเข้าแอป + สร้างลิงก์ใหม่) · ลิงก์ออกนอกระบบ → ช่องลิงก์ธรรมดา",
    doc: "menu-page-picker.md",
    note: "ไม่กรองตามสิทธิ์ — โชว์ทุกหน้าที่เปิดอยู่ในเมนู หน้าปลายทางตรวจสิทธิ์เองตอนเปิด · ตรรกะล้วน + เทสต์ lib/menu-pages.ts",
  },
  {
    key: "album-cover", label: "ปกอัลบั้ม (รูปรวมบนการ์ดแฟ้ม)", code: "AlbumCover", category: "file",
    source: { path: "components/album-cover" },
    what: "ปกรวมรูปบนการ์ดอัลบั้ม/แฟ้ม แบบปรับตามจำนวนรูป: 1 รูป เต็มปก · 2 ซ้ายขวา · 3 ใหญ่ 1 + เล็ก 2 · 4+ ใหญ่ 1 + เล็ก 3 ช่องสุดท้าย +N (ทรงเดียวกับการ์ดอัลบั้ม Contents แต่ไม่มีช่องว่าง)",
    when: "การ์ดอัลบั้ม/แฟ้มรูปที่อยากเห็นรูปข้างในก่อนกดเปิด — ใช้ที่หน้า SAMPLE Images",
    notWhen: "แกลเลอรีรูปเต็มในอัลบั้ม → กริดรูป/ImageManager · รูปเดี่ยว → img/HoverImage · หน้า Contents ยังเขียนปกของตัวเอง (ย้ายมาใช้ตัวนี้ได้ทีหลัง)",
    doc: "album-cover.md",
    note: "เจ้าของเลือกแบบ C จาก widget 4 แบบ (2026-11-14) · ตรรกะแบบปก + เทสต์ lib/album-cover.ts",
  },
  {
    key: "design-sheet-picker", label: "เลือกใบงานออกแบบ (มีรูป ค้นได้)", code: "DesignSheetPickerModal", category: "pick",
    source: { path: "components/design-sheet-picker" },
    what: "ป๊อปเลือกใบงานออกแบบ 1 ใบ (ใบงานใน Design Dashboard): ค้นรหัส/ชื่องาน/แบรนด์ (ไฮไลต์คำที่ตรง) · รูปปกทุกใบ · สลับการ์ดรูป ↔ รายการ (จำต่อคน) · กรองแบรนด์ · ซ่อนงานปิดแล้ว · ใช้ล่าสุด · เปิดมากรองแบรนด์ได้ (initialBrand) · เลือกแล้วกดยืนยัน",
    when: "ต้องให้ผู้ใช้ชี้ใบงานออกแบบใบเดียว เช่น หน้า SAMPLE Images ย้ายรูปตัวอย่างเข้าใบงาน",
    notWhen: "เลือกหลายใบพร้อมกัน → SearchMultiPick (ตัวเลือกใบงานบนกระดานแคมเปญ app/tasks/campaigns/[id]/multi-picks.tsx — ทำงานคนละแบบ: ติ๊กหลายใบ) · เปิดดู/แก้ใบงาน → DesignSheetsDetail",
    doc: "design-sheet-picker.md",
    note: "ข้อมูลชุดเดียวกับ Design Dashboard (GET /api/design-sheets + /statuses · สิทธิ์ products.view) · จำนวนการ์ดต่อแถวใช้ของกลาง gallery-columns",
  },
  {
    key: "user-picker", label: "เลือกผู้ใช้", code: "UserPicker", category: "pick",
    source: { path: "components/pickers", names: ["UserPicker"] },
    what: "เลือกผู้ใช้ระบบ (คนรับงาน ผู้อนุมัติ) จำตัวล่าสุด",
    when: "มอบหมายงาน ผู้รับผิดชอบ",
    notWhen: "เลือกพนักงานในงาน HR / เงินเดือน ให้ใช้ RealEmployeePicker",
  },
  {
    key: "warehouse-picker", label: "เลือกคลัง", code: "WarehousePicker", category: "pick",
    source: { path: "components/pickers", names: ["WarehousePicker"] },
    what: "เลือกคลังสินค้า",
  },
  {
    key: "uom-picker", label: "เลือกหน่วยนับ", code: "UomPicker", category: "pick",
    source: { path: "components/uom-picker" },
    what: "เลือกหน่วยนับจากทะเบียนหน่วยจริง (ตาราง uoms — ตัวเดียวกับหน่วยของสินค้า) โชว์ 2 ภาษา \"หลา · Yard\" ค้นได้ทั้งไทย/อังกฤษ/ชื่ออื่น เก็บเป็นชื่อหลักของหน่วย พิมพ์หน่วยใหม่ได้ · ชื่อ/เทียบ/หาหน่วยซ้ำ = lib/uom-names (docs/uom-bilingual.md)",
    when: "ทุกช่องหน่วยนับ (บรรทัดใบขาย ร้านที่จำหน่าย ขอเพิ่มวัตถุดิบ)",
    notWhen: "ห้ามสร้างหน่วยใหม่ที่ความหมายเดียวกับหน่วยเดิม (หลา/Yard) — ใส่เป็นชื่ออังกฤษ/ชื่ออื่นของหน่วยเดิม หรือกด \"รวมหน่วยซ้ำ\" ที่ /master/uoms",
  },
  {
    key: "real-employee-picker", label: "เลือกพนักงานจริง (HR)", code: "RealEmployeePicker", category: "pick",
    source: { path: "components/real-employee-picker" },
    what: "เลือกพนักงานจากตารางพนักงานจริงของ HR / เงินเดือน",
    when: "งาน HR เงินเดือน บันทึกงาน",
    notWhen: "คนที่ล็อกอินได้ (เซลส์ คนรับงาน ผู้อนุมัติ) ให้ใช้ UserPicker",
  },
  {
    key: "relation-picker", label: "เลือกข้อมูลที่ผูกกัน (ช่องอ้างอิง)", code: "RelationPicker", category: "pick",
    source: { path: "components/relation-picker" },
    what: "ช่องเลือกข้อมูลจากตารางอื่นแบบค้นหาได้ ใช้กับช่องที่ผูกตาราง (FK) ทั่วไป",
    when: "ช่องผูกตารางที่ยังไม่มี Picker เฉพาะ",
  },
  {
    key: "material-picker", label: "เลือกวัตถุดิบ", code: "MaterialPicker", category: "pick",
    source: { path: "components/material-picker" },
    what: "เลือกวัตถุดิบ/ชิ้นส่วน พร้อมรูปและสต๊อก · MaterialSearchPanel = เนื้อในค้นแบบเต็ม (การ์ดรูป + ปุ่มกรองแท็ก/คำค้น) ฝังในป๊อปอื่นได้",
    when: "BOM ขอซื้อวัตถุดิบ · ป๊อปเลือกวัสดุ Design Library (แท็บรายการ/ค้นทั้งหมด)",
  },
  {
    key: "material-quick-create", label: "เลือก + เพิ่มวัสดุตีราคาด่วน", code: "MaterialAddSelect · MaterialQuickCreate", category: "pick",
    source: { path: "components/material-quick-create", names: ["MaterialAddSelect", "MaterialQuickCreate", "useCanCreateMaterial"] },
    what: "ช่องค้นหาวัสดุตีราคา (design_price_items) ค้นไม่เจอ → \"＋ เพิ่มวัสดุใหม่\" เลือกชนิดวัสดุ + เตือนชื่อคล้ายที่มีอยู่แล้ว → สร้างแล้วเลือกให้ทันที · ไม่มีสิทธิ์ products.create = ค้นเลือกอย่างเดียว · ส่วนไม่ใช่หน้าจอ lib/material-quick-create (similarMaterials · createDesignMaterial ใบงานออกแบบใช้ด้วย)",
    when: "แผงชิ้นในสตูดิโอแพทเทิร์น (กระดาน + แกะจากรูป · วัสดุที่ AI อ่านได้แต่ไม่มีในรายการ) · ที่ไหนก็ได้ที่ต้องเลือกวัสดุตีราคาแล้วอยากเพิ่มตัวใหม่ทันที",
    notWhen: "วัตถุดิบ/SKU จริงที่ต้องผ่านอนุมัติ → MaterialRequestForm · เลือกวัตถุดิบในสูตร BOM (มีรูป/สต๊อก) → MaterialPicker",
    doc: "material-quick-create.md",
  },
  {
    key: "parts-cart-modal", label: "เพิ่มอะไหล่ · ซิป · เทป แบบตะกร้า (+ ชุดอะไหล่)", code: "PartsCartModal · lib/parts-cart", category: "pick",
    source: { path: "components/parts-cart-modal", names: ["PartsCartModal"] },
    what: "ป๊อปเลือกวัสดุตีราคาเฉพาะกลุ่มนับชิ้น/ตามยาว (อะไหล่ ซิป เทป) แบบช้อปปิ้ง: ตาราง ↔ การ์ด (จำต่อคน) · ใส่ตะกร้า ปรับจำนวน/ยาวต่อเส้น → ลงตารางทีเดียว (ตัวเดียวกันบวกเข้าบรรทัดเดิม) · ชุด (design_price_items.set_items) ถามหัวซิป/หางซิปให้ติ๊ก · เพิ่ม (MaterialQuickCreate) / แก้ชื่อ-ราคา-หน่วย / เอาออก (ปิดใช้งาน) / ตั้งชุด ผ่าน API กลาง master-v2",
    when: "ตารางตีราคาที่อยากลงอะไหล่หลายตัวพร้อมกัน — ใบงานออกแบบ (ปุ่ม เพิ่มอะไหล่)",
    notWhen: "วัสดุชิ้นตัด/ผ้าที่มีขนาด → ช่องวัสดุในตาราง / MaterialAddSelect · ซิปตามขอบบนกระดานแพทเทิร์น → TrimsModal",
    doc: "parts-cart.md",
  },
  {
    key: "mo-picker", label: "เลือกใบสั่งผลิต", code: "MoMultiPickerModal", category: "pick",
    source: { path: "components/mo-picker" },
    what: "ป๊อปเลือกใบสั่งผลิตได้หลายใบ ค้นหา/กรองได้",
  },
  {
    key: "mo-create", label: "ป๊อปสร้างใบสั่งผลิตใหม่", code: "MoCreateModal", category: "popup",
    source: { path: "components/mo-create" },
    what: "ป๊อปเดียวสำหรับสร้างใบสั่งผลิต (ยิง POST /api/mo — เลขใบ/กางสูตร/audit ฝั่งเซิร์ฟเวอร์) · ใบเดียว หรือ เพิ่มหลายรายการ/วางจาก Excel · ส่วนใบสั่งขาย (MoSoLinkSection — งานลูกค้าต้องผูก) · ด้านบนมีรายการใบสั่งขายที่ยังเปิดผลิตไม่ครบ (GET /api/mo/so-pending) ติ๊กหยิบมาสร้างได้ ติ๊กหลายรายการ = สร้างหลายใบ แต่ละใบผูกรายการของตัวเอง · รายการไม่มีรหัสเลือกรหัสในแถว = บันทึกกลับเข้าใบสั่งขาย",
    when: "ทุกปุ่ม \"สร้างใบสั่งผลิต\" (หน้าใบสั่งผลิต · บอร์ดจ่ายงาน · หน้าใหม่ที่อยากสร้าง MO)",
    notWhen: "แก้ใบที่มีแล้ว (ฟอร์มใหญ่ในหน้าใบสั่งผลิต) · เปิดใบผลิตทั้งใบสั่งขายทีเดียว → ปุ่มเปิดใบสั่งผลิตในหน้าใบสั่งขาย (open-mo) · เลิกผูกใบผลิตกับใบสั่งขาย → ปุ่ม \"เลิกผูก\" ในหน้าใบสั่งขาย",
  },

  // ───────── รูปและไฟล์ ─────────
  {
    key: "asset-picker", label: "เลือกรูปจากคลังกลาง", code: "AssetPicker", category: "file",
    source: { path: "components/asset-picker" },
    what: "เปิดคลังรูป/วิดีโอแล้วเลือกมาใช้ ไม่ต้องอัปโหลดซ้ำ · มีแท็บ SAMPLE Images (อัลบั้มรูปตัวอย่างประจำแบรนด์ หน้าตาเดียวกับหน้า /tasks/samples) · แท็บ ⏱ ใช้ล่าสุด (30 รูป จำในเครื่อง) · เลือกหลายรูปโชว์เลขลำดับตามที่คลิก",
    when: "ทุกช่องรูปที่น่าจะมีรูปในคลังอยู่แล้ว",
  },
  {
    key: "album-picker", label: "เลือกอัลบั้มคลังไฟล์ (ค้นได้ · โชว์อัลบั้มแม่ · ย่อเกิน 6)", code: "AlbumMultiPicker · AlbumSelect · AlbumTree · lib/album-options", category: "pick",
    source: { path: "components/album-picker" },
    what: "เลือกอัลบั้มหลายอัน (ชิปเฉพาะที่เลือก + ปุ่ม \"+ เพิ่มอัลบั้ม\") หรืออันเดียว (แทน select ยาว) · ค้นชื่อหรือชื่อแม่ได้ ไม่ต้องตรงเป๊ะ · ทุกอันโชว์เส้นทางแม่ (\"SAMPLE … › Product 012 › Version 2\") · ใช้ล่าสุดขึ้นบน · กลุ่ม SAMPLE ยุบตามแบรนด์ กางทีละชั้น · รายการไหนเกิน 6 อัน = โชว์ 6 + \"ดูอีก N\" · AlbumTree = ต้นไม้เดียวกันให้แถบข้างวาดแถวเอง",
    when: "ทุกช่องที่เลือก/กรองอัลบั้มของคลังไฟล์ (รายละเอียดไฟล์ · เพิ่ม Artwork · ลงหลายไฟล์ · สแกน Drive · เพิ่มเข้าอัลบั้ม · อัปโหลด · ตัวกรองใน AssetPicker · แถบซ้ายคลังไฟล์)",
    notWhen: "เลือกอัลบั้ม SAMPLE แบบเห็นรูปปก → SampleAlbumPickerModal · อัลบั้มหน้า Contents → แถบ Contents ของมัน",
    doc: "album-picker.md",
    note: "เจ้าของเลือกจาก widget 2026-11-19 (ชิป + ค้น + เส้นทางแม่ · ข้อเสนอ 1-5) · ข้อมูลแม่/กลุ่มมาจาก /api/assets/collections (parent_id + group) · CollectionMultiSelect ในคลังไฟล์ = ตัวห่อที่สร้างอัลบั้มใหม่",
  },
  {
    key: "image-input", label: "ช่องรูปเดี่ยว", code: "ImageInput", category: "file",
    source: { path: "components/image-input" },
    what: "อัปโหลดรูป 1 รูป + ดูตัวอย่าง + ลบ",
    when: "ช่องรูปเดี่ยว เช่น โลโก้ รูปปก",
  },
  {
    key: "logo-picker", label: "โลโก้แอป/บริการ + ตัวหาโลโก้", code: "AppLogo · LogoPicker", category: "file",
    source: { path: "components/logo-picker", names: ["AppLogo", "LogoPicker"] },
    what: "AppLogo โชว์โลโก้ (ลิงก์รูป หรือรูปที่อัปขึ้นคลัง) ไม่มีก็เป็นตัวอักษรแรกบนพื้นสี · LogoPicker เดาเว็บจากลิงก์/ชื่อ แล้วให้เลือกไอคอนจากเว็บ วาง/ลาก/อัปรูปเอง หรือค้น Google รูป",
    when: "อะไรที่มีชื่อ + เว็บ แล้วอยากมีโลโก้ เช่น แอป subscription ร้านค้า แพลตฟอร์ม",
    notWhen: "รูปสินค้า/รูปงานหลายรูป ให้ใช้ ImageAttach หรือ ImageManager",
  },
  {
    key: "image-attach", label: "แนบรูปหลายรูป", code: "ImageAttach", category: "file",
    source: { path: "components/image-attach" },
    what: "แนบรูปหลายรูป: ลากวาง วาง (Ctrl+V) หรือเลือกไฟล์ ย่อขนาดให้ · มือถือมีปุ่มถ่ายรูป (PhotoCapture)",
    when: "คอมเมนต์ งาน โน้ต ที่แนบรูปได้หลายรูป",
  },
  {
    key: "photo-capture", label: "ถ่ายรูปจากมือถือ/กล้อง", code: "PhotoCapture", category: "file",
    source: { path: "components/photo-capture" },
    what: "มือถือ: ปุ่ม ถ่ายรูป (เปิดกล้องตรง) + เลือกจากคลัง + กล้องในเว็บมีเส้นกริด · ถาดตรวจรูปก่อนใส่ (ถ่ายต่อเนื่อง · ครอป/หมุน · ดัดรูปเอียงให้ตรง 4 มุม · ลบแล้วย้อนกลับได้) · ย่อรูป ≤2400px ก่อนส่ง · PC มีเว็บแคม = ลิงก์เล็ก",
    when: "ช่องอัปรูปที่คนอาจกดจากโทรศัพท์ — เสียบแล้วในช่องอัปของกลาง (ImageAttach · ImageInput · FileInput · FileMultiInput · SlipPicker · SellerBillIntake ฯลฯ) + หน้างาน (โอนเงินจีน ใบจดผลงาน แจ้งปัญหา แพ็ค ฯลฯ) · หน้าเดิมที่มีปุ่มเลือกรูปเอง → วาง CameraButton ข้างปุ่ม",
    notWhen: "ไม่อัปโหลดเอง — ผู้เรียกอัปตามทางเดิม · ไฟล์งานใหญ่ (AI/PSD) → DriveUploadBox · เลือกรูปที่มีในคลัง R2 → AssetPicker",
    doc: "photo-capture.md",
  },
  {
    key: "image-manager", label: "จัดการรูปสินค้า", code: "ImageManager", category: "file",
    source: { path: "components/image-manager" },
    what: "อัปโหลด จัดเรียง ตั้งรูปหลัก ซูมเมื่อชี้",
    legacyKey: "image_manager",
  },
  {
    key: "upload-progress", label: "แถบกำลังอัปโหลด", code: "UploadProgress", category: "file",
    source: { path: "components/upload-progress" },
    what: "บอกผู้ใช้ว่าไฟล์กำลังส่ง กี่เปอร์เซ็นต์",
    when: "ทุกจุดที่อัปโหลดไฟล์",
    doc: "upload-progress.md",
  },
  {
    key: "duplicate-upload", label: "ตรวจรูปซ้ำก่อนอัปโหลด", code: "DuplicateUpload", category: "file",
    source: { path: "components/duplicate-upload" },
    what: "ถามว่าจะใช้รูปเดิมในคลังหรืออัปโหลดใหม่ เมื่อรูปซ้ำกับที่มีอยู่",
    when: "อัปโหลดเข้าคลังรูป",
    doc: "duplicate-upload.md",
  },
  {
    key: "drive-upload-box", label: "กล่องอัปไฟล์ขึ้น Google Drive", code: "DriveUploadBox", category: "file",
    source: { path: "components/drive-upload-box" },
    what: "ลากวาง / กดแนบไฟล์งาน (AI · PSD · PDF ฯลฯ ใหญ่ได้ถึง 5GB) ขึ้นโฟลเดอร์ Drive ของรายการ + โชว์ไฟล์ในโฟลเดอร์ · ส่งทีละชิ้นผ่าน lib/drive-chunk-upload",
    when: "รายการที่มีโฟลเดอร์ Drive ของตัวเอง (เช่น ใบงานออกแบบ) — API ของโมดูลคุมเองว่าโฟลเดอร์อยู่ไหน ใครอัปได้ และลงประวัติ",
    notWhen: "รูปสินค้า/รูปเล็กที่ต้องโชว์ในระบบ → ImageManager / ไฟล์แนบ R2 (FileInput, Attachments) · ไฟล์ปริ้น → Drive ตามกฎที่เก็บไฟล์",
    doc: "drive-upload-box.md",
    note: "ใบสั่งแพทเทิร์น / คลัง Contents ยังมีปุ่มอัป Drive ของตัวเอง — ย้ายมาใช้ตัวนี้ได้ภายหลัง · prop list / actions = รายการแบบของโมดูล + ปุ่มเสริม (ไฟล์แนบสินค้าใช้)",
  },
  {
    key: "drive-folder-files", label: "รายการไฟล์ในโฟลเดอร์ Drive", code: "DriveFolderFiles", category: "file",
    source: { path: "components/drive-folder-files" },
    what: "โชว์ว่าในโฟลเดอร์ Google Drive มีไฟล์อะไร + ปุ่มเปิดใน Drive (โหลดแบบไม่บล็อกป๊อปอัป) · เสริม thumbs = ภาพตัวอย่างที่ Drive ทำไว้ (รูป/PDF/PSD/AI) · badge · onRemove · files ส่งมาเอง · ส่งออก DriveThumb + driveThumbUrl",
    when: "มีลิงก์โฟลเดอร์ Drive แล้วอยากให้เห็นไฟล์ข้างใน — อยากอัปด้วยใช้ DriveUploadBox ซึ่งรวมตัวนี้ไว้แล้ว (prop list = ส่งรายการแบบมีภาพตัวอย่างเข้าไปแทน)",
    doc: "drive-upload-box.md",
  },
  {
    key: "drive-file-picker", label: "เลือกไฟล์จากโฟลเดอร์กลางใน Drive", code: "DriveFilePicker", category: "file",
    source: { path: "components/drive-file-picker" },
    what: "หน้าต่างเดินดูโฟลเดอร์กลางของแบรนด์ (<โฟลเดอร์แบรนด์>/ไฟล์กลาง) · เข้า-ออกโฟลเดอร์ย่อย · ค้นชื่อ · สลับแบรนด์ · ภาพตัวอย่าง + ดูรูปใหญ่ · ติ๊กหลายไฟล์ → onPick(files, brandId)",
    when: "ให้คนเลือกไฟล์ที่มีอยู่แล้วใน Drive (โลโก้ ป้าย แพ็กเกจ) มาแนบกับรายการ — ผู้เรียกทำต่อเอง เช่น สร้างทางลัด (/api/product-drive/.../link)",
    notWhen: "อัปไฟล์ใหม่จากเครื่อง → DriveUploadBox · เลือกรูปในคลังรูป R2 → AssetPicker · เลือกรูปจากโฟลเดอร์ Drive มานำเข้าคลัง → ฟอร์มนำเข้า (/api/drive/folder-images)",
    doc: "product-drive-files.md",
  },
  {
    key: "product-drive-files", label: "ไฟล์แนบสินค้าใน Google Drive", code: "ProductDriveFiles", category: "file",
    source: { path: "components/product-drive-files" },
    what: "กล่องไฟล์แนบ Parent SKU / SKU ลูก: อัปขึ้นโฟลเดอร์สินค้าใน Drive (ถึง 5GB มีแถบ %) + เลือกจากโฟลเดอร์กลาง (ทางลัด) + ภาพตัวอย่าง + ป้ายที่มา + เอาออกแบบกู้ได้ · ไฟล์เดิม (Supabase) โชว์ต่อด้านล่าง",
    when: "ลิ้นชัก MasterCRUD ของสินค้า — ตั้ง fileAttachments.storage = \"drive\" (Parent/SKU ตั้งไว้แล้ว)",
    notWhen: "เอกสารอื่น (ใบเสนอราคา/SO/พนักงาน) → RecordFilesField · รายการอื่นที่มีโฟลเดอร์ Drive ของตัวเอง → DriveUploadBox + API ของโมดูล",
    doc: "product-drive-files.md",
  },
  {
    key: "file-drop", label: "ลากไฟล์มาวาง", code: "useFileDrop", category: "file",
    source: { path: "components/file-drop" },
    what: "ให้กล่องไหนก็ได้รับไฟล์ที่ลากมาวาง · ชี้เมาส์ที่กล่องแล้ว Ctrl+V วางรูปจากคลิปบอร์ดได้ทุกกล่อง (paste:false = ปิด) · ลากทั้งโฟลเดอร์ได้ทุกกล่อง (folders:false = ปิด)",
    when: "ทุกจุดที่อัปโหลดได้",
    doc: "file-drop.md",
  },
  {
    key: "pdf-merge", label: "รวม PDF หลายไฟล์เป็นไฟล์เดียว", code: "PdfMergeTool · mergePdfBlobs · lib/pdf-merge", category: "file",
    source: { path: "components/pdf-merge" },
    what: "ลาก PDF / รูป มาวาง → การ์ดรูปหน้าแรก ลากสลับลำดับ · โหมดทีละหน้า ลาก/ลบ/หมุนรายหน้า · ตั้งชื่อ → รวมแล้วดาวน์โหลด · ทำในเบราว์เซอร์ ไฟล์ไม่ขึ้นเซิร์ฟเวอร์ · ย้อนกลับได้ทุกการเอาออก/ย้าย/ล้าง · กู้งานค้าง (storageKey) · หน้าอื่นรวมไฟล์ในโค้ดเลยใช้ mergePdfBlobs (lib/pdf-merge-engine)",
    when: "ผู้ใช้อยากรวมไฟล์เอง (/misc/pdf-merge) หรือหน้าที่ทำ PDF หลายใบแล้วอยากได้ไฟล์เดียว (เช่น พิมพ์เอกสารหลายใบ) — ส่ง initialFiles เข้า PdfMergeTool หรือเรียก mergePdfBlobs",
    notWhen: "เก็บไฟล์แนบเข้าระบบ → FileInput / DriveUploadBox · สร้าง PDF จากหน้าเว็บ → แผงพิมพ์ (print-panels) · อ่านข้อความใน PDF ฝั่งเซิร์ฟเวอร์ → lib/parse-pdf-server",
    doc: "pdf-merge.md",
    note: "ไลบรารีวางใน public/vendor (pdf-lib ของ pdfme + pdf.js 5.7.284) — ห้ามลงเป็นแพ็กเกจ npm (build บน Vercel หน่วยความจำหมด)",
  },
  {
    key: "file-input", label: "ช่องไฟล์แนบเดี่ยว", code: "FileInput", category: "file",
    source: { path: "components/file-input" },
    what: "อัปโหลดไฟล์แนบ 1 ไฟล์ (รูปหรือ PDF) เก็บตามกฎที่เก็บไฟล์ · ลากไฟล์มาวาง / Ctrl+V ได้ · multiple = รับหลายไฟล์ (onChange ทีละไฟล์)",
    sameJob: "file-field", primary: true,
  },
  {
    key: "file-multi-input", label: "ช่องไฟล์แนบหลายไฟล์", code: "FileMultiInput", category: "file",
    source: { path: "components/file-multi-input" },
    what: "อัปโหลดไฟล์แนบหลายไฟล์ (รูปและ PDF) · ลากไฟล์มาวาง / Ctrl+V ได้ (pasteFromPage = ทั้งหน้า) · มีแถบความคืบหน้า · ส่ง category = เก็บตามกฎที่เก็บไฟล์ (เช่น Supabase ส่วนตัว) · ไม่ส่ง = R2 ทางเดิม",
    sameJob: "file-field",
  },
  {
    key: "record-files", label: "ไฟล์แนบของเอกสาร / รายการ", code: "RecordFilesField", category: "file",
    source: { path: "components/record-files" },
    what: "แนบไฟล์กับรายการใดก็ได้ เก็บในที่เก็บส่วนตัว (Supabase) ลิงก์เปิดไฟล์หมดอายุเอง · สิทธิ์ตามชนิดรายการ (RECORD_FILE_PERMS)",
    when: "ไฟล์แนบเอกสาร (ใบเสนอราคา ใบสั่งขาย เอกสารพนักงาน สลิป) และช่องไฟล์แนบในลิ้นชัก MasterCRUD (สินค้า Parent/SKU ย้ายไป ProductDriveFiles แล้ว — ตัวนี้โชว์ไฟล์เดิมด้วย noUpload + hideWhenEmpty)",
    notWhen: "รูปสินค้า (แกลเลอรี/รูปปก) ใช้ตัวจัดการรูปที่เก็บ R2 · ชนิดรายการใหม่ที่ไม่ใช่สินค้า ต้องเพิ่มสิทธิ์ใน RECORD_FILE_PERMS (lib/record-files.ts)",
  },
  {
    key: "image-markup", label: "วาดบนรูปแบบกระดาน", code: "ImageMarkup", category: "file",
    source: { path: "components/image-markup" },
    what: "วาดสี่เหลี่ยม วงกลม ลูกศร ข้อความ บนรูป",
    doc: "image-markup.md", sameJob: "markup", primary: true,
  },
  {
    key: "image-markup-editor", label: "ตัววาดบนรูป (ในตัวจัดการรูป)", code: "ImageMarkupEditor", category: "file",
    source: { path: "components/image-markup-editor" },
    what: "ปากกา ลูกศร ข้อความ กล่อง บนรูปสินค้า",
    sameJob: "markup",
  },
  {
    key: "image-regions", label: "จุดบนรูป", code: "ImageRegions", category: "file",
    source: { path: "components/image-regions" },
    what: "กรอบสี่เหลี่ยมบนรูปที่ผูกกับข้อมูล",
    doc: "image-regions.md", sameJob: "image-box", primary: true,
  },
  {
    key: "image-area-marker", label: "กรอบบนรูป", code: "ImageAreaMarker", category: "file",
    source: { path: "components/image-area-marker" },
    what: "วาด/ย้าย/ปรับขนาดกรอบบนรูป (ค่าเป็น % ของรูป) มีทรงวงรี/หัวใจ",
    sameJob: "image-box",
  },

  // ───────── นำเข้า-ส่งออก ─────────
  {
    key: "import-wizard", label: "ตัวช่วยนำเข้าไฟล์", code: "ImportWizard", category: "data",
    source: { path: "components/import-wizard" },
    what: "อ่านไฟล์ Excel/CSV → จับคู่คอลัมน์ → ตรวจ → นำเข้า",
  },
  {
    key: "line-import", label: "ลงรายการสินค้าแบบตาราง Excel", code: "LineImport", category: "data",
    source: { path: "components/line-import" },
    what: "โหลดแม่แบบ → กรอกใน Excel → โยนกลับมาเป็นบรรทัดเอกสาร",
    notWhen: "นำเข้าข้อมูลหลักทั้งตาราง (สินค้า ลูกค้า) ให้ใช้ตัวช่วยนำเข้าไฟล์ — ตัวนี้สำหรับบรรทัดในเอกสารเท่านั้น",
  },
  {
    key: "shortcut-key", label: "อ่านปุ่มคีย์ลัด (ทุกภาษาแป้นพิมพ์)", code: "lib/shortcut-key", category: "system",
    source: { path: "lib/shortcut-key" },
    what: "shortcutKey(e) บอกปุ่มที่กด ไม่ขึ้นกับภาษาแป้นพิมพ์ (ตัวอังกฤษ = เชื่อ e.key · ตัวไทย = ดูตำแหน่งปุ่ม e.code) → Ctrl+Z / Ctrl+P / ปุ่ม 1-9 / \"/\" ใช้ได้แม้เปิดแป้นพิมพ์ไทย (e.key จะได้ ผ / ย / ๅ / ฝ)",
    when: "ทุกคีย์ลัดตัวอักษร/ตัวเลข/เครื่องหมาย (มี Ctrl/⌘ หรือไม่มีก็ได้)",
    notWhen: "รับข้อความที่พิมพ์ (ต้องการตัวอักษรตามภาษา) → ใช้ e.key ตามเดิม",
  },
  {
    key: "erp-theme", label: "ธีมกลาง ERP (ตัวแปรสีหลัก/สีเน้น)", code: "lib/erp-theme", category: "system",
    source: { path: "lib/erp-theme" },
    what: "คลาส blue-* / brand-* (สีหลัก) และ violet-* (สีเน้นรอง) ทั้งระบบอ่านสีจากตัวแปร --tm-* แทนสีตายตัว · ค่าเริ่ม = ส้ม/ม่วงเดิม · themeVars() ได้ชุดตัวแปรไปวางที่กล่องครอบเพื่อเปลี่ยนสีทั้งก้อน · scaleFromHex() สร้าง 11 เฉดจากสีเดียว · status-blue-* / status-violet-* = ชุดล็อกสีสถานะ (ไม่ตามธีม)",
    when: "หน้าใหม่ใช้คลาส blue-*/violet-* ตามปกติ = ตามธีมเอง · ทำธีมของโมดูล/ผู้ใช้ (เฟสถัดไป) ให้ใช้ themeVars() · สีสถานะ/ป้ายที่มีความหมายตายตัว ใช้ status-blue-*/status-violet-*",
    notWhen: "ป้ายสถานะ (ร่าง/อนุมัติ/ไม่อนุมัติ) — ห้ามใช้ blue-*/violet-* เพราะจะเปลี่ยนตามธีม · เว็บร้าน (storefront) มีระบบธีมของตัวเอง (lib/website-theme)",
  },
  {
    key: "erp-theme-config", label: "ค่าตั้งธีม 9 หมวด + ธีมสำเร็จรูป + เช็กสีอ่านยาก", code: "lib/erp-theme-config", category: "system",
    source: { path: "lib/erp-theme-config" },
    what: "normalizeThemeConfig (กรองค่าธีมให้ครบ/อยู่ในช่วง) · THEME_PRESETS 8 ชุด · themeIssues + autoFixContrast (เตือน/แก้สีอ่านยาก) · paletteFromPixels (ดูดสีจากรูป) · mobileLiteConfig (โหมดเบามือถือ) · themeCssVars (ตัวแปร CSS ทั้งชุด) · ข้อมูลอยู่ตาราง erp_themes / erp_theme_versions ผ่าน /api/themes",
    when: "ทุกที่ที่อ่าน/เขียน/วาดธีมกลาง ERP (คลังธีม · ธีมของโมดูลเฟส 3 · ค่าส่วนตัวเฟส 5)",
    notWhen: "ธีมแบรนด์บนแดชบอร์ดออกแบบ (lib/brand-theme — จะรวมเข้ามาเฟส 6) · ธีมเว็บร้าน (lib/website-theme)",
  },
  {
    key: "erp-theme-applier", label: "ทาธีมของแอปที่เปิดอยู่ (เชลล์/แอปเดี่ยว)", code: "ThemeApplier · useActiveThemes · lib/erp-theme-assign", category: "system",
    source: { path: "components/erp-theme/theme-applier", names: ["ThemeApplier"] },
    what: "อ่านธีมที่เผยแพร่ของแอป (→ ธีมบริษัท → ไม่มี = หน้าตาเดิม) จาก /api/themes/active แล้วทาตัวแปร --tm-* + attr data-tm-* ที่ <html> (ป๊อปอัปได้สีเดียวกัน · เอฟเฟกต์จาก lib/erp-theme-effects + CSS globals) + โหลดฟอนต์ + ชั้นพื้นหลัง/มาสคอต (ThemeBanner = แบนเนอร์ใน <main>) · จำใน localStorage กันกระพริบ · แถบบนแอปเดี่ยวใช้ themeTopbarStyle เว้นแอปที่ตั้งสีแถบบนเอง (hasOwnHeader) · ตั้งที่ /admin/themes?tab=apps (ตาราง erp_theme_assignments)",
    when: "เชลล์ใหม่/แอปเดี่ยวแบบใหม่ที่ต้องตามธีม → วาง <ThemeApplier appKey=…/> · หลังบันทึกธีมของแอปเรียก refreshActiveThemes()",
    notWhen: "พรีวิวในตัวแก้ธีม (ใช้ ThemePreviewBridge — ตัวทาธีมจะไม่ทาทับเมื่อมี data-theme-preview) · เว็บร้าน",
  },
  {
    key: "erp-theme-preview", label: "พรีวิวธีม + แผงปรับธีม 9 หมวด", code: "ThemePreview · ThemeEditorPanel", category: "feature",
    source: { path: "components/erp-theme/preview", names: ["ThemePreview"] },
    what: "หน้าตัวอย่าง ERP ที่วาดตามค่าธีมครบ (แถบบน เมนูข้าง แบนเนอร์ การ์ดตัวเลข ตาราง ช่องกรอก ป๊อปอัป มาสคอต แอนิเมชัน) PC/มือถือ/มืด · compact = การ์ดย่อ · แผงปรับ components/erp-theme/editor-panel · พรีวิวหน้าจริงผ่าน iframe + ThemePreviewBridge (app/layout)",
    when: "หน้าที่ต้องให้ผู้ใช้เห็นหน้าตาธีมก่อนเลือก (คลังธีม · เลือกธีมให้โมดูล · ตั้งค่าส่วนตัว)",
    notWhen: "พรีวิวธีมเว็บร้าน (ใช้พรีวิว iframe ของเว็บร้าน) · ธีมแบรนด์ (BrandThemeBuilder)",
  },
  {
    key: "step-history", label: "ปุ่มย้อน (Back / ปุ่มเมาส์) ย้อนทีละก้าวในหน้า", code: "useStepHistory", category: "system",
    source: { path: "lib/use-step-history" },
    what: "หน้าที่เดินลึกด้วย state (แฟ้ม → อัลบั้ม → อัลบั้มย่อย · กลุ่ม → แท็ก · แบรนด์ → รุ่น) กด Back ของเบราว์เซอร์/ปุ่มย้อนของเมาส์/มือถือ แล้วถอยทีละชั้น ไม่เด้งออกหน้า · push = จดก้าว · replace = จดหน้าตาตอนนี้ · readStep/patchStep = อ่าน/แก้ก้าวปัจจุบัน (refresh แล้วอยู่ที่เดิม) · ข้ามการปิดลิ้นชักของกลางให้เอง",
    when: "ทุกหน้าที่มีการเดินเข้าออกหลายชั้นในหน้าเดียว (ใช้ที่ SAMPLE Images · เลือกดูสินค้าตามแท็ก · อัลบั้มแบรนด์)",
    notWhen: "ป๊อป/จอซ้อนชั้นเดียว (เปิด-ปิด) → lib/use-back-close · ลิ้นชัก → lib/drawer-history · เปลี่ยนหน้า (URL) → router ปกติ",
  },
  {
    key: "shipping-provider", label: "ตัวเรียกขนส่ง (ดูราคา/จอง/ใบปะหน้า/สถานะ)", code: "lib/shipping/provider", category: "system",
    source: { path: "lib/shipping/provider", names: ["shippingProvider"] },
    what: "ชั้นกลางเรียกตัวกลางขนส่ง: ดูราคาทุกเจ้า · จอง+ยืนยัน · ใบปะหน้า (A4/A5/A6/สติกเกอร์ 4×6) · ถามสถานะ · ยกเลิก · ตอนนี้เสียบ SHIPPOP · โหมดจำลอง/ทดลอง/จริงตามกุญแจ",
    when: "ทุกที่ที่ต้องจองขนส่งเองให้ออเดอร์ช่องทางของร้าน (แชต/เว็บ/โทร/LINE SHOPPING) · ค่าส่งจริงบันทึกผ่าน lib/shipping/cost · สถานะเข้าออเดอร์ผ่าน lib/shipping/order-status-db",
    notWhen: "ออเดอร์ Shopee/Lazada/TikTok — ต้องใช้ขนส่งของแพลตฟอร์ม (canShipViaShippop กันไว้) · เว็บร้านยังเรียก lib/shippop ตรง (ย้ายมาได้)",
  },
  {
    key: "order-pull-status", label: "สถานะการดึงออเดอร์ทุกร้าน (จดผลรอบ · เตือนกระดิ่ง)", code: "lib/order-pull-server · lib/order-pull-health", category: "system",
    source: { path: "lib/order-pull-server", names: ["recordShopPull", "loadPullBoard", "sendPullAlerts"] },
    what: "จดผลรอบดึงออเดอร์ของแต่ละร้าน (ui_config order_pull:*) · ตัดสินสถานะ ปกติ/ต้องดู/หยุดดึง/มีปัญหา/กุญแจใกล้หมด/ยังไม่ต่อ · เด้งกระดิ่ง orders.pull_problem วันละครั้งต่อเรื่อง · หน้า /master/platform-orders/pull-status (ภาพเคลื่อนไหว + ดึงตอนนี้)",
    when: "เพิ่มตัวดึงออเดอร์ร้านใหม่ → เรียก pullShop (app/api/platform-orders/pull-runner) หรือ recordShopPull หลังดึงทุกรอบ แล้วเพิ่มร้านใน loadPullInputs",
    notWhen: "งานตั้งเวลาทั่วไปที่ไม่ใช่การดึงออเดอร์ → recordWorkerRun (ออฟฟิศทีม AI)",
  },
  {
    key: "export", label: "ส่งออก CSV / Excel", code: "lib/export", category: "data",
    source: { path: "lib/export" },
    what: "ส่งออกแถวที่เห็น / ที่เลือก / ทั้งหมดที่กรองไว้ เป็น CSV หรือ Excel",
    when: "ทุกปุ่มส่งออกของตาราง",
    notWhen: "ไฟล์รายละเอียดสินค้าหลายรุ่น (ไทย/อังกฤษ · แยกแถวตามสี · ฝังรูป) ให้ใช้หน้า /master/parent-skus/export (lib/spec-export)",
    legacyKey: "export_service",
  },
  {
    key: "paste-table", label: "วางตารางจาก Excel", code: "lib/paste-table", category: "data",
    source: { path: "lib/paste-table" },
    what: "อ่านข้อความที่คัดลอกจาก Excel/Sheets มาเป็นแถว",
    doc: "paste-table.md",
  },

  // ───────── สถานะหน้าจอ ─────────
  {
    key: "state-views", label: "กำลังโหลด / ว่าง / โหลดพลาด", code: "LoadingState · EmptyState · ErrorState", category: "state",
    source: { path: "components/state-views" },
    what: "กล่องมาตรฐานตอนโหลด ไม่มีข้อมูล หรือโหลดพลาด พร้อมปุ่มลองใหม่ · ตอนโหลดเป็นโครงสีเทา (skeleton) · กล่องว่างมีปุ่มล้างตัวกรอง/สร้างใหม่ (onClearFilters/onCreate)",
    when: "ทุกหน้าและทุกแผงที่โหลดข้อมูล",
    notWhen: "ห้ามเขียนข้อความกำลังโหลดเอง",
    doc: "state-views.md",
  },
  {
    key: "spinner", label: "วงหมุนกำลังทำงาน", code: "Spinner · LoadingOverlay", category: "state",
    source: { path: "components/spinner" },
    what: "วงหมุนในปุ่ม หรือคลุมกล่องระหว่างบันทึก/ประมวลผล",
    when: "ระหว่างกดบันทึก ส่ง ประมวลผล",
    notWhen: "ตอนโหลดหน้า ให้ใช้ LoadingState",
  },
  {
    key: "toast", label: "แจ้งผลลอยมุมจอ", code: "Toast", category: "state",
    source: { path: "components/toast" },
    what: "ข้อความ สำเร็จ / ผิดพลาด / เตือน ลอยมุมขวาบน · ผิดพลาดมีปุ่มคัดลอกรายละเอียด · toast.undo() ปุ่มย้อนกลับนับ 5 วินาที หลังลบ/ย้าย",
    when: "หลังบันทึก ลบ ส่ง ทุกครั้ง",
  },

  // ───────── พิมพ์ ─────────
  {
    key: "fabric-cut-sheet", label: "ใบวิธีตัดผ้า", code: "lib/fabric-cut-sheet", category: "print",
    source: { path: "lib/fabric-cut-sheet" },
    what: "หาแบบตัดที่วางซ้ำได้ (ได้ N ใบ × M รอบ + แบบเศษ) แล้วพิมพ์ใบวิธีตัด: เลขชิ้นในผังตรงกับตารางชิ้น · ม้วนยาวตัดช่วงละ 90 ซม. มี “ต่อ” · ตรา คาดการณ์/พิสูจน์แล้ว · ช่องกรอกผ้าที่ใช้จริง",
    when: "ทุกปุ่มพิมพ์วิธีตัด/ใบตัดผ้าที่มีชิ้นตัด (คิดผ้าก่อนซื้อ · ป๊อปคำนวณผ้าในใบออกแบบ) · เลขชิ้นบนจอ = pieceNumbers ส่งให้ FabricLayoutPreview",
    notWhen: "ใบตัดผ้าที่รวมหลายใบสั่งผลิต (แบ่งผ้าคืนต่อใบ) ใช้ lib/fabric-plan-print · คิดตัวเลขซื้อผ้าใช้ lib/fabric-buy",
    doc: "fabric-buy.md",
  },
  {
    key: "print-panels", label: "พิมพ์เอกสาร / พิมพ์ตาราง", code: "DocPrintPanel · ListPrintPanel · usePrintLog", category: "print",
    source: { path: "components/report" },
    what: "แผงตั้งค่าพิมพ์ เลือกคอลัมน์ บันทึกประวัติการพิมพ์ บันทึกเป็นรูป · ปุ่ม ⤓ พอดี 1 หน้า (ListPrintPanel ส่ง pageGroups · fitListToOnePage) · แผงพิมพ์เอกสารจำค่าที่ใช้ล่าสุดต่อคน · ปุ่ม 📤 ส่ง PDF ในแถบพิมพ์ (SendPdfButton · ทำ PDF ในเครื่อง → Drive → LINE ลิงก์ / อีเมลแนบ · /api/print-send · lib/print-send)",
    when: "ทุกหน้าพิมพ์เอกสารและพิมพ์รายการ",
    doc: "list-print.md",
  },
  {
    key: "doc-print-settings", label: "แถบตั้งค่าการพิมพ์เอกสาร", code: "DocPrintSettings", category: "print",
    source: { path: "components/doc-print-settings" },
    what: "เลือกแม่แบบ + ติ๊กคอลัมน์ที่จะโชว์ บนหน้าพิมพ์เอกสาร + สวิตช์พิมพ์ต้นฉบับ+สำเนา (CopiesSwitch · withCopies · ช่อง {{copy_label}} ในแม่แบบ · หลายใบเรียงทีละใบ) · ตัวเลือกเฉพาะเอกสาร (DOC_OPTIONS — ติ๊ก/ปุ่มเลือก · แผงวาดให้เอง เก็บใน prefs.options) · แถวหัวกลุ่มในตาราง ({ __group, __sum })",
  },
  {
    key: "print-presets", label: "เมนูแบบที่บันทึกของหน้าพิมพ์", code: "PrintPresetMenu", category: "print",
    source: { path: "components/print-presets" },
    what: "บันทึกหน้าตาการพิมพ์เป็นแบบหลายชุด ตั้งชื่อได้ (ของทีม/ของฉัน) · เลือกโหลด · บันทึกทับ · เปลี่ยนชื่อ · ลบ (ย้อนกลับได้) · ตั้ง/ใช้ค่าเริ่มต้น · เก็บในระบบมุมมองที่บันทึก (/api/saved-views · table_id print:<เอกสาร>) ไม่มีที่เก็บแยก",
    when: "หน้าพิมพ์ที่ผู้ใช้ปรับหน้าตาได้แล้วอยากเก็บไว้ใช้ซ้ำ (ใช้แล้ว: ใบเสนอราคา) — ส่งเป็น leading ของ ReportLayoutControls",
    notWhen: "มุมมองตาราง (DataTable มีของตัวเอง) · แม่แบบในฐานข้อมูล ใช้ตัวออกแบบแม่แบบ",
    doc: "print-part-style.md",
  },
  {
    key: "quotation-form-modal", label: "ป๊อปฟอร์มใบเสนอราคา", code: "QuotationFormModal", category: "popup",
    source: { path: "components/quotation-form-modal" },
    what: "ฟอร์มสร้าง/แก้ใบเสนอราคา (ลูกค้า เซลส์ วันที่ รายการ VAT ส่วนลด หมายเหตุ ยอดรวม) · ถามก่อนปิดเมื่อยังไม่บันทึก · บันทึกผ่าน /api/quotations",
    when: "ทุกที่ที่ต้องสร้าง/แก้ใบเสนอราคา (ใช้แล้ว: หน้าใบเสนอราคา · หน้าพิมพ์ใบเสนอราคา)",
    notWhen: "ส่งจากใบงานออกแบบเข้าใบเสนอราคา ใช้ตะกร้าในใบงาน",
  },
  {
    key: "print-blocks", label: "จัดหน้าเอกสารพิมพ์เอง (ช่องในการ์ด + กล่องบนหน้า)", code: "usePrintBlocksEditor · lib/print-blocks", category: "print",
    source: { path: "components/print-blocks-editor" },
    what: "เพิ่มช่องในการ์ดจากข้อมูล SKU ที่ผูก (วัสดุ ซิป สาย ซับใน อะไหล่ โลโก้ สี คำอธิบาย MOQ บาร์โค้ด) / บรรทัดเอกสาร / ข้อความเอง · ลากเรียง แก้ป้าย ลบ (ย้อนกลับได้) · ค่าว่างไม่วาดแถว · กล่องบนหน้า ข้อความ/รูป/เส้นคั่น วาง 4 จุด (กด + เพิ่มกล่องตรงนี้ ในใบ) · ทุกช่อง/กล่องกดแก้หน้าตาด้วย print-part-style · เก็บใน ReportLayoutSettings (เข้าแบบที่บันทึกด้วย)",
    when: "เอกสารพิมพ์แบบการ์ด/สร้างจากโค้ดที่อยากให้ผู้ใช้จัดเนื้อหาเอง (ใช้แล้ว: ใบเสนอราคาแบบการ์ด)",
    notWhen: "แม่แบบในฐานข้อมูล (แบบตาราง) ใช้ตัวออกแบบแม่แบบ · ลากวางอิสระ (ไม่รองรับ — ใบหลายหน้าเพี้ยน)",
    doc: "print-part-style.md",
  },
  {
    key: "print-part-style", label: "กดกล่องในใบพิมพ์แล้วแก้หน้าตา", code: "usePrintPartEditor · lib/print-part-style", category: "print",
    source: { path: "components/print-part-style" },
    what: "กดกล่องในพรีวิวเอกสารพิมพ์ (data-pp) → แผงแก้ ซ่อน (ทุกการ์ด/เฉพาะการ์ด) · ขนาด · ฟอนต์ · ตัวหนา · ตำแหน่ง · สีตัวอักษร/พื้น · รูปสูง/พอดี-เต็มกรอบ · ย้อนกลับ Ctrl+Z · คัดลอก/วางสไตล์ · คืนค่าทีละกล่อง/ทั้งใบ · กรอบเลือกโชว์แค่บนจอ ไม่ติดตอนพิมพ์",
    when: "เอกสารพิมพ์ที่สร้างจากโค้ดแล้วอยากให้ผู้ใช้ปรับหน้าตาเองทีละส่วน (ใช้แล้ว: ใบเสนอราคาแบบการ์ดรูปใหญ่) — เอกสารประกาศกล่องด้วย data-pp + ทะเบียนกล่อง (PrintPartDef)",
    notWhen: "แม่แบบในฐานข้อมูล (แบบตาราง) ให้ใช้ตัวออกแบบแม่แบบ · หน้าเว็บร้าน ให้ใช้ PartStyleEditor (website-part-style-editor)",
    doc: "print-part-style.md",
  },
  {
    key: "print-setup-dialog", label: "หน้าปรับก่อนพิมพ์", code: "PrintSetupDialog", category: "print",
    source: { path: "components/print-setup-dialog" },
    what: "กดพิมพ์แล้วเปิดหน้าปรับก่อน ปรับแล้วเห็นผลทันที",
  },
  {
    key: "pattern-sheet", label: "แพทเทิร์นจากขนาดชิ้น (พิมพ์ 1:1 / DXF) + วาดชิ้นวัสดุ", code: "PatternPiecesSvg · PatternPrintView · ShapeEditor · lib/pattern-sheet · lib/pattern-shape", category: "print",
    source: { path: "components/pattern-sheet" },
    what: "เอากว้าง×ยาว×จำนวนชิ้นจากตาราง มาวาดเป็นชิ้นแพทเทิร์นขนาดจริง พิมพ์แบ่งหน้า A4 แล้วต่อกัน (มีกรอบสอบเทียบ 100 × 100 มม.) หรือดาวน์โหลด DXF/SVG ส่งเครื่องตัด · ShapeEditor = หน้าต่างวาดชิ้นขนาดจริง (สี่เหลี่ยม วงกลม ปากกา วางจาก Illustrator ไม้บรรทัด ดูดเข้า พิมพ์ขนาด) → บรรทัดตีราคา + ชิ้นแพทเทิร์นรูปทรงจริง · เผื่อเย็บตั้งรายขอบได้ (เช่น ขอบปากพับ 3 ซม.) · PatternPrintView = ตัวหน้าพิมพ์กลาง (ภาพรวม + วางบนผ้า + A4 ขนาดจริง + DXF/SVG) ส่งบรรทัดเข้าไปก็ได้ทั้งหน้า",
    when: "งานที่มีขนาดชิ้นตัด เช่น ตีราคาใบงานออกแบบ (/print/design-sheet/<id>/pattern) และแอปสตูดิโอแพทเทิร์น (/print/pattern-project/<id>) — หน้าใหม่ที่ต้องพิมพ์แพทเทิร์นให้ส่งบรรทัดเข้า PatternPrintView",
    notWhen: "คำนวณผ้าที่ต้องใช้ ให้ใช้เครื่องคิดเลขผ้า (lib/fabric-calc + FabricLayoutPreview) · วาดอิสระ/แปะรูป/วางการ์ด (ไม่มีขนาดจริง) ให้ใช้กระดานวาด (CanvasSketch) · วาดบนรูปสินค้า ให้ใช้ ImageMarkup",
    doc: "pattern-sheet.md",
  },
  {
    key: "pattern-studio", label: "สตูดิโอแพทเทิร์น (กระดานวาด + ภาพ 3D + แม่แบบทรงกระเป๋า)", code: "PatternStudio · BagTemplateWizard · SewView · AssemblyView · SendCostingModal · PreflightModal · LearnCard · LessonCatalog · ToolDemo · BagPartsModal · ColorwayBar · ComparePanel · GradingPanel · NestPanel · CoachPanel · HandlesPanel · lib/pattern-lessons · lib/pattern-tools · lib/bag-templates · lib/pattern-seams · lib/pattern-assembly · lib/pattern-costing · lib/pattern-check · lib/pattern-edge-map · lib/pattern-edit · lib/pattern-shaping · lib/pattern-bagparts · lib/glb-export · lib/pattern-export · lib/pattern-constraints · lib/pattern-grading · lib/pattern-nest · lib/pattern-photo · lib/pattern-coach · lib/pattern-import-assist · lib/pattern-handles · lib/length-units", category: "feature",
    source: { path: "components/pattern-studio" },
    what: "ครอบตัววาดชิ้นวัสดุเดิม แล้วเพิ่มปุ่มสร้างชิ้นจากแม่แบบทรงกระเป๋า (ใส่ขนาด → ได้ชิ้นแพทเทิร์นครบพร้อมภาพกระเป๋าที่เย็บแล้ว) กับภาพ 3D ของชิ้นบนกระดานที่ขยับตามทันที เลือกชิ้นฝั่งไหนอีกฝั่งสว่างตาม · SewView = เครื่องมือเย็บ (จับคู่ขอบที่เย็บติดกัน + เตือนความยาวไม่เท่ากัน) · AssemblyView = ประกอบชิ้นเป็นกระเป๋า 3D จากตะเข็บ + เย็บทีละขั้น + ติดหู/แผ่นปิดหลังช่องเอง · SendCostingModal = ส่งชิ้นไปเป็นบรรทัดตีราคาของใบงานออกแบบ (ไม่ลบบรรทัดเดิม) · PhotoModal = แกะจากรูป (ลอกเส้นจากรูปแพทเทิร์นกระดาษ ไม่ใช้ AI / คัดลอกคำสั่งไปใช้ AI ของผู้ใช้เองแล้ววางคำตอบกลับ ฟรี / ให้ AI ในระบบประมาณขนาดจากรูปกระเป๋า เสียเงิน) · เครื่องมือเย็บ/แก้ตะเข็บแบบ CLO อยู่บนกระดานวาดเอง (ส่ง sew → ShapeEditor seams) · ใช้ในแอปสตูดิโอแพทเทิร์น /pattern-studio",
    when: "หน้าที่ให้ผู้ใช้ทำแพทเทิร์นกระเป๋า/ชิ้นวัสดุแล้วอยากเห็นภาพ 3D ไปด้วย เช่น แท็บตีราคา (แบบวาด) ใบงานออกแบบ — รับค่าชุดเดียวกับ ShapeEditor แบบฝัง",
    notWhen: "ป๊อปวาดชิ้นเดี่ยวที่ไม่ต้องการ 3D ให้ใช้ ShapeEditor ตรง ๆ · การประกอบเป็นกระเป๋าต้องมีข้อมูลตะเข็บ จึงมีเฉพาะในแอปสตูดิโอแพทเทิร์น (ในแท็บตีราคาเห็นเป็นชิ้นแบน)",
    doc: "pattern-studio.md",
  },
  {
    key: "app-change", label: "ศูนย์งานแก้แอป (ป๊อปขอแก้หน้านี้ + หน้าภาพรวม)", code: "AppChangeRequestModal · useAppChangeMenu · AppChangeHub · lib/app-change", category: "feature",
    source: { path: "components/app-change" },
    what: "จดงานแก้ดีไซน์/จุกจิกผูกกับหน้า — ระบบใส่หน้า + ของกลางที่หน้านั้นใช้ + กล่องในแผนผังการทำงานให้เอง แนบภาพหน้าจอได้ · หน้า /admin/app-changes จัดกลุ่มตามหน้า/ของกลาง/สถานะ ดูผลกระทบของกลาง ส่งเข้าแผนทีม สร้างคำสั่งให้ AI · ป้ายรอขึ้นเว็บ/ขึ้นเว็บแล้วจากรหัส [CH-xxxxxx] ใน commit · เก็บใน issue_reports (page_path/parts/flow_refs)",
    when: "อยากจดว่าหน้านี้ควรแก้อะไร (เมนูโปรไฟล์ → ขอแก้หน้านี้) · ชิ้นงานอื่นอยากรู้ว่าหน้าไหนใช้ของกลางอะไร → partsForPage / pagesForPart ใน lib/app-change",
    notWhen: "พนักงานแจ้งปัญหาการใช้งานทั่วไป ใช้หน้า /issue-report เดิม (ตารางเดียวกัน แต่ไม่มี page_path) · ห้ามทำปุ่มลอยแยก — ศูนย์แจ้งเตือน Pet เป็นของลอยตัวเดียว",
    doc: "app-changes.md",
  },
  {
    key: "block-print", label: "บล็อกพิมพ์ (เปิด .ai → เลือก/รวมชิ้น → ตั้งขนาด → PDF มีเส้นบอกขนาด)", code: "BlockPrintList · BlockPrintEditor · BlockPieceGrouper · BlockLayoutEditor · lib/block-print-layout · lib/block-print-text · lib/block-print · lib/block-print-ai · lib/block-print-pdf", category: "feature",
    source: { path: "components/block-print" },
    what: "เปิดไฟล์ .ai (แบบ PDF Compatible) หรือ .pdf แล้วแยกชิ้นเวกเตอร์ที่เติมสีออกมา ตั้งกว้าง/สูงจริงเป็น ซม./มม. แล้วส่งออก PDF ที่มีแค่ลายสีดำ + เส้นไกด์ + เส้นบอกขนาด ส่งโรงงานทำบล็อก · ภาพบนจอกับ PDF ใช้สูตรวางตำแหน่ง/เส้นบอกขนาดตัวเดียวกัน",
    when: "งานที่ต้องส่งไฟล์ลายขนาดจริงให้โรงงานทำบล็อกปั๊ม/บล็อกพิมพ์ · ที่อื่นที่อยากอ่านเวกเตอร์จากไฟล์ .ai ให้เรียก readAiFile / piecesFromOperatorList ตัวนี้ ไม่เขียนตัวอ่านใหม่",
    notWhen: "ชิ้นแพทเทิร์นตัดผ้า/หนังที่มีเผื่อเย็บ ให้ใช้ ShapeEditor / สตูดิโอแพทเทิร์น · พิมพ์แบ่งหน้า A4 ต่อกัน ให้ใช้ pattern-sheet · วาดอิสระไม่มีขนาดจริง ให้ใช้กระดานวาด",
    doc: "block-print.md",
  },
  {
    key: "pattern-3d", label: "ตัวแสดงชิ้นแพทเทิร์นเป็นภาพ 3D", code: "Pattern3D · lib/three-loader", category: "feature",
    source: { path: "components/pattern-3d" },
    what: "วาดชิ้นแพทเทิร์นเป็นแผ่น 3D วางบนโต๊ะ (มีรูเจาะจริง เส้นเย็บ ป้ายชื่อ) หรือวาดกระเป๋าที่ประกอบแล้วจากแม่แบบทรง หรือกระเป๋าที่ประกอบจากชิ้นจริงกับตะเข็บ (mode assembly) หรือภาพจำลองวัสดุทิ้งตัวแบบทดลอง (mode sim · lib/pattern-sim) หมุน ซูม แยกชิ้นดู คลิกเลือกชิ้นได้ ไลบรารี 3D โหลดจาก public/vendor ตอนเปิดครั้งแรก ไม่ทำให้หน้าอื่นหนัก",
    when: "ต้องการให้เห็นชิ้นแพทเทิร์นหรือกระเป๋าจากแม่แบบเป็นภาพ 3D",
    notWhen: "รูปสินค้าจริง/ภาพถ่าย ใช้ตัวแสดงรูปเดิม · ห้ามลง three.js เป็นแพ็กเกจ (ขั้น build เสี่ยงหน่วยความจำหมด) ให้ใช้ loadThree จาก lib/three-loader",
    doc: "pattern-studio.md",
  },
  {
    key: "print-history", label: "ป้ายพิมพ์แล้ว N ครั้ง", code: "PrintHistoryBadge", category: "print",
    source: { path: "components/print-history" },
    what: "บอกว่าเอกสารนี้พิมพ์ไปกี่ครั้ง ล่าสุดเมื่อไหร่ ใครพิมพ์",
  },
  {
    key: "pdfme-designer", label: "ตัวออกแบบเอกสารแบบลากวาง", code: "PdfmeDesigner", category: "print",
    source: { path: "components/pdfme-designer" },
    what: "ลากช่องข้อความ/ตาราง/รูป วางบนกระดาษ (pdfme) ฟอนต์ไทยพร้อม เก็บเป็นแม่แบบใน erp_report_templates",
    when: "ออกแบบแม่แบบเอกสารแบบไม่เขียนโค้ด (ตอนนี้หน้าพิมพ์ที่ใช้ได้จริง = ใบสั่งงานผลิต)",
    notWhen: "แม่แบบ HTML ปกติ — แก้ที่หน้าแม่แบบเอกสาร /admin/report-templates",
    doc: "report-template-designer.md",
  },
  {
    key: "report-usage", label: "ทะเบียนหน้าพิมพ์ที่ใช้แม่แบบ", code: "REPORT_USAGES · usageMatch", category: "print",
    source: { path: "lib/report-usage" },
    what: "บอกว่าเอกสารแต่ละประเภทพิมพ์ที่หน้าไหน และหน้านั้นหยิบแม่แบบใบไหน (หลัก / ที่เลือก / ตามรหัส)",
    when: "ทำหน้าพิมพ์ใหม่ที่อ่านแม่แบบจาก /api/admin/report-templates → เพิ่มแถวที่นี่",
    doc: "report-template-designer.md",
  },

  // ───────── แจ้งเตือน ─────────
  {
    key: "notification-bell", label: "กระดิ่งแจ้งเตือน", code: "NotificationBell", category: "notify",
    source: { path: "components/notification-bell" },
    what: "รายการแจ้งเตือนในแอป กดอ่านแล้ว",
    legacyKey: "notification_bell",
  },
  {
    key: "web-push", label: "แจ้งเตือนเด้งบนเครื่อง", code: "useWebPush", category: "notify",
    source: { path: "components/web-push" },
    what: "เปิด/ปิดรับแจ้งเตือนเด้งบนมือถือและคอม",
    doc: "web-push.md",
  },
  {
    key: "work-popup", label: "ป๊อปเตือนงานตอนเข้าระบบ", code: "WorkPopupHost", category: "notify",
    source: { path: "components/work-popup" },
    what: "เด้งเตือนงานค้างตอนเปิด ERP (ตั้งเงื่อนไขได้) + ศูนย์แจ้งเตือนแบบแท็บ (ตัว Pet) — ปรับความกว้างได้ ยิ่งกว้างยิ่งเตี้ย · จัดลำดับ/เปิด-ปิดแท็บเองได้",
    when: "แจ้งเตือนของแอปใหม่ที่อยากรวมไว้ที่เดียว → เพิ่มเป็นแท็บ (FloatTab + CENTER_TABS)",
    notWhen: "ห้ามสร้างป๊อป/ปุ่มลอยแจ้งเตือนแยกของแต่ละแอป",
  },
  {
    key: "line-send", label: "ส่งข้อความ LINE", code: "lib/line-send", category: "notify",
    source: { path: "lib/line-send" },
    what: "ด่านกลางส่งข้อความ LINE (นับโควตา กันส่งซ้ำ)",
    when: "ทุกการส่ง LINE",
    notWhen: "ห้ามยิง LINE API เองในหน้า/API อื่น",
  },
  {
    key: "chat-inbox", label: "ห้องแชทรวม (แชทลูกค้าทุกช่องทาง)", code: "lib/chat", category: "notify",
    source: { path: "lib/chat" },
    what: "รับ/ตอบแชทลูกค้าทุกช่องทางที่เดียว (/chat) — ตาราง chat_conversations/chat_messages + ตัวต่อช่องทางแบบเดียวกัน · กติกาตอบฟรี/ยังไม่ตอบ/แจ้งเตือน",
    when: "ต่อแชทช่องทางใหม่ (Lazada/Shopee/TikTok/Meta) → ไฟล์ตัวต่อ 1 ไฟล์ + 1 บรรทัดใน lib/chat/registry · ข้อความเข้าทุกช่องทาง → ingestInbound (lib/chat/store)",
    notWhen: "ห้ามทำหน้าแชท/ตารางเก็บแชทแยกต่อช่องทาง · ส่ง LINE ถึงลูกค้าต้องผ่านตัวส่งกลาง lib/line-send",
    doc: "chat-inbox.md",
  },
  {
    key: "line-identity", label: "ตัวแยกคนในไลน์ (พนักงาน/ลูกค้า)", code: "lib/line-identity", category: "notify",
    source: { path: "lib/line-identity" },
    what: "บอกว่าคนไลน์คนนี้เป็นแอดมิน (บัญชี ERP + สิทธิ์ admin.users) พนักงานคนไหน ลูกค้าร้านไหน ถูกระงับ หรือไม่รู้จัก — อ่าน user_profiles + line_memberships + line_customer_links",
    when: "ทุกงานที่บอทต้องรู้ว่าใครทักมาก่อนให้ข้อมูลส่วนตัว (ไลน์บริษัท · สลิป · งานเหมา · ออเดอร์ลูกค้า)",
    notWhen: "ห้ามค้น line_user_id เองในแต่ละงาน · หน้าที่โชว์ตัวเงินต้องตรวจ ID token ใหม่ (verifyLineIdToken) ไม่ใช่เชื่อ userId จากแชตอย่างเดียว",
    doc: "line-company-oa.md",
  },
  {
    key: "line-company", label: "ไลน์บริษัท (เมนูล่างจอต่อคน)", code: "lib/line-company", category: "notify",
    source: { path: "lib/line-company" },
    what: "LINE OA ตัวเดียวให้พนักงาน+ลูกค้า+แอดมินทักแชท · เมนูล่างจอ 4 ชุดสลับตามคน (แอดมินเป็นแท็บ) · ปุ่มตั้งเองได้ในศูนย์ LINE (ย้อนได้) · QR 3 ใบ + QR รายร้าน (lib/line-company-qr) สแกนแล้วผูกตัวตนตามชนิด · ปุ่มเมนู = postback cmp=… ตอบฟรี · ปุ่มเงินเดือน/ใบเตือน/งานเหมา (lib/line-self-view) + สถานะงาน/ตารางส่งงานลูกค้า (lib/line-customer-view · ไม่มีราคา) = เปิดหน้าเล็กในไลน์ /a?me= · แชทลูกค้าส่งต่อห้องแชทรวม",
    when: "เพิ่มงานใหม่ให้พนักงาน/ลูกค้าในไลน์ → เพิ่มปุ่มใน COMPANY_ACTIONS + companyReplyText (lib/line-company) แล้วไปเพิ่มปุ่มในศูนย์ LINE → สร้างเมนูในไลน์ใหม่",
    notWhen: "ห้ามทำบอท/ตัวรับไลน์ตัวที่ 2 สำหรับพนักงานหรือลูกค้า · ห้ามพิมพ์ตัวเงินในแชต",
    doc: "line-company-oa.md",
  },
  {
    key: "bell-switch", label: "สวิตช์เปิด/ปิดกระดิ่งที่ส่งตรง", code: "lib/bell-switch", category: "notify",
    source: { path: "lib/bell-switch" },
    what: "เช็กว่าแอดมินปิดกระดิ่งเรื่องนี้ไว้ไหม ก่อนส่งกระดิ่งที่โค้ดส่งตรง (ไม่ผ่านกฎ) · สวิตช์อยู่ในแผงกระดิ่งของแผนผังการทำงาน",
    when: "ส่งกระดิ่งถึงคนที่เกี่ยวข้องกับเอกสารด้วยโค้ดเอง (insert erp_notifications / erp_notify) → bellAllowed / dropDisabledBells ก่อนส่ง แล้วลงเรื่องใน lib/flow-map-notify",
    notWhen: "กระดิ่งที่ส่งตามกฎ (erp_notify_for_event) เปิด/ปิดที่กฎอยู่แล้ว · ความปลอดภัย/ปุ่มกดขอเอง ห้ามให้ปิด",
    doc: "flow-map.md",
  },

  // ───────── ระบบ / สิทธิ์ ─────────
  {
    key: "auth", label: "สิทธิ์ผู้ใช้ (หน้าจอ)", code: "usePermission · AccessDenied", category: "system",
    source: { path: "components/auth" },
    what: "เช็กว่าใครเห็นหรือกดอะไรได้ ซ่อนปุ่มที่ไม่มีสิทธิ์ โชว์หน้าไม่มีสิทธิ์",
    when: "ทุกหน้าและทุกปุ่มที่ต้องมีสิทธิ์",
    doc: "phase-1-1-permissions.md",
  },
  {
    key: "api-auth", label: "ด่านสิทธิ์ฝั่งเซิร์ฟเวอร์", code: "guardApi · apiCan", category: "system",
    source: { path: "lib/api-auth" },
    what: "เช็กสิทธิ์ก่อนให้ API ทำงาน (ไม่มีสิทธิ์ = ตอบ 401)",
    when: "ทุก API ที่อ่าน/แก้ข้อมูลสำคัญ",
  },
  {
    key: "audit", label: "ประวัติว่าใครทำอะไร", code: "lib/audit", category: "system",
    source: { path: "lib/audit" },
    what: "บันทึกการสร้าง แก้ ลบ อนุมัติ พร้อมค่าเก่า/ใหม่รายช่อง",
    when: "ทุกการบันทึกข้อมูลสำคัญ",
    legacyKey: "audit_log",
  },
  {
    key: "icon", label: "ไอคอนกลาง", code: "Icon", category: "system",
    source: { path: "components/icon" },
    what: "วาดไอคอนจากทะเบียนไอคอน แอดมินเปลี่ยนชุด/สีได้ที่ /admin/icons",
    when: "ทุกไอคอนในหน้าจอ",
    notWhen: "ห้ามใช้อีโมจิในหน้าใหม่ · บอกชนิดไฟล์ (JPG/PSD/PDF) → ใช้ไอคอนประเภทไฟล์ (FileTypeIcon)",
    doc: "icon-system.md",
  },
  {
    key: "file-type-icon", label: "ไอคอนประเภทไฟล์", code: "FileTypeIcon", category: "file",
    source: { path: "components/file-type-icon" },
    what: "ไอคอนกระดาษพับมุม + แถบสีบอกนามสกุล (JPG · CR2 · PSD · AI · PDF · DXF · SEW ... 65 ชนิด 13 กลุ่ม) + ป๊อปเลือกประเภทไฟล์ (FileTypePickerModal) · ทะเบียนนามสกุล/สีอยู่ lib/file-types",
    when: "บอกว่าไฟล์ชนิดไหนด้วยภาพ: กล่องไฟล์ในกระดาน flowchart · รายการไฟล์แนบ · คลังไฟล์ · รายการไฟล์ใน Drive",
    notWhen: "ไอคอนเมนู/ปุ่มทั่วไป → ใช้ไอคอนกลาง (Icon) · รูปตัวอย่างของไฟล์จริง → ใช้ภาพ thumbnail",
    doc: "file-type-icon.md",
  },
  {
    key: "i18n", label: "สลับภาษา ไทย / อังกฤษ", code: "useT", category: "system",
    source: { path: "components/i18n" },
    what: "แปลข้อความตรงจุด ตามภาษาที่ผู้ใช้เลือก",
    doc: "bilingual-content.md",
  },
  {
    key: "money-calc", label: "คำนวณเงิน", code: "lib/money", category: "system",
    source: { path: "lib/money" },
    what: "ปัดเศษ จัดรูปแบบตัวเลขเงิน ใช้สูตรเดียวกันทั้งระบบ",
    notWhen: "ห้ามคำนวณ/ปัดเศษเงินเองในหน้า",
  },
  {
    key: "recent-picks", label: "จำตัวที่เลือกล่าสุด", code: "lib/recent-picks", category: "system",
    source: { path: "lib/recent-picks" },
    what: "จำรายการที่ผู้ใช้เลือกบ่อย/ล่าสุด ให้ขึ้นก่อนในตัวเลือก",
    doc: "recent-picks.md",
  },
  {
    key: "refresh-bus", label: "สั่งหน้าอื่นโหลดใหม่", code: "lib/refresh-bus", category: "system",
    source: { path: "lib/refresh-bus" },
    what: "บันทึกที่หนึ่ง แล้วหน้า/แผงอื่นที่เปิดอยู่โหลดข้อมูลใหม่เอง",
  },
  {
    key: "storage-policy", label: "กฎที่เก็บไฟล์", code: "lib/storage-policy", category: "system",
    source: { path: "lib/storage-policy" },
    what: "ไฟล์หมวดไหนเก็บที่ R2 / Supabase / Google Drive",
    doc: "storage-policy.md",
  },
  {
    key: "r2", label: "ที่เก็บรูป Cloudflare R2", code: "lib/r2", category: "system",
    source: { path: "lib/r2" },
    what: "อัปโหลด/อ่าน/ลบไฟล์ใน R2",
    legacyKey: "cloudflare_r2",
  },
  {
    key: "paid-services", label: "ทะเบียน AI / API ที่เสียเงิน", code: "lib/paid-services", category: "system",
    source: { path: "lib/paid-services" },
    what: "จุดที่ใช้ AI หรือบริการเสียเงิน เปิด/ปิด งบต่อเดือน",
    when: "เพิ่มการเรียก AI หรือ API เสียเงินใหม่ ต้องลงทะเบียนที่นี่",
    doc: "paid-services.md",
  },
  {
    key: "flow-map", label: "แผนผังการทำงาน", code: "lib/flow-map", category: "system",
    source: { path: "lib/flow-map" },
    what: "กดอะไรแล้วไปอัปเดตอะไรต่อ ของ ซื้อ ผลิต จ่ายงาน (หน้า /master/flow-map)",
    doc: "flow-map.md",
  },

  // ───────── ลงทะเบียนเพิ่ม 2026-11-07: ทุกตัวที่ใช้ตั้งแต่ 3 จุดขึ้นไป (ตัวที่ใช้ 1-2 จุด = ชิ้นเฉพาะหน้า ยังไม่ลง) ─────────

  // โครงหน้า / ส่วนประกอบทั่วไป
  {
    key: "playground-shell", label: "เปลือกหน้าหลัก (เมนูข้าง + แถบบน)", code: "PlaygroundShell", category: "layout",
    source: { path: "components/playground-shell" },
    what: "ครอบทุกหน้าในระบบ: เมนูข้าง แถบบน ค้นหารวม เมนูบัญชี ล็อกแอปตามสิทธิ์",
    when: "หน้าใหม่ทั่วไปในระบบ ERP",
    notWhen: "แอปที่อยากเปิดแยกเต็มจอไม่มีเมนูข้าง ให้ใช้ StandaloneShell",
  },
  {
    key: "standalone-shell", label: "เปลือกแอปแยกเต็มจอ", code: "StandaloneShell", category: "layout",
    source: { path: "components/standalone-shell" },
    what: "หน้าแบบแอปแยก ไม่มีเมนูข้าง ERP มีแถบบนของตัวเอง (เช่น แอปจัดการงาน)",
    when: "โมดูลหลักที่คนใช้ทั้งวันและอยากเปิดเป็นแท็บแยก",
    notWhen: "หน้าทั่วไป ให้ใช้ PlaygroundShell",
  },
  {
    key: "fullscreen-stage", label: "โหมดเต็มจอของกระดาน/ผัง", code: "FullscreenStage", category: "layout",
    source: { path: "components/fullscreen-stage" },
    what: "ปุ่ม + คีย์ F ทำให้กระดาน/ผังใช้พื้นที่เต็มจอ (ซ่อนหัวเว็บ เมนูแอป แถบปุ่มของหน้า) แบบ Miro · Esc ออก · จำต่อคน · มือถือเต็มจอเสมอ · ไม่โหลดกระดานใหม่ตอนสลับ · autoHide: แถบปุ่ม (FullscreenBar) ซ่อนขอบบน ชี้แล้วโชว์ + ชิปสรุป (FullscreenPeek) + ปักไว้ · เปิดในแอปเดี่ยวก็ซ่อนหัวแอปให้",
    when: "หน้ากระดานวาด / ผังงาน / canvas ที่อยากได้พื้นที่มากสุด (ตอนนี้ใช้ที่แท็บกระดานของแผนงานทีม)",
    notWhen: "ป๊อปฝังหน้าอื่น ใช้ EmbedModal · ดูรูปเต็มจอ ใช้ ImageLightbox · ทั้งแอปไม่มีเมนูข้าง ใช้ StandaloneShell",
    doc: "fullscreen-stage.md",
  },
  {
    key: "app-access-gate", label: "ด่านว่าใครเข้าแอปนี้ได้ + ล็อกพนักงานในแอป", code: "AppAccessGate · AppLockGate · lib/app-lock", category: "layout",
    source: { path: "components/app-access-gate" },
    what: "กันคนที่ไม่มีสิทธิ์เข้าแอปแยก ใช้กฎเดียวกับเมนูหลัก · AppLockGate (ครอบทั้งเว็บที่ root layout) = คนที่ถูกล็อกในแอปพนักงานเปิดหน้านอกแอป → หน้า “หน้านี้ไม่อยู่ในแอป X” + ขอสิทธิ์",
    when: "หน้าที่ใช้ StandaloneShell หรือเปลือกของตัวเอง (เปลือกหลักกันให้อยู่แล้ว)",
  },
  {
    key: "staff-app-home", label: "หน้าแรกแอปพนักงาน (ปุ่มเมนูใหญ่)", code: "StaffAppHome · useStaffAppPrefs · AppAnnouncements", category: "layout",
    source: { path: "components/staff-app-home" },
    what: "หน้าแรกของแอปพนักงาน: ปุ่มเมนูใหญ่จัดตามหัวข้อ (มือถือ 2 คอลัมน์) · ตัวเลขงานค้างบนปุ่ม · กล่องประกาศจากหัวหน้า · ค้นหาเมนู · ปักโปรด/ใช้ล่าสุดรายคน · TH/EN",
    when: "แอปเดี่ยว /app/<key> ที่เป็นแอปพนักงาน + ตัวอย่างหน้าจอในตัวช่วยสร้างแอป",
    notWhen: "หน้ารวมทุกแอป (/apps launcher) · แถบเมนูของแอปหลัก (เชลล์แอปเดี่ยวจัดให้แล้ว)",
    doc: "staff-apps.md",
  },
  {
    key: "staff-app-builder", label: "ตัวช่วยสร้างแอปพนักงาน", code: "StaffAppBuilder · StaffAppCreateModal · StaffAppTrash · lib/staff-apps", category: "feature",
    source: { path: "components/staff-app-builder" },
    what: "สร้างแอปให้พนักงาน 3 ขั้น (ชื่อ+ไอคอน+สี → ติ๊ก/ลากเรียงเมนู ตั้งชื่อเฉพาะแอป 2 ภาษา → ใครเห็น) · แม่แบบ/คัดลอก · ร่าง→เผยแพร่ · ประวัติเวอร์ชัน · ถังขยะแอป",
    when: "สร้าง/แก้แอปพนักงาน (อยู่ใน /admin/app-manager)",
    notWhen: "จัดเมนูของแอปหลักเดิม (ใช้ AppSettingsPanel) · แก้ชื่อเมนูกลาง (/admin/menu)",
    doc: "staff-apps.md",
  },
  {
    key: "master-page", label: "ตัวช่วยสร้างหน้าข้อมูลหลัก", code: "MasterPage", category: "layout",
    source: { path: "components/master-page" },
    what: "สร้างหน้ารายการ + ฟอร์มจากทะเบียน field ในไม่กี่บรรทัด (ห่อ MasterCRUD ให้)",
    when: "หน้าข้อมูลหลักธรรมดาที่ไม่ต้องจัดหน้าพิเศษ",
    notWhen: "หน้าที่ต้องปรับเยอะ ให้ใช้ MasterCRUD ตรง ๆ",
  },
  {
    key: "page-chrome", label: "วางชื่อหน้า / ค้นหา / ปุ่ม บนแถบบน", code: "usePageChrome", category: "layout",
    source: { path: "components/page-chrome" },
    what: "ให้หน้าเอาชื่อหน้า ช่องค้นหา ปุ่ม ไปวางบนแถบบนของเปลือก แบบแอป",
    doc: "page-chrome.md",
  },
  {
    key: "brand-strip", label: "แถบสีแบรนด์ซ้ายการ์ด", code: "BrandStrip", category: "layout",
    source: { path: "components/brand-strip", names: ["BrandStrip"] },
    what: "แถบสีบาง ๆ ด้านซ้ายการ์ด บอกว่าเป็นงานของแบรนด์ไหน สีมาจากเมนูแบรนด์ สีอ่อนเกินจะเข้มให้เอง ไม่มีสี = เทา",
    when: "การ์ดบนบอร์ดที่ปนหลายแบรนด์ (Design Dashboard, บอร์ดงาน)",
    notWhen: "อย่าใช้ขอบทั้งใบหรือเงาสีแบรนด์แทน (เจ้าของเลือกแถบซ้าย) · อย่าใช้สีแดงบอกแบรนด์ แดง = เตือนเกินกำหนด",
    doc: "brand-strip.md",
  },
  {
    key: "account-menu", label: "เมนูบัญชีผู้ใช้", code: "AccountMenu", category: "layout",
    source: { path: "components/account-menu" },
    what: "เมนูโปรไฟล์ตัวเดียวทั้งระบบ กดรูป/ชื่อผู้ใช้แล้วได้ โปรไฟล์ รหัสผ่าน ความปลอดภัย สีธีม ภาษา เปิด/ซ่อนตัว Pet (ค่าตั้งอื่นของ Pet อยู่ที่ตัว Pet — คลิกขวา) ติดตั้งแอป ดูแบบ iPhone/iPad ออกจากระบบ (แถบบนและการ์ดชื่อในแถบข้างใช้ตัวนี้ตัวเดียว)",
    when: "ทุกเปลือกหน้าที่มีปุ่มผู้ใช้ · แถบบนใช้ค่าเริ่ม · การ์ดชื่อล่างแถบข้างใส่ placement=\"sidebar\" · โหมดแอปส่ง onDark + device · เพิ่มแถวตั้งค่าส่วนตัวใหม่ = เพิ่มในไฟล์นี้ที่เดียว",
    notWhen: "อย่าเขียนเมนูโปรไฟล์/ปุ่มออกจากระบบแยกในเปลือกใหม่ · หน้าเดียวกันมี AccountMenu 2 ตัว ให้ตัวที่ 2 ใส่ sync={false} (กันซิงก์สีธีมซ้ำ)",
    doc: "account-menu.md",
  },
  {
    key: "global-search", label: "ค้นหารวมทั้งระบบ", code: "GlobalSearch", category: "layout",
    source: { path: "components/global-search" },
    what: "พิมพ์รหัส/ชื่อ แล้วเจอสินค้า เอกสาร คน หรือคำสั่งลัด โดยไม่ต้องรู้ว่าอยู่โมดูลไหน",
    doc: "global-search.md",
  },
  {
    key: "brand", label: "โลโก้และชื่อระบบ", code: "Logo / Wordmark", category: "layout",
    source: { path: "components/brand" },
    what: "โลโก้ ชื่อระบบ สีหลักของแบรนด์ แก้ที่เดียวเปลี่ยนทั้งระบบ",
  },
  {
    key: "device-view", label: "ดูแบบ จอคอม / แท็บเล็ต / มือถือ", code: "DeviceView", category: "layout",
    source: { path: "components/device-view" },
    what: "ให้แดชบอร์ดหรือบอร์ดสลับดูตามขนาดจอได้ + รู้ว่าจอที่เปิดอยู่เป็นแบบไหน",
    doc: "device-view.md",
  },
  {
    key: "device-preview", label: "หน้าต่างลอย ดูแบบ iPhone / iPad", code: "DevicePreviewModal", category: "layout",
    source: { path: "components/device-preview", names: ["DevicePreviewModal", "DevicePreviewButton"] },
    what: "หน้าต่างลอยโชว์หน้าที่เปิดอยู่ในขนาดจอ iPhone หรือ iPad ไม่บังหน้า PC ลากย้ายได้ หมุนจอ ย่อกรอบ 50-100% เปลี่ยนหน้าบน PC แล้วกรอบเปลี่ยนตาม จำตำแหน่ง/เครื่องต่อเครื่อง",
    when: "อยากดูหน้าเว็บปกติแบบมือถือ/แท็บเล็ตเทียบกับจอคอม (ปุ่มอยู่ในเมนูโปรไฟล์แล้ว ทุกหน้าใช้ได้เลย)",
    notWhen: "หน้าที่ต้องเปลี่ยนหน้าตาตามโหมดเอง ใช้ useDeviceMode / useIpadMode (device-view) · โหมดแอป /app/<key> ใช้ชุดมุมมองอุปกรณ์ในเมนูโปรไฟล์ · อย่าเขียนกรอบ iframe มือถือเอง",
    doc: "device-view.md",
  },
  {
    key: "scroll-tabs", label: "แถบแท็บเลื่อนได้", code: "ScrollTabs", category: "layout",
    source: { path: "components/scroll-tabs" },
    what: "แถบแท็บที่ยาวเกินจอ เลือกแท็บแล้วเลื่อนให้แท็บนั้นอยู่กลาง",
    when: "หน้าที่มีแท็บหลายอัน โดยเฉพาะบนมือถือ",
  },
  {
    key: "settings-nav", label: "เมนูซ้ายจัดหมวด + ค้นหา", code: "SettingsNavLayout", category: "layout",
    source: { path: "components/settings-nav" },
    what: "หน้าที่มีหัวข้อเยอะ: เมนูซ้ายแบ่งหมวด มีช่องค้นหา กดแล้วโชว์เนื้อหาด้านขวา (มือถือเป็นช่องเลือกจัดหมวด)",
    when: "หน้าตั้งค่า/หน้ารวมตารางที่มีเกิน ~5 หัวข้อ (ตั้งค่างาน · หน้าดีไซน์เว็บร้าน · ข้อมูลตั้งต้น)",
    notWhen: "มีแค่ 2–4 หัวข้อ ให้ใช้แท็บธรรมดาหรือ ScrollTabs · แท็บในป๊อปอัป/ลิ้นชัก",
  },
  {
    key: "section-jump-nav", label: "เมนูกระโดดไปหัวข้อ + กล่องหัวข้อแถบสี", code: "SectionJumpNav · SectionBlock · useSectionSpy", category: "layout",
    source: { path: "components/section-jump-nav", names: ["SectionJumpNav", "SectionBlock", "useSectionSpy"] },
    what: "ฟอร์ม/ป๊อปยาวหลายหัวข้อ: ทุกส่วนอยู่หน้าเดียวเลื่อนยาว มีเมนูซ้าย (PC) / แถบชิป (มือถือ) กดแล้วเลื่อนไปหัวข้อนั้น ไฮไลต์หัวข้อที่ดูอยู่ ป้ายเตือนต่อหัวข้อ · SectionBlock = กล่องที่มีแถบหัวสีคั่นหัวข้อ",
    when: "ป๊อป/ลิ้นชัก/หน้า ที่มี ~5 หัวข้อขึ้นไปและอยากให้เห็นต่อกัน (ป๊อปแก้ใบสั่งผลิต)",
    notWhen: "กดแล้วเปลี่ยนเนื้อหาทั้งก้อน ใช้ SettingsNavLayout · แท็บธรรมดา ใช้ ScrollTabs",
  },
  {
    key: "chip-overflow", label: "ชิปยาว โชว์ไม่กี่ตัว แล้วกดดูที่เหลือ", code: "ChipOverflow", category: "layout",
    source: { path: "components/chip-overflow" },
    what: "รายการชิปที่ยาวมาก (เช่น ลูกค้า 30 สาขา) โชว์แค่ 3 ตัวแรก + ปุ่ม \"+N ดูทั้งหมด\" กางแล้วจัดกลุ่มได้ มีปุ่มย่อกลับ",
    when: "ชิป/ป้ายจำนวนไม่แน่นอนในแถวตาราง การ์ด หรือหัวข้อ ที่ยาวจนแถวสูงเกิน (ลูกค้า สาขา แท็ก ผู้รับผิดชอบ)",
    notWhen: "ต้องติ๊กเลือกชิป ให้ใช้ FieldChipsPicker หรือ Picker กลาง · กรองตามแท็ก ให้ใช้ TagGroupFilter",
    doc: "chip-overflow.md",
    note: "จัดกลุ่มตามบริษัทจากชื่อคู่ค้า (\"…จำกัด ( สาขา 1 )\") ใช้ lib/company-branch · ใช้ที่หน้าแบรนด์ (ลูกค้าประจำแบรนด์)",
  },
  {
    key: "block-layout", label: "จัดกล่องในหน้า (ลากสลับ · ซ่อน · เต็ม/ครึ่ง)", code: "useBlockLayout · BlockLayoutRows · BlockLayoutEditor · lib/block-layout", category: "layout",
    source: { path: "components/block-layout", names: ["useBlockLayout", "BlockLayoutRows", "BlockLayoutEditor"] },
    what: "ให้ทีม (แอดมิน) และแต่ละคนจัดกล่องในหน้าเองได้ — ลากสลับลำดับ เปิด/ปิด ขนาดเต็มหรือครึ่ง (ครึ่ง 2 ใบติดกัน = วางคู่) · ทีมเก็บ ui_config admin_block_layout:<หน้า> · ของฉันเก็บ user_ui_prefs",
    when: "หน้าที่เขียนเองแบ่งเป็นกล่อง (เช่น หน้าใบงานมือถือ หน้าภาพรวม) แล้วอยากให้คนจัดเอง",
    notWhen: "ฟอร์ม/หน้าข้อมูล MasterCRUD (ใช้ตัวออกแบบฟอร์ม StudioPanel) · คอลัมน์ตาราง (Column Manager ของตารางกลาง) · แท็บในศูนย์แจ้งเตือน (CENTER_TABS)",
    doc: "block-layout.md",
  },
  {
    key: "carousel", label: "การ์ดเลื่อนแนวนอน (การ์ดกลางขยาย)", code: "Carousel", category: "layout",
    source: { path: "components/carousel", names: ["Carousel"] },
    what: "การ์ดเรียงแนวนอน การ์ดกลางขยาย ข้าง ๆ หดและจาง · ลูกศร · จุดบอกตำแหน่ง · ปัดนิ้ว · คีย์ ←→/Enter · CSS ล้วน (ไม่มีโปรแกรมแอนิเมชันเสริม)",
    when: "หน้าเลือก 1 อย่างจากไม่กี่สิบอย่างแบบมีภาพ เช่น เลือกแบรนด์ (/brand-hub)",
    notWhen: "รายการยาวที่ต้องค้นหา/กรอง (ตารางกลาง/การ์ดกริด) · ดูรูปทีละรูป (ตัวดูรูปกลาง)",
    doc: "brand-hub.md",
  },
  {
    key: "swipe-nav", label: "ปัดซ้าย-ขวาเปลี่ยนแท็บ (มือถือ)", code: "useSwipeNav", category: "layout",
    source: { path: "lib/use-swipe-nav", names: ["useSwipeNav"] },
    what: "ปัดตรงรายการเพื่อไปแท็บถัดไป/ก่อนหน้า (ปัดซ้าย = ถัดไป แบบ LINE/IG) · เลื่อนตามนิ้ว · กันปัดพลาด (ต้องแนวนอนชัด เกิน 60px · ขอบจอไม่นับ · ปัดแล้วไม่เปิดการ์ด)",
    when: "หน้ามือถือที่เป็นแท็บเรียงกัน เช่น แท็บสถานะบอร์ด",
    notWhen: "รูปที่ปัดดูทีละรูป / แถวที่เลื่อนแนวนอนเอง (ใส่ data-no-swipe) · จอคอมที่ลากวางการ์ด",
  },
  {
    key: "app-shell-bar", label: "หน้าบอกแอปเดี่ยวให้ซ่อนแถบของเชลล์ (แถบล่างซ้อน · เต็มจอ)", code: "usePageOwnsBottomBar · usePageWantsFullFrame", category: "layout",
    source: { path: "lib/app-shell-bar", names: ["usePageOwnsBottomBar", "useEmbeddedPageBar", "usePageWantsFullFrame", "useEmbeddedFullFrame"] },
    what: "หน้าที่มีแถบล่างของตัวเองเปิดในแอปเดี่ยว /app/<key> → เชลล์ซ่อนแถบเมนูแอป (เมนูแอปอยู่ที่ ☰) · หน้าขอเต็มจอ → เชลล์ซ่อนหัวแอป + แถบเมนูแอป · หน้าอื่นอยู่ตามเดิม",
    when: "หน้ามือถือที่ทำแถบล่างของตัวเอง → usePageOwnsBottomBar(isPhone) · หน้าเต็มจอ → ใช้ FullscreenStage (เรียก usePageWantsFullFrame ให้เอง)",
    notWhen: "หน้าที่ไม่มีแถบล่างเอง (ไม่ต้องเรียก)",
  },
  {
    key: "gallery-columns", label: "มุมมองการ์ดกลาง (ขนาดการ์ด · Ctrl+ลูกกลิ้ง · โหลด/ว่าง/พลาด)", code: "GalleryColumns · CardGrid · CardViewBar · CardZoom · useCtrlWheel", category: "layout",
    source: { path: "components/gallery-columns" },
    what: "ปุ่มเลือกว่ามุมมองกริดจะโชว์กี่การ์ดต่อแถว สูงสุด 16 (จำค่าไว้แยกต่อหน้า) · จอแคบลดจำนวนเอง (การ์ดไม่เล็กกว่า 70px) · Ctrl + หมุนลูกกลิ้งบนกริดย่อ/ขยาย (เปิดเป็นค่าเริ่มต้น ผูก wheelRef ที่กริด) · {...compactAttr} + class GALLERY_LABEL = 12 ใบขึ้นไปซ่อนชื่อใต้การ์ด · thumbW(base) = ขนาดรูปย่อตามขนาดการ์ด · กริดที่ทำเองด้วย CSS var ใช้ galleryTemplate(cols, gap) · options GALLERY_COL_CHOICES มี 2 ต่อแถวสำหรับการ์ดใหญ่",
    when: "ทุกหน้าที่โชว์การ์ด/รูปเป็นกริด → CardGrid (กริด + สถานะ โหลด/ว่าง/พลาด + Ctrl+ลูกกลิ้ง) + CardViewBar (จำนวน · ปุ่มของหน้า · สลับการ์ด/ตาราง · ขนาด − N +) · ของกลางที่มีหลายกริด/ป๊อปอัป → CardZoom หรือ useGalleryColumns({ enabled: open }) · MiniTable ใส่ cardZoom · DataTable โหมดการ์ดได้เองทุกตาราง · ห้ามเขียน grid-template auto-fill เองในหน้า (2026-11-20) · ลองเล่นได้ที่ drawer หน้า /admin/plugins",
    notWhen: "ตารางแถว → DataTable / MiniTable · กระดานลากวางอิสระ → CanvasSketch · การ์ดสูงไม่เท่ากันแบบ masonry",
    doc: "gallery-columns.md",
  },
  {
    key: "info-hint", label: "ปุ่มคำอธิบายสั้น ๆ", code: "InfoHint", category: "layout",
    source: { path: "components/info-hint" },
    what: "ปุ่มเล็กข้างปุ่มหรือช่อง กดแล้วเด้งคำอธิบาย ไม่รกหน้าจอ",
    when: "อยากบอกว่าปุ่ม/ช่องนี้ทำอะไร",
  },
  {
    key: "copy-button", label: "ปุ่มคัดลอก", code: "CopyButton", category: "layout",
    source: { path: "components/copy-button" },
    what: "กดแล้วคัดลอกข้อความ โชว์เครื่องหมายถูกชั่วครู่ ไม่ไปโดนการกดแถว",
  },
  {
    key: "short-links", label: "ลิงก์สั้น (ย่อลิงก์)", code: "ShortLinksManager · useShortLinkMap · lib/short-links", category: "feature",
    source: { path: "components/short-links" },
    what: "ย่อลิงก์ยาวเป็น louismontini.co.th/go/xxxxx (เว็บร้านพาไปปลายทาง) · นับคลิกแยกที่มา Facebook/IG/LINE/TikTok/QR · แก้ปลายทางได้ลิงก์เดิมไม่เปลี่ยน · ใช้ลิงก์เดิมซ้ำ · ตั้งชื่อเองได้ · ปิด/ลบลงถังขยะ/กู้คืน · หน้าจัดการ /tasks/short-links",
    when: "งานไหนจะส่งลิงก์ให้ลูกค้า (แคปชั่นโพสต์ · LINE · ใบเสนอราคา · QR บนป้าย/ถุง) → ensureShortLinks / useShortLinkMap (lib/short-links-client) · ฝั่ง server ensureShortLinks (lib/short-links-db)",
    notWhen: "ห้ามทำตารางย่อลิงก์/redirect ของตัวเองในโมดูล · คลายลิงก์สั้นของคนอื่น (vt.tiktok/pin.it) เป็นอีกงาน ใช้ /api/social-embed",
    doc: "short-links.md",
  },
  {
    key: "qr-code", label: "รูป QR", code: "QrCode", category: "layout",
    source: { path: "components/qr-code" },
    what: "สร้างรูป QR จากลิงก์หรือรหัส (โหลดไลบรารีเฉพาะตอนใช้)",
  },
  {
    key: "platform-icon", label: "ไอคอนแพลตฟอร์มขายของ", code: "PlatformIcon", category: "layout",
    source: { path: "components/platform-icon" },
    what: "โลโก้ Shopee / Lazada / TikTok ฯลฯ ที่ถูกต้องทุกที่",
  },
  {
    key: "animated-icon", label: "ไอคอนเคลื่อนไหว", code: "AnimatedIcon", category: "layout",
    source: { path: "components/animated-icon" },
    what: "ไอคอนขยับจากไฟล์ Lottie / GIF ที่เก็บใน R2",
    notWhen: "เรียกผ่าน Icon กลาง (ค่า img:*.json) ไม่ต้องเรียกตรง",
  },
  {
    key: "result-burst", label: "แอนิเมชันบอกผล สำเร็จ/ไม่สำเร็จ", code: "ResultBurst", category: "layout",
    source: { path: "components/result-burst" },
    what: "วงกลมเด้ง + ขีดถูก/กากบาท/! + จุดกระจาย (สำเร็จ) / สั่น (ไม่สำเร็จ) ตอนโชว์หน้าผลลัพธ์ · resultTone(สำเร็จ, ไม่สำเร็จ) เลือกสีให้",
    when: "จบงานที่ส่งข้อมูลออกนอกระบบหรือทำหลายตัว (ลงสินค้า · ส่งขึ้นร้าน · นำเข้า) แล้วโชว์หน้าสรุปผล",
    notWhen: "แจ้งผลสั้น ๆ ทั่วไป (ใช้ toast) · ไอคอนเมนู/ปุ่ม (ใช้ Icon / AnimatedIcon)",
  },
  {
    key: "install-app", label: "ป๊อปติดตั้งแอป", code: "InstallApp", category: "layout",
    source: { path: "components/install-app" },
    what: "ป๊อปวิธีติดตั้งแอปลงเครื่อง เปิดจากเมนู ⋯ ของหน้าไหนก็ได้ (ข้างในใช้ปุ่มติดตั้งแอป)",
  },
  {
    key: "pwa-install-button", label: "ปุ่มติดตั้งแอป", code: "PwaInstallButton", category: "layout",
    source: { path: "components/pwa-install-button" },
    what: "ปุ่ม ติดตั้งแอปนี้ โชว์เมื่อเบราว์เซอร์รองรับ กดแล้วได้ไอคอนแอปบนเครื่อง",
  },
  {
    key: "help-guides", label: "คู่มือวิธีใช้งาน", code: "HelpGuides", category: "layout",
    source: { path: "components/help-guides" },
    what: "คู่มือที่ตั้งและแก้เองในเว็บได้ ไม่ต้องแก้โค้ด",
  },
  {
    key: "legacy-moved", label: "หน้าแจ้ง หน้านี้ย้ายไปแล้ว", code: "LegacyMovedNotice", category: "layout",
    source: { path: "components/legacy-moved" },
    what: "แทนหน้าระบบเก่าที่ปิดแล้ว บอกว่าไปใช้หน้าไหนแทน + ปุ่มพาไป (ข้อมูลเก่าไม่ลบ)",
    when: "ปิดหน้าเก่าที่คนอาจบุ๊กมาร์กไว้ เช่น ระบบจัดซื้อชุดเก่า (2026-11-07)",
  },

  // ตาราง / ปฏิทิน
  {
    key: "sortable-list", label: "ลากจัดลำดับรายการ", code: "SortableList", category: "table",
    source: { path: "components/sortable-list" },
    what: "ลากเรียงลำดับรายการในลิสต์ตั้งค่า (ประเภทงาน สถานะ ฟิลด์ ฯลฯ) · ลากที่หูจับ (handleProps) หรือกดค้างที่ตัวการ์ดแล้วลาก (holdProps — นิ้วค้าง ~0.35 วิ · เมาส์ลากได้เลย · คลิกเฉย ๆ ยังทำงาน) · แตะหูจับ ⠿ = เมนู ขึ้น/ลง/บนสุด/ล่างสุด (มือถือไม่ต้องลาก) · เลือกหลายรายการ (Ctrl/Shift+คลิกหูจับ หรือเมนู ☑) แล้วลาก/เมนู ย้ายพร้อมกัน (lib/reorder-many)",
    when: "ทุกที่ที่ให้คนเรียงลำดับเอง · การ์ดรูป/ไทล์ที่ควรกดค้างลากได้ทั้งใบ = holdProps",
  },
  {
    key: "line-item-columns", label: "จัดคอลัมน์ตารางบรรทัดเอกสาร", code: "LineColumnsManager", category: "table",
    source: { path: "components/line-item-columns" },
    what: "เลือกโชว์/ซ่อน ลากเรียง ตั้งชื่อคอลัมน์ ของตารางบรรทัดในใบเสนอ",
  },
  {
    key: "doc-calendar", label: "ปฏิทินเอกสาร", code: "DocCalendar", category: "table",
    source: { path: "components/doc-calendar" },
    what: "เอาเอกสารที่มีวันที่มาวางบนปฏิทินรายเดือน · compact = ปฏิทินย่อ (ช่องเตี้ย ชิปเลขเอกสาร 2 ใบ/วัน ใส่ใน dashboard ได้) · onPickDay กดวันเพื่อกรอง/เลือกวัน · onDropDay รับการ์ดที่ลากมาจากที่อื่นมาวางบนวัน (เช่น ลากการ์ดบอร์ดมาเลื่อนกำหนดส่ง) · listRows = ช่องวันเรียงงานเป็นรายการ รูปเล็ก+ชื่อ+แถบสี (+n กางดู · กดแถว = onPick · wrapItem ห่อแถวชี้แล้วรูปใหญ่) · actions = ปุ่มเสริมท้ายแถบเดือน (ปักหมุด/สรุป) · focusWeeks = ย่อโชว์ N สัปดาห์ (ปฏิทินปักหมุดค้างจอ)",
    notWhen: "ถ้าต้องมีกล่องงานยังไม่ลงวัน + ลากจัดตารางเต็มรูปแบบ ให้ใช้ ScheduleBoard",
  },
  {
    key: "schedule-board", label: "ปฏิทินลากวางตั้งวัน", code: "ScheduleBoard", category: "table",
    source: { path: "components/schedule-board" },
    what: "ปฏิทิน + กล่องยังไม่ลงวันที่ ลากการ์ดไปวางเพื่อตั้งวัน · มีในตัว: เดือน/สัปดาห์/รายการ · ค้นหา · ความแน่น · +N กดได้ · ป๊อปดูงาน (renderPopView) · เลือกหลายงานเลื่อนทั้งชุด · วันหยุดไทย · พิมพ์",
    notWhen: "ถ้าแค่โชว์เอกสารตามวัน ให้ใช้ DocCalendar",
  },

  // ช่องกรอก
  {
    key: "color-picker", label: "เลือกสี", code: "ColorPicker / ColorInput", category: "input",
    source: { path: "components/color-picker" },
    what: "แผงเลือกสีแบบลากได้ + ช่องรหัสสี ใช้ง่ายกว่าช่องสีของเบราว์เซอร์ · สีที่ใช้ล่าสุด 8 สี (จำในเครื่อง) · 💧 ดูดสีจากจอ (Chrome/Edge)",
  },
  {
    key: "text-style-control", label: "ตั้งค่าตัวอักษร", code: "TextStyleControl · lib/text-style", category: "input",
    source: { path: "components/text-style-control" },
    what: "แถบไอคอนแถวเดียว กดแล้วมีเมนูให้เลือก: ฟอนต์ · ขนาด 6-25 px · หนา/เอียง/ขีดเส้นใต้/ขีดฆ่า · สีตัวอักษรทุกสี · ไฮไลต์ทุกสี · จัดซ้าย/กลาง/ขวา · bullets/เลข · ปุ่มค่าเริ่มต้น (สีใช้ตัวเลือกสีกลาง มีสีล่าสุด+ดูดสี)",
    when: "ทุกที่ที่ให้ผู้ใช้ตั้งหน้าตาตัวอักษร เช่น ตั้งค่าการ์ดบนกระดาน · ป้ายประเภทงาน · ส่งรายการฟอนต์เองได้ ซ่อนส่วนที่ไม่ใช้ได้ (hide) · บอกส่วนที่ทำไม่ได้ (notes)",
    notWhen: "ช่องพิมพ์ข้อความยาวแบบมีหัวข้อ/รูป (เอกสาร) ให้ใช้ตัวแก้ข้อความแบบจัดรูปแบบ · ถ้าแค่เลือกสีอย่างเดียว ใช้ ColorInput",
    doc: "text-style-control.md",
  },
  {
    key: "bilingual-field", label: "ช่องกรอก 2 ภาษา", code: "BilingualField", category: "input",
    source: { path: "components/bilingual-field" },
    what: "กรอกไทย/อังกฤษ แบบสลับภาษาทั้งแผง (ข้อความที่ลูกค้าเห็นบนเว็บร้าน)",
    doc: "bilingual-content.md",
  },
  {
    key: "translation-table", label: "ตารางคำแปล ไทย | อังกฤษ", code: "TranslationTable", category: "input",
    source: { path: "components/translation-table" },
    what: "แปลข้อมูลซ้อนหลายชั้นทีเดียวเป็นตาราง (เมนู หมวด คอลเลกชันของเว็บร้าน)",
  },
  {
    key: "range-input", label: "แถบเลื่อน + ช่องตัวเลข", code: "RangeInput", category: "input",
    source: { path: "components/range-input" },
    what: "ปรับตัวเลขด้วยการลากหรือพิมพ์ก็ได้",
  },
  {
    key: "wheel-select", label: "กล่องเลือกหมุนล้อเมาส์", code: "WheelSelect", category: "input",
    source: { path: "components/wheel-select" },
    what: "กล่องเล็ก + ▴▾ หมุนล้อเมาส์เพื่อเปลี่ยนค่า",
    doc: "wheel-select.md",
  },
  {
    key: "toggle-switch", label: "สวิตช์เปิด/ปิด", code: "ToggleSwitch", category: "input",
    source: { path: "components/toggle-switch" },
    what: "สวิตช์เปิด/ปิด (เขียว = เปิด) แทนการเขียนสวิตช์เองแต่ละหน้า",
    doc: "toggle-switch.md",
  },
  {
    key: "font-select", label: "เลือกฟอนต์", code: "FontSelect", category: "input",
    source: { path: "components/font-select" },
    what: "เลือกฟอนต์โดยเห็นหน้าตาตัวอักษรจริง",
    doc: "font-select.md",
  },
  {
    key: "rich-text", label: "กล่องข้อความจัดรูปแบบ", code: "RichTextEditor", category: "input",
    source: { path: "components/rich-text" },
    what: "พิมพ์ข้อความมีหัวข้อ ตัวหนา สี ตาราง รูป (เก็บเป็น HTML)",
  },
  {
    key: "text-format-bar", label: "แถบจัดข้อความตอนพิมพ์", code: "TextFormatBar", category: "input",
    source: { path: "components/text-format-bar", names: ["TextFormatBar", "domTextAdapter", "useTextFormatTarget", "applyTextShortcut"] },
    what: "แถบตัวหนา/เอียง/ขีด/ขนาด/สี/ไฮไลต์/จัดชิด/รายการ/ลิงก์ ที่ขึ้นมาแทนเครื่องมือเดิมตอนกำลังพิมพ์หรือคลุมดำ · ปุ่มลัด Ctrl+B/I/U/K (แป้นไทยได้) · มือถือติดเหนือแป้นพิมพ์",
    when: "ช่องพิมพ์ข้อความจัดรูปแบบแบบ contentEditable (กระดาน flowchart: กล่อง · ข้อในรายการงาน · ชื่อการ์ด) · ตัวแก้แบบอื่นส่ง adapter ของตัวเอง",
    notWhen: "ช่องกรอกข้อความล้วน (input/textarea) · กล่องข้อความยาวที่มีตาราง/รูป → RichTextEditor",
    doc: "text-format-bar.md",
  },
  {
    key: "inline-edit", label: "โชว์ค่าก่อน กดถึงแก้", code: "InlineEdit", category: "input",
    source: { path: "components/inline-edit" },
    what: "โชว์ค่าเป็นข้อความสะอาด กดแล้วค่อยกลายเป็นช่องกรอก กันพิมพ์ทับเผลอ · InlineField (2026-11-16) = แบบเดียวกันแต่ตัวกรอกเป็นอะไรก็ได้ (วัน+เวลา · เลือกคน · แท็ก · ตัวเลือก): มีค่าแล้วล็อก ดับเบิลคลิก/แตะ 2 ครั้งถึงแก้ · ว่างกดใส่ได้เลย",
    when: "หน้าที่มีช่องกรอกเรียงกันเยอะ ๆ · ป๊อปรายละเอียดที่อยากให้ช่องที่กรอกแล้วล็อกทีละช่อง (ใช้แล้วที่ ป๊อปงานในแผนงาน)",
    notWhen: "ล็อกทั้งฟอร์มแล้วดับเบิลคลิกปลดทั้งฟอร์ม → DblClickToEdit",
  },
  {
    key: "dbl-click-edit", label: "ดับเบิลคลิกช่องที่ล็อกเพื่อแก้ทั้งฟอร์ม", code: "DblClickToEdit", category: "input",
    source: { path: "components/dbl-click-edit", names: ["DblClickToEdit"] },
    what: "ฟอร์มที่เปิดมาแบบดูอย่างเดียว ดับเบิลคลิก (หรือแตะ 2 ครั้ง) ช่องไหนก็ได้ = เข้าโหมดแก้ไขทั้งฟอร์ม แล้วเคอร์เซอร์ไปรอที่ช่องนั้น ไม่ต้องมีปุ่ม \"แก้ไข\"",
    when: "ป๊อปอัป/หน้ารายละเอียดที่มีโหมดดู ↔ โหมดแก้ (เช่น ใบงานออกแบบ)",
    notWhen: "แก้ทีละช่องแล้วบันทึกทันที ใช้ InlineEdit · ตารางรายการใช้ LineItemsGrid readonly + onRequestEdit",
    doc: "dbl-click-edit.md",
  },
  {
    key: "credit-term-input", label: "ช่องเครดิต (วันจ่าย)", code: "PurchaseCreditTermInput", category: "input",
    source: { path: "components/purchase-credit-term-input" },
    what: "ตั้งเครดิตร้าน/ลูกค้า เช่น จ่ายทันที สิ้นเดือน หรือ N วัน (กติกาคิดวันอยู่ที่ศูนย์กลาง)",
  },
  {
    key: "lead-time-input", label: "ช่องระยะเวลาส่งของ", code: "PurchaseLeadTimeInput", category: "input",
    source: { path: "components/purchase-lead-time-input" },
    what: "ตั้งว่าร้านส่งของกี่วัน นับจากวันสั่งหรือหลังจ่ายเงิน",
  },

  // เลือกข้อมูล
  {
    key: "supplier-wizard", label: "เพิ่มร้าน / คู่ค้าใหม่", code: "SupplierWizard", category: "pick",
    source: { path: "components/supplier-wizard" },
    what: "ฟอร์มเพิ่มคู่ค้าหลายหน้า (กรอกแค่ชื่อก็บันทึกได้) เข้าทะเบียนคู่ค้าจริง",
    when: "ปุ่ม + เพิ่มร้านใหม่ ข้างตัวเลือกร้าน",
  },
  {
    key: "brand-select", label: "เลือกแบรนด์", code: "BrandSelect", category: "pick",
    source: { path: "components/brand-select" },
    what: "ช่องเลือกแบรนด์จากทะเบียนแบรนด์",
    doc: "brand-select.md",
  },
  {
    key: "field-chips-picker", label: "เลือกหลายฟิลด์แบบชิป", code: "FieldChipsPicker", category: "pick",
    source: { path: "components/field-chips-picker" },
    what: "เลือกหลายฟิลด์ โชว์ที่เลือกเป็นชิป + ป๊อปค้นหา/จัดกลุ่ม · groupNav = รายชื่อหมวดด้านซ้าย (ฟิลด์เยอะหลายหมวด)",
  },
  {
    key: "table-column-select", label: "เลือกคอลัมน์จากตารางปลายทาง", code: "TableColumnSelect", category: "pick",
    source: { path: "components/table-column-select" },
    what: "ตอนสร้างช่องอ้างอิง เลือกว่าจะโชว์คอลัมน์ไหนของตารางปลายทาง (เลือกจากของจริง ไม่ต้องพิมพ์)",
  },
  {
    key: "icon-field", label: "ช่องเลือกไอคอน", code: "IconField", category: "pick",
    source: { path: "components/icon/icon-field" },
    what: "ช่องเลือกไอคอนเส้นกลางแบบดรอปดาวน์ติดช่อง: ค้นหาไทย/อังกฤษ · แนะนำจากชื่อ · ล่าสุด/ยอดนิยม · เลือกสีเส้น · ดูทั้งหมดแบ่งหมวด · ค่าอีโมจิเก่าโชว์ได้+แนะนำไอคอนใกล้เคียง · มีย้อนกลับ",
    when: "ทุกช่องที่ให้ผู้ใช้ตั้งไอคอน (แอป · เมนู · หมวด · ประเภท · ป้าย · การ์ด) — ค่าที่ได้วาดด้วย Icon",
    notWhen: "ห้ามทำช่องพิมพ์อีโมจิเอง · เว็บร้านใช้ SiteIconPicker (ชุดไอคอนร้าน) · ไอคอนติดตั้งแอป (PWA) ต้องเป็นรูป ใช้ ImageInput",
    doc: "icon-system.md",
    sameJob: "icon-pick", primary: true,
  },
  {
    key: "icon-picker-modal", label: "ป๊อปเลือกไอคอน (ทั้งหมด)", code: "IconPickerModal", category: "pick",
    source: { path: "components/icon/icon-picker-modal" },
    what: "ป๊อปใหญ่เลือกไอคอนเส้นทั้งชุดแบ่งหมวด + อัปโหลดไอคอนของฉัน + แถบสี — ปุ่ม \"ดูทั้งหมด\" ของ IconField เปิดตัวนี้",
    when: "หน้าตั้งค่าไอคอนทั้งระบบ (/admin/icons) หรือที่ต้องอัปโหลดไอคอนของฉันด้วย",
    notWhen: "ช่องไอคอนทั่วไปในฟอร์ม ให้ใช้ IconField (มีป๊อปนี้ให้อยู่แล้ว)",
    doc: "icon-system.md",
    sameJob: "icon-pick",
  },
  {
    key: "icon-picker", label: "เลือกไอคอน (ชื่อเดิม)", code: "IconPicker", category: "pick",
    source: { path: "components/icon-picker" },
    what: "ชื่อเดิมของช่องเลือกไอคอน (เคยเป็นอีโมจิ) — ตอนนี้ส่งต่อไป IconField ทั้งหมด โค้ดเดิมได้ไอคอนเส้นอัตโนมัติ",
    notWhen: "หน้าใหม่ให้ใช้ IconField ตรง ๆ",
    sameJob: "icon-pick", replacedBy: "icon-field",
  },
  {
    key: "site-icon-picker", label: "เลือกไอคอนเว็บร้าน", code: "SiteIconPicker", category: "pick",
    source: { path: "components/site-icon-picker" },
    what: "เลือก/อัปโหลดไอคอนในหน้าจัดการเว็บร้าน (ไอคอนเส้นสีตามธีมร้าน)",
    doc: "site-icons.md",
  },
  {
    key: "central-category-picker", label: "เลือกหมวดกลางสำหรับลงขาย", code: "CentralCategoryPicker", category: "pick",
    source: { path: "components/central-category-picker" },
    what: "ค้นหาหมวดลงขาย + ปุ่มเพิ่มหมวดใหม่ในตัว",
    note: "ใส่ webParentId (Parent SKU) → ใต้ช่องมีกล่อง 🌐 หมวดบนเว็บ แก้หมวดเว็บแต่ละร้านได้ (components/parent-web-categories) · ใช้ในฟอร์ม/หน้าดู Parent SKU + แท็บแพลตฟอร์ม",
  },
  {
    key: "company-filter", label: "เลือกดูทีละบริษัท", code: "CompanyFilter", category: "pick",
    source: { path: "components/company-filter" },
    what: "สลับดูข้อมูลทีละบริษัทในกลุ่ม",
  },
  {
    key: "month-nav", label: "เลือกเดือน", code: "MonthNav", category: "pick",
    source: { path: "components/month-nav" },
    what: "ตัวเลือก เดือน/ปี + ปุ่มเดือนนี้ ของหน้ารายงานรายเดือน",
  },
  {
    key: "mo-group-picker", label: "เลือกชุดใบสั่งงาน", code: "MoGroupOptions / useMoGroups", category: "pick",
    source: { path: "components/mo-group-picker" },
    what: "รายการชุด (กลุ่มใบสั่งงาน) แหล่งเดียวของทุกหน้า",
  },
  {
    key: "bank-picker", label: "เลือกธนาคาร", code: "BankPicker", category: "pick",
    source: { path: "components/bank-picker" },
    what: "ค้นหาธนาคาร + เพิ่มธนาคารใหม่ได้",
    when: "ทุกช่องชื่อธนาคาร (บัญชีพนักงาน บัญชีร้าน บิลโอน)",
  },
  {
    key: "source-doc-picker", label: "ดึงจากเอกสารต้นทาง", code: "SourceDocPickerModal", category: "pick",
    source: { path: "components/source-doc-picker" },
    what: "ติ๊กเลือกใบเสนอราคาหรือใบสั่งผลิตหลายใบ เพื่อดึงเข้าเอกสารปลายทาง",
  },
  {
    key: "tag-filter", label: "กรองตามแท็ก", code: "TagGroupFilter", category: "pick",
    source: { path: "components/tag-filter" },
    what: "ป๊อปกรองแท็กสินค้า แบ่งตามกลุ่ม ติ๊กได้หลายอัน",
  },
  {
    key: "sku-tag-browser", label: "เลือกดูสินค้าตามกลุ่มแท็ก", code: "SkuTagBrowser", category: "pick",
    source: { path: "components/sku-tag-browser" },
    what: "ไล่ดูสินค้าจากกลุ่มหลัก → กลุ่มย่อย → แท็ก (มี Taobao และขอเพิ่มวัตถุดิบในตัว)",
  },
  {
    key: "tag-columns", label: "เลือกแท็กแบบหมวดซ้าย·แท็กขวา", code: "TagColumns", category: "pick",
    source: { path: "components/tag-columns" },
    what: "แสดงแท็กสินค้าแบบเมนูหน้าเว็บ: หมวดอยู่ซ้าย แท็กในหมวดอยู่ขวา (หมวดย่อยเป็นหัวข้อคั่น) · ค้นหาข้ามทุกหมวด · จำหมวดล่าสุด · มือถือแตะหมวดแล้วเข้าไปดูแท็ก",
    when: "ให้ผู้ใช้เลือกแท็ก (ตัวเดียวหรือหลายตัว) — ผู้เรียกส่งแถวแท็ก (renderTag) มาเอง เช่น ป๊อปเลือกแท็กในฟอร์มสินค้า · ช่องประเภทในป๊อปเพิ่ม SKU",
    notWhen: "กรองตารางด้วยแท็ก ใช้ tag-filter · ไล่ดูสินค้าตามแท็ก ใช้ sku-tag-browser",
  },
  {
    key: "tag-suggest", label: "ระบบช่วยเดาแท็ก", code: "TagSuggestModal", category: "feature",
    source: { path: "components/tag-suggest" },
    what: "เดาแท็กให้สินค้าที่ยังไม่มี จากแบรนด์/หมวดของ Parent และรหัส/คำในชื่อ แล้วให้คนยืนยันทีละกลุ่มก่อนบันทึก (ไม่ใช้ AI)",
    when: "อยากเติมแท็กให้สินค้าจำนวนมากที่ยังว่าง · เพิ่มกฎคำ → แท็ก ที่ lib/tag-suggest-rules",
    notWhen: "ใส่แท็กชุดเดียวกันให้สินค้าที่เลือกเอง ให้ใช้ตะกร้าในหน้า Tags Manager · แท็กย่อยอะไหล่ใน Design Library ใช้ป๊อปของ Design Library (คำอะไหล่ชุดเดียวกัน)",
    doc: "tag-suggest.md",
  },
  {
    key: "marketing-sku-picker", label: "ป๊อปเลือกรุ่นแบบการ์ดรูป", code: "MarketingSkuPickerModal", category: "pick",
    source: { path: "components/marketing-sku-picker-modal" },
    what: "เลือกรุ่นจากการ์ดรูป แยกแบรนด์ กรองป้าย (แบบหน้า SKU การตลาด) · หลายรุ่น หรือ single = รุ่นเดียว + below = ส่วนเสริมใต้ตาราง (เช่น ติ๊ก SKU ลูก · ใช้ที่เชื่อมอัลบั้ม SAMPLE)",
    notWhen: "เลือกรุ่นเดียวในช่องฟอร์ม ให้ใช้ ParentSkuPicker",
  },

  // รูปและไฟล์
  {
    key: "hover-image", label: "ชี้รูปแล้วเห็นรูปใหญ่", code: "HoverImage", category: "file",
    source: { path: "components/hover-image" },
    what: "รูปย่อ ชี้เมาส์แล้วรูปใหญ่ลอยทับทุกอย่าง (ไม่โดนกรอบตัด) มือถือแตะได้ · หมุนล้อเมาส์ = ซูมรูปลอย · หน่วงก่อนโชว์ตั้งต่อคนที่เมนูโปรไฟล์ (lib/hover-delay) หรือ prop delay",
    when: "รูปในตาราง/การ์ดทุกที่",
  },
  {
    key: "hover-card", label: "ชี้การ์ดแล้วเห็นรายละเอียด", code: "HoverCardWrap", category: "file",
    source: { path: "components/hover-card" },
    what: "ชี้ที่การ์ดค้างแล้วเห็นรูปใหญ่ + รายละเอียดข้างการ์ด",
    notWhen: "ถ้าแค่อยากขยายรูป ให้ใช้ HoverImage",
    doc: "hover-card.md",
  },
  {
    key: "image-lightbox", label: "ดูรูปเต็มจอ", code: "ImageLightbox", category: "file",
    source: { path: "components/image-lightbox" },
    what: "กดรูปแล้วขยายเต็มจอ เลื่อนดูรูปถัดไป ซูม ปัดนิ้วได้ · เสริมได้ (ไม่บังคับ): ชิปกลุ่ม (groups) + แถบรูปเล็ก (thumbnails)",
    note: "ImageGallery ใน components/image-input ยังมีจอเต็มของตัวเอง ไม่ได้ใช้ตัวนี้",
  },
  {
    key: "grouped-image-viewer", label: "ดูรูปแบ่งกลุ่ม (ดูอย่างเดียว)", code: "GroupedImageViewer", category: "file",
    source: { path: "components/grouped-image-viewer" },
    what: "ป๊อปดูรูปทั้งชุดแบบดูอย่างเดียว แบ่งกลุ่ม → เจ้าของรูป (เช่น Parent · SKU แต่ละสี · Description · คอนเทนต์) · ชิปกรองกลุ่ม · ตัวที่ยังไม่มีรูปขึ้นเตือน · กดรูป = เต็มจอพร้อมชิปกลุ่ม + แถบรูปเล็ก",
    when: "ให้คนตรวจงาน/ดูรูปทั้งชุดของเรื่องหนึ่งเร็ว ๆ โดยไม่แก้ (ตอนนี้: ลิ้นชักงาน Task Manager ปุ่ม ดูรูป)",
    notWhen: "จัดการรูปสินค้า (เรียง/ลบ/ตั้งปก) ให้ใช้ ProductImageGallery · เลือกรูปไปใช้ต่อ ให้ใช้ AssetPicker · รูปชุดเดียวไม่ต้องแบ่งกลุ่ม ใช้ ImageLightbox ตรง ๆ",
    doc: "grouped-image-viewer.md",
  },
  {
    key: "image-crop-box", label: "เลือกส่วนที่เห็นของรูป", code: "ImageCropBox", category: "file",
    source: { path: "components/image-crop-box" },
    what: "ลากกรอบสัดส่วนคงที่บนรูป เลือกส่วนที่จะโชว์จริง",
    notWhen: "อยากได้ไฟล์รูปใหม่เฉพาะส่วน (ตัดทิ้งจริง) ให้ใช้ ImageCropPicker / ImageFreeCropModal",
  },
  {
    key: "image-crop-picker", label: "ครอปรูปเป็นไฟล์ใหม่ (สัดส่วนคงที่ / กรอบอิสระ + หมุน)", code: "ImageCropPicker · ImageFreeCropModal", category: "file",
    source: { path: "components/image-crop-picker", names: ["ImageCropPicker", "ImageFreeCropModal", "cropImageSource", "rotateImageSource"] },
    what: "ImageCropPicker = เลือกรูปจากกลุ่ม (เช่น รูป SKU) แล้วตัดกรอบสัดส่วนคงที่ อัปเป็นไฟล์ใหม่ · ImageFreeCropModal = รูปเดียว (ไฟล์ในเครื่องหรือรูป r2) กรอบสัดส่วนอะไรก็ได้ + หมุน 90° คืนเป็น Blob ให้ผู้เรียกอัปเอง (บอกกรอบ/การหมุน เพื่อเลื่อนจุดบนรูปตามได้)",
    when: "ต้องตัดรูปทิ้งจริงก่อนเก็บ เช่น ครอปรูปแผงผ้าตอนเพิ่มแผ่น Swatch · ตัดลายจากรูปสินค้าไปเป็นจุดสี",
    notWhen: "แค่เลื่อน/ซูมการแสดงผลของรูปเดิม (ไม่สร้างไฟล์ใหม่) ให้ใช้ ImageCropBox · วาด/เขียนบนรูป ให้ใช้ ImageMarkup",
    doc: "image-crop-picker.md",
  },
  {
    key: "zoom-box", label: "กล่องซูมรูป (Ctrl + ลูกกลิ้ง)", code: "ZoomBox · ZoomControls", category: "file",
    source: { path: "components/zoom-box", names: ["ZoomBox", "ZoomControls"] },
    what: "กล่องดูรูป/เนื้อหาที่ซูมได้: Ctrl (⌘) + หมุนลูกกลิ้ง = ซูมตรงจุดที่ชี้ · หมุนเฉย ๆ = เลื่อน · มือถือสองนิ้ว = ซูม/เลื่อน · dragPan = ลูกกลิ้ง/Space ค้างแล้วลาก = เลื่อน · 100% = พอดีกล่อง (ส่ง aspect ของรูป) · ปุ่ม − % + แยกวางได้ · ข้างในใช้กรอบ % (ImageRegions) ได้ตรงทุกระดับซูม",
    when: "รูปที่ต้องดูรายละเอียด/ตีกรอบชิ้นเล็ก ๆ เช่น แผงผ้า Swatch (ป๊อปเพิ่มแผ่น · ตั้งค่า · ดู) · ครอปกรอบอิสระ · ป๊อปแกะจากรูป (ระบายยางลบ + ซูม)",
    notWhen: "ดูรูปเต็มจอเลื่อนรูปถัดไป ให้ใช้ ImageLightbox · วาด/เขียนบนรูป ให้ใช้ ImageMarkup (มีซูมของตัวเอง) · เลื่อน/ซูมการแสดงผลที่ต้องจำค่าไว้ ให้ใช้ ImageCropBox",
    doc: "zoom-box.md",
  },
  {
    key: "video-thumb", label: "ภาพย่อวิดีโอ", code: "VideoThumb", category: "file",
    source: { path: "components/video-thumb" },
    what: "ภาพย่อของวิดีโอในคลังและช่องวิดีโอ",
  },
  {
    key: "file-ref", label: "เปิดดูไฟล์จากที่อยู่กลาง", code: "FileRefLink", category: "file",
    source: { path: "components/file-ref" },
    what: "เปิดไฟล์ที่เก็บไว้ไม่ว่าอยู่ R2 หรือ Supabase ส่วนตัว ด้วยรูปแบบที่อยู่เดียว (useFileRefUrls · useFileRefResolver · fetchFileRefBlob)",
  },
  {
    key: "upload-permission", label: "เช็กสิทธิ์อัปโหลดไฟล์", code: "useFileUploadAccess", category: "file",
    source: { path: "components/upload-permission" },
    what: "บอกว่าคนนี้อัปโหลดได้ไหม (สิทธิ์ files.upload) + ข้อความเมื่อไม่ได้",
    when: "ช่องอัปโหลดใหม่ทุกช่อง",
  },
  {
    key: "product-image-router", label: "จัดรูปหลายโฟลเดอร์ลงช่องรูปสินค้า", code: "ProductImageRouter", category: "file",
    source: { path: "components/product-image-router" },
    what: "ลากหลายโฟลเดอร์ ชื่อโฟลเดอร์ = รหัสสี แล้วระบบจัดรูปลงสินค้าให้",
    doc: "product-image-router.md",
  },
  {
    key: "parent-description-images", label: "รูป Description ของรุ่น", code: "ParentDescriptionImages", category: "file",
    source: { path: "components/parent-description-images" },
    what: "อัปรูปบรรยายสินค้าแบบมีลำดับ เข้าคลังกลางแล้วผูกกับรุ่น",
  },

  // แจ้งเตือน
  {
    key: "line-console", label: "ศูนย์จัดการ LINE", code: "LineConsole", category: "notify",
    source: { path: "components/line-console" },
    what: "ตั้งโทเคนบอท กลุ่มปลายทาง เปิด/ปิดการแจ้งต่อเหตุการณ์ ของทุกระบบในที่เดียว · ป๊อป LineConsole + เนื้อหา LineConsoleBody (หน้าเต็ม /admin/line ใช้ตัวเดียวกัน)",
    when: "อยากให้แอดมินตั้งค่าไลน์จากหน้าไหน → ลิงก์ไป /admin/line?tab=… หรือเปิดป๊อป LineConsole · ห้ามทำหน้าตั้งค่าไลน์ตัวที่ 2",
    notWhen: "การส่งข้อความจริงให้ผ่าน lib/line-send",
  },

  // ระบบ
  {
    key: "activity-feed", label: "ไทม์ไลน์ประวัติ", code: "ActivityFeed", category: "system",
    source: { path: "components/activity-feed" },
    what: "โชว์ประวัติว่าใครทำอะไร เปลี่ยนจากอะไรเป็นอะไร แบบไทม์ไลน์ · ลิ้นชักประวัติรายการ (RecordHistoryDrawer) · ฝังในป๊อป (RecordHistoryInline)",
    when: "กล่องประวัติของรายการ หรือหน้าประวัติทั้งระบบ",
    doc: "audit-log.md",
  },

  // สถานะหน้าจอ
  {
    key: "po-pay-chip", label: "ป้ายสถานะจ่ายเงินใบสั่งซื้อ", code: "PoPayChip", category: "state",
    source: { path: "components/po-pay-chip" },
    what: "ป้ายสีบอกว่าใบสั่งซื้อจ่ายแล้วหรือยัง เลยกำหนดไหม (กติกาอยู่ lib/po-pay-state)",
  },

  // พิมพ์
  {
    key: "wo-print-columns", label: "ตั้งค่าตารางใบสั่งงานผลิต", code: "useWoPrintColumns", category: "print",
    source: { path: "components/wo-print-columns" },
    what: "เลือกคอลัมน์ ความกว้าง ช่องรูป ของใบสั่งงานผลิตตอนพิมพ์ (ค่ากลางของระบบ)",
  },
  {
    key: "pending-data-report", label: "รายงานรายการค้าง", code: "PendingDataReport", category: "print",
    source: { path: "components/pending-data-report" },
    what: "รายงานข้อมูลที่ยังกรอกไม่ครบ ใช้ทั้งแดชบอร์ดจัดซื้อและผลิต (พิมพ์ได้)",
  },

  // ชิ้นงานธุรกิจ
  {
    key: "po-detail-modal", label: "ป๊อปรายละเอียดใบสั่งซื้อ", code: "PoDetailModal", category: "feature",
    source: { path: "components/po-detail-modal" },
    what: "ดู/แก้ใบสั่งซื้อ 1 ใบ พร้อมภาษี หลักฐาน สถานะจ่าย",
    when: "ทุกหน้าที่กดเปิดใบสั่งซื้อ",
  },
  {
    key: "gr-detail-modal", label: "ป๊อปรายละเอียดใบรับสินค้า", code: "GrDetailModal", category: "feature",
    source: { path: "components/gr-detail-modal" },
    what: "ดู/แก้ใบรับสินค้า 1 ใบ รายการที่รับ ของเสีย ไฟล์แนบ",
  },
  {
    key: "receive-line-modal", label: "รับของทีละบรรทัด", code: "ReceiveLineModal", category: "feature",
    source: { path: "components/receive-line-modal" },
    what: "รับของเข้าทีละบรรทัดของใบสั่งซื้อ",
  },
  {
    key: "sku-supplier-list", label: "ราคาหลายร้านต่อสินค้า", code: "SkuSupplierList", category: "feature",
    source: { path: "components/sku-supplier-list" },
    what: "1 สินค้ามีหลายร้าน แต่ละร้านมีราคา ตั้งร้านหลักได้ 1 ร้าน",
  },
  {
    key: "mo-status-modal", label: "ป๊อปสถานะงานผลิต", code: "MoStatusModal", category: "feature",
    source: { path: "components/mo-status-modal" },
    what: "สถานะ 9 ขั้นของใบสั่งผลิต 1 ใบ + รายละเอียดแต่ละขั้น",
  },
  {
    key: "mo-material-progress", label: "ความคืบหน้าซื้อวัตถุดิบของใบสั่งผลิต", code: "MoMaterialProgress", category: "feature",
    source: { path: "components/mo-material-progress" },
    what: "วัตถุดิบของใบสั่งผลิตซื้อแล้ว/มาถึงแล้วกี่รายการ",
  },
  {
    key: "work-instruction", label: "แผงรายละเอียดสั่งงาน", code: "WorkInstructionPanel", category: "feature",
    source: { path: "components/work-instruction" },
    what: "รวมข้อมูลสั่งงานจากสินค้าและรุ่น + วิธีทำ ในแผงเดียว",
  },
  {
    key: "bom-editor-modal", label: "เปิดตัวทำสูตร (BOM) เป็นป๊อป", code: "BomEditorModal", category: "feature",
    source: { path: "components/bom-editor-modal" },
    what: "เปิดหน้าทำสูตรตัวจริงเป็นป๊อปจากหน้าไหนก็ได้",
  },
  {
    key: "bom-change-request", label: "ขอเพิ่ม/แก้สูตร", code: "BomChangeRequest", category: "feature",
    source: { path: "components/bom-change-request" },
    what: "หน้างานขอแก้สูตร โดยไม่แตะสูตรจริงจนกว่าจะอนุมัติ",
  },
  {
    key: "material-request", label: "ขอเพิ่มวัตถุดิบ", code: "MaterialRequestForm", category: "feature",
    source: { path: "components/material-request" },
    what: "พนักงานกรอกเท่าที่รู้ → รออนุมัติ → อนุมัติแล้วกลายเป็นสินค้าจริง",
  },
  {
    key: "order-batch-entry", label: "ลงออเดอร์ทีละหลายรายการ", code: "OrderBatchEntryModal", category: "feature",
    source: { path: "components/order-batch-entry" },
    what: "ลงออเดอร์ลูกค้าหลายรายการพร้อมกัน วางจาก Excel ได้ + จับชุด",
    doc: "order-batch-entry.md",
  },
  {
    key: "delete-draft-doc", label: "ปุ่มลบใบร่างเอกสารขาย", code: "DeleteDraftButton", category: "feature",
    source: { path: "components/delete-draft-doc" },
    what: "ลบใบเสนอราคา/ใบขาย/ใบวางบิลที่ยังเป็นร่าง พร้อมหน้าต่างยืนยัน",
  },
  {
    key: "design-sheet-detail", label: "ใบงานออกแบบ (ทั้งชุด)", code: "DesignSheetDetail", category: "feature",
    source: { path: "components/design-sheet-detail" },
    what: "ป๊อป/หน้าใบงานออกแบบ: ข้อมูล รูป สเปก ตีราคา ส่งงาน",
  },
  {
    key: "design-sheet-present", label: "ใบนำเสนอ A4 ของใบงานออกแบบ", code: "DesignSheetPresentPanel", category: "feature",
    source: { path: "components/design-sheet-present" },
    what: "เลือกรูป + แม่แบบ แล้วได้ใบนำเสนอ A4",
    doc: "design-sheet-present.md",
  },
  {
    key: "campaign-board-send", label: "ส่งใบงานขึ้นกระดานแคมเปญ", code: "CampaignBoardSend", category: "feature",
    source: { path: "components/campaign-board-send" },
    what: "ส่งใบงานออกแบบไปวางบนกระดานวางแผนของแคมเปญ",
  },
  {
    key: "canvas-sketch", label: "กระดานวาด", code: "CanvasSketch", category: "feature",
    source: { path: "components/canvas-sketch" },
    what: "กระดานแบบ miro วางรูป กล่อง ลูกศร ข้อความ วาดอิสระ · มีการ์ดโฟลเดอร์ (folder-card) ดับเบิลคลิกเปิดโฟลเดอร์ในเครื่อง",
    when: "งานที่ต้องวาดมือ แปะรูป วางการ์ดสินค้า/งาน/คอนเทนต์ หรือจัดโซนอิสระ (กระดานแคมเปญ · ใบงานออกแบบ · บอร์ดจ่ายงาน · กระดานอ้างอิงของงาน TaskReferenceBoard)",
    notWhen: "ผังขั้นตอน/ผังตัดสินใจแบบกล่องต่อเส้น → ใช้กระดาน flowchart (FlowchartBoard)",
    doc: "canvas-sketch.md", sameJob: "drawing-board", primary: true,
  },
  {
    key: "canvas-cards", label: "ชุดการ์ดบนกระดาน (การ์ดจากระบบอื่น)", code: "useCardKit", category: "feature",
    source: { path: "components/canvas-cards" },
    what: "ปุ่ม \"เพิ่มการ์ด\" + ป๊อปเลือก + ป๊อปเปิดดูเมื่อดับเบิลคลิก + ซิงค์การ์ดสด ของการ์ด SKU · Parent SKU · SKU การตลาด · งาน (Task) · คอนเทนต์ · เทรนด์ · ใบงานออกแบบ (เปิดป๊อปเดียวกับ Design Dashboard) · รูปจากคลัง · โฟลเดอร์ · ตารางคำนวณ · โซน (กรอบ) — ใช้คู่กับกระดานวาด (CanvasSketch) · + ปุ่ม \"แตกเช็กลิสต์\" (useChecklistExplode): เลือกการ์ดที่มีเช็กลิสต์ (งานในแผน · ใบงานออกแบบ · งาน) → กล่องรายการข้างการ์ด ติ๊ก/เพิ่มข้อได้ · การ์ดชนิดใหม่ที่มีเช็กลิสต์ เพิ่มที่ CHECKLIST_SOURCES (checklist-box.ts)",
    when: "กระดานที่อยากวางการ์ดจากระบบอื่น — ใช้แล้วที่ กระดานแคมเปญ + กระดานแผนงานทีม (ยกมาจากกระดานแคมเปญ 2026-11-15)",
    notWhen: "การ์ดเฉพาะของโมดูลตัวเอง (เช่น การ์ดงานในแผน · การ์ดบอร์ดจ่ายงาน) → ทำในโมดูลนั้นแล้วจัดการดับเบิลคลิกเองเมื่อ onCardOpen คืน false · กระดานแบบผังกล่องต่อเส้น → FlowchartBoard",
    doc: "canvas-sketch.md",
  },
  {
    key: "flowchart-board", label: "กระดาน flowchart", code: "FlowchartBoard", category: "feature",
    source: { path: "components/flowchart-board" },
    what: "ผังกล่องต่อเส้นแบบ flowchart: กล่อง ข้อความ (ไม่มีกรอบ · จัดรูปแบบคำได้ หนา/เอียง/สี RGB/ขนาด/จัดชิด/รายการ + สีพื้น/เส้นขอบ RGB) เริ่ม/จบ คำถาม ใช่/ไม่ใช่ ที่เก็บ (ไอคอน Google Drive/R2/NAS ... จาก lib/storage-places) ไฟล์ โฟลเดอร์ หน้าใน ERP (เลือกจากเมนูจริง กดเปิดหน้าได้) โน้ต กรอบโซน (ลากหัวกรอบ = ย้ายทั้งกลุ่ม) · เส้นติดกล่องเสมอ ลูกศร 3 แบบ (หักมุม · ตรง · โค้ง) · คัดลอก/วาง (วางข้ามหน้าได้ · วางข้อความจากที่อื่น = กล่องใหม่) · บันทึกอัตโนมัติ · บันทึกเป็นรูป · พิมพ์/PDF · ค้นหากล่อง · กล่องที่เก็บผูกกฎที่เก็บจริง (เตือนเมื่อไม่ตรง) · ชั้นล็อก (prop locked: ผังที่ระบบสร้าง + วาดเสริมทับ ปลดล็อกทีละกล่อง)",
    when: "ผังขั้นตอนงาน ผังตัดสินใจ ผังว่าอะไรไปเก็บที่ไหน (แผนผังการเก็บไฟล์) · ผังที่ระบบสร้างแล้วอยากให้คนวาดเสริมทับ (ส่ง locked — แผนผังการทำงาน)",
    notWhen: "วาดมือ แปะรูป วางการ์ดสินค้า → ใช้กระดานวาด (CanvasSketch)",
    doc: "flowchart-board.md", sameJob: "drawing-board",
  },
  {
    key: "team-plan", label: "แผนงานทีม", code: "TeamPlan", category: "feature",
    source: { path: "components/team-plan" },
    what: "กระดานงานจัดตามความด่วน/ความสำคัญ เพิ่มงานจากหน้าไหนก็ได้ · มุมมองกระดาน (canvas) วางงานคู่การ์ดจากระบบอื่น ลากเส้น = ผูกงาน",
    doc: "team-plan.md",
  },
  {
    key: "plan-linked-badge", label: "ป้าย \"อยู่ในแผนงาน N งาน\"", code: "PlanLinkedBadge", category: "feature",
    source: { path: "components/team-plan/linked-badge" },
    what: "โชว์กลับในเรื่องที่ถูกผูกกับงานในแผนงานทีม (ผูกจากเส้นบนกระดานแผนงาน หรือกด \"ใส่แผนงาน\" จากเรื่องนั้น) กดแล้วกางรายการงาน → เปิดในหน้าแผนงาน · ไม่มีงาน/ไม่มีสิทธิ์ = ไม่โชว์",
    when: "ป๊อป/หน้ารายละเอียดของเรื่องที่ผูกกับแผนงานได้ (ชนิดตามการ์ดบนกระดาน: ใบงานออกแบบ · SKU · Parent · งาน · คอนเทนต์ · เทรนด์) — ใช้แล้วที่ ป๊อปใบงานออกแบบ · ป๊อปโพสต์คอนเทนต์ · ป๊อปงาน",
    notWhen: "สร้างงานใหม่เข้าแผน → AddToPlanButton / AddToPlanModal",
    doc: "team-plan.md",
  },
  {
    key: "record-tasks", label: "เช็กลิสต์งานของรายการ", code: "RecordTasksButton", category: "feature",
    source: { path: "components/record-tasks" },
    what: "ปุ่ม + ลิ้นชักเช็กลิสต์งาน/โน้ต ผูกกับรายการไหนก็ได้ · ฝังในฟอร์ม (RecordChecklist + แม่แบบหลายข้อ) · ป้ายบนการ์ด (แถวสิ่งที่รอ / เสร็จ 2/4) · เลือกข้อตอนสร้าง (ChecklistSeedPicker) · ป๊อปตั้งค่าค่าใช้บ่อยเปิดจากที่อื่น (ChecklistPresetsEditor) · RecordChecklist variant=\"focus\" (2026-11-16) = เน้นเช็กลิสต์ ตัวใหญ่ ติ๊กวงกลม ช่องเพิ่มข้อบรรทัดเดียว แม่แบบ/ตั้งค่าในปุ่ม ⋯ (ใช้ที่ป๊อปงานในแผนงาน · ค่าเริ่ม = หน้าตาเดิม)",
    doc: "record-tasks.md",
  },
  {
    key: "comment-thread", label: "กล่องคอมเมนต์", code: "CommentThread", category: "feature",
    source: { path: "components/comment-thread" },
    what: "คอมเมนต์ใต้รายการ (ใคร พิมพ์อะไร เมื่อไหร่)",
  },
  {
    key: "parent-issues-panel", label: "แผงปัญหาของสินค้า", code: "ParentIssuesPanel", category: "feature",
    source: { path: "components/parent-issues-panel" },
    what: "จดปัญหาของรุ่นสินค้า แชร์ทุกสี ใช้ใน QC หน้ารุ่น ใบสั่งผลิต",
    notWhen: "เช็กอัตโนมัติว่าข้อมูลลงขายครบไหม (Description/ชื่อสี/ราคา/รูป) ให้ใช้ ProductQuickCheck + lib/product-listing-checks",
  },
  {
    key: "product-quick-check", label: "แผงตรวจสินค้าเร็ว (ดูอย่างเดียว)", code: "ProductQuickCheck", category: "feature",
    source: { path: "components/product-quick-check" },
    what: "ลิ้นชักข้างจอ ดูข้อมูลลงขายของสินค้าทีเดียว: กล่อง \"ระบบเช็กเจอ\" (กดแล้วเลื่อนไปจุดนั้น) · รูป · Description ไทย/อังกฤษ (บรรทัดซ้ำขึ้นสี) · ตารางชื่อสี + ราคาขาย/ขีดฆ่า (ช่องผิดขึ้นสี · รวมตามสีเมื่อแบบย่อยเยอะ) · ช่อง footer ให้ผู้เรียกใส่ปุ่มของตัวเอง · ตัวเช็ก = lib/product-listing-checks (เตือนอย่างเดียว)",
    when: "ตรวจงาน/สินค้าเร็ว ๆ ก่อนอนุมัติ (ตอนนี้: ลิ้นชักงาน Task Manager ปุ่ม ตรวจเร็ว)",
    notWhen: "แก้ข้อมูลสินค้า ให้เปิด MasterRecordDrawer (หน้าเต็ม) · จดปัญหาด้วยมือ ให้ใช้ ParentIssuesPanel · ห้ามส่งต้นทุนเข้ามา",
    doc: "product-quick-check.md",
  },
  {
    key: "compartments-editor", label: "ช่องใส่ของ (ขนาดด้านใน)", code: "CompartmentsEditor", category: "feature",
    source: { path: "components/compartments-editor" },
    what: "กรอกช่องใส่ของของรุ่นสินค้า หน้าตาเดียวกัน 3 ที่",
  },
  {
    key: "parent-web-listings", label: "ตั้งค่าเว็บของสินค้า", code: "ParentWebListings", category: "feature",
    source: { path: "components/parent-web-listings" },
    what: "ตั้งค่าการขึ้นเว็บร้านของรุ่นสินค้า ทุกร้านหรือร้านเดียว",
  },
  {
    key: "product-platform-manager", label: "ศูนย์เตรียมลงขายหลายแพลตฟอร์ม", code: "ProductPlatformManager", category: "feature",
    source: { path: "components/product-platform-manager" },
    what: "ร่างข้อมูลลงขายต่อแพลตฟอร์มของรุ่นสินค้า",
  },
  {
    key: "add-to-platform-wizard", label: "ตัวช่วยลงสินค้าขึ้นร้าน", code: "AddToPlatformWizard", category: "feature",
    source: { path: "components/platform-listing/add-to-platform-wizard" },
    what: "ลงสินค้าหลายตัวขึ้นหลายร้านใน 3 ขั้น: เลือกร้าน → ดูและแก้รายละเอียด (LINE: ทุกช่องที่จะส่ง + มาจากไหน + แก้ได้ · ราคาแก้ = ราคาในระบบ / ร้านอื่น: ความครบ + แก้เลย/สร้างงานเติม/ข้าม) → ยืนยัน · ข้ามตัวที่มีบนร้านแล้ว · ร้านที่มีตัวเชื่อมจริง (LINE) ลงจริงทีละตัว ร้านอื่นบันทึกร่าง",
    when: "ทุกปุ่ม \"ลงสินค้าขึ้นร้าน\" — มุมมองหน้าร้าน (แท็บยังไม่ลง) · แท็บแพลตฟอร์มใน Parent SKU · ติ๊กหลายรุ่นในหน้ารายการ Parent SKU · \"ลงร้านอื่นจากรายการนี้\" (prop sources = ใช้รายการบนร้านเป็นต้นแบบ)",
    notWhen: "แก้รายละเอียดสินค้า 1 ตัวต่อร้าน (ชื่อ/หมวด/รูป/ราคา) ให้ใช้ ProductPlatformManager · ห้ามเรียกสร้างสินค้าบนร้านตรง ๆ จากหน้าอื่น (จะข้ามด่านกันซ้ำ)",
    doc: "platform-catalog.md",
  },
  {
    key: "copy-listing-mapping", label: "ลงร้านอื่นจากรายการนี้ (ตารางจับคู่ช่อง)", code: "CopyMappingTable · lib/listing-copy-map · lib/listing-copy-source", category: "feature",
    source: { path: "components/platform-listing/copy-mapping-table" },
    what: "ใช้รายการบนร้านหนึ่ง (Lazada / Shopee) เป็นต้นแบบ ลงสินค้าเดียวกันบนอีกร้าน — โชว์ทุกช่องของร้านปลายทางว่าใช้ค่าจาก ร้านต้นทาง / ข้อมูลในระบบ (Parent SKU → SKU) / ร่างที่แก้ไว้ เลือกได้ทีละช่อง · เขียนลงร่างเท่านั้น · ราคาที่ในระบบยังว่างกดเติมจากร้านต้นทางได้ · สต๊อกไม่คัดลอก",
    when: "อยู่ในตัวช่วยลงสินค้า (AddToPlatformWizard) เมื่อเปิดจากปุ่ม \"ลงร้านอื่นจากรายการนี้\" ในลิ้นชักสินค้าบนร้าน หรือติ๊กหลายรายการในมุมมองหน้าร้าน · เฟส 1 ปลายทาง = LINE SHOPPING",
    notWhen: "ลงสินค้าจากข้อมูลในระบบล้วน ให้ใช้ตัวช่วยลงสินค้าเฉย ๆ · แก้สินค้าที่มีบนร้านแล้ว ให้ใช้ลิ้นชักสินค้าบนร้าน · ห้ามประกอบข้อมูลส่ง LINE เอง (ใช้ lib/line-create-payload ที่อ่านร่างนี้)",
    doc: "platform-catalog.md",
  },
  {
    key: "lazada-create-preview", label: "ดูก่อนส่ง + สร้างสินค้าใหม่บน Lazada", code: "LazadaCreatePreviewEditor · lib/lazada-create-plan · /api/lazada/create-product", category: "feature",
    source: { path: "components/platform-listing/lazada-create-preview" },
    what: "แท็บ Lazada ในตัวช่วยลงสินค้า — ทุกช่องที่จะส่งขึ้น Lazada + มาจากไหน + ที่ขาด (หมวด · รูป ≤ 8 · ชั้นตัวเลือก color_family/size/กำหนดเอง · ราคาเต็ม/ลด · น้ำหนัก/กล่อง · ช่องบังคับของหมวด) แก้ลงร่าง Lazada ได้ · ตัวประกอบข้อมูลตัวเดียวกับตอนลงจริง",
    when: "ตัวช่วยลงสินค้าเมื่อเลือก Lazada (รวม \"ลงทุกร้าน\") · ลงจริงเปิดด้วย LAZADA_CREATE_LIVE ใน lib/platform-create-registry",
    notWhen: "แก้สินค้าที่มีบน Lazada แล้ว ให้ใช้ลิ้นชักสินค้าบนร้าน (lazada-listing-panels) · ห้ามประกอบ payload สร้างสินค้า Lazada ที่อื่น (ใช้ lib/lazada-create-plan)",
    doc: "lazada-connector.md",
  },
  {
    key: "line-display-toggle", label: "เปิด/ปิดขายสินค้าบน LINE", code: "useLineDisplay", category: "feature",
    source: { path: "components/platform-catalog/use-line-display" },
    what: "เปิด/ปิดขายรายการบนร้าน LINE ทีละตัวหรือหลายตัว — ถามก่อนเสมอ (เกิน 20 ต้องพิมพ์ยืนยัน) · ส่งทีละ 200 · แก้สำเนาในระบบ + ประวัติฝั่ง API (/api/line-shopping/listing-display)",
    when: "สวิตช์ \"เปิดขาย\" ในแถว/การ์ด/ลิ้นชักสินค้าบนร้าน + ปุ่มเปิด/ปิดขายของแถบเลือกหลายตัว (แท็บจับคู่ · มุมมองหน้าร้าน)",
    notWhen: "เปิด/ปิดขายจากหน้า Parent SKU (ใช้ร่างของสินค้า) ให้ใช้ /api/line-shopping/set-display เดิมใน ProductPlatformManager",
    doc: "platform-catalog.md",
  },
  {
    key: "listing-images", label: "รูปสินค้าบนร้าน (เรียง/ปก/ลบ/เพิ่มจากระบบ)", code: "ListingImageGrid", category: "feature",
    source: { path: "components/platform-catalog/listing-images" },
    what: "ตารางรูปสินค้าของรายการบนร้าน (ช่องเล็ก ~88px เต็มแถวอัตโนมัติ · ชี้ = รูปใหญ่ HoverPreview) — ลากเรียง · ตั้งปก · ลบ (เหลือ ≥ 1) · ปุ่มเพิ่มจากคลังรูปของสินค้าที่จับคู่ + ป๊อปเลือกรูป (ListingImagePicker: เพิ่มรูปสินค้า / รูปตัวเลือก) · รูปจากระบบอยู่ในฟอร์มเป็น \"r2:<key>\" · useSystemImages(id, { withSkuImages: true }) ได้รูปทั้งหมดของแต่ละ SKU ด้วย (skuImages)",
    when: "ลิ้นชักสินค้าบนร้าน: แท็บรูป LINE + Lazada + Shopee · รูปในรายละเอียด Shopee · ป๊อปเลือกรูปตัวเลือก (LINE รายละเอียดตัวเลือก · Lazada รูป·น้ำหนัก·กล่อง) · ป๊อปเลือกรูปมีปุ่ม \"อัปโหลดจากเครื่อง / คลังรูปทั้งหมด\" (AssetPicker · 2026-11-23 · ปิดด้วย allowLibrary={false})",
    notWhen: "คลังรูปของสินค้าในระบบ (หน้า Parent SKU) ให้ใช้ ProductImageGallery · อัปโหลดไฟล์ใหม่ ให้ใช้ ImageAttach",
    doc: "platform-catalog.md",
  },
  {
    key: "listing-check", label: "โหมดเช็กกับระบบ (ลิ้นชักสินค้าบนร้าน)", code: "useListingCheck · CheckBadge · CheckSysBox · CheckSummaryBar", category: "feature",
    source: { path: "components/platform-catalog/listing-check" },
    what: "ปุ่ม \"เช็กกับระบบ\" ที่หัวลิ้นชัก → เทียบสด (ตัวเทียบกลาง lib/platform-listing-drift) แล้วโชว์ป้าย ตรงแล้ว/ไม่ตรง ในแต่ละช่อง + ค่าของระบบใต้ช่อง · \"ใช้ตามระบบ\" = เติมลงฟอร์ม (ยังไม่ส่ง) · \"ใช้ตามระบบทั้งหมด\" · \"ให้ระบบใช้ค่านี้\" = ค่าบนร้าน → ร่างของร้านนี้ (ชื่อ/รายละเอียด/ข้อมูลจำเพาะ · ย้อนได้)",
    when: "ทุกแผงของลิ้นชักสินค้าบนร้านที่อยากให้เทียบกับระบบ (เริ่ม Shopee 2026-11-23 · TikTok/Lazada/LINE ตามมา)",
    notWhen: "ห้ามเขียนตัวเทียบร้าน↔ระบบตัวที่ 2 — ค่าเทียบมาจาก /api/platform-catalog/drift เท่านั้น · ส่งหลายเรื่องจากหน้าเทียบรวมใช้ MatchSystemDialog",
    doc: "platform-catalog.md",
  },
  {
    key: "listing-option-sync", label: "ตัวเลือกบนร้าน ↔ สีในระบบ (แท็บตัวเลือกในลิ้นชักสินค้าบนร้าน)", code: "useSysVariants · sysVariantsNotOnShop · sysVariantOfOption · sizeSkusForNewColor", category: "feature",
    source: { path: "components/platform-catalog/use-sys-variants" },
    what: "โหลดสีในระบบของสินค้าที่จับคู่ (รหัส · ชื่อตัวเลือกที่ตัวช่วยลงสินค้าจะส่ง · ราคา · รูป · สต๊อก) แล้วหา \"สีที่มีในระบบแต่ยังไม่อยู่บนร้าน\" · ชื่อตามระบบของแต่ละตัวเลือก · รหัส/ราคาต่อไซซ์ของสีใหม่ (สินค้าสี×ไซซ์) — กติกา pure อยู่ lib/listing-option-sync",
    when: "แท็บตัวเลือก & ราคาของลิ้นชักสินค้าบนร้าน ทุกร้าน (เริ่ม Shopee 2026-11-24 · TikTok/Lazada/LINE ตามมา) — แถว \"มีในระบบ ยังไม่อยู่บนร้าน\" + ปุ่มเพิ่ม · ปุ่ม \"ชื่อตามระบบ\"",
    notWhen: "ห้ามจับคู่ตัวเลือก↔SKU เองในหน้า (ใช้ skuMatchesSys/sysVariantOfOption) · ห้ามดึงสีในระบบจากตารางเองในหน้า (ใช้ GET /api/platform-catalog/drift?part=variants)",
    doc: "platform-catalog.md",
  },
  {
    key: "attr-suggest-box", label: "แนะนำช่องคุณลักษณะ (จับคำฟรี / AI ช่วยเติม)", code: "useAttrSuggest", category: "feature",
    source: { path: "components/platform-catalog/attr-suggest-box" },
    what: "ปุ่ม \"แนะนำจากชื่อ/รายละเอียด (ฟรี)\" (lib/attr-suggest) + \"ให้ AI ช่วยเติม\" (POST /api/ai/attr-fill · ด่านกลาง aiChat \"ai.attr_fill\" · lib/attr-ai-fill) → กล่องผล (AI ติดป้าย \"AI เดา · ตรวจก่อน\") → ใส่ทั้งหมด (applyAttrHits เติมเฉพาะช่องที่ว่าง)",
    when: "ช่องคุณลักษณะของหมวดตอนลง/แก้สินค้าบนร้าน (Shopee ใช้แล้ว · TikTok/Lazada ย้ายมาใช้ได้) — ช่องรูปแบบ TtsAttrField",
    notWhen: "เดาแท็กสินค้าในระบบ ให้ใช้ lib/tag-suggest-rules · ห้ามเติมแล้วส่งขึ้นร้านอัตโนมัติ (คนต้องกดใส่ + บันทึกเอง)",
    doc: "shopee-connector.md",
  },
  {
    key: "listing-variant-table", label: "ตารางตัวเลือก & ราคา (หน้าลงสินค้าใหม่บนร้าน)", code: "ListingVariantTable", category: "feature",
    source: { path: "components/platform-listing/listing-variant-table" },
    what: "ตารางตัวเลือกของหน้าลงสินค้า — แก้ราคาต่อแถว (MoneyInput) · ชื่อสีจาก Color Platform [TH]/พิมพ์ใหม่ (SearchableSelect) · รูป single (รูปประจำสี) หรือ all (โชว์ทุกรูป ไม่พับ · ชี้ดูรูปใหญ่) · สต๊อกล็อก 0 · แก้ค้างแล้วบันทึกครั้งเดียว (onSave ได้ prices/names/imgs) · ปุ่มย้อนต่อช่อง + กลับไปใช้ค่าจากระบบ · PC ตาราง/มือถือการ์ด",
    when: "หน้าดูก่อนลงสินค้าใหม่ของร้าน (Shopee + Lazada ใช้แล้ว · TikTok ต่อได้) — เก็บลงร่างของร้านเอง (extra.<ร้าน>_prices / _option_names)",
    notWhen: "แก้สินค้าที่มีบนร้านแล้ว (ใช้ลิ้นชักสินค้าบนร้าน) · ห้ามเขียนกลับราคา/สีในระบบ",
    doc: "shopee-connector.md",
  },
  {
    key: "listing-description-box", label: "กล่องรายละเอียด (หน้าตาบนร้าน + กดแก้ + รูปในรายละเอียด)", code: "ListingDescriptionBox", category: "feature",
    source: { path: "components/platform-listing/listing-description-box" },
    what: "แบบ B ที่เจ้าของเลือก — ปกติโชว์หน้าตาบนร้าน (HTML ผ่าน sanitizeRichHtml หรือข้อความตามบรรทัด · ตัดบรรทัดเอง · ดูทั้งหมด/ย่อ) · กด \"แก้\" = ช่องพิมพ์สูงตามข้อความ + นับตัวอักษร · images = รูปต่อท้ายรายละเอียด (ListingImageGrid ลากเรียง/เอาออก/เพิ่มจากคลังรูป · ไม่ใส่รูป · กลับไปใช้รูปอัตโนมัติ)",
    when: "รายละเอียดในหน้าลงสินค้าใหม่ของร้าน (Shopee ข้อความล้วน · Lazada HTML + รูปในรายละเอียด)",
    notWhen: "แก้รายละเอียดสินค้าในระบบ (ใช้ RichTextEditor ที่หน้าสินค้า) · ลิ้นชักสินค้าบนร้าน (มีตัวแก้ของร้านนั้นแล้ว)",
    doc: "lazada-connector.md",
  },
  {
    key: "attr-defaults-dialog", label: "ค่าเริ่มต้นช่องคุณลักษณะของร้าน (ป๊อปตั้งค่า)", code: "AttrDefaultsDialog", category: "feature",
    source: { path: "components/platform-catalog/attr-defaults-dialog" },
    what: "ป๊อปตั้งกติกา \"ชื่อช่อง → ใส่ค่าอะไร\" ต่อร้าน×แบรนด์ (ค่าตายตัว เช่น ประเทศ = ไทย · หรือดึงจากสินค้า: รับประกัน / ขนาด ยาว×กว้าง×สูง / น้ำหนัก) · เก็บ ui_config listingAttrDefaultsKey · กติกา pure lib/listing-attr-defaults (matchAttrRule · attrRuleValue · attrDefaultVals) · ยังไม่ตั้ง = DEFAULT_ATTR_RULES · บันทึกแล้วย้อนกลับได้",
    when: "ช่องคุณลักษณะของหมวดตอนลงสินค้าใหม่บนร้าน (Shopee ใช้แล้ว · TikTok/Lazada ย้ายมาใช้ได้ — ตัวประกอบข้อมูลของร้านเรียก matchAttrRule/attrRuleValue/attrDefaultVals เติมช่องที่ว่าง)",
    notWhen: "ค่าที่ต่างกันทุกสินค้า (ให้กรอกในร่าง / AI ช่วยเติม attr-suggest-box) · ห้ามเติมทับค่าที่บันทึกไว้ในร่าง",
    doc: "shopee-connector.md",
  },
  {
    key: "listing-links", label: "ปุ่มดูหน้าร้าน / Seller Center", code: "ListingLinks", category: "feature",
    source: { path: "components/platform-catalog/listing-links" },
    what: "ปุ่มเปิดหน้าสินค้าที่ลูกค้าเห็น + หลังร้าน (Seller Center) ของรายการบนร้าน ทุกแพลตฟอร์ม — ลิงก์จาก lib/platform-links (listingLinks) · หลังร้านที่ไม่มีลิงก์ตรง = หน้าแรก + คัดลอกรหัส · ตั้งร้านไม่ครบ = บอกว่าต้องตั้งอะไร",
    when: "ทุกที่ที่โชว์สินค้า 1 รายการบนร้าน (ตอนนี้: หัวลิ้นชักสินค้าบนร้าน)",
    notWhen: "ลิงก์หน้าร้านของบัญชี (ไม่ใช่สินค้า) ให้ใช้ platformShopUrl ใน lib/platform-links",
    doc: "platform-catalog.md",
  },
  {
    key: "listing-card", label: "การ์ดสินค้าบนร้าน (รูปใหญ่ / รูปเล็ก)", code: "ListingCard · ShopStateBadge", category: "feature",
    source: { path: "components/platform-catalog/listing-card" },
    what: "การ์ด 1 รายการบนร้าน — รูปจากร้าน · ป้ายสถานะร้าน (ขายอยู่/ใกล้หมด/หมด/ปิดขาย/ไม่อยู่บนร้านแล้ว + สต๊อก) · ซ้ำ ×N · ส่วนลด % · ชื่อ · รหัส · ราคาจ่ายจริง · ส่วนท้ายใส่ปุ่มเอง · variant \"full\" รูปเต็มใบ / \"compact\" รูปเล็กซ้าย (แบบ B แท็บจับคู่) · ShopStateBadge = ป้ายสถานะร้าน ใช้ในตาราง/กล่องตัวซ้ำด้วย",
    when: "ทุกที่ที่โชว์สินค้าบนร้านเป็นการ์ด (แท็บจับคู่ · มุมมองหน้าร้าน · โหมดจับคู่ทีละตัว · แผงสินค้าบนเว็บ) — คู่กับ MiniTable layout=\"cards\" + cardPick",
    notWhen: "การ์ดสินค้าในระบบเรา (Parent SKU) ไม่ใช่รายการบนร้าน",
    doc: "platform-catalog.md",
  },
  {
    key: "push-open", label: "เปิดหน้าให้เช็กหลังส่งขึ้นร้าน", code: "usePushOpen", category: "feature",
    source: { path: "components/push-open" },
    what: "กดส่งขึ้นร้าน → เปิดแท็บรอไว้ทันที (ไม่โดนบล็อก) ส่งเสร็จพาไปหน้าสินค้า / Seller Center ตามที่ผู้ใช้ตั้ง (ต่อคน · แยกรายร้านได้) · หน้าสินค้ายังไม่พร้อม = Seller Center แทน + เหตุผล · เกิน 5 หน้า/เบราว์เซอร์บล็อก = ปุ่มในแจ้งผล · ส่งไม่ผ่าน = ปิดแท็บเอง · หน้าตั้งค่า PushOpenSettingsModal (เมนูโปรไฟล์) + ปุ่ม PushOpenGearButton · กติกา pure lib/push-open · ลิงก์จาก lib/platform-links",
    when: "ทุกปุ่มที่ส่ง/แก้สินค้าบนร้าน (ตัวช่วยลงสินค้า · อัปเดตให้ตรง · เปลี่ยนรูปปก …) — เรียก prepare() ทันทีตอนกด (ก่อน await) แล้ว finish(รายการที่สำเร็จ)",
    notWhen: "ปุ่มดูหน้าร้าน/Seller Center ของรายการเดียว (ให้ใช้ ListingLinks) · งานหลังบ้าน/ตั้งเวลา (ไม่มีคนกด เปิดแท็บไม่ได้)",
    doc: "push-open.md",
  },
  {
    key: "media-upload-field", label: "ช่องอัปรูป/วิดีโอ 1 ไฟล์", code: "MediaUploadField", category: "file",
    source: { path: "components/media-upload-field" },
    what: "ช่องใส่รูป (หรือวิดีโอสั้น) 1 ไฟล์ — อัปโหลด · ลากวาง · คลิกช่องแล้ว Ctrl+V วางรูปที่คัดลอกไว้ · เลือกจากคลังรูป · ไฟล์ใหญ่มีแถบ % · layout stack = รูปเต็มกว้าง ปุ่มใต้รูป (คอลัมน์แคบ)",
    when: "ฟอร์มที่มีรูป 1 รูป เช่น รูปแม่แบบ Design Library · รูปบนเว็บ · New Drops",
    notWhen: "แนบหลายรูป ใช้ ImageAttach / ImageAttachKeys · แกลเลอรีสินค้า ใช้ ImageManager",
    doc: "file-drop.md",
  },
  {
    key: "sku-swatch-browser", label: "แผงผ้า (Swatch) — ดู / ขอซื้อ / เลือกชิ้น", code: "SwatchBrowser", category: "feature",
    source: { path: "components/sku-swatch-browser" },
    what: "รูปแผงตัวอย่างจริง (ผ้า/ด้าย/อะไหล่) 1 แผ่นหลายรูป · ชิ้นบนรูปมีรหัสภายใน SW-0001-01 + สี + ชื่อสี (ผูก SKU ทีหลังได้) · ✨ อ่านจากรูป (AI) หาชิ้นให้ · รายการ: การ์ด/จับกลุ่มแท็ก/ตาราง + ค้นด้วยสี · แผงข้อมูล: รายละเอียด/ร้าน+ราคา/สเปก/BOM/ไฟล์แนบ/ประวัติ · โหมด onPickSkus = ส่งรายการใส่ตะกร้าขอซื้อ · โหมด onPickSpot = เลือก 1 ชิ้นคืนรูปที่ชิ้นอยู่+กรอบ+รหัส/สี+SKU · SwatchTagModal = ป๊อปติดแท็กแผง · saveSwatchTags = บันทึกแท็ก",
    when: "ทุกที่ที่ต้องค้น/เลือก/ดู/ติดแท็กแผงผ้า (เห็นรูปผ้าจริง) เช่น Design Library · ช่องสีในใบงานออกแบบ · ขอซื้อจากแผง",
    notWhen: "เลือก SKU ทั่วไปจากรายการ ใช้ SkuPicker · เลือกวัตถุดิบใน BOM ใช้ ComponentPicker · ⚠ ห้ามยิง /api/sku-swatches ทำรายการแผงเองในหน้าอื่น (เทสต์ lib/__tests__/sku-swatch-guard.test.ts จับ)",
    doc: "sku-swatch.md",
  },
  {
    key: "color-swatch-manager", label: "ทะเบียนสีกลาง", code: "ColorSwatchManager", category: "feature",
    source: { path: "components/color-swatch-manager" },
    what: "ตั้งหน้าตาจุดสีของแต่ละชื่อสี",
    doc: "color-swatch.md",
  },
  {
    key: "create-module-wizard", label: "ตัวช่วยสร้างโมดูลใหม่", code: "CreateModuleWizard", category: "feature",
    source: { path: "components/create-module-wizard" },
    what: "สร้างโมดูล/ตารางใหม่ 3 ขั้น จากแม่แบบ",
  },
  {
    key: "field-creator", label: "เพิ่มช่องใหม่จากเว็บ", code: "FieldCreatorModal", category: "feature",
    source: { path: "components/field-creator" },
    what: "เพิ่มช่องข้อมูลใหม่จากหน้าเว็บ แล้วสร้างคอลัมน์จริงในฐานข้อมูล",
    note: "แตะโครงสร้างฐานข้อมูลจริง เฉพาะแอดมิน",
  },
  {
    key: "asset-library", label: "คลังไฟล์ / อัลบั้มคอนเทนต์", code: "AssetLibrary", category: "feature",
    source: { path: "components/asset-library" },
    what: "อัลบั้มรูป/วิดีโอจากการถ่าย แตกเป็นโพสต์ในปฏิทินคอนเทนต์",
  },
  {
    key: "payroll-parts", label: "ชิ้นส่วนแอปเงินเดือน", code: "components/payroll/*", category: "feature",
    source: { path: "components/payroll" },
    what: "เปลือกและแผงต่าง ๆ ของแอปเงินเดือน (ใช้เฉพาะหน้าเงินเดือน)",
  },
];

// ───────── ตัวช่วย (pure) ─────────

/** รหัสอ้างอิงของ source ในไฟล์ผลนับ (lib/shared-parts-usage.json) */
export function sourceId(s: PartSource): string {
  return s.names?.length ? `${s.path}#${[...s.names].sort().join(",")}` : s.path;
}

export type UsagePlace = { label: string; href?: string | null; kind: "page" | "api" | "component" | "lib" | "other" };
export type SourceUsage = { files: number; demo: number; places: UsagePlace[]; placeCount: number };
export type UnitUsage = SourceUsage & { path: string; desc: string; website: boolean; loc: number };
export type SharedPartsUsage = {
  generatedAt: string | null;
  commit: string | null;
  totals: { components: number; website: number; lib: number; pages: number; apis: number };
  handMade: { loadingPages: number; loadingPagesTotal: number; rawTableFiles: number };
  sources: Record<string, SourceUsage>;
  units: UnitUsage[];
};

export type PartFlag = "unused" | "dup" | "deprecated" | "single" | "nodoc" | "check";
export const PART_FLAG_LABEL: Record<PartFlag, string> = {
  unused: "ไม่มีใครใช้",
  dup: "ควรย้ายไปตัวหลัก",
  deprecated: "ตัวเก่า ควรเลิก",
  single: "ใช้ที่เดียว",
  nodoc: "ไม่มีคู่มือ",
  check: "ต้องเช็กข้อมูลก่อน",
};

export type PartRow = SharedPart & {
  usage: SourceUsage | null;
  flags: PartFlag[];
  /** ตัวอื่นในกลุ่มงานเดียวกัน */
  siblings: string[];
  /** คำตัดสินของกลุ่ม (ถ้าอยู่ในกลุ่ม) */
  verdict: JobVerdict | null;
  verdictWhy: string | null;
};

/** รวมทะเบียน + ผลนับ → แถวพร้อมป้าย (ไม่มีใครใช้ / ซ้ำ / ตัวเก่า / ใช้ที่เดียว / ไม่มีคู่มือ) */
export function buildPartRows(parts: SharedPart[], usage: Pick<SharedPartsUsage, "sources">): PartRow[] {
  const byJob = new Map<string, SharedPart[]>();
  for (const p of parts) if (p.sameJob) byJob.set(p.sameJob, [...(byJob.get(p.sameJob) ?? []), p]);
  return parts.map((p) => {
    const u = usage.sources[sourceId(p.source)] ?? null;
    const group = p.sameJob ? byJob.get(p.sameJob) ?? [] : [];
    const siblings = group.filter((g) => g.key !== p.key).map((g) => g.key);
    const v = siblings.length && p.sameJob ? SAME_JOB_VERDICT[p.sameJob] ?? null : null;
    const flags: PartFlag[] = [];
    if (u && u.files === 0) flags.push("unused");
    if (p.replacedBy) flags.push("deprecated");
    // ป้ายตามคำตัดสินของกลุ่ม — "ใช้คนละงาน" ไม่ติดป้าย (ตั้งใจมีหลายตัว)
    if (siblings.length && !p.primary && !p.replacedBy) {
      if (v?.verdict === "merge") flags.push("dup");
      else if (v?.verdict === "check-data") flags.push("check");
      else if (!v) flags.push("check");   // ยังไม่ได้ตัดสิน (เทสต์กันไว้ ไม่ควรเกิด)
    }
    if (u && u.files > 0 && u.placeCount === 1) flags.push("single");
    if (!p.doc && !p.replacedBy && u && u.placeCount >= 3) flags.push("nodoc");
    return { ...p, usage: u, flags, siblings, verdict: v?.verdict ?? null, verdictWhy: v?.why ?? null };
  });
}

/** source path ที่ลงทะเบียนแล้ว (ใช้แยก "ยังไม่ลงทะเบียน") */
export function registeredPaths(parts: SharedPart[] = SHARED_PARTS): Set<string> {
  return new Set(parts.map((p) => p.source.path));
}
