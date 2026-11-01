/**
 * /api/subscriptions/[id]/invoices — ใบเสร็จรายเดือน (PDF หรือรูปบิล)
 * GET  → รายการใบเสร็จ + ลิงก์เปิด (signed url) (subscriptions.view)
 * POST → อัปโหลดไฟล์บิลเข้า Supabase Storage bucket `invoices` (subscriptions.edit)
 *        รับ PDF (อ่านยอด/วันที่ให้อัตโนมัติ) และรูปภาพ (สกรีนช็อตบิล — ไม่อ่านอัตโนมัติ กรอกเองได้)
 *
 * ใช้ตาราง subscription_invoices + bucket `invoices` ร่วมกับแอปเดิม (path เดิม: <subId>/<month>/<file>)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { type SubInvoice } from "@/lib/subscriptions";
import { saveSubInvoice, INVOICE_SIGNED_TTL as SIGNED_TTL } from "@/lib/subscription-invoices-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;
  const { id } = await params;

  const db = supabaseAdmin();
  const { data, error } = await db.from("subscription_invoices")
    .select("*").eq("subscription_id", id).order("month", { ascending: false });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const rows = (data ?? []) as SubInvoice[];
  // เซ็นลิงก์เปิดไฟล์เป็นชุด (ปลอดภัยแม้ bucket จะ private)
  const paths = rows.map((r) => r.file_path).filter(Boolean);
  const urlByPath: Record<string, string> = {};
  if (paths.length) {
    const { data: signed } = await db.storage.from("invoices").createSignedUrls(paths, SIGNED_TTL);
    (signed ?? []).forEach((s) => { if (s.path && s.signedUrl) urlByPath[s.path] = s.signedUrl; });
  }
  const out = rows.map((r) => ({ ...r, url: urlByPath[r.file_path] ?? null }));
  return NextResponse.json({ data: out, error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;
  const { id } = await params;

  const { data: auth } = await supabaseFromRequest(request).auth.getUser();

  let fd: FormData;
  try { fd = await request.formData(); }
  catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }

  const file = fd.get("file") as File | null;
  const month = String(fd.get("month") ?? "").trim();
  if (!file) return NextResponse.json({ error: "กรุณาแนบไฟล์บิล (PDF หรือรูป)" }, { status: 400 });

  const saved = await saveSubInvoice(supabaseAdmin(), {
    subId: id, month, fileName: file.name, contentType: file.type, bytes: await file.arrayBuffer(),
    actorId: auth?.user?.id ?? null,
  });
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ data: saved.data, error: null });
}
