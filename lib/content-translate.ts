"use client";

/**
 * ของกลาง (ฝั่งหน้าจอ) — ส่งข้อความไปแปลที่ /api/ai/translate (GPT → Cloudflare → Google)
 * ใช้กับ widget 2 ภาษา (components/bilingual-field.tsx) และปุ่ม "แปลที่ยังขาด"
 *
 * แบ่งชุดละไม่เกิน ~3,000 ตัวอักษร / 60 ข้อความ (API รับได้ 12,000) · คืนผลเรียงตรงกับที่ส่งเสมอ
 * ข้อความว่าง = ไม่ส่ง คืน "" · แปลไม่ได้บางชิ้น = "" (ไม่ทำให้ทั้งชุดพัง)
 */
import { apiFetch } from "@/lib/api";

const CHUNK_CHARS = 3000;
const CHUNK_ITEMS = 60;

async function translateChunk(texts: string[], to: "en" | "th", free: boolean, place?: string): Promise<string[]> {
  const res = await apiFetch("/api/ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, to, kind: "content", ...(free ? { engine: "free" } : {}), ...(place ? { place } : {}) }),
  });
  const j = (await res.json().catch(() => ({}))) as { data?: { translated_list?: unknown }; error?: string };
  if (!res.ok || j.error) {
    if (res.status === 401 || res.status === 403) throw new Error("ไม่มีสิทธิ์ใช้ตัวแปลภาษา — ต้องมีสิทธิ์แก้สินค้า/หน้าเว็บ");
    throw new Error(j.error || `แปลไม่สำเร็จ (${res.status})`);
  }
  const list = Array.isArray(j.data?.translated_list) ? (j.data!.translated_list as unknown[]) : [];
  return texts.map((_, i) => String(list[i] ?? "").trim());
}

/**
 * แปลโน้ตจัดรูปแบบ (HTML จาก RichTextEditor) ทีละบล็อก — ย่อหน้า / bullet / ลำดับเลข คงอยู่ครบ
 * บล็อกที่ทั้งบรรทัดเป็นตัวหนา/เอียง คงรูปแบบไว้ · ตัวหนาเฉพาะบางคำในบรรทัดจะกลายเป็นตัวธรรมดา (แปลทั้งประโยค)
 * ใช้ในหน้าจอเท่านั้น (DOMParser) · คืน HTML ใหม่ ไม่แตะต้นฉบับ
 */
export async function translateNoteHtml(html: string, to: "en" | "th", opts: TranslateOpts = {}): Promise<string> {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return "";
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, blockquote, li"))
    .filter((el) => !el.querySelector("p, h1, h2, h3, h4, blockquote, li, ul, ol"));
  const got = await translateContent(blocks.map((el) => el.textContent ?? ""), to, opts);
  blocks.forEach((el, i) => {
    const tr = got[i]; if (!tr) return;
    const full = (el.textContent ?? "").trim();
    let node: Node = doc.createTextNode(tr);
    for (const tag of ["em", "strong"] as const) {
      const m = el.querySelector(tag === "em" ? "em, i" : "strong, b");
      if (m && (m.textContent ?? "").trim() === full) { const w = doc.createElement(tag); w.appendChild(node); node = w; }
    }
    el.replaceChildren(node);
  });
  return root.innerHTML;
}

/**
 * แปลหลายข้อความ (ค่าเริ่มต้น ไทย → อังกฤษ) · opts.free = ใช้ตัวแปลฟรีอย่างเดียว (ไม่เรียก GPT)
 * opts.place = แปลจากที่ไหน (ทะเบียน lib/paid-services · ai.translate places) — แอดมินเปิด-ปิด GPT รายที่ได้ในศูนย์ AI/API · ไม่ใส่ = "อื่น ๆ"
 */
export type TranslateOpts = { free?: boolean; place?: string };
export async function translateContent(texts: string[], to: "en" | "th" = "en", opts: TranslateOpts = {}): Promise<string[]> {
  const out = texts.map(() => "");
  const idx = texts.map((t, i) => (t.trim() ? i : -1)).filter((i) => i >= 0);
  let batch: number[] = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const got = await translateChunk(batch.map((i) => texts[i].trim().slice(0, 4000)), to, !!opts.free, opts.place);
    batch.forEach((i, k) => (out[i] = got[k] ?? ""));
    batch = [];
    size = 0;
  };
  for (const i of idx) {
    const len = Math.min(texts[i].length, 4000);
    if (batch.length && (size + len > CHUNK_CHARS || batch.length >= CHUNK_ITEMS)) await flush();
    batch.push(i);
    size += len;
  }
  await flush();
  return out;
}
