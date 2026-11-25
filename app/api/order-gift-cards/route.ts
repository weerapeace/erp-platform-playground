/**
 * 💌 API การ์ดของขวัญจากหมายเหตุออเดอร์ — หน้า /order-ops/gift-cards · กติกา lib/gift-card-design · คู่มือ docs/order-gift-cards.md
 *
 * GET  ?view=notes&tab=card|engrave|engrave_missing|other|all&q=&days=   ออเดอร์ที่ลูกค้าเขียนหมายเหตุ + ออเดอร์สินค้าสลักชื่อ (ทุกร้านในศูนย์ออเดอร์) + การ์ด + คำสั่งสลัก
 *      ?view=cards&q=&status=                           การ์ดทั้งหมด (รวมการ์ดไม่ผูกออเดอร์)
 *      ?view=templates                                  แม่แบบ (ในตัว + ที่ออกแบบเอง) · ?view=fonts ฟอนต์ที่อัปโหลด
 *      ?id=<การ์ด> · ?order=<platform_order_id>          ข้อมูลหน้าเขียนการ์ด · ?template=<id> แม่แบบ 1 ใบ · ?ids=a,b การ์ดหลายใบ (หน้าพิมพ์)
 * POST {action:"save_card"} สร้าง/แก้การ์ด · "printed"/"unprint" ติ๊กพิมพ์แล้ว · "written" ติ๊กเขียนมือแล้ว · "revert" ย้อนการบันทึกครั้งก่อน
 *      "kind" แก้การคัดแยก · "engrave_mode" ตั้งสินค้าสลักชื่อของรุ่น (order_ops.manage) · "template_save" / "template_copy" แม่แบบ · "ai" ให้ AI เสนอข้อความ 3 แบบ
 * DELETE {kind:"card"|"template"|"font", ids, restore?} ย้ายลงถังขยะ / กู้คืน (ลบแบบเก็บไว้ก่อน)
 *
 * สิทธิ์: order_ops.view ดู · order_ops.edit เขียน/พิมพ์ · order_ops.delete ลบการ์ด · order_ops.manage แม่แบบ+ฟอนต์
 * ไม่แตะ platform_orders (อ่านอย่างเดียว) · ทุกการเขียนลง audit_logs (changes)
 */
import { NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { auditChangeMeta, writeAudit, writeAuditMany } from "@/lib/audit";
import { aiChat, featureAccess } from "@/lib/paid-services-server";
import { brandProfileBlock } from "@/lib/marketing/brand-profile-server";
import { whoAmI } from "@/lib/order-ops-server";
import { engraveOfOrder, engraveSkuMaps, ENGRAVE_MODE_LABEL, ENGRAVE_NO_WARN_STATUSES, isEngraveMode, specialWrapCodes, type EngraveMode } from "@/lib/order-ops";
import { chatAdapter } from "@/lib/chat/registry";
import { printSummaryOf } from "@/lib/print-log-server";
import { CHAT_CHANNELS, type ChatChannel } from "@/lib/chat/types";
import {
  builtinTemplates, buyerNoteOf, classifyNote, cleanDoc, fillTexts, isBuiltinId, roleTexts, suggestMessage, type CardDoc,
} from "@/lib/gift-card-design";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = Record<string, unknown>;
const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const cleanQ = (q: string) => q.replace(/[%,()*"\\]/g, " ").trim().slice(0, 80);
const INS_COLS = "id, platform_order_id, order_no, platform, customer_name, sku, commands, command_details, engrave, engrave_text, engrave_type, engrave_position, note, status, done_at, via_chat, chat_note, created_at";
const CARD_COLS = "id, platform_order_id, order_no, platform, brand_id, customer_note, template_id, message, note, print_count, printed_at, printed_by_name, hand_written_at, hand_written_by_name, created_by_name, updated_by_name, created_at, updated_at, deleted_at";
const ORDER_COLS = "id, order_no, external_order_id, customer_name, status, platform_status, ordered_at, ship_by_at, platform_id, brand_id, source, packed_at, shopee_note:raw->shopee->>message_to_seller, tt_note:raw->tiktok->>buyer_message, lz_note:raw->lazada->>remarks, lz_gift:raw->lazada->>gift_message, m_note:raw->>note";

function noteOfRow(o: Row): string | null {
  return buyerNoteOf({ shopee: { message_to_seller: o.shopee_note }, tiktok: { buyer_message: o.tt_note }, lazada: { gift_message: o.lz_gift, remarks: o.lz_note }, note: o.m_note });
}

async function lookups(admin: ReturnType<typeof supabaseAdmin>, platformIds: string[], brandIds: string[]) {
  const [{ data: plats }, { data: brands }] = await Promise.all([
    platformIds.length ? admin.from("erp_platforms").select("id, code, name_th").in("id", platformIds) : Promise.resolve({ data: [] }),
    brandIds.length ? admin.from("brands").select("id, name").in("id", brandIds) : Promise.resolve({ data: [] }),
  ]);
  return {
    plat: new Map(((plats ?? []) as Row[]).map((p) => [String(p.id), { code: str(p.code), name: str(p.name_th) ?? str(p.code) }])),
    brand: new Map(((brands ?? []) as Row[]).map((b) => [String(b.id), str(b.name)])),
  };
}

function orderInfo(o: Row, lk: Awaited<ReturnType<typeof lookups>>) {
  const p = o.platform_id ? lk.plat.get(String(o.platform_id)) : null;
  return {
    id: String(o.id),
    order_no: str(o.order_no) ?? str(o.external_order_id),
    customer_name: str(o.customer_name),
    status: str(o.status),
    ordered_at: str(o.ordered_at),
    ship_by_at: str(o.ship_by_at),
    packed_at: str(o.packed_at),
    platform: p?.name ?? (o.source === "manual" ? "สร้างเอง" : o.source === "webshop" ? "เว็บไซต์" : null),
    platform_code: p?.code ?? str(o.source),
    brand_id: str(o.brand_id),
    brand_name: o.brand_id ? lk.brand.get(String(o.brand_id)) ?? null : null,
    note: noteOfRow(o),
  };
}

async function loadTemplates(admin: ReturnType<typeof supabaseAdmin>, withTrash = false) {
  let q = admin.from("gift_card_templates").select("id, name, brand_id, doc, is_default, sort_order, group_name, replaces_builtin, updated_at, updated_by_name, deleted_at").order("sort_order").order("created_at");
  q = withTrash ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  const { data } = await q;
  return ((data ?? []) as Row[]).map((t) => ({ id: String(t.id), name: String(t.name), brand_id: str(t.brand_id), doc: cleanDoc(t.doc), is_default: t.is_default === true, builtin: false, group: str(t.group_name), sort_order: Number(t.sort_order) || 0, replaces_builtin: str(t.replaces_builtin), updated_at: str(t.updated_at), updated_by_name: str(t.updated_by_name), deleted_at: str(t.deleted_at) }));
}
/** แม่แบบทั้งหมดที่ใช้ได้ (ของที่ออกแบบเอง + ในตัวที่ยังไม่ถูกแก้) — ในตัวที่มีฉบับแก้แล้วถูกซ่อน (ข้อ 1) */
async function allTemplates(admin: ReturnType<typeof supabaseAdmin>) {
  const own = await loadTemplates(admin);
  const replaced = new Set(own.map((t) => t.replaces_builtin).filter(Boolean));
  const builtins = builtinTemplates().filter((b) => !replaced.has(b.id)).map((b, i) => ({ ...b, brand_id: null, is_default: false, builtin: true, sort_order: 100000 + i, replaces_builtin: null, updated_at: null, updated_by_name: null, deleted_at: null }));
  return [...own, ...builtins];
}

/** แม่แบบที่จะใช้กับออเดอร์ — แบรนด์ตรง+ตั้งเป็นหลัก → แบรนด์ตรง → หลักทั่วไป → ในตัว "วันเกิด"/"เรียบ" */
function pickTemplate(list: { id: string; brand_id: string | null; is_default: boolean; doc: CardDoc; name: string }[], brandId: string | null, note: string | null) {
  const own = list.filter((t) => brandId && t.brand_id === brandId);
  const t = own.find((x) => x.is_default) ?? own[0] ?? list.find((x) => x.is_default && !x.brand_id) ?? null;
  if (t) return t;
  const b = builtinTemplates();
  return /วันเกิด|birthday|hbd/i.test(note ?? "") ? b.find((x) => x.id.endsWith("bday"))! : b[0];
}

// ───────────────────────── GET ─────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  const denied = await guardApi(request, "order_ops.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;
  const view = sp.get("view");

  if (view === "templates") {
    const trash = sp.get("trash") === "1";
    return NextResponse.json({ templates: trash ? await loadTemplates(admin, true) : await allTemplates(admin) });
  }
  if (view === "fonts") {
    const { data } = await admin.from("gift_card_fonts").select("id, name, format, size_bytes, created_by_name, created_at").is("deleted_at", null).order("created_at");
    return NextResponse.json({ fonts: data ?? [] });
  }
  const tplId = sp.get("template");
  if (tplId) {
    if (isBuiltinId(tplId)) { const b = builtinTemplates().find((x) => x.id === tplId); return b ? NextResponse.json({ template: { ...b, brand_id: null, is_default: false, builtin: true } }) : bad("ไม่พบแม่แบบ", 404); }
    if (!uuidRe.test(tplId)) return bad("ไม่พบแม่แบบ", 404);
    const { data } = await admin.from("gift_card_templates").select("id, name, brand_id, doc, is_default, group_name, replaces_builtin, deleted_at").eq("id", tplId).maybeSingle();
    if (!data) return bad("ไม่พบแม่แบบ", 404);
    return NextResponse.json({ template: { ...(data as Row), group: str((data as Row).group_name), doc: cleanDoc((data as Row).doc), builtin: false } });
  }

  // การ์ดหลายใบ (หน้าพิมพ์)
  const idsParam = sp.get("ids");
  if (idsParam) {
    const ids = idsParam.split(",").filter((x) => uuidRe.test(x)).slice(0, 200);
    if (!ids.length) return NextResponse.json({ cards: [] });
    const { data } = await admin.from("order_gift_cards").select(`${CARD_COLS}, doc`).in("id", ids).is("deleted_at", null);
    const byId = new Map(((data ?? []) as Row[]).map((c) => [String(c.id), { ...c, doc: cleanDoc(c.doc) }]));
    return NextResponse.json({ cards: ids.map((i) => byId.get(i)).filter(Boolean) });
  }

  // หน้าเขียนการ์ด: การ์ด 1 ใบ หรือ ออเดอร์ที่ยังไม่มีการ์ด
  const id = sp.get("id"), orderId = sp.get("order");
  if (id || orderId) {
    let card: Row | null = null;
    if (id) {
      if (!uuidRe.test(id)) return bad("ไม่พบการ์ด", 404);
      const { data } = await admin.from("order_gift_cards").select(`${CARD_COLS}, doc, prev_doc`).eq("id", id).maybeSingle();
      if (!data) return bad("ไม่พบการ์ด", 404);
      card = { ...(data as Row), doc: cleanDoc((data as Row).doc), has_prev: !!(data as Row).prev_doc };
      delete card.prev_doc;
    }
    const poId = (card?.platform_order_id as string | null) ?? (orderId && uuidRe.test(orderId) ? orderId : null);
    let order: ReturnType<typeof orderInfo> | null = null;
    let siblings: Row[] = [];
    if (poId) {
      const { data: o } = await admin.from("platform_orders").select(ORDER_COLS).eq("id", poId).maybeSingle();
      if (o) {
        const lk = await lookups(admin, o.platform_id ? [String(o.platform_id)] : [], o.brand_id ? [String(o.brand_id)] : []);
        order = orderInfo(o as Row, lk);
      }
      const { data: sib } = await admin.from("order_gift_cards").select("id, message, printed_at, hand_written_at").eq("platform_order_id", poId).is("deleted_at", null).order("created_at");
      siblings = (sib ?? []) as Row[];
    } else if (orderId) return bad("ไม่พบออเดอร์", 404);
    const templates = await allTemplates(admin);
    const note = (card?.customer_note as string | null) ?? order?.note ?? null;
    const tpl = pickTemplate(templates, (card?.brand_id as string | null) ?? order?.brand_id ?? null, note);
    // ยังไม่มีการ์ด = ร่างจากแม่แบบ + ข้อความที่เดาจากหมายเหตุ (ยังไม่บันทึกจนกด "บันทึก")
    const draft = card ? null : { template_id: tpl.id, doc: fillTexts(tpl.doc, { message: suggestMessage(note) }) };
    let history: Row[] = [];
    if (card) {
      const { data: h } = await admin.from("audit_logs").select("id, action, metadata, created_at").eq("entity_type", "order_gift_cards").eq("entity_id", String(card.id)).order("created_at", { ascending: false }).limit(30);
      history = (h ?? []) as Row[];
    }
    return NextResponse.json({ card, order, note, draft, siblings, templates, history, kind: note ? classifyNote(note) : null });
  }

  // รายการการ์ดทั้งหมด
  if (view === "cards") {
    const trash = sp.get("trash") === "1";
    let q = admin.from("order_gift_cards").select(CARD_COLS).order("updated_at", { ascending: false }).limit(300);
    q = trash ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    const status = sp.get("status");
    if (status === "todo") q = q.is("printed_at", null).is("hand_written_at", null);
    if (status === "done") q = q.or("printed_at.not.is.null,hand_written_at.not.is.null");
    const qq = cleanQ(sp.get("q") ?? "");
    if (qq) q = q.or(`order_no.ilike.%${qq}%,message.ilike.%${qq}%,customer_note.ilike.%${qq}%`);
    const { data, error } = await q;
    if (error) return bad("โหลดรายการการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
    const rows = (data ?? []) as Row[];
    const lk = await lookups(admin, [], [...new Set(rows.map((r) => str(r.brand_id)).filter((x): x is string => !!x))]);
    return NextResponse.json({ cards: rows.map((r) => ({ ...r, brand_name: r.brand_id ? lk.brand.get(String(r.brand_id)) ?? null : null })) });
  }

  // ── รายการออเดอร์ที่มีหมายเหตุ + ออเดอร์ที่มีสินค้าสลักชื่อ (ค่าเริ่ม) ──
  const res = await notesView(admin, sp);
  return res instanceof NextResponse ? res : NextResponse.json(res);
}

const chunkOf = <T,>(arr: T[], n = 200): T[][] => { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/**
 * ออเดอร์ที่ลูกค้าเขียนหมายเหตุ + ออเดอร์ที่มีสินค้าสลักชื่อ (แม้ไม่มีหมายเหตุ)
 * สินค้าสลักชื่อรู้ได้จาก รหัสท้าย SKU · รุ่นที่ตั้ง "สินค้าสลักชื่อ" (parent_skus_v2.engrave_mode) · หมายเหตุ — กติกากลาง lib/order-ops engraveOfOrder
 */
async function notesView(admin: ReturnType<typeof supabaseAdmin>, sp: URLSearchParams) {
  const days = Math.min(365, Math.max(7, Number(sp.get("days")) || 90));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [notesRes, modeRes, optRes] = await Promise.all([
    admin.from("platform_orders").select(ORDER_COLS)
      .or("raw->shopee->>message_to_seller.not.is.null,raw->tiktok->>buyer_message.not.is.null,raw->lazada->>remarks.not.is.null,raw->lazada->>gift_message.not.is.null,raw->>note.not.is.null")
      .or("source.is.null,source.neq.email")
      .gte("ordered_at", since)
      .order("ordered_at", { ascending: false })
      .limit(1500),
    admin.from("parent_skus_v2").select("id, engrave_mode").in("engrave_mode", ["optional", "required"]),
    admin.from("order_ops_options").select("kind, label, value, is_active").in("kind", ["engrave_sku_type", "engrave_sku_pos", "special_wrap"]),
  ]);
  // ห่อพิเศษ (สินค้ารหัสขึ้นต้น เช่น GIFT01 · ตั้งได้ที่ ตั้งค่า › ห่อพิเศษ) — ออเดอร์ที่ซื้อเข้ารายการแม้ไม่มีหมายเหตุ
  const wrapCodes = ((optRes.data ?? []) as Row[]).filter((o) => o.kind === "special_wrap" && o.is_active !== false).map((o) => String(o.label).trim()).filter(Boolean);
  if (notesRes.error) return bad("โหลดออเดอร์ไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  const maps = engraveSkuMaps(((optRes.data ?? []) as Row[]).map((o) => ({ kind: String(o.kind), label: String(o.label), value: str(o.value), is_active: o.is_active !== false })));
  const modes: Record<string, EngraveMode> = {};
  for (const p of (modeRes.data ?? []) as Row[]) if (isEngraveMode(p.engrave_mode)) modes[String(p.id)] = p.engrave_mode;
  const requiredIds = Object.keys(modes).filter((k) => modes[k] === "required");

  // ออเดอร์ที่ไม่มีหมายเหตุแต่มีสินค้าสลัก: รายการที่มีรหัสท้าย SKU หรือเป็นรุ่น "ต้องสลักทุกชิ้น"
  const requiredSkuIds = requiredIds.length
    ? ((await admin.from("skus_v2").select("id").in("parent_sku_id", requiredIds).limit(2000)).data ?? []).map((r) => String((r as Row).id))
    : [];
  const itemOr = ["sku_code.imatch.[A-Za-z]/[0-9]+$", ...wrapCodes.filter((c) => /^[\w-]+$/.test(c)).map((c) => `sku_code.ilike.${c}*`)];
  for (const c of chunkOf(requiredIds, 100)) itemOr.push(`matched_parent_sku_id.in.(${c.join(",")})`);
  for (const c of chunkOf(requiredSkuIds, 100)) itemOr.push(`matched_sku_id.in.(${c.join(",")})`);
  const { data: engHits, error: hitErr } = await admin.from("platform_order_items").select("order_id, platform_orders!inner(ordered_at)")
    .or(itemOr.join(",")).gte("platform_orders.ordered_at", since).limit(3000);
  if (hitErr) console.error("[order-gift-cards] หาออเดอร์สินค้าสลักไม่สำเร็จ:", hitErr.message);
  const withNote = ((notesRes.data ?? []) as Row[]).filter((o) => noteOfRow(o));
  const noteIds = new Set(withNote.map((o) => String(o.id)));
  // คำสั่งพิเศษในช่วงนี้ (+ ที่ยังไม่ทำทุกใบ) — รวมเป็นรายการเดียวกับงานเข้า (เจ้าของเลือก 2026-11-25 ข้อ 1) · คำสั่งที่ไม่ผูกออเดอร์ = แถวของตัวเอง
  const { data: periodIns } = await admin.from("order_instructions").select(INS_COLS).is("deleted_at", null).or(`created_at.gte.${since},status.eq.todo`).order("created_at", { ascending: false }).limit(1000);
  const extraIds = [...new Set([
    ...((engHits ?? []) as Row[]).map((r) => String(r.order_id)),
    ...((periodIns ?? []) as Row[]).map((r) => str(r.platform_order_id)).filter((x): x is string => !!x),
  ])].filter((id) => !noteIds.has(id));
  const extraRes = await Promise.all(chunkOf(extraIds).map((c) => admin.from("platform_orders").select(ORDER_COLS).in("id", c).or("source.is.null,source.neq.email")));
  const allOrders = [...withNote, ...extraRes.flatMap((r) => (r.data ?? []) as Row[])];
  const chunks = chunkOf(allOrders.map((o) => String(o.id)));
  const [cardsRes, kindsRes, insRes, itemsRes, lk] = await Promise.all([
    Promise.all(chunks.map((c) => admin.from("order_gift_cards").select("id, platform_order_id, message, printed_at, hand_written_at, updated_at").in("platform_order_id", c).is("deleted_at", null))),
    Promise.all(chunks.map((c) => admin.from("order_note_kinds").select("platform_order_id, card, engrave").in("platform_order_id", c))),
    Promise.all(chunks.map((c) => admin.from("order_instructions").select(INS_COLS).in("platform_order_id", c).is("deleted_at", null))),
    Promise.all(chunks.map((c) => admin.from("platform_order_items").select("order_id, sku_code, name, qty, matched_sku_id, matched_parent_sku_id").in("order_id", c))),
    lookups(admin, [...new Set(allOrders.map((o) => str(o.platform_id)).filter((x): x is string => !!x))], [...new Set(allOrders.map((o) => str(o.brand_id)).filter((x): x is string => !!x))]),
  ]);
  const itemRows = itemsRes.flatMap((r) => (r.data ?? []) as Row[]);
  // SKU ลูก → รุ่น (parent) · รหัสรุ่น + ค่าที่ตั้งไว้ (ใช้โชว์ + เมนู "ตั้งรุ่นนี้เป็นสินค้าสลักชื่อ")
  const skuIds = [...new Set(itemRows.map((r) => str(r.matched_sku_id)).filter((x): x is string => !!x))];
  const skuParent = new Map<string, string>();
  for (const r2 of await Promise.all(chunkOf(skuIds).map((c) => admin.from("skus_v2").select("id, parent_sku_id").in("id", c))))
    for (const r of (r2.data ?? []) as Row[]) if (r.parent_sku_id) skuParent.set(String(r.id), String(r.parent_sku_id));
  const parentOf = (r: Row) => str(r.matched_parent_sku_id) ?? (r.matched_sku_id ? skuParent.get(String(r.matched_sku_id)) ?? null : null);
  const parentIds = [...new Set(itemRows.map(parentOf).filter((x): x is string => !!x))];
  const parentInfo = new Map<string, { code: string | null; mode: EngraveMode | null }>();
  for (const r2 of await Promise.all(chunkOf(parentIds).map((c) => admin.from("parent_skus_v2").select("id, code, engrave_mode").in("id", c))))
    for (const r of (r2.data ?? []) as Row[]) parentInfo.set(String(r.id), { code: str(r.code), mode: isEngraveMode(r.engrave_mode) ? r.engrave_mode : null });
  for (const [id, p] of parentInfo) if (p.mode && !modes[id]) modes[id] = p.mode;

  const group = (res: { data: unknown }[]) => {
    const m = new Map<string, Row[]>();
    for (const r of res) for (const x of (r.data ?? []) as Row[]) { const k = String(x.platform_order_id ?? x.order_id); m.set(k, [...(m.get(k) ?? []), x]); }
    return m;
  };
  const cards = group(cardsRes), kinds = group(kindsRes), ins = group(insRes), items = group(itemsRes);
  const allIns = [...insRes.flatMap((r) => (r.data ?? []) as Row[]), ...((periodIns ?? []) as Row[]).filter((x) => !x.platform_order_id || !allOrders.some((o) => String(o.id) === String(x.platform_order_id)))];
  const engPrints = await printSummaryOf(admin, "engrave_sheet", allIns.filter((x) => x.engrave === true && str(x.engrave_text)).map((x) => String(x.id)));
  /** สถานะงาน + สถานะพิมพ์ของ 1 แถว (ข้อ 3) */
  const workOf = (list: Row[], cardList: Row[], orderStatus: string | null) => {
    const closed = (ENGRAVE_NO_WARN_STATUSES as readonly string[]).includes(String(orderStatus ?? ""));
    const work = !list.length ? "none" : list.some((x) => x.status !== "done") ? "todo" : "done";
    const engNeed = list.filter((x) => x.engrave === true && str(x.engrave_text));
    const engDone = engNeed.filter((x) => engPrints.has(String(x.id)));
    const lastEng = engDone.map((x) => engPrints.get(String(x.id))!.last).sort().pop() ?? null;
    const cardDone = cardList.filter((c) => c.printed_at || c.hand_written_at);
    const needs = engNeed.length + cardList.length, ok = engDone.length + cardDone.length;
    return {
      work, closed,
      print: { state: needs === 0 ? "none" : ok >= needs ? "done" : "todo", engrave_total: engNeed.length, engrave_printed: engDone.length, engrave_last: lastEng, card_total: cardList.length, card_printed: cardDone.length },
    };
  };
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const startToday = new Date(`${today}T00:00:00+07:00`).getTime();
  let rows = allOrders.map((o) => {
    const info = orderInfo(o, lk);
    const auto = classifyNote(info.note);
    const its = (items.get(info.id) ?? []).map((r) => { const pid = parentOf(r); return { sku_code: str(r.sku_code), name: str(r.name), qty: Number(r.qty) || 1, parent_id: pid, parent_code: pid ? parentInfo.get(pid)?.code ?? null : null }; });
    const eg = engraveOfOrder({ items: its, modes, note: info.note, noteEngrave: auto.engrave, status: info.status, maps });
    const kindAuto = { card: auto.card, engrave: eg.engrave };
    const k = kinds.get(info.id)?.[0];
    const kind = k ? { card: k.card === true, engrave: k.engrave === true } : kindAuto;
    const parents = [...new Map(eg.items.filter((i) => i.parent_id).map((i) => [i.parent_id as string, { id: i.parent_id as string, code: i.parent_code, mode: i.mode }])).values()];
    const insList = ins.get(info.id) ?? [];
    const cardList = cards.get(info.id) ?? [];
    const wraps = specialWrapCodes(its.map((i) => i.sku_code), wrapCodes);
    return {
      ...info, special_wrap: wraps, kind: { ...kind, card: kind.card || wraps.length > 0, chat: insList.some((x) => x.via_chat === true) }, kind_auto: kindAuto, overridden: !!k, cards: cardList, instructions: insList,
      engrave: { sources: eg.sources, items: eg.items.filter((i) => i.engrave), needs_name: kind.engrave && eg.needsName && !insList.some((x) => x.engrave === true && str(x.engrave_text)) },
      parents,
      chat_ready: !!(info.platform_code && (CHAT_CHANNELS as readonly string[]).includes(info.platform_code) && chatAdapter(info.platform_code as ChatChannel)),
      ...workOf(insList, cardList, info.status),
    };
  }).filter((r) => r.note || r.kind.engrave || r.instructions.length || r.special_wrap.length);
  // คำสั่งที่ไม่ผูกออเดอร์ในศูนย์ (พิมพ์เลขเอง/จากแชท) = แถวของตัวเอง
  const orphans = ((periodIns ?? []) as Row[]).filter((x) => !x.platform_order_id || !allOrders.some((o) => String(o.id) === String(x.platform_order_id)));
  rows = [...rows, ...orphans.map((x) => ({
    id: `ins:${x.id}`, order_no: str(x.order_no), customer_name: str(x.customer_name), status: null, ordered_at: str(x.created_at), ship_by_at: null, packed_at: null,
    platform: str(x.platform), platform_code: null, brand_id: null, brand_name: null, note: null, special_wrap: [] as string[],
    kind: { card: false, engrave: x.engrave === true, chat: x.via_chat === true }, kind_auto: { card: false, engrave: x.engrave === true }, overridden: false,
    cards: [] as Row[], instructions: [x],
    engrave: { sources: [] as string[], items: [] as Row[], needs_name: false }, parents: [] as Row[], chat_ready: false,
    ...workOf([x], [], null),
  }))] as typeof rows;
  const open = (r: (typeof rows)[number]) => !r.closed;
  const counts = {
    // สถานะงาน (การ์ดตัวเลข · ข้อ 4) — ไม่นับออเดอร์ที่ส่งแล้ว/ยกเลิก ในงานค้าง
    no_ins: rows.filter((r) => r.work === "none" && open(r)).length,
    ins_todo: rows.filter((r) => r.work === "todo").length,
    print_todo: rows.filter((r) => r.print.state === "todo" && open(r)).length,
    done_today: rows.filter((r) => r.instructions.some((x) => x.status === "done" && new Date(String(x.done_at ?? 0)).getTime() >= startToday)).length,
    chat: rows.filter((r) => r.kind.chat).length,
    card: rows.filter((r) => r.kind.card).length,
    card_todo: rows.filter((r) => r.kind.card && !r.cards.some((c) => c.printed_at || c.hand_written_at)).length,
    engrave: rows.filter((r) => r.kind.engrave).length,
    engrave_missing: rows.filter((r) => r.engrave.needs_name).length,
    // ยังไม่ส่งไปคำสั่งสลัก (ไม่นับที่ส่งแล้ว/ยกเลิก) — ตัวเลขบนปุ่มส่วน "งานเข้า"
    engrave_todo: rows.filter((r) => r.kind.engrave && !r.instructions.some((i) => i.engrave) && !(ENGRAVE_NO_WARN_STATUSES as readonly string[]).includes(String(r.status ?? ""))).length,
    other: rows.filter((r) => r.note && !r.kind.card && !r.kind.engrave).length,
    all: rows.length,
  };
  if (sp.get("counts") === "1") return { counts, days };
  // กรองสถานะงาน (state) + ชนิด (kind) — tab เดิมยังใช้ได้
  const state = sp.get("state") ?? (sp.get("tab") === "engrave_missing" ? "engrave_missing" : sp.get("tab") ? "all" : "no_ins");
  const kindF = sp.get("kind") ?? (["card", "engrave", "other"].includes(sp.get("tab") ?? "") ? sp.get("tab") : "");
  if (state === "no_ins") rows = rows.filter((r) => r.work === "none" && open(r));
  else if (state === "ins_todo") rows = rows.filter((r) => r.work === "todo");
  else if (state === "engrave_missing") rows = rows.filter((r) => r.engrave.needs_name);
  else if (state === "print_todo") rows = rows.filter((r) => r.print.state === "todo" && open(r));
  else if (state === "done_today") rows = rows.filter((r) => r.instructions.some((x) => x.status === "done" && new Date(String(x.done_at ?? 0)).getTime() >= startToday));
  if (kindF === "card") rows = rows.filter((r) => r.kind.card);
  else if (kindF === "engrave") rows = rows.filter((r) => r.kind.engrave);
  else if (kindF === "chat") rows = rows.filter((r) => r.kind.chat);
  else if (kindF === "other") rows = rows.filter((r) => r.note && !r.kind.card && !r.kind.engrave);
  rows.sort((a, b) => String(b.ordered_at ?? "").localeCompare(String(a.ordered_at ?? "")));
  const qq = cleanQ(sp.get("q") ?? "").toLowerCase();
  if (qq) rows = rows.filter((r) => `${r.order_no ?? ""} ${r.note ?? ""} ${r.customer_name ?? ""}`.toLowerCase().includes(qq));
  // รุ่นที่ชื่อมีคำว่า "สลัก" แต่ยังไม่ได้ตั้ง "สินค้าสลักชื่อ" — แค่แนะนำ ไม่ตั้งให้เอง
  let suggest: { id: string; code: string | null; name: string | null }[] = [];
  if (kindF === "engrave" || state === "engrave_missing") {
    const { data: sg } = await admin.from("parent_skus_v2").select("id, code, name_th").ilike("name_th", "%สลัก%").is("engrave_mode", null).eq("is_active", true).order("code").limit(30);
    suggest = ((sg ?? []) as Row[]).map((r) => ({ id: String(r.id), code: str(r.code), name: str(r.name_th) }));
  }
  return { rows, counts, days, suggest };
}

// ───────────────────────── POST ─────────────────────────

const AI_SYSTEM = `คุณช่วยร้านเขียนข้อความบนการ์ดของขวัญที่ลูกค้าขอ
- อ่านหมายเหตุลูกค้า + ข้อความร่าง แล้วเสนอข้อความบนการ์ด 3 แบบ สั้น อบอุ่น อ่านง่าย (ไม่เกิน 3 บรรทัด / 120 ตัวอักษร ต่อแบบ)
- ถ้าลูกค้าเขียนข้อความมาเองชัดเจน ให้แบบแรกคงข้อความเดิม (แก้แค่คำผิด/เว้นวรรค) ห้ามแต่งเพิ่มเนื้อหาที่ลูกค้าไม่ได้ขอ
- ภาษา: ตามที่ลูกค้าใช้ ถ้าลูกค้าเขียนอังกฤษให้มีอังกฤษ · ถ้าไม่ชัด ให้มีทั้งไทยและอังกฤษ
- ห้ามใส่ชื่อร้าน ราคา โปรโมชัน หรือข้อมูลส่วนตัวที่ไม่มีในหมายเหตุ
ตอบ JSON เท่านั้น: {"options":["...","...","..."]}`;

export async function POST(request: Request): Promise<NextResponse> {
  let body: Row;
  try { body = await request.json(); } catch { return bad("ข้อมูลไม่ถูกต้อง"); }
  const action = String(body.action ?? "");
  const admin = supabaseAdmin();

  if (action === "template_save" || action === "template_copy") {
    const denied = await guardApi(request, "order_ops.manage"); if (denied) return denied;
    const me = await whoAmI(request, admin);
    let doc: CardDoc, name: string, brandId: string | null, group: string | null;
    if (action === "template_copy") {
      const from = String(body.from ?? "");
      const src = isBuiltinId(from) ? builtinTemplates().find((x) => x.id === from)
        : uuidRe.test(from) ? (await admin.from("gift_card_templates").select("name, doc, brand_id, group_name").eq("id", from).maybeSingle()).data as Row | null : null;
      if (!src) return bad("ไม่พบแม่แบบต้นฉบับ", 404);
      doc = cleanDoc((src as Row).doc); name = `${String((src as Row).name)} (สำเนา)`.slice(0, 80); brandId = str((src as Row).brand_id);
      group = str((src as Row).group_name) ?? str((src as Row).group);
    } else {
      doc = cleanDoc(body.doc);
      name = String(body.name ?? "").trim().slice(0, 80);
      if (!name) return bad("ตั้งชื่อแม่แบบก่อน");
      brandId = body.brand_id && uuidRe.test(String(body.brand_id)) ? String(body.brand_id) : null;
      group = typeof body.group_name === "string" && body.group_name.trim() ? body.group_name.trim().slice(0, 60) : null;
    }
    const isDefault = body.is_default === true;
    const id = action === "template_save" && body.id && uuidRe.test(String(body.id)) ? String(body.id) : null;
    // แก้แม่แบบในตัว = เก็บเป็นฉบับแก้ (replaces_builtin) · ในตัวตัวนั้นซ่อน · ลบฉบับแก้ = คืนค่าเดิม
    const replaces = action === "template_save" && !id && isBuiltinId(String(body.replaces_builtin ?? "")) && builtinTemplates().some((b) => b.id === body.replaces_builtin) ? String(body.replaces_builtin) : null;
    if (replaces) {
      const { data: dup } = await admin.from("gift_card_templates").select("id").eq("replaces_builtin", replaces).is("deleted_at", null).limit(1);
      if (dup?.length) return bad("แม่แบบในตัวนี้ถูกแก้ไว้แล้ว — เปิดฉบับที่แก้จากหน้าตั้งค่า", 409);
    }
    const patch: Row = { name, brand_id: brandId, doc, is_default: isDefault, group_name: group, updated_by_name: me.name, updated_at: new Date().toISOString() };
    if (isDefault) {   // หลักได้ใบเดียวต่อแบรนด์ (ไม่มีแบรนด์ = หลักทั่วไป)
      let q = admin.from("gift_card_templates").update({ is_default: false }).eq("is_default", true).is("deleted_at", null);
      q = brandId ? q.eq("brand_id", brandId) : q.is("brand_id", null);
      if (id) q = q.neq("id", id);
      await q;
    }
    if (id) {
      const { data: before } = await admin.from("gift_card_templates").select("name, brand_id, is_default, doc").eq("id", id).maybeSingle();
      if (!before) return bad("ไม่พบแม่แบบ", 404);
      const { error } = await admin.from("gift_card_templates").update(patch).eq("id", id);
      if (error) return bad("บันทึกแม่แบบไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
      await writeAudit(admin, { action: "update", entityType: "gift_card_templates", entityId: id, actorId: me.id, actorName: me.name, metadata: { name, ...auditChangeMeta(before as Row, patch, { opaque: ["doc"] }) } });
      return NextResponse.json({ ok: true, id });
    }
    // ใหม่ = ต่อท้ายกลุ่ม
    const { data: last } = await admin.from("gift_card_templates").select("sort_order").is("deleted_at", null).order("sort_order", { ascending: false }).limit(1);
    const nextOrder = (Number((last?.[0] as Row | undefined)?.sort_order) || 0) + 10;
    const { data, error } = await admin.from("gift_card_templates").insert({ ...patch, sort_order: nextOrder, replaces_builtin: replaces, created_by: me.id, created_by_name: me.name }).select("id").single();
    if (error || !data) return bad("บันทึกแม่แบบไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
    await writeAudit(admin, { action: "create", entityType: "gift_card_templates", entityId: String(data.id), actorId: me.id, actorName: me.name, metadata: { name, group, from: action === "template_copy" ? body.from : undefined, replaces_builtin: replaces ?? undefined } });
    return NextResponse.json({ ok: true, id: data.id });
  }

  // จัดลำดับ/ย้ายกลุ่ม (ข้อ 2) — ids = ลำดับใหม่ทั้งกลุ่ม (ของที่ออกแบบเองเท่านั้น) · ย้อนกลับ = ส่งลำดับเดิมกลับมา
  if (action === "template_order") {
    const denied = await guardApi(request, "order_ops.manage"); if (denied) return denied;
    const me = await whoAmI(request, admin);
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x: string) => uuidRe.test(x)).slice(0, 200);
    const group = typeof body.group === "string" && body.group.trim() && body.group.trim() !== "ไม่มีกลุ่ม" ? body.group.trim().slice(0, 60) : null;
    if (!ids.length) return bad("ไม่มีแม่แบบที่จะจัดลำดับ");
    const { data: before } = await admin.from("gift_card_templates").select("id, name, group_name, sort_order").in("id", ids);
    const base = Number(body.base) || 0;
    for (let i = 0; i < ids.length; i++) await admin.from("gift_card_templates").update({ group_name: group, sort_order: base + (i + 1) * 10 }).eq("id", ids[i]);
    await writeAudit(admin, { action: "template_order", entityType: "gift_card_templates", entityId: ids[0], actorId: me.id, actorName: me.name, metadata: { group, before } });
    return NextResponse.json({ ok: true, before });
  }
  // เปลี่ยนชื่อกลุ่ม — ทุกแม่แบบในกลุ่ม (ในตัวที่ยังไม่แก้ ใช้ชื่อกลุ่มเดิมของระบบ)
  if (action === "template_group_rename") {
    const denied = await guardApi(request, "order_ops.manage"); if (denied) return denied;
    const me = await whoAmI(request, admin);
    const from = String(body.from ?? "").trim(), to = String(body.to ?? "").trim().slice(0, 60);
    if (!from || !to) return bad("ตั้งชื่อกลุ่มใหม่ก่อน");
    const { data, error } = await admin.from("gift_card_templates").update({ group_name: to }).eq("group_name", from).is("deleted_at", null).select("id");
    if (error) return bad("เปลี่ยนชื่อกลุ่มไม่สำเร็จ", 500);
    await writeAudit(admin, { action: "template_group_rename", entityType: "gift_card_templates", entityId: String((data?.[0] as Row | undefined)?.id ?? "00000000-0000-0000-0000-000000000000"), actorId: me.id, actorName: me.name, metadata: { changes: { group_name: { from, to } }, count: data?.length ?? 0 } });
    return NextResponse.json({ ok: true, count: data?.length ?? 0 });
  }

  if (action === "ai") {
    const base = await apiCan(request, "order_ops.edit");
    if (!(await featureAccess("ai.gift_card", { request }, base))) return bad("คุณยังไม่ได้รับสิทธิ์ใช้ AI เขียนการ์ด — ขอสิทธิ์จากผู้ดูแลระบบ", 403);
    const note = String(body.note ?? "").slice(0, 800);
    const message = String(body.message ?? "").slice(0, 600);
    if (!note.trim() && !message.trim()) return bad("ยังไม่มีหมายเหตุหรือข้อความให้ AI เรียบเรียง");
    const brandId = body.brand_id && uuidRe.test(String(body.brand_id)) ? String(body.brand_id) : null;
    const brandCard = await brandProfileBlock(admin, brandId).catch(() => "");
    const ask = [`หมายเหตุลูกค้า: ${note || "(ไม่มี)"}`, `ข้อความร่างตอนนี้: ${message || "(ว่าง)"}`, brandCard ? `โทนแบรนด์ (ใช้แค่โทนภาษา):\n${brandCard}` : ""].filter(Boolean).join("\n");
    try {
      const out = await aiChat("ai.gift_card", AI_SYSTEM, [{ type: "text", text: ask }], 500, undefined, { request });
      const options = (Array.isArray(out.options) ? out.options : []).map((x) => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 3);
      if (!options.length) return bad("AI ตอบไม่ได้ ลองใหม่อีกครั้ง", 502);
      return NextResponse.json({ options });
    } catch (e) {
      return bad(e instanceof Error ? e.message : "AI ตอบไม่ได้ ลองใหม่อีกครั้ง", 502);
    }
  }

  const denied = await guardApi(request, "order_ops.edit"); if (denied) return denied;
  const me = await whoAmI(request, admin);
  const now = new Date().toISOString();

  if (action === "save_card") {
    const doc = cleanDoc(body.doc);
    const message = roleTexts(doc).message || doc.els.filter((e) => e.kind === "text").map((e) => e.text).join(" ").slice(0, 300) || null;
    const id = body.id && uuidRe.test(String(body.id)) ? String(body.id) : null;
    const templateId = body.template_id && uuidRe.test(String(body.template_id)) ? String(body.template_id) : null;
    const note = body.note === undefined ? undefined : str(String(body.note ?? "").trim().slice(0, 1000));
    if (id) {
      const { data: before } = await admin.from("order_gift_cards").select("doc, message, note, order_no, deleted_at").eq("id", id).maybeSingle();
      if (!before || (before as Row).deleted_at) return bad("ไม่พบการ์ด (อาจถูกลบไปแล้ว)", 404);
      const patch: Row = { doc, prev_doc: (before as Row).doc, message, updated_by_name: me.name, updated_at: now };
      if (note !== undefined) patch.note = note;
      if (body.order_no !== undefined) patch.order_no = str(String(body.order_no ?? "").trim().slice(0, 60));
      if (templateId) patch.template_id = templateId;
      const { error } = await admin.from("order_gift_cards").update(patch).eq("id", id);
      if (error) return bad("บันทึกการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
      await writeAudit(admin, { action: "update", entityType: "order_gift_cards", entityId: id, actorId: me.id, actorName: me.name, metadata: { order_no: (before as Row).order_no, ...auditChangeMeta(before as Row, { message, ...(note !== undefined ? { note } : {}), ...(patch.order_no !== undefined ? { order_no: patch.order_no } : {}), doc }, { opaque: ["doc"] }) } });
      return NextResponse.json({ ok: true, id });
    }
    // สร้างใหม่ — ผูกออเดอร์ (ถ้ามี) เก็บหมายเหตุลูกค้า ณ ตอนนั้นไว้ด้วย
    const poId = body.platform_order_id && uuidRe.test(String(body.platform_order_id)) ? String(body.platform_order_id) : null;
    let ins: Row = { order_no: str(String(body.order_no ?? "").trim().slice(0, 60)) };
    if (poId) {
      const { data: o } = await admin.from("platform_orders").select(ORDER_COLS).eq("id", poId).maybeSingle();
      if (!o) return bad("ไม่พบออเดอร์", 404);
      const lk = await lookups(admin, o.platform_id ? [String(o.platform_id)] : [], []);
      const info = orderInfo(o as Row, lk);
      ins = { platform_order_id: poId, order_no: info.order_no, platform: info.platform, brand_id: info.brand_id, customer_note: info.note };
    }
    const { data, error } = await admin.from("order_gift_cards").insert({ ...ins, template_id: templateId, doc, message, note: note ?? null, created_by: me.id, created_by_name: me.name, updated_by_name: me.name }).select("id").single();
    if (error || !data) return bad("บันทึกการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
    await writeAudit(admin, { action: "create", entityType: "order_gift_cards", entityId: String(data.id), actorId: me.id, actorName: me.name, metadata: { order_no: ins.order_no, message } });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (action === "revert") {
    const id = String(body.id ?? "");
    if (!uuidRe.test(id)) return bad("ไม่พบการ์ด", 404);
    const { data: c } = await admin.from("order_gift_cards").select("doc, prev_doc, order_no").eq("id", id).maybeSingle();
    if (!c || !(c as Row).prev_doc) return bad("ไม่มีเวอร์ชันก่อนหน้าให้ย้อน");
    const doc = cleanDoc((c as Row).prev_doc);
    const { error } = await admin.from("order_gift_cards").update({ doc, prev_doc: (c as Row).doc, message: roleTexts(doc).message || null, updated_by_name: me.name, updated_at: now }).eq("id", id);
    if (error) return bad("ย้อนไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
    await writeAudit(admin, { action: "revert", entityType: "order_gift_cards", entityId: id, actorId: me.id, actorName: me.name, metadata: { order_no: (c as Row).order_no, changed_detail: ["doc"] } });
    return NextResponse.json({ ok: true });
  }

  if (action === "printed" || action === "unprint") {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => uuidRe.test(x)).slice(0, 200);
    if (!ids.length) return bad("ไม่ได้เลือกการ์ด");
    const { data: before } = await admin.from("order_gift_cards").select("id, order_no, print_count, printed_at").in("id", ids).is("deleted_at", null);
    const rows = (before ?? []) as Row[];
    for (const r of rows) {
      const patch = action === "printed"
        ? { printed_at: now, printed_by_name: me.name, print_count: Number(r.print_count ?? 0) + 1 }
        : { printed_at: null, printed_by_name: null };
      await admin.from("order_gift_cards").update(patch).eq("id", String(r.id));
    }
    await writeAuditMany(admin, rows.map((r) => ({ action: action === "printed" ? "print" : "unprint", entityType: "order_gift_cards", entityId: String(r.id), actorId: me.id, actorName: me.name, metadata: { order_no: r.order_no, changes: [{ field: "printed_at", old: r.printed_at ?? null, new: action === "printed" ? now : null }] } })));
    return NextResponse.json({ ok: true, count: rows.length });
  }

  if (action === "written") {
    const id = String(body.id ?? "");
    if (!uuidRe.test(id)) return bad("ไม่พบการ์ด", 404);
    const on = body.on === true;
    const { data: before } = await admin.from("order_gift_cards").select("order_no, hand_written_at").eq("id", id).maybeSingle();
    if (!before) return bad("ไม่พบการ์ด", 404);
    const patch = on ? { hand_written_at: now, hand_written_by_name: me.name } : { hand_written_at: null, hand_written_by_name: null };
    await admin.from("order_gift_cards").update(patch).eq("id", id);
    await writeAudit(admin, { action: on ? "hand_written" : "hand_written_undo", entityType: "order_gift_cards", entityId: id, actorId: me.id, actorName: me.name, metadata: { order_no: (before as Row).order_no, changes: [{ field: "hand_written_at", old: (before as Row).hand_written_at ?? null, new: patch.hand_written_at }] } });
    return NextResponse.json({ ok: true });
  }

  if (action === "kind") {
    const poId = String(body.order_id ?? "");
    if (!uuidRe.test(poId)) return bad("ไม่พบออเดอร์", 404);
    const { data: before } = await admin.from("order_note_kinds").select("card, engrave").eq("platform_order_id", poId).maybeSingle();
    if (body.reset === true) {
      await admin.from("order_note_kinds").delete().eq("platform_order_id", poId);
      await writeAudit(admin, { action: "note_kind_reset", entityType: "order_note_kinds", entityId: poId, actorId: me.id, actorName: me.name, metadata: { before } });
      return NextResponse.json({ ok: true });
    }
    const next = { card: body.card === true, engrave: body.engrave === true };
    const { error } = await admin.from("order_note_kinds").upsert({ platform_order_id: poId, ...next, updated_by_name: me.name, updated_at: now });
    if (error) return bad("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
    await writeAudit(admin, { action: "note_kind", entityType: "order_note_kinds", entityId: poId, actorId: me.id, actorName: me.name, metadata: { ...auditChangeMeta((before as Row | null) ?? { card: null, engrave: null }, next) } });
    return NextResponse.json({ ok: true });
  }

  // ตั้ง "สินค้าสลักชื่อ" ของรุ่น (ช่องเดียวกับ Parent SKU › รายละเอียด Platform) — ผู้จัดการเท่านั้น · mode null = ล้างค่า (ใช้ย้อนกลับ)
  if (action === "engrave_mode") {
    if (!(await apiCan(request, "order_ops.manage"))) return bad("ตั้งสินค้าสลักชื่อต้องมีสิทธิ์จัดการงานหลังขาย (order_ops.manage)", 403);
    const pid = String(body.parent_id ?? "");
    if (!uuidRe.test(pid)) return bad("ไม่พบรุ่นสินค้า", 404);
    const mode = body.mode == null ? null : isEngraveMode(body.mode) ? body.mode : undefined;
    if (mode === undefined) return bad("ค่าสินค้าสลักชื่อไม่ถูกต้อง");
    const { data: before } = await admin.from("parent_skus_v2").select("code, engrave_mode").eq("id", pid).maybeSingle();
    if (!before) return bad("ไม่พบรุ่นสินค้า", 404);
    const { error } = await admin.from("parent_skus_v2").update({ engrave_mode: mode }).eq("id", pid);
    if (error) return bad("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
    await writeAudit(admin, { action: "update", entityType: "parent_skus_v2", entityId: pid, actorId: me.id, actorName: me.name,
      metadata: { name: str((before as Row).code), via: "order-gift-cards", label: mode ? ENGRAVE_MODE_LABEL[mode] : "ล้างค่า", ...auditChangeMeta({ engrave_mode: (before as Row).engrave_mode ?? null }, { engrave_mode: mode }) } });
    return NextResponse.json({ ok: true, before: (before as Row).engrave_mode ?? null });
  }

  return bad("ไม่รู้จักคำสั่งนี้");
}

// ───────────────────────── DELETE (ถังขยะ) ─────────────────────────

const DEL_TABLE = { card: "order_gift_cards", template: "gift_card_templates", font: "gift_card_fonts" } as const;

export async function DELETE(request: Request): Promise<NextResponse> {
  let body: Row;
  try { body = await request.json(); } catch { return bad("ข้อมูลไม่ถูกต้อง"); }
  const kind = String(body.kind ?? "card") as keyof typeof DEL_TABLE;
  if (!(kind in DEL_TABLE)) return bad("ไม่รู้จักชนิดที่จะลบ");
  const denied = await guardApi(request, kind === "card" ? "order_ops.delete" : "order_ops.manage"); if (denied) return denied;
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => uuidRe.test(x)).slice(0, 200);
  if (!ids.length) return bad("ไม่ได้เลือกรายการ");
  const admin = supabaseAdmin();
  const me = await whoAmI(request, admin);
  const restore = body.restore === true;
  const table = DEL_TABLE[kind];
  const label = kind === "card" ? "order_no" : "name";
  const { data: rows } = await admin.from(table).select(`id, ${label}, deleted_at`).in("id", ids);
  const target = ((rows ?? []) as unknown as Row[]).filter((r) => (restore ? r.deleted_at : !r.deleted_at));
  if (!target.length) return NextResponse.json({ ok: true, count: 0 });
  const at = restore ? null : new Date().toISOString();
  const { error } = await admin.from(table).update({ deleted_at: at }).in("id", target.map((r) => String(r.id)));
  if (error) return bad("ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  await writeAuditMany(admin, target.map((r) => ({ action: restore ? "restore" : "delete", entityType: table, entityId: String(r.id), actorId: me.id, actorName: me.name, metadata: { [label]: r[label], changes: [{ field: "deleted_at", old: r.deleted_at ?? null, new: at }] } })));
  return NextResponse.json({ ok: true, count: target.length });
}
