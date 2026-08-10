/**
 * /api/subscriptions/[id]/invoices/[invId] — แก้ไข / ลบ ใบเสร็จ 1 ใบ (subscriptions.edit)
 * PATCH  → แก้ amount/currency/invoice_date/month/subscription_id + เปลี่ยนไฟล์ได้
 *          รับได้ทั้ง JSON และ multipart (ส่ง field `file` มาด้วย = เปลี่ยนไฟล์)
 *          ย้ายเดือน/ย้ายรายการ → ย้ายไฟล์ใน Storage ตามให้ (best-effort, path = <subId>/<month>/<file>)
 *          set parsed_at เสมอ = "ตรวจแล้ว" กันปุ่มอ่านบิลย้อนหลังทับค่าที่แก้เอง
 * DELETE → ลบทั้ง row และไฟล์ใน Storage
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { extractPdfFields } from "@/lib/parse-pdf-server";
import { invoiceFileKind } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CUR = new Set(["THB", "USD", "EUR", ""]);
const MAX = 15 * 1024 * 1024; // 15MB (เท่ากับตอนอัปโหลดครั้งแรก)

const safeFileName = (n: string) => (n || "invoice.pdf").replace(/[^\w.\-() ]+/g, "_");

/** แทรก -1 -2 … หน้า .นามสกุล กันชนไฟล์ชื่อซ้ำในโฟลเดอร์ปลายทาง */
function bumpName(name: string, n: number): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? `${name.slice(0, i)}-${n}${name.slice(i)}` : `${name}-${n}`;
}

/**
 * ย้ายไฟล์ไป path ใหม่ (เดือน/รายการเปลี่ยน) — คืน path ที่ใช้จริง
 * ย้ายไม่สำเร็จ (ชื่อชนหรือ storage ขัดข้อง) → คืน path เดิม แถวยังชี้ไฟล์ถูก ไม่ทำให้ผู้ใช้เสียข้อมูล
 */
async function moveInvoiceFile(db: ReturnType<typeof supabaseAdmin>, from: string, to: string): Promise<string> {
  if (!from || from === to) return from;
  for (let i = 0; i < 3; i++) {
    const target = i === 0 ? to : to.replace(/[^/]+$/, (f) => bumpName(f, i));
    const { error } = await db.storage.from("invoices").move(from, target);
    if (!error) return target;
  }
  return from;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; invId: string }> }) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;
  const { id, invId } = await params;

  type Body = { amount?: number | string | null; currency?: string; invoice_date?: string | null; month?: string; subscription_id?: string };
  let body: Body;
  let file: File | null = null;
  const isMultipart = (request.headers.get("content-type") ?? "").includes("multipart/form-data");
  if (isMultipart) {
    let fd: FormData;
    try { fd = await request.formData(); }
    catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }
    const f = fd.get("file");
    file = f instanceof File && f.size > 0 ? f : null;
    const str = (k: string) => (fd.get(k) === null ? undefined : String(fd.get(k)));
    body = { amount: str("amount"), currency: str("currency"), invoice_date: str("invoice_date"), month: str("month"), subscription_id: str("subscription_id") };
    // ช่องที่ไม่ได้ส่งมา = undefined อยู่แล้ว · ส่งมาเป็น "" หมายถึง "ล้างค่า" (เฉพาะ amount/invoice_date)
  } else {
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  }

  const patch: Record<string, unknown> = {};
  if (body.amount !== undefined) {
    const n = body.amount === null || body.amount === "" ? null : Number(body.amount);
    if (n !== null && !isFinite(n)) return NextResponse.json({ error: "จำนวนเงินไม่ถูกต้อง" }, { status: 400 });
    patch.amount = n;
  }
  if (body.currency !== undefined) {
    if (!CUR.has(body.currency)) return NextResponse.json({ error: "สกุลเงินไม่ถูกต้อง" }, { status: 400 });
    patch.currency = body.currency || "";
  }
  if (body.invoice_date !== undefined) {
    const d = body.invoice_date || null;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
    patch.invoice_date = d;
  }
  if (body.month !== undefined) {
    if (!/^\d{4}-\d{2}$/.test(body.month)) return NextResponse.json({ error: "เดือนไม่ถูกต้อง" }, { status: 400 });
    patch.month = body.month;
  }
  if (body.subscription_id !== undefined && body.subscription_id && body.subscription_id !== id) {
    patch.subscription_id = body.subscription_id;
  }
  if (Object.keys(patch).length === 0 && !file) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });

  const { data: auth } = await supabaseFromRequest(request).auth.getUser();
  const db = supabaseAdmin();

  const { data: cur } = await db.from("subscription_invoices")
    .select("*").eq("id", invId).eq("subscription_id", id).single();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบเสร็จ" }, { status: 404 });

  const toSub = (patch.subscription_id as string) ?? id;
  const toMonth = (patch.month as string) ?? (cur.month as string);

  // ย้ายไปรายการอื่น → ต้องมีรายการนั้นจริง
  if (toSub !== id) {
    const { data: target } = await db.from("subscriptions").select("id").eq("id", toSub).single();
    if (!target) return NextResponse.json({ error: "ไม่พบรายการปลายทาง" }, { status: 400 });
  }

  if (file) {
    const kind = invoiceFileKind(file.name, file.type);
    if (!kind) return NextResponse.json({ error: "รองรับเฉพาะไฟล์ PDF หรือรูปภาพ" }, { status: 400 });
    if (file.size > MAX) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 15MB" }, { status: 400 });

    const name = safeFileName(file.name);
    const path = `${toSub}/${toMonth}/${name}`;
    const buf = await file.arrayBuffer();
    const { error: upErr } = await db.storage.from("invoices")
      .upload(path, buf, { upsert: true, contentType: kind === "pdf" ? "application/pdf" : (file.type || "application/octet-stream") });
    if (upErr) return NextResponse.json({ error: `อัปโหลดไม่สำเร็จ: ${upErr.message}` }, { status: 500 });

    if (cur.file_path && cur.file_path !== path) {
      try { await db.storage.from("invoices").remove([cur.file_path as string]); } catch { /* ไฟล์เก่าลบไม่ได้ก็ปล่อย */ }
    }
    patch.file_name = name;
    patch.file_path = path;

    // ไฟล์ใหม่เป็น PDF และผู้ใช้ไม่ได้กรอกช่องนั้นมา → อ่านจากบิลให้
    if (kind === "pdf") {
      const parsed = await extractPdfFields(buf);
      if (body.amount === undefined) patch.amount = parsed.amount;
      if (body.currency === undefined) patch.currency = parsed.currency ?? "";
      if (body.invoice_date === undefined) patch.invoice_date = parsed.dateISO;
    }
  } else {
    // ไม่ได้เปลี่ยนไฟล์ แต่ย้ายเดือน/รายการ → ย้ายไฟล์ใน Storage ตามให้ path ตรงกับข้อมูล
    const used = await moveInvoiceFile(db, cur.file_path as string, `${toSub}/${toMonth}/${cur.file_name}`);
    if (used !== cur.file_path) { patch.file_path = used; patch.file_name = used.split("/").pop() ?? cur.file_name; }
  }

  patch.parsed_at = new Date().toISOString(); // แก้เอง = ตรวจแล้ว (กันปุ่มอ่านบิลย้อนหลังทับ)

  const { data, error } = await db.from("subscription_invoices")
    .update(patch).eq("id", invId).eq("subscription_id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "แก้ไขไม่สำเร็จ" }, { status: 500 });

  await writeAudit(db, {
    action: "update", entityType: "subscription_invoices", entityId: null,
    actorId: auth?.user?.id ?? null, actorName: null,
    metadata: {
      sub_id: id, inv_id: invId, changed: Object.keys(patch).filter((k) => k !== "parsed_at"),
      ...(toSub !== id ? { moved_to_sub: toSub } : {}),
    },
  });

  const { data: signed } = await db.storage.from("invoices").createSignedUrl(data.file_path as string, 60 * 60);
  return NextResponse.json({ data: { ...data, url: signed?.signedUrl ?? null }, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; invId: string }> }) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;
  const { id, invId } = await params;

  const { data: auth } = await supabaseFromRequest(request).auth.getUser();
  const db = supabaseAdmin();

  const { data: inv } = await db.from("subscription_invoices")
    .select("file_path, file_name").eq("id", invId).eq("subscription_id", id).single();
  if (!inv) return NextResponse.json({ error: "ไม่พบใบเสร็จ" }, { status: 404 });

  if (inv.file_path) { try { await db.storage.from("invoices").remove([inv.file_path as string]); } catch { /* ignore */ } }
  const { error } = await db.from("subscription_invoices").delete().eq("id", invId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(db, {
    action: "detach", entityType: "subscription_invoices", entityId: null,
    actorId: auth?.user?.id ?? null, actorName: null,
    metadata: { sub_id: id, inv_id: invId, file: inv.file_name },
  });
  return NextResponse.json({ ok: true, error: null });
}
