/**
 * POST /api/ai/translate — แปลข้อความ ไทย↔อังกฤษ อัตโนมัติ ด้วย Cloudflare Workers AI
 * body: { text: string }            คืน: { translated: string }
 * - ตรวจภาษาเอง: ไทย→อังกฤษ, อังกฤษ/อื่น→ไทย
 * - ใช้ binding AI (wrangler.jsonc "ai") มีโควตาฟรีรายวัน
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { getAi } from "@/lib/ai";

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  let body: { text?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "no text" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "ข้อความยาวเกินไป (จำกัด 4000 ตัวอักษร)" }, { status: 400 });

  const hasThai = /[฀-๿]/.test(text);
  const target = hasThai ? "English" : "Thai";
  const tlCode = hasThai ? "en" : "th";

  // 1) ลอง Cloudflare AI ก่อน (ถ้าพร้อม — บน CF หรือมี CF_ACCOUNT_ID/CF_AI_API_TOKEN)
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
      if (translated) return NextResponse.json({ data: { translated, target }, error: null });
    } catch { /* ตกไปใช้ตัวสำรองด้านล่าง */ }
  }

  // 2) ตัวสำรองฟรี (Google) — ทำงานได้แม้ไม่มี Cloudflare AI (เช่นบน Vercel)
  try {
    const translated = await googleTranslate(text, tlCode);
    if (translated) return NextResponse.json({ data: { translated, target }, error: null });
    return NextResponse.json({ error: "แปลไม่สำเร็จ" }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ error: `แปลไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }
}
