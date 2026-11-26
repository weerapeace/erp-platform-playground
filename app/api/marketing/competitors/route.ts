/**
 * คู่แข่ง (กรอกเอง) — /api/marketing/competitors (แท็บ "คอนเทนต์" หน้าภาพรวมการตลาด · เจ้าของเลือก 2026-11-26 รอบ 7 ข้อ 5)
 *   POST   { product_name, url?, platform?, shop_name?, price?, rating?, sold?, our_parent_sku_id?, note?, brand_id? } → สร้าง
 *   PATCH  { id, ...ช่องที่แก้ | is_active } → แก้ทุกช่อง / กู้คืน (is_active true) · ราคา/ดาว/ยอดขายเปลี่ยน = ต่อประวัติ (history)
 *   DELETE ?id= → ลบแบบเก็บไว้ (is_active false · กู้คืนได้ — หน้าเว็บมีปุ่มย้อนกลับ)
 * สิทธิ์แก้ = products.platforms.edit (ชุดเดียวกับตั้งเป้า/จุดคุ้มทุน) · ทุกการแก้/ลบ/กู้ ลง audit (changes)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAudit } from "@/lib/audit";
import { appendHistory } from "@/lib/marketing-content-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PERM = "products.platforms.edit";
const COLS = "id, brand_id, platform, shop_name, product_name, url, price, rating, sold, our_parent_sku_id, note, history, is_active";
const EDITABLE = ["brand_id", "platform", "shop_name", "product_name", "url", "price", "rating", "sold", "our_parent_sku_id", "note"] as const;
type Body = Partial<Record<(typeof EDITABLE)[number], unknown>> & { id?: string; is_active?: boolean };

function clean(b: Body): { data: Record<string, unknown>; error?: string } {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) {
    if (!(k in b)) continue;
    const v = b[k];
    if (k === "price" || k === "rating" || k === "sold") {
      if (v == null || v === "") { out[k] = null; continue; }
      const x = Number(v);
      if (!Number.isFinite(x) || x < 0) return { data: out, error: "ราคา / ดาว / ยอดขาย ต้องเป็นตัวเลขไม่ติดลบ" };
      if (k === "rating" && x > 5) return { data: out, error: "ดาวต้องไม่เกิน 5" };
      out[k] = k === "sold" ? Math.round(x) : x;
    } else {
      const s = v == null ? null : String(v).trim().slice(0, 2000);
      out[k] = s || null;
    }
  }
  if ("url" in out && out.url && !/^https?:\/\//i.test(String(out.url))) return { data: out, error: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://" };
  if ("product_name" in out && !out.product_name) return { data: out, error: "ต้องใส่ชื่อสินค้าคู่แข่ง" };
  return { data: out };
}

async function who(request: NextRequest) { const { data: { user } } = await supabaseFromRequest(request).auth.getUser(); return user; }

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  let b: Body; try { b = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  if (!b.product_name) return NextResponse.json({ error: "ต้องใส่ชื่อสินค้าคู่แข่ง" }, { status: 400 });
  const { data, error: ve } = clean(b); if (ve) return NextResponse.json({ error: ve }, { status: 400 });
  const user = await who(request);
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const history = appendHistory([], { price: null, rating: null, sold: null }, { price: (data.price as number) ?? null, rating: (data.rating as number) ?? null, sold: (data.sold as number) ?? null }, now);
  const { data: row, error } = await admin.from("marketing_competitors").insert({ ...data, history, created_by: user?.id ?? null, updated_by: user?.id ?? null, created_at: now, updated_at: now }).select(COLS).single();
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "marketing_competitor", entityId: (row as { id: string }).id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { label: `คู่แข่ง: ${data.product_name}`, ...auditChangeMeta({}, data) } });
  return NextResponse.json({ ok: true, row, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  let b: Body; try { b = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "ไม่ได้ระบุรายการ" }, { status: 400 });
  const { data, error: ve } = clean(b); if (ve) return NextResponse.json({ error: ve }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("marketing_competitors").select(COLS).eq("id", b.id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  const c = cur as Record<string, unknown>;
  const user = await who(request);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { ...data, updated_by: user?.id ?? null, updated_at: now };
  if (typeof b.is_active === "boolean") patch.is_active = b.is_active;
  const num = (v: unknown) => (v == null ? null : Number(v));
  const next = { price: "price" in data ? num(data.price) : num(c.price), rating: "rating" in data ? num(data.rating) : num(c.rating), sold: "sold" in data ? num(data.sold) : num(c.sold) };
  patch.history = appendHistory(c.history, { price: num(c.price), rating: num(c.rating), sold: num(c.sold) }, next, now);
  const { data: row, error } = await admin.from("marketing_competitors").update(patch).eq("id", b.id).select(COLS).single();
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 400 });
  const before: Record<string, unknown> = {}; for (const k of Object.keys(data)) before[k] = c[k];
  if ("is_active" in patch) before.is_active = c.is_active;
  await writeAudit(admin, { action: patch.is_active === true && c.is_active === false ? "restore" : "update", entityType: "marketing_competitor", entityId: b.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { label: `คู่แข่ง: ${c.product_name}`, ...auditChangeMeta(before, { ...data, ...("is_active" in patch ? { is_active: patch.is_active } : {}) }) } });
  return NextResponse.json({ ok: true, row, before: c, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ไม่ได้ระบุรายการ" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("marketing_competitors").select("product_name, is_active").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  const user = await who(request);
  const { error } = await admin.from("marketing_competitors").update({ is_active: false, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "marketing_competitor", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { label: `คู่แข่ง: ${(cur as { product_name: string }).product_name}`, soft: true, ...auditChangeMeta({ is_active: true }, { is_active: false }) } });
  return NextResponse.json({ ok: true, error: null });
}
