/**
 * POST /api/china-pay/ocr-slip-extract — อ่านข้อมูลจากสลิปโอนเงิน (สำหรับ AI จับคู่บิล)
 *
 * body: { key: string }   // R2 key ของสลิปที่อัปโหลดไว้แล้ว
 * คืน:  { amount: number|null, account: string, name: string, raw: string }
 *
 * - ใช้ binding AI (Llama 3.2 vision) — เป็นตัวช่วยเดา ผู้ใช้ต้องตรวจ/แก้ก่อนยืนยันเสมอ
 * - รองรับเฉพาะรูป (jpg/png/webp)
 */
import { NextRequest, NextResponse } from "next/server";
import { r2GetObject } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;
const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

/* eslint-disable @typescript-eslint/no-explicit-any */
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

function parseAmount(text: string): number | null {
  const matches = text.match(/[0-9][0-9,]*(?:\.[0-9]+)?/g);
  if (!matches) return null;
  const nums = matches.map((m) => Number(m.replace(/,/g, ""))).filter((n) => isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

// ดึง JSON ก้อนแรกจากข้อความ (เผื่อ AI ใส่ข้อความอื่นปน)
function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { key?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = String(body.key ?? "");
  if (!key || !SAFE_KEY.test(key)) return NextResponse.json({ error: "key ไม่ถูกต้อง" }, { status: 400 });
  if (key.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "ไฟล์ PDF อ่านอัตโนมัติไม่ได้ — เลือกบิลเอง", amount: null, account: "", name: "" }, { status: 200 });

  const ai = await getAiBinding();
  if (!ai) return NextResponse.json({ error: "ยังไม่ได้เปิดใช้ AI (binding)", amount: null, account: "", name: "" }, { status: 200 });

  try {
    const obj = await r2GetObject(key);
    if (!obj) return NextResponse.json({ error: "ไม่พบไฟล์สลิป", amount: null, account: "", name: "" }, { status: 200 });
    const buf = await new Response(obj.body).arrayBuffer();
    const bytes = [...new Uint8Array(buf)];

    const prompt = "นี่คือสลิปโอนเงิน อ่านข้อมูลแล้วตอบกลับเป็น JSON อย่างเดียว รูปแบบ {\"amount\": <จำนวนเงินที่โอนเป็นตัวเลข>, \"account\": \"<เลขบัญชีผู้รับ ตัวเลขล้วนเท่าที่เห็น>\", \"name\": \"<ชื่อผู้รับเงิน>\"} ถ้าหาค่าไหนไม่เจอให้ใส่ค่าว่าง ห้ามมีข้อความอื่นนอก JSON";
    const runVision = async () => ai.run(MODEL, { image: bytes, prompt, max_tokens: 200 });
    let out: any;
    try { out = await runVision(); }
    catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/5016|agree/i.test(msg)) { try { await ai.run(MODEL, { prompt: "agree" }); } catch { /* noop */ } out = await runVision(); }
      else throw e;
    }
    const raw = String(out?.response ?? "").trim();
    const j = extractJson(raw);
    const amount = j && j.amount != null && Number(j.amount) > 0 ? Number(j.amount) : parseAmount(raw);
    const account = j ? String(j.account ?? "").replace(/[^0-9]/g, "") : "";
    const name = j ? String(j.name ?? "").trim() : "";

    return NextResponse.json({ amount: amount ?? null, account, name, raw });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e), amount: null, account: "", name: "" }, { status: 200 });
  }
}
