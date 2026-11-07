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

export type PartCategory = "table" | "popup" | "input" | "pick" | "file" | "data" | "state" | "print" | "notify" | "system";

export const PART_CATEGORIES: { key: PartCategory; label: string; icon: string }[] = [
  { key: "table", label: "ตาราง", icon: "i:table" },
  { key: "popup", label: "ป๊อปอัป", icon: "i:layout-sidebar-right" },
  { key: "input", label: "ช่องกรอก / ฟอร์ม", icon: "i:forms" },
  { key: "pick", label: "เลือกข้อมูล", icon: "i:search" },
  { key: "file", label: "รูปและไฟล์", icon: "i:photo" },
  { key: "data", label: "นำเข้า-ส่งออก", icon: "i:file-import" },
  { key: "state", label: "สถานะหน้าจอ", icon: "i:hourglass" },
  { key: "print", label: "พิมพ์", icon: "i:printer" },
  { key: "notify", label: "แจ้งเตือน", icon: "i:bell" },
  { key: "system", label: "ระบบ / สิทธิ์", icon: "i:settings" },
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
  "pager": "แถบแบ่งหน้า",
  "line-items": "ตารางบรรทัดเอกสาร",
  "popup": "ป๊อปอัป",
  "loading": "สถานะกำลังโหลด",
  "select": "ช่องเลือกแบบพิมพ์ค้นหา",
  "sku-pick": "เลือกสินค้า",
  "supplier-pick": "เลือกร้าน / ผู้จำหน่าย",
  "unit-pick": "เลือกหน่วยนับ",
  "employee-pick": "เลือกพนักงาน",
  "attach": "แนบไฟล์",
  "markup": "วาด / ทำเครื่องหมายบนรูป",
  "import": "นำเข้าไฟล์ Excel / CSV",
  "permission": "สิทธิ์ผู้ใช้",
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
    sameJob: "line-items",
    note: "ทำงานคล้ายตารางบรรทัดเอกสารกลาง — ควรตรวจว่ารวมกันได้ไหม (ยังไม่ตัดสินใจ)",
  },
  {
    key: "pager", label: "แถบแบ่งหน้า", code: "Pager", category: "table",
    source: { path: "components/pager" },
    what: "บอกจำนวนทั้งหมด + ปุ่มหน้าก่อน/ถัดไป + เลือกจำนวนต่อหน้า",
    when: "รายการยาวที่ต้องแบ่งหน้า (ตารางกลางมีให้ในตัวแล้ว)",
    sameJob: "pager", primary: true,
  },
  {
    key: "pager-bar", label: "แถบแบ่งหน้า แบบที่ 2", code: "PagerBar", category: "table",
    source: { path: "components/pager-bar" },
    what: "แถบเลื่อนหน้าอีกแบบ ทำงานเหมือน Pager",
    notWhen: "งานใหม่ให้ใช้ Pager",
    sameJob: "pager",
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

  // ───────── ป๊อปอัป ─────────
  {
    key: "modal", label: "หน้าต่างเด้ง + ยืนยัน + ลิ้นชัก", code: "ERPModal · ConfirmDialog · Drawer", category: "popup",
    source: { path: "components/modal" },
    what: "ป๊อปอัปกลางทุกแบบ ถามก่อนปิดเมื่อมีข้อมูลยังไม่บันทึก มีแบบปุ่มอันตราย จำขนาดที่ผู้ใช้ลากไว้",
    when: "ทุกป๊อปอัป ทุกการยืนยันลบ / อนุมัติ / ยกเลิก ทุกลิ้นชักด้านข้าง",
    notWhen: "ห้ามเขียนป๊อปอัปเองในหน้า",
    doc: "popup-policy.md", sameJob: "popup", primary: true, legacyKey: "erp_modal",
  },
  {
    key: "resizable-modal", label: "ป๊อปอัปลากขยายได้", code: "ResizableModal", category: "popup",
    source: { path: "components/resizable-modal" },
    what: "หน้าต่างลากมุมปรับขนาด จำขนาดไว้ ใช้ฝังหน้าอื่นเป็นป๊อป",
    sameJob: "popup",
    note: "ป๊อปอัปกลางลากปรับขนาดได้แล้ว — ควรตรวจว่ายังต้องมีตัวนี้แยกไหม",
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
    key: "search-pick", label: "ช่องเลือกแบบพิมพ์ค้นหา แบบที่ 2", code: "SearchPick", category: "input",
    source: { path: "components/search-pick" },
    what: "ทำงานเหมือน SearchableSelect",
    notWhen: "งานใหม่ให้ใช้ SearchableSelect",
    sameJob: "select",
  },

  // ───────── เลือกข้อมูล ─────────
  {
    key: "sku-picker", label: "เลือกสินค้า (SKU)", code: "SkuPicker", category: "pick",
    source: { path: "components/pickers", names: ["SkuPicker"] },
    what: "ค้นหาสินค้าด้วยรหัสหรือชื่อ มีรูปย่อ จำตัวที่เลือกล่าสุด",
    when: "ทุกช่องที่ต้องเลือกสินค้า 1 ตัว",
    notWhen: "เลือกหลายตัวพร้อมกัน ให้ใช้ SkuMultiPicker",
    sameJob: "sku-pick", primary: true,
    note: "ตัวที่ใช้จริงทั้งระบบ — ทะเบียนเดิมชี้ไปตัวเก่า (ProductPicker)",
  },
  {
    key: "product-picker-old", label: "เลือกสินค้า ตัวเก่า", code: "ProductPicker", category: "pick",
    source: { path: "components/pickers", names: ["ProductPicker"] },
    what: "อ่านตารางสินค้าชุดทดลองเก่า (playground-products) ไม่ใช่สินค้าจริง",
    notWhen: "ห้ามใช้ในงานใหม่ ให้ใช้ SkuPicker",
    sameJob: "sku-pick", replacedBy: "sku-picker", legacyKey: "product_picker",
  },
  {
    key: "sku-image-picker", label: "เลือกสินค้าแบบกริดรูป", code: "SkuImagePicker", category: "pick",
    source: { path: "components/sku-image-picker" },
    what: "กริดรูปสินค้าให้กดเลือก",
    sameJob: "sku-pick",
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
    notWhen: "ห้ามใช้ SupplierPicker ตัวเก่าใน components/pickers (ค้นร้านจริงไม่เจอ)",
    sameJob: "supplier-pick", primary: true,
  },
  {
    key: "supplier-picker-old", label: "เลือกร้าน ตัวเก่า", code: "SupplierPicker (ชุด pickers)", category: "pick",
    source: { path: "components/pickers", names: ["SupplierPicker"] },
    what: "อ่านตารางร้านของระบบจัดซื้อชุดเก่าที่มีแค่ 5 ร้าน ทำให้ค้นร้านจริงไม่เจอ",
    notWhen: "ห้ามใช้ในงานใหม่ ให้ใช้ SupplierPicker (components/supplier-picker)",
    sameJob: "supplier-pick", replacedBy: "supplier-picker", legacyKey: "supplier_picker",
    note: "เหลือที่เดียว: หน้า /purchase-orders (ระบบจัดซื้อชุดเก่า ตารางใบสั่งซื้อผูกกับตารางร้าน 5 ร้านนี้เอง ยังไม่เคยมีใบจริง) ห้ามเปลี่ยนเป็นตัวใหม่เฉย ๆ เพราะบันทึกจะไม่ผ่าน ต้องตัดสินใจเลิกระบบนั้นก่อน",
  },
  {
    key: "customer-picker", label: "เลือกลูกค้า", code: "CustomerPicker", category: "pick",
    source: { path: "components/pickers", names: ["CustomerPicker"] },
    what: "ค้นหาลูกค้าด้วยรหัส/ชื่อ จำตัวล่าสุด",
    when: "เอกสารขายทุกใบ",
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
    key: "unit-picker", label: "เลือกหน่วยนับ (ตาราง units)", code: "UnitPicker", category: "pick",
    source: { path: "components/pickers", names: ["UnitPicker"] },
    what: "เลือกหน่วยนับจากตาราง units",
    sameJob: "unit-pick",
    note: "ทะเบียนหน่วยนับแยกเป็น 2 ตาราง (units กับ uoms) — ต้องเลือกว่าจะใช้ตารางไหนเป็นหลัก",
  },
  {
    key: "uom-picker", label: "เลือกหน่วยนับ (ตาราง uoms)", code: "UomPicker", category: "pick",
    source: { path: "components/uom-picker" },
    what: "เลือกหน่วยนับจากตาราง uoms (ทะเบียนหน่วยของสินค้า)",
    sameJob: "unit-pick",
  },
  {
    key: "employee-picker", label: "เลือกพนักงาน (ทะเบียน master)", code: "EmployeePicker", category: "pick",
    source: { path: "components/pickers", names: ["EmployeePicker"] },
    what: "เลือกพนักงานจากทะเบียน master",
    sameJob: "employee-pick",
  },
  {
    key: "real-employee-picker", label: "เลือกพนักงานจริง (HR)", code: "RealEmployeePicker", category: "pick",
    source: { path: "components/real-employee-picker" },
    what: "เลือกพนักงานจากตารางพนักงานจริงของ HR / เงินเดือน",
    when: "งาน HR เงินเดือน บันทึกงาน",
    sameJob: "employee-pick",
  },
  {
    key: "dept-tax-picker", label: "เลือกแผนก / เลือกภาษี", code: "DepartmentPicker · TaxPicker", category: "pick",
    source: { path: "components/pickers", names: ["DepartmentPicker", "TaxPicker"] },
    what: "มีให้ใช้ แต่ยังไม่มีหน้าจริงเรียกใช้",
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
    key: "file-drop", label: "ลากไฟล์มาวาง", code: "useFileDrop", category: "file",
    source: { path: "components/file-drop" },
    what: "ให้กล่องไหนก็ได้รับไฟล์ที่ลากมาวาง",
    when: "ทุกจุดที่อัปโหลดได้",
    doc: "file-drop.md",
  },
  {
    key: "attachment-panel", label: "แผงไฟล์แนบของเอกสาร", code: "AttachmentPanel", category: "file",
    source: { path: "components/attachment-panel" },
    what: "แนบไฟล์กับเอกสาร (เก็บแยกตาราง attachments) ดู ดาวน์โหลด ลบ",
    sameJob: "attach",
    note: "หัวไฟล์เขียนว่าทุกโมดูลต้องใช้ตัวนี้ แต่มีอีก 3 ตัวทำงานคล้ายกัน — ยังไม่ได้เลือกตัวหลัก",
  },
  {
    key: "file-input", label: "ช่องไฟล์แนบเดี่ยว", code: "FileInput", category: "file",
    source: { path: "components/file-input" },
    what: "อัปโหลดไฟล์แนบ 1 ไฟล์ (รูปหรือ PDF)",
    sameJob: "attach",
  },
  {
    key: "file-multi-input", label: "ช่องไฟล์แนบหลายไฟล์", code: "FileMultiInput", category: "file",
    source: { path: "components/file-multi-input" },
    what: "อัปโหลดไฟล์แนบหลายไฟล์ (รูปและ PDF)",
    sameJob: "attach",
  },
  {
    key: "record-files", label: "ช่องไฟล์แนบในฟอร์ม", code: "RecordFilesField", category: "file",
    source: { path: "components/record-files" },
    what: "ช่องไฟล์แนบที่ใช้ในลิ้นชัก MasterCRUD ทุกโมดูล",
    sameJob: "attach",
  },
  {
    key: "image-markup", label: "วาดบนรูปแบบกระดาน", code: "ImageMarkup", category: "file",
    source: { path: "components/image-markup" },
    what: "วาดสี่เหลี่ยม วงกลม ลูกศร ข้อความ บนรูป",
    doc: "image-markup.md", sameJob: "markup",
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
    doc: "image-regions.md", sameJob: "markup",
  },
  {
    key: "image-area-marker", label: "กรอบบนรูป", code: "ImageAreaMarker", category: "file",
    source: { path: "components/image-area-marker" },
    what: "วาด/ย้าย/ปรับขนาดกรอบบนรูป (ค่าเป็น % ของรูป)",
    sameJob: "markup",
  },

  // ───────── นำเข้า-ส่งออก ─────────
  {
    key: "import-wizard", label: "ตัวช่วยนำเข้าไฟล์", code: "ImportWizard", category: "data",
    source: { path: "components/import-wizard" },
    what: "อ่านไฟล์ Excel/CSV → จับคู่คอลัมน์ → ตรวจ → นำเข้า",
    sameJob: "import",
  },
  {
    key: "import-dialog", label: "ป๊อปนำเข้า CSV แบบเก่า", code: "ImportDialog", category: "data",
    source: { path: "components/import-export" },
    what: "นำเข้า CSV ตาม field config",
    sameJob: "import",
  },
  {
    key: "line-import", label: "ลงรายการสินค้าแบบตาราง Excel", code: "LineImport", category: "data",
    source: { path: "components/line-import" },
    what: "โหลดแม่แบบ → กรอกใน Excel → โยนกลับมาเป็นบรรทัดเอกสาร",
    sameJob: "import",
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
    doc: "state-views.md", sameJob: "loading", primary: true,
  },
  {
    key: "skeleton", label: "โครงเทากระพริบตอนโหลด", code: "Skeleton", category: "state",
    source: { path: "components/skeleton" },
    what: "แถบเทากระพริบระหว่างโหลด",
    sameJob: "loading",
    note: "หัวไฟล์เขียนว่าทุกหน้าต้องใช้ แต่ไม่มีหน้าไหนใช้",
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
    what: "เลือกแม่แบบ + ติ๊กคอลัมน์ที่จะโชว์ บนหน้าพิมพ์เอกสาร",
  },
  {
    key: "print-setup-dialog", label: "หน้าปรับก่อนพิมพ์", code: "PrintSetupDialog", category: "print",
    source: { path: "components/print-setup-dialog" },
    what: "กดพิมพ์แล้วเปิดหน้าปรับก่อน ปรับแล้วเห็นผลทันที",
  },
  {
    key: "print-history", label: "ป้ายพิมพ์แล้ว N ครั้ง", code: "PrintHistoryBadge", category: "print",
    source: { path: "components/print-history" },
    what: "บอกว่าเอกสารนี้พิมพ์ไปกี่ครั้ง ล่าสุดเมื่อไหร่ ใครพิมพ์",
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
    what: "เด้งเตือนงานค้างตอนเปิด ERP (ตั้งเงื่อนไขได้)",
  },
  {
    key: "line-send", label: "ส่งข้อความ LINE", code: "lib/line-send", category: "notify",
    source: { path: "lib/line-send" },
    what: "ด่านกลางส่งข้อความ LINE (นับโควตา กันส่งซ้ำ)",
    when: "ทุกการส่ง LINE",
    notWhen: "ห้ามยิง LINE API เองในหน้า/API อื่น",
  },

  // ───────── ระบบ / สิทธิ์ ─────────
  {
    key: "auth", label: "สิทธิ์ผู้ใช้ (หน้าจอ)", code: "usePermission · AccessDenied", category: "system",
    source: { path: "components/auth" },
    what: "เช็กว่าใครเห็นหรือกดอะไรได้ ซ่อนปุ่มที่ไม่มีสิทธิ์ โชว์หน้าไม่มีสิทธิ์",
    when: "ทุกหน้าและทุกปุ่มที่ต้องมีสิทธิ์",
    doc: "phase-1-1-permissions.md", sameJob: "permission", primary: true,
  },
  {
    key: "api-auth", label: "ด่านสิทธิ์ฝั่งเซิร์ฟเวอร์", code: "guardApi · apiCan", category: "system",
    source: { path: "lib/api-auth" },
    what: "เช็กสิทธิ์ก่อนให้ API ทำงาน (ไม่มีสิทธิ์ = ตอบ 401)",
    when: "ทุก API ที่อ่าน/แก้ข้อมูลสำคัญ",
  },
  {
    key: "permission-old", label: "สิทธิ์ ชุดทดลองเก่า", code: "components/permission", category: "system",
    source: { path: "components/permission" },
    what: "บทบาทตายตัว 4 แบบ ใช้แค่หน้าทดลองที่ไม่ได้ขึ้นเว็บจริง",
    notWhen: "ห้ามใช้ ระบบจริงใช้ usePermission",
    sameJob: "permission", replacedBy: "auth",
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
    notWhen: "ห้ามใช้อีโมจิในหน้าใหม่",
    doc: "icon-system.md",
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
  {
    key: "keep-warm", label: "กันเว็บหลับ สมัย Cloudflare", code: "KeepWarm", category: "system",
    source: { path: "components/keep-warm" },
    what: "ยิงคำขอเป็นระยะกันเว็บช้าตอนตื่น (ปัญหาของ Cloudflare)",
    notWhen: "ย้ายเว็บมา Vercel แล้ว ไม่จำเป็น",
  },
  {
    key: "workflow-old", label: "สถานะใบขอซื้อ ชุดทดลองเก่า", code: "components/workflow", category: "system",
    source: { path: "components/workflow" },
    what: "ป้ายสถานะ PR แบบตายตัว ใช้แค่หน้าทดลองที่ไม่ได้ขึ้นเว็บจริง",
    notWhen: "สถานะจริงอยู่ใน lib/status-config และทะเบียน workflow",
  },
  {
    key: "studio-launcher", label: "ปุ่มเปิดตัวจัดเลย์เอาต์", code: "StudioLauncher", category: "system",
    source: { path: "components/studio-launcher" },
    what: "เปิดตัวจัดหน้า (StudioPanel) จากที่ไหนก็ได้",
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
  dup: "ทำงานซ้ำ",
  deprecated: "ตัวเก่า ควรเลิก",
  single: "ใช้ที่เดียว",
  nodoc: "ไม่มีคู่มือ",
  check: "ยังไม่เลือกตัวหลัก",
};

export type PartRow = SharedPart & {
  usage: SourceUsage | null;
  flags: PartFlag[];
  /** ตัวอื่นในกลุ่มงานเดียวกัน */
  siblings: string[];
};

/** รวมทะเบียน + ผลนับ → แถวพร้อมป้าย (ไม่มีใครใช้ / ซ้ำ / ตัวเก่า / ใช้ที่เดียว / ไม่มีคู่มือ) */
export function buildPartRows(parts: SharedPart[], usage: Pick<SharedPartsUsage, "sources">): PartRow[] {
  const byJob = new Map<string, SharedPart[]>();
  for (const p of parts) if (p.sameJob) byJob.set(p.sameJob, [...(byJob.get(p.sameJob) ?? []), p]);
  return parts.map((p) => {
    const u = usage.sources[sourceId(p.source)] ?? null;
    const group = p.sameJob ? byJob.get(p.sameJob) ?? [] : [];
    const siblings = group.filter((g) => g.key !== p.key).map((g) => g.key);
    const flags: PartFlag[] = [];
    if (u && u.files === 0) flags.push("unused");
    if (p.replacedBy) flags.push("deprecated");
    if (siblings.length && !p.primary && !p.replacedBy) flags.push(group.some((g) => g.primary) ? "dup" : "check");
    if (u && u.files > 0 && u.placeCount === 1) flags.push("single");
    if (!p.doc && !p.replacedBy && u && u.placeCount >= 3) flags.push("nodoc");
    return { ...p, usage: u, flags, siblings };
  });
}

/** source path ที่ลงทะเบียนแล้ว (ใช้แยก "ยังไม่ลงทะเบียน") */
export function registeredPaths(parts: SharedPart[] = SHARED_PARTS): Set<string> {
  return new Set(parts.map((p) => p.source.path));
}
