/**
 * POST /api/ai/translate — แปลข้อความ ไทย↔อังกฤษ
 * body: { text, to? }   คืน: { data: { translated, target, engine } }
 * body: { texts[], to? } คืน: { data: { translated_list, target, engine } }  ← ชุดเดียวหลายข้อความ
 *   (ใช้กับปุ่ม "แปลชื่อฟิลด์ทั้งโมดูล" — ยิงครั้งเดียวแทนการยิงทีละฟิลด์เป็นร้อยครั้ง
 *    ลำดับผลลัพธ์ตรงกับลำดับที่ส่งไป · ช่องที่แปลไม่ได้จะคืนเป็นค่าว่าง ไม่ใช่ทำให้ทั้งชุดพัง)
 *
 * ไล่ 3 ชั้น: ① GPT (คุณภาพดีสุด เรียบเรียงใหม่ ~0.02 บาท/ช่องยาว)
 *            ② Cloudflare Workers AI (ฟรีมีโควตา — ใช้เมื่ออยู่บน CF)
 *            ③ Google แปลฟรี (ตรงตัว — กันพังเวลาไม่มี key)
 * สไตล์การแปลตั้งเองได้ที่ทะเบียน prompt เดียวกับแคปชั่น โดยใช้ platform = "translate"
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { getAi } from "@/lib/ai";
import { chatJson, loadPromptRows, openAiKey, pickJobPrompt, TRANSLATE_KEY } from "@/lib/ai-caption";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ตัวสำรองแปลฟรี (ไม่ต้องตั้ง key) — ใช้ได้บน Vercel เมื่อ Cloudflare AI ไม่พร้อม · คงบรรทัดเดิม
async function googleTranslate(text: string, tl: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data: any = await res.json();
  const segs = Array.isArray(data?.[0]) ? data[0] : [];
  return segs.map((s: any) => (Array.isArray(s) ? s[0] ?? "" : "")).join("").trim();
}

/** ปลายทางการแปล: to บังคับได้ · ไม่ส่ง = มีอักษรไทย→อังกฤษ, อื่น→ไทย */
function pickTarget(sample: string, to?: string): { tlCode: string; target: string } {
  const forced = to === "en" ? "en" : to === "th" ? "th" : null;
  const tlCode = forced ?? (/[฀-๿]/.test(sample) ? "en" : "th");
  return { tlCode, target: tlCode === "en" ? "English" : "Thai" };
}

// แปลหลายข้อความในคำขอเดียว — GPT ก่อน (ครั้งเดียวจบ) ตกไป Google ทีละข้อความ (ทีละ 5 พร้อมกัน)
// คืนลำดับตรงกับที่ส่งมาเสมอ · ช่องที่แปลไม่ได้ = "" ให้ฝั่งเรียกข้ามไปเอง
async function translateBatch(list: string[], to?: string): Promise<NextResponse> {
  const { tlCode, target } = pickTarget(list.find(Boolean) ?? "", to);

  if (openAiKey()) {
    try {
      const style = pickJobPrompt(await loadPromptRows(), null, TRANSLATE_KEY);
      const sys = [
        `You are a professional translator for a Thai e-commerce/ERP system. Translate each numbered line into ${target}.`,
        "These are short data-entry field names (labels) in a business form — translate them as concise UI labels, not sentences.",
        "Keep proper nouns, URLs, product codes (SKU), and brand names unchanged.",
        style || "",
        'Reply as JSON: {"items":[{"i":1,"en":"..."}]} — exactly one entry per input line, keeping the same i number. No other keys.',
      ].filter(Boolean).join(" ");
      const userText = list.map((t, i) => `${i + 1}. ${t}`).join("\n");
      const out = await chatJson(sys, [{ type: "text", text: userText }], 3000);
      const items = Array.isArray((out as { items?: unknown })?.items) ? (out as { items: unknown[] }).items : [];
      const byIndex = new Map<number, string>();
      for (const raw of items) {
        const it = (raw ?? {}) as { i?: unknown; en?: unknown };
        const i = Number(it.i); const en = String(it.en ?? "").trim();
        if (Number.isInteger(i) && i >= 1 && i <= list.length && en) byIndex.set(i, en);
      }
      if (byIndex.size) {
        return NextResponse.json({
          data: { translated_list: list.map((_, i) => byIndex.get(i + 1) ?? ""), target, engine: "gpt" },
          error: null,
        });
      }
    } catch { /* ตกไปใช้ตัวสำรอง */ }
  }

  // ตัวสำรอง: Google ทีละข้อความ (ทำงานได้แม้ไม่มี key) — จำกัด 5 พร้อมกัน กันยิงถี่เกิน
  const outList = new Array<string>(list.length).fill("");
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(5, list.length) }, async () => {
    for (;;) {
      const my = cursor++;
      if (my >= list.length) return;
      const t = list[my];
      if (!t) continue;
      try { outList[my] = await googleTranslate(t, tlCode); } catch { /* ปล่อยว่าง ไม่ทำให้ทั้งชุดพัง */ }
    }
  }));
  if (outList.some(Boolean)) return NextResponse.json({ data: { translated_list: outList, target, engine: "google" }, error: null });
  return NextResponse.json({ error: "แปลไม่สำเร็จ" }, { status: 502 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  let body: { text?: string; texts?: unknown; to?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // ---- โหมดชุด (หลายข้อความในครั้งเดียว) ----
  const listIn = Array.isArray(body.texts) ? body.texts.map((s) => String(s ?? "").trim()) : null;
  if (listIn) {
    if (!listIn.some(Boolean)) return NextResponse.json({ error: "no text" }, { status: 400 });
    if (listIn.length > 400) return NextResponse.json({ error: "ส่งมาเกิน 400 ข้อความ" }, { status: 400 });
    if (listIn.join("").length > 12000) return NextResponse.json({ error: "ข้อความรวมกันยาวเกินไป (จำกัด 12000 ตัวอักษร)" }, { status: 400 });
    return translateBatch(listIn, body.to);
  }

  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "no text" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "ข้อความยาวเกินไป (จำกัด 4000 ตัวอักษร)" }, { status: 400 });

  // to = "en"/"th" บังคับปลายทาง (เช่น จีน→อังกฤษ) · ไม่ส่ง = ตรวจเอง (ไทย→อังกฤษ, อื่น→ไทย)
  const { tlCode, target } = pickTarget(text, body.to);

  // 0) GPT ก่อน (คุณภาพดีสุด — เรียบเรียงใหม่ให้อ่านลื่น ไม่แปลตรงตัวแบบเครื่องแปล)
  //    ราคา ~0.02 บาท/ช่องข้อความยาว · สไตล์การแปลตั้งเองได้ที่ทะเบียน prompt (platform = "translate")
  if (openAiKey()) {
    try {
      const style = pickJobPrompt(await loadPromptRows(), null, TRANSLATE_KEY);
      const sys = [
        `You are a professional translator for a Thai e-commerce/ERP system. Translate the user's text into ${target}.`,
        "Keep proper nouns, URLs, product codes (SKU), and brand names unchanged. Preserve line breaks and any leading '- ' bullets.",
        style || "Write naturally for online shoppers — do not translate word-for-word; rephrase so it reads like it was written in the target language. Do not add facts that are not in the source.",
        'Reply as JSON: {"translated":"..."} with no other keys.',
      ].join(" ");
      const out = await chatJson(sys, [{ type: "text", text }], 1500);
      const translated = String(out?.translated ?? "").trim();
      if (translated) return NextResponse.json({ data: { translated, target, engine: "gpt" }, error: null });
    } catch { /* ตกไปใช้ตัวถัดไป — ห้ามพังเงียบ */ }
  }

  // 1) ลอง Cloudflare AI (ถ้าพร้อม — บน CF หรือมี CF_ACCOUNT_ID/CF_AI_API_TOKEN)
  const ai = await getAi();
  if (ai) {
    try {
      const out: any = await ai.run(MODEL, {
        messages: [
          { role: "system", content: `You are a professional translator. Translate the user's text into ${target}. Keep proper nouns, URLs, product codes (SKU), and brand names unchanged. Preserve line breaks. Output ONLY the translation with no quotes, no notes, no explanation.` },
          { role: "user", content: text },
        ],
        max_tokens: 1024,
      });
      const translated = String(out?.response ?? "").trim();
      if (translated) return NextResponse.json({ data: { translated, target, engine: "cf" }, error: null });
    } catch { /* ตกไปใช้ตัวสำรองด้านล่าง */ }
  }

  // 2) ตัวสำรองฟรี (Google) — ทำงานได้แม้ไม่มี key ใด ๆ · แปลตรงตัว ไม่เรียบเรียง
  try {
    const translated = await googleTranslate(text, tlCode);
    if (translated) return NextResponse.json({ data: { translated, target, engine: "google" }, error: null });
    return NextResponse.json({ error: "แปลไม่สำเร็จ" }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ error: `แปลไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }
}
