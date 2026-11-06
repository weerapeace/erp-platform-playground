/**
 * POST /api/loan-payment/read-receipt — อ่านใบเสร็จ/สลิปจ่ายเงินกู้ด้วย AI
 *
 * body: { key: string }    // R2 key ของรูปที่อัปโหลดไว้แล้ว
 * คืน:  { total, principal, interest, penalty, fee, payment_date, receipt_no, raw }
 *
 * ใช้ตัวอ่านรูปตัวเดียวกับ "อ่านสลิปโอนเงิน" ของจีนเพย์ (Workers AI vision ผ่าน lib/ai)
 * ⚠️ เป็นแค่ "ตัวช่วยกรอก" — ผู้ใช้ต้องตรวจ/แก้ก่อนกดบันทึกเสมอ
 */
import { NextRequest, NextResponse } from "next/server";
import { r2GetObject } from "@/lib/r2";
import { readImageText, visionAvailable } from "@/lib/paid-services-server";
import { guardApi } from "@/lib/api-auth";
import { parseDateCell, parseNumberCell } from "@/lib/paste-table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;
const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** ดึง JSON ก้อนแรกจากข้อความ (เผื่อ AI ใส่ข้อความอื่นปน) */
function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const money = (v: unknown) => {
  const n = parseNumberCell(v);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

const PROMPT =
  "นี่คือใบเสร็จ/สลิปการชำระเงินกู้ของธนาคาร อ่านตัวเลขในเอกสารแล้วตอบกลับเป็น JSON อย่างเดียว รูปแบบ " +
  '{"total": <ยอดชำระรวมทั้งหมดเป็นตัวเลข>, "principal": <ส่วนที่ตัดเงินต้น>, "interest": <ดอกเบี้ย>, ' +
  '"penalty": <ดอกเบี้ยผิดนัดชำระหรือเบี้ยปรับ>, "fee": <ค่าธรรมเนียม>, ' +
  '"date": "<วันที่ชำระ>", "receipt_no": "<เลขที่ใบเสร็จ>"} ' +
  "ค่าตัวเลขห้ามมีลูกน้ำ ถ้าหาค่าไหนไม่เจอให้ใส่ 0 หรือค่าว่าง ห้ามมีข้อความอื่นนอก JSON";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_payments.create");
  if (denied) return denied;

  let body: { key?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const key = String(body.key ?? "");
  if (!key || !SAFE_KEY.test(key)) return NextResponse.json({ error: "ยังไม่ได้แนบรูป" }, { status: 400 });
  if (key.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "ไฟล์ PDF อ่านอัตโนมัติไม่ได้ — กรอกยอดเองได้เลย" }, { status: 200 });
  }

  // ด่านกลาง: ปิดในศูนย์ AI/API หรือไม่มีผู้ให้บริการที่ตั้งรหัสแล้ว = กรอกเอง
  if (!(await visionAvailable("cf.receipt_ocr", { request }))) return NextResponse.json({ error: "ยังไม่ได้เปิดใช้ตัวอ่านรูป (AI) — กรอกยอดเองได้เลย" }, { status: 200 });

  try {
    const obj = await r2GetObject(key);
    if (!obj) return NextResponse.json({ error: "ไม่พบไฟล์รูป" }, { status: 200 });
    const buf = await new Response(obj.body).arrayBuffer();

    // AI อ่านรูป (ของกลาง) — ผู้ให้บริการตามที่เลือกในศูนย์ AI/API (GPT / Cloudflare) · ผลเป็นข้อความเหมือนเดิม
    const raw = (await readImageText("cf.receipt_ocr", { bytes: new Uint8Array(buf), mime: obj.httpMetadata?.contentType, prompt: PROMPT, maxTokens: 300, cfModel: MODEL }, { request })) ?? "";
    const j = extractJson(raw) ?? {};

    const principal = money(j.principal);
    const interest  = money(j.interest);
    const penalty   = money(j.penalty);
    const fee       = money(j.fee);
    let total = money(j.total);
    const split = Math.round((principal + interest + penalty + fee) * 100) / 100;
    // ยอดรวมอ่านไม่ออกแต่แยกได้ → ใช้ผลรวมของส่วนแยกแทน
    if (total <= 0 && split > 0) total = split;

    return NextResponse.json({
      total,
      principal, interest, penalty, fee,
      // ส่วนแยกรวมกันไม่ตรงยอดรวม → บอกฝั่งจอไว้ ให้ผู้ใช้ตรวจก่อน
      split_matches: split > 0 ? Math.abs(split - total) <= 0.01 : null,
      payment_date: parseDateCell(j.date),
      receipt_no: String(j.receipt_no ?? "").trim(),
      raw,
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: "อ่านรูปไม่สำเร็จ: " + String((e as Error)?.message ?? e) }, { status: 200 });
  }
}
