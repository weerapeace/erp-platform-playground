/**
 * ของกลาง — ทำความสะอาด HTML/CSS ที่เจ้าของวางเองใน Section "Custom HTML"
 *
 * กติกา (ปลอดภัยพอให้วางโค้ดจาก AI ลงเว็บจริงได้):
 *   - อนุญาตเฉพาะแท็กในรายการ (ข้อความ/โครง/รูป/ลิงก์/ตาราง/<style>) — <script> <iframe> <object> <embed> <form> ถูกถอดทั้งก้อน
 *   - อนุญาตเฉพาะ attribute ในรายการ · on* (onclick ฯลฯ) ถูกถอดเสมอ · href/src ต้องเป็น https:// หรือ /path หรือ #, mailto:, tel:
 *   - style="" และ <style> ห้ามมี expression( / javascript: / @import / behavior:
 *   - ⚠️ ไม่รัน JavaScript โดยเจตนา — ลูกเล่นให้ใช้ CSS หรือแผง "ลูกเล่น" ของตัวจัดหน้า
 *
 * ⚠️ ไฟล์นี้มีสำเนาที่เว็บร้าน (src/lib/html-sanitize.ts) ต้องแก้ให้ตรงกัน — เว็บร้านล้างซ้ำอีกชั้นก่อนแสดง
 */

const ALLOWED_TAGS = new Set([
  "a", "abbr", "address", "article", "aside", "b", "blockquote", "br", "button", "caption", "cite", "code", "col", "colgroup",
  "dd", "del", "details", "div", "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "i", "img", "ins", "kbd", "li", "main", "mark", "nav", "ol", "p", "picture", "pre", "q", "s", "section",
  "small", "source", "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr",
  "u", "ul", "video", "style", "svg", "path", "circle", "rect", "line", "polyline", "polygon", "g", "defs", "linearGradient", "stop",
]);

/** แท็กที่ต้องถอด "ทั้งก้อนรวมเนื้อใน" */
const DROP_WITH_CONTENT = ["script", "iframe", "object", "embed", "form", "input", "textarea", "select", "link", "meta", "base", "noscript", "template"];

const ALLOWED_ATTRS = new Set([
  "class", "id", "style", "href", "src", "srcset", "sizes", "alt", "title", "width", "height", "target", "rel", "loading", "role",
  "type", "colspan", "rowspan", "datetime", "open", "poster", "autoplay", "muted", "loop", "playsinline", "controls", "media",
  // svg
  "viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "d", "cx", "cy", "r", "x", "y", "x1", "y1", "x2", "y2",
  "points", "rx", "ry", "offset", "stop-color", "stop-opacity", "gradientTransform", "transform", "opacity", "xmlns",
]);

const URL_ATTRS = new Set(["href", "src", "poster"]);
const SAFE_URL = /^(https:\/\/|http:\/\/|\/(?!\/)|#|mailto:|tel:)/i;
const BAD_CSS = /(expression\s*\(|javascript\s*:|behavior\s*:|@import|-moz-binding|vbscript\s*:)/i;

function cleanStyleAttr(v: string): string {
  const s = v.replace(/\s+/g, " ").trim();
  if (BAD_CSS.test(s)) return "";
  // url() ต้องเป็น https หรือ data:image เท่านั้น
  if (/url\s*\(\s*['"]?(?!https:\/\/|\/|data:image\/)/i.test(s)) return "";
  return s.slice(0, 2000);
}

export function cleanCss(css: string): string {
  let s = css.replace(/<\/style/gi, "");
  if (BAD_CSS.test(s)) {
    // ตัดบรรทัดที่มีของอันตรายทิ้ง แทนที่จะทิ้งทั้งก้อน (AI ชอบใส่ @import ฟอนต์มาบรรทัดแรก)
    s = s
      .split("\n")
      .filter((line) => !BAD_CSS.test(line))
      .join("\n");
  }
  return s.slice(0, 20000);
}

function cleanAttrs(raw: string, tag: string): string {
  const out: string[] = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const name = m[1];
    const lower = name.toLowerCase();
    if (lower.startsWith("on")) continue;
    if (!ALLOWED_ATTRS.has(name) && !ALLOWED_ATTRS.has(lower) && !lower.startsWith("aria-") && !lower.startsWith("data-")) continue;
    let val = m[2] ?? m[3] ?? m[4] ?? "";
    if (URL_ATTRS.has(lower)) {
      val = val.trim();
      if (!SAFE_URL.test(val)) continue;
    }
    if (lower === "srcset" && /javascript:/i.test(val)) continue;
    if (lower === "style") {
      val = cleanStyleAttr(val);
      if (!val) continue;
    }
    if (lower === "target" && val === "_blank") out.push('rel="noopener noreferrer"');
    const safe = val.replace(/"/g, "&quot;");
    out.push(m[2] === undefined && m[3] === undefined && m[4] === undefined && tag !== "video" ? name : `${name}="${safe}"`);
  }
  return out.length ? " " + out.join(" ") : "";
}

/** ล้าง HTML ที่วางมา — คืน HTML ที่เหลือเฉพาะของที่ยอมให้แสดง */
export function sanitizeCustomHtml(input: unknown, max = 40000): string {
  let s = String(input ?? "").slice(0, max);
  if (!s.trim()) return "";

  // ถอดคอมเมนต์ + แท็กอันตรายทั้งก้อน
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  for (const t of DROP_WITH_CONTENT) {
    s = s.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}\\s*>`, "gi"), "");
    s = s.replace(new RegExp(`<\\/?${t}\\b[^>]*>`, "gi"), "");
  }

  // <style> ล้างเนื้อใน
  s = s.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_m, css: string) => `<style>${cleanCss(css)}</style>`);

  // แท็กอื่น ๆ: เก็บเฉพาะที่อนุญาต + attribute ที่อนุญาต
  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g, (whole, slash: string, name: string, attrs: string) => {
    const tag = name;
    const lower = tag.toLowerCase();
    if (lower === "style") return whole; // ล้างไปแล้วด้านบน
    if (!ALLOWED_TAGS.has(tag) && !ALLOWED_TAGS.has(lower)) return "";
    if (slash) return `</${tag}>`;
    const selfClose = /\/\s*$/.test(attrs);
    return `<${tag}${cleanAttrs(attrs.replace(/\/\s*$/, ""), lower)}${selfClose ? " /" : ""}>`;
  });

  return s.trim();
}

/**
 * จำกัด CSS ให้มีผลเฉพาะในกล่อง Custom HTML นั้น (กัน AI เขียน body{} h1{} แล้วไปเปลี่ยนทั้งเว็บ)
 * เติม [data-ch="<scope>"] นำหน้าทุก selector · @keyframes/@font-face คงเดิม · @media/@supports ไล่เข้าไปข้างใน
 */
export function scopeCss(css: string, scope: string): string {
  const prefix = `[data-ch="${scope}"]`;
  let out = "";
  let i = 0;
  const n = css.length;

  const readBlock = (start: number): { body: string; end: number } => {
    // start ชี้ที่ "{" — คืนเนื้อในจนถึง "}" ที่คู่กัน
    let depth = 0;
    for (let k = start; k < n; k++) {
      if (css[k] === "{") depth++;
      else if (css[k] === "}") {
        depth--;
        if (depth === 0) return { body: css.slice(start + 1, k), end: k + 1 };
      }
    }
    return { body: css.slice(start + 1), end: n };
  };

  const scopeSelectors = (sel: string) =>
    sel
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const t = s.replace(/^(html|body|:root)\b/i, "");
        return t.trim() ? `${prefix} ${t.trim()}` : prefix;
      })
      .join(", ");

  const walk = (text: string): string => {
    let res = "";
    let j = 0;
    const len = text.length;
    while (j < len) {
      const open = text.indexOf("{", j);
      if (open < 0) break;
      const sel = text.slice(j, open).trim();
      // หา } ที่คู่กัน
      let depth = 0;
      let close = open;
      for (let k = open; k < len; k++) {
        if (text[k] === "{") depth++;
        else if (text[k] === "}") {
          depth--;
          if (depth === 0) {
            close = k;
            break;
          }
        }
      }
      const body = text.slice(open + 1, close);
      if (/^@(keyframes|-webkit-keyframes|font-face|page|counter-style|property)/i.test(sel)) res += `${sel}{${body}}`;
      else if (/^@(media|supports|container|layer)/i.test(sel)) res += `${sel}{${walk(body)}}`;
      else if (sel.startsWith("@")) res += `${sel}{${body}}`;
      else res += `${scopeSelectors(sel)}{${body}}`;
      j = close + 1;
    }
    return res;
  };

  void readBlock;
  void i;
  out = walk(css);
  return out;
}
