// ============================================================
// flowchart-rich — ข้อความจัดรูปแบบในกล่องของกระดาน flowchart กลาง (เจ้าของเลือก 2026-11-19 แบบ B "จัดเฉพาะคำที่เลือก")
//
// เก็บเป็น HTML ชุดเล็กใน data.rich (ตัวหนา/เอียง/ขีดเส้นใต้/ขีดฆ่า/สี/ขนาด/จัดชิด/รายการ) · data.label = ข้อความล้วนคู่กันเสมอ (ค้นหา/ป้าย/ของเดิมใช้ต่อ)
// ⚠️ ความปลอดภัย: กระดานเป็นของร่วม คนอื่นเห็น HTML นี้ → ทุกครั้งที่อ่าน/บันทึก/แสดง ต้องผ่าน sanitizeRich (ผ่านรายชื่อที่อนุญาตเท่านั้น)
// ฟังก์ชันล้วน ไม่ใช้ DOM — เทสต์ lib/__tests__/flowchart-rich.test.ts
// ============================================================

const ALLOWED = new Set(["b", "strong", "i", "em", "u", "s", "strike", "span", "div", "p", "br", "ul", "ol", "li", "a"]);
/** ลิงก์ที่ยอมให้เก็บ: เว็บ (http/https) หรือหน้าในระบบ (ขึ้นต้น /) — กัน javascript: */
const HREF_OK = (v: string) => /^(https?:\/\/[^\s"<>]+|\/[^\s"<>]*)$/i.test(v) && v.length <= 500;
const VOID = new Set(["br"]);
/** แท็กที่ต้องทิ้งทั้งเนื้อหาข้างใน (ไม่ใช่แค่ตัวแท็ก) */
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "textarea", "select", "svg", "math", "head", "title"]);
export const RICH_MAX = 20000;

const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;
const STYLE_OK: Record<string, (v: string) => string | null> = {
  "color": (v) => (COLOR_RE.test(v) ? v : null),
  "background-color": (v) => (COLOR_RE.test(v) ? v : null),   // ไฮไลต์ (แถบจัดข้อความ 2026-11-22)
  "font-size": (v) => { const m = /^(\d{1,2}(\.\d+)?)px$/.exec(v); return m && Number(m[1]) >= 6 && Number(m[1]) <= 72 ? `${m[1]}px` : null; },
  "font-weight": (v) => (/^(bold|normal|[1-9]00)$/.test(v) ? v : null),
  "font-style": (v) => (/^(italic|normal)$/.test(v) ? v : null),
  "text-decoration": (v) => (/^((underline|line-through|none)\s*)+$/.test(v) ? v : null),
  "text-decoration-line": (v) => (/^((underline|line-through|none)\s*)+$/.test(v) ? v : null),
  "text-align": (v) => (/^(left|center|right|justify)$/.test(v) ? v : null),
};

/** style="..." → เฉพาะคุณสมบัติที่อนุญาต (ค่าผิดรูป/url()/expression ทิ้ง) */
export function cleanStyle(style: string): string {
  const out: string[] = [];
  for (const part of style.split(";")) {
    const i = part.indexOf(":"); if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim().replace(/\s+/g, " ").toLowerCase();
    const ok = STYLE_OK[k]?.(v);
    if (ok) out.push(`${k}:${ok}`);
  }
  return out.join(";");
}

const attrOf = (attrs: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
};
const decodeAttr = (s: string) => s.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** HTML จากช่องพิมพ์/ฐานข้อมูล → HTML ที่ปลอดภัย (แท็ก/สไตล์ตามรายชื่อเท่านั้น · ปิดแท็กให้ครบ) */
export function sanitizeRich(html: unknown): string {
  if (typeof html !== "string" || !html) return "";
  const src = html.length > RICH_MAX ? html.slice(0, RICH_MAX) : html;
  const out: string[] = [];
  const stack: string[] = [];
  let drop: string | null = null, dropDepth = 0;
  const re = /<!--[\s\S]*?(-->|$)|<\/?[a-zA-Z][^>]*>|<|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (tok.startsWith("<!--")) continue;
    if (tok === "<") { if (!drop) out.push("&lt;"); continue; }
    if (tok[0] !== "<") { if (!drop) out.push(tok.replace(/>/g, "&gt;")); continue; }
    const close = tok[1] === "/";
    const name = (/^<\/?([a-zA-Z0-9]+)/.exec(tok)?.[1] ?? "").toLowerCase();
    if (drop) {
      if (name === drop) dropDepth += close ? -1 : 1;
      if (dropDepth <= 0) drop = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) { if (!close && !/\/>$/.test(tok)) { drop = name; dropDepth = 1; } continue; }
    if (!ALLOWED.has(name)) continue;   // แท็กอื่น (img, font ...) = ทิ้งแท็ก เก็บข้อความข้างใน
    if (close) {
      let at = -1;
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i] === name || stack[i] === `#${name}`) { at = i; break; }
      if (at < 0) continue;
      while (stack.length > at) { const x = stack.pop()!; if (x[0] !== "#") out.push(`</${x}>`); }
      continue;
    }
    if (name === "a") {   // ลิงก์: เก็บเฉพาะ href ที่ปลอดภัย · เปิดแท็บใหม่เสมอ
      const href = decodeAttr(attrOf(tok.slice(2), "href") ?? "").trim();
      if (!HREF_OK(href)) { stack.push("#a"); continue; }
      out.push(`<a href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">`); stack.push("a"); continue;
    }
    const style = attrOf(tok.slice(name.length + 1), "style");
    const st = style ? cleanStyle(decodeAttr(style)) : "";
    // <span> ที่ไม่มีสไตล์ = ไม่มีผล → ไม่เขียน (กันชั้นห่อว่างสะสม เช่น ลากเลือกสีรัว ๆ)
    if (name === "span" && !st) { stack.push("#span"); continue; }
    out.push(`<${name}${st ? ` style="${st}"` : ""}>`);
    if (!VOID.has(name)) stack.push(name);
  }
  while (stack.length) { const x = stack.pop()!; if (x[0] !== "#") out.push(`</${x}>`); }
  return out.join("");
}

const ENT: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'" };
/** ข้อความจัดรูปแบบ → ข้อความล้วน (บรรทัดตามย่อหน้า · รายการ = "• ") */
export function richToPlain(html: string): string {
  return sanitizeRich(html)
    .replace(/<br>/g, "\n")
    .replace(/<li[^>]*>/g, "• ")
    .replace(/<\/(div|p|li|ul|ol)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (e) => ENT[e])
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** ข้อความล้วน → HTML ตั้งต้นของช่องพิมพ์ ให้หน้าตาเหมือนเดิม (บรรทัดแรก = หัวข้อตัวหนา 13px · ที่เหลือ = คำอธิบาย 11px สีรอง) */
export function plainToRich(label: string, subColor: string): string {
  const lines = (label ?? "").split("\n");
  const title = lines[0] ?? "";
  const rest = lines.slice(1);
  const head = `<div><b style="font-size:13px">${esc(title) || "<br>"}</b></div>`;
  const body = rest.map((l) => `<div style="font-size:11px;color:${subColor}">${esc(l) || "<br>"}</div>`).join("");
  return sanitizeRich(head + body);
}

/** ใส่รูปแบบให้ทั้งกล่อง (เลือกกล่องแล้วกดบนแถบ — ใช้ได้หลายกล่องพร้อมกัน) */
export type RichWrap = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string; size?: number };
export function wrapRich(html: string, w: RichWrap): string {
  const st: string[] = [];
  if (w.bold) st.push("font-weight:bold");
  if (w.italic) st.push("font-style:italic");
  const deco = [w.underline ? "underline" : "", w.strike ? "line-through" : ""].filter(Boolean).join(" ");
  if (deco) st.push(`text-decoration:${deco}`);
  if (w.color) st.push(`color:${w.color}`);
  if (w.size) st.push(`font-size:${Math.round(w.size)}px`);
  const style = cleanStyle(st.join(";"));
  if (!style) return sanitizeRich(html);
  // สีกับขนาด: ล้างค่าเดิมที่ใส่ไว้ข้างใน (ไม่งั้นค่าในสุดชนะ กดแล้วไม่เปลี่ยน)
  let inner = sanitizeRich(html);
  if (w.color) inner = inner.replace(/(style="[^"]*?)color:[^;"]+;?/g, "$1");
  if (w.size) inner = inner.replace(/(style="[^"]*?)font-size:[^;"]+;?/g, "$1");
  return sanitizeRich(`<span style="${style}">${inner}</span>`);
}

export const FLOW_ALIGNS = ["left", "center", "right"] as const;
export type FlowAlign = (typeof FLOW_ALIGNS)[number];
export const isFlowAlign = (v: unknown): v is FlowAlign => typeof v === "string" && (FLOW_ALIGNS as readonly string[]).includes(v);
const HEX_RE = /^#[0-9a-f]{6}$/i;
/** สีพื้น/เส้นขอบกล่องแบบกำหนดเอง (#rrggbb เท่านั้น) */
export const isHexColor = (v: unknown): v is string => typeof v === "string" && HEX_RE.test(v);
/** ขนาดตัวอักษรให้เลือก (px) */
/** ขนาดตัวอักษร (เล็กสุด 6px · เจ้าของสั่ง 2026-11-21) */
export const RICH_SIZES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40];
