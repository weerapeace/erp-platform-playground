/**
 * POST /api/china-pay/ocr-slip — อ่าน "ยอดเงินที่โอน" จากรูปสลิป ด้วย Cloudflare Workers AI
 *
 * body: { key: string }   // ที่อยู่ไฟล์สลิป (ref · lib/file-ref): R2 key เดิม หรือ "sb:erp-files/china_pay/…" (ต้องมีสิทธิ์ดูหมวด)
 * คืน:  { amount: number | null, raw: string }
 *
 * - ใช้ binding AI (ตั้งใน wrangler.jsonc → "ai") · มีโควตาฟรีรายวัน
 * - รองรับเฉพาะรูป (jpg/png/webp) — PDF อ่านอัตโนมัติไม่ได้
 * - เป็นตัวช่วยกรอกเท่านั้น: ผู้ใช้ต้องตรวจ/แก้ตัวเลขก่อนบันทึกเสมอ
 */
import { NextRequest, NextResponse } from "next/server";
import { isSafeR2Key } from "@/lib/r2";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isRefForCategory, isSupabaseRef } from "@/lib/file-ref";
import { readFileRef } from "@/lib/file-ref-server";
import { categoryViewPermissions } from "@/lib/storage-policy";
import { readImageText, visionAvailable } from "@/lib/paid-services-server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;
const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

/* eslint-disable @typescript-eslint/no-explicit-any */
// ดึงตัวเลขเงินก้อนใหญ่สุดจากข้อความที่ AI ตอบ (รองรับคอมมา/ทศนิยม)
function parseAmount(text: string): number | null {
  const matches = text.match(/[0-9][0-9,]*(?:\.[0-9]+)?/g);
  if (!matches) return null;
  const nums = matches.map((m) => Number(m.replace(/,/g, ""))).filter((n) => isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  return Math.max(...nums);   // ยอดโอนมักเป็นเลขก้อนใหญ่สุดในสลิป
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ต้องล็อกอิน (แบบเดียวกับ china-pay/balance) — กันคนนอกใช้ AI (เสียเงิน) อ่านไฟล์ใน R2
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  let body: { key?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = String(body.key ?? "");
  const sb = isSupabaseRef(key);
  if (!key || (sb ? !isRefForCategory(key, "china_pay") : !SAFE_KEY.test(key) || !isSafeR2Key(key))) return NextResponse.json({ error: "key ไม่ถูกต้อง" }, { status: 400 });
  // ไฟล์ส่วนตัว (Supabase) — ต้องมีสิทธิ์ดูหมวดเหมือนตอนเปิดดูรูป (/api/files/sign)
  if (sb) {
    let ok = false;
    for (const p of categoryViewPermissions("china_pay")) if (await apiCan(request, p)) { ok = true; break; }
    if (!ok) return NextResponse.json({ error: "ไม่มีสิทธิ์อ่านไฟล์นี้" }, { status: 403 });
  }
  if (key.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "ไฟล์ PDF อ่านอัตโนมัติไม่ได้ — กรอกยอดเอง" }, { status: 400 });

  // ด่านกลาง: ปิดในศูนย์ AI/API หรือไม่มีผู้ให้บริการที่ตั้งรหัสแล้ว = กรอกเอง
  if (!(await visionAvailable("cf.slip_ocr", { request }))) return NextResponse.json({ error: "ยังไม่ได้เปิดใช้ AI (binding)" }, { status: 503 });

  try {
    const obj = await readFileRef(supabaseAdmin(), key);
    if (!obj) return NextResponse.json({ error: "ไม่พบไฟล์สลิป" }, { status: 404 });

    const prompt = "นี่คือสลิปโอนเงินจากธนาคาร อ่านเฉพาะ 'จำนวนเงินที่โอน' (ยอดเงินหลัก) แล้วตอบกลับเป็นตัวเลขล้วนอย่างเดียว ไม่ต้องมีสกุลเงินหรือคำอื่น เช่น 20000.00";
    // AI อ่านรูป (ของกลาง) — ผู้ให้บริการตามที่เลือกในศูนย์ AI/API (GPT / Cloudflare) · ผลเป็นข้อความเหมือนเดิม
    const raw = (await readImageText("cf.slip_ocr", { bytes: obj.bytes, mime: obj.contentType, prompt, maxTokens: 64, cfModel: MODEL }, { request })) ?? "";
    const amount = parseAmount(raw);

    return NextResponse.json({ amount, raw });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
