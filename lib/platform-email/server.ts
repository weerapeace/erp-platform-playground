/**
 * 📧 ประมวลเมลแพลตฟอร์ม → ออเดอร์ใน platform_orders (ฝั่ง server · supabaseAdmin)
 *
 * เรียกจาก: /api/platform-email/inbound (สคริปต์ Gmail ส่งมา) · ปุ่ม "อ่านใหม่" (/api/platform-email/inbox)
 * ขั้นตอนต่อ 1 เมล: อ่านด้วยกฎ (./parse) → ตรวจร้าน → สร้าง/ยกเลิกออเดอร์ → จับคู่สินค้า (./match) → บันทึกผลลง platform_email_inbox
 *
 * กติกาที่ตั้งใจ:
 *   - ไม่ตัดสต๊อก (ออเดอร์จากเมลเข้าสถานะ "ใหม่" · ตัดสต๊อกเป็นงานของปุ่มยืนยันในหน้าออเดอร์เดิม)
 *   - ออเดอร์ที่มีอยู่แล้ว (จากไฟล์/API/เมลก่อนหน้า) ไม่บันทึกซ้ำ · เมลยกเลิกมาก่อนก็บันทึกเป็น "ยกเลิก" ไว้
 *   - ออเดอร์ที่ตัดสต๊อกไปแล้ว เมลยกเลิกจะไม่แตะเอง → ขึ้น "ต้องมีคนดู" ให้กดยกเลิกในหน้าออเดอร์ (คืนสต๊อกให้ถูก)
 *   - ชื่อร้านในเมลต้องอยู่ในรายการร้านที่ตั้งไว้ (กันเมลตอนเราเป็น "ผู้ซื้อ" หลุดเข้ามาเป็นยอดขาย)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { emailLines, isReadable, parsePlatformEmail, type EmailKind, type ParsedEmail, type ParsedItem, type PlatformCode } from "./parse";
import { AUTO_CONFIDENCE, itemKey, matchEmailItem, modelCodeFromTitle, modelsForItem, type ConfirmedRule, type ItemMatch, type SkuCandidate } from "./match";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;

export type InboxStatus = "done" | "ignored" | "unreadable" | "attention";
export type ShopRule = { platform?: string | null; match: string; brand_id?: string | null };

export type InboundMessage = {
  id: string;
  from?: string | null;
  subject?: string | null;
  date?: string | null;
  html?: string | null;
  text?: string | null;
};

export type ProcessOutcome = { status: InboxStatus; note: string; order_id: string | null; kind: EmailKind; created: boolean };

/** คำค้นใน Gmail ค่าเริ่มต้น — เมลจากผู้ส่งที่มีคำว่า shopee/lazada (ทั้งชื่อและที่อยู่) */
export const DEFAULT_SEARCH_QUERY = "from:(shopee OR lazada)";

export const SKU_MATCH_SELECT = "id, code, name_th, color, color_th, color_platform_th, color_platform_en, is_active";

const PLATFORM_LABEL: Record<PlatformCode, string> = { shopee: "Shopee", lazada: "Lazada" };
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

export async function loadEmailSettings(admin: Admin): Promise<Row & { shops: ShopRule[] }> {
  const { data } = await admin.from("platform_email_settings").select("*").eq("id", 1).maybeSingle();
  const row = (data ?? {}) as Row;
  return { ...row, shops: Array.isArray(row.shops) ? (row.shops as ShopRule[]) : [] };
}

export async function loadPlatformIds(admin: Admin): Promise<Partial<Record<PlatformCode, string>>> {
  const { data } = await admin.from("erp_platforms").select("id, code").in("code", ["shopee", "lazada"]);
  const out: Partial<Record<PlatformCode, string>> = {};
  for (const r of (data ?? []) as { id: string; code: string }[]) out[r.code as PlatformCode] = r.id;
  return out;
}

/** ชื่อร้านในเมล → แบรนด์ (ตัวแรกที่ตรงชนะ · ไม่สนตัวพิมพ์ใหญ่เล็ก) · ไม่ได้ตั้งร้านไว้เลย = ยอมทุกร้าน */
export function shopBrand(shops: readonly ShopRule[], platform: string, shopName: string | null): { known: boolean; brand_id: string | null } {
  const list = shops.filter((s) => s && String(s.match ?? "").trim());
  if (!list.length) return { known: true, brand_id: null };
  const name = String(shopName ?? "").toLowerCase();
  if (!name) return { known: false, brand_id: null };
  const hit = list.find((s) => (!s.platform || s.platform === platform) && name.includes(String(s.match).trim().toLowerCase()));
  return hit ? { known: true, brand_id: hit.brand_id || null } : { known: false, brand_id: null };
}

/** รหัสรุ่นที่ปลอดภัยพอจะใส่ในตัวกรองของฐานข้อมูล */
const safeModel = (m: string | null) => (m && /^[A-Z0-9-]{3,30}$/.test(m) ? m : null);

/** จับคู่สินค้าหลายรายการ: ดึงคู่ที่จำไว้ + SKU ของทุกรุ่น (ทั้งรุ่นในชื่อและรุ่นที่เขียนในตัวเลือก) ทีเดียว */
export async function matchItems(admin: Admin, platform: PlatformCode, items: readonly Pick<ParsedItem, "title" | "variant">[]): Promise<ItemMatch[]> {
  const keys = items.map((it) => itemKey(it.title, it.variant));
  const itemModels = items.map((it) => modelsForItem(it).map(safeModel).filter((m): m is string => !!m));
  const models = [...new Set(itemModels.flat())];

  // คู่ที่คนยืนยันไว้: ชี้ SKU (สีชัด) หรือ ชี้รุ่น parent_skus_v2 (นับเป็นรุ่น ไม่แยกสี)
  const ruleMap = new Map<string, ConfirmedRule>();
  if (keys.length) {
    type RuleRow = { item_key: string; sku_id: string | null; parent_sku_id: string | null };
    const { data } = await admin.from("platform_email_sku_rules").select("item_key, sku_id, parent_sku_id").eq("platform_code", platform).in("item_key", keys);
    const rules = (data ?? []) as RuleRow[];
    const skuIds = [...new Set(rules.map((r) => r.sku_id).filter((x): x is string => !!x))];
    const parentIds = [...new Set(rules.map((r) => r.parent_sku_id).filter((x): x is string => !!x))];
    const [{ data: skus }, { data: parents }] = await Promise.all([
      skuIds.length ? admin.from("skus_v2").select("id, code").in("id", skuIds) : Promise.resolve({ data: [] }),
      parentIds.length ? admin.from("parent_skus_v2").select("id, code").in("id", parentIds) : Promise.resolve({ data: [] }),
    ]);
    const codeOf = new Map([...((skus ?? []) as { id: string; code: string }[]), ...((parents ?? []) as { id: string; code: string }[])].map((s) => [s.id, s.code]));
    for (const r of rules) {
      const id = r.sku_id ?? r.parent_sku_id;
      const code = id ? codeOf.get(id) : null;
      if (id && code) ruleMap.set(r.item_key, { id, code, level: r.sku_id ? "sku" : "model" });
    }
  }

  const byModel = new Map<string, SkuCandidate[]>();
  for (let i = 0; i < models.length; i += 40) {
    const chunk = models.slice(i, i + 40);
    const or = chunk.flatMap((m) => [`code.eq.${m}`, `code.ilike.${m}-*`]).join(",");
    const { data } = await admin.from("skus_v2").select(SKU_MATCH_SELECT).or(or).limit(5000);
    for (const s of (data ?? []) as SkuCandidate[]) {
      const code = s.code.toUpperCase();
      for (const m of chunk) if (code === m || code.startsWith(`${m}-`)) byModel.set(m, [...(byModel.get(m) ?? []), s]);
    }
  }

  return items.map((it, i) => {
    const seen = new Set<string>();
    const cands = itemModels[i].flatMap((m) => byModel.get(m) ?? []).filter((s) => !seen.has(s.id) && (seen.add(s.id), true));
    return matchEmailItem(it, cands, ruleMap.get(keys[i]) ?? null);
  });
}

/**
 * จับคู่ใหม่ด้วยกฎล่าสุด ให้สินค้าจากเมลที่ยังไม่ได้ผูก SKU (หลังปรับตัวจับคู่ / เพิ่ม SKU ใน ERP)
 * ผูกได้ = ใส่ SKU · ยังไม่แน่ใจ = อัปเดตคำแนะนำในกล่องรอยืนยัน
 */
export async function rematchPendingItems(admin: Admin): Promise<{ checked: number; matched: number }> {
  type It = { id: string; name: string | null; raw: Record<string, unknown> | null };
  const rows: It[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data } = await admin.from("platform_order_items").select("id, name, raw")
      .is("matched_sku_id", null).is("matched_parent_sku_id", null).eq("raw->>source", "email").order("id").range(from, from + 999);
    rows.push(...((data ?? []) as It[]));
    if ((data ?? []).length < 1000) break;
  }
  let matched = 0;
  for (const pf of ["shopee", "lazada"] as PlatformCode[]) {
    const list = rows.filter((r) => r.raw?.platform_code === pf);
    if (!list.length) continue;
    const res = await matchItems(admin, pf, list.map((r) => ({ title: r.name ?? "", variant: (r.raw?.variant as string | null) ?? null })));
    for (let i = 0; i < list.length; i++) {
      const m = res[i], r = list[i];
      const auto = AUTO_CONFIDENCE.includes(m.confidence);
      const model = m.confidence === "model" && !!m.parent;
      const raw = { ...(r.raw ?? {}), confidence: m.confidence, reason: m.reason, suggest_sku_id: m.suggest?.id ?? null, suggest_code: m.suggest?.code ?? null };
      const changed = auto || model || raw.suggest_sku_id !== r.raw?.suggest_sku_id || raw.reason !== r.raw?.reason;
      if (!changed) continue;
      const patch = auto ? { matched_sku_id: m.sku_id, sku_code: m.sku_code, raw }
        : model ? { matched_parent_sku_id: m.parent!.id, sku_code: m.parent!.code, raw }
        : { raw };
      const { error } = await admin.from("platform_order_items").update(patch).eq("id", r.id).is("matched_sku_id", null).is("matched_parent_sku_id", null);
      if (!error && (auto || model)) matched++;
    }
  }
  return { checked: rows.length, matched };
}

type OrderRow = { id: string; status: string; source: string | null; stock_deducted: boolean | null; order_no: string | null };

async function findOrder(admin: Admin, platformId: string, orderNo: string): Promise<(OrderRow & { items: number }) | null> {
  const { data } = await admin.from("platform_orders").select("id, status, source, stock_deducted, order_no")
    .eq("platform_id", platformId).eq("external_order_id", orderNo).maybeSingle();
  if (!data) return null;
  const { count } = await admin.from("platform_order_items").select("id", { count: "exact", head: true }).eq("order_id", (data as OrderRow).id);
  return { ...(data as OrderRow), items: count ?? 0 };
}

/** บันทึกรายการสินค้าของออเดอร์ + จับคู่ SKU → คืนจำนวนที่ยังรอคนยืนยัน */
async function insertItems(admin: Admin, orderId: string, platform: PlatformCode, items: readonly ParsedItem[]): Promise<{ pending: number }> {
  if (!items.length) return { pending: 0 };
  const matches = await matchItems(admin, platform, items);
  let pending = 0;
  const rows = items.map((it, i) => {
    const m = matches[i];
    const auto = AUTO_CONFIDENCE.includes(m.confidence);
    const model = m.confidence === "model" && m.parent ? m.parent : null;   // ยืนยันไว้ว่านับเป็นรุ่น (ไม่แยกสี)
    if (!auto && !model) pending++;
    return {
      order_id: orderId,
      sku_code: auto ? m.sku_code : model ? model.code : modelCodeFromTitle(it.title),
      matched_sku_id: auto ? m.sku_id : null,
      matched_parent_sku_id: model ? model.id : null,
      name: it.title,
      qty: it.qty,
      price: it.price,
      raw: {
        source: "email", platform_code: platform, variant: it.variant, item_key: itemKey(it.title, it.variant),
        model_code: modelCodeFromTitle(it.title), qty_known: it.qty_known,
        confidence: m.confidence, reason: m.reason, suggest_sku_id: m.suggest?.id ?? null, suggest_code: m.suggest?.code ?? null,
      },
    };
  });
  const { error } = await admin.from("platform_order_items").insert(rows);
  if (error) throw new Error(`บันทึกรายการสินค้าไม่สำเร็จ: ${error.message}`);
  return { pending };
}

function itemsSummary(p: ParsedEmail): string {
  const qty = p.items.reduce((a, it) => a + it.qty, 0);
  const amt = p.items.every((it) => it.price != null) ? p.items.reduce((a, it) => a + (it.price ?? 0) * it.qty, 0) : null;
  return `${p.items.length} รายการ ${qty.toLocaleString("th-TH")} ชิ้น${amt != null ? ` ${baht(amt)}` : ""}`;
}

/** อ่านเมล 1 ฉบับแล้วทำตามผล (ไม่เขียนกล่องเมล — ผู้เรียกเขียนเอง) */
export async function processParsed(
  admin: Admin,
  p: ParsedEmail,
  ctx: { messageId: string; receivedAt: string | null; from: string | null; shops: readonly ShopRule[]; platformIds: Partial<Record<PlatformCode, string>> },
): Promise<ProcessOutcome> {
  const res = (status: InboxStatus, note: string, order_id: string | null = null, created = false): ProcessOutcome => ({ status, note, order_id, kind: p.kind, created });

  if (!p.platform) return res("ignored", "ไม่ใช่เมลจาก Shopee/Lazada — ข้าม");
  if (p.kind === "other") return res("ignored", `เมลอื่นของ ${PLATFORM_LABEL[p.platform]} (ไม่ใช่ออเดอร์ใหม่/ยกเลิก/คืนเงิน) — ข้าม`);
  if (!isReadable(p)) return res("unreadable", `อ่านไม่ออก: ${p.problems.join(" · ") || "รูปแบบเมลไม่ตรงกับที่รู้จัก"}`);

  const platformId = ctx.platformIds[p.platform];
  if (!platformId) return res("attention", `ไม่พบแพลตฟอร์ม ${p.platform} ในระบบ`);

  if (p.kind === "return_requested") {
    const linked = p.order_no ? await findOrder(admin, platformId, p.order_no) : (p.ref_no ? await findOrder(admin, platformId, p.ref_no) : null);
    const stage = p.stage ? ` (${p.stage})` : "";
    const ref = p.ref_no ? ` เลขคำขอ ${p.ref_no}` : "";
    if (linked) return res("done", `คำขอคืนเงิน/คืนสินค้า${stage} ของออเดอร์ ${linked.order_no ?? p.order_no}${ref} — ยังไม่หักยอด จนกว่าคืนสำเร็จ`, linked.id);
    if (p.order_no) return res("done", `คำขอคืนเงิน/คืนสินค้า${stage} ของออเดอร์ ${p.order_no} — ยังไม่พบออเดอร์นี้ในระบบ (เมลชำระเงินอาจเก่ากว่าที่ดึงมา) · ยังไม่หักยอด`);
    return res("done", `คำขอคืนเงิน/คืนสินค้า${stage}${ref || " (ไม่มีเลขคำขอ)"} — เมลไม่บอกเลขออเดอร์และสินค้า จึงยังไม่หักยอด`);
  }

  const shop = shopBrand(ctx.shops, p.platform, p.shop_name);
  if (!shop.known) {
    return res("attention", p.shop_name
      ? `ชื่อร้านในเมล "${p.shop_name}" ยังไม่อยู่ในรายการร้าน — ถ้าเป็นร้านเรา เพิ่มในแท็บตั้งค่าแล้วกด "อ่านใหม่"`
      : "หาชื่อร้านในเมลไม่เจอ — ตรวจเมลนี้ว่าเป็นร้านเราไหม");
  }

  const orderNo = p.order_no as string;
  const existing = await findOrder(admin, platformId, orderNo);
  const lazNote = p.platform === "lazada" ? " (เมล Lazada ไม่บอกจำนวน/ราคา — นับรายการละ 1 ชิ้น)" : p.kind === "order_cod" ? " (เก็บเงินปลายทาง)" : "";

  if (p.kind === "order_cancelled") {
    if (existing) {
      // ออเดอร์ที่บันทึกไว้แต่ยังไม่มีรายการสินค้า (เช่น อ่านเมลรูปแบบเก่าพลาด) → เติมจากเมลยกเลิก
      let filled = "";
      if (existing.items === 0 && p.items.length) {
        await insertItems(admin, existing.id, p.platform, p.items);
        filled = ` · เติมรายการสินค้า ${itemsSummary(p)}`;
      }
      if (existing.status === "cancelled") return res("done", `ออเดอร์ ${orderNo} ยกเลิกอยู่แล้ว${filled}`, existing.id);
      if (existing.stock_deducted) return res("attention", `ออเดอร์ ${orderNo} ถูกยกเลิกบน ${PLATFORM_LABEL[p.platform]} แต่ใน ERP ตัดสต๊อกไปแล้ว — ไปกด "ยกเลิก" ที่หน้าออเดอร์จากแพลตฟอร์มเพื่อคืนสต๊อก`, existing.id);
      const { error } = await admin.from("platform_orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", existing.id);
      if (error) throw new Error(`ยกเลิกออเดอร์ไม่สำเร็จ: ${error.message}`);
      return res("done", `ยกเลิกออเดอร์ ${orderNo} แล้ว (ไม่นับในยอดขาย)${filled}`, existing.id);
    }
  } else if (existing) {
    if (existing.items > 0) return res("done", `มีออเดอร์ ${orderNo} อยู่แล้ว${existing.status === "cancelled" ? " (ยกเลิกแล้ว)" : ""} — ไม่บันทึกซ้ำ`, existing.id);
    const { pending } = await insertItems(admin, existing.id, p.platform, p.items);
    return res("done", `เติมรายการสินค้าให้ออเดอร์ ${orderNo} · ${itemsSummary(p)}${pending ? ` · รอยืนยันสินค้า ${pending} รายการ` : ""}`, existing.id);
  }

  // ออเดอร์ใหม่ (หรือเมลยกเลิกของออเดอร์ที่ยังไม่เคยเห็น → บันทึกเป็นยกเลิกไว้ กันเมลชำระเงินที่มาทีหลังนับเป็นยอดขาย)
  const status = p.kind === "order_cancelled" ? "cancelled" : "new";
  const itemsTotal = p.items.every((it) => it.price != null) ? p.items.reduce((a, it) => a + (it.price ?? 0) * it.qty, 0) : null;
  const { data: ins, error } = await admin.from("platform_orders").insert({
    platform_id: platformId, brand_id: shop.brand_id, source: "email", external_order_id: orderNo, order_no: orderNo,
    status, total: p.kind === "order_cancelled" ? null : (p.total ?? itemsTotal), currency: "THB",
    ordered_at: p.ordered_at ?? ctx.receivedAt,
    raw: { email: { message_id: ctx.messageId, kind: p.kind, shop_name: p.shop_name, from: ctx.from, subtotal: p.subtotal, shipping: p.shipping, total: p.total } },
  }).select("id").single();
  if (error || !ins) {
    // ชนกัน (อีกคำขอสร้างพร้อมกัน) → ถือว่ามีแล้ว
    const again = await findOrder(admin, platformId, orderNo);
    if (again) return res("done", `มีออเดอร์ ${orderNo} อยู่แล้ว — ไม่บันทึกซ้ำ`, again.id);
    throw new Error(`สร้างออเดอร์ไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
  }
  const orderId = (ins as { id: string }).id;
  const { pending } = await insertItems(admin, orderId, p.platform, p.items);
  if (status === "cancelled") return res("done", `บันทึกออเดอร์ ${orderNo} เป็น "ยกเลิก" · ${itemsSummary(p)} (ไม่นับในยอดขาย)`, orderId, true);
  return res("done", `สร้างออเดอร์ ${orderNo} · ${itemsSummary(p)}${lazNote}${pending ? ` · รอยืนยันสินค้า ${pending} รายการ` : ""}`, orderId, true);
}

/** เมลใหม่จากสคริปต์ Gmail: อ่าน → ทำ → เขียนกล่องเมล (message_id ซ้ำ = ข้าม) */
export async function processInbound(
  admin: Admin,
  msg: InboundMessage,
  ctx: { shops: readonly ShopRule[]; platformIds: Partial<Record<PlatformCode, string>> },
): Promise<ProcessOutcome & { duplicate?: boolean }> {
  const lines = emailLines({ html: msg.html, text: msg.text });
  return processLines(admin, msg.id, lines, { from: msg.from ?? null, subject: msg.subject ?? null, receivedAt: normalizeDate(msg.date) }, ctx);
}

/** อ่านจากบรรทัดที่เก็บไว้ (ใช้ทั้งเมลใหม่และปุ่ม "อ่านใหม่") แล้วบันทึกผลลง platform_email_inbox */
export async function processLines(
  admin: Admin,
  messageId: string,
  lines: string[],
  meta: { from: string | null; subject: string | null; receivedAt: string | null },
  ctx: { shops: readonly ShopRule[]; platformIds: Partial<Record<PlatformCode, string>> },
): Promise<ProcessOutcome> {
  const parsed = parsePlatformEmail({ from: meta.from, subject: meta.subject }, lines);
  let out: ProcessOutcome;
  try {
    out = await processParsed(admin, parsed, { messageId, receivedAt: meta.receivedAt, from: meta.from, shops: ctx.shops, platformIds: ctx.platformIds });
  } catch (e) {
    out = { status: "attention", note: `เกิดข้อผิดพลาด: ${e instanceof Error ? e.message : String(e)}`, order_id: null, kind: parsed.kind, created: false };
  }
  const row = {
    message_id: messageId, received_at: meta.receivedAt, from_addr: meta.from, subject: meta.subject,
    body_text: lines.join("\n").slice(0, 60000), platform_code: parsed.platform, kind: parsed.kind,
    external_order_id: parsed.order_no, ref_no: parsed.ref_no, shop_name: parsed.shop_name,
    parsed: { ...parsed }, status: out.status, note: out.note, order_id: out.order_id, updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("platform_email_inbox").upsert(row, { onConflict: "message_id" });
  if (error) console.error("[platform-email] เขียนกล่องเมลไม่สำเร็จ", error.message);
  return out;
}

function normalizeDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
