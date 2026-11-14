/**
 * สินค้าจากใบสั่งงาน + สถานะสูตร — ป๊อป "ดึงจากสูตร BOM" หน้า /fabric-calc (เจ้าของขอ 2026-11-14
 *   "pop เป็นหน้าค้นหาและมี tabs ตามใบสั่งงาน · กดแล้วโชว์สินค้าจากรายการใบสั่งงานล่าสุด และดึง BOM จากสินค้านั้น")
 *   GET → { products, groups }
 *     products: 1 สินค้า = 1 แถว (รวมทุกใบ) เรียงใบล่าสุดก่อน · ใบล่าสุด/วันที่/จำนวน · เคยผลิตกี่ใบ · กำลังผลิตไหม · อยู่กลุ่มใบสั่งงานไหน
 *               bom: "cut" สูตรมีขนาดชิ้นตัด · "nocut" มีสูตรแต่ยังไม่มีขนาดชิ้น · "none" ยังไม่มีสูตร
 *     groups:   กลุ่มใบสั่งงาน (mo_groups) ที่มีสินค้าอยู่ — ทำเป็นแท็บ
 *   ใบที่ยกเลิก/ปิดใช้งานไม่นับ · ล่าสุด 2,000 ใบ
 * ของกลาง: guardApi(products.view) · supabaseAdmin · fetchAllPages
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
export type BomState = "cut" | "nocut" | "none";
export type BomSourceProduct = {
  sku: string; name: string | null; image_url: string | null; parent_code: string | null;
  last_mo: string; last_at: string | null; last_qty: number; mo_count: number; open: boolean;
  group_ids: string[]; bom: BomState;
};
export type BomSourceGroup = { id: string; name: string; color: string | null };

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const { data: moData, error } = await admin.from("manufacturing_orders").select("mo_no, qty, status, product_sku, product_name, created_at")
    .eq("is_active", true).neq("status", "cancelled").not("product_sku", "is", null)
    .order("created_at", { ascending: false }).limit(2000);
  if (error) return NextResponse.json({ data: null, error: "โหลดใบสั่งงานไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  const mos = (moData ?? []) as Row[];

  // กลุ่มใบสั่งงาน: เลขใบ → กลุ่ม
  const { data: gData } = await admin.from("mo_groups").select("id, name, color, mo_nos, sort_order").eq("is_active", true).order("sort_order");
  const groupsOfMo = new Map<string, string[]>();
  const groups = ((gData ?? []) as Row[]).map((g) => {
    const id = String(g.id);
    for (const no of (Array.isArray(g.mo_nos) ? g.mo_nos : []) as unknown[]) { const k = String(no); groupsOfMo.set(k, [...(groupsOfMo.get(k) ?? []), id]); }
    return { id, name: String(g.name ?? ""), color: (g.color as string | null) ?? null };
  });

  // รวมเป็นสินค้า (ใบแรกที่เจอ = ล่าสุด เพราะเรียงใหม่ก่อน)
  const prod = new Map<string, BomSourceProduct>();
  for (const m of mos) {
    const sku = String(m.product_sku ?? "").trim(); if (!sku) continue;
    const moNo = String(m.mo_no ?? "");
    const open = m.status !== "done" && m.status !== "closed";
    const p = prod.get(sku);
    const gids = groupsOfMo.get(moNo) ?? [];
    if (!p) {
      prod.set(sku, { sku, name: (m.product_name as string) ?? null, image_url: null, parent_code: null, last_mo: moNo, last_at: (m.created_at as string) ?? null,
        last_qty: num(m.qty), mo_count: 1, open, group_ids: [...gids], bom: "none" });
    } else {
      p.mo_count++; p.open = p.open || open;
      for (const g of gids) if (!p.group_ids.includes(g)) p.group_ids.push(g);
    }
  }
  const skus = [...prod.keys()];

  // รูป (ปก SKU → ปกสินค้าแม่) + สินค้าแม่
  for (let i = 0; i < skus.length; i += 300) {
    const { data } = await admin.from("skus_v2").select("code, cover_image_r2_key, parent:parent_skus_v2!parent_sku_id ( code, cover_image_r2_key )").in("code", skus.slice(i, i + 300));
    for (const s of (data ?? []) as Row[]) {
      const p = prod.get(String(s.code)); if (!p) continue;
      const par = (Array.isArray(s.parent) ? s.parent[0] : s.parent) as { code?: string | null; cover_image_r2_key?: string | null } | null;
      const key = (s.cover_image_r2_key as string | null) || par?.cover_image_r2_key || null;
      p.image_url = key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null;
      p.parent_code = par?.code ?? null;
    }
  }

  // สถานะสูตร: มีสูตร (active) ไหม · บรรทัดไหนมีขนาดชิ้นตัด (กว้าง × ยาว)
  const codeToSku = new Map<string, string>();
  for (let i = 0; i < skus.length; i += 300) {
    const heads = await fetchAllPages<Row>((from, to) => admin.from("bom_headers").select("bom_code, product_sku").in("product_sku", skus.slice(i, i + 300)).eq("is_active", true).order("bom_code").range(from, to));
    for (const h of heads) { codeToSku.set(String(h.bom_code), String(h.product_sku)); const p = prod.get(String(h.product_sku)); if (p && p.bom === "none") p.bom = "nocut"; }
  }
  const codes = [...codeToSku.keys()];
  for (let i = 0; i < codes.length; i += 300) {
    const lines = await fetchAllPages<Row>((from, to) => admin.from("bom_lines").select("id, bom_code").in("bom_code", codes.slice(i, i + 300)).eq("is_active", true).gt("cut_width", 0).gt("cut_length", 0).order("id").range(from, to));
    for (const l of lines) { const p = prod.get(codeToSku.get(String(l.bom_code)) ?? ""); if (p) p.bom = "cut"; }
  }

  const products = [...prod.values()];
  const used = new Set(products.flatMap((p) => p.group_ids));
  return NextResponse.json({ data: { products, groups: groups.filter((g) => used.has(g.id)) as BomSourceGroup[] }, error: null });
}
