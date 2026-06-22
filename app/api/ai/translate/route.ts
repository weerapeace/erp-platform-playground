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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  let body: { text?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "no text" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "ข้อความยาวเกินไป (จำกัด 4000 ตัวอักษร)" }, { status: 400 });

  const ai = await getAi();
  if (!ai) return NextResponse.json({ error: "AI ใช้งานไม่ได้ในขณะนี้" }, { status: 503 });

  const hasThai = /[฀-๿]/.test(text);
  const target = hasThai ? "English" : "Thai";
  try {
    const out: any = await ai.run(MODEL, {
      messages: [
        { role: "system", content: `You are a professional translator. Translate the user's text into ${target}. Keep proper nouns, URLs, product codes (SKU), and brand names unchanged. Preserve line breaks. Output ONLY the translation with no quotes, no notes, no explanation.` },
        { role: "user", content: text },
      ],
      max_tokens: 1024,
    });
    const translated = String(out?.response ?? "").trim();
    if (!translated) return NextResponse.json({ error: "แปลไม่สำเร็จ" }, { status: 502 });
    return NextResponse.json({ data: { translated, target }, error: null });
  } catch (e) {
    return NextResponse.json({ error: `แปลไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }
}
