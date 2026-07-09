/**
 * SKU Tag Codes — รหัส SKU "จริง" ทุกตระกูลที่ใช้กับแท็ก/ประเภทหนึ่ง (สำหรับ tooltip ใน Wizard)
 *
 * GET /api/skus/tag-codes?family_tag_id=<id>
 *   → { prefixes: [{ prefix, latest_code, suggested, count }], total_skus }
 *
 * แท็กเดียวมีได้หลายตระกูลรหัส (เช่น หนัง → LEA-SAF-xxx, LEA-CCO-xxx)
 * ดึงจาก SKU ที่ผูกแท็กนี้ (m2m) → จัดกลุ่มตามส่วนหน้าตัวเลขท้าย → หาเลขล่าสุด/ถัดไปต่อกลุ่ม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function splitCode(code: string): { prefix: string; num: number | null; digits: number } {
  const m = code.match(/^(.*?)(\d+)$/);
  if (!m) return { prefix: code, num: null, digits: 0 };
  return { prefix: m[1], num: parseInt(m[2], 10), digits: m[2].length };
}

const MAX_SKUS = 6000;   // เพดานดึง (กัน URL/หน่วยความจำบาน) — แท็กใหญ่จะสุ่มเท่านี้

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const tagId = new URL(request.url).searchParams.get("family_tag_id");
  if (!tagId) return NextResponse.json({ error: "ต้องระบุ family_tag_id" }, { status: 400 });

  const admin = supabaseAdmin();
  // SKU ที่ผูกแท็กนี้
  const { data: links } = await admin.from("skus_v2_product_family_m2m")
    .select("src_id").eq("tgt_id", tagId).limit(MAX_SKUS);
  const ids = (links ?? []).map((l) => l.src_id as string);
  if (ids.length === 0) return NextResponse.json({ prefixes: [], total_skus: 0, error: null });

  // ดึงรหัส + ชื่อ + ค่าของ SKU (ผู้ขาย/ราคา/หน้ากว้าง) + วันที่สร้าง (chunk กัน URL ยาว)
  type Sku = { code: string; name: string; seller: string | null; std: number | null; rmb: number | null; fw: number | null; created_at: string };
  const rows: Sku[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const { data } = await admin.from("skus_v2")
      .select("code, name_th, seller_partner_id, standard_price, rmb_cost, fabric_width_cm, created_at").in("id", ids.slice(i, i + 1000));
    for (const r of (data ?? [])) if (r.code) rows.push({
      code: r.code as string, name: (r.name_th as string | null) ?? "",
      seller: (r.seller_partner_id as string | null) ?? null,
      std: (r.standard_price as number | null) ?? null, rmb: (r.rmb_cost as number | null) ?? null,
      fw: (r.fabric_width_cm as number | null) ?? null, created_at: r.created_at as string,
    });
  }

  // จัดกลุ่มตามตระกูลรหัส — เก็บค่าของ SKU ตัวล่าสุดต่อกลุ่มด้วย (ชื่อ/ผู้ขาย/ราคา/หน้ากว้าง)
  type Grp = { prefix: string; count: number; latest: Sku; latest_at: string; num: number; digits: number };
  const map = new Map<string, Grp>();
  for (const r of rows) {
    const sc = splitCode(r.code);
    if (sc.num == null) continue;             // ไม่ลงท้ายด้วยเลข = ข้าม
    const g = map.get(sc.prefix);
    if (!g) { map.set(sc.prefix, { prefix: sc.prefix, count: 1, latest: r, latest_at: r.created_at, num: sc.num, digits: sc.digits }); }
    else {
      g.count++;
      if (r.created_at > g.latest_at) { g.latest_at = r.created_at; g.latest = r; g.num = sc.num; g.digits = sc.digits; }
    }
  }

  const top = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 20);

  // แปลงผู้ขายของ SKU ล่าสุด → ชื่อร้าน
  const sellerIds = [...new Set(top.map((g) => g.latest.seller).filter(Boolean))] as string[];
  const sellerMap = new Map<string, string>();
  if (sellerIds.length) {
    const { data: p } = await admin.from("partners_v2").select("id, name_th").in("id", sellerIds);
    for (const x of (p ?? []) as { id: string; name_th: string | null }[]) sellerMap.set(x.id, x.name_th ?? "");
  }

  const prefixes = top.map((g) => ({
    prefix: g.prefix,
    latest_code: g.latest.code,
    latest_name: g.latest.name,
    latest_seller_id: g.latest.seller,
    latest_seller_name: g.latest.seller ? (sellerMap.get(g.latest.seller) ?? "") : "",
    latest_standard_price: g.latest.std,
    latest_rmb_cost: g.latest.rmb,
    latest_fabric_width: g.latest.fw,
    suggested: g.prefix + String(g.num + 1).padStart(g.digits, "0"),
    count: g.count,
  }));

  return NextResponse.json({ prefixes, total_skus: rows.length, error: null });
}
