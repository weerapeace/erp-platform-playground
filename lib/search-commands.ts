/**
 * search-commands — ทะเบียน "คำสั่งลัด" ของ Global Search (Ctrl+K)
 *
 * พิมพ์กริยา + ชื่อเอกสาร เช่น "สร้าง PO", "เพิ่ม SKU", "เปิดใบขายใหม่" → เด้งไปหน้านั้น
 * พร้อมเปิดฟอร์มสร้างใหม่ทันที (หน้าปลายทางรับ `?new=1` ผ่านของกลาง useNewParam ใน lib/open-param)
 *
 * เพิ่มคำสั่งใหม่ = เพิ่ม 1 แถวใน COMMANDS (ต้องมี perm ให้ตรงกับสิทธิ์ "สร้าง" ของโมดูลนั้น)
 * ไฟล์นี้ pure (ไม่มี React) ใช้ได้ทั้ง client/server
 */

export type SearchCommand = {
  id: string;
  /** ป้ายที่โชว์ เช่น "สร้างใบสั่งซื้อ (PO) ใหม่" */
  label: string;
  /** คำที่คนมักพิมพ์ (ไม่ต้องใส่กริยา — กริยาเช็คแยก) */
  aliases: string[];
  href: string;
  /** สิทธิ์ที่ต้องมี (ไม่มี = ทุกคน) */
  perm?: string;
  icon: string;
  /** ขอบเขต (lib/search-scopes) — ค้นในแอปเดี่ยว (เช่น payroll) จะเห็นเฉพาะคำสั่งของ scope นั้น · ค้นรวมเห็นทุกคำสั่ง */
  scope?: string;
};

/** กริยาที่แปลว่า "อยากสร้าง/เปิดใหม่" — ถ้าคำค้นมีตัวใดตัวหนึ่ง คำสั่งจะได้คะแนนสูงกว่าหน้า/เมนูธรรมดา */
export const CREATE_VERBS = ["สร้าง", "เพิ่ม", "เปิด", "ออก", "ใหม่", "ทำ", "new", "create", "add", "open"];

export const COMMANDS: SearchCommand[] = [
  { id: "new-sku",      icon: "📦", label: "เพิ่มสินค้า (SKU) ใหม่",        aliases: ["sku", "สินค้า", "รหัสสินค้า", "product"],                    href: "/master/skus?new=1",                perm: "products.create" },
  { id: "new-partner",  icon: "🏢", label: "เพิ่มคู่ค้า / ร้าน / ลูกค้าใหม่",  aliases: ["คู่ค้า", "ร้าน", "ลูกค้า", "ซัพ", "supplier", "customer", "partner"], href: "/master/partners?new=1",     perm: "products.create" },
  { id: "new-po",       icon: "🧾", label: "เปิดใบสั่งซื้อ (PO) ใหม่",        aliases: ["po", "ใบสั่งซื้อ", "สั่งซื้อ", "purchase order"],              href: "/purchasing/po-list?new=1",         perm: "products.edit" },
  { id: "new-mo",       icon: "🏭", label: "เปิดใบสั่งผลิต (MO) ใหม่",        aliases: ["mo", "ใบสั่งผลิต", "สั่งผลิต", "ผลิต", "manufacturing"],       href: "/master/manufacturing-orders?new=1", perm: "products.create" },
  { id: "new-invoice",  icon: "🧾", label: "เปิดใบขาย / ใบกำกับใหม่",         aliases: ["ใบขาย", "บิล", "ใบกำกับ", "invoice", "so", "ขาย"],           href: "/sales-orders?new=1",               perm: "so.create" },
  { id: "new-quote",    icon: "📝", label: "สร้างใบเสนอราคาใหม่",            aliases: ["ใบเสนอราคา", "เสนอราคา", "quotation", "qt", "quote"],          href: "/quotations?new=1",                 perm: "qt.create" },
  { id: "new-billing",  icon: "📑", label: "สร้างใบวางบิลใหม่",              aliases: ["ใบวางบิล", "วางบิล", "billing"],                              href: "/billing-notes?new=1",              perm: "so.create" },
  { id: "new-delivery", icon: "🚚", label: "สร้างใบส่งสินค้าใหม่",            aliases: ["ใบส่งสินค้า", "ใบส่งของ", "ส่งของ", "delivery"],               href: "/delivery-notes?new=1",             perm: "so.create" },
  { id: "new-cn",       icon: "➖", label: "สร้างใบลดหนี้ใหม่",               aliases: ["ใบลดหนี้", "ลดหนี้", "credit note", "cn"],                     href: "/credit-notes?new=1",               perm: "cn.create" },
  { id: "new-task",     icon: "🎨", label: "สร้างงาน Creative ใหม่",          aliases: ["งาน", "task", "งานใหม่", "creative"],                          href: "/tasks?new=1",                      perm: "tasks.create" },
  { id: "go-receive",   icon: "📥", label: "ไปหน้ารับสินค้าเข้า",              aliases: ["รับของ", "รับสินค้า", "ของเข้า", "receive"],                   href: "/purchasing/receive" },
  { id: "go-scan",      icon: "📷", label: "เปิดสถานีสแกน",                   aliases: ["สแกน", "scan", "qr", "ยิงบาร์โค้ด"],                          href: "/scan" },
  // ---- 💰 Payroll (scope "payroll") — หน้า MasterCRUD รับ ?new=1 อยู่แล้ว ----
  { id: "new-employee",   icon: "🧑‍💼", label: "เพิ่มพนักงานใหม่",                aliases: ["พนักงาน", "employee", "คน", "ลูกน้อง"],                  href: "/payroll/employees?new=1",   perm: "employees.create", scope: "payroll" },
  { id: "new-contract",   icon: "📄", label: "เพิ่มสัญญาจ้างใหม่",               aliases: ["สัญญา", "สัญญาจ้าง", "contract"],                          href: "/payroll/contracts?new=1",   perm: "employees.create", scope: "payroll" },
  { id: "new-period",     icon: "📅", label: "เปิดงวดเงินเดือนใหม่",             aliases: ["งวด", "งวดเงินเดือน", "period"],                            href: "/payroll/periods?new=1",     perm: "payroll.calculate", scope: "payroll" },
  { id: "go-resign",      icon: "🚪", label: "ไปหน้าแจ้งลาออก",                  aliases: ["ลาออก", "แจ้งลาออก", "resign", "resignation"],              href: "/payroll/resignations",      perm: "employees.view",   scope: "payroll" },
  { id: "go-calc",        icon: "🧮", label: "ไปคำนวณงวดเงินเดือน",              aliases: ["คำนวณ", "คำนวณงวด", "คิดเงินเดือน", "calc"],                 href: "/payroll/calc-run",          perm: "payroll.calculate", scope: "payroll" },
  { id: "go-manual",      icon: "📝", label: "ไปหน้าข้อมูลคำนวณ (สาย/ขาด/OT)",   aliases: ["ข้อมูลคำนวณ", "สาย", "ขาด", "ot", "ตารางเข้างาน", "โอที"],   href: "/payroll/manual-input",      perm: "employees.view",   scope: "payroll" },
  { id: "go-payslip",     icon: "🧾", label: "ไปหน้าสลิปเงินเดือน",               aliases: ["สลิป", "payslip", "slip"],                                   href: "/payroll/payslips",          perm: "employees.view",   scope: "payroll" },
  // ---- 📝 App Subscription (scope "subscriptions") ----
  { id: "new-subscription", icon: "📝", label: "เพิ่ม subscription ใหม่",          aliases: ["subscription", "สมาชิก", "แอป", "บริการ", "sub"],             href: "/subscriptions?new=1",       perm: "subscriptions.edit", scope: "subscriptions" },
];

const norm = (s: string) => s.toLowerCase().trim();

/**
 * หาคำสั่งที่ตรงกับคำค้น — คืนพร้อมคะแนน (มาก = ขึ้นก่อน) · 0 = ไม่ตรง
 * กติกา: ต้องมี "คำหลัก" (alias/ป้าย) เจอ · ถ้ามีกริยาสร้างด้วย → บวกคะแนน
 */
export function matchCommands(query: string, can: (perm?: string) => boolean, scope?: string | null): { cmd: SearchCommand; score: number }[] {
  const q = norm(query);
  if (!q) return [];
  const toks = q.split(/\s+/).filter(Boolean);
  const verbHit = CREATE_VERBS.some((v) => q.includes(v));
  // ตัดกริยาออก เหลือคำหลัก
  const core = toks.map((t) => CREATE_VERBS.reduce((acc, v) => acc.replace(v, ""), t)).filter(Boolean);
  const out: { cmd: SearchCommand; score: number }[] = [];
  for (const cmd of COMMANDS) {
    if (scope && cmd.scope !== scope) continue;   // ค้นในแอปเดี่ยว → เฉพาะคำสั่งของแอปนั้น
    if (!can(cmd.perm)) continue;
    const hay = [norm(cmd.label), ...cmd.aliases.map(norm)];
    const keyToks = core.length ? core : toks;
    const allHit = keyToks.every((t) => hay.some((h) => h.includes(t)));
    if (!allHit) continue;
    const exactAlias = cmd.aliases.some((a) => norm(a) === core.join(" ") || norm(a) === q);
    let score = exactAlias ? 80 : 50;
    if (verbHit) score += 30;                 // "สร้าง PO" ชัดว่าอยากสร้าง → ขึ้นก่อน
    if (norm(cmd.label).includes(q)) score += 10;
    out.push({ cmd, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}
