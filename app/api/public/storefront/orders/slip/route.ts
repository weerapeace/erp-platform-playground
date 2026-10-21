/**
 * API สาธารณะ — ลูกค้าแนบสลิปโอนของออเดอร์ : /api/public/storefront/orders/slip
 *
 * POST multipart/form-data { shop, no, phone, file(รูป JPG/PNG/WEBP ≤ 4MB) }
 *      → { ok:true, paymentStatus:"paid"|"verifying", result, message:{th,en} }
 *      ผ่านตรวจอัตโนมัติ (EasySlip) = ออเดอร์ "ชำระแล้ว" ทันที · อย่างอื่น = รอพนักงานตรวจในแท็บ 🧾 ออเดอร์
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS
 * ปลอดภัยเพราะ: ต้องรู้ทั้งเลขที่ออเดอร์ + เบอร์โทร · ดูหัวไฟล์จริง · จำกัดขนาด/จำนวนต่อออเดอร์
 * · ระบบไม่เคย "ปฏิเสธ" เอง และ "ผ่าน" ได้ทางเดียวคือยอดตรง + เข้าบัญชีร้าน + ไม่ซ้ำ (lib/website-payments)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { readSiteInfo } from "@/lib/website-site-info";
import { submitSlip } from "@/lib/website-payments-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 🔒 กันยิงรัว (lib/rate-limit · audit 2026-10-21)
  const limited = await overLimit(request, [{ name: "slip:ip", limit: 10, windowSec: 600 }]);
  if (limited) return json({ ok: false, error: limited, errorEn: "Too many requests. Please wait a moment and try again." }, 429);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง", errorEn: "Invalid request." }, 400);
  }
  const slug = String(form.get("shop") ?? "").trim();
  const file = form.get("file");
  if (!slug) return json({ ok: false, error: "ต้องระบุ shop", errorEn: "Shop is required." }, 400);
  if (!(file instanceof File)) return json({ ok: false, error: "ไม่พบไฟล์สลิป", errorEn: "No slip file received." }, 400);

  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, status").eq("slug", slug).maybeSingle();
  const s = shop as { id: string; status: string } | null;
  if (!s || s.status !== "active") return json({ ok: false, error: "ไม่พบร้าน", errorEn: "Shop not found." }, 404);

  const info = await readSiteInfo(sb, s.id);
  const r = await submitSlip(sb, {
    shopId: s.id,
    orderNo: String(form.get("no") ?? ""),
    phone: String(form.get("phone") ?? ""),
    file,
    uploadEnabled: info.slip_upload_enabled && info.pay_promptpay,
    autoVerify: info.slip_auto_verify,
  });
  if (!r.ok) return json({ ok: false, error: r.error, errorEn: r.errorEn }, r.status);
  return json(r, 201);
}
