/**
 * /api/subscriptions/parse-invoice — อ่านข้อความใน PDF บิล แล้วเดายอดเงิน/วันที่ (subscriptions.view)
 * ใช้ unpdf ดึงข้อความ (รันบน node ฝั่ง Vercel — ฟรี ไม่ส่งข้อมูลออกไปที่สาม) + parseInvoiceFields
 * POST (multipart: file) → { amount, currency, dateISO, month, hasText }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { parseInvoiceFields } from "@/lib/parse-invoice";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX = 15 * 1024 * 1024;
const EMPTY = { amount: null, currency: null, dateISO: null, month: null };

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;

  let fd: FormData;
  try { fd = await request.formData(); }
  catch { return NextResponse.json({ ...EMPTY, error: "invalid form data" }, { status: 400 }); }

  const file = fd.get("file") as File | null;
  if (!file) return NextResponse.json({ ...EMPTY, error: "ต้องแนบไฟล์" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ...EMPTY, error: "ไฟล์ใหญ่เกินไป" }, { status: 400 });

  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const buf = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const res = await extractText(pdf, { mergePages: true });
    const t = res.text as unknown;
    const text = typeof t === "string" ? t : Array.isArray(t) ? (t as string[]).join("\n") : "";
    const parsed = parseInvoiceFields(text);
    // hasText=false → น่าจะเป็นบิลรูป/สแกน (ไม่มีชั้นข้อความ) → อ่านตรงๆ ไม่ได้
    return NextResponse.json({ ...parsed, hasText: text.trim().length > 20, error: null });
  } catch (e) {
    return NextResponse.json({ ...EMPTY, hasText: false, error: e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ" }, { status: 200 });
  }
}
