/**
 * /api/color-swatches — 🎨 ทะเบียนสีกลาง (หน้าตาจุดสีของแต่ละชื่อสี) · ข้อมูลอยู่ในพจนานุกรมสี erp_color_dictionary
 *   GET  → { entries: แถวในพจนานุกรม + จุดสี, used: ชื่อสีที่ SKU บนเว็บใช้อยู่ (นับ SKU + ร้าน) }
 *   GET ?images=ชื่อ1|ชื่อ2 → { groups: SKU ที่ใช้สีนี้ + รูปทั้งหมดของแต่ละตัว (ปก · แกลเลอรี · รูปเว็บ)
 *                               + กลุ่ม "รูปของรุ่น" (kind parent: ปก/แกลเลอรี Parent + รูปเว็บของรุ่น) } — ✂️ ครอปรูปลายจากรูปสินค้า
 *   POST { id?, th, en?, kind, colors, imageKey } → ตั้งจุดสี (มีชื่อนี้แล้ว = แก้ · ยังไม่มี = เพิ่มคำใหม่ ต้องมีคำอังกฤษ)
 *   POST { items: [ {th, en, kind, colors, imageKey}, … ] } → ตั้งหลายสีในครั้งเดียว (กดบันทึกทีเดียว) · ผล results[] ตรงลำดับ
 *        สีไหนพลาด ({ok:false,error}) ไม่ล้มทั้งชุด · audit ทีละสี · ล้างแคชเว็บครั้งเดียว
 *
 * สิทธิ์เหมือนพจนานุกรมสี: อ่าน = products.view · แก้ = products.edit · ทุกการแก้เขียน audit
 * บันทึกแล้วสั่งเว็บร้านทุกร้านล้างแคช → จุดสีบนเว็บเปลี่ยนทันที
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { normalizeSwatchInput, rowToSwatchEntry, SWATCH_SELECT, normColorName } from "@/lib/color-swatch";
import { swatchSourceImages } from "@/lib/color-swatch-images";
import { fetchAllPages } from "@/lib/fetch-all";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { id: string; th: string; en: string | null; swatch_kind: string | null; swatch_colors: string[] | null; swatch_image_key: string | null };

const KEY_RE = /^[\w\-./%()]+$/; // r2 object key ที่ยอมรับ
type Sb = ReturnType<typeof supabaseAdmin>;


export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sb = supabaseAdmin();

  const imgParam = request.nextUrl.searchParams.get("images");
  if (imgParam !== null) {
    const names = [...new Set(imgParam.split("|").map((s) => s.trim()).filter(Boolean))].slice(0, 6);
    if (!names.length) return NextResponse.json({ data: { groups: [] }, error: null });
    return NextResponse.json({ data: { groups: await swatchSourceImages(sb, names) }, error: null });
  }

  const [{ data: dict, error }, { data: listings }, { data: shops }] = await Promise.all([
    sb.from("erp_color_dictionary").select(SWATCH_SELECT).eq("is_active", true).order("th"),
    sb.from("store_listings").select("parent_sku_id, shop_id").eq("is_published", true),
    sb.from("shops").select("id, name, slug"),
  ]);
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 });

  // ชื่อสีที่ SKU บนเว็บใช้อยู่จริง (ทุกร้านที่เผยแพร่) — ไว้บอกว่าสีไหนยังไม่ได้ตั้ง
  const shopName = new Map(((shops ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const shopsByParent = new Map<string, Set<string>>();
  for (const l of (listings ?? []) as { parent_sku_id: string; shop_id: string }[]) {
    const set = shopsByParent.get(l.parent_sku_id) ?? new Set<string>();
    set.add(shopName.get(l.shop_id) ?? "");
    shopsByParent.set(l.parent_sku_id, set);
  }
  const parentIds = [...shopsByParent.keys()];
  // images = รูปปก SKU ของสีนั้น (≤6) — ใช้ "💧 ดูดสีจากรูปสินค้า" ในหน้าต่างทะเบียนสี
  const used = new Map<string, { name: string; skus: number; shops: Set<string>; images: string[] }>();
  for (let i = 0; i < parentIds.length; i += 200) {
    // 200 รุ่นมี SKU ลูกเกิน 1,000 ได้ → ไล่ดึงทีละหน้า ไม่งั้นสีที่ใช้อยู่บางสีไม่ถูกนับ
    const part = parentIds.slice(i, i + 200);
    const kids = await fetchAllPages<{ parent_sku_id: string; color: string | null; cover_image_r2_key: string | null }>((from, to) =>
      sb.from("skus_v2").select("parent_sku_id, color, cover_image_r2_key").in("parent_sku_id", part).eq("is_active", true).order("code").order("id").range(from, to));
    for (const k of kids) {
      const name = (k.color ?? "").trim();
      if (!name) continue;
      const key = normColorName(name);
      const u = used.get(key) ?? { name, skus: 0, shops: new Set<string>(), images: [] };
      u.skus += 1;
      if (k.cover_image_r2_key && u.images.length < 6 && !u.images.includes(k.cover_image_r2_key)) u.images.push(k.cover_image_r2_key);
      for (const s of shopsByParent.get(k.parent_sku_id) ?? []) if (s) u.shops.add(s);
      used.set(key, u);
    }
  }

  return NextResponse.json({
    data: {
      entries: ((dict ?? []) as Row[]).map(rowToSwatchEntry),
      used: [...used.values()].map((u) => ({ name: u.name, skus: u.skus, shops: [...u.shops].sort(), images: u.images })),
    },
    error: null,
  });
}

type SwatchInput = { id?: string; th?: string; en?: string; kind?: unknown; colors?: unknown; imageKey?: unknown };
type Actor = { id: string; email?: string | null } | null;
type SaveResult = { ok: true; id: string | null } | { ok: false; error: string };
const MAX_BATCH = 200;

/** ตั้งจุดสี 1 ชื่อ + audit · rows = พจนานุกรมที่โหลดไว้ (คำใหม่ที่เพิ่ม ใส่เข้า rows ให้ตัวถัดไปในชุดเดียวกันเห็น) */
async function saveSwatch(admin: Sb, rows: Row[], user: Actor, b: SwatchInput): Promise<SaveResult> {
  const th = (b.th ?? "").trim();
  const en = (b.en ?? "").trim();
  if (!th) return { ok: false, error: "ต้องมีชื่อสี" };
  const sw = normalizeSwatchInput(b);
  if (!sw.ok) return { ok: false, error: sw.error };

  // หาแถวเดิม: id ที่ส่งมา หรือชื่อไทยตรงกัน (ไม่สนตัวพิมพ์/ช่องว่าง — ตรงกับ unique index)
  const existing = rows.find((r) => (b.id ? r.id === b.id : normColorName(r.th) === normColorName(th)));

  const swatch = { swatch_kind: sw.kind, swatch_colors: sw.colors, swatch_image_key: sw.imageKey };
  const stamp = { updated_at: new Date().toISOString(), updated_by: user?.id ?? null };
  let id: string | null = existing?.id ?? null;
  if (existing) {
    const { error } = await admin.from("erp_color_dictionary").update({ ...swatch, ...(en ? { en } : {}), ...stamp }).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    if (!en) return { ok: false, error: `"${th}" ยังไม่มีในพจนานุกรมสี — ใส่ชื่อภาษาอังกฤษด้วย (ใช้แปลชื่อสีด้วย)` };
    const { data, error } = await admin.from("erp_color_dictionary").insert({ th, en, ...swatch, ...stamp }).select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    id = (data as { id: string } | null)?.id ?? null;
    if (id) rows.push({ id, th, en, swatch_kind: sw.kind, swatch_colors: sw.colors, swatch_image_key: sw.imageKey });
  }

  await writeAudit(admin, {
    action: existing ? "update" : "create",
    entityType: "color_dictionary",
    entityId: id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: {
      th,
      field: "swatch",
      before: existing ? { kind: existing.swatch_kind, colors: existing.swatch_colors, imageKey: existing.swatch_image_key } : null,
      after: { kind: sw.kind, colors: sw.colors, imageKey: sw.imageKey },
    },
  });
  return { ok: true, id };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "products.edit")))
    return NextResponse.json({ error: "ต้องมีสิทธิ์แก้สินค้า (products.edit) จึงตั้งจุดสีได้" }, { status: 401 });
  let b: SwatchInput & { items?: unknown };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const batch = Array.isArray(b.items) ? (b.items as SwatchInput[]) : null;
  if (batch && (!batch.length || batch.length > MAX_BATCH)) return NextResponse.json({ error: `บันทึกได้ครั้งละ 1–${MAX_BATCH} สี` }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { data: dict } = await admin.from("erp_color_dictionary").select(SWATCH_SELECT);
  const rows = [...((dict ?? []) as Row[])];

  // ทีละชุด (items) = ทำทีละสีตามลำดับ · ผลตรงลำดับที่ส่งมา · สีไหนพลาดไม่ล้มทั้งชุด
  const results: SaveResult[] = [];
  for (const item of batch ?? [b]) results.push(await saveSwatch(admin, rows, user, item && typeof item === "object" ? item : {}));
  if (!batch && !results[0].ok) return NextResponse.json({ error: results[0].error }, { status: 400 });

  // จุดสีใช้ทุกร้าน → สั่งทุกร้านล้างแคชครั้งเดียวต่อการกดบันทึก (ร้านไหนไม่มีโดเมนก็ข้าม · เว็บอัปเดตเองใน ≤60 วิ อยู่แล้ว)
  let purged = 0;
  if (results.some((r) => r.ok)) {
    const { data: activeShops } = await admin.from("shops").select("id").eq("status", "active");
    purged = (await Promise.all(((activeShops ?? []) as { id: string }[]).map((s) => purgeStorefrontCache(admin, s.id)))).filter(Boolean).length;
  }

  if (!batch) return NextResponse.json({ data: { id: (results[0] as { id: string | null }).id, purged }, error: null });
  return NextResponse.json({ data: { results, purged }, error: null });
}
