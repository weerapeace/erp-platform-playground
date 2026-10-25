/**
 * /api/purchasing/line-orders — กล่องพัก "คำสั่งซื้อจากไลน์" (ตาราง purchase_order_captures)
 *
 * GET  ?status=pending|confirmed|rejected|all&q=   → รายการ + นับแต่ละสถานะ (เปิดหน้า = เก็บกวาดรูปชุดที่ค้างด้วย)
 * GET  ?id=<id>            → ใบเดียว + ใบที่เลขซ้ำ + PO ที่ผูก + PO ที่ระบบเสนอ (เฉพาะใบรอตรวจ)
 * GET  ?po_lines=<po_id>   → บรรทัดของ PO ใบนั้น (ใช้จับคู่รายการตอนเลือก PO เอง)
 * GET  ?po_search=<คำค้น>  → ค้น PO ที่ยังค้าง (ร่าง/รอรับของ)
 * GET  ?po_id=<po_id>      → คำสั่งซื้อที่ผูกกับ PO ใบนั้น (แถบ "หลักฐานคำสั่งซื้อ" ใน PoDetailModal)
 * GET  ?line_setup=1       → (แอดมิน) กลุ่มไลน์ที่บอทอยู่แล้วทั้งหมด พร้อมชื่อ/จำนวนคน/ใช้ทำอะไรอยู่ (เลือกใช้ได้ทันที)
 * POST (multipart: images) → อัปรูปเอง (สำรองตอนไลน์มีปัญหา / ทดสอบ) → AI อ่าน → คืนใบใหม่
 * PATCH { id, fields?, action?: confirm|reject|restore|reread, confirm?, reason? }
 *
 * สิทธิ์: ดู = po.view · แก้/ยืนยัน/อัปรูป = po.edit — รูปมีชื่อ/ที่อยู่/เบอร์ผู้รับ ตารางนี้จึงเปิดผ่าน API นี้เท่านั้น
 * ของกลางที่ใช้: lib/order-capture (AI อ่าน/เสนอ PO/ยืนยัน) · lib/po-manual (เปิด PO ใหม่) · writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import {
  CAPTURE_COLUMNS, CAPTURE_TABLE, confirmCapture, finalizeStaleSets, findDuplicate, loadCapture, loadPoLines,
  loadLineGroupSetup, normalizeRow, normOrderNo, processCapture, putCaptureImage, searchOpenPos, suggestPurchaseOrders,
  type CaptureItem, type ConfirmInput,
} from "@/lib/order-capture";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // อัปรูปเอง = รอ AI อ่านจบในคำขอเดียว

type Rec = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "").trim();
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["pending", "confirmed", "rejected"];

async function currentUser(request: NextRequest): Promise<{ id: string; name: string } | null> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return user ? { id: user.id, name: user.email ?? "system" } : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "po.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = request.nextUrl.searchParams;

  // ---- ใบเดียว ----
  const id = str(sp.get("id"));
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    const cap = await loadCapture(admin, id);
    if (!cap) return NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้" }, { status: 404 });
    const dup = cap.dup_of ? await loadCapture(admin, cap.dup_of) : await findDuplicate(admin, cap.id, cap.order_no_norm);
    let po: Rec | null = null;
    if (cap.po_id) {
      const { data } = await admin.from("purchase_orders_v2").select("id, po_no, seller_name, status, currency, grand_total").eq("id", cap.po_id).maybeSingle();
      po = (data as Rec | null) ?? null;
    }
    const suggestions = cap.status === "pending" ? await suggestPurchaseOrders(admin, cap) : [];
    return NextResponse.json({
      item: cap,
      dup: dup ? { id: dup.id, status: dup.status, sender_name: dup.sender_name, created_at: dup.created_at, po_id: dup.po_id } : null,
      po, suggestions, error: null,
    });
  }

  // ---- บรรทัดของ PO (เลือก PO เอง) ----
  const poLines = str(sp.get("po_lines"));
  if (poLines) {
    if (!UUID.test(poLines)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    const { data: po } = await admin.from("purchase_orders_v2").select("id, po_no, seller_name, status, currency, order_date, grand_total").eq("id", poLines).maybeSingle();
    if (!po) return NextResponse.json({ error: "ไม่พบใบสั่งซื้อ" }, { status: 404 });
    const lines = (await loadPoLines(admin, [poLines])).get(poLines) ?? [];
    return NextResponse.json({ po, lines, error: null });
  }

  // ---- ค้น PO ที่ค้าง ----
  if (sp.has("po_search")) {
    return NextResponse.json({ rows: await searchOpenPos(admin, str(sp.get("po_search"))), error: null });
  }

  // ---- สถานะกลุ่มไลน์ (แอดมิน) — กลุ่มที่บอทอยู่แล้วทั้งหมด (ชื่อจริง + ใช้ทำอะไรอยู่) ให้กด "ใช้กลุ่มนี้" ได้ทันที ----
  if (sp.has("line_setup")) {
    const deniedAdmin = await guardApi(request, "admin.users"); if (deniedAdmin) return deniedAdmin;
    return NextResponse.json({ ...(await loadLineGroupSetup(admin)), error: null });
  }

  // ---- คำสั่งซื้อที่ผูกกับ PO ----
  const poId = str(sp.get("po_id"));
  if (poId) {
    if (!UUID.test(poId)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    const { data } = await admin.from(CAPTURE_TABLE).select(CAPTURE_COLUMNS).eq("po_id", poId).eq("status", "confirmed").order("created_at");
    return NextResponse.json({ rows: ((data ?? []) as unknown as Rec[]).map(normalizeRow), error: null });
  }

  // ---- รายการ ----
  try { await finalizeStaleSets(admin); } catch { /* เก็บกวาดไม่ได้ก็ยังโชว์รายการได้ */ }
  const status = str(sp.get("status")) || "pending";
  const q = str(sp.get("q")).replace(/[%,()]/g, " ").trim();
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 60));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  let query = admin.from(CAPTURE_TABLE).select(CAPTURE_COLUMNS, { count: "exact" })
    .neq("status", "collecting").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (status === "pending") query = query.in("status", ["pending", "processing"]);
  else if (STATUSES.includes(status)) query = query.eq("status", status);
  if (q) query = query.or(`shop_name.ilike.%${q}%,order_no.ilike.%${q}%,sender_name.ilike.%${q}%,tracking_no.ilike.%${q}%`);
  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: "โหลดรายการไม่สำเร็จ: " + error.message }, { status: 500 });

  // นับแต่ละแท็บด้วย count (ไม่ดึงแถว — กันเพดาน 1,000 แถวของ PostgREST ทำตัวเลขเพี้ยนเมื่อข้อมูลเยอะ)
  const countOf = async (statuses: string[]) => {
    const { count: c } = await admin.from(CAPTURE_TABLE).select("id", { count: "exact", head: true }).in("status", statuses);
    return c ?? 0;
  };
  const [cPending, cConfirmed, cRejected] = await Promise.all([countOf(["pending", "processing"]), countOf(["confirmed"]), countOf(["rejected"])]);
  const counts: Record<string, number> = { pending: cPending, confirmed: cConfirmed, rejected: cRejected, all: cPending + cConfirmed + cRejected };

  // PO ที่ผูก → เลขที่ (โชว์บนการ์ด)
  const rows = ((data ?? []) as unknown as Rec[]).map(normalizeRow);
  const poIds = [...new Set(rows.map((r) => r.po_id).filter((v): v is string => !!v))];
  const poNo: Record<string, string> = {};
  if (poIds.length) {
    const { data: pos } = await admin.from("purchase_orders_v2").select("id, po_no").in("id", poIds);
    for (const p of (pos ?? []) as Rec[]) poNo[String(p.id)] = str(p.po_no);
  }
  return NextResponse.json({
    rows: rows.map((r) => ({ ...r, po_no: r.po_id ? poNo[r.po_id] ?? null : null })),
    total: count ?? rows.length, counts, error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "po.edit"); if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "ไม่พบไฟล์รูป" }, { status: 400 }); }
  const files = form.getAll("images").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f).slice(0, 6);
  if (files.length === 0) return NextResponse.json({ error: "ยังไม่ได้เลือกรูป" }, { status: 400 });
  for (const f of files) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return NextResponse.json({ error: `"${f.name}" ไม่ใช่รูป jpg/png/webp` }, { status: 400 });
    if (f.size > 4 * 1024 * 1024) return NextResponse.json({ error: `"${f.name}" ใหญ่เกิน 4MB` }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const keys: string[] = [];
  try {
    for (const f of files) keys.push(await putCaptureImage(new Uint8Array(await f.arrayBuffer()), f.type));
  } catch (e) {
    return NextResponse.json({ error: "อัปรูปไม่สำเร็จ: " + String((e as Error)?.message ?? e) }, { status: 500 });
  }
  const { data: ins, error } = await admin.from(CAPTURE_TABLE).insert({
    source: "upload", status: "processing", image_keys: keys, sender_name: user.name, created_by: user.name,
  }).select("id").single();
  if (error || !ins) return NextResponse.json({ error: "บันทึกไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });
  const capId = String((ins as Rec).id);
  await writeAudit(admin, { action: "create", entityType: CAPTURE_TABLE, entityId: capId, actorId: user.id, actorName: user.name, metadata: { source: "upload", images: keys.length } });

  const item = await processCapture(admin, capId, user.name);
  return NextResponse.json({ item, error: null });
}

/** รายการสินค้าที่หน้าจอส่งมา → รูปที่ปลอดภัย */
function cleanItems(v: unknown): CaptureItem[] {
  return (Array.isArray(v) ? v : []).slice(0, 80).map((x) => {
    const it = (x ?? {}) as Rec;
    const qty = numOrNull(it.qty);
    return {
      name: str(it.name).slice(0, 300),
      name_th: str(it.name_th).slice(0, 300),
      option: str(it.option).slice(0, 200),
      qty: qty && qty > 0 ? qty : 1,
      unit_price: numOrNull(it.unit_price),
      line_total: numOrNull(it.line_total),
      sku_id: UUID.test(str(it.sku_id)) ? str(it.sku_id) : null,
      sku_code: str(it.sku_code) || null,
      sku_name: str(it.sku_name) || null,
      po_line_id: str(it.po_line_id) === "new" ? "new" : (UUID.test(str(it.po_line_id)) ? str(it.po_line_id) : null),
    };
  }).filter((it) => it.name || it.name_th || it.sku_name);
}

const EDITABLE_PENDING = ["platform", "shop_name", "order_no", "order_date", "currency", "items", "shipping_fee", "discount", "total_paid", "tracking_no", "note"];
const EDITABLE_CONFIRMED = ["tracking_no", "note"];

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "po.edit"); if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let body: { id?: string; fields?: Rec; action?: string; confirm?: ConfirmInput; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const id = str(body.id);
  if (!UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const admin = supabaseAdmin();
  let cap = await loadCapture(admin, id);
  if (!cap) return NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้" }, { status: 404 });

  // ---- บันทึกการแก้ไข (ทำก่อน action เสมอ → กดยืนยันพร้อมแก้ได้ในครั้งเดียว) ----
  if (body.fields && typeof body.fields === "object") {
    const allowed = cap.status === "pending" ? EDITABLE_PENDING : cap.status === "confirmed" ? EDITABLE_CONFIRMED : [];
    const f = body.fields;
    const patch: Rec = {};
    for (const k of allowed) {
      if (!(k in f)) continue;
      if (k === "items") patch.items = cleanItems(f.items);
      else if (["shipping_fee", "discount", "total_paid"].includes(k)) patch[k] = numOrNull(f[k]);
      else if (k === "order_date") patch.order_date = /^\d{4}-\d{2}-\d{2}$/.test(str(f.order_date)) ? str(f.order_date) : null;
      else if (k === "currency") patch.currency = ["RMB", "YUAN", "CNY"].includes(str(f.currency).toUpperCase()) ? "RMB" : "THB";
      else patch[k] = str(f[k]).slice(0, k === "note" ? 2000 : 300) || null;
    }
    if ("order_no" in patch) {
      patch.order_no_norm = normOrderNo(patch.order_no);
      patch.dup_of = (await findDuplicate(admin, id, patch.order_no_norm as string | null))?.id ?? null;
    }
    if (Object.keys(patch).length) {
      const { error } = await admin.from(CAPTURE_TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 400 });
      await writeAudit(admin, { action: "update", entityType: CAPTURE_TABLE, entityId: id, actorId: user.id, actorName: user.name, metadata: { changed: Object.keys(patch) } });
      cap = (await loadCapture(admin, id))!;
    }
  }

  const action = str(body.action);
  if (action === "confirm") {
    const input = (body.confirm ?? { mode: "none" }) as ConfirmInput;
    if (!["link", "new", "none"].includes(input.mode)) return NextResponse.json({ error: "วิธียืนยันไม่ถูกต้อง" }, { status: 400 });
    const res = await confirmCapture(admin, cap, input, user);
    if (!res.ok) return NextResponse.json({ error: res.error, status_code: res.status }, { status: res.status });
    return NextResponse.json({ item: await loadCapture(admin, id), po_id: res.po_id, po_no: res.po_no, warnings: res.warnings, error: null });
  }

  if (action === "reject") {
    if (cap.status !== "pending") return NextResponse.json({ error: "ตีตกได้เฉพาะใบที่รอตรวจ" }, { status: 400 });
    const now = new Date().toISOString();
    await admin.from(CAPTURE_TABLE).update({ status: "rejected", rejected_by: user.name, rejected_at: now, reject_reason: str(body.reason).slice(0, 300) || null, updated_at: now }).eq("id", id);
    await writeAudit(admin, { action: "reject", entityType: CAPTURE_TABLE, entityId: id, actorId: user.id, actorName: user.name, metadata: { reason: str(body.reason) || null, order_no: cap.order_no } });
  } else if (action === "restore") {
    if (cap.status !== "rejected") return NextResponse.json({ error: "กู้คืนได้เฉพาะใบที่ตีตก" }, { status: 400 });
    await admin.from(CAPTURE_TABLE).update({ status: "pending", rejected_by: null, rejected_at: null, reject_reason: null, updated_at: new Date().toISOString() }).eq("id", id);
    await writeAudit(admin, { action: "restore", entityType: CAPTURE_TABLE, entityId: id, actorId: user.id, actorName: user.name, metadata: { order_no: cap.order_no } });
  } else if (action === "reread") {
    if (cap.status !== "pending") return NextResponse.json({ error: "ให้ AI อ่านใหม่ได้เฉพาะใบที่รอตรวจ" }, { status: 400 });
    await admin.from(CAPTURE_TABLE).update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", id);
    await processCapture(admin, id, user.name);
  } else if (action) {
    return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  }

  return NextResponse.json({ item: await loadCapture(admin, id), error: null });
}
