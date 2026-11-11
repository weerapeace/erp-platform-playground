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
    what: "ตารางรายการครบชุด: ค้นหา กรอง เรียง มุมมองที่บันทึก จัดคอลัมน์ ติ๊กหลายแถว แก้หลายรายการ ส่งออก",
    when: "หน้ารายการหลักที่ต้องค้น กรอง ส่งออก หรือแก้หลายรายการพร้อมกัน",
    notWhen: "ตารางย่อยในป๊อปอัปหรือแท็บ ให้ใช้ตารางเล็ก (MiniTable) · หน้าข้อมูลหลักแบบตาราง+ลิ้นชัก ให้ใช้ MasterCRUD",
    legacyKey: "data_table",
  },
  {
    key: "master-crud", label: "หน้าจัดการข้อมูลหลัก", code: "MasterCRUD", category: "table",
    source: { path: "components/master-crud" },
    what: "สร้างหน้า ตาราง + ลิ้นชักดู/แก้ ครบชุดจากการตั้งค่า (ฟิลด์ สิทธิ์ ประวัติ ไฟล์แนบ) ไม่ต้องเขียนหน้าเอง",
    when: "หน้าข้อมูลหลัก เช่น ลูกค้า คลัง หน่วย แผนก สินค้า",
    notWhen: "หน้าที่มีขั้นตอนเฉพาะมาก เช่น บอร์ดจ่ายงาน หน้าแดชบอร์ด",
    doc: "crud-complete.md",
  },
  {
    key: "mini-table", label: "ตารางเล็ก", code: "MiniTable", category: "table",
    source: { path: "components/mini-table" },
    what: "ตารางย่อยในป๊อปอัป แผงข้าง แท็บ มีค้นหา เรียง จัดกลุ่ม ติ๊กเลือก กางแถว ในตัว",
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
    when: "ทุกตารางที่ติ๊กเลือกหลายแถวได้",
    notWhen: "ห้ามทำแถบปุ่มหลายรายการเองในหน้า",
    doc: "bulk-action-bar.md",
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
    what: "ป๊อปอัปกลางทุกแบบ ถามก่อนปิดเมื่อมีข้อมูลยังไม่บันทึก มีแบบปุ่มอันตราย จำขนาดที่ผู้ใช้ลากไว้ · BottomSheet = แผ่นเลื่อนจากล่างสำหรับจอมือถือ",
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
    what: "ฟอร์มพร้อมตรวจข้อมูล ช่องบังคับ ข้อความผิดพลาด บันทึกร่าง กันกดซ้ำ สิทธิ์รายช่อง",
    when: "ฟอร์มสร้าง/แก้ข้อมูลที่ไม่ได้อยู่ใน MasterCRUD",
    legacyKey: "erp_form",
  },
  {
    key: "money-input", label: "ช่องจำนวนเงิน", code: "MoneyInput", category: "input",
    source: { path: "components/money-input" },
    what: "ใส่คอมมาให้ ปัดทศนิยม กันพิมพ์ผิด",
    when: "ทุกช่องที่เป็นเงิน",
    notWhen: "ช่องจำนวนชิ้น ให้ใช้ StepInput หรือช่องตัวเลขปกติ",
    doc: "money-input.md",
  },
  {
    key: "date-input", label: "ช่องวันที่", code: "DateInput", category: "input",
    source: { path: "components/date-input" },
    what: "ช่องเลือกวันที่/เวลา แบบ 24 ชั่วโมง ใช้เหมือนกันทุกหน้า",
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
    what: "ปุ่มบันทึก/ยกเลิก โผล่ติดขอบล่างเมื่อมีการแก้ไข",
    when: "หน้าตั้งค่า/หน้าแก้ข้อมูลเต็มหน้า",
    notWhen: "แท็บย่อยในป๊อปอัปหรือลิ้นชัก ให้ใช้ FooterSave",
    doc: "save-bar.md",
  },
  {
    key: "split-panes", label: "กล่องแบ่งซ้าย-ขวา ดันกันได้", code: "SplitPanes", category: "input",
    source: { path: "components/split-panes" },
    what: "แบ่งหน้าเป็น 2 กล่องซ้าย-ขวา กดกล่องไหนกล่องนั้นขยายดันอีกฝั่งให้แคบ (หรือพับเหลือแถบ) จำฝั่งที่ขยายต่อคน ที่แคบเรียงบน-ล่างเอง",
    when: "ฟอร์มที่มีข้อมูล 2 ก้อนใช้คู่กัน เช่น ช่องข้อมูล + กล่องรายละเอียดยาว (เริ่มที่ใบงานออกแบบ แท็บข้อมูลงาน)",
    notWhen: "เนื้อหาคนละเรื่องที่ไม่ต้องดูพร้อมกัน ให้ใช้แท็บ · ปรับขนาดหน้าต่างทั้งใบ ให้ใช้ป๊อปอัปกลาง",
    doc: "split-panes.md",
  },
  {
    key: "footer-save", label: "ปุ่มบันทึกที่แถบล่างของป๊อปอัป", code: "FooterSave", category: "input",
    source: { path: "components/footer-save" },
    what: "ย้ายปุ่มบันทึกของแท็บย่อยไปอยู่แถบล่างของหน้าต่าง",
    when: "แท็บย่อยในลิ้นชัก/ป๊อปอัป",
    notWhen: "หน้าเต็ม ให้ใช้ SaveBar",
  },
  {
    key: "searchable-select", label: "ช่องเลือกแบบพิมพ์ค้นหา", code: "SearchableSelect", category: "input",
    source: { path: "components/searchable-select" },
    what: "dropdown ที่พิมพ์กรองรายการได้ ใช้แทน select ธรรมดา",
    when: "รายการตัวเลือกยาวกว่า ~10 ตัว",
    notWhen: "เลือกข้อมูลหลัก (สินค้า ร้าน ลูกค้า) ให้ใช้ Picker เฉพาะของมัน",
    sameJob: "select", primary: true,
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
    what: "ค้นหาสินค้าด้วยรหัสหรือชื่อ มีรูปย่อ จำตัวที่เลือกล่าสุด",
    when: "ทุกช่องที่ต้องเลือกสินค้า 1 ตัว",
    notWhen: "เลือกหลายตัวพร้อมกัน ให้ใช้ SkuMultiPicker",
    note: "ตัวที่ใช้จริงทั้งระบบ — ProductPicker ตัวเก่า (สินค้าชุดทดลอง) ลบแล้ว 2026-11-07",
  },
  {
    key: "sku-multi-picker", label: "เลือกสินค้าหลายตัว", code: "SkuMultiPickerModal", category: "pick",
    source: { path: "components/sku-multi-picker" },
    what: "ป๊อปเลือกสินค้าหลายตัวพร้อมกัน กรองตามแท็ก/แบรนด์",
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
    what: "เลือกหน่วยนับจากทะเบียนหน่วยจริง (ตาราง uoms — ตัวเดียวกับหน่วยของสินค้า) เก็บเป็นชื่อหน่วย พิมพ์หน่วยใหม่ได้",
    when: "ทุกช่องหน่วยนับ (บรรทัดใบขาย ร้านที่จำหน่าย ขอเพิ่มวัตถุดิบ)",
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
    what: "เลือกวัตถุดิบ/ชิ้นส่วน พร้อมรูปและสต๊อก",
    when: "BOM ขอซื้อวัตถุดิบ",
  },
  {
    key: "mo-picker", label: "เลือกใบสั่งผลิต", code: "MoMultiPickerModal", category: "pick",
    source: { path: "components/mo-picker" },
    what: "ป๊อปเลือกใบสั่งผลิตได้หลายใบ ค้นหา/กรองได้",
  },

  // ───────── รูปและไฟล์ ─────────
  {
    key: "asset-picker", label: "เลือกรูปจากคลังกลาง", code: "AssetPicker", category: "file",
    source: { path: "components/asset-picker" },
    what: "เปิดคลังรูป/วิดีโอแล้วเลือกมาใช้ ไม่ต้องอัปโหลดซ้ำ",
    when: "ทุกช่องรูปที่น่าจะมีรูปในคลังอยู่แล้ว",
  },
  {
    key: "image-input", label: "ช่องรูปเดี่ยว", code: "ImageInput", category: "file",
    source: { path: "components/image-input" },
    what: "อัปโหลดรูป 1 รูป + ดูตัวอย่าง + ลบ",
    when: "ช่องรูปเดี่ยว เช่น โลโก้ รูปปก",
  },
  {
    key: "image-attach", label: "แนบรูปหลายรูป", code: "ImageAttach", category: "file",
    source: { path: "components/image-attach" },
    what: "แนบรูปหลายรูป: ลากวาง วาง (Ctrl+V) หรือเลือกไฟล์ ย่อขนาดให้",
    when: "คอมเมนต์ งาน โน้ต ที่แนบรูปได้หลายรูป",
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
    note: "ใบสั่งแพทเทิร์น / คลัง Contents ยังมีปุ่มอัป Drive ของตัวเอง — ย้ายมาใช้ตัวนี้ได้ภายหลัง",
  },
  {
    key: "drive-folder-files", label: "รายการไฟล์ในโฟลเดอร์ Drive", code: "DriveFolderFiles", category: "file",
    source: { path: "components/drive-folder-files" },
    what: "โชว์ว่าในโฟลเดอร์ Google Drive มีไฟล์อะไร + ปุ่มเปิดใน Drive (โหลดแบบไม่บล็อกป๊อปอัป)",
    when: "มีลิงก์โฟลเดอร์ Drive แล้วอยากให้เห็นไฟล์ข้างใน (ดูอย่างเดียว) — อยากอัปด้วยใช้ DriveUploadBox ซึ่งรวมตัวนี้ไว้แล้ว",
    doc: "drive-upload-box.md",
  },
  {
    key: "file-drop", label: "ลากไฟล์มาวาง", code: "useFileDrop", category: "file",
    source: { path: "components/file-drop" },
    what: "ให้กล่องไหนก็ได้รับไฟล์ที่ลากมาวาง",
    when: "ทุกจุดที่อัปโหลดได้",
    doc: "file-drop.md",
  },
  {
    key: "file-input", label: "ช่องไฟล์แนบเดี่ยว", code: "FileInput", category: "file",
    source: { path: "components/file-input" },
    what: "อัปโหลดไฟล์แนบ 1 ไฟล์ (รูปหรือ PDF) เก็บตามกฎที่เก็บไฟล์",
    sameJob: "file-field", primary: true,
  },
  {
    key: "file-multi-input", label: "ช่องไฟล์แนบหลายไฟล์", code: "FileMultiInput", category: "file",
    source: { path: "components/file-multi-input" },
    what: "อัปโหลดไฟล์แนบหลายไฟล์ (รูปและ PDF) เก็บ R2 อย่างเดียว",
    sameJob: "file-field",
  },
  {
    key: "record-files", label: "ไฟล์แนบของเอกสาร / รายการ", code: "RecordFilesField", category: "file",
    source: { path: "components/record-files" },
    what: "แนบไฟล์กับรายการใดก็ได้ เก็บในที่เก็บส่วนตัว (Supabase) ลิงก์เปิดไฟล์หมดอายุเอง · สิทธิ์ตามชนิดรายการ (RECORD_FILE_PERMS)",
    when: "ไฟล์แนบเอกสาร (ใบเสนอราคา ใบสั่งขาย เอกสารพนักงาน สลิป) และช่องไฟล์แนบในลิ้นชัก MasterCRUD",
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
    key: "export", label: "ส่งออก CSV / Excel", code: "lib/export", category: "data",
    source: { path: "lib/export" },
    what: "ส่งออกแถวที่เห็น / ที่เลือก / ทั้งหมดที่กรองไว้ เป็น CSV หรือ Excel",
    when: "ทุกปุ่มส่งออก",
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
    what: "กล่องมาตรฐานตอนโหลด ไม่มีข้อมูล หรือโหลดพลาด พร้อมปุ่มลองใหม่",
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
    what: "ข้อความ สำเร็จ / ผิดพลาด / เตือน ลอยมุมขวาบน",
    when: "หลังบันทึก ลบ ส่ง ทุกครั้ง",
  },

  // ───────── พิมพ์ ─────────
  {
    key: "print-panels", label: "พิมพ์เอกสาร / พิมพ์ตาราง", code: "DocPrintPanel · ListPrintPanel · usePrintLog", category: "print",
    source: { path: "components/report" },
    what: "แผงตั้งค่าพิมพ์ เลือกคอลัมน์ บันทึกประวัติการพิมพ์ บันทึกเป็นรูป",
    when: "ทุกหน้าพิมพ์เอกสารและพิมพ์รายการ",
    doc: "list-print.md",
  },
  {
    key: "doc-print-settings", label: "แถบตั้งค่าการพิมพ์เอกสาร", code: "DocPrintSettings", category: "print",
    source: { path: "components/doc-print-settings" },
    what: "เลือกแม่แบบ + ติ๊กคอลัมน์ที่จะโชว์ บนหน้าพิมพ์เอกสาร + สวิตช์พิมพ์ต้นฉบับ+สำเนา (CopiesSwitch · withCopies · ช่อง {{copy_label}} ในแม่แบบ · หลายใบเรียงทีละใบ) · ตัวเลือกเฉพาะเอกสาร (DOC_OPTIONS — ติ๊ก/ปุ่มเลือก · แผงวาดให้เอง เก็บใน prefs.options) · แถวหัวกลุ่มในตาราง ({ __group, __sum })",
  },
  {
    key: "print-setup-dialog", label: "หน้าปรับก่อนพิมพ์", code: "PrintSetupDialog", category: "print",
    source: { path: "components/print-setup-dialog" },
    what: "กดพิมพ์แล้วเปิดหน้าปรับก่อน ปรับแล้วเห็นผลทันที",
  },
  {
    key: "pattern-sheet", label: "แพทเทิร์นจากขนาดชิ้น (พิมพ์ 1:1 / DXF) + วาดชิ้นวัสดุ", code: "PatternPiecesSvg · PatternPrintView · ShapeEditor · lib/pattern-sheet · lib/pattern-shape", category: "print",
    source: { path: "components/pattern-sheet" },
    what: "เอากว้าง×ยาว×จำนวนชิ้นจากตาราง มาวาดเป็นชิ้นแพทเทิร์นขนาดจริง พิมพ์แบ่งหน้า A4 แล้วต่อกัน (มีกรอบทดสอบ 5 ซม.) หรือดาวน์โหลด DXF/SVG ส่งเครื่องตัด · ShapeEditor = หน้าต่างวาดชิ้นขนาดจริง (สี่เหลี่ยม วงกลม ปากกา วางจาก Illustrator ไม้บรรทัด ดูดเข้า พิมพ์ขนาด) → บรรทัดตีราคา + ชิ้นแพทเทิร์นรูปทรงจริง · เผื่อเย็บตั้งรายขอบได้ (เช่น ขอบปากพับ 3 ซม.) · PatternPrintView = ตัวหน้าพิมพ์กลาง (ภาพรวม + วางบนผ้า + A4 ขนาดจริง + DXF/SVG) ส่งบรรทัดเข้าไปก็ได้ทั้งหน้า",
    when: "งานที่มีขนาดชิ้นตัด เช่น ตีราคาใบงานออกแบบ (/print/design-sheet/<id>/pattern) และแอปสตูดิโอแพทเทิร์น (/print/pattern-project/<id>) — หน้าใหม่ที่ต้องพิมพ์แพทเทิร์นให้ส่งบรรทัดเข้า PatternPrintView",
    notWhen: "คำนวณผ้าที่ต้องใช้ ให้ใช้เครื่องคิดเลขผ้า (lib/fabric-calc + FabricLayoutPreview) · วาดอิสระ/แปะรูป/วางการ์ด (ไม่มีขนาดจริง) ให้ใช้กระดานวาด (CanvasSketch) · วาดบนรูปสินค้า ให้ใช้ ImageMarkup",
    doc: "pattern-sheet.md",
  },
  {
    key: "pattern-studio", label: "สตูดิโอแพทเทิร์น (กระดานวาด + ภาพ 3D + แม่แบบทรงกระเป๋า)", code: "PatternStudio · BagTemplateWizard · SewView · AssemblyView · SendCostingModal · lib/bag-templates · lib/pattern-seams · lib/pattern-assembly · lib/pattern-costing", category: "feature",
    source: { path: "components/pattern-studio" },
    what: "ครอบตัววาดชิ้นวัสดุเดิม แล้วเพิ่มปุ่มสร้างชิ้นจากแม่แบบทรงกระเป๋า (ใส่ขนาด → ได้ชิ้นแพทเทิร์นครบพร้อมภาพกระเป๋าที่เย็บแล้ว) กับภาพ 3D ของชิ้นบนกระดานที่ขยับตามทันที เลือกชิ้นฝั่งไหนอีกฝั่งสว่างตาม · SewView = เครื่องมือเย็บ (จับคู่ขอบที่เย็บติดกัน + เตือนความยาวไม่เท่ากัน) · AssemblyView = ประกอบชิ้นเป็นกระเป๋า 3D จากตะเข็บ + เย็บทีละขั้น + ติดหู/แผ่นปิดหลังช่องเอง · SendCostingModal = ส่งชิ้นไปเป็นบรรทัดตีราคาของใบงานออกแบบ (ไม่ลบบรรทัดเดิม) · PhotoModal = แกะจากรูป (ลอกเส้นจากรูปแพทเทิร์นกระดาษ ไม่ใช้ AI / คัดลอกคำสั่งไปใช้ AI ของผู้ใช้เองแล้ววางคำตอบกลับ ฟรี / ให้ AI ในระบบประมาณขนาดจากรูปกระเป๋า เสียเงิน) · เครื่องมือเย็บ/แก้ตะเข็บแบบ CLO อยู่บนกระดานวาดเอง (ส่ง sew → ShapeEditor seams) · ใช้ในแอปสตูดิโอแพทเทิร์น /pattern-studio",
    when: "หน้าที่ให้ผู้ใช้ทำแพทเทิร์นกระเป๋า/ชิ้นวัสดุแล้วอยากเห็นภาพ 3D ไปด้วย เช่น แท็บตีราคา (แบบวาด) ใบงานออกแบบ — รับค่าชุดเดียวกับ ShapeEditor แบบฝัง",
    notWhen: "ป๊อปวาดชิ้นเดี่ยวที่ไม่ต้องการ 3D ให้ใช้ ShapeEditor ตรง ๆ · การประกอบเป็นกระเป๋าต้องมีข้อมูลตะเข็บ จึงมีเฉพาะในแอปสตูดิโอแพทเทิร์น (ในแท็บตีราคาเห็นเป็นชิ้นแบน)",
    doc: "pattern-studio.md",
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
    key: "app-access-gate", label: "ด่านว่าใครเข้าแอปนี้ได้", code: "AppAccessGate", category: "layout",
    source: { path: "components/app-access-gate" },
    what: "กันคนที่ไม่มีสิทธิ์เข้าแอปแยก ใช้กฎเดียวกับเมนูหลัก",
    when: "หน้าที่ใช้ StandaloneShell หรือเปลือกของตัวเอง (เปลือกหลักกันให้อยู่แล้ว)",
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
    what: "กดชื่อผู้ใช้ แก้โปรไฟล์ เปลี่ยนสีธีม ออกจากระบบ",
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
    key: "scroll-tabs", label: "แถบแท็บเลื่อนได้", code: "ScrollTabs", category: "layout",
    source: { path: "components/scroll-tabs" },
    what: "แถบแท็บที่ยาวเกินจอ เลือกแท็บแล้วเลื่อนให้แท็บนั้นอยู่กลาง",
    when: "หน้าที่มีแท็บหลายอัน โดยเฉพาะบนมือถือ",
  },
  {
    key: "gallery-columns", label: "เลือกจำนวนการ์ดต่อแถว", code: "GalleryColumns", category: "layout",
    source: { path: "components/gallery-columns" },
    what: "ปุ่มเลือกว่ามุมมองกริดจะโชว์กี่การ์ดต่อแถว (จำค่าไว้)",
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
    what: "ลากเรียงลำดับรายการในลิสต์ตั้งค่า (ประเภทงาน สถานะ ฟิลด์ ฯลฯ)",
    when: "ทุกที่ที่ให้คนเรียงลำดับเอง",
  },
  {
    key: "line-item-columns", label: "จัดคอลัมน์ตารางบรรทัดเอกสาร", code: "LineColumnsManager", category: "table",
    source: { path: "components/line-item-columns" },
    what: "เลือกโชว์/ซ่อน ลากเรียง ตั้งชื่อคอลัมน์ ของตารางบรรทัดในใบเสนอ",
  },
  {
    key: "doc-calendar", label: "ปฏิทินเอกสาร", code: "DocCalendar", category: "table",
    source: { path: "components/doc-calendar" },
    what: "เอาเอกสารที่มีวันที่มาวางบนปฏิทินรายเดือน (ดูอย่างเดียว)",
    notWhen: "ถ้าต้องลากวางเพื่อตั้งวัน ให้ใช้ ScheduleBoard",
  },
  {
    key: "schedule-board", label: "ปฏิทินลากวางตั้งวัน", code: "ScheduleBoard", category: "table",
    source: { path: "components/schedule-board" },
    what: "ปฏิทินเดือน + กล่องยังไม่ลงวันที่ ลากการ์ดไปวางเพื่อตั้งวัน",
    notWhen: "ถ้าแค่โชว์เอกสารตามวัน ให้ใช้ DocCalendar",
  },

  // ช่องกรอก
  {
    key: "color-picker", label: "เลือกสี", code: "ColorPicker / ColorInput", category: "input",
    source: { path: "components/color-picker" },
    what: "แผงเลือกสีแบบลากได้ + ช่องรหัสสี ใช้ง่ายกว่าช่องสีของเบราว์เซอร์",
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
    key: "inline-edit", label: "โชว์ค่าก่อน กดถึงแก้", code: "InlineEdit", category: "input",
    source: { path: "components/inline-edit" },
    what: "โชว์ค่าเป็นข้อความสะอาด กดแล้วค่อยกลายเป็นช่องกรอก กันพิมพ์ทับเผลอ",
    when: "หน้าที่มีช่องกรอกเรียงกันเยอะ ๆ",
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
    what: "เลือกหลายฟิลด์ โชว์ที่เลือกเป็นชิป + ป๊อปค้นหา/จัดกลุ่ม",
  },
  {
    key: "table-column-select", label: "เลือกคอลัมน์จากตารางปลายทาง", code: "TableColumnSelect", category: "pick",
    source: { path: "components/table-column-select" },
    what: "ตอนสร้างช่องอ้างอิง เลือกว่าจะโชว์คอลัมน์ไหนของตารางปลายทาง (เลือกจากของจริง ไม่ต้องพิมพ์)",
  },
  {
    key: "icon-picker", label: "เลือกไอคอน (อีโมจิ)", code: "IconPicker", category: "pick",
    source: { path: "components/icon-picker" },
    what: "เลือกอีโมจิเป็นไอคอนของโมดูล/แท็ก",
    notWhen: "หน้าจอใหม่ห้ามใช้อีโมจิ ให้ใช้ไอคอนกลาง (Icon + ตัวเลือกไอคอนในชุด icon)",
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
    key: "marketing-sku-picker", label: "ป๊อปเลือกรุ่นแบบการ์ดรูป", code: "MarketingSkuPickerModal", category: "pick",
    source: { path: "components/marketing-sku-picker-modal" },
    what: "เลือกหลายรุ่นจากการ์ดรูป แยกแบรนด์ กรองป้าย (แบบหน้า SKU การตลาด)",
    notWhen: "เลือกรุ่นเดียวในช่องฟอร์ม ให้ใช้ ParentSkuPicker",
  },

  // รูปและไฟล์
  {
    key: "hover-image", label: "ชี้รูปแล้วเห็นรูปใหญ่", code: "HoverImage", category: "file",
    source: { path: "components/hover-image" },
    what: "รูปย่อ ชี้เมาส์แล้วรูปใหญ่ลอยทับทุกอย่าง (ไม่โดนกรอบตัด) มือถือแตะได้",
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
  },
  {
    key: "video-thumb", label: "ภาพย่อวิดีโอ", code: "VideoThumb", category: "file",
    source: { path: "components/video-thumb" },
    what: "ภาพย่อของวิดีโอในคลังและช่องวิดีโอ",
  },
  {
    key: "file-ref", label: "เปิดดูไฟล์จากที่อยู่กลาง", code: "FileRefLink", category: "file",
    source: { path: "components/file-ref" },
    what: "เปิดไฟล์ที่เก็บไว้ไม่ว่าอยู่ R2 หรือ Google Drive ด้วยรูปแบบที่อยู่เดียว",
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
    what: "ตั้งโทเคนบอท กลุ่มปลายทาง เปิด/ปิดการแจ้งต่อเหตุการณ์ ของทุกระบบในที่เดียว",
    notWhen: "การส่งข้อความจริงให้ผ่าน lib/line-send",
  },

  // ระบบ
  {
    key: "activity-feed", label: "ไทม์ไลน์ประวัติ", code: "ActivityFeed", category: "system",
    source: { path: "components/activity-feed" },
    what: "โชว์ประวัติว่าใครทำอะไร เปลี่ยนจากอะไรเป็นอะไร แบบไทม์ไลน์",
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
    when: "งานที่ต้องวาดมือ แปะรูป วางการ์ดสินค้า/งาน/คอนเทนต์ หรือจัดโซนอิสระ (กระดานแคมเปญ · ใบงานออกแบบ · บอร์ดจ่ายงาน)",
    notWhen: "ผังขั้นตอน/ผังตัดสินใจแบบกล่องต่อเส้น → ใช้กระดาน flowchart (FlowchartBoard)",
    doc: "canvas-sketch.md", sameJob: "drawing-board", primary: true,
  },
  {
    key: "flowchart-board", label: "กระดาน flowchart", code: "FlowchartBoard", category: "feature",
    source: { path: "components/flowchart-board" },
    what: "ผังกล่องต่อเส้นแบบ flowchart: เริ่ม/จบ ขั้นตอน คำถาม ใช่/ไม่ใช่ ที่เก็บ (ไอคอน Google Drive/R2/NAS ... จาก lib/storage-places) ไฟล์ โฟลเดอร์ โน้ต กรอบโซน (ลากหัวกรอบ = ย้ายทั้งกลุ่ม) · เส้นติดกล่องเสมอ หักมุมเอง · คัดลอก/วาง (วางข้ามหน้าได้ · วางข้อความจากที่อื่น = กล่องใหม่) · บันทึกอัตโนมัติ · บันทึกเป็นรูป",
    when: "ผังขั้นตอนงาน ผังตัดสินใจ ผังว่าอะไรไปเก็บที่ไหน (แผนผังการเก็บไฟล์)",
    notWhen: "วาดมือ แปะรูป วางการ์ดสินค้า → ใช้กระดานวาด (CanvasSketch) · ผังที่ระบบสร้างจากโค้ดเอง → ใช้แผนผังการทำงาน (flow-map)",
    doc: "flowchart-board.md", sameJob: "drawing-board",
  },
  {
    key: "team-plan", label: "แผนงานทีม", code: "TeamPlan", category: "feature",
    source: { path: "components/team-plan" },
    what: "กระดานงานจัดตามความด่วน/ความสำคัญ เพิ่มงานจากหน้าไหนก็ได้",
    doc: "team-plan.md",
  },
  {
    key: "record-tasks", label: "เช็กลิสต์งานของรายการ", code: "RecordTasksButton", category: "feature",
    source: { path: "components/record-tasks" },
    what: "ปุ่ม + ลิ้นชักเช็กลิสต์งาน/โน้ต ผูกกับรายการไหนก็ได้",
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
    what: "ตารางรูปสินค้าของรายการบนร้าน — ลากเรียง · ตั้งปก · ลบ (เหลือ ≥ 1) · ปุ่มเพิ่มจากคลังรูปของสินค้าที่จับคู่ + ป๊อปเลือกรูป (ListingImagePicker: เพิ่มรูปสินค้า / รูปตัวเลือก) · รูปจากระบบอยู่ในฟอร์มเป็น \"r2:<key>\"",
    when: "ลิ้นชักสินค้าบนร้าน: แท็บรูป LINE + Lazada · ป๊อปเลือกรูปตัวเลือก (LINE รายละเอียดตัวเลือก · Lazada รูป·น้ำหนัก·กล่อง)",
    notWhen: "คลังรูปของสินค้าในระบบ (หน้า Parent SKU) ให้ใช้ ProductImageGallery · อัปโหลดไฟล์ใหม่ ให้ใช้ ImageAttach",
    doc: "platform-catalog.md",
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
