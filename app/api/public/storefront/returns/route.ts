/**
 * API สาธารณะ — ↩️ ขอคืน/เปลี่ยนสินค้า : /api/public/storefront/returns
 * GET  ?t=<ลิงก์มีลายเซ็น> → { data } ออเดอร์ · ชิ้นที่ขอได้ · ขอได้ถึงวันไหน · คำขอเดิม (lib/website-returns-server returnPageData)
 * POST multipart: t, payload = JSON { kind, reason, detail, items:[{itemId, qty}] }, lang?, ไฟล์ img (สูงสุด 3)
 * ลิงก์ (t) ได้จากหน้าตามออเดอร์หลังผ่านด่านเลขออเดอร์+เบอร์ (ใช้ลายเซ็นชุดเดียวกับลิงก์รีวิว · lib/review-token)
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS · กันยิงรัวด้วย rate-limit · รูปตรวจหัวไฟล์จริง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { verifyReviewToken } from "@/lib/review-token";
import { returnPageData, submitReturn } from "@/lib/website-returns-server";
import { cleanReturnInput, RETURN_MAX_IMAGES } from "@/lib/website-returns";
import { storefrontCors, corsPreflight, corsJson } from "@/lib/storefront-cors";

export const dynamic = "force-dynamic";

const CORS = storefrontCors("GET, POST");

export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}

const json = corsJson(CORS);
const BAD_LINK = { error: "ลิงก์ใช้ไม่ได้หรือหมดอายุ — เปิดใหม่จากหน้าตามออเดอร์", errorEn: "This link is invalid or expired — open it again from the order tracking page." };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limited = await overLimit(request, [{ name: "returns-get:ip", limit: 60, windowSec: 600 }]);
  if (limited) return json({ error: limited }, 429);
  const orderId = verifyReviewToken(request.nextUrl.searchParams.get("t"));
  if (!orderId) return json(BAD_LINK, 404);
  const page = await returnPageData(supabaseAdmin(), orderId);
  if (!page) return json(BAD_LINK, 404);
  return json({ data: page.data });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = await overLimit(request, [{ name: "returns-post:ip", limit: 10, windowSec: 3600 }]);
  if (limited) return json({ ok: false, error: limited }, 429);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง", errorEn: "Invalid request" }, 400);
  }
  const orderId = verifyReviewToken(form.get("t"));
  if (!orderId) return json({ ok: false, ...BAD_LINK }, 404);
  let payload: unknown = null;
  try {
    payload = JSON.parse(String(form.get("payload") ?? "null"));
  } catch {
    payload = null;
  }
  const input = cleanReturnInput(payload);
  if (!input.ok) return json({ ok: false, error: input.error, errorEn: input.errorEn }, 400);
  const files = form.getAll("img").filter((f): f is File => f instanceof File && f.size > 0).slice(0, RETURN_MAX_IMAGES);
  const lang = form.get("lang") === "en" ? "en" : "th";
  const r = await submitReturn(supabaseAdmin(), orderId, input.value, files, lang);
  if (!r.ok) return json({ ok: false, error: r.error, errorEn: r.errorEn }, r.status);
  return json({ ok: true, id: r.id }, 201);
}
