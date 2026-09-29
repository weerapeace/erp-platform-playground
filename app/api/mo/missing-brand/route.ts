/**
 * สินค้าในใบสั่งผลิตที่ "ยังไม่มีแบรนด์" — /api/mo/missing-brand
 *
 * แบรนด์ของสินค้าเก็บที่ Parent SKU (parent_skus_v2.brand_id) → งานผลิตไม่มีแบรนด์ได้ 3 สาเหตุ:
 *   parent_no_brand = SKU มี Parent แล้ว แต่ Parent ยังไม่ได้ใส่แบรนด์
 *   sku_no_parent   = SKU ยังไม่ได้ผูกกับ Parent (เลยไม่รู้แบรนด์)
 *   sku_missing     = รหัสในใบสั่งผลิตยังไม่ได้ลงทะเบียนเป็น SKU
 *
 * GET  → { items[], brands[] }  1 แถว = 1 สินค้า (Parent หรือ "รหัสหน้า" เช่น WK46) ที่ต้องใส่แบรนด์
 * POST { key, brand_id } → แก้ที่ต้นทางให้ครบในครั้งเดียว:
 *        สร้าง Parent (ถ้ายังไม่มี) → ใส่แบรนด์ให้ Parent → ผูก SKU เข้า Parent → ลงทะเบียน SKU ที่ยังไม่มี
 *        (server คำนวณรายการใหม่เองจาก key ไม่เชื่อข้อมูลที่ client ส่งมา)
 *
 * ของกลาง: guardApi (ดู = products.view · แก้ = products.edit) + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditMany, type AuditEntry } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;

export type MissingBrandCause = "parent_no_brand" | "sku_no_parent" | "sku_missing";
export type MissingBrandSku = { code: string; name: string | null; sku_id: string | null; mo_count: number };
export type MissingBrandItem = {
  key: string;                      // parent:<id> หรือ prefix:<รหัสหน้า>
  cause: MissingBrandCause;         // สาเหตุหลักของแถวนี้ (ใช้เขียนคำอธิบาย)
  code: string;                     // รหัส Parent / รหัสหน้า
  name: string | null;
  image_url: string | null;
  mo_count: number;                 // ใช้ในใบสั่งผลิตกี่ใบ
  skus: MissingBrandSku[];
  parent_id: string | null;         // Parent ที่มีอยู่แล้ว (null = ต้องสร้างใหม่)
  parent_brand_id: string | null;   // Parent มีแบรนด์อยู่แล้ว → แค่ผูก ไม่ต้องเลือกแบรนด์
  parent_brand_name: string | null;
};
export type MissingBrandOption = { id: string; name: string; color: string | null };
export type MissingBrandResponse = { items: MissingBrandItem[]; brands: MissingBrandOption[]; error: string | null };

const img = (key: unknown) => (key ? `/api/r2-image?key=${encodeURIComponent(String(key))}` : null);
// รหัสหน้า = ส่วนก่อนขีดสุดท้าย (WK46-01 → WK46) · ไม่มีขีด = ใช้ทั้งรหัส
const prefixOf = (code: string) => { const i = code.lastIndexOf("-"); return i > 0 ? code.slice(0, i) : code; };

async function inChunks<T>(list: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += 300) chunks.push(list.slice(i, i + 300));
  const res = await Promise.all(chunks.map((c) => run(c)));
  return res.flatMap((r) => r.data ?? []);
}

type ParentRow = { id: string; code: string; name_th: string | null; brand_id: string | null; cover_image_r2_key: string | null; brand: { name?: string } | { name?: string }[] | null };

async function buildItems(admin: Admin): Promise<MissingBrandItem[]> {
  const { data: mos } = await admin.from("manufacturing_orders")
    .select("product_sku, product_name").eq("is_active", true).neq("status", "cancelled").limit(1000);

  // รหัสสินค้า → จำนวนใบสั่งผลิต + ชื่อ (จากใบสั่งผลิต)
  const moCount = new Map<string, number>();
  const moName = new Map<string, string>();
  for (const m of (mos ?? []) as { product_sku: string | null; product_name: string | null }[]) {
    const code = String(m.product_sku ?? "").trim();
    if (!code) continue;
    moCount.set(code, (moCount.get(code) ?? 0) + 1);
    if (m.product_name && !moName.has(code)) moName.set(code, m.product_name);
  }
  const codes = [...moCount.keys()];
  if (codes.length === 0) return [];

  // SKU ของรหัสเหล่านี้ — ดูทุกตัว (รวมที่ปิดใช้งาน) ให้ตรงกับที่ Dashboard ผลิตใช้หาแบรนด์
  // ไม่งั้นรหัสที่มีแต่ตัวปิดใช้งานจะถูกมองว่า "ยังไม่ลงทะเบียน" แล้วไปสร้างรหัสซ้ำ
  type SkuRow = { id: string; code: string; name_th: string | null; parent_sku_id: string | null; cover_image_r2_key: string | null; is_active: boolean };
  const skuRows = await inChunks<SkuRow>(codes, (c) =>
    admin.from("skus_v2").select("id, code, name_th, parent_sku_id, cover_image_r2_key, is_active").in("code", c));
  const skuByCode = new Map<string, SkuRow>();
  const rank = (r: SkuRow) => (r.parent_sku_id ? 2 : 0) + (r.is_active ? 1 : 0);      // รหัสซ้ำ: ผูก Parent แล้ว > ใช้งานอยู่
  for (const s of skuRows) {
    const code = String(s.code).trim();
    const prev = skuByCode.get(code);
    if (!prev || rank(s) > rank(prev)) skuByCode.set(code, s);
  }

  // Parent: ตัวที่ SKU ผูกอยู่ + ตัวที่ "รหัสตรงกับรหัสหน้า" ของ SKU ที่ยังไม่ผูก/ยังไม่ลงทะเบียน
  const parentSel = "id, code, name_th, brand_id, cover_image_r2_key, brand:brands!brand_id ( name )";
  const linkedIds = [...new Set([...skuByCode.values()].map((s) => s.parent_sku_id).filter(Boolean) as string[])];
  const orphanCodes = codes.filter((c) => !skuByCode.get(c)?.parent_sku_id);
  const prefixes = [...new Set(orphanCodes.map(prefixOf))];
  const [byIdRows, byCodeRows] = await Promise.all([
    inChunks<ParentRow>(linkedIds, (c) => admin.from("parent_skus_v2").select(parentSel).in("id", c)),
    inChunks<ParentRow>(prefixes, (c) => admin.from("parent_skus_v2").select(parentSel).eq("is_active", true).in("code", c)),
  ]);
  const parentById = new Map(byIdRows.map((p) => [p.id, p]));
  const parentByCode = new Map<string, ParentRow>();
  for (const p of byCodeRows) {
    const prev = parentByCode.get(p.code);
    if (!prev || (!prev.brand_id && p.brand_id)) parentByCode.set(p.code, p);         // รหัสซ้ำ: เอาตัวที่มีแบรนด์
  }
  const brandName = (p: ParentRow | undefined) => {
    const b = p && (Array.isArray(p.brand) ? p.brand[0] : p.brand);
    return b?.name ?? null;
  };

  const items = new Map<string, MissingBrandItem>();
  for (const code of codes) {
    const sku = skuByCode.get(code);
    const linked = sku?.parent_sku_id ? parentById.get(sku.parent_sku_id) : undefined;
    if (linked?.brand_id) continue;                                                   // มีแบรนด์แล้ว

    const cause: MissingBrandCause = linked ? "parent_no_brand" : sku ? "sku_no_parent" : "sku_missing";
    const parent = linked ?? parentByCode.get(prefixOf(code));
    const key = parent ? `parent:${parent.id}` : `prefix:${prefixOf(code)}`;
    const row: MissingBrandSku = { code, name: sku?.name_th ?? moName.get(code) ?? null, sku_id: sku?.id ?? null, mo_count: moCount.get(code) ?? 0 };

    const it = items.get(key);
    if (it) {
      it.skus.push(row);
      it.mo_count += row.mo_count;
      if (!it.image_url) it.image_url = img(sku?.cover_image_r2_key);
      // สาเหตุของแถว: ถ้ามี SKU ที่ยังไม่ลงทะเบียน/ยังไม่ผูกปนอยู่ ให้บอกเรื่องนั้นก่อน (ต้องทำมากกว่าแค่เลือกแบรนด์)
      if (cause === "sku_missing" || (cause === "sku_no_parent" && it.cause === "parent_no_brand")) it.cause = cause;
    } else {
      items.set(key, {
        key, cause,
        code: parent?.code ?? prefixOf(code),
        name: (parent?.name_th && parent.name_th !== parent.code ? parent.name_th : null) ?? moName.get(code) ?? sku?.name_th ?? null,
        image_url: img(parent?.cover_image_r2_key) ?? img(sku?.cover_image_r2_key),
        mo_count: row.mo_count, skus: [row],
        parent_id: parent?.id ?? null,
        parent_brand_id: parent?.brand_id ?? null,
        parent_brand_name: brandName(parent),
      });
    }
  }
  for (const it of items.values()) it.skus.sort((a, b) => a.code.localeCompare(b.code));
  return [...items.values()].sort((a, b) => b.mo_count - a.mo_count || a.code.localeCompare(b.code));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  try {
    const [items, { data: brands }] = await Promise.all([
      buildItems(admin),
      admin.from("brands").select("id, name, color").eq("is_active", true).order("name", { ascending: true }),
    ]);
    return NextResponse.json({ items, brands: (brands ?? []) as MissingBrandOption[], error: null } as MissingBrandResponse);
  } catch (e) {
    console.error("[missing-brand] GET:", e);
    return NextResponse.json({ items: [], brands: [], error: "โหลดรายการที่ยังไม่มีแบรนด์ไม่ได้ กรุณาลองใหม่" } as MissingBrandResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { key?: string; brand_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 }); }
  const key = String(body.key ?? "");
  if (!key) return NextResponse.json({ error: "ไม่ระบุสินค้าที่จะใส่แบรนด์" }, { status: 400 });

  const admin = supabaseAdmin();
  const item = (await buildItems(admin)).find((i) => i.key === key);
  if (!item) return NextResponse.json({ error: "รายการนี้มีแบรนด์แล้ว หรือไม่อยู่ในใบสั่งผลิตแล้ว — ลองปิดแล้วเปิดใหม่" }, { status: 409 });

  // แบรนด์ที่จะใช้: Parent มีอยู่แล้ว = ใช้ของ Parent · ยังไม่มี = ต้องเลือกมา (และต้องเป็นแบรนด์ที่ใช้งานอยู่)
  let brandId = item.parent_brand_id;
  let brandName = item.parent_brand_name;
  if (!brandId) {
    if (!body.brand_id) return NextResponse.json({ error: "กรุณาเลือกแบรนด์ก่อนบันทึก" }, { status: 400 });
    const { data: b } = await admin.from("brands").select("id, name").eq("id", body.brand_id).eq("is_active", true).maybeSingle();
    if (!b) return NextResponse.json({ error: "ไม่พบแบรนด์ที่เลือก (อาจถูกปิดใช้งานแล้ว)" }, { status: 400 });
    brandId = String(b.id); brandName = String(b.name);
  }

  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };
  const audits: AuditEntry[] = [];
  const source = "production-dashboard/missing-brand";
  // ไม่โชว์ error ดิบจากฐานข้อมูล — แปลงเป็นภาษาคน (ตัวเต็มลง log ฝั่ง server)
  const fail = (msg: string) => {
    console.error(`[missing-brand] POST ${key}:`, msg);
    const human = /duplicate key|23505/i.test(msg) ? "มีรหัสนี้อยู่ในระบบแล้ว — ลองปิดแล้วเปิดหน้าต่างนี้ใหม่" : "ระบบบันทึกไม่ได้ กรุณาลองใหม่อีกครั้ง";
    return NextResponse.json({ error: human }, { status: 400 });
  };

  // 1) Parent — สร้างใหม่ถ้ายังไม่มี · ใส่แบรนด์ถ้ายังว่าง
  let parentId = item.parent_id;
  if (!parentId) {
    const { data: p, error } = await admin.from("parent_skus_v2")
      .insert({ code: item.code, name_th: item.name ?? item.code, brand_id: brandId }).select("id").single();
    if (error || !p) return fail(error?.message ?? "สร้าง Parent ไม่ได้");
    parentId = String(p.id);
    audits.push({ action: "create", entityType: "parent_skus_v2", entityId: parentId, ...actor, metadata: { code: item.code, brand: brandName, source } });
  } else if (!item.parent_brand_id) {
    const { error } = await admin.from("parent_skus_v2").update({ brand_id: brandId, updated_at: new Date().toISOString() }).eq("id", parentId).is("brand_id", null);
    if (error) return fail(error.message);
    audits.push({ action: "update", entityType: "parent_skus_v2", entityId: parentId, ...actor, metadata: { code: item.code, field: "brand_id", old_value: null, new_value: brandName, source } });
  }

  // 2) ผูก SKU ที่ยังไม่มี Parent (แตะเฉพาะตัวที่ยังว่าง — ไม่ย้าย SKU ที่ผูกที่อื่นอยู่)
  const toLink = item.skus.filter((s) => s.sku_id).map((s) => s.sku_id as string);
  let linked = 0;
  if (toLink.length > 0) {
    const { data, error } = await admin.from("skus_v2").update({ parent_sku_id: parentId, updated_at: new Date().toISOString() })
      .in("id", toLink).is("parent_sku_id", null).select("id, code");
    if (error) return fail(error.message);
    for (const s of (data ?? []) as { id: string; code: string }[]) {
      linked += 1;
      audits.push({ action: "update", entityType: "skus_v2", entityId: s.id, ...actor, metadata: { code: s.code, field: "parent_sku_id", old_value: null, new_value: item.code, source } });
    }
  }

  // 3) ลงทะเบียน SKU ที่ยังไม่มีในระบบ (ข้อมูลตั้งต้น: รหัส + ชื่อจากใบสั่งผลิต — เติมรายละเอียดต่อได้ที่หน้า SKU)
  const toCreate = item.skus.filter((s) => !s.sku_id);
  let created = 0;
  if (toCreate.length > 0) {
    const { data, error } = await admin.from("skus_v2")
      .insert(toCreate.map((s) => ({ code: s.code, name_th: s.name ?? s.code, parent_sku_id: parentId }))).select("id, code");
    if (error) return fail(error.message);
    for (const s of (data ?? []) as { id: string; code: string }[]) {
      created += 1;
      audits.push({ action: "create", entityType: "skus_v2", entityId: s.id, ...actor, metadata: { code: s.code, parent: item.code, source } });
    }
  }

  await writeAuditMany(admin, audits);
  return NextResponse.json({ ok: true, brand: brandName, parent_id: parentId, parent_created: !item.parent_id, linked, created, error: null });
}
