/**
 * 📧 อ่านเมลแจ้งออเดอร์จากแพลตฟอร์ม "ด้วยกฎตายตัว" (ไม่ใช้ AI — ฟรี และไม่เดาตัวเลข)
 *
 * เมล Shopee/Lazada ระบบของเขาสร้างจากแม่แบบเดียวกันทุกฉบับ → อ่านตามป้าย "หมายเลขคำสั่งซื้อ:", "จำนวน:", "ราคา:" ได้ตรง ๆ
 * ป้ายกับค่าอาจอยู่บรรทัดเดียวกัน ("จำนวน: 1") หรือคนละบรรทัด (ช่องตารางคนละช่อง) — รับได้ทั้งสองแบบ
 *
 * รู้จักแล้ว (จากเมลจริงที่เจ้าของส่งมา 2026-10-27 · ร้าน Louis Montini):
 *   Shopee  ยืนยันการชำระเงิน  → order_paid        เลขออเดอร์ · วันที่ · สินค้า/ตัวเลือก/จำนวน/ราคา · ยอดรวม · ค่าส่ง
 *   Shopee  ถูกยกเลิก           → order_cancelled   เลขออเดอร์ + สินค้า (ยอดเป็น ฿0)
 *   Shopee  คำขอคืนเงิน/คืนสินค้า → return_requested มีแค่ "เลขคำขอ" (15 ตัว ไม่ใช่เลขออเดอร์ 14 ตัว) — ไม่บอกสินค้า/ยอด
 *   Lazada  New Order           → order_new         เลขออเดอร์ + ชื่อสินค้า (ไม่บอกจำนวน/ราคา/ตัวเลือก → นับ 1 ชิ้น)
 * เมลอื่นของแพลตฟอร์ม (โปรโมชัน, ส่งของแล้ว ฯลฯ) = "other" → ระบบข้าม
 *
 * ไฟล์นี้เป็น pure (ไม่แตะ DB) — ทดสอบที่ lib/__tests__/platform-email-parse.test.ts
 * ถ้าแพลตฟอร์มเปลี่ยนหน้าตาเมล: เพิ่มป้ายใหม่ในชุด LABEL ด้านล่าง + เพิ่มเทสต์ด้วยเมลจริงฉบับใหม่ แล้วกด "อ่านใหม่" ในหน้าตั้งค่า
 */

export type PlatformCode = "shopee" | "lazada";
export type EmailKind = "order_paid" | "order_new" | "order_cancelled" | "return_requested" | "other";

export type ParsedItem = {
  title: string;
  variant: string | null;
  qty: number;
  /** false = เมลไม่บอกจำนวน (Lazada) → นับเป็น 1 */
  qty_known: boolean;
  /** ราคาต่อชิ้นตามเมล · null = เมลไม่บอก */
  price: number | null;
};

export type ParsedEmail = {
  platform: PlatformCode | null;
  kind: EmailKind;
  order_no: string | null;
  /** เลขอ้างอิงอื่นที่ไม่ใช่เลขออเดอร์ เช่น เลขคำขอคืนเงิน */
  ref_no: string | null;
  /** ชื่อร้านที่เมลเรียก เช่น "louismontini_officialshop" */
  shop_name: string | null;
  ordered_at: string | null;
  items: ParsedItem[];
  subtotal: number | null;
  shipping: number | null;
  total: number | null;
  /** เหตุผลภาษาคนเวลาอ่านได้ไม่ครบ */
  problems: string[];
};

export type EmailSource = { from?: string | null; subject?: string | null; html?: string | null; text?: string | null };

// ───────────────────────── แปลงเมลเป็นบรรทัด ─────────────────────────

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith("#")) return k === "#39" ? "'" : String.fromCodePoint(parseInt(k.slice(1), 10));
    return ENTITIES[k] ?? m;
  });
}

const cleanLine = (s: string) => s.replace(/[​‌‍﻿]/g, "").replace(/[ \t ]+/g, " ").trim();

/** HTML ของเมล → บรรทัดข้อความ (ช่องตาราง/ย่อหน้า/ขึ้นบรรทัด = คนละบรรทัด) */
export function htmlToLines(html: string): string[] {
  const s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(style|script|head|title)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|tr|td|th|li|ul|ol|h[1-6]|table|tbody|thead|section|article|header|footer|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(s).split(/\r?\n/).map(cleanLine).filter(Boolean);
}

/** ข้อความล้วน → บรรทัด */
export function textToLines(text: string): string[] {
  return text.split(/\r?\n/).map(cleanLine).filter(Boolean);
}

/** เลือกแหล่งที่อ่านได้: HTML ก่อน (เราคุมการแปลงเอง) · ไม่มีค่อยใช้ข้อความล้วน */
export function emailLines(src: EmailSource): string[] {
  if (src.html && src.html.trim()) {
    const lines = htmlToLines(src.html);
    if (lines.length) return lines;
  }
  return textToLines(src.text ?? "");
}

// ───────────────────────── ตัวช่วยอ่านค่า ─────────────────────────

/** ป้ายของแต่ละช่อง (ไทย + อังกฤษ) — แพลตฟอร์มเปลี่ยนคำ ให้เพิ่มที่นี่ */
const LABEL = {
  orderNo: /(หมายเลขคำสั่งซื้อ|เลขที่คำสั่งซื้อ|order\s*(?:id|no\.?|number|sn))/i,
  orderDate: /(วันที่สั่งซื้อ|วันที่ทำการสั่งซื้อ|order\s*date|date\s*ordered)/i,
  variant: /(ตัวเลือกสินค้า|ตัวเลือก|variation|variant)/i,
  qty: /(จำนวน|quantity|qty)/i,
  price: /(ราคา|price)/i,
  subtotal: /(ยอดรวมค่าสินค้า|merchandise\s*subtotal|subtotal)/i,
  shipping: /(ค่าจัดส่งสินค้า|ค่าจัดส่ง|shipping\s*(?:fee)?)/i,
  total: /(ยอดที่ต้องชำระทั้งหมด|ยอดชำระทั้งหมด|order\s*total|total\s*payment)/i,
  lazItems: /(รายการคำสั่งซื้อ|order\s*item\s*list)/i,
};

/** บรรทัดนี้เป็น "ป้าย:" ไหม → คืนค่าหลังโคลอน ("" = ค่าอยู่บรรทัดถัดไป) · ไม่ใช่ป้ายนี้ = null */
function labelValue(line: string, label: RegExp): string | null {
  // อนุญาตอักขระแปลกนำหน้า (เมลยกเลิกของ Shopee มี " ติดหน้าป้าย)
  const m = new RegExp(`^[^\\p{L}\\p{N}]*${label.source}\\s*[:：]\\s*(.*)$`, `${label.flags.replace("u", "")}u`).exec(line);
  return m ? m[m.length - 1].trim() : null;
}

// \p{M} = สระ/วรรณยุกต์ไทย (ไม่นับเป็น \p{L}) — ไม่ใส่ "ตัวเลือกสินค้า:" จะไม่ถูกมองเป็นป้าย
const isLabelLine = (line: string) => /^[^\p{L}\p{N}]*[\p{L}\p{M}\s.()]{2,40}[:：]\s*$/u.test(line);

/** หาค่าของป้ายในช่วงบรรทัด [from, to) — ค่าอยู่บรรทัดเดียวกันหรือบรรทัดถัดไป */
function findValue(lines: string[], label: RegExp, from = 0, to = lines.length): { value: string; idx: number } | null {
  for (let i = from; i < Math.min(to, lines.length); i++) {
    const v = labelValue(lines[i], label);
    if (v == null) continue;
    if (v) return { value: v, idx: i };
    const next = lines[i + 1];
    if (next != null && i + 1 < to && !isLabelLine(next)) return { value: next, idx: i + 1 };
    return null;
  }
  return null;
}

/** "฿1,234.50" → 1234.5 · อ่านไม่ได้ = null */
export function parseMoney(s: string | null | undefined): number | null {
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(String(s ?? ""));
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const TH_MONTH: Record<string, number> = {
  มค: 1, มกราคม: 1, กพ: 2, กุมภาพันธ์: 2, มีค: 3, มีนาคม: 3, เมย: 4, เมษายน: 4, พค: 5, พฤษภาคม: 5, มิย: 6, มิถุนายน: 6,
  กค: 7, กรกฎาคม: 7, สค: 8, สิงหาคม: 8, กย: 9, กันยายน: 9, ตค: 10, ตุลาคม: 10, พย: 11, พฤศจิกายน: 11, ธค: 12, ธันวาคม: 12,
};
const EN_MONTH = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthNo(word: string): number | null {
  const w = word.replace(/[.\s]/g, "").toLowerCase();
  if (TH_MONTH[w]) return TH_MONTH[w];
  const i = EN_MONTH.indexOf(w.slice(0, 3));
  return i >= 0 ? i + 1 : null;
}

/**
 * วันเวลาในเมล (เวลาไทย) → ISO
 * รองรับ "27 ต.ค. 2026 20:22:27" · "27/10/2026 14:07:53" · "27 Oct 2026 17:23:06" · "2026-10-27 08:00" · ปี พ.ศ.
 * ใช้ Date.UTC ลบ 7 ชม. เสมอ (เลี่ยงกับดัก timezone ของเครื่อง)
 */
export function parsePlatformDate(s: string | null | undefined): string | null {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let y = 0, mo = 0, d = 0;
  const time = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  let m: RegExpExecArray | null;
  if ((m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else if ((m = /(\d{1,2})\s*([ก-๙][ก-๙.]*|[A-Za-z]{3,9}\.?)\s*(\d{4})/.exec(t))) {
    d = +m[1]; mo = monthNo(m[2]) ?? 0; y = +m[3];
  }
  if (!y || !mo || !d || mo > 12 || d > 31) return null;
  if (y > 2400) y -= 543;
  const hh = time ? +time[1] : 0, mm = time ? +time[2] : 0, ss = time?.[3] ? +time[3] : 0;
  return new Date(Date.UTC(y, mo - 1, d, hh - 7, mm, ss)).toISOString();
}

// ───────────────────────── แพลตฟอร์ม / ประเภทเมล ─────────────────────────

export function detectPlatform(src: EmailSource, lines: string[]): PlatformCode | null {
  const from = String(src.from ?? "").toLowerCase();
  if (from.includes("shopee")) return "shopee";
  if (from.includes("lazada")) return "lazada";
  const text = lines.join("\n").toLowerCase();
  const sh = text.includes("shopee"), lz = text.includes("lazada");
  if (sh && !lz) return "shopee";
  if (lz && !sh) return "lazada";
  return null;
}

/** ส่วนหัวเมล (หัวเรื่อง + ข้อความก่อนตารางรายละเอียด) — ใช้ตัดสินประเภท จะได้ไม่โดนคำในส่วนท้ายเมลหลอก */
function introText(subject: string, lines: string[]): string {
  const end = lines.findIndex((l) => /^(รายละเอียดคำสั่งซื้อ|order\s*details)/i.test(l) || labelValue(l, LABEL.orderNo) != null);
  return [subject, ...lines.slice(0, end > 0 ? end : 8)].join("\n");
}

function shopeeKind(intro: string): EmailKind {
  if (/คำขอคืนเงิน|คืนเงิน\/คืนสินค้า|return\s*(?:\/\s*refund)?\s*request|refund\s*request/i.test(intro)) return "return_requested";
  if (/ถูกยกเลิก|ยกเลิกคำสั่งซื้อ|has been cancel+ed|was cancel+ed/i.test(intro)) return "order_cancelled";
  if (/ยืนยันการชำระเงิน|ชำระเงินเรียบร้อย|payment\s*(?:has\s*been\s*)?confirmed|has been paid/i.test(intro)) return "order_paid";
  return "other";
}

function lazadaKind(intro: string): EmailKind {
  if (/new\s*order|คำสั่งซื้อใหม่/i.test(intro)) return "order_new";
  if (/cancel|ยกเลิก/i.test(intro)) return "order_cancelled";
  return "other";
}

/** ชื่อร้านที่เมลเรียก: "เรียน คุณ X," · "Dear X!" · "สวัสดีร้าน X!" */
function shopName(lines: string[]): string | null {
  for (const l of lines.slice(0, 30)) {
    const m = /^(?:เรียน\s*คุณ|เรียน|dear|สวัสดีร้าน|สวัสดีคุณ|hi)\s+(.+?)\s*[,!]?\s*$/i.exec(l);
    if (m && m[1].length <= 80) return m[1].replace(/[,!]+$/, "").trim();
  }
  return null;
}

const SHOPEE_ORDER_SN = /^\d{6}[A-Z0-9]{8}$/;

function cleanOrderNo(v: string | null | undefined): string | null {
  const m = /#?\s*([A-Z0-9]{8,24})/i.exec(String(v ?? ""));
  return m ? m[1].toUpperCase() : null;
}

// ───────────────────────── รายการสินค้า ─────────────────────────

const ITEM_START = /^(\d{1,2})\.\s*(.*\p{L}.*)$/u;
const ITEMS_END = (l: string) => labelValue(l, LABEL.subtotal) != null || labelValue(l, LABEL.total) != null
  || labelValue(l, LABEL.shipping) != null;

/** Shopee: "1. ชื่อสินค้า" ตามด้วย ตัวเลือกสินค้า/จำนวน/ราคา จนเจอยอดรวม */
function shopeeItems(lines: string[], from: number): ParsedItem[] {
  const items: ParsedItem[] = [];
  let cur: ParsedItem | null = null;
  for (let i = from; i < lines.length; i++) {
    const l = lines[i];
    if (ITEMS_END(l)) break;
    const start = ITEM_START.exec(l);
    if (start) {
      cur = { title: start[2].trim(), variant: null, qty: 1, qty_known: false, price: null };
      items.push(cur);
      continue;
    }
    if (!cur) continue;
    const pick = (label: RegExp) => {
      const v = labelValue(l, label);
      if (v == null) return null;
      if (v) return v;
      const next = lines[i + 1];
      if (next != null && !isLabelLine(next) && !ITEM_START.test(next)) { i++; return next; }
      return "";
    };
    let v: string | null;
    if ((v = pick(LABEL.variant)) != null) cur.variant = v || null;
    else if ((v = pick(LABEL.qty)) != null) {
      const q = parseMoney(v);
      if (q != null && q > 0) { cur.qty = q; cur.qty_known = true; }
    }
    else if ((v = pick(LABEL.price)) != null) cur.price = parseMoney(v);
  }
  return items;
}

/** "ราคา" ในเมลเป็นราคาต่อชิ้นหรือรวมทั้งบรรทัด? เทียบกับยอดรวมค่าสินค้า แล้วแปลงเป็นต่อชิ้นเสมอ */
function normalizeUnitPrices(items: ParsedItem[], subtotal: number | null): void {
  if (!subtotal || items.some((it) => it.price == null)) return;
  const asUnit = items.reduce((a, it) => a + (it.price ?? 0) * it.qty, 0);
  const asLine = items.reduce((a, it) => a + (it.price ?? 0), 0);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  if (!near(asUnit, subtotal) && near(asLine, subtotal)) {
    for (const it of items) if (it.price != null && it.qty > 0) it.price = Math.round((it.price / it.qty) * 100) / 100;
  }
}

/** Lazada: "Order Item List: ชื่อ A ..., ชื่อ B ..." — แยกที่ ", " เฉพาะเมื่อทุกท่อนลงท้ายด้วยรหัสสินค้า (ชื่อที่มีจุลภาคเองจะไม่ถูกหั่น) */
function lazadaItems(value: string): ParsedItem[] {
  const parts = value.split(/\s*,\s+/).map((p) => p.trim()).filter(Boolean);
  const endsWithCode = (p: string) => /[A-Za-z]{1,}[A-Za-z0-9-]*\d[A-Za-z0-9-]*\s*$/.test(p);
  const list = parts.length > 1 && parts.every(endsWithCode) ? parts : [value.trim()];
  return list.map((title) => ({ title, variant: null, qty: 1, qty_known: false, price: null }));
}

// ───────────────────────── ตัวอ่านหลัก ─────────────────────────

export function parsePlatformEmail(src: EmailSource, linesIn?: string[]): ParsedEmail {
  const lines = linesIn ?? emailLines(src);
  const subject = String(src.subject ?? "");
  const platform = detectPlatform(src, lines);
  const out: ParsedEmail = {
    platform, kind: "other", order_no: null, ref_no: null, shop_name: shopName(lines), ordered_at: null,
    items: [], subtotal: null, shipping: null, total: null, problems: [],
  };
  if (!platform) return out;
  const intro = introText(subject, lines);
  out.kind = platform === "shopee" ? shopeeKind(intro) : lazadaKind(intro);

  const orderHit = findValue(lines, LABEL.orderNo);
  out.order_no = cleanOrderNo(orderHit?.value);
  out.ordered_at = parsePlatformDate(findValue(lines, LABEL.orderDate)?.value);

  if (platform === "shopee") {
    if (out.kind === "return_requested") {
      // เลขในเมลคืนเงินคือ "เลขคำขอ" — ถ้าหน้าตาเหมือนเลขออเดอร์ (14 ตัว) ค่อยถือเป็นเลขออเดอร์
      const m = /หมายเลข\s*#?\s*([A-Z0-9]{10,24})/i.exec(intro) ?? /request\s*(?:no\.?|number|id)?\s*#?\s*([A-Z0-9]{10,24})/i.exec(intro);
      out.ref_no = m ? m[1].toUpperCase() : null;
      if (!out.order_no && out.ref_no && SHOPEE_ORDER_SN.test(out.ref_no)) out.order_no = out.ref_no;
      return out;
    }
    if (!out.order_no) {
      const m = /#\s?(\d{6}[A-Z0-9]{8})\b/.exec(lines.join("\n"));
      if (m) out.order_no = m[1];
    }
    out.items = shopeeItems(lines, orderHit ? orderHit.idx + 1 : 0);
    out.subtotal = parseMoney(findValue(lines, LABEL.subtotal)?.value);
    out.shipping = parseMoney(findValue(lines, LABEL.shipping)?.value);
    out.total = parseMoney(findValue(lines, LABEL.total)?.value);
    normalizeUnitPrices(out.items, out.subtotal);
  } else {
    const list = findValue(lines, LABEL.lazItems);
    if (list) out.items = lazadaItems(list.value);
    if (out.items.length) out.problems.push("เมล Lazada ไม่บอกจำนวน/ราคา/ตัวเลือก — นับรายการละ 1 ชิ้น ยังไม่มียอดเงิน");
  }

  if (out.kind !== "other") {
    if (!out.order_no) out.problems.push("หาเลขออเดอร์ในเมลไม่เจอ");
    if ((out.kind === "order_paid" || out.kind === "order_new") && !out.items.length) out.problems.push("หารายการสินค้าในเมลไม่เจอ");
  }
  return out;
}

/** ข้อมูลพอสร้าง/อัปเดตออเดอร์ไหม (ไม่พอ = เข้ากล่อง "อ่านไม่ออก") */
export function isReadable(p: ParsedEmail): boolean {
  if (p.kind === "other" || p.kind === "return_requested") return true;
  if (!p.order_no) return false;
  return p.kind === "order_cancelled" || p.items.length > 0;
}
