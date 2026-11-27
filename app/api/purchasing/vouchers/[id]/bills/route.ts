/**
 * ใบส่งของจากร้านขนส่ง (Delivery Bill) ของใบสำคัญรับ
 *   GET    /api/purchasing/vouchers/<id>/bills            → ใบส่งของของใบนี้ + ที่ใช้ร่วม (มีแถวชี้ใบนี้) + ไฟล์แนบตอนรับของ + ใบที่เลือกเป็นเจ้าของแถวได้
 *          ?pv=คำค้น                                       → ค้นใบสำคัญด้วยเลข PV (ช่อง "ของใบ" → ค้นหาใบอื่น)
 *   POST   { r2_key, gr_id? }                               → ให้ AI อ่านรูป → บันทึกเป็นใบส่งของ · เลขขนส่งซ้ำกับใบอื่น = ส่ง duplicates กลับไปถาม "ใช้ร่วมไหม"
 *   POST   { action:"claim", bill_id, rows[], drop_bill_id? } → รับแถวของบิลนั้นเข้าใบนี้ (ใช้ร่วม / กล่องที่พักไว้) · drop = เอาสำเนาซ้ำของใบนี้ออก
 *   PATCH  { bill_id, tracking_no?, bill_date?, lines?, apply?, expected_updated_at? } → แก้ค่า/จับคู่/เจ้าของแถว · apply = ใช้น้ำหนัก/คิว เฉพาะแถวของใบนี้
 *   POST   { action:"unapply", bill_id, before[] }        → ย้อน "ใช้น้ำหนัก/คิวให้อัตโนมัติ" หลังอ่าน (คืนคิว/กก.ต่อชิ้นเดิม + ล้างการจับคู่อัตโนมัติ)
 *   DELETE ?bill_id=                                        → ถอดใบส่งของ (ใช้ร่วมกับใบอื่น = แถวของใบนี้ไปพักไว้ บิลยังอยู่กับใบอื่น)
 * ★ 2026-11-23 แบบ A: อ่านใบใหม่แล้วชัด (ใบนี้มีใบส่งของใบเดียว + จับคู่กล่องได้ครบ) → จับคู่ + ใช้น้ำหนัก/คิวให้เลย (ข้อ 2) · ย้อนได้
 * ★ 2026-11-22 ใช้ร่วมหลายใบ — แต่ละแถวเลือกได้ว่าเป็นของใบไหน (lib/delivery-bill-share · ไม่เพิ่มตาราง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit, auditDiff } from "@/lib/audit";
import { parseDeliveryBillImage, applyDeliveryBill, normDate, loadDescriptionRules, methodForDescription, type DeliveryBillLine } from "@/lib/delivery-bill";
import { rowOwner, rowsOf, otherOwners, billStatusAfter, matchCopyRow } from "@/lib/delivery-bill-share";
import { autoMatchBoxes } from "@/lib/delivery-bill-check";
import { recomputeVoucher } from "@/lib/purchase-voucher-server";
import { isRefForCategory } from "@/lib/file-ref";
import { voucherEditable } from "@/lib/voucher-revision";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // AI อ่านรูปใช้เวลา

type Params = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "").trim();
const optNum = (v: unknown): number | null => (v === null || v === "" || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHARE_DAYS = 14;
const V_COLS = "id, pv_no, status, voucher_date, seller_name, seller_partner_id, carrier_id, is_active, editing_at";
type VOpt = { id: string; pv_no: string | null; status: string; voucher_date: string | null; seller_name: string | null; why: string };
const linesOf = (b: Row | null | undefined): DeliveryBillLine[] => (Array.isArray(b?.lines) ? (b!.lines as DeliveryBillLine[]) : []);
const shiftDay = (d: string, days: number) => { const t = new Date(`${d.slice(0, 10)}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10); };
/** เจ้าของแถวแต่ละแบบนับกี่แถว — ใช้ลงประวัติ (changes) ว่าย้ายแถวไปใบไหน/ลบกี่แถว */
const ownerSummary = (lines: DeliveryBillLine[], home: string): Row => {
  const s: Row = { rows: lines.length };
  for (const l of lines) { const k = l.hold ? `hold:${l.hold}` : `voucher:${rowOwner(l, home)}`; s[k] = (Number(s[k]) || 0) + 1; }
  return s;
};
const toVOpt = (v: Row, why: string): VOpt => ({ id: String(v.id), pv_no: (v.pv_no as string) ?? null, status: String(v.status ?? ""), voucher_date: (v.voucher_date as string) ?? null, seller_name: (v.seller_name as string) ?? null, why });

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.cost.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();

  // ค้นใบด้วยเลข PV (ช่อง "ของใบ" → ค้นหาใบอื่น)
  const pvq = str(request.nextUrl.searchParams.get("pv")).replace(/[%,()]/g, "");
  if (pvq) {
    const { data } = await admin.from("purchase_vouchers_v2").select(V_COLS).ilike("pv_no", `%${pvq}%`).neq("status", "cancelled").not("is_active", "is", false).order("voucher_date", { ascending: false }).limit(12);
    return NextResponse.json({ vouchers: ((data ?? []) as Row[]).filter((v) => String(v.id) !== id).map((v) => toVOpt(v, "search")), error: null });
  }

  const [{ data: me }, { data: own }, { data: shared }, { data: vls }] = await Promise.all([
    admin.from("purchase_vouchers_v2").select(V_COLS).eq("id", id).maybeSingle(),
    // เฉพาะใบส่งของบริษัทขนส่ง — บิลจากร้าน (kind=seller) อยู่ที่ /seller-bills
    admin.from("purchase_delivery_bills").select("*").eq("voucher_id", id).neq("kind", "seller").not("is_active", "is", false).order("created_at"),
    // ใช้ร่วม: บิลของใบอื่นที่มีแถวชี้มาใบนี้
    admin.from("purchase_delivery_bills").select("*").contains("lines", [{ for_voucher_id: id }]).neq("kind", "seller").not("is_active", "is", false).order("created_at"),
    admin.from("purchase_voucher_lines_v2").select("gr_id").eq("voucher_id", id).not("is_active", "is", false),
  ]);
  const bills = [...((own ?? []) as Row[]), ...((shared ?? []) as Row[]).filter((b) => String(b.voucher_id) !== id)];

  // ไฟล์แนบตอนรับของ (ใบรับของ/บิล) ของ GR ที่อยู่ในใบสำคัญนี้ — เอามาให้ AI อ่านได้เลย ไม่ต้องอัปโหลดซ้ำ
  const grIds = [...new Set(((vls ?? []) as Row[]).map((r) => String(r.gr_id ?? "")).filter(Boolean))];
  const candidates: { gr_id: string; gr_no: string; kind: "receipt" | "bill"; r2_key: string }[] = [];
  if (grIds.length) {
    const { data: grs } = await admin.from("goods_receipts_v2").select("id, gr_no, receipt_doc_r2_key, bill_doc_r2_key").in("id", grIds);
    for (const g of (grs ?? []) as Row[]) {
      if (g.receipt_doc_r2_key) candidates.push({ gr_id: String(g.id), gr_no: String(g.gr_no ?? ""), kind: "receipt", r2_key: String(g.receipt_doc_r2_key) });
      if (g.bill_doc_r2_key) candidates.push({ gr_id: String(g.id), gr_no: String(g.gr_no ?? ""), kind: "bill", r2_key: String(g.bill_doc_r2_key) });
    }
  }

  // ใบส่งของเลขขนส่งเดียวกันที่อยู่ในใบสำคัญอื่น (อัปโหลดซ้ำ) → ปุ่ม "ใช้ร่วมกับใบ…" (ข้อเสนอ 1)
  const ownIds = new Set(((own ?? []) as Row[]).map((b) => String(b.id)));
  const tracks = [...new Set(((own ?? []) as Row[]).map((b) => str(b.tracking_no).toUpperCase()).filter(Boolean))];
  let dupRows: Row[] = [];
  if (tracks.length) {
    const { data } = await admin.from("purchase_delivery_bills").select("id, tracking_no, voucher_id, created_at, lines, status").in("tracking_no", tracks).neq("kind", "seller").not("is_active", "is", false);
    dupRows = ((data ?? []) as Row[]).filter((b) => !ownIds.has(String(b.id)));
  }

  // ใบที่เลือกเป็นเจ้าของแถวได้: ใบที่อ้างถึงอยู่ · ใบที่มีใบส่งของเลขเดียวกัน · ใบใกล้กัน (ขนส่ง/ร้านเดียวกัน ±14 วัน)
  const refIds = new Set<string>();
  for (const b of bills) { refIds.add(String(b.voucher_id)); for (const l of linesOf(b)) if (l.for_voucher_id) refIds.add(String(l.for_voucher_id)); }
  for (const d of dupRows) refIds.add(String(d.voucher_id));
  refIds.delete(id);
  const vmap = new Map<string, VOpt>();
  if (refIds.size) {
    const { data } = await admin.from("purchase_vouchers_v2").select(V_COLS).in("id", [...refIds]);
    for (const v of (data ?? []) as Row[]) vmap.set(String(v.id), toVOpt(v, dupRows.some((d) => String(d.voucher_id) === String(v.id)) ? "same_tracking" : "linked"));
  }
  const m = me as Row | null;
  if (m?.voucher_date) {
    const d = String(m.voucher_date);
    let q = admin.from("purchase_vouchers_v2").select(V_COLS).gte("voucher_date", shiftDay(d, -SHARE_DAYS)).lte("voucher_date", shiftDay(d, SHARE_DAYS)).neq("status", "cancelled").not("is_active", "is", false).neq("id", id).limit(30);
    const ors = [m.carrier_id ? `carrier_id.eq.${m.carrier_id}` : "", m.seller_partner_id ? `seller_partner_id.eq.${m.seller_partner_id}` : ""].filter(Boolean);
    if (ors.length) q = q.or(ors.join(","));
    const { data } = await q;
    for (const v of (data ?? []) as Row[]) if (!vmap.has(String(v.id))) vmap.set(String(v.id), toVOpt(v, "nearby"));
  }
  const vouchers = [...vmap.values()].sort((a, b) => String(b.voucher_date ?? "").localeCompare(String(a.voucher_date ?? "")));
  const duplicates = dupRows.map((d) => ({ bill_id: String(d.id), tracking_no: str(d.tracking_no).toUpperCase(), voucher_id: String(d.voucher_id), pv_no: vmap.get(String(d.voucher_id))?.pv_no ?? null, created_at: String(d.created_at ?? ""), rows: linesOf(d).length,
    lines: linesOf(d).map((l, idx) => ({ idx, no: l.no ?? null, description: l.description, qty: l.qty, weight_kg: l.weight_kg, m3: l.m3, stock: l.stock ?? null, po_no: l.po_no ?? null, owner: rowOwner(l, String(d.voucher_id)), applied: !!l.applied_at || (d.status === "applied" && !linesOf(d).some((x) => x.applied_at)) })) }));

  // กล่องที่พักไว้ อาจเป็นของใบนี้ (ข้อเสนอ 4) — ใบนี้ยังไม่มีใบส่งของเลย · ช่วงวันใกล้กัน
  let parked: { bill_id: string; tracking_no: string | null; bill_date: string | null; voucher_id: string; pv_no: string | null; rows: { idx: number; no: number | null; description: string | null; qty: number | null; weight_kg: number | null; m3: number | null }[] }[] = [];
  if (bills.length === 0 && m?.voucher_date) {
    const d = String(m.voucher_date);
    const { data } = await admin.from("purchase_delivery_bills").select("id, tracking_no, bill_date, created_at, voucher_id, lines").contains("lines", [{ hold: "parked" }]).neq("kind", "seller").not("is_active", "is", false).order("created_at", { ascending: false }).limit(20);
    const near = ((data ?? []) as Row[]).filter((b) => { const bd = String(b.bill_date ?? b.created_at ?? "").slice(0, 10); return !bd || (bd >= shiftDay(d, -SHARE_DAYS) && bd <= shiftDay(d, 30)); });
    const homes = [...new Set(near.map((b) => String(b.voucher_id)).filter((x) => !vmap.has(x)))];
    if (homes.length) { const { data: hv } = await admin.from("purchase_vouchers_v2").select(V_COLS).in("id", homes); for (const v of (hv ?? []) as Row[]) vmap.set(String(v.id), toVOpt(v, "linked")); }
    parked = near.slice(0, 8).map((b) => ({ bill_id: String(b.id), tracking_no: (b.tracking_no as string) ?? null, bill_date: (b.bill_date as string) ?? null, voucher_id: String(b.voucher_id), pv_no: vmap.get(String(b.voucher_id))?.pv_no ?? null,
      rows: linesOf(b).map((l, idx) => ({ l, idx })).filter(({ l }) => l.hold === "parked").map(({ l, idx }) => ({ idx, no: l.no ?? null, description: l.description, qty: l.qty, weight_kg: l.weight_kg, m3: l.m3 })) }));
  }

  // กฎ Description (คิว/กก.) — หน้าเว็บใช้บอก "ตามกฎ" / ปุ่มจำกฎ (★ 2026-11-15)
  const rules = await loadDescriptionRules(admin);
  return NextResponse.json({ data: bills, candidates, rules, vouchers, duplicates, parked, me: m ? toVOpt(m, "self") : null, error: null });
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorName = (user?.user_metadata?.name as string) || user?.email || null;
  const { id } = await params;
  let body: { r2_key?: string; gr_id?: string | null; action?: string; bill_id?: string; rows?: unknown; add_rows?: unknown; drop_bill_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const { data: v } = await admin.from("purchase_vouchers_v2").select("id, status, editing_at, pv_no").eq("id", id).maybeSingle();
  if (!v) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });

  // ── ย้อน "ใช้น้ำหนัก/คิวให้อัตโนมัติ" (หลังอ่านใบส่งของ) ─────────────────────────
  if (body.action === "unapply") {
    if (!voucherEditable(v as { status: string; editing_at?: string | null })) return NextResponse.json({ error: "ใบสำคัญยืนยันแล้ว — กด แก้ไขใบ ก่อน" }, { status: 400 });
    const billId = str(body.bill_id);
    const before = (Array.isArray((body as { before?: unknown }).before) ? (body as { before: Row[] }).before : []).filter((x) => x && typeof x.id === "string");
    const { data: b } = await admin.from("purchase_delivery_bills").select("*").eq("id", billId).not("is_active", "is", false).maybeSingle();
    if (!b) return NextResponse.json({ error: "ไม่พบใบส่งของ" }, { status: 404 });
    const { data: vlIds } = await admin.from("purchase_voucher_lines_v2").select("id").eq("voucher_id", id);
    const mineIds = new Set(((vlIds ?? []) as Row[]).map((r) => String(r.id)));
    let restored = 0;
    for (const x of before) {
      if (!mineIds.has(String(x.id))) continue;
      const { error } = await admin.from("purchase_voucher_lines_v2").update({ kg_per_unit: optNum(x.kg_per_unit), cbm_per_unit: optNum(x.cbm_per_unit), ship_method: x.ship_method === "cube" || x.ship_method === "weight" ? x.ship_method : null }).eq("id", String(x.id)).eq("voucher_id", id);
      if (!error) restored++;
    }
    const home = String((b as Row).voucher_id);
    const lines = linesOf(b as Row).map((l) => (rowOwner(l, home) === id && l.auto ? { ...l, voucher_line_ids: [], applied_at: null, auto: false } : l));
    await admin.from("purchase_delivery_bills").update({ lines, status: billStatusAfter(lines, home), updated_at: new Date().toISOString() }).eq("id", billId);
    await recomputeVoucher(admin, id);
    await writeAudit(admin, { action: "update", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName,
      metadata: { note: "ย้อนการใช้น้ำหนัก/คิวอัตโนมัติจากใบส่งของ", delivery_bill: billId, lines_restored: restored } });
    return NextResponse.json({ ok: true, restored, error: null });
  }

  // ── รับแถวเข้าใบนี้ (ใช้ร่วมกับใบอื่น / กล่องที่พักไว้) ─────────────────────────
  if (body.action === "claim") {
    if (!voucherEditable(v as { status: string; editing_at?: string | null })) return NextResponse.json({ error: "ใบสำคัญยืนยันแล้ว — กด แก้ไขใบ ก่อน แล้วค่อยรับแถวเข้าใบ" }, { status: 400 });
    const billId = str(body.bill_id);
    const want = [...new Set((Array.isArray(body.rows) ? body.rows : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0))];
    // ★ 11-27 กล่องในใบซ้ำของใบนี้ที่ใบเดิมไม่มี (ใบเดิมลบไปแล้ว) → เพิ่มเข้าใบเดิมเป็นของใบนี้ (ต้องมี drop_bill_id)
    const addIdx = [...new Set((Array.isArray(body.add_rows) ? body.add_rows : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0))];
    if (!billId || want.length + addIdx.length === 0) return NextResponse.json({ error: "เลือกแถวที่เป็นของใบนี้ก่อน" }, { status: 400 });
    if (addIdx.length && !body.drop_bill_id) return NextResponse.json({ error: "เพิ่มกล่องได้เฉพาะตอนใช้ร่วม (ต้องมีใบซ้ำของใบนี้)" }, { status: 400 });
    const { data: b } = await admin.from("purchase_delivery_bills").select("*").eq("id", billId).neq("kind", "seller").not("is_active", "is", false).maybeSingle();
    if (!b) return NextResponse.json({ error: "ไม่พบใบส่งของ" }, { status: 404 });
    const home = String((b as Row).voucher_id);
    const lines = linesOf(b as Row).map((l) => ({ ...l }));
    if (want.some((i) => i >= lines.length)) return NextResponse.json({ error: "แถวไม่ตรงกับใบส่งของ — โหลดใหม่แล้วลองอีกครั้ง" }, { status: 409 });
    const taken = want.filter((i) => { const o = rowOwner(lines[i], home); return o && o !== id && !!lines[i].applied_at; });
    if (taken.length) return NextResponse.json({ error: `แถว ${taken.map((i) => lines[i].no ?? i + 1).join(", ")} ใบอื่นใช้น้ำหนัก/คิวไปแล้ว — ให้ใบนั้นเปลี่ยนเจ้าของแถวก่อน` }, { status: 409 });

    // สำเนาซ้ำของใบนี้ (อัปโหลดเลขขนส่งเดียวกัน) → ยกการจับคู่สินค้ามา แล้วเอาสำเนาออก
    let drop: Row | null = null;
    if (body.drop_bill_id) {
      const { data: dr } = await admin.from("purchase_delivery_bills").select("*").eq("id", str(body.drop_bill_id)).eq("voucher_id", id).neq("kind", "seller").not("is_active", "is", false).maybeSingle();
      if (!dr) return NextResponse.json({ error: "ไม่พบใบส่งของซ้ำของใบนี้" }, { status: 404 });
      if (str((dr as Row).tracking_no).toUpperCase() !== str((b as Row).tracking_no).toUpperCase()) return NextResponse.json({ error: "เลขขนส่งไม่ตรงกัน — ใช้ร่วมไม่ได้" }, { status: 400 });
      if (String((dr as Row).id) === billId) return NextResponse.json({ error: "เลือกใบส่งของคนละใบ" }, { status: 400 });
      drop = dr as Row;
    }
    const copyLines = drop ? linesOf(drop) : [];
    if (addIdx.some((i) => i >= copyLines.length || rowOwner(copyLines[i], id) !== id)) return NextResponse.json({ error: "กล่องที่จะเพิ่มไม่ตรงกับใบซ้ำ — โหลดใหม่แล้วลองอีกครั้ง" }, { status: 409 });
    const before = ownerSummary(lines, home);
    for (const i of want) {
      const l = lines[i];
      const wasMine = rowOwner(l, home) === id;
      const fromCopy = drop ? matchCopyRow(copyLines, l, i) : null;
      lines[i] = { ...l, hold: null, for_voucher_id: id === home ? null : id,
        voucher_line_ids: fromCopy?.voucher_line_ids?.length ? [...fromCopy.voucher_line_ids] : wasMine ? l.voucher_line_ids : [],
        method: l.method ?? fromCopy?.method ?? null, applied_at: wasMine ? l.applied_at ?? null : null };
    }
    // กล่องที่ใบเดิมไม่มี → ต่อท้ายใบเดิมเป็นของใบนี้ (ยกการจับคู่ + ใช้แล้ว ไปด้วย)
    for (const i of addIdx) { const l = copyLines[i]; lines.push({ ...l, hold: null, for_voucher_id: id === home ? null : id }); }
    const now = new Date().toISOString();
    const { error } = await admin.from("purchase_delivery_bills").update({ lines, status: billStatusAfter(lines, home), updated_at: now }).eq("id", billId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const after = ownerSummary(lines, home);
    await writeAudit(admin, { action: "update", entityType: "purchase_delivery_bills", entityId: billId, actorId: user?.id ?? null, actorName,
      metadata: { note: drop ? `ใช้ร่วม: ${(v as Row).pv_no ?? "ใบนี้"} รับ ${want.length} แถว${addIdx.length ? ` + เพิ่ม ${addIdx.length} กล่องที่ใบเดิมไม่มี` : ""} + เอาใบซ้ำออก` : `${(v as Row).pv_no ?? "ใบนี้"} รับ ${want.length} แถวเข้าใบ`, voucher_id: id, claimed_rows: want, added_rows: addIdx, dropped_copy: drop ? String(drop.id) : null, changes: auditDiff(before, after) } });
    if (drop) {
      await admin.from("purchase_delivery_bills").update({ is_active: false, updated_at: now }).eq("id", String(drop.id));
      await writeAudit(admin, { action: "delete", entityType: "purchase_delivery_bills", entityId: String(drop.id), actorId: user?.id ?? null, actorName,
        metadata: { note: "ใบส่งของซ้ำ — ใช้ร่วมกับใบเดิมแทน (เก็บไว้ ไม่ลบถาวร)", voucher_id: id, merged_into_bill: billId, tracking_no: (drop.tracking_no as string) ?? null } });
    }
    return NextResponse.json({ ok: true, claimed: want.length, added: addIdx.length, dropped: drop ? String(drop.id) : null, error: null });
  }

  // ── อ่านใบส่งของใหม่ด้วย AI ────────────────────────────────────────────────
  const r2Key = str(body.r2_key);
  if (!r2Key) return NextResponse.json({ error: "ไม่มีไฟล์" }, { status: 400 });
  // ที่อยู่ไฟล์กลาง: R2 key เดิม หรือไฟล์ Supabase ของหมวดบิลเท่านั้น (กันยัดไฟล์หมวดอื่นมาให้ AI อ่าน)
  if (!isRefForCategory(r2Key, "supplier_bills")) return NextResponse.json({ error: "ไฟล์แนบไม่ถูกต้อง — แนบไฟล์ใหม่อีกครั้ง" }, { status: 400 });
  try {
    const { parsed, raw } = await parseDeliveryBillImage(r2Key, admin, { request });
    // เลือกวิธีคิดค่าส่งของแต่ละกล่องจากกฎ Description (BOX → คิว, CLOTH BLOCK → น้ำหนัก) — แก้ทีหลังได้
    const rules = await loadDescriptionRules(admin);
    for (const l of parsed.lines) l.method = methodForDescription(l.description, rules);
    const { data: ins, error } = await admin.from("purchase_delivery_bills").insert({
      voucher_id: id, gr_id: body.gr_id || null, r2_key: r2Key,
      tracking_no: parsed.tracking_no, bill_date: parsed.bill_date, marking: parsed.marking, delivery_area: parsed.delivery_area, carrier_text: parsed.carrier_text,
      total_weight_kg: parsed.total_weight_kg, total_m3: parsed.total_m3, total_packages: parsed.total_packages,
      lines: parsed.lines, raw, status: "parsed", created_by: actorName,
    }).select("*").single();
    if (error || !ins) return NextResponse.json({ error: "บันทึกใบส่งของไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });
    await writeAudit(admin, { action: "create", entityType: "purchase_delivery_bills", entityId: String((ins as Row).id), actorId: user?.id ?? null, actorName, metadata: { voucher_id: id, tracking_no: parsed.tracking_no, lines: parsed.lines.length } });
    // ข้อเสนอ 1: เลขขนส่งนี้อยู่ในใบสำคัญอื่นแล้ว → ให้หน้าเว็บถาม "ใช้ร่วมกันไหม" (ใช้ร่วม = เอาใบที่เพิ่งอ่านออก แล้วรับแถวจากใบเดิม)
    let duplicates: { bill_id: string; voucher_id: string; pv_no: string | null; created_at: string }[] = [];
    const tn = str(parsed.tracking_no).toUpperCase();
    if (tn) {
      const { data: dups } = await admin.from("purchase_delivery_bills").select("id, voucher_id, created_at").eq("tracking_no", tn).neq("kind", "seller").not("is_active", "is", false).neq("id", String((ins as Row).id)).order("created_at");
      const dl = ((dups ?? []) as Row[]).filter((d) => String(d.voucher_id) !== id);
      if (dl.length) {
        const { data: dv } = await admin.from("purchase_vouchers_v2").select("id, pv_no").in("id", [...new Set(dl.map((d) => String(d.voucher_id)))]);
        const pv = new Map(((dv ?? []) as Row[]).map((x) => [String(x.id), (x.pv_no as string) ?? null]));
        duplicates = dl.map((d) => ({ bill_id: String(d.id), voucher_id: String(d.voucher_id), pv_no: pv.get(String(d.voucher_id)) ?? null, created_at: String(d.created_at ?? "") }));
      }
    }
    // ★ 2026-11-23 ข้อ 2: ชัด → จับคู่ + ใช้น้ำหนัก/คิวให้เลย — ใบนี้แก้ได้ · ไม่ซ้ำกับใบอื่น · ใบนี้ยังไม่มีใบส่งของอื่นที่มีกล่องของใบนี้ · จับคู่ได้ครบทุกกล่อง
    let auto: { applied: number; before: Row[] } | null = null;
    const newId = String((ins as Row).id);
    if (!duplicates.length && voucherEditable(v as { status: string; editing_at?: string | null }) && parsed.lines.length > 0) {
      const [{ data: ownB }, { data: shB }, { data: vls }] = await Promise.all([
        admin.from("purchase_delivery_bills").select("id").eq("voucher_id", id).neq("kind", "seller").not("is_active", "is", false).neq("id", newId).limit(1),
        admin.from("purchase_delivery_bills").select("id").contains("lines", [{ for_voucher_id: id }]).neq("kind", "seller").not("is_active", "is", false).limit(1),
        admin.from("purchase_voucher_lines_v2").select("id, qty, item_sku_id, kg_per_unit, cbm_per_unit, ship_method").eq("voucher_id", id).not("is_active", "is", false),
      ]);
      const vrows = (vls ?? []) as Row[];
      if (!((ownB ?? []) as Row[]).length && !((shB ?? []) as Row[]).length && vrows.length) {
        const r = autoMatchBoxes(vrows.map((l) => ({ id: String(l.id), label: "", qty: Number(l.qty) || 0, is_product: !!l.item_sku_id })),
          [{ id: newId, tracking_no: null, lines: parsed.lines.map((l) => ({ qty: l.qty, voucher_line_ids: [] })) }]);
        if (r.complete && r.matches.length) {
          const now = new Date().toISOString();
          const lines2: DeliveryBillLine[] = parsed.lines.map((l, i) => { const m = r.matches.find((x) => x.idx === i); return m ? { ...l, voucher_line_ids: m.line_ids, auto: true, applied_at: now } : l; });
          const before = vrows.map((l) => ({ id: String(l.id), kg_per_unit: l.kg_per_unit ?? null, cbm_per_unit: l.cbm_per_unit ?? null, ship_method: l.ship_method ?? null }));
          const n = await applyDeliveryBill(admin, id, { tracking_no: parsed.tracking_no, lines: lines2 });
          await admin.from("purchase_delivery_bills").update({ lines: lines2, status: billStatusAfter(lines2, id), applied_at: now, updated_at: now }).eq("id", newId);
          await writeAudit(admin, { action: "update", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName,
            metadata: { note: "อ่านใบส่งของแล้วจับคู่ + ใช้น้ำหนัก/คิวให้อัตโนมัติ (ใบส่งของใบเดียว จับคู่ครบ)", delivery_bill_applied: newId, lines_updated: n, auto: true, before } });
          auto = { applied: n, before };
        }
      }
    }
    return NextResponse.json({ ok: true, data: ins, duplicates, auto, error: null });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorName = (user?.user_metadata?.name as string) || user?.email || null;
  const { id } = await params;
  let body: { bill_id?: string; tracking_no?: string | null; bill_date?: string | null; lines?: unknown; apply?: boolean; expected_updated_at?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const billId = str(body.bill_id);
  if (!billId) return NextResponse.json({ error: "ไม่ระบุใบส่งของ" }, { status: 400 });
  const admin = supabaseAdmin();
  const [{ data: v }, { data: bill }] = await Promise.all([
    admin.from("purchase_vouchers_v2").select("id, status, editing_at").eq("id", id).maybeSingle(),
    admin.from("purchase_delivery_bills").select("*").eq("id", billId).not("is_active", "is", false).maybeSingle(),
  ]);
  if (!v || !bill) return NextResponse.json({ error: "ไม่พบใบส่งของ" }, { status: 404 });
  const b = bill as Row;
  const home = String(b.voucher_id);
  const oldLines = linesOf(b);
  // แก้ได้: ใบเจ้าของบิล หรือใบที่มีแถวอยู่ในบิลนี้ (ใช้ร่วม)
  if (home !== id && rowsOf(oldLines, home, id).length === 0) return NextResponse.json({ error: "ใบส่งของนี้ไม่มีแถวของใบนี้แล้ว — โหลดใหม่" }, { status: 409 });
  // ใช้ร่วมหลายใบ: กันบันทึกทับกัน (อีกใบเพิ่งแก้บิลเดียวกัน)
  if (body.expected_updated_at && b.updated_at && new Date(String(body.expected_updated_at)).getTime() !== new Date(String(b.updated_at)).getTime())
    return NextResponse.json({ error: "ใบส่งของนี้เพิ่งถูกแก้จากอีกหน้า/อีกใบ — กดโหลดใหม่แล้วแก้อีกครั้ง (ที่แก้ค้างไว้ยังไม่ถูกบันทึก)", stale: true }, { status: 409 });

  const patch: Row = {};
  if (body.tracking_no !== undefined) patch.tracking_no = str(body.tracking_no).toUpperCase() || null;
  if (body.bill_date !== undefined) patch.bill_date = normDate(body.bill_date);
  let lines: DeliveryBillLine[] | null = null;
  if (Array.isArray(body.lines)) {
    const raw = body.lines as Row[];
    // ใบที่ถูกเลือกเป็นเจ้าของแถวต้องมีจริง + ยังไม่ยกเลิก
    const ask = [...new Set(raw.map((l) => str(l.for_voucher_id)).filter((x) => x && x !== home))];
    if (ask.some((x) => !UUID.test(x))) return NextResponse.json({ error: "ใบสำคัญที่เลือกให้แถวไม่ถูกต้อง" }, { status: 400 });
    if (ask.length) {
      const { data: okv } = await admin.from("purchase_vouchers_v2").select("id, status").in("id", ask);
      const live = new Set(((okv ?? []) as Row[]).filter((x) => x.status !== "cancelled").map((x) => String(x.id)));
      const bad = ask.filter((x) => !live.has(x));
      if (bad.length) return NextResponse.json({ error: "ใบสำคัญที่เลือกให้แถวถูกยกเลิกหรือไม่มีแล้ว — เลือกใบอื่น" }, { status: 400 });
    }
    lines = raw.map((l) => {
      const hold = l.hold === "parked" || l.hold === "not_ours" ? l.hold : null;
      const fv = hold ? null : str(l.for_voucher_id);
      return {
        stock: str(l.stock) || null, po_no: str(l.po_no) || null, description: str(l.description) || null,
        pack: optNum(l.pack), package: str(l.package) || null, qty: optNum(l.qty), weight_kg: optNum(l.weight_kg), m3: optNum(l.m3),
        method: l.method === "cube" || l.method === "weight" ? l.method : null,
        voucher_line_ids: hold ? [] : Array.isArray(l.voucher_line_ids) ? (l.voucher_line_ids as unknown[]).map(String).filter(Boolean) : [],
        no: optNum(l.no),   // เลขบรรทัดบนกระดาษ — ติดแถวไว้แม้ลากย้าย (lib/bill-line-order)
        for_voucher_id: fv && fv !== home ? fv : null,
        hold,
        applied_at: hold ? null : typeof l.applied_at === "string" && l.applied_at ? l.applied_at : null,
        auto: !hold && l.auto === true && Array.isArray(l.voucher_line_ids) && l.voucher_line_ids.length > 0,
      };
    });
    patch.lines = lines;
    patch.total_weight_kg = lines.some((l) => l.weight_kg != null) ? Math.round(lines.reduce((a, l) => a + (l.weight_kg ?? 0), 0) * 10000) / 10000 : null;
    patch.total_m3 = lines.some((l) => l.m3 != null) ? Math.round(lines.reduce((a, l) => a + (l.m3 ?? 0), 0) * 10000) / 10000 : null;
  }
  let applied = 0;
  const now = new Date().toISOString();
  if (body.apply) {
    if (!voucherEditable(v as { status: string; editing_at?: string | null })) return NextResponse.json({ error: "ใบสำคัญยืนยันแล้ว ใส่น้ำหนัก/คิวเพิ่มไม่ได้ (กด แก้ไขใบ ก่อน)" }, { status: 400 });
    const useLines = (lines ?? oldLines).map((l) => ({ ...l }));
    // ใช้เฉพาะแถวของใบนี้ — แถวของใบอื่น/พักไว้ ไม่ลงใบนี้
    const mine = rowsOf(useLines, home, id);
    if (!mine.some((i) => (useLines[i].voucher_line_ids ?? []).length > 0)) return NextResponse.json({ error: "แถวของใบนี้ยังไม่ได้จับคู่สินค้าเลย" }, { status: 400 });
    applied = await applyDeliveryBill(admin, id, { tracking_no: (patch.tracking_no as string | null) ?? (b.tracking_no as string | null) ?? null, lines: mine.map((i) => useLines[i]) });
    for (const i of mine) if ((useLines[i].voucher_line_ids ?? []).length > 0) useLines[i].applied_at = now;
    lines = useLines;
    patch.lines = useLines;
    patch.applied_at = now;
  }
  if (lines) patch.status = billStatusAfter(lines, home);
  patch.updated_at = now;
  const { data: upd, error } = await admin.from("purchase_delivery_bills").update(patch).eq("id", billId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // ประวัติ: ลบ/เพิ่มแถว · ย้ายแถวไปใบอื่น/พักไว้/ไม่ใช่ของเรา · ใช้น้ำหนัก/คิว
  if (lines) {
    const before = ownerSummary(oldLines, home), after = ownerSummary(lines, home);
    const changes = auditDiff(before, after);
    if (changes.length) await writeAudit(admin, { action: "update", entityType: "purchase_delivery_bills", entityId: billId, actorId: user?.id ?? null, actorName,
      metadata: { note: "แก้แถวใบส่งของ (ลบ/เพิ่ม/เปลี่ยนว่าเป็นของใบไหน)", voucher_id: id, tracking_no: (patch.tracking_no as string) ?? (b.tracking_no as string) ?? null, changes } });
  }
  if (body.apply) await writeAudit(admin, { action: "update", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName, metadata: { delivery_bill_applied: billId, lines_updated: applied, shared_bill: home !== id } });
  return NextResponse.json({ ok: true, data: upd, applied, error: null });
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorName = (user?.user_metadata?.name as string) || user?.email || null;
  const { id } = await params;
  const billId = str(request.nextUrl.searchParams.get("bill_id"));
  if (!billId) return NextResponse.json({ error: "ไม่ระบุใบส่งของ" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: bill } = await admin.from("purchase_delivery_bills").select("*").eq("id", billId).not("is_active", "is", false).maybeSingle();
  if (!bill) return NextResponse.json({ error: "ไม่พบใบส่งของ" }, { status: 404 });
  const b = bill as Row;
  const home = String(b.voucher_id);
  const lines = linesOf(b);
  const now = new Date().toISOString();
  const parkMine = (ls: DeliveryBillLine[], who: string) => ls.map((l) => (rowOwner(l, home) === who ? { ...l, hold: "parked" as const, for_voucher_id: null, voucher_line_ids: [], applied_at: null } : l));

  if (home !== id) {
    // ใช้ร่วม: ถอดเฉพาะใบนี้ → แถวของใบนี้ไปพักไว้ (บิลยังอยู่กับใบเจ้าของ)
    if (rowsOf(lines, home, id).length === 0) return NextResponse.json({ error: "ใบส่งของนี้ไม่มีแถวของใบนี้แล้ว" }, { status: 409 });
    const next = parkMine(lines, id);
    const { error } = await admin.from("purchase_delivery_bills").update({ lines: next, status: billStatusAfter(next, home), updated_at: now }).eq("id", billId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAudit(admin, { action: "update", entityType: "purchase_delivery_bills", entityId: billId, actorId: user?.id ?? null, actorName,
      metadata: { note: "ถอดใบส่งของออกจากใบนี้ — แถวของใบนี้ไปพักไว้", voucher_id: id, changes: auditDiff(ownerSummary(lines, home), ownerSummary(next, home)) } });
    return NextResponse.json({ ok: true, detached: true, error: null });
  }
  const others = otherOwners(lines, home);
  if (others.length) {
    // เจ้าของบิลถอด แต่ใบอื่นยังมีแถว → ยกบิลให้ใบอื่นเป็นเจ้าของ · แถวของใบนี้ไปพักไว้
    const newHome = others[0];
    const next = parkMine(lines, id).map((l) => (l.for_voucher_id === newHome ? { ...l, for_voucher_id: null } : l));
    const { error } = await admin.from("purchase_delivery_bills").update({ voucher_id: newHome, lines: next, status: billStatusAfter(next, newHome), updated_at: now }).eq("id", billId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAudit(admin, { action: "update", entityType: "purchase_delivery_bills", entityId: billId, actorId: user?.id ?? null, actorName,
      metadata: { note: "ถอดใบส่งของออกจากใบนี้ — ใบอื่นยังใช้ร่วม จึงย้ายเจ้าของบิลไปใบนั้น", voucher_id: id, new_home: newHome, changes: auditDiff({ voucher_id: id }, { voucher_id: newHome }) } });
    return NextResponse.json({ ok: true, detached: true, error: null });
  }
  const { error } = await admin.from("purchase_delivery_bills").update({ is_active: false, updated_at: now }).eq("id", billId).eq("voucher_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, { action: "delete", entityType: "purchase_delivery_bills", entityId: billId, actorId: user?.id ?? null, actorName, metadata: { note: "ถอดใบส่งของ (เก็บไว้ ไม่ลบถาวร)", voucher_id: id, tracking_no: (b.tracking_no as string) ?? null } });
  return NextResponse.json({ ok: true, error: null });
}
