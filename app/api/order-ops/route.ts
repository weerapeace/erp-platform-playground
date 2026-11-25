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
  cleanCommandDetails,
  cleanOrderNo,
  defaultCaseStatus,
  engraveTextError,
  ENGRAVE_POSITIONS,
  ENGRAVE_TYPES,
  isValidCaseStatus,
  parseMoney,
  type CaseKind,
} from "@/lib/order-ops";
import { printSummaryOf } from "@/lib/print-log-server";
import { loadSkuStock } from "@/lib/sku-stock";
import { bestGuess, shopCodeGuesses } from "@/lib/packing";
import { findPlatformOrder, listPickerOrders, loadEngraveSpecials, OPS_ENTITY, OPS_TABLES, pickFields, str, whoAmI, type OpsTableKey } from "@/lib/order-ops-server";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const FIELDS: Record<OpsTableKey, readonly string[]> = {
  instructions: ["order_no", "platform", "customer_name", "sku", "commands", "command_details", "engrave", "engrave_text", "engrave_type", "engrave_position", "engrave_font", "note", "status", "platform_order_id", "is_trial", "via_chat", "chat_note"],
  waitlist: ["order_no", "platform", "customer_name", "sku", "note", "informed", "platform_order_id", "is_trial", "expected_at"],
  cases: ["kind", "order_no", "platform", "customer_name", "sku", "qty", "topic", "detail", "resolution", "status", "replacement_sku", "shipping_charge", "shipping_refund", "bank_info", "shipping_address", "return_date", "images", "note", "platform_order_id", "is_trial",
    "return_type", "return_reason", "refund_amount", "refund_bank", "refund_account", "refund_account_name"],
};
/** ช่องที่แก้หลายรายการพร้อมกันได้ */
const BULK_FIELDS: Record<OpsTableKey, readonly string[]> = {
  instructions: ["status"],
  waitlist: ["informed"],
  cases: ["status"],
};
/** ติ๊กของงานซ่อม/คืน → ช่องเวลา */
const CASE_FLAGS = { checked: "checked_at", stock_received: "stock_received_at", zort_cancelled: "zort_cancelled_at", packed: "packed_at" } as const;

const OPTION_KINDS = ["instruction_command", "repair_topic", "engrave_special", "engrave_font", "engrave_sku_type", "engrave_sku_pos", "command_choice", "command_phrase", "special_wrap", "card_phrase", "repair_resolution", "return_type", "return_reason", "wait_phrase"];
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
    if ("command_details" in row) row.command_details = cleanCommandDetails(row.command_details, (row.commands ?? before?.commands ?? []) as string[]);
    if ("via_chat" in row) row.via_chat = row.via_chat === true;
    if ("chat_note" in row) row.chat_note = typeof row.chat_note === "string" && row.chat_note.trim() ? row.chat_note.trim().slice(0, 300) : null;
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
    for (const k of ["shipping_charge", "shipping_refund", "refund_amount"]) if (k in row) row[k] = parseMoney(row[k]);
    if ("images" in row) row.images = Array.isArray(row.images) ? (row.images as unknown[]).map(String).slice(0, 20) : [];
    if ("return_date" in row && row.return_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(row.return_date))) row.return_date = null;
  }
  if (t === "waitlist") {
    if ("expected_at" in row && row.expected_at && !/^\d{4}-\d{2}-\d{2}$/.test(String(row.expected_at))) row.expected_at = null;
  }
  return null;
}

export async function GET(request: Request) {
  const denied = await guardApi(request, "order_ops.view");
  if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;

  // ข้อมูลประกอบป๊อปคำสั่งพิเศษ (เจ้าของเลือก 2026-11-25 รอบ 2): ห่อพิเศษของออเดอร์ · SKU รุ่นเดียวกัน (เปลี่ยนสินค้า) · คงเหลือวัสดุ
  if (sp.get("t") === "ins_context") return NextResponse.json(await insContext(admin, sp.get("order"), sp.get("sku")));
  // รุ่นสินค้าตามรหัส (หน้าตั้งค่า › ห่อพิเศษ)
  if (sp.get("t") === "parents") {
    const codes = (sp.get("codes") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 50);
    const { data } = codes.length ? await admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key, pack_set_id, pack_note").in("code", codes) : { data: [] };
    return NextResponse.json({ parents: ((data ?? []) as Row[]).map((r) => ({ id: String(r.id), code: str(r.code), name: str(r.name_th), image_key: str(r.cover_image_r2_key), has_set: !!r.pack_set_id, has_note: !!str(r.pack_note) })) });
  }
  if (sp.get("t") === "stock") {
    const ids = (sp.get("ids") ?? "").split(",").filter((x) => uuidRe.test(x)).slice(0, 100);
    const m = ids.length ? await loadSkuStock(admin, ids) : new Map();
    return NextResponse.json({ stock: Object.fromEntries([...m.entries()].map(([k, v]) => [k, v.onHand])) });
  }

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
    const [{ data, error }, { data: plats }] = await Promise.all([
      admin.from("order_ops_options").select("*").order("kind").order("sort_order").order("label"),
      admin.from("erp_platforms").select("code, name_th").eq("is_active", true).order("sort_order"),
    ]);
    if (error) return bad("โหลดตัวเลือกไม่สำเร็จ", 500);
    // ช่องทางขาย (ร้านในระบบ) — ฟอร์มที่ไม่มีออเดอร์เลือกจากรายการนี้แทนพิมพ์เอง
    return NextResponse.json({ options: data ?? [], platforms: ((plats ?? []) as { code: string; name_th: string | null }[]).map((p) => p.name_th || p.code) });
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
  // กรองสถานะพิมพ์ (ข้อ 3) ต้องรู้สถานะทุกใบก่อน → ดึงสูงสุด 1000 แล้วแบ่งหน้าเอง
  const printFilter = t === "instructions" ? sp.get("print") : null;
  q = q.order(trash ? "deleted_at" : "created_at", { ascending: false });
  q = printFilter === "printed" || printFilter === "unprinted" ? q.limit(1000) : q.range((page - 1) * size, page * size - 1);
  const res0 = await q;
  if (res0.error) return bad("โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  let data = (res0.data ?? []) as Row[];
  let count = res0.count ?? 0;
  if (t === "instructions" && data.length) {
    data = await withPrintState(admin, data);
    if (printFilter === "printed" || printFilter === "unprinted") {
      const want = printFilter === "printed" ? "done" : "todo";
      const all = data.filter((r) => (r.print_state as { state: string }).state === want);
      count = all.length;
      data = all.slice((page - 1) * size, page * size);
    }
  }

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

/**
 * สถานะพิมพ์ของคำสั่ง (ข้อ 3 · จากประวัติพิมพ์กลาง print_logs — ไม่มีตารางใหม่)
 *   ใบสลัก = print_logs doc_type engrave_sheet (doc_id = id คำสั่ง) · การ์ด = order_gift_cards ของออเดอร์ (printed_at / เขียนมือ)
 *   state: none = ไม่มีอะไรต้องพิมพ์ · todo = ยังพิมพ์ไม่ครบ · done = พิมพ์ครบ
 */
async function withPrintState(admin: ReturnType<typeof supabaseAdmin>, rows: Row[]): Promise<Row[]> {
  const ids = rows.map((r) => String(r.id));
  const poIds = [...new Set(rows.map((r) => str(r.platform_order_id)).filter((x): x is string => !!x))];
  const [eng, cardsRes] = await Promise.all([
    printSummaryOf(admin, "engrave_sheet", ids),
    poIds.length ? admin.from("order_gift_cards").select("id, platform_order_id, printed_at, printed_by_name, print_count, hand_written_at").in("platform_order_id", poIds.slice(0, 500)).is("deleted_at", null) : Promise.resolve({ data: [] }),
  ]);
  const cardsBy = new Map<string, Row[]>();
  for (const c of (cardsRes.data ?? []) as Row[]) { const k = String(c.platform_order_id); cardsBy.set(k, [...(cardsBy.get(k) ?? []), c]); }
  return rows.map((r) => {
    const needEngrave = r.engrave === true && !!str(r.engrave_text);
    const e = eng.get(String(r.id)) ?? null;
    const cards = r.platform_order_id ? cardsBy.get(String(r.platform_order_id)) ?? [] : [];
    const done = cards.filter((c) => c.printed_at || c.hand_written_at);
    const lastCard = [...done].sort((a, b) => String(b.printed_at ?? b.hand_written_at).localeCompare(String(a.printed_at ?? a.hand_written_at)))[0];
    const card = cards.length ? { total: cards.length, printed: done.length, last: str(lastCard?.printed_at) ?? str(lastCard?.hand_written_at), by: str(lastCard?.printed_by_name) } : null;
    const needs = (needEngrave ? 1 : 0) + (cards.length ? 1 : 0);
    const ok = (needEngrave && e ? 1 : 0) + (card && card.printed === card.total ? 1 : 0);
    return { ...r, print_state: { state: needs === 0 ? "none" : ok >= needs ? "done" : "todo", engrave: needEngrave ? (e ? { n: e.n, last: e.last } : { n: 0, last: null }) : null, card } };
  });
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
    const patch = pickFields((body.patch ?? {}) as Row, ["label", "value", "sort_order", "is_active", "extra"]);
    if ("extra" in patch) patch.extra = cleanOptionExtra(patch.extra);
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

/** extra ของตัวเลือก: sku_id/sku_code (วัสดุห่อ) · template_group (การ์ด) — อย่างอื่นตัดทิ้ง */
function cleanOptionExtra(v: unknown): Row {
  const r = (v && typeof v === "object" ? v : {}) as Row;
  const out: Row = {};
  if (typeof r.sku_id === "string" && uuidRe.test(r.sku_id)) { out.sku_id = r.sku_id; out.sku_code = str(r.sku_code)?.slice(0, 60) ?? null; }
  if (typeof r.template_group === "string" && r.template_group.trim()) out.template_group = r.template_group.trim().slice(0, 60);
  return out;
}

/**
 * ป๊อปคำสั่งพิเศษ: ห่อพิเศษ (สินค้ารหัสขึ้นต้นตามที่ตั้งไว้ เช่น GIFT01 → รุ่น + Set บรรจุภัณฑ์กลาง + วิธีห่อ + คงเหลือวัสดุ)
 *   + SKU ในรุ่นเดียวกับ sku (เปลี่ยนสินค้า) — รหัสร้านที่มีของต่อท้ายหารุ่นด้วยตัวเดาเดียวกับหน้าแพ็ก (lib/packing bestGuess)
 */
async function insContext(admin: ReturnType<typeof supabaseAdmin>, orderId: string | null, sku: string | null) {
  const out: { special: Row[]; siblings: Row[]; from: Row | null } = { special: [], siblings: [], from: null };
  // ── ห่อพิเศษ ──
  if (orderId && uuidRe.test(orderId)) {
    const [{ data: items }, { data: codes }] = await Promise.all([
      admin.from("platform_order_items").select("sku_code, qty, matched_sku_id, matched_parent_sku_id").eq("order_id", orderId),
      admin.from("order_ops_options").select("label").eq("kind", "special_wrap").eq("is_active", true),
    ]);
    const keys = ((codes ?? []) as Row[]).map((c) => String(c.label).trim().toUpperCase()).filter(Boolean);
    const hits = ((items ?? []) as Row[]).filter((i) => { const c = String(i.sku_code ?? "").toUpperCase(); return keys.some((k) => c.startsWith(k)); });
    if (hits.length) {
      const keyCodes = [...new Set(hits.map((i) => keys.find((k) => String(i.sku_code ?? "").toUpperCase().startsWith(k))!))];
      const { data: parents } = await admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key, pack_set_id, pack_extra, pack_note, pack_flags").in("code", keyCodes);
      const setIds = [...new Set(((parents ?? []) as Row[]).map((p) => str(p.pack_set_id)).filter((x): x is string => !!x))];
      const { data: sets } = setIds.length ? await admin.from("packaging_sets").select("id, name, items").in("id", setIds) : { data: [] };
      const setMap = new Map(((sets ?? []) as Row[]).map((x) => [String(x.id), x]));
      const skuIds = new Set<string>();
      for (const p of (parents ?? []) as Row[]) {
        for (const it of ((setMap.get(String(p.pack_set_id))?.items ?? []) as Row[])) skuIds.add(String(it.sku_id));
        for (const it of ((p.pack_extra ?? []) as Row[])) skuIds.add(String(it.sku_id));
      }
      const ids = [...skuIds].filter((x) => uuidRe.test(x));
      const [{ data: skuRows }, stock] = await Promise.all([
        ids.length ? admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key").in("id", ids) : Promise.resolve({ data: [] }),
        ids.length ? loadSkuStock(admin, ids) : Promise.resolve(new Map()),
      ]);
      const info = new Map(((skuRows ?? []) as Row[]).map((r) => [String(r.id), r]));
      const mat = (list: Row[]) => list.map((it) => { const r = info.get(String(it.sku_id)); return { sku_id: String(it.sku_id), code: str(r?.code), name: str(r?.name_th), image_key: str(r?.cover_image_r2_key), qty: Number(it.qty) || 1, on_hand: stock.get(String(it.sku_id))?.onHand ?? null }; });
      out.special = ((parents ?? []) as Row[]).map((p) => {
        const set = setMap.get(String(p.pack_set_id));
        return {
          parent_id: String(p.id), code: str(p.code), name: str(p.name_th), image_key: str(p.cover_image_r2_key),
          items: hits.filter((i) => String(i.sku_code ?? "").toUpperCase().startsWith(String(p.code).toUpperCase())).map((i) => ({ sku_code: str(i.sku_code), qty: Number(i.qty) || 1 })),
          set_name: str(set?.name), materials: [...mat(((set?.items ?? []) as Row[])), ...mat(((p.pack_extra ?? []) as Row[]))],
          how_to: str(p.pack_note), flags: Array.isArray(p.pack_flags) ? p.pack_flags : [],
        };
      });
    }
  }
  // ── SKU รุ่นเดียวกัน (เปลี่ยนสินค้า) ──
  const code = (sku ?? "").trim();
  if (code) {

    const guesses = shopCodeGuesses(code).slice(0, 30);
    const { data: gs } = guesses.length ? await admin.from("skus_v2").select("id, code, parent_sku_id").in("code", guesses) : { data: [] };
    const byCode = new Map(((gs ?? []) as Row[]).map((r) => [String(r.code).toUpperCase(), r]));
    const hit = bestGuess(code, (c) => byCode.has(c));
    let parentId = hit ? str(byCode.get(hit)?.parent_sku_id) : null;
    if (!parentId) {
      const { data: gp } = guesses.length ? await admin.from("parent_skus_v2").select("id, code").in("code", guesses) : { data: [] };
      const pm = new Map(((gp ?? []) as Row[]).map((r) => [String(r.code).toUpperCase(), String(r.id)]));
      const ph = bestGuess(code, (c) => pm.has(c));
      parentId = ph ? pm.get(ph) ?? null : null;
    }
    if (parentId) {
      const { data: sibs } = await admin.from("skus_v2").select("id, code, name_th, color_th, color, cover_image_r2_key").eq("parent_sku_id", parentId).eq("is_active", true).order("code").limit(40);
      const list = (sibs ?? []) as Row[];
      const stock = list.length ? await loadSkuStock(admin, list.map((r) => String(r.id))) : new Map();
      out.siblings = list.map((r) => ({ id: String(r.id), code: str(r.code), name: str(r.name_th), color: str(r.color_th) ?? str(r.color), image_key: str(r.cover_image_r2_key), on_hand: stock.get(String(r.id))?.onHand ?? null }));
      out.from = hit ? { code: hit } : null;
    }
  }
  return out;
}
