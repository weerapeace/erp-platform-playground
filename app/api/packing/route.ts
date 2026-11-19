/**
 * 📦 สถานีแพ็คสินค้า — /api/packing   (docs/packing-station.md · กติกา lib/packing)
 *
 * GET  ?code=<รหัสที่ยิง>   (packing.pack) → { order, items, box, gate, sessions } — ค้นจาก เลขออเดอร์ / เลขพัสดุ / เลขแพ็กเกจ / เลขพัสดุขนส่งของเรา
 * GET  ?order_id=<id>       (packing.pack) → เหมือน ?code= แต่เปิดจากคิว (เลือกแทนการยิง — กรณีเครื่องยิงเสีย)
 * GET  ?boxes=1             (packing.pack) → { boxes } ทะเบียนกล่อง (parcel_sizes ที่เปิดใช้)
 * GET  ?queue=1             (packing.pack) → { queue } ออเดอร์รอแพ็ค (ยังไม่แพ็ค · จ่ายแล้ว · ไม่ยกเลิก) + ใครกำลังแพ็คอยู่
 * GET  ?today=1             (packing.pack) → { sessions, me } บันทึกการแพ็ควันนี้ (เวลาไทย) + แก้ได้ไหม
 * POST { action:"start", order_id, scanned_code?, station? }                      (packing.pack) → { session }
 * POST { action:"finish", session_id, status: done|problem|abandoned, box_used?, box_suggested?, checks?, problem?, problem_note?, finish_method?, clip? }
 *        done = บันทึก platform_orders.packed_at/packed_by (ช่องของเราเอง) · ไม่ตัดสต๊อก ไม่ส่งอะไรไปร้านค้า
 * POST { action:"reopen", session_id }  → ยกเลิกบันทึกนั้น (voided · เก็บประวัติ) แล้วเปิดออเดอร์กลับมาแพ็คใหม่ · { order_id }
 * POST { action:"edit", session_id, status?: done|problem|voided, box_used?, problem?, problem_note? } → แก้บันทึก
 *        สิทธิ์แก้: คนแพ็คเจ้าของบันทึก ภายในวันเดียวกัน · packing.manage แก้ได้ทุกใบ (lib/packing canEditPackSession) · audit ทุกครั้ง
 *
 * ช่วงทดลอง: คลิปเก็บในเครื่องโต๊ะแพ็ค (clip.store = "local") — ฐานข้อมูลเก็บแค่ขนาด/ความยาว/ลายนิ้วมือไฟล์ · เชื่อม NAS ทีหลัง (§13)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import {
  cleanScanCode, packGate, suggestBox, canEditPackSession, packedFromSessions, PACK_FINISH_STATUSES, PACK_PROBLEMS, FINISH_METHODS, PACK_EDIT_STATUSES, PACK_LOCK_MINUTES,
  type BoxSize, type PackFinishStatus, type PackEditStatus,
} from "@/lib/packing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;

const ORDER_COLS = "id, platform_id, brand_id, external_order_id, order_no, customer_name, status, platform_status, ship_by_at, tracking_no, package_no, carrier, cod_amount, source, packed_at, packed_by, shipping, raw->>buyer_message, shopee_note:raw->shopee->>message_to_seller, raw->>note";
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

async function whoAmI(request: Request, admin: Admin): Promise<{ id: string | null; name: string | null }> {
  try {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    if (!user) return { id: null, name: null };
    const { data } = await admin.from("user_profiles").select("display_name, username, email").eq("id", user.id).maybeSingle();
    const p = data as { display_name?: string; username?: string; email?: string } | null;
    return { id: user.id, name: p?.display_name || p?.username || p?.email || user.email || null };
  } catch { return { id: null, name: null }; }
}

async function findOrder(admin: Admin, code: string): Promise<Row | null> {
  const variants = [...new Set([code, code.toUpperCase()])];
  const ors = variants.flatMap((c) => [`order_no.eq."${c}"`, `external_order_id.eq."${c}"`, `tracking_no.eq."${c}"`, `package_no.eq."${c}"`]).join(",");
  const { data } = await admin.from("platform_orders").select(ORDER_COLS).or(ors).order("created_at", { ascending: false }).limit(5);
  let rows = (data ?? []) as Row[];
  if (!rows.length) {
    // เลขพัสดุจากการจองขนส่งของเราเอง (ช่องทาง LINE/แชต) อยู่ใน shipping.trackingCode
    const { data: s } = await admin.from("platform_orders").select(ORDER_COLS).in("shipping->>trackingCode", variants).limit(5);
    rows = (s ?? []) as Row[];
  }
  if (!rows.length) return null;
  // ซ้ำหลายใบ = เลือกใบที่มาจาก API ก่อนใบจากเมล (ออเดอร์จากเมลเป็นรายงานยอดขาย)
  return rows.find((r) => r.source !== "email") ?? rows[0];
}

async function lookup(admin: Admin, rawCode: string, orderId0?: string | null) {
  let order: Row | null = null;
  let code = "";
  if (orderId0) {
    const { data } = await admin.from("platform_orders").select(ORDER_COLS).eq("id", orderId0).maybeSingle();
    order = (data as Row | null) ?? null;
    if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์นี้แล้ว — ลองรีเฟรชคิว", not_found: true }, { status: 404 });
    code = String(order.order_no ?? order.external_order_id ?? "");
  } else {
    code = cleanScanCode(rawCode);
    if (!code) return NextResponse.json({ error: "รหัสที่ยิงมาอ่านไม่ออก ลองยิงใหม่" }, { status: 400 });
    order = await findOrder(admin, code);
    if (!order) return NextResponse.json({ error: `ไม่พบออเดอร์ "${code}" — อาจยังไม่ดึงเข้าระบบ (Shopee ดึงทุก 15 นาที) หรือยิงบาร์โค้ดผิดตัว`, not_found: true }, { status: 404 });
  }
  const orderId = String(order.id);

  const [{ data: itemRows }, { data: platform }, { data: sessRows }, { data: packer }] = await Promise.all([
    admin.from("platform_order_items").select("id, sku_code, name, qty, matched_sku_id, matched_parent_sku_id").eq("order_id", orderId),
    order.platform_id ? admin.from("erp_platforms").select("code, name_th").eq("id", String(order.platform_id)).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("packing_sessions").select("id, status, packer_id, packer_name, started_at, finished_at, duration_sec, box_used, problem").eq("order_id", orderId).order("started_at", { ascending: false }).limit(5),
    order.packed_by ? admin.from("user_profiles").select("display_name, username").eq("id", String(order.packed_by)).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const items = (itemRows ?? []) as Row[];

  const skuIds = [...new Set(items.map((i) => str(i.matched_sku_id)).filter((x): x is string => !!x))];
  const { data: skuRows } = skuIds.length
    ? await admin.from("skus_v2").select("id, code, barcode, color_th, color, cover_image_r2_key, parent_sku_id").in("id", skuIds)
    : { data: [] };
  const skus = new Map(((skuRows ?? []) as Row[]).map((s) => [String(s.id), s]));
  const parentIds = [...new Set([
    ...items.map((i) => str(i.matched_parent_sku_id)),
    ...[...skus.values()].map((s) => str(s.parent_sku_id)),
  ].filter((x): x is string => !!x))];
  const parentOnly = [...new Set(items.filter((i) => !i.matched_sku_id && i.matched_parent_sku_id).map((i) => String(i.matched_parent_sku_id)))];
  const [{ data: parentRows }, { data: siblingRows }] = await Promise.all([
    parentIds.length ? admin.from("parent_skus_v2").select("id, code, name_th, sku_name, cover_image_r2_key, parcel_size_id, pack_note, pack_flags").in("id", parentIds) : Promise.resolve({ data: [] }),
    // สินค้าระดับรุ่น (ไม่รู้สี) — ยิงสีไหนของรุ่นนั้นก็นับ
    parentOnly.length ? admin.from("skus_v2").select("code, barcode, parent_sku_id").in("parent_sku_id", parentOnly).limit(500) : Promise.resolve({ data: [] }),
  ]);
  const parents = new Map(((parentRows ?? []) as Row[]).map((p) => [String(p.id), p]));
  const sizeIds = [...new Set([...parents.values()].map((p) => str(p.parcel_size_id)).filter((x): x is string => !!x))];
  const { data: sizeRows } = sizeIds.length ? await admin.from("parcel_sizes").select("id, name, width_cm, length_cm, height_cm").in("id", sizeIds) : { data: [] };
  const sizes = new Map(((sizeRows ?? []) as Row[]).map((s) => [String(s.id), s as unknown as BoxSize & { id: string }]));

  const notes: { text: string; flags: string[]; parent: string }[] = [];
  const seenNote = new Set<string>();
  const outItems = items.map((i) => {
    const sku = i.matched_sku_id ? skus.get(String(i.matched_sku_id)) : undefined;
    const parentId = str(sku?.parent_sku_id) ?? str(i.matched_parent_sku_id);
    const parent = parentId ? parents.get(parentId) : undefined;
    const box = parent?.parcel_size_id ? sizes.get(String(parent.parcel_size_id)) ?? null : null;
    const codes = new Set<string>();
    for (const c of [sku?.barcode, sku?.code, i.sku_code]) if (c) codes.add(String(c));
    if (!sku && parentId) for (const s of (siblingRows ?? []) as Row[]) if (String(s.parent_sku_id) === parentId) { if (s.barcode) codes.add(String(s.barcode)); if (s.code) codes.add(String(s.code)); }
    if (parent && (parent.pack_note || (parent.pack_flags as string[] | null)?.length) && !seenNote.has(String(parent.id))) {
      seenNote.add(String(parent.id));
      notes.push({ text: String(parent.pack_note ?? ""), flags: (parent.pack_flags as string[] | null) ?? [], parent: String(parent.code ?? "") });
    }
    return {
      id: String(i.id),
      name: str(i.name) ?? str(parent?.sku_name) ?? str(parent?.name_th) ?? "",
      shop_code: str(i.sku_code),
      sku_code: str(sku?.code),
      color: str(sku?.color_th) ?? str(sku?.color),
      qty: Math.max(1, Math.round(Number(i.qty) || 1)),
      image_key: str(sku?.cover_image_r2_key) ?? str(parent?.cover_image_r2_key),
      matched: !!sku,
      level: sku ? "sku" : parentId ? "parent" : "none",
      box: box ? box.name : null,
      codes: [...codes],
    };
  });
  const box = suggestBox(outItems.map((it) => {
    const s = [...sizes.values()].find((z) => z.name === it.box);
    return s ?? null;
  }));
  const missingBox = outItems.some((it) => !it.box);
  const packedByName = (packer as { display_name?: string; username?: string } | null)?.display_name ?? (packer as { username?: string } | null)?.username ?? null;
  const buyerNote = str(order.buyer_message) ?? str(order.shopee_note) ?? str(order.note);

  return NextResponse.json({
    order: {
      id: orderId,
      order_no: str(order.order_no) ?? str(order.external_order_id),
      platform: str((platform as Row | null)?.name_th) ?? str((platform as Row | null)?.code),
      platform_code: str((platform as Row | null)?.code),
      customer_name: str(order.customer_name),
      status: String(order.status ?? "new"),
      platform_status: str(order.platform_status),
      ship_by_at: str(order.ship_by_at),
      tracking_no: str(order.tracking_no) ?? str((order.shipping as Row | null)?.trackingCode),
      package_no: str(order.package_no),
      carrier: str(order.carrier),
      cod_amount: Number(order.cod_amount) || 0,
      packed_at: str(order.packed_at),
      packed_by_name: packedByName,
      buyer_note: buyerNote,
    },
    items: outItems,
    box: box ? { name: box.name, width_cm: box.width_cm, length_cm: box.length_cm, height_cm: box.height_cm } : null,
    missing_box: missingBox,
    notes,
    gate: packGate({ status: String(order.status ?? ""), platform_status: str(order.platform_status), packed_at: str(order.packed_at), packed_by_name: packedByName }),
    sessions: sessRows ?? [],
    scanned_code: code,
    error: null,
  });
}

// ── คิวรอแพ็ค (เลือกแทนการยิง · รอบ 3) ──
// ต้องแพ็ค = ยังไม่ส่ง/ไม่ยกเลิก · ลูกค้าจ่ายแล้ว (ไม่นับ UNPAID/ON_HOLD) · ไม่ใช่ออเดอร์จากเมล · ยังไม่มีบันทึกแพ็คเสร็จ
async function queue(admin: Admin) {
  const { data, error } = await admin.from("platform_orders")
    .select("id, platform_id, order_no, external_order_id, tracking_no, package_no, ship_by_at, status, platform_status, cod_amount, shipping")
    .in("status", ["new", "confirmed", "packed"]).is("packed_at", null)
    .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())   // ใบเก่ากว่า 30 วันที่ค้าง "ใหม่" (เช่น Lazada ทดสอบเดือน 7) ไม่ใช่งานแพ็ค
    .or("source.is.null,source.neq.email")
    .or("platform_status.is.null,platform_status.not.in.(UNPAID,ON_HOLD)")
    .order("ship_by_at", { ascending: true, nullsFirst: false }).limit(300);
  if (error) return NextResponse.json({ queue: [], error: "โหลดคิวรอแพ็คไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const orders = (data ?? []) as Row[];
  const ids = orders.map((o) => String(o.id));
  const items: Row[] = [];
  const locks: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const [{ data: it }, { data: lk }] = await Promise.all([
      admin.from("platform_order_items").select("order_id, sku_code, name, qty, matched_sku_id, matched_parent_sku_id").in("order_id", part),
      admin.from("packing_sessions").select("order_id, packer_id, packer_name, station, started_at").eq("status", "packing").in("order_id", part)
        .gte("started_at", new Date(Date.now() - PACK_LOCK_MINUTES * 60_000).toISOString()),
    ]);
    items.push(...((it ?? []) as Row[]));
    locks.push(...((lk ?? []) as Row[]));
  }
  // กล่องแนะนำ = กล่องใหญ่สุดของสินค้าในออเดอร์ (สินค้าแม่ → parcel_sizes)
  const skuIds = [...new Set(items.map((i) => str(i.matched_sku_id)).filter((x): x is string => !!x))];
  const skuParent = new Map<string, string>();
  for (let i = 0; i < skuIds.length; i += 200) {
    const { data: sk } = await admin.from("skus_v2").select("id, parent_sku_id").in("id", skuIds.slice(i, i + 200));
    for (const s of (sk ?? []) as Row[]) if (s.parent_sku_id) skuParent.set(String(s.id), String(s.parent_sku_id));
  }
  const parentIds = [...new Set([...items.map((i) => str(i.matched_parent_sku_id)), ...skuParent.values()].filter((x): x is string => !!x))];
  const parentBox = new Map<string, string>();
  for (let i = 0; i < parentIds.length; i += 200) {
    const { data: ps } = await admin.from("parent_skus_v2").select("id, parcel_size_id").in("id", parentIds.slice(i, i + 200));
    for (const p of (ps ?? []) as Row[]) if (p.parcel_size_id) parentBox.set(String(p.id), String(p.parcel_size_id));
  }
  const sizeIds = [...new Set(parentBox.values())];
  const { data: sizeRows } = sizeIds.length ? await admin.from("parcel_sizes").select("id, name, width_cm, length_cm, height_cm").in("id", sizeIds) : { data: [] };
  const sizes = new Map(((sizeRows ?? []) as Row[]).map((s) => [String(s.id), s as unknown as BoxSize]));
  const { data: plats } = await admin.from("erp_platforms").select("id, code, name_th");
  const plat = new Map(((plats ?? []) as Row[]).map((p) => [String(p.id), { code: str(p.code), name: str(p.name_th) ?? str(p.code) }]));

  const byOrder = new Map<string, Row[]>();
  for (const it of items) { const k = String(it.order_id); (byOrder.get(k) ?? byOrder.set(k, []).get(k)!).push(it); }
  const lockBy = new Map<string, Row>();
  for (const l of locks) { const k = String(l.order_id); const prev = lockBy.get(k); if (!prev || String(l.started_at) > String(prev.started_at)) lockBy.set(k, l); }

  const out = orders.map((o) => {
    const its = byOrder.get(String(o.id)) ?? [];
    const boxes = its.map((i) => {
      const pid: string | null = (i.matched_sku_id ? skuParent.get(String(i.matched_sku_id)) : undefined) ?? str(i.matched_parent_sku_id);
      const sid = pid ? parentBox.get(pid) : undefined;
      return sid ? sizes.get(sid) ?? null : null;
    });
    const lk = lockBy.get(String(o.id));
    const p = o.platform_id ? plat.get(String(o.platform_id)) : undefined;
    return {
      id: String(o.id),
      order_no: str(o.order_no) ?? str(o.external_order_id),
      platform: p?.name ?? null, platform_code: p?.code ?? null,
      tracking_no: str(o.tracking_no) ?? str((o.shipping as Row | null)?.trackingCode),
      package_no: str(o.package_no),
      ship_by_at: str(o.ship_by_at),
      platform_status: str(o.platform_status),
      cod: (Number(o.cod_amount) || 0) > 0,
      qty: its.reduce((a, i) => a + Math.max(1, Math.round(Number(i.qty) || 1)), 0),
      items: its.slice(0, 4).map((i) => ({ code: str(i.sku_code), name: str(i.name), qty: Math.max(1, Math.round(Number(i.qty) || 1)) })),
      box: suggestBox(boxes)?.name ?? null,
      lock: lk ? { packer_id: str(lk.packer_id), packer_name: str(lk.packer_name), station: str(lk.station), started_at: String(lk.started_at) } : null,
    };
  });
  return NextResponse.json({ queue: out, error: null });
}

// ── บันทึกการแพ็ควันนี้ (เวลาไทย) — แก้ / ยกเลิก / แพ็คใหม่ ได้ตามสิทธิ์ ──
async function today(request: Request, admin: Admin) {
  const me = await whoAmI(request, admin);
  const manager = await apiCan(request, "packing.manage");
  const now = Date.now();
  const start = new Date(Date.UTC(new Date(now + 7 * 3600_000).getUTCFullYear(), new Date(now + 7 * 3600_000).getUTCMonth(), new Date(now + 7 * 3600_000).getUTCDate()) - 7 * 3600_000).toISOString();
  const { data, error } = await admin.from("packing_sessions")
    .select("id, order_id, status, packer_id, packer_name, station, started_at, finished_at, duration_sec, box_used, box_suggested, problem, problem_note, clip, edited_at, platform_orders(order_no, external_order_id)")
    .gte("started_at", start).in("status", ["done", "problem", "voided"]).order("started_at", { ascending: false }).limit(300);
  if (error) return NextResponse.json({ sessions: [], error: "โหลดบันทึกวันนี้ไม่สำเร็จ" }, { status: 500 });
  const sessions = ((data ?? []) as Row[]).map((r) => {
    const po = (Array.isArray(r.platform_orders) ? r.platform_orders[0] : r.platform_orders) as Row | null;
    return {
      id: String(r.id), order_id: String(r.order_id), order_no: str(po?.order_no) ?? str(po?.external_order_id),
      status: String(r.status), packer_id: str(r.packer_id), packer_name: str(r.packer_name), station: str(r.station),
      started_at: String(r.started_at), finished_at: str(r.finished_at), duration_sec: Number(r.duration_sec) || 0,
      box_used: str(r.box_used), box_suggested: str(r.box_suggested), problem: str(r.problem), problem_note: str(r.problem_note),
      has_clip: !!r.clip, edited_at: str(r.edited_at),
      can_edit: canEditPackSession({ packer_id: str(r.packer_id), started_at: String(r.started_at), status: String(r.status) }, { id: me.id, manager }, now),
    };
  });
  return NextResponse.json({ sessions, me: { id: me.id, manager }, error: null });
}

/** หลังแก้/ยกเลิกบันทึก → คำนวณ "แพ็คแล้วเมื่อไหร่" ของออเดอร์ใหม่จากบันทึกทั้งหมด (ไม่มีเสร็จ = กลับเข้าคิว) */
async function syncPackedAt(admin: Admin, orderId: string) {
  const { data } = await admin.from("packing_sessions").select("status, finished_at, packer_id").eq("order_id", orderId);
  const p = packedFromSessions(((data ?? []) as Row[]).map((r) => ({ status: String(r.status), finished_at: str(r.finished_at), packer_id: str(r.packer_id) })));
  await admin.from("platform_orders").update(p).eq("id", orderId);
}

async function loadEditable(request: Request, admin: Admin, sessionId: string | null, me: { id: string | null }) {
  if (!sessionId) return { error: NextResponse.json({ error: "ไม่ได้ระบุบันทึกที่จะแก้" }, { status: 400 }) };
  const { data } = await admin.from("packing_sessions").select("id, order_id, status, packer_id, started_at, box_used, problem, problem_note").eq("id", sessionId).maybeSingle();
  const s = data as Row | null;
  if (!s) return { error: NextResponse.json({ error: "ไม่พบบันทึกการแพ็คนี้" }, { status: 404 }) };
  const manager = await apiCan(request, "packing.manage");
  if (!canEditPackSession({ packer_id: str(s.packer_id), started_at: String(s.started_at), status: String(s.status) }, { id: me.id, manager })) {
    return { error: NextResponse.json({ error: s.status === "packing" ? "บันทึกนี้ยังแพ็คอยู่ — จบก่อนค่อยแก้" : "แก้ได้เฉพาะบันทึกของตัวเองภายในวันนี้ (หัวหน้าแก้ได้ทุกใบ)" }, { status: 403 }) };
  }
  return { s };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "packing.pack"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  if (sp.get("boxes") === "1") {
    const { data, error } = await admin.from("parcel_sizes").select("id, name, width_cm, length_cm, height_cm").not("is_active", "is", false).order("name");
    if (error) return NextResponse.json({ boxes: [], error: "โหลดรายการกล่องไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ boxes: data ?? [], error: null });
  }
  if (sp.get("queue") === "1") return queue(admin);
  if (sp.get("today") === "1") return today(request, admin);
  return lookup(admin, sp.get("code") ?? "", sp.get("order_id"));
}

const clipMeta = (v: unknown): Row | null => {
  if (!v || typeof v !== "object") return null;
  const c = v as Row;
  return {
    store: c.store === "local" ? "local" : "local",   // ช่วงทดลองมีแบบเดียว · NAS เพิ่มทีหลัง
    local_id: str(c.local_id)?.slice(0, 80) ?? null,
    size: Math.max(0, Math.round(Number(c.size) || 0)),
    duration_sec: Math.max(0, Math.round((Number(c.duration_sec) || 0) * 10) / 10),
    mime: str(c.mime)?.slice(0, 60) ?? null,
    sha256: typeof c.sha256 === "string" && /^[0-9a-f]{64}$/i.test(c.sha256) ? c.sha256.toLowerCase() : null,
    snapshot: c.snapshot === true,
  };
};

const checksMeta = (v: unknown): Row => {
  if (!v || typeof v !== "object") return {};
  const c = v as Row;
  const lines = Array.isArray(c.lines) ? (c.lines as Row[]).slice(0, 100).map((l) => ({
    id: str(l.id), qty: Number(l.qty) || 0, scanned: Number(l.scanned) || 0, manual: Number(l.manual) || 0, reason: str(l.reason)?.slice(0, 120) ?? null,
  })) : [];
  return { lines, wrong_scans: Array.isArray(c.wrong_scans) ? (c.wrong_scans as unknown[]).slice(0, 50).map((x) => String(x).slice(0, 64)) : [], over_scans: Number(c.over_scans) || 0 };
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "packing.pack"); if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as Row;
  const admin = supabaseAdmin();
  const me = await whoAmI(request, admin);

  if (body.action === "start") {
    const orderId = str(body.order_id);
    if (!orderId) return NextResponse.json({ error: "ไม่ได้ระบุออเดอร์" }, { status: 400 });
    const { data: o } = await admin.from("platform_orders").select("id, status, platform_status").eq("id", orderId).maybeSingle();
    if (!o) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
    const gate = packGate({ status: String((o as Row).status ?? ""), platform_status: str((o as Row).platform_status) });
    if (gate.level === "block") return NextResponse.json({ error: gate.reasons[0] }, { status: 409 });
    // บันทึก "กำลังแพ็ค" ค้างของคนเดิมในออเดอร์นี้ (รีเฟรช/เน็ตหลุด) = ปิดเป็นข้าม ไม่ให้คิวโชว์ว่ายังแพ็คอยู่
    if (me.id) await admin.from("packing_sessions").update({ status: "abandoned", updated_at: new Date().toISOString() }).eq("order_id", orderId).eq("packer_id", me.id).eq("status", "packing");
    const { data, error } = await admin.from("packing_sessions").insert({
      order_id: orderId, scanned_code: cleanScanCode(String(body.scanned_code ?? "")) || null,
      packer_id: me.id, packer_name: me.name, station: str(body.station)?.slice(0, 60) ?? null,
    }).select("id, started_at").single();
    if (error) return NextResponse.json({ error: "เริ่มบันทึกการแพ็คไม่สำเร็จ ลองยิงใหม่" }, { status: 500 });
    return NextResponse.json({ session: data, error: null });
  }

  if (body.action === "finish") {
    const id = str(body.session_id);
    const status = String(body.status ?? "") as PackFinishStatus;
    if (!id || !PACK_FINISH_STATUSES.includes(status)) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    const { data: s } = await admin.from("packing_sessions").select("id, order_id, status, started_at").eq("id", id).maybeSingle();
    const sess = s as Row | null;
    if (!sess) return NextResponse.json({ error: "ไม่พบบันทึกการแพ็คนี้" }, { status: 404 });
    if (sess.status !== "packing") return NextResponse.json({ ok: true, already: true, error: null });   // ส่งซ้ำ (เน็ตกระตุก) = ไม่บันทึกซ้ำ
    const now = new Date();
    const problem = PACK_PROBLEMS.some((p) => p.key === body.problem) ? String(body.problem) : null;
    const method = (FINISH_METHODS as readonly string[]).includes(String(body.finish_method)) ? String(body.finish_method) : null;
    const patch: Row = {
      status, finished_at: now.toISOString(), updated_at: now.toISOString(),
      duration_sec: Math.max(0, Math.round((now.getTime() - new Date(String(sess.started_at)).getTime()) / 1000)),
      box_used: str(body.box_used)?.slice(0, 60) ?? null, box_suggested: str(body.box_suggested)?.slice(0, 60) ?? null,
      checks: checksMeta(body.checks), checked_at: str(body.checked_at),
      problem: status === "problem" ? (problem ?? "other") : null,
      problem_note: status === "problem" ? (str(body.problem_note)?.slice(0, 500) ?? null) : null,
      finish_method: method, clip: clipMeta(body.clip),
    };
    const { error } = await admin.from("packing_sessions").update(patch).eq("id", id).eq("status", "packing");
    if (error) return NextResponse.json({ error: "บันทึกการแพ็คไม่สำเร็จ" }, { status: 500 });
    if (status === "done") {
      await admin.from("platform_orders").update({ packed_at: now.toISOString(), packed_by: me.id }).eq("id", String(sess.order_id));
    }
    if (status !== "abandoned") {
      await writeAudit(admin, {
        action: status === "done" ? "packing.done" : "packing.problem", entityType: "platform_orders", entityId: String(sess.order_id),
        actorId: me.id, actorName: me.name,
        metadata: { session_id: id, duration_sec: patch.duration_sec, box_used: patch.box_used, box_suggested: patch.box_suggested, problem: patch.problem, problem_note: patch.problem_note, finish_method: method },
      });
    }
    return NextResponse.json({ ok: true, duration_sec: patch.duration_sec, error: null });
  }

  if (body.action === "reopen") {
    const r = await loadEditable(request, admin, str(body.session_id), me);
    if (r.error) return r.error;
    const s = r.s!;
    const now = new Date().toISOString();
    if (s.status !== "voided") {
      const { error } = await admin.from("packing_sessions").update({ status: "voided", edited_at: now, edited_by: me.id, updated_at: now }).eq("id", String(s.id));
      if (error) return NextResponse.json({ error: "ยกเลิกบันทึกเดิมไม่สำเร็จ" }, { status: 500 });
      await syncPackedAt(admin, String(s.order_id));
      await writeAudit(admin, {
        action: "packing.reopen", entityType: "platform_orders", entityId: String(s.order_id), actorId: me.id, actorName: me.name,
        metadata: { session_id: s.id, changes: auditDiff({ status: s.status }, { status: "voided" }), reason: str(body.reason)?.slice(0, 200) ?? "เปิดกลับมาแพ็คใหม่" },
      });
    }
    return NextResponse.json({ ok: true, order_id: String(s.order_id), error: null });
  }

  if (body.action === "edit") {
    const r = await loadEditable(request, admin, str(body.session_id), me);
    if (r.error) return r.error;
    const s = r.s!;
    const patch: Row = {};
    if (body.status !== undefined) {
      if (!(PACK_EDIT_STATUSES as readonly string[]).includes(String(body.status))) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
      patch.status = String(body.status) as PackEditStatus;
    }
    if (body.box_used !== undefined) patch.box_used = str(body.box_used)?.slice(0, 60) ?? null;
    const status = String(patch.status ?? s.status);
    if (status === "problem") {
      if (body.problem !== undefined) patch.problem = PACK_PROBLEMS.some((p) => p.key === body.problem) ? String(body.problem) : "other";
      else if (!s.problem) patch.problem = "other";
      if (body.problem_note !== undefined) patch.problem_note = str(body.problem_note)?.slice(0, 500) ?? null;
    } else if (status === "done") { patch.problem = null; patch.problem_note = null; }
    const changes = auditDiff(s, patch);
    if (!changes.length) return NextResponse.json({ ok: true, unchanged: true, error: null });
    const now = new Date().toISOString();
    const { error } = await admin.from("packing_sessions").update({ ...patch, edited_at: now, edited_by: me.id, updated_at: now }).eq("id", String(s.id));
    if (error) return NextResponse.json({ error: "บันทึกการแก้ไม่สำเร็จ" }, { status: 500 });
    if (patch.status !== undefined) await syncPackedAt(admin, String(s.order_id));
    await writeAudit(admin, {
      action: "packing.edit", entityType: "platform_orders", entityId: String(s.order_id), actorId: me.id, actorName: me.name,
      metadata: { session_id: s.id, changes },
    });
    return NextResponse.json({ ok: true, error: null });
  }

  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}
