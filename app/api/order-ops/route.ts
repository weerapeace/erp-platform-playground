/**
 * API งานหลังขาย — คำสั่งพิเศษออเดอร์ / รายการรอของ / ซ่อม-คืนสินค้า / ตัวเลือก
 * ?t=instructions | waitlist | cases | options
 *
 * GET    list (t, status, kind, q, trash=1, trial=only|hide, page) · ?id= รายละเอียด+ประวัติ · ?lookup=<เลขออเดอร์> ดึงจากศูนย์ออเดอร์
 * POST   สร้าง · {action:"print", ids} นับพิมพ์ใบสลัก · {action:"seed_trial"} ใส่ข้อมูลตัวอย่าง
 * PATCH  {t,id,patch} แก้ 1 รายการ · {t,ids,patch} แก้หลายรายการ (เฉพาะช่องสถานะ/ติ๊ก)
 * DELETE {t,ids} ย้ายลงถังขยะ · {t,ids,restore:true} กู้คืน · {t,ids,hard:true} ลบถาวร (เฉพาะในถังขยะ)
 *        {action:"clear_trial"} ล้างข้อมูลทดลองทั้งหมดลงถังขยะ · {action:"undo_clear_trial", at} ย้อนการล้าง
 *
 * สิทธิ์: order_ops.view / edit / delete / manage · ทุกการเขียนลง audit_logs
 */
import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { auditChangeMeta, writeAudit, writeAuditMany } from "@/lib/audit";
import {
  canMoveCase,
  cleanOrderNo,
  defaultCaseStatus,
  engraveTextError,
  ENGRAVE_POSITIONS,
  ENGRAVE_TYPES,
  isValidCaseStatus,
  parseMoney,
  type CaseKind,
} from "@/lib/order-ops";
import { findPlatformOrder, listPickerOrders, loadEngraveSpecials, OPS_ENTITY, OPS_TABLES, pickFields, str, whoAmI, type OpsTableKey } from "@/lib/order-ops-server";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const FIELDS: Record<OpsTableKey, readonly string[]> = {
  instructions: ["order_no", "platform", "customer_name", "sku", "commands", "engrave", "engrave_text", "engrave_type", "engrave_position", "engrave_font", "note", "status", "platform_order_id", "is_trial"],
  waitlist: ["order_no", "platform", "customer_name", "sku", "note", "informed", "platform_order_id", "is_trial"],
  cases: ["kind", "order_no", "customer_name", "sku", "qty", "topic", "detail", "resolution", "status", "replacement_sku", "shipping_charge", "shipping_refund", "bank_info", "shipping_address", "return_date", "images", "note", "platform_order_id", "is_trial"],
};
/** ช่องที่แก้หลายรายการพร้อมกันได้ */
const BULK_FIELDS: Record<OpsTableKey, readonly string[]> = {
  instructions: ["status"],
  waitlist: ["informed"],
  cases: ["status"],
};
/** ติ๊กของงานซ่อม/คืน → ช่องเวลา */
const CASE_FLAGS = { checked: "checked_at", stock_received: "stock_received_at", zort_cancelled: "zort_cancelled_at", packed: "packed_at" } as const;

const OPTION_KINDS = ["instruction_command", "repair_topic", "engrave_special", "engrave_font", "engrave_sku_type", "engrave_sku_pos"];
const isTable = (t: string | null): t is OpsTableKey => t === "instructions" || t === "waitlist" || t === "cases";
const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
const uuidRe = /^[0-9a-f-]{36}$/i;

function cleanQ(q: string) {
  return q.replace(/[%,()*"\\]/g, " ").trim().slice(0, 80);
}

/** ตรวจ/ปรับค่าก่อนบันทึก — คืนข้อความผิดพลาดภาษาคน หรือ null */
function normalize(t: OpsTableKey, row: Row, before: Row | null): string | null {
  if ("order_no" in row) {
    row.order_no = cleanOrderNo(str(row.order_no) ?? "") || null;
    if (t !== "waitlist" && !row.order_no) return "กรุณาใส่เลขออเดอร์";
  }
  if ("platform_order_id" in row && row.platform_order_id && !uuidRe.test(String(row.platform_order_id))) row.platform_order_id = null;
  if ("is_trial" in row) row.is_trial = row.is_trial === true;
  if (t === "instructions") {
    if ("commands" in row) row.commands = Array.isArray(row.commands) ? [...new Set((row.commands as unknown[]).map((c) => String(c).trim()).filter(Boolean))].slice(0, 20) : [];
    if ("engrave" in row) row.engrave = row.engrave === true;
    if (row.engrave_type && !(ENGRAVE_TYPES as readonly string[]).includes(String(row.engrave_type))) return "รูปแบบสลักไม่ถูกต้อง";
    if (row.engrave_position && !(ENGRAVE_POSITIONS as readonly string[]).includes(String(row.engrave_position))) return "ตำแหน่งสลักไม่ถูกต้อง";
    if ("status" in row && !["todo", "done"].includes(String(row.status))) return "สถานะไม่ถูกต้อง";
  }
  if (t === "waitlist" && "informed" in row) row.informed = row.informed === true;
  if (t === "cases") {
    const kind = (row.kind ?? before?.kind) as CaseKind;
    if (kind !== "repair" && kind !== "return") return "ไม่รู้ว่าเป็นงานซ่อมหรือของคืน";
    if ("status" in row) {
      const to = String(row.status ?? "");
      if (!isValidCaseStatus(kind, to)) return "สถานะไม่ถูกต้อง";
      if (before && !canMoveCase(kind, String(before.status), to)) return "เปลี่ยนจากสถานะเดิมไปสถานะนี้ตรง ๆ ไม่ได้";
    }
    if ("qty" in row) {
      const q = Math.round(Number(row.qty));
      if (!Number.isFinite(q) || q < 1) return "จำนวนต้องมากกว่า 0";
      row.qty = q;
    }
    for (const k of ["shipping_charge", "shipping_refund"]) if (k in row) row[k] = parseMoney(row[k]);
    if ("images" in row) row.images = Array.isArray(row.images) ? (row.images as unknown[]).map(String).slice(0, 20) : [];
    if ("return_date" in row && row.return_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(row.return_date))) row.return_date = null;
  }
  return null;
}

export async function GET(request: Request) {
  const denied = await guardApi(request, "order_ops.view");
  if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;

  // ตัวเลือกออเดอร์ (ของกลาง components/platform-order-picker) — ออเดอร์ที่มีหมายเหตุขึ้นก่อน
  if (sp.get("orders") === "1") {
    try {
      const r = await listPickerOrders(admin, {
        q: sp.get("q") ?? "", days: Number(sp.get("days") ?? 14) || 14, openOnly: sp.get("open") === "1",
        platformId: sp.get("platform_id"), notesFirst: sp.get("notes_first") !== "0", page: Number(sp.get("page") ?? 1) || 1,
      });
      return NextResponse.json(r);
    } catch { return bad("โหลดรายการออเดอร์ไม่สำเร็จ ลองใหม่อีกครั้ง", 500); }
  }

  const lookup = sp.get("lookup");
  if (lookup !== null) {
    const order = await findPlatformOrder(admin, lookup);
    const no = cleanOrderNo(lookup);
    const [{ data: ins }, { data: cases }] = no
      ? await Promise.all([
          admin.from("order_instructions").select("id, status, commands, engrave_text").eq("order_no", order?.order_no ?? no).is("deleted_at", null).limit(5),
          admin.from("after_sales_cases").select("id, kind, status, topic").eq("order_no", order?.order_no ?? no).is("deleted_at", null).limit(5),
        ])
      : [{ data: [] }, { data: [] }];
    return NextResponse.json({ order, existing: { instructions: ins ?? [], cases: cases ?? [] } });
  }

  const t = sp.get("t");
  if (t === "options") {
    const { data, error } = await admin.from("order_ops_options").select("*").order("kind").order("sort_order").order("label");
    if (error) return bad("โหลดตัวเลือกไม่สำเร็จ", 500);
    return NextResponse.json({ options: data ?? [] });
  }
  if (!isTable(t)) return bad("ไม่รู้จักชนิดข้อมูล");
  const table = OPS_TABLES[t];

  const id = sp.get("id");
  if (id) {
    const { data, error } = await admin.from(table).select("*").eq("id", id).maybeSingle();
    if (error || !data) return bad("ไม่พบรายการนี้", 404);
    const { data: logs } = await admin
      .from("audit_logs")
      .select("id, action, metadata, created_at")
      .eq("entity_type", OPS_ENTITY[t])
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    return NextResponse.json({ row: data, history: logs ?? [] });
  }

  const trash = sp.get("trash") === "1";
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const size = Math.min(200, Math.max(10, Number(sp.get("page_size") ?? 50) || 50));
  let q = admin.from(table).select("*", { count: "exact" });
  q = trash ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  const idsParam = (sp.get("ids") ?? "").split(",").filter((x) => uuidRe.test(x)).slice(0, 200);
  if (idsParam.length) q = q.in("id", idsParam);
  else if (t === "cases") q = q.eq("kind", sp.get("kind") === "return" ? "return" : "repair");
  const status = sp.get("status");
  if (status && t !== "waitlist") q = q.in("status", status.split(",").slice(0, 10));
  if (t === "waitlist" && sp.get("informed")) q = q.eq("informed", sp.get("informed") === "1");
  if (t === "instructions" && sp.get("engrave") === "1") q = q.eq("engrave", true);
  const trial = sp.get("trial");
  if (trial === "only") q = q.eq("is_trial", true);
  if (trial === "hide") q = q.eq("is_trial", false);
  const s = cleanQ(sp.get("q") ?? "");
  if (s) {
    const cols = t === "instructions" ? ["order_no", "customer_name", "sku", "engrave_text", "note"] : t === "waitlist" ? ["order_no", "customer_name", "sku", "note"] : ["order_no", "customer_name", "sku", "topic", "detail", "note"];
    q = q.or(cols.map((c) => `${c}.ilike.*${s}*`).join(","));
  }
  q = q.order(trash ? "deleted_at" : "created_at", { ascending: false }).range((page - 1) * size, page * size - 1);
  const { data, count, error } = await q;
  if (error) return bad("โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง", 500);

  // ตัวเลขการ์ด (ไม่นับถังขยะ)
  const summary: Record<string, number> = {};
  if (!trash) {
    const base = () => admin.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (t === "instructions") {
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const [a, b, c, d] = await Promise.all([
        base().eq("status", "todo"),
        base().eq("status", "todo").eq("engrave", true),
        admin.from("order_waitlist").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("informed", false),
        base().eq("status", "done").gte("done_at", `${today}T00:00:00+07:00`),
      ]);
      Object.assign(summary, { todo: a.count ?? 0, engrave: b.count ?? 0, waiting: c.count ?? 0, done_today: d.count ?? 0 });
    } else if (t === "cases") {
      const k = sp.get("kind") === "return" ? "return" : "repair";
      const [a, b, c, d] = await Promise.all([
        admin.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).eq("kind", "repair").in("status", ["waiting_customer", "repairing", "remake"]),
        admin.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).eq("kind", "repair").eq("status", "ready_to_ship"),
        admin.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).eq("kind", "return").in("status", ["received", "checked"]),
        admin.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).eq("kind", k),
      ]);
      Object.assign(summary, { repairing: a.count ?? 0, ready: b.count ?? 0, returns_open: c.count ?? 0, total: d.count ?? 0 });
    }
    const tr = await admin.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).eq("is_trial", true);
    summary.trial = tr.count ?? 0;
  }
  return NextResponse.json({ rows: data ?? [], total: count ?? 0, summary });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Row;
  const admin = supabaseAdmin();

  if (body.action === "print") {
    const denied = await guardApi(request, "order_ops.view");
    if (denied) return denied;
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => uuidRe.test(x)).slice(0, 200);
    if (!ids.length) return bad("ยังไม่ได้เลือกรายการ");
    const { data } = await admin.from("order_instructions").select("id, print_count, order_no").in("id", ids);
    const now = new Date().toISOString();
    await Promise.all(((data ?? []) as Row[]).map((r) => admin.from("order_instructions").update({ print_count: Number(r.print_count ?? 0) + 1, last_printed_at: now }).eq("id", String(r.id))));
    const me = await whoAmI(request, admin);
    await writeAuditMany(admin, ((data ?? []) as Row[]).map((r) => ({ action: "print", entityType: "order_instructions", entityId: String(r.id), actorId: me.id, actorName: me.name, metadata: { code: r.order_no, what: "ใบสลักชื่อ" } })));
    return NextResponse.json({ ok: true, count: data?.length ?? 0 });
  }

  if (body.action === "seed_trial") {
    const denied = await guardApi(request, "order_ops.edit");
    if (denied) return denied;
    const me = await whoAmI(request, admin);
    const by = { created_by: me.id, created_by_name: me.name, is_trial: true };
    const { count } = await admin.from("order_instructions").select("id", { count: "exact", head: true }).eq("is_trial", true).is("deleted_at", null);
    if ((count ?? 0) > 0) return bad("มีข้อมูลทดลองอยู่แล้ว — ล้างก่อนถ้าอยากใส่ชุดใหม่");
    const ins = [
      { order_no: "DEMO-0001", platform: "Shopee", customer_name: "ลูกค้าตัวอย่าง 1", sku: "TTM061-04", commands: ["ห่อ", "การ์ดธรรมดา"], engrave: true, engrave_text: "Pitchayapa", engrave_type: "ฟอยทอง", engrave_position: "มุมขวา" },
      { order_no: "DEMO-0002", platform: "TikTok", customer_name: "ลูกค้าตัวอย่าง 2", sku: "BELTA001-01", commands: [], engrave: true, engrave_text: "❤️DUKE❤️", engrave_type: "พิมพ์จม", engrave_position: "ตรงกลาง" },
      { order_no: "DEMO-0003", platform: "Lazada", customer_name: "ลูกค้าตัวอย่าง 3", sku: "WL56-08", commands: ["แก้ไซส์เข็มขัด"], note: "ลูกค้าขอสั้นลง 2 รู", status: "done", done_at: new Date().toISOString(), done_by_name: me.name },
    ].map((r) => ({ ...by, ...r }));
    const wl = [
      { platform: "Shopee", customer_name: "ลูกค้าตัวอย่าง 4", sku: "PIX13", note: "สีดำ" },
      { platform: "Shopee", customer_name: "ลูกค้าตัวอย่าง 5", sku: "TTM130-02", note: "สีกรมท่า", informed: true, informed_at: new Date().toISOString() },
    ].map((r) => ({ ...by, ...r }));
    const cs = [
      { kind: "repair", order_no: "DEMO-R001", sku: "LJNC04-06", topic: "ขาด/ชำรุด", detail: "สายขาดตรงรูที่ 3", status: "waiting_customer", shipping_charge: 95 },
      { kind: "repair", order_no: "DEMO-R002", sku: "ZT5", topic: "ซิป / อะไหล่", detail: "ส่งหางซิปผิด", status: "repairing", resolution: "ซ่อม" },
      { kind: "repair", order_no: "DEMO-R003", sku: "TTM089-08", topic: "เปลี่ยนไซส์", status: "ready_to_ship", resolution: "เปลี่ยนไซส์", replacement_sku: "TTM089-09" },
      { kind: "return", order_no: "DEMO-C001", sku: "BELTA001-01", status: "received" },
      { kind: "return", order_no: "DEMO-C002", sku: "TTM130-01D", status: "checked", checked_at: new Date().toISOString() },
    ].map((r) => ({ ...by, ...r }));
    const [a, b, c] = await Promise.all([
      admin.from("order_instructions").insert(ins).select("id"),
      admin.from("order_waitlist").insert(wl).select("id"),
      admin.from("after_sales_cases").insert(cs).select("id"),
    ]);
    if (a.error || b.error || c.error) return bad("ใส่ข้อมูลตัวอย่างไม่สำเร็จ", 500);
    await writeAudit(admin, { action: "seed_trial", entityType: "order_instructions", actorId: me.id, actorName: me.name, metadata: { what: "ใส่ข้อมูลทดลอง", count: (a.data?.length ?? 0) + (b.data?.length ?? 0) + (c.data?.length ?? 0) } });
    return NextResponse.json({ ok: true });
  }

  const t = String(body.t ?? "");
  if (t === "options") {
    const denied = await guardApi(request, "order_ops.manage");
    if (denied) return denied;
    const kind = String(body.kind ?? "");
    const label = String(body.label ?? "").trim().slice(0, 80);
    if (!OPTION_KINDS.includes(kind) || !label) return bad("กรุณาใส่ชื่อตัวเลือก");
    const { data, error } = await admin.from("order_ops_options").insert({ kind, label, value: typeof body.value === "string" && body.value.trim() ? body.value.trim().slice(0, 80) : null, sort_order: Number(body.sort_order ?? 999) || 999 }).select("*").single();
    if (error) return bad(error.code === "23505" ? "มีตัวเลือกชื่อนี้แล้ว" : "เพิ่มไม่สำเร็จ", 400);
    const me = await whoAmI(request, admin);
    await writeAudit(admin, { action: "create", entityType: "order_ops_options", entityId: String(data.id), actorId: me.id, actorName: me.name, metadata: { name: label, kind } });
    return NextResponse.json({ row: data });
  }
  if (!isTable(t)) return bad("ไม่รู้จักชนิดข้อมูล");
  const denied = await guardApi(request, "order_ops.edit");
  if (denied) return denied;

  const row = pickFields(body, FIELDS[t]);
  if (t === "cases") {
    row.kind = body.kind === "return" ? "return" : "repair";
    if (!row.status) row.status = defaultCaseStatus(row.kind as CaseKind);
  }
  const err = normalize(t, row, null);
  if (err) return bad(err);
  if (t === "instructions" && row.engrave === true) {
    const e2 = engraveTextError(String(row.engrave_text ?? ""), await loadEngraveSpecials(admin));
    if (e2) return bad(e2);
  }
  if (t === "instructions" && row.status === "done") row.done_at = new Date().toISOString();
  const me = await whoAmI(request, admin);
  if (t === "instructions" && row.status === "done") row.done_by_name = me.name;
  if (t === "waitlist" && row.informed) { row.informed_at = new Date().toISOString(); row.informed_by_name = me.name; }
  // เติมข้อมูลจากศูนย์ออเดอร์ถ้ายังไม่ได้ผูก
  if (row.order_no && !row.platform_order_id) {
    const hit = await findPlatformOrder(admin, String(row.order_no));
    if (hit) {
      row.platform_order_id = hit.id;
      if (!row.customer_name) row.customer_name = hit.customer_name;
      if (t !== "cases" && !row.platform) row.platform = hit.platform;
      if (!row.sku && hit.items.length === 1) row.sku = hit.items[0].sku;
    }
  }
  const { data, error } = await admin.from(OPS_TABLES[t]).insert({ ...row, created_by: me.id, created_by_name: me.name }).select("*").single();
  if (error) return bad("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  await writeAudit(admin, { action: "create", entityType: OPS_ENTITY[t], entityId: String(data.id), actorId: me.id, actorName: me.name, metadata: { code: data.order_no ?? null, name: data.customer_name ?? null, trial: data.is_trial === true } });
  return NextResponse.json({ row: data });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Row;
  const admin = supabaseAdmin();
  const t = String(body.t ?? "");

  if (t === "options") {
    const denied = await guardApi(request, "order_ops.manage");
    if (denied) return denied;
    const id = String(body.id ?? "");
    const patch = pickFields((body.patch ?? {}) as Row, ["label", "value", "sort_order", "is_active"]);
    if (!uuidRe.test(id) || !Object.keys(patch).length) return bad("ไม่มีอะไรเปลี่ยน");
    const { data: before } = await admin.from("order_ops_options").select("*").eq("id", id).maybeSingle();
    if (!before) return bad("ไม่พบตัวเลือก", 404);
    const { error } = await admin.from("order_ops_options").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return bad(error.code === "23505" ? "มีตัวเลือกชื่อนี้แล้ว" : "แก้ไม่สำเร็จ");
    const me = await whoAmI(request, admin);
    await writeAudit(admin, { action: "update", entityType: "order_ops_options", entityId: id, actorId: me.id, actorName: me.name, metadata: { name: before.label, ...auditChangeMeta(before as Row, patch) } });
    return NextResponse.json({ ok: true });
  }
  if (!isTable(t)) return bad("ไม่รู้จักชนิดข้อมูล");
  const denied = await guardApi(request, "order_ops.edit");
  if (denied) return denied;
  const table = OPS_TABLES[t];
  const me = await whoAmI(request, admin);
  const now = new Date().toISOString();

  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String).filter((x) => uuidRe.test(x)).slice(0, 500) : body.id ? [String(body.id)] : [];
  if (!ids.length) return bad("ยังไม่ได้เลือกรายการ");
  const isBulk = Array.isArray(body.ids);
  const rawPatch = (body.patch ?? {}) as Row;
  const patch = pickFields(rawPatch, isBulk ? BULK_FIELDS[t] : FIELDS[t]);
  delete patch.kind;

  const { data: befores } = await admin.from(table).select("*").in("id", ids).is("deleted_at", null);
  const rows = (befores ?? []) as Row[];
  if (!rows.length) return bad("ไม่พบรายการ (อาจถูกลบไปแล้ว)", 404);

  const specials = t === "instructions" && ("engrave_text" in patch || "engrave" in patch) ? await loadEngraveSpecials(admin) : [];
  const results: { id: string; ok: boolean; error?: string }[] = [];
  const audits: Parameters<typeof writeAuditMany>[1] = [];
  for (const before of rows) {
    const p: Row = { ...patch };
    // ติ๊กงานซ่อม/คืน → เวลา
    if (t === "cases") for (const [flag, col] of Object.entries(CASE_FLAGS)) if (flag in rawPatch) p[col] = rawPatch[flag] ? (before[col] ?? now) : null;
    if (t === "cases" && "stock_received" in rawPatch) p.stock_received_by_name = rawPatch.stock_received ? me.name : null;
    let err = normalize(t, p, before);
    if (!err && t === "instructions" && ("engrave_text" in p || "engrave" in p)) {
      const on = "engrave" in p ? p.engrave === true : before.engrave === true;
      if (on) err = engraveTextError(String(("engrave_text" in p ? p.engrave_text : before.engrave_text) ?? ""), specials);
    }
    if (err) { results.push({ id: String(before.id), ok: false, error: err }); continue; }
    if (t === "instructions" && "status" in p && p.status !== before.status) { p.done_at = p.status === "done" ? now : null; p.done_by_name = p.status === "done" ? me.name : null; }
    if (t === "waitlist" && "informed" in p && p.informed !== before.informed) { p.informed_at = p.informed ? now : null; p.informed_by_name = p.informed ? me.name : null; }
    if (t === "cases" && "status" in p && p.status !== before.status) {
      if (p.status === "shipped_back") p.shipped_back_at = now;
      if (p.status === "checked" && !before.checked_at) p.checked_at = now;
    }
    if (!Object.keys(p).length) { results.push({ id: String(before.id), ok: true }); continue; }
    const { error } = await admin.from(table).update({ ...p, updated_at: now }).eq("id", String(before.id));
    if (error) { results.push({ id: String(before.id), ok: false, error: "บันทึกไม่สำเร็จ" }); continue; }
    results.push({ id: String(before.id), ok: true });
    audits.push({ action: "update", entityType: OPS_ENTITY[t], entityId: String(before.id), actorId: me.id, actorName: me.name, metadata: { code: before.order_no ?? null, name: before.customer_name ?? null, ...auditChangeMeta(before, p) } });
  }
  if (audits.length) await writeAuditMany(admin, audits);
  const failed = results.filter((r) => !r.ok);
  if (!isBulk && failed.length) return bad(failed[0].error ?? "บันทึกไม่สำเร็จ");
  return NextResponse.json({ ok: failed.length === 0, results, updated: results.length - failed.length });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Row;
  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  if (body.action === "clear_trial" || body.action === "undo_clear_trial") {
    const denied = await guardApi(request, "order_ops.manage");
    if (denied) return denied;
    const me = await whoAmI(request, admin);
    let total = 0;
    for (const table of Object.values(OPS_TABLES)) {
      const q = body.action === "clear_trial"
        ? admin.from(table).update({ deleted_at: now }).eq("is_trial", true).is("deleted_at", null).select("id")
        : admin.from(table).update({ deleted_at: null }).eq("is_trial", true).eq("deleted_at", String(body.at ?? "")).select("id");
      const { data } = await q;
      total += data?.length ?? 0;
    }
    await writeAudit(admin, { action: body.action === "clear_trial" ? "clear_trial" : "undo_clear_trial", entityType: "order_instructions", actorId: me.id, actorName: me.name, metadata: { what: body.action === "clear_trial" ? "ล้างข้อมูลทดลอง (ย้ายลงถังขยะ)" : "ย้อนการล้างข้อมูลทดลอง", count: total } });
    return NextResponse.json({ ok: true, count: total, at: now });
  }

  const t = String(body.t ?? "");
  if (t === "options") return bad("ตัวเลือกใช้ปิด (ซ่อน) แทนการลบ เพื่อไม่ให้รายการเก่าที่ใช้อยู่พัง");
  if (!isTable(t)) return bad("ไม่รู้จักชนิดข้อมูล");
  const hard = body.hard === true;
  const restore = body.restore === true;
  const denied = await guardApi(request, hard ? "order_ops.manage" : "order_ops.delete");
  if (denied) return denied;
  const table = OPS_TABLES[t];
  const ids = (Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : []).map(String).filter((x) => uuidRe.test(x)).slice(0, 500);
  if (!ids.length) return bad("ยังไม่ได้เลือกรายการ");
  const me = await whoAmI(request, admin);

  let q;
  if (hard) q = admin.from(table).delete().in("id", ids).not("deleted_at", "is", null).select("id, order_no");
  else if (restore) q = admin.from(table).update({ deleted_at: null, updated_at: now }).in("id", ids).not("deleted_at", "is", null).select("id, order_no");
  else q = admin.from(table).update({ deleted_at: now, updated_at: now }).in("id", ids).is("deleted_at", null).select("id, order_no");
  const { data, error } = await q;
  if (error) return bad("ทำรายการไม่สำเร็จ", 500);
  const action = hard ? "hard_delete" : restore ? "restore" : "delete";
  await writeAuditMany(admin, ((data ?? []) as Row[]).map((r) => ({ action, entityType: OPS_ENTITY[t], entityId: String(r.id), actorId: me.id, actorName: me.name, metadata: { code: r.order_no ?? null, soft: !hard } })));
  return NextResponse.json({ ok: true, count: data?.length ?? 0 });
}
