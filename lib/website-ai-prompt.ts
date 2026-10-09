/**
 * ของกลาง — สร้าง "คำสั่งสำหรับ AI" ให้เจ้าของคัดลอกไปวางใน ChatGPT/Claude แล้วได้ Section กลับมาเป็น JSON
 * ที่วางลงตัวจัดหน้าได้ทันที (ปุ่ม "วาง JSON จาก AI") — ทุกช่องแก้ต่อได้ในแผงขวา
 *
 * อ่านโครงจาก lib/website-schema.ts โดยตรง → เพิ่ม Section ใหม่แล้วคำสั่งอัปเดตเอง
 */
import { SECTION_SCHEMAS, SECTION_TYPES, type FieldDef } from "@/lib/website-schema";

const fieldLine = (f: FieldDef): string => {
  let t: string = f.type;
  if (f.type === "select" && f.options) t = f.options.map((o) => `"${o.v}"`).join("|");
  else if (f.type === "link") t = `{ "text": string, "href": string }`;
  else if (f.type === "list") t = "string[]";
  else if (f.type === "products") t = "string[] (รหัสรุ่น)";
  else if (f.type === "image") t = "null (รูปให้เว้น null เจ้าของเลือกเองทีหลัง)";
  else if (f.type === "toggle") t = "boolean";
  else if (f.type === "number" || f.type === "range") t = `number${f.min != null || f.numMax != null ? ` (${f.min ?? 0}–${f.numMax ?? ""})` : ""}`;
  else if (f.type === "code") t = "string (HTML+CSS)";
  else t = "string";
  const extra = [f.max && f.type !== "number" && f.type !== "range" ? `ไม่เกิน ${f.max} ตัวอักษร` : "", f.hint ?? ""].filter(Boolean).join(" · ");
  return `    "${f.key}": ${t}  // ${f.label}${extra ? ` — ${extra}` : ""}`;
};

export function buildAiPrompt(opts: { shopName: string; categories: { key: string; label: string }[]; brief?: string }): string {
  const sections = SECTION_TYPES.filter((t) => t !== "announcement")
    .map((t) => {
      const s = SECTION_SCHEMAS[t];
      const lines = [`- type "${t}" = ${s.meta.label} (${s.meta.hint})`, ...s.fields.map(fieldLine)];
      if (s.children) {
        lines.push(`    "${s.children.key}": [ // ${s.children.label} ไม่เกิน ${s.children.max} ชิ้น แต่ละชิ้นเป็น object:`);
        lines.push(...s.children.fields.map((f) => "  " + fieldLine(f)));
        lines.push("    ]");
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const cats = opts.categories.length ? opts.categories.map((c) => `${c.key} (${c.label})`).join(", ") : "ยังไม่ตั้ง";

  return `คุณคือนักออกแบบเว็บไซต์ ช่วยออกแบบ "Section" สำหรับหน้าเว็บร้าน ${opts.shopName}
${opts.brief ? `โจทย์: ${opts.brief}\n` : ""}
ตอบกลับเป็น JSON array เท่านั้น (ไม่ต้องมีคำอธิบาย ไม่ต้องมี \`\`\`) แต่ละ element = 1 Section รูปแบบ:
{ "type": "<ชนิด>", ...ช่องของชนิดนั้น }

กติกา:
- ใช้เฉพาะชนิดและช่องตามรายการด้านล่าง ห้ามเพิ่มช่องอื่น ภาษาไทยเป็นหลัก ข้อความกระชับขายของได้จริง
- รูปภาพให้ใส่ null (เจ้าของจะเลือกรูปเองทีหลัง) ยกเว้นชนิด "custom-html" ที่ใช้ <img src="https://..."> ได้
- ลิงก์ภายในเว็บใช้ /shop, /shop?cat=<หมวด>, /product/<รหัสรุ่นตัวเล็ก>, /contact, /track
- หมวดสินค้าของร้านนี้: ${cats}
- ถ้าใช้ "custom-html": เขียน HTML + <style> ธรรมดา ห้ามใช้ JavaScript ห้ามใช้ Tailwind class (เว็บไม่รู้จัก) ใช้ตัวแปรสีของร้านได้: var(--color-brand), var(--color-brand-deep), var(--color-ink), var(--color-paper), var(--color-surface), var(--color-muted) และฟอนต์ var(--font-display), var(--font-body) · ต้อง responsive (มือถือ 1 คอลัมน์) · CSS จะถูกจำกัดให้มีผลเฉพาะใน Section นี้

ชนิด Section ที่มีให้ใช้:
${sections}

ตัวอย่างคำตอบ:
[
  { "type": "hero", "eyebrow": "คอลเลกชันใหม่", "title": "กระเป๋าดีไซน์ดี", "titleAccent": "ใช้ได้ทุกวัน", "subtitle": "ผลิตในไทย ส่งฟรีเมื่อครบ ฿1,500", "primary": { "text": "เลือกซื้อ", "href": "/shop" }, "secondary": { "text": "", "href": "" }, "features": [{ "title": "หนังแท้", "desc": "คัดเกรด" }], "imageKey": null, "imageAlt": "", "overlay": 45, "height": "tall" },
  { "type": "faq", "eyebrow": "คำถามที่พบบ่อย", "title": "ก่อนสั่งซื้อ", "subtitle": "", "items": [{ "q": "ส่งกี่วัน?", "a": "1–2 วันทำการ" }] }
]`;
}
