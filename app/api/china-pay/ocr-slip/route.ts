/**
 * POST /api/china-pay/ocr-slip — อ่าน "ยอดเงินที่โอน" จากรูปสลิป ด้วย Cloudflare Workers AI
 *
 * body: { key: string }   // R2 key ของสลิปที่อัปโหลดไว้แล้ว
 * คืน:  { amount: number | null, raw: string }
 *
 * - ใช้ binding AI (ตั้งใน wrangler.jsonc → "ai") · มีโควตาฟรีรายวัน
 * - รองรับเฉพาะรูป (jpg/png/webp) — PDF อ่านอัตโนมัติไม่ได้
 * - เป็นตัวช่วยกรอกเท่านั้น: ผู้ใช้ต้องตรวจ/แก้ตัวเลขก่อนบันทึกเสมอ
 */
import { NextRequest, NextResponse } from "next/server";
import { r2GetObject } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;
const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

/* eslint-disable @typescript-eslint/no-explicit-any */
// ดึง binding AI จาก Cloudflare runtime (เลียนแบบ getR2Binding)
async function getAiBinding(): Promise<any | null> {
  try {
    const wk: any = await import(/* webpackIgnore: true */ ("cloudflare:workers" as string));
    if (wk?.env?.AI) return wk.env.AI;
  } catch { /* ไม่ใช่ runtime CF */ }
  try {
    const mod: any = await import(/* webpackIgnore: true */ ("@opennextjs/cloudflare" as string));
    const ctx = mod.getCloudflareContext ? mod.getCloudflareContext() : null;
    if (ctx?.env?.AI) return ctx.env.AI;
  } catch { /* noop */ }
  return null;
}

// ดึงตัวเลขเงินก้อนใหญ่สุดจากข้อความที่ AI ตอบ (รองรับคอมมา/ทศนิยม)
function parseAmount(text: string): number | null {
  const matches = text.match(/[0-9][0-9,]*(?:\.[0-9]+)?/g);
  if (!matches) return null;
  const nums = matches.map((m) => Number(m.replace(/,/g, ""))).filter((n) => isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  return Math.max(...nums);   // ยอดโอนมักเป็นเลขก้อนใหญ่สุดในสลิป
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { key?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = String(body.key ?? "");
  if (!key || !SAFE_KEY.test(key)) return NextResponse.json({ error: "key ไม่ถูกต้อง" }, { status: 400 });
  if (key.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "ไฟล์ PDF อ่านอัตโนมัติไม่ได้ — กรอกยอดเอง" }, { status: 400 });

  const ai = await getAiBinding();
  if (!ai) return NextResponse.json({ error: "ยังไม่ได้เปิดใช้ AI (binding)" }, { status: 503 });

  try {
    const obj = await r2GetObject(key);
    if (!obj) return NextResponse.json({ error: "ไม่พบไฟล์สลิป" }, { status: 404 });
    const buf = await new Response(obj.body).arrayBuffer();
    const bytes = [...new Uint8Array(buf)];

    const prompt = "นี่คือสลิปโอนเงินจากธนาคาร อ่านเฉพาะ 'จำนวนเงินที่โอน' (ยอดเงินหลัก) แล้วตอบกลับเป็นตัวเลขล้วนอย่างเดียว ไม่ต้องมีสกุลเงินหรือคำอื่น เช่น 20000.00";
    // Llama 3.2 vision ต้องยอมรับ license ครั้งแรก (error 5016 → ส่ง 'agree' แล้วลองใหม่)
    const runVision = async () => ai.run(MODEL, { image: bytes, prompt, max_tokens: 64 });
    let out: any;
    try { out = await runVision(); }
    catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/5016|agree/i.test(msg)) { try { await ai.run(MODEL, { prompt: "agree" }); } catch { /* noop */ } out = await runVision(); }
      else throw e;
    }
    const raw = String(out?.response ?? "").trim();
    const amount = parseAmount(raw);

    return NextResponse.json({ amount, raw });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
