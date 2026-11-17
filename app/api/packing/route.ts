/**
 * 📦 สถานีแพ็คสินค้า — /api/packing   (docs/packing-station.md · กติกา lib/packing)
 *
 * GET  ?code=<รหัสที่ยิง>   (packing.pack) → { order, items, box, gate, sessions } — ค้นจาก เลขออเดอร์ / เลขพัสดุ / เลขแพ็กเกจ / เลขพัสดุขนส่งของเรา
 * GET  ?boxes=1             (packing.pack) → { boxes } ทะเบียนกล่อง (parcel_sizes ที่เปิดใช้)
 * POST { action:"start", order_id, scanned_code?, station? }                      (packing.pack) → { session }
 * POST { action:"finish", session_id, status: done|problem|abandoned, box_used?, box_suggested?, checks?, problem?, problem_note?, finish_method?, clip? }
 *        done = บันทึก platform_orders.packed_at/packed_by (ช่องของเราเอง) · ไม่ตัดสต๊อก ไม่ส่งอะไรไปร้านค้า
 *
 * ช่วงทดลอง: คลิปเก็บในเครื่องโต๊ะแพ็ค (clip.store = "local") — ฐานข้อมูลเก็บแค่ขนาด/ความยาว/ลายนิ้วมือไฟล์ · เชื่อม NAS ทีหลัง (§13)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { cleanScanCode, packGate, suggestBox, PACK_FINISH_STATUSES, PACK_PROBLEMS, FINISH_METHODS, type BoxSize, type PackFinishStatus } from "@/lib/packing";

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

async function lookup(admin: Admin, rawCode: string) {
  const code = cleanScanCode(rawCode);
  if (!code) return NextResponse.json({ error: "รหัสที่ยิงมาอ่านไม่ออก ลองยิงใหม่" }, { status: 400 });
  const order = await findOrder(admin, code);
  if (!order) return NextResponse.json({ error: `ไม่พบออเดอร์ "${code}" — อาจยังไม่ดึงเข้าระบบ (Shopee ดึงทุก 15 นาที) หรือยิงบาร์โค้ดผิดตัว`, not_found: true }, { status: 404 });
  const orderId = String(order.id);

  const [{ data: itemRows }, { data: platform }, { data: sessRows }, { data: packer }] = await Promise.all([
    admin.from("platform_order_items").select("id, sku_code, name, qty, matched_sku_id, matched_parent_sku_id").eq("order_id", orderId),
    order.platform_id ? admin.from("erp_platforms").select("code, name_th").eq("id", String(order.platform_id)).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("packing_sessions").select("id, status, packer_name, started_at, finished_at, duration_sec, box_used, problem").eq("order_id", orderId).order("started_at", { ascending: false }).limit(5),
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "packing.pack"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  if (sp.get("boxes") === "1") {
    const { data, error } = await admin.from("parcel_sizes").select("id, name, width_cm, length_cm, height_cm").not("is_active", "is", false).order("name");
    if (error) return NextResponse.json({ boxes: [], error: "โหลดรายการกล่องไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ boxes: data ?? [], error: null });
  }
  return lookup(admin, sp.get("code") ?? "");
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

  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}
