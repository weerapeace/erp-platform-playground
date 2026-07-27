/**
 * ต้นทุนมาตรฐานของสินค้า — module "คำนวณต้นทุน"
 *
 * GET  ?sku=<child sku>   → cost inputs (จาก BOM + ราคา) + ต้นทุนที่บันทึกไว้ (parent default + sku override) + ประวัติ
 * POST { target_type, target_code, qty_basis, scenario, summary, note }  → บันทึกเวอร์ชันใหม่ (ตัวก่อนเป็นประวัติ)
 *
 * BOM ผูกที่ SKU ลูก → module เลือก SKU ลูกเพื่อดึงวัตถุดิบ/ราคา · บันทึกได้เป็น Parent(ทุกสี) หรือ SKU นี้
 * ของกลาง: guardApi + supabaseAdmin + writeAudit · สูตรคิดใช้ lib/cost-calc ฝั่งหน้า
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import type { MoCostMaterial } from "@/app/api/mo/[id]/cost/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const r4 = (n: number) => Math.round(n * 10000) / 10000;

type SavedCosting = { id: string; target_type: string; target_code: string; qty_basis: number; scenario: unknown; summary: unknown; note: string | null; created_by_name: string | null; created_at: string };

async function currentCosting(admin: ReturnType<typeof supabaseAdmin>, type: string, code: string): Promise<SavedCosting | null> {
  if (!code) return null;
  const { data } = await admin.from("product_costings")
    .select("id, target_type, target_code, qty_basis, scenario, summary, note, created_by_name, created_at")
    .eq("target_type", type).eq("target_code", code).eq("is_current", true).eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as SavedCosting | null) ?? null;
}

/** 1 รายการในลิสต์ "คิดล่าสุด" (โชว์หน้าแรกของเครื่องคิดต้นทุน ตอนยังไม่เลือกสินค้า) */
export type RecentCosting = {
  target_type: "parent" | "sku"; target_code: string;
  open_sku: string | null;        // SKU ที่กดแล้วเปิดได้ (parent เก็บรหัสรุ่น → หยิบลูกตัวแรกมาเปิด)
  name: string | null; image: string | null;
  cost_pp: number; profit_pp: number; margin_pct: number;
  qty_basis: number; created_at: string; by: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;

  // ?recent=1 → รายการที่คิด/แก้ล่าสุด (ไว้กดกลับเข้าไปดูต่อ)
  if (sp.get("recent")) {
    const a = supabaseAdmin();
    const limit = Math.min(20, Math.max(1, parseInt(sp.get("limit") ?? "8", 10)));
    const { data } = await a.from("product_costings")
      .select("target_type, target_code, qty_basis, summary, created_at, created_by_name")
      .eq("is_current", true).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(limit);
    const rows = (data ?? []) as Record<string, unknown>[];
    const str = (v: unknown) => (v == null ? "" : String(v));

    const parentCodes = rows.filter((r) => r.target_type === "parent").map((r) => str(r.target_code));
    const skuCodes = rows.filter((r) => r.target_type !== "parent").map((r) => str(r.target_code));

    // รุ่น (parent): ชื่อ + หยิบ SKU ลูกตัวแรกไว้ให้กดเปิด + รูปของลูก
    const pInfo = new Map<string, { name: string | null; child: string | null; img: string | null }>();
    if (parentCodes.length) {
      const { data: ps } = await a.from("parent_skus_v2").select("id, code, name_th").in("code", parentCodes);
      const idByCode = new Map<string, string>();
      for (const p of (ps ?? []) as Record<string, unknown>[]) {
        idByCode.set(str(p.code), str(p.id));
        pInfo.set(str(p.code), { name: (p.name_th as string) ?? null, child: null, img: null });
      }
      const ids = [...idByCode.values()];
      if (ids.length) {
        const { data: kids } = await a.from("skus_v2").select("code, parent_sku_id, cover_image_r2_key")
          .in("parent_sku_id", ids).eq("is_active", true).order("code", { ascending: true });
        const firstKid = new Map<string, Record<string, unknown>>();
        for (const k of (kids ?? []) as Record<string, unknown>[]) if (!firstKid.has(str(k.parent_sku_id))) firstKid.set(str(k.parent_sku_id), k);
        for (const [code, id] of idByCode) {
          const k = firstKid.get(id); const cur = pInfo.get(code);
          if (cur && k) { cur.child = str(k.code); cur.img = (k.cover_image_r2_key as string) ?? null; }
        }
      }
    }
    const sInfo = new Map<string, { name: string | null; img: string | null }>();
    if (skuCodes.length) {
      const { data: ss } = await a.from("skus_v2").select("code, name_th, cover_image_r2_key").in("code", skuCodes);
      for (const x of (ss ?? []) as Record<string, unknown>[]) sInfo.set(str(x.code), { name: (x.name_th as string) ?? null, img: (x.cover_image_r2_key as string) ?? null });
    }
    const numOf = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
    const out: RecentCosting[] = rows.map((r) => {
      const code = str(r.target_code); const isParent = r.target_type === "parent";
      const p = isParent ? pInfo.get(code) : undefined; const s2 = !isParent ? sInfo.get(code) : undefined;
      const sum = (r.summary ?? {}) as Record<string, unknown>;
      return {
        target_type: isParent ? "parent" : "sku", target_code: code,
        open_sku: isParent ? (p?.child ?? null) : code,
        name: (isParent ? p?.name : s2?.name) ?? null,
        image: (isParent ? p?.img : s2?.img) ?? null,
        cost_pp: numOf(sum.cost_pp), profit_pp: numOf(sum.profit_pp), margin_pct: numOf(sum.margin_pct),
        qty_basis: numOf(r.qty_basis) || 1, created_at: str(r.created_at),
        by: str(r.created_by_name) || null,
      };
    });
    return NextResponse.json({ data: out, error: null });
  }

  const sku = (sp.get("sku") ?? "").trim();
  if (!sku) return NextResponse.json({ error: "ระบุ sku" }, { status: 400 });
  const admin = supabaseAdmin();

  // สินค้า + parent
  const { data: skuRow } = await admin.from("skus_v2").select("code, name_th, parent_sku_id, list_price, standard_price").eq("code", sku).maybeSingle();
  if (!skuRow) return NextResponse.json({ error: "ไม่พบ SKU" }, { status: 404 });
  const s = skuRow as Record<string, unknown>;
  let parentCode: string | null = null;
  if (s.parent_sku_id) {
    const { data: p } = await admin.from("parent_skus_v2").select("code").eq("id", s.parent_sku_id).maybeSingle();
    parentCode = (p as { code?: string } | null)?.code ?? null;
  }

  // BOM หลัก (default → ล่าสุด) ของ SKU นี้
  const { data: bh } = await admin.from("bom_headers").select("bom_code, is_default")
    .eq("product_sku", sku).eq("is_active", true)
    .order("is_default", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const bomCode = (bh as { bom_code?: string } | null)?.bom_code ?? null;

  let materials: MoCostMaterial[] = []; let material_cost_pp = 0; let missing_price = 0;
  let central_rate = 0; let system_piece: { job_name: string; rate: number; qty_per: number }[] = [];
  if (bomCode) {
    const [{ data: lines }, { data: lr }, { data: pw }] = await Promise.all([
      admin.from("bom_lines").select("component_sku, component_name, material_type, uom, qty").eq("bom_code", bomCode).eq("is_active", true).order("sequence", { ascending: true }),
      admin.from("bom_labor_rates").select("rate").eq("bom_code", bomCode).is("craftsman_id", null).eq("is_current", true).eq("is_active", true).maybeSingle(),
      admin.from("bom_piecework_lines").select("job_name, rate, qty_per").eq("bom_code", bomCode).eq("is_active", true).order("sequence", { ascending: true }),
    ]);
    central_rate = num((lr as { rate?: number } | null)?.rate);
    system_piece = ((pw ?? []) as Record<string, unknown>[]).map((x) => ({ job_name: String(x.job_name ?? ""), rate: num(x.rate), qty_per: num(x.qty_per) || 1 }));

    const lineRows = (lines ?? []) as Record<string, unknown>[];
    const codes = [...new Set(lineRows.map((x) => x.component_sku).filter(Boolean))] as string[];
    const stdMap = new Map<string, number>();
    if (codes.length) {
      const { data: cs } = await admin.from("skus_v2").select("code, standard_price").in("code", codes);
      for (const c of (cs ?? []) as Record<string, unknown>[]) stdMap.set(String(c.code), num(c.standard_price));
    }
    materials = lineRows.map((x) => {
      const csku = (x.component_sku as string) ?? null; const qp = num(x.qty);
      const unit = csku ? (stdMap.get(csku) ?? 0) : 0; const line = r4(unit * qp);
      const has = unit > 0; if (!has) missing_price += 1; material_cost_pp += line;
      return { sku: csku, name: (x.component_name as string) ?? null, material_type: (x.material_type as string) ?? null, uom: (x.uom as string) ?? null, qty_per: qp, unit_cost: unit, line_pp: line, has_price: has };
    });
    material_cost_pp = r4(material_cost_pp);
  }

  const [savedSku, savedParent] = await Promise.all([
    currentCosting(admin, "sku", sku),
    currentCosting(admin, "parent", parentCode ?? ""),
  ]);

  return NextResponse.json({
    error: null,
    inputs: {
      product_sku: sku, product_name: (s.name_th as string) ?? sku, parent_code: parentCode, bom_code: bomCode,
      sell_price: num(s.list_price), material_cost_pp, materials, missing_price,
      central_rate, est_labor_pp: 0, system_piece,
    },
    saved: { sku: savedSku, parent: savedParent },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const body = await request.json().catch(() => ({}));
  const targetType = body.target_type === "sku" ? "sku" : "parent";
  const targetCode = String(body.target_code ?? "").trim();
  if (!targetCode) return NextResponse.json({ error: "ระบุสินค้าปลายทาง" }, { status: 400 });
  const admin = supabaseAdmin();

  // ตัวก่อน → เก็บเป็นประวัติ (is_current=false)
  await admin.from("product_costings").update({ is_current: false })
    .eq("target_type", targetType).eq("target_code", targetCode).eq("is_current", true);

  const { data: ins, error } = await admin.from("product_costings").insert({
    target_type: targetType, target_code: targetCode, qty_basis: num(body.qty_basis) || 1,
    scenario: body.scenario ?? {}, summary: body.summary ?? {}, note: String(body.note ?? "").trim() || null,
    is_current: true, created_by: user?.id ?? null, created_by_name: user?.email ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "product_costing", entityId: (ins as { id: string }).id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { target_type: targetType, target_code: targetCode },
  });
  return NextResponse.json({ error: null, id: (ins as { id: string }).id });
}
