/**
 * /api/subscriptions/[id]/invoices — ใบเสร็จรายเดือน (PDF)
 * GET  → รายการใบเสร็จ + ลิงก์เปิด (signed url) (subscriptions.view)
 * POST → อัปโหลด PDF เข้า Supabase Storage bucket `invoices` (subscriptions.edit)
 *
 * ใช้ตาราง subscription_invoices + bucket `invoices` ร่วมกับแอปเดิม (path เดิม: <subId>/<month>/<file>)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import type { SubInvoice } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX = 15 * 1024 * 1024; // 15MB
const SIGNED_TTL = 60 * 60;   // 1 ชั่วโมง

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
  if (!file) return NextResponse.json({ error: "กรุณาแนบไฟล์ PDF" }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "กรุณาเลือกเดือน (YYYY-MM)" }, { status: 400 });
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
    return NextResponse.json({ error: "รองรับเฉพาะไฟล์ PDF" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 15MB" }, { status: 400 });

  const safeName = (file.name || "invoice.pdf").replace(/[^\w.\-() ]+/g, "_");
  const path = `${id}/${month}/${safeName}`;

  const db = supabaseAdmin();
  const { error: upErr } = await db.storage.from("invoices")
    .upload(path, await file.arrayBuffer(), { upsert: true, contentType: "application/pdf" });
  if (upErr) return NextResponse.json({ error: `อัปโหลดไม่สำเร็จ: ${upErr.message}` }, { status: 500 });

  const invId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const { data: row, error: dbErr } = await db.from("subscription_invoices").insert({
    id: invId, subscription_id: id, month, file_name: safeName, file_path: path,
  }).select("*").single();
  if (dbErr || !row) return NextResponse.json({ error: dbErr?.message ?? "บันทึกไม่สำเร็จ" }, { status: 500 });

  await writeAudit(db, {
    action: "attach", entityType: "subscription_invoices", entityId: null,
    actorId: auth?.user?.id ?? null, actorName: null,
    metadata: { sub_id: id, month, file: safeName },
  });

  const { data: signed } = await db.storage.from("invoices").createSignedUrl(path, SIGNED_TTL);
  return NextResponse.json({ data: { ...row, url: signed?.signedUrl ?? null }, error: null });
}
