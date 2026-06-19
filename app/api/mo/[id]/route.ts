/**
 * MO API — single (detail + save + archive) เฟส A
 * GET    /api/mo/[id] → header + materials
 * PATCH  /api/mo/[id] → update header; ถ้าจำนวน/สูตรเปลี่ยน → กางสูตรใหม่
 * DELETE /api/mo/[id] → archive
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { explodeBom } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const supabase = supabaseFromRequest(_request);
  const { data: header, error } = await supabase.from("manufacturing_orders").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 });
  const moNo = (header as { mo_no: string }).mo_no;
  const productSku = (header as { product_sku: string | null }).product_sku;

  // ยิงพร้อมกัน (ขนาน) — เดิมทำทีละตัว (sequential) ทำให้เปิดป๊อปอัปช้า
  const [matRes, sumRes, prRes, skRes] = await Promise.all([
    supabase.from("mo_materials").select("*").eq("mo_no", moNo).eq("is_active", true)
      .order("sequence", { ascending: true, nullsFirst: false }).order("id", { ascending: true }),
    supabase.from("mo_material_summary").select("*").eq("mo_no", moNo).eq("is_active", true)
      .order("sequence", { ascending: true, nullsFirst: false }).order("id", { ascending: true }),
    supabaseAdmin().from("purchase_requests_v2").select("item_name, qty, status")
      .eq("source_mo_no", moNo).eq("is_active", true).not("status", "in", "(rejected,cancelled)"),
    productSku
      ? supabase.from("skus_v2").select("cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").eq("code", productSku).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const materials = matRes.data; const summary = sumRes.data;

  // สถานะ "ขอซื้อแล้ว" — รวมจำนวนจากใบขอซื้อ (PR v2) ที่ผูกใบสั่งผลิตนี้
  const requested: Record<string, number> = {};
  for (const p of (prRes.data ?? []) as { item_name: string | null; qty: number | null }[]) {
    const m = /^\[([^\]]+)\]/.exec(p.item_name ?? "");
    const code = m ? m[1] : (p.item_name ?? "");
    if (!code) continue;
    requested[code] = (requested[code] ?? 0) + (Number(p.qty) || 0);
  }

  // รูปสินค้า — ใช้รูป SKU รุ่นนั้นก่อน (fallback รูป parent)
  let product_image: string | null = null;
  const sk = skRes.data as { cover_image_r2_key?: string | null; parent_skus_v2?: unknown } | null;
  if (sk) {
    const parRel = sk.parent_skus_v2;
    const par = (Array.isArray(parRel) ? parRel[0] : parRel) as { cover_image_r2_key?: string | null } | null;
    const key = sk.cover_image_r2_key || par?.cover_image_r2_key || "";
    if (key) product_image = `/api/r2-image?key=${encodeURIComponent(key)}`;
  }

  return NextResponse.json({ data: { ...header, materials: materials ?? [], summary: summary ?? [], requested, product_image }, error: null });
}

type MatEdit = { id: string; on_hand_qty: number; is_ready: boolean; to_purchase_qty: number };
type SaveBody = {
  product_sku?: string; product_name?: string; qty?: number; due_date?: string | null;
  bom_code?: string | null; bom_version?: string | null; status?: string; note?: string; reexplode?: boolean;
  preserve?: boolean;      // กางสูตรใหม่แบบเก็บค่าที่เคยกรอก (ปุ่ม "อัพเดตวัตถุดิบตาม BOM")
  materials?: MatEdit[];   // แก้ checklist เตรียม/จำนวนที่มี/ขอซื้อ (เฟส B)
  size_breakdown?: { label: string; qty: number }[] | null;   // กลุ่ม C: แบ่งจำนวนตามไซส์
};

function cleanSizes(raw: unknown): { label: string; qty: number }[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .map((s) => ({ label: String((s as { label?: unknown })?.label ?? "").trim(), qty: Number((s as { qty?: unknown })?.qty) || 0 }))
    .filter((s) => s.label && s.qty > 0);
  return out.length > 0 ? out : null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: SaveBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: existing, error: exErr } = await admin.from("manufacturing_orders").select("mo_no, qty, bom_code, size_breakdown").eq("id", id).single();
  if (exErr) return NextResponse.json({ error: "ไม่พบใบสั่งผลิตนี้" }, { status: 404 });
  const moNo = (existing as { mo_no: string }).mo_no;
  const newBom = body.bom_code !== undefined ? body.bom_code : (existing as { bom_code: string | null }).bom_code;
  // ไซส์: ถ้าส่งมาใช้ของใหม่ ไม่งั้นคงของเดิม — จำนวนรวมคิดจากผลบวกไซส์ถ้ามี
  const sizesProvided = body.size_breakdown !== undefined;
  const effSizes = sizesProvided ? cleanSizes(body.size_breakdown) : cleanSizes((existing as { size_breakdown?: unknown }).size_breakdown);
  const newQty = effSizes ? effSizes.reduce((a, s) => a + s.qty, 0) : (body.qty != null ? Number(body.qty) : (existing as { qty: number }).qty);

  const { error } = await admin.from("manufacturing_orders").update({
    product_sku: body.product_sku, product_name: body.product_name ?? null, qty: newQty,
    status: body.status, due_date: body.due_date || null, bom_code: newBom, bom_version: body.bom_version ?? null, note: body.note ?? null,
    ...(sizesProvided ? { size_breakdown: effSizes } : {}),
  }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  // กางสูตรใหม่เมื่อจำนวน/สูตร/ไซส์เปลี่ยน หรือสั่ง reexplode
  const qtyChanged = newQty !== (existing as { qty: number }).qty;
  const bomChanged = newBom !== (existing as { bom_code: string | null }).bom_code;
  const reexploded = body.reexplode || qtyChanged || bomChanged || sizesProvided;
  if (reexploded) {
    await explodeBom(admin, newBom ?? null, moNo, newQty, effSizes, body.preserve === true);
  } else if (Array.isArray(body.materials)) {
    // อัปเดต checklist เตรียม/จำนวนที่มี/ขอซื้อ ที่ "สรุปต่อวัตถุดิบ" (เฉพาะเมื่อไม่ได้กางสูตรใหม่)
    for (const m of body.materials) {
      await admin.from("mo_material_summary").update({
        on_hand_qty: Number(m.on_hand_qty) || 0,
        is_ready: !!m.is_ready,
        to_purchase_qty: Number(m.to_purchase_qty) || 0,
      }).eq("id", m.id).eq("mo_no", moNo);
    }
  }

  await admin.from("audit_logs").insert({ actor_user_id: user.id, action: "update", entity_type: "mo", entity_id: id, metadata: { mo_no: moNo, qty: newQty } }).then(() => {}, () => {});
  return NextResponse.json({ id, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("manufacturing_orders").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await admin.from("audit_logs").insert({ actor_user_id: user.id, action: "archive", entity_type: "mo", entity_id: id }).then(() => {}, () => {});
  return NextResponse.json({ data: { archived: true }, error: null });
}
