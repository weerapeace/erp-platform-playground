/**
 * /api/sku-swatches — 🎨 Swatch = รูปแผ่นตัวอย่าง (การ์ดสีผ้า/ด้าย/อะไหล่) + ชิ้นบนรูป (รหัสภายใน · ผูก SKU ได้)
 * (แท็บ Swatch ในหน้า /master/skus)
 *
 *   GET    ?search=&family_ids=&limit=&offset=   → รายการแผ่น (ปก + จำนวนรูป/ชิ้น/ที่ผูกแล้ว + ชื่อแท็ก) · ค้นได้ทั้งชื่อแผ่น รหัสแผ่น/ชิ้น ชื่อสี เลขบนแผง SKU
 *   GET    ?id=<uuid>                             → แผ่นเดียว + รูปทั้งหมด + ชิ้นทั้งหมด + ข้อมูล SKU ของแต่ละชิ้น
 *   GET    ?sku_id=<uuid>                         → SKU นี้อยู่บนแผ่นไหน ตรงไหน (ลิงก์ย้อนกลับในหน้า SKU)
 *   POST   { name?, note?, code?, family_tag_ids?, images: [{image_key,image_w,image_h}], spots?: Spot[] }   → สร้างแผ่นใหม่
 *          (รุ่นเก่า: image_key/image_w/image_h ตัวเดียว ยังรับ)
 *   PATCH  { id, name?, note?, family_tag_ids?, images?, spots? }
 *          images = รูป "ทั้งชุด" ตามลำดับ (มี id = รูปเดิม · ไม่มี id = รูปใหม่ · id เดิมที่ไม่ส่ง = ลบ พร้อมชิ้นบนรูปนั้น) · ตัวแรก = ปก
 *          spots  = ชิ้น "ทั้งแผ่น" (มี id = แก้ · ไม่มี id = เพิ่ม · id เดิมที่ไม่ส่ง = ลบ) · image_index = ลำดับรูปใน images ที่ส่งมา (ไม่ส่ง images = ลำดับรูปปัจจุบัน)
 *   DELETE ?id=                                   → ลบแผ่น (รูป/ชิ้นลบตาม cascade · SKU ไม่กระทบ · ไฟล์รูปใน R2 ไม่ลบ)
 *
 * รหัส: แผ่น = SW-0001 (ของกลาง erp_next_number key "sku_swatch" หรือพิมพ์เอง) · ชิ้น = รหัสแผ่น-01 ออกที่นี่เท่านั้น (เลขไม่ใช้ซ้ำ — next_chip_no)
 * ตำแหน่งชิ้นเป็น % ของรูปที่ชิ้นนั้นอยู่ (0-100) · sku_id ว่างได้ = ยังไม่ผูก
 * สิทธิ์: products.view (อ่าน) / products.edit (เขียน) + audit log ของกลาง
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { loadSkuStock } from "@/lib/sku-stock";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit, auditChangeMeta } from "@/lib/audit";
import { chipCode, cleanBoardCode, isHex, sortReadingOrder } from "@/lib/sku-swatch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SwatchImage = { id: string; image_key: string; image_w: number | null; image_h: number | null; sort_order: number };
export type SwatchSpot = {
  id: string; x: number; y: number; w: number; h: number; label: string | null; sort_order: number;
  /** รูปที่ชิ้นนี้อยู่ (null = รูปแรก) + key ของรูปนั้น (ใช้ตัดรูปชิ้นไปโชว์) */
  image_id: string | null; image_key: string | null;
  /** รหัสภายใน SW-0001-01 · ชื่อสี · สีจริง #rrggbb · มาจาก AI หรือทำเอง */
  code: string | null; name: string | null; color_hex: string | null; source: "manual" | "ai";
  sku_id: string | null;
  sku: { id: string; code: string; name: string; image: string | null; image_key: string | null; uom: string | null; color: string | null; qty_on_hand: number | null; is_active: boolean } | null;
};
export type SwatchCard = {
  id: string; name: string | null; note: string | null; seq: number; code: string | null;
  /** ปก (= รูปแรก) */
  image_key: string | null; image_w: number | null; image_h: number | null; image_count: number;
  family_tag_ids: string[]; tags: { id: string; name: string }[];
  spot_count: number; linked_count: number;
  created_at: string; updated_at: string;
};
export type SwatchDetail = SwatchCard & { images: SwatchImage[]; spots: SwatchSpot[]; next_chip_no: number };
/** ตำแหน่งของ SKU บนแผ่น swatch (1 แถว = 1 ชิ้น) — image_key = รูปที่ชิ้นอยู่ */
export type SkuSwatchLink = { swatch_id: string; swatch_name: string; image_key: string | null; spot_id: string; label: string | null; code: string | null; x: number; y: number; w: number; h: number };

type Admin = ReturnType<typeof supabaseAdmin>;
type SwatchRow = { id: string; name: string | null; note: string | null; code: string | null; next_chip_no: number | null; image_key: string | null; image_w: number | null; image_h: number | null; family_tag_ids: unknown; created_at: string; updated_at: string };
type SpotRow = { id: string; swatch_id: string; sku_id: string | null; image_id: string | null; x: number | string; y: number | string; w: number | string; h: number | string; label: string | null; sort_order: number; code: string | null; name: string | null; color_hex: string | null; source: string | null };
type ImageRow = { id: string; swatch_id: string; image_key: string; image_w: number | null; image_h: number | null; sort_order: number };

const COLS = "id, name, note, code, next_chip_no, image_key, image_w, image_h, family_tag_ids, created_at, updated_at";
const SPOT_COLS = "id, swatch_id, sku_id, image_id, x, y, w, h, label, sort_order, code, name, color_hex, source";
const IMG_COLS = "id, swatch_id, image_key, image_w, image_h, sort_order";
const UUID = /^[0-9a-f-]{36}$/i;
const tagIdsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter((s) => UUID.test(s)) : []);
const clamp = (n: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(n) || 0));
const r2 = (n: number) => Math.round(n * 100) / 100;
const txt = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const posInt = (v: unknown) => (Number(v) > 0 ? Math.round(Number(v)) : null);

async function actorOf(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}
async function tagNames(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  const { data } = await admin.from("product_families").select("id, name").in("id", ids);
  for (const t of (data ?? []) as { id: string; name: string | null }[]) m.set(t.id, t.name ?? "แท็ก");
  return m;
}
/** ลำดับ "Swatch #n" = ลำดับที่สร้าง (เก่าสุด = #1) — ใช้เป็นชื่อเมื่อไม่ได้ตั้งชื่อ */
async function seqMap(admin: Admin): Promise<Map<string, number>> {
  const { data } = await admin.from("sku_swatches").select("id").eq("is_active", true).order("created_at", { ascending: true });
  const m = new Map<string, number>();
  ((data ?? []) as { id: string }[]).forEach((r, i) => m.set(r.id, i + 1));
  return m;
}
const titleOf = (name: string | null, code: string | null, seq: number | undefined) => name?.trim() || code || `Swatch #${seq ?? ""}`;
const friendlyDbError = (msg: string) => (/sku_swatches_code_uq/.test(msg) ? "รหัสแผ่นนี้มีอยู่แล้ว ลองรหัสอื่น" : /sku_swatch_spots_code_uq/.test(msg) ? "รหัสชิ้นซ้ำกับแผ่นอื่น ลองบันทึกใหม่อีกครั้ง" : msg);

/** ชิ้นที่ส่งมาจากหน้าจอ → แถวที่บันทึกได้ (ยังไม่มีรหัส/รูป) */
function parseSpot(p: Record<string, unknown>, i: number) {
  const x = r2(clamp(p.x, 0, 100)), y = r2(clamp(p.y, 0, 100));
  const w = r2(clamp(p.w, 0.5, 100 - x)), h = r2(clamp(p.h, 0.5, 100 - y));   // ไม่ให้ล้นขอบรูป
  return {
    id: typeof p.id === "string" && UUID.test(p.id) ? p.id : null,
    sku_id: typeof p.sku_id === "string" && UUID.test(p.sku_id) ? p.sku_id : null,
    image_index: Number.isInteger(Number(p.image_index)) && Number(p.image_index) >= 0 ? Number(p.image_index) : null,
    image_id: typeof p.image_id === "string" && UUID.test(p.image_id) ? p.image_id : null,
    x, y, w, h, label: txt(p.label, 30), name: txt(p.name, 60),
    color_hex: isHex(p.color_hex) ? p.color_hex.toLowerCase() : null,
    source: p.source === "ai" ? "ai" : "manual",
    sort_order: i,
  };
}
type ParsedSpot = ReturnType<typeof parseSpot>;

/** ออกรหัสให้ชิ้นใหม่ตามลำดับ รูป → อ่านแบบหนังสือ · คืนเลขชิ้นถัดไป */
function assignCodes<T extends ParsedSpot & { image_id: string | null; code?: string | null }>(spots: T[], boardCode: string, nextNo: number, imageOrder: string[]): number {
  const need = spots.filter((s) => !s.code);
  const byImage = new Map<string, T[]>();
  for (const s of need) { const k = s.image_id ?? ""; byImage.set(k, [...(byImage.get(k) ?? []), s]); }
  const order = [...byImage.keys()].sort((a, b) => imageOrder.indexOf(a) - imageOrder.indexOf(b));
  let no = nextNo;
  for (const k of order) for (const s of sortReadingOrder(byImage.get(k) ?? [])) s.code = chipCode(boardCode, no++);
  return no;
}

async function boardCodeFor(admin: Admin, wanted: unknown): Promise<string> {
  const custom = cleanBoardCode(wanted);
  if (custom) return custom;
  const { data, error } = await admin.rpc("erp_next_number", { p_key: "sku_swatch" });
  if (error || !data) throw new Error(error?.message ?? "ออกรหัสแผ่นไม่สำเร็จ");
  return String(data);
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const admin = supabaseAdmin();
  const id = (sp.get("id") ?? "").trim();

  // ───── รหัสแผ่นถัดไป (ตัวอย่างในป๊อปเพิ่มแผ่น · ยังไม่จองเลข) ─────
  if (sp.get("next_code")) {
    const { data: rule } = await admin.from("erp_numbering_rules").select("pattern, current_value").eq("key", "sku_swatch").maybeSingle();
    const r = rule as { pattern: string; current_value: number | null } | null;
    const code = r ? r.pattern.replace(/\{(0+)\}/, (_, z: string) => String((r.current_value ?? 0) + 1).padStart(z.length, "0")) : null;
    return NextResponse.json({ code, error: null });
  }

  // ───── SKU นี้อยู่บนแผ่นไหนบ้าง ─────
  const bySku = (sp.get("sku_id") ?? "").trim();
  if (bySku) {
    if (!UUID.test(bySku)) return NextResponse.json({ data: [], error: "sku_id ไม่ถูกต้อง" }, { status: 400 });
    const { data: spotRows, error: spErr } = await admin.from("sku_swatch_spots").select(SPOT_COLS).eq("sku_id", bySku).order("created_at");
    if (spErr) return NextResponse.json({ data: [], error: spErr.message }, { status: 500 });
    const spots = (spotRows ?? []) as unknown as SpotRow[];
    if (spots.length === 0) return NextResponse.json({ data: [], error: null });
    const imgIds = [...new Set(spots.map((p) => p.image_id).filter((x): x is string => !!x))];
    const [{ data: heads }, seq, { data: imgs }] = await Promise.all([
      admin.from("sku_swatches").select("id, name, code, image_key").in("id", [...new Set(spots.map((p) => p.swatch_id))]).eq("is_active", true),
      seqMap(admin),
      imgIds.length ? admin.from("sku_swatch_images").select("id, image_key").in("id", imgIds) : Promise.resolve({ data: [] }),
    ]);
    const headMap = new Map(((heads ?? []) as { id: string; name: string | null; code: string | null; image_key: string | null }[]).map((h) => [h.id, h]));
    const imgMap = new Map(((imgs ?? []) as { id: string; image_key: string }[]).map((i) => [i.id, i.image_key]));
    const data: SkuSwatchLink[] = spots.filter((p) => headMap.has(p.swatch_id)).map((p) => {
      const h = headMap.get(p.swatch_id)!;
      return {
        swatch_id: h.id, swatch_name: titleOf(h.name, h.code, seq.get(h.id)), image_key: (p.image_id && imgMap.get(p.image_id)) || h.image_key,
        spot_id: p.id, label: p.label, code: p.code, x: Number(p.x), y: Number(p.y), w: Number(p.w), h: Number(p.h),
      };
    });
    return NextResponse.json({ data, error: null });
  }

  // ───── แผ่นเดียว + รูป + ชิ้น ─────
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    const { data: row } = await admin.from("sku_swatches").select(COLS).eq("id", id).eq("is_active", true).maybeSingle();
    if (!row) return NextResponse.json({ error: "ไม่พบแผ่น swatch นี้" }, { status: 404 });
    const s = row as unknown as SwatchRow;
    const [{ data: spotRows }, { data: imgRows }] = await Promise.all([
      admin.from("sku_swatch_spots").select(SPOT_COLS).eq("swatch_id", id).order("sort_order").order("created_at"),
      admin.from("sku_swatch_images").select(IMG_COLS).eq("swatch_id", id).order("sort_order").order("created_at"),
    ]);
    const spots = (spotRows ?? []) as unknown as SpotRow[];
    let images = ((imgRows ?? []) as unknown as ImageRow[]).map((i) => ({ id: i.id, image_key: i.image_key, image_w: i.image_w, image_h: i.image_h, sort_order: i.sort_order }));
    if (images.length === 0 && s.image_key) images = [{ id: "", image_key: s.image_key, image_w: s.image_w, image_h: s.image_h, sort_order: 0 }];   // กันข้อมูลก่อนย้ายโครง
    const imgKey = new Map(images.map((i) => [i.id, i.image_key]));
    const skuIds = [...new Set(spots.map((p) => p.sku_id).filter((x): x is string => !!x))];
    const skuMap = new Map<string, NonNullable<SwatchSpot["sku"]>>();
    if (skuIds.length) {
      const [skuRes, balRes] = await Promise.all([
        admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key, color, is_active, uom:uoms!uom_id(name)").in("id", skuIds),
        loadSkuStock(admin, skuIds),
      ]);
      const stock = new Map<string, number>([...balRes].map(([id, s]) => [id, s.onHand]));
      for (const k of (skuRes.data ?? []) as unknown as { id: string; code: string; name_th: string | null; cover_image_r2_key: string | null; color: string | null; is_active: boolean | null; uom: { name: string | null } | { name: string | null }[] | null }[]) {
        const uomRow = Array.isArray(k.uom) ? k.uom[0] : k.uom;
        skuMap.set(k.id, {
          id: k.id, code: k.code, name: k.name_th ?? "", color: k.color ?? null, is_active: k.is_active !== false,
          image_key: k.cover_image_r2_key ?? null, uom: uomRow?.name ?? null,
          image: k.cover_image_r2_key ? `/api/r2-image?key=${encodeURIComponent(k.cover_image_r2_key)}` : null,
          qty_on_hand: stock.has(k.id) ? (stock.get(k.id) as number) : null,
        });
      }
    }
    const tids = tagIdsOf(s.family_tag_ids);
    const [names, seq] = await Promise.all([tagNames(admin, tids), seqMap(admin)]);
    const cover = images[0] ?? null;
    const detail: SwatchDetail = {
      id: s.id, name: s.name, note: s.note, seq: seq.get(s.id) ?? 0, code: s.code, next_chip_no: s.next_chip_no ?? 1,
      image_key: cover?.image_key ?? s.image_key, image_w: cover?.image_w ?? s.image_w, image_h: cover?.image_h ?? s.image_h, image_count: images.length,
      family_tag_ids: tids, tags: tids.map((t) => ({ id: t, name: names.get(t) ?? "แท็ก" })),
      spot_count: spots.length, linked_count: spots.filter((p) => p.sku_id && skuMap.has(p.sku_id)).length,
      created_at: s.created_at, updated_at: s.updated_at,
      images,
      spots: spots.map((p) => ({
        id: p.id, x: Number(p.x), y: Number(p.y), w: Number(p.w), h: Number(p.h), label: p.label, sort_order: p.sort_order,
        image_id: p.image_id, image_key: (p.image_id && imgKey.get(p.image_id)) || cover?.image_key || null,
        code: p.code, name: p.name, color_hex: p.color_hex, source: p.source === "ai" ? "ai" : "manual",
        sku_id: p.sku_id, sku: p.sku_id ? (skuMap.get(p.sku_id) ?? null) : null,
      })),
    };
    return NextResponse.json({ swatch: detail, error: null });
  }

  // ───── รายการแผ่น ─────
  const search = (sp.get("search") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 60)));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));
  const familyIds = (sp.get("family_ids") ?? "").split(",").map((x) => x.trim()).filter((x) => UUID.test(x));

  let q = admin.from("sku_swatches").select(COLS).eq("is_active", true).order("created_at", { ascending: false });
  if (familyIds.length) q = q.or(familyIds.map((f) => `family_tag_ids.cs.["${f}"]`).join(","));   // หลายแท็ก = OR เหมือนหน้า SKU
  const { data: all, error } = await q.limit(2000);
  if (error) return NextResponse.json({ swatches: [], total: 0, error: error.message }, { status: 500 });
  let rows = (all ?? []) as unknown as SwatchRow[];
  const seq = await seqMap(admin);

  // ชิ้น + รูปของทุกแผ่น (นับ + ใช้ค้นด้วยรหัสชิ้น/ชื่อสี/เลขบนแผง/รหัส-ชื่อ SKU ข้างใน)
  const ids = rows.map((r) => r.id);
  const [spotRows, imgRows] = ids.length ? await Promise.all([
    admin.from("sku_swatch_spots").select("swatch_id, sku_id, code, name, label").in("swatch_id", ids).then((r) => (r.data ?? []) as { swatch_id: string; sku_id: string | null; code: string | null; name: string | null; label: string | null }[]),
    admin.from("sku_swatch_images").select("swatch_id").in("swatch_id", ids).then((r) => (r.data ?? []) as { swatch_id: string }[]),
  ]) : [[], []];
  if (search) {
    const s = search.toLowerCase();
    const safe = search.replace(/[%,()]/g, " ").trim();
    const hit = new Set<string>();
    for (const p of spotRows) if ([p.code, p.name, p.label].some((v) => (v ?? "").toLowerCase().includes(s))) hit.add(p.swatch_id);
    if (safe) {
      const { data: skus } = await admin.from("skus_v2").select("id").or(`code.ilike.%${safe}%,name_th.ilike.%${safe}%`).limit(500);
      const skuIds = new Set(((skus ?? []) as { id: string }[]).map((x) => x.id));
      for (const p of spotRows) if (p.sku_id && skuIds.has(p.sku_id)) hit.add(p.swatch_id);
    }
    rows = rows.filter((r) => hit.has(r.id) || (r.name ?? "").toLowerCase().includes(s) || (r.note ?? "").toLowerCase().includes(s) || (r.code ?? "").toLowerCase().includes(s) || `swatch #${seq.get(r.id)}`.includes(s));
  }
  const total = rows.length;
  const page = rows.slice(offset, offset + limit);
  const names = await tagNames(admin, [...new Set(page.flatMap((r) => tagIdsOf(r.family_tag_ids)))]);
  const swatches: SwatchCard[] = page.map((r) => {
    const mine = spotRows.filter((p) => p.swatch_id === r.id);
    const tids = tagIdsOf(r.family_tag_ids);
    return {
      id: r.id, name: r.name, note: r.note, seq: seq.get(r.id) ?? 0, code: r.code,
      image_key: r.image_key, image_w: r.image_w, image_h: r.image_h, image_count: imgRows.filter((i) => i.swatch_id === r.id).length || (r.image_key ? 1 : 0),
      family_tag_ids: tids, tags: tids.map((t) => ({ id: t, name: names.get(t) ?? "แท็ก" })),
      spot_count: mine.length, linked_count: mine.filter((p) => !!p.sku_id).length,
      created_at: r.created_at, updated_at: r.updated_at,
    };
  });
  return NextResponse.json({ swatches, total, error: null });
}

/** รูปที่ส่งมา → แถวที่ใช้ได้ (ตัดตัวที่ไม่มี key) */
function parseImages(v: unknown): { id: string | null; image_key: string; image_w: number | null; image_h: number | null }[] {
  if (!Array.isArray(v)) return [];
  return (v as Record<string, unknown>[]).map((i) => ({
    id: typeof i?.id === "string" && UUID.test(i.id) ? i.id : null,
    image_key: typeof i?.image_key === "string" ? i.image_key.trim() : "",
    image_w: posInt(i?.image_w), image_h: posInt(i?.image_h),
  })).filter((i) => !!i.image_key).slice(0, 30);
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  let images = parseImages(b.images);
  if (!images.length && typeof b.image_key === "string" && b.image_key.trim()) images = [{ id: null, image_key: b.image_key.trim(), image_w: posInt(b.image_w), image_h: posInt(b.image_h) }];
  if (!images.length) return NextResponse.json({ error: "ต้องอัปโหลดรูปแผ่น swatch ก่อน" }, { status: 400 });
  const admin = supabaseAdmin();

  let code: string;
  try { code = await boardCodeFor(admin, b.code); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const cover = images[0];
  const row = {
    name: txt(b.name), note: txt(b.note, 500), code,
    image_key: cover.image_key, image_w: cover.image_w, image_h: cover.image_h,
    family_tag_ids: tagIdsOf(b.family_tag_ids),
    created_by: actor.id,
  };
  const { data, error } = await admin.from("sku_swatches").insert(row).select("id").single();
  if (error || !data) return NextResponse.json({ error: friendlyDbError(error?.message ?? "สร้างไม่สำเร็จ") }, { status: 400 });
  const id = data.id as string;
  const fail = async (msg: string) => {   // สร้างไม่ครบ = ลบแผ่นทิ้ง (รูป/ชิ้นลบตาม cascade) ไม่ให้ค้างครึ่ง ๆ
    await admin.from("sku_swatches").delete().eq("id", id);
    return NextResponse.json({ error: friendlyDbError(msg) }, { status: 400 });
  };

  const { data: imgIns, error: imgErr } = await admin.from("sku_swatch_images")
    .insert(images.map((i, n) => ({ swatch_id: id, image_key: i.image_key, image_w: i.image_w, image_h: i.image_h, sort_order: n }))).select("id, sort_order");
  if (imgErr || !imgIns) return fail(imgErr?.message ?? "บันทึกรูปไม่สำเร็จ");
  const imageIds = ((imgIns ?? []) as { id: string; sort_order: number }[]).sort((a, b2) => a.sort_order - b2.sort_order).map((i) => i.id);

  const spots = (Array.isArray(b.spots) ? (b.spots as Record<string, unknown>[]) : []).slice(0, 1000).map(parseSpot)
    .map((s) => ({ ...s, image_id: imageIds[s.image_index ?? 0] ?? imageIds[0], code: null as string | null }));
  const nextNo = assignCodes(spots, code, 1, imageIds);
  if (spots.length) {
    const { error: spErr } = await admin.from("sku_swatch_spots").insert(spots.map((s) => ({
      swatch_id: id, image_id: s.image_id, sku_id: s.sku_id, x: s.x, y: s.y, w: s.w, h: s.h, label: s.label, name: s.name,
      color_hex: s.color_hex, source: s.source, code: s.code, sort_order: s.sort_order,
    })));
    if (spErr) return fail(spErr.message);
  }
  await admin.from("sku_swatches").update({ next_chip_no: nextNo }).eq("id", id);
  await writeAudit(admin, {
    action: "create", entityType: "sku_swatches", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { code, name: row.name, images: images.length, chips: spots.length, chips_from_ai: spots.filter((s) => s.source === "ai").length },
  });
  return NextResponse.json({ id, code, error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = typeof b.id === "string" ? b.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: headRow } = await admin.from("sku_swatches").select(COLS).eq("id", id).maybeSingle();
  if (!headRow) return NextResponse.json({ error: "ไม่พบแผ่น swatch นี้" }, { status: 404 });
  const head = headRow as unknown as SwatchRow;
  const now = new Date().toISOString();

  const changes: Record<string, unknown> = {};
  if ("name" in b) changes.name = txt(b.name);
  if ("note" in b) changes.note = txt(b.note, 500);
  if (Array.isArray(b.family_tag_ids)) changes.family_tag_ids = tagIdsOf(b.family_tag_ids);
  // รุ่นเก่า: เปลี่ยนรูปเดียว = แทนรูปปก
  if (!Array.isArray(b.images) && typeof b.image_key === "string" && b.image_key.trim()) {
    const { data: firstImg } = await admin.from("sku_swatch_images").select("id").eq("swatch_id", id).order("sort_order").limit(1).maybeSingle();
    b.images = [{ id: (firstImg as { id: string } | null)?.id, image_key: b.image_key, image_w: b.image_w, image_h: b.image_h }];
    const { data: rest } = await admin.from("sku_swatch_images").select("id, image_key, image_w, image_h").eq("swatch_id", id).order("sort_order").range(1, 100);
    (b.images as unknown[]).push(...((rest ?? []) as unknown[]));
  }

  // ── รูป (ทั้งชุด) ──
  const imgReport = { added: 0, removed: 0, reordered: false };
  const { data: curImgRows } = await admin.from("sku_swatch_images").select(IMG_COLS).eq("swatch_id", id).order("sort_order");
  let imageIds = ((curImgRows ?? []) as unknown as ImageRow[]).map((i) => i.id);
  if (Array.isArray(b.images)) {
    const incoming = parseImages(b.images);
    if (!incoming.length) return NextResponse.json({ error: "แผ่นต้องมีรูปอย่างน้อย 1 รูป" }, { status: 400 });
    const curIds = new Set(imageIds);
    const keep = new Set(incoming.map((i) => i.id).filter((x): x is string => !!x && curIds.has(x)));
    const remove = [...curIds].filter((x) => !keep.has(x));
    if (remove.length) {
      const { error } = await admin.from("sku_swatch_images").delete().eq("swatch_id", id).in("id", remove);   // ชิ้นบนรูปนั้นลบตาม cascade
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      imgReport.removed = remove.length;
    }
    const nextIds: string[] = [];
    for (const [n, im] of incoming.entries()) {
      if (im.id && curIds.has(im.id)) {
        const { error } = await admin.from("sku_swatch_images").update({ image_key: im.image_key, image_w: im.image_w, image_h: im.image_h, sort_order: n, updated_at: now }).eq("id", im.id).eq("swatch_id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        nextIds.push(im.id);
      } else {
        const { data: ins, error } = await admin.from("sku_swatch_images").insert({ swatch_id: id, image_key: im.image_key, image_w: im.image_w, image_h: im.image_h, sort_order: n }).select("id").single();
        if (error || !ins) return NextResponse.json({ error: error?.message ?? "บันทึกรูปไม่สำเร็จ" }, { status: 400 });
        nextIds.push(ins.id as string);
        imgReport.added++;
      }
    }
    imgReport.reordered = nextIds.filter((x) => curIds.has(x)).join() !== imageIds.filter((x) => keep.has(x)).join();
    imageIds = nextIds;
    const cover = incoming[0];
    changes.image_key = cover.image_key; changes.image_w = cover.image_w; changes.image_h = cover.image_h;   // ปก → หน้าเดิมที่อ่านรูปเดียวใช้ต่อได้
  }

  // ── ชิ้น (ทั้งแผ่น) ──
  const spotReport = { added: 0, updated: 0, removed: 0, linked: 0, unlinked: 0, added_codes: [] as string[], removed_codes: [] as string[] };
  let nextNo = head.next_chip_no ?? 1;
  if (Array.isArray(b.spots)) {
    const { data: cur } = await admin.from("sku_swatch_spots").select("id, code, sku_id, image_id").eq("swatch_id", id);
    const curMap = new Map(((cur ?? []) as { id: string; code: string | null; sku_id: string | null; image_id: string | null }[]).map((r) => [r.id, r]));
    const incoming = (b.spots as Record<string, unknown>[]).slice(0, 1000).map(parseSpot).map((s) => {
      const old = s.id ? curMap.get(s.id) : undefined;
      const image_id = s.image_index != null ? (imageIds[s.image_index] ?? null) : (s.image_id && imageIds.includes(s.image_id) ? s.image_id : old?.image_id ?? imageIds[0] ?? null);
      return { ...s, image_id, code: old?.code ?? null, isOld: !!old };
    }).filter((s) => !s.image_id || imageIds.includes(s.image_id));   // ชิ้นบนรูปที่ถูกลบ = ทิ้ง
    const keep = new Set(incoming.filter((s) => s.isOld).map((s) => s.id as string));
    const remove = [...curMap.keys()].filter((x) => !keep.has(x));
    if (remove.length) {
      const { error } = await admin.from("sku_swatch_spots").delete().eq("swatch_id", id).in("id", remove);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      spotReport.removed = remove.length;
      spotReport.removed_codes = remove.map((x) => curMap.get(x)?.code).filter((x): x is string => !!x).slice(0, 50);
    }
    const boardCode = head.code ?? (await boardCodeFor(admin, null));
    if (!head.code) changes.code = boardCode;
    nextNo = assignCodes(incoming, boardCode, nextNo, imageIds);
    for (const p of incoming) {
      const old = p.id ? curMap.get(p.id) : undefined;
      if (old && old.sku_id !== p.sku_id) { if (p.sku_id) spotReport.linked++; else spotReport.unlinked++; }
      if (p.isOld) {
        const { error } = await admin.from("sku_swatch_spots").update({
          sku_id: p.sku_id, image_id: p.image_id, x: p.x, y: p.y, w: p.w, h: p.h, label: p.label, name: p.name, color_hex: p.color_hex,
          code: p.code, sort_order: p.sort_order, updated_at: now,
        }).eq("id", p.id as string).eq("swatch_id", id);
        if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
        spotReport.updated++;
      }
    }
    const fresh = incoming.filter((p) => !p.isOld).map((p) => ({
      swatch_id: id, image_id: p.image_id, sku_id: p.sku_id, x: p.x, y: p.y, w: p.w, h: p.h, label: p.label, name: p.name,
      color_hex: p.color_hex, source: p.source, code: p.code, sort_order: p.sort_order,
    }));
    if (fresh.length) {
      const { error } = await admin.from("sku_swatch_spots").insert(fresh);
      if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
      spotReport.added = fresh.length;
      spotReport.added_codes = fresh.map((f) => f.code).filter((x): x is string => !!x).slice(0, 50);
      spotReport.linked += fresh.filter((f) => !!f.sku_id).length;
    }
    changes.next_chip_no = nextNo;
  }

  const { error: upErr } = await admin.from("sku_swatches").update({ ...changes, updated_at: now }).eq("id", id);
  if (upErr) return NextResponse.json({ error: friendlyDbError(upErr.message) }, { status: 400 });
  const HIDDEN = new Set(["next_chip_no", "image_key", "image_w", "image_h"]);   // ตัวนับ/ปกจดแยกในรายงานรูป ไม่ต้องโชว์เป็น "แก้ช่อง"
  const shown = Object.fromEntries(Object.entries(changes).filter(([k]) => !HIDDEN.has(k)));
  await writeAudit(admin, {
    action: "update", entityType: "sku_swatches", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: {
      code: head.code, name: head.name,
      ...auditChangeMeta(head as unknown as Record<string, unknown>, shown, { opaque: ["family_tag_ids"] }),
      images: Array.isArray(b.images) ? imgReport : null,
      spots: Array.isArray(b.spots) ? spotReport : null,
    },
  });
  return NextResponse.json({ ok: true, images: imgReport, spots: spotReport, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  // เก็บ snapshot ลง audit ก่อนลบ (กู้ด้วยมือได้ถ้าลบผิด) — รูปใน R2 ไม่ลบ
  const [{ data: head }, { data: spots }, { data: images }] = await Promise.all([
    admin.from("sku_swatches").select(COLS).eq("id", id).maybeSingle(),
    admin.from("sku_swatch_spots").select(SPOT_COLS).eq("swatch_id", id),
    admin.from("sku_swatch_images").select(IMG_COLS).eq("swatch_id", id),
  ]);
  const { error } = await admin.from("sku_swatches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "sku_swatches", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { snapshot: head ?? null, images: images ?? [], spots: spots ?? [] } });
  return NextResponse.json({ ok: true, error: null });
}
