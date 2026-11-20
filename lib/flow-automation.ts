/**
 * ⚡ กล่อง "อัตโนมัติ" บนกระดาน flowchart กลาง (เจ้าของสั่ง 2026-11-20 แบบ A + ข้อ 1-4)
 *   1 กล่อง = 1 กฎ: เมื่อ (เหตุการณ์) · ถ้า (เงื่อนไข ไม่ใส่ก็ได้) · ให้ (ทำอะไร ได้หลายอย่าง) · สถานะ แผน/กำลังทำ/ใช้งานอยู่/ปิดไว้
 *   ⚠️ รอบนี้ "จดกฎ" อย่างเดียว — ระบบยังไม่ทำงานตามกฎเอง (ต่อให้ทำงานจริงทีละกฎในงานถัดไป โดยอ้าง key ในทะเบียนนี้)
 *   ทะเบียนเหตุการณ์ (เมื่อ) + การกระทำ (ให้) อยู่ที่นี่ที่เดียว → ทุกกล่องเรียกชื่อตรงกัน · ไม่มีในรายการ = พิมพ์เองได้ (text)
 *   wf = รหัส workflow ใน lib/workflow-registry ที่เหตุการณ์นี้มาจาก (ไว้ไล่ต่อทีหลัง)
 * ไม่มี React · ไม่ import อะไร · เทสต์: lib/__tests__/flow-automation.test.ts
 */

export type AutoRef = { key: string; th: string; en: string; icon: string; group: string; wf?: string };

/** เหตุการณ์ "เมื่อ" — เพิ่มได้ (key ห้ามเปลี่ยนเมื่อมีกล่องใช้แล้ว) */
export const AUTO_TRIGGERS: AutoRef[] = [
  { key: "pr_submitted",   group: "ซื้อ",   th: "ส่งใบขอซื้อ",             en: "Purchase request submitted", icon: "i:file-text",          wf: "purchasing" },
  { key: "pr_approved",    group: "ซื้อ",   th: "อนุมัติใบขอซื้อ",          en: "Purchase request approved",  icon: "i:circle-check",       wf: "purchasing" },
  { key: "po_created",     group: "ซื้อ",   th: "สร้างใบสั่งซื้อ",          en: "Purchase order created",     icon: "i:shopping-cart",      wf: "purchasing" },
  { key: "goods_received", group: "ซื้อ",   th: "รับของเข้า",              en: "Goods received",             icon: "i:package-import",     wf: "purchasing" },
  { key: "mo_opened",      group: "ผลิต",   th: "เปิดใบสั่งผลิต",           en: "Manufacturing order opened", icon: "i:building-factory-2", wf: "mo-production" },
  { key: "mo_done",        group: "ผลิต",   th: "ใบสั่งผลิตเสร็จ (ปิดใบ)",   en: "Manufacturing order done",   icon: "i:building-factory-2", wf: "mo-production" },
  { key: "wo_submitted",   group: "จ่ายงาน", th: "ช่างส่งงาน",              en: "Worker submitted work",      icon: "i:hammer",             wf: "mo-production" },
  { key: "qc_failed",      group: "จ่ายงาน", th: "QC ไม่ผ่าน",              en: "QC failed",                  icon: "i:alert-triangle",     wf: "mo-production" },
  { key: "so_created",     group: "ขาย",    th: "ได้ใบสั่งขายใหม่",          en: "New sales order",            icon: "i:receipt", wf: "sales-order" },
  { key: "platform_order", group: "ขาย",    th: "มีออเดอร์จากแพลตฟอร์ม",     en: "New platform order",         icon: "i:shopping-bag", wf: "platform-order" },
  { key: "payment_in",     group: "ขาย",    th: "ลูกค้าจ่ายเงิน",            en: "Customer paid",              icon: "i:cash" },
  { key: "dn_shipped",     group: "ขาย",    th: "ส่งของแล้ว",               en: "Delivered",                  icon: "i:truck-delivery" },
  { key: "stock_low",      group: "คลัง",   th: "สต็อกต่ำกว่าขั้นต่ำ",        en: "Stock below minimum",        icon: "i:box" },
  { key: "file_uploaded",  group: "ทั่วไป",  th: "มีไฟล์ใหม่เข้า",            en: "New file uploaded",          icon: "i:upload" },
  { key: "task_overdue",   group: "ทั่วไป",  th: "งานเกินกำหนด",             en: "Task overdue",               icon: "i:alarm" },
  { key: "schedule",       group: "ทั่วไป",  th: "ตามเวลา (ทุกวัน / ทุกสัปดาห์)", en: "On a schedule",            icon: "i:calendar" },
];

/** การกระทำ "ให้" */
export const AUTO_ACTIONS: AutoRef[] = [
  { key: "notify_line",   group: "แจ้ง",   th: "แจ้ง LINE",              en: "Send LINE message",    icon: "i:brand-line" },
  { key: "notify_app",    group: "แจ้ง",   th: "แจ้งเตือนในระบบ",         en: "In-app notification",  icon: "i:bell" },
  { key: "send_email",    group: "แจ้ง",   th: "ส่งอีเมล",               en: "Send email",           icon: "i:mail" },
  { key: "create_task",   group: "สร้าง",  th: "สร้างงาน (Task)",         en: "Create a task",        icon: "i:checklist" },
  { key: "create_pr",     group: "สร้าง",  th: "สร้างใบขอซื้อ",           en: "Create purchase request", icon: "i:file-text" },
  { key: "create_doc",    group: "สร้าง",  th: "สร้างเอกสาร / PDF",       en: "Create document / PDF", icon: "i:file-text" },
  { key: "set_status",    group: "เปลี่ยน", th: "เปลี่ยนสถานะเอกสาร",      en: "Change document status", icon: "i:arrows-exchange" },
  { key: "update_stock",  group: "เปลี่ยน", th: "ปรับสต็อก",              en: "Adjust stock",         icon: "i:box" },
  { key: "save_drive",    group: "เปลี่ยน", th: "เก็บไฟล์ลง Google Drive", en: "Save file to Drive",   icon: "i:upload" },
];

export const AUTO_STATUSES = ["plan", "doing", "live", "off"] as const;
export type AutoStatus = (typeof AUTO_STATUSES)[number];
export const AUTO_STATUS_META: Record<AutoStatus, { th: string; en: string; cls: string }> = {
  plan:  { th: "แผน",       en: "Plan",    cls: "border-slate-200 bg-slate-50 text-slate-600" },
  doing: { th: "กำลังทำ",    en: "Building", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  live:  { th: "ใช้งานอยู่",  en: "Live",    cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  off:   { th: "ปิดไว้",     en: "Off",     cls: "border-rose-200 bg-rose-50 text-rose-700" },
};

/** อ้างถึงเหตุการณ์/การกระทำ: key = จากทะเบียน · text = พิมพ์เอง (หรือรายละเอียดเพิ่ม เช่น "ฝ่ายขาย") */
export type AutoPick = { key?: string; text?: string };
export type FlowAuto = { when?: AutoPick; cond?: string; acts: AutoPick[]; status: AutoStatus };

export const AUTO_ACTS_MAX = 8;
const TRIG = new Map(AUTO_TRIGGERS.map((r) => [r.key, r]));
const ACT = new Map(AUTO_ACTIONS.map((r) => [r.key, r]));
export const autoTrigger = (key?: string): AutoRef | undefined => (key ? TRIG.get(key) : undefined);
export const autoAction = (key?: string): AutoRef | undefined => (key ? ACT.get(key) : undefined);
export const isAutoStatus = (v: unknown): v is AutoStatus => typeof v === "string" && (AUTO_STATUSES as readonly string[]).includes(v);

const cleanPick = (raw: unknown, known: Map<string, AutoRef>): AutoPick | null => {
  const o = (raw ?? {}) as Record<string, unknown>;
  const key = typeof o.key === "string" && known.has(o.key) ? o.key : undefined;
  const text = typeof o.text === "string" && o.text.trim() ? o.text.trim().slice(0, 200) : undefined;
  if (!key && !text) return null;
  return { ...(key ? { key } : {}), ...(text ? { text } : {}) };
};

/** ข้อมูลดิบ → กฎที่ปลอดภัย (key ที่ไม่รู้จักทิ้ง · ข้อความ ≤ 200 · ให้ ≤ 8 อย่าง · สถานะไม่ถูก = แผน) */
export function cleanAuto(raw: unknown): FlowAuto {
  const o = (raw ?? {}) as Record<string, unknown>;
  const when = cleanPick(o.when, TRIG);
  const cond = typeof o.cond === "string" && o.cond.trim() ? o.cond.trim().slice(0, 300) : undefined;
  const acts = (Array.isArray(o.acts) ? o.acts : []).map((a) => cleanPick(a, ACT)).filter((a): a is AutoPick => !!a).slice(0, AUTO_ACTS_MAX);
  return { ...(when ? { when } : {}), ...(cond ? { cond } : {}), acts, status: isAutoStatus(o.status) ? o.status : "plan" };
}

/** ข้อความของ เมื่อ/ให้ 1 อัน: ชื่อจากทะเบียน (+ รายละเอียดที่พิมพ์เพิ่ม) */
export function autoPickLabel(p: AutoPick | undefined, kind: "when" | "act", t: (th: string, en: string) => string): string {
  if (!p) return "";
  const ref = kind === "when" ? autoTrigger(p.key) : autoAction(p.key);
  const name = ref ? t(ref.th, ref.en) : "";
  return [name, p.text].filter(Boolean).join(" · ");
}

/** กฎครบพอจะเริ่มทำไหม (มีทั้ง เมื่อ และ ให้ อย่างน้อย 1) */
export const autoComplete = (a: FlowAuto): boolean => !!a.when && a.acts.length > 0;

export type AutoListItem = { nodeId: string; title: string; status: AutoStatus; complete: boolean };
/** ปุ่ม "อัตโนมัติ N": ทุกกฎบนกระดาน เรียง ใช้งานอยู่ → กำลังทำ → แผน → ปิดไว้ แล้วบน→ล่าง */
export function listAutos(nodes: { id: string; type: string; position: { x: number; y: number }; data: { label: string; auto?: FlowAuto } }[]): AutoListItem[] {
  const rank: Record<AutoStatus, number> = { live: 0, doing: 1, plan: 2, off: 3 };
  return nodes.filter((n) => n.type === "auto")
    .map((n) => { const a = n.data.auto ?? { acts: [], status: "plan" as AutoStatus }; return { n, a }; })
    .sort((x, y) => rank[x.a.status] - rank[y.a.status] || x.n.position.y - y.n.position.y || x.n.position.x - y.n.position.x)
    .map(({ n, a }) => ({ nodeId: n.id, title: n.data.label.split("\n")[0].trim(), status: a.status, complete: autoComplete(a) }));
}
