/**
 * วางแผนตัดผ้า (เมนู ผลิต · เฟส 1) — อ่านอย่างเดียว ไม่แก้ข้อมูล
 *   GET ?suggest=1            ผ้าที่ใบสั่งผลิต "ยังไม่ตัด" ใช้อยู่ จัดกลุ่มตามผ้า+หน้ากว้าง (ใช้ร่วมหลายใบ = ตัดรวมได้) + ตัวเลขตัดแยกเดิม
 *   GET ?mo_nos=a,b[&sku=X]   ชิ้นตัดของใบที่เลือก จัดกลุ่มตามผ้า (PlanGroupInput) + สต็อกคงเหลือ + ข้อมูลใบ → หน้าเว็บวางผ้า (lib/fabric-plan)
 * ชิ้นตัด = mo_material_summary.lay_layout (explodeBom เก็บไว้ตอนเปิดใบ/อัพเดตวัตถุดิบตาม BOM) — อ่านเฉพาะช่องที่ใช้ (ไม่ดึงผังทั้งก้อน)
 * ของกลาง: guardApi(products.view) · supabaseAdmin · loadSkuStock (lib/sku-stock) · blocksFromLayout (lib/fabric-plan)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadSkuStock } from "@/lib/sku-stock";
import { blocksFromLayout, type PlanGroupInput } from "@/lib/fabric-plan";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
type LayPart = { blocks?: unknown; face?: unknown; sheet?: unknown };
export type FabricPlanMo = { mo_no: string; id: string; product_sku: string | null; product_name: string | null; qty: number; due_date: string | null; cut_done: boolean; image_url: string | null };
export type FabricSuggest = { key: string; sku: string; name: string | null; uom: string | null; face_width_cm: number; sheet_length_cm: number | null; mos: string[]; pieces: number; separate: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
// lay_layout เป็น array (ทุกวันนี้มีกลุ่มเดียว · เผื่อ 2 กลุ่มหน้ากว้าง) — ดึงแค่ช่องที่ใช้ กันโหลดผังทั้งก้อน (avg ~40KB ต่อแถวตอนคลาย)
const LAY_COLS = "b0:lay_layout->0->blocks, f0:lay_layout->0->face_width_cm, s0:lay_layout->0->sheet_length_cm, b1:lay_layout->1->blocks, f1:lay_layout->1->face_width_cm, s1:lay_layout->1->sheet_length_cm";

function layParts(r: Row): LayPart[] {
  return [{ blocks: r.b0, face: r.f0, sheet: r.s0 }, { blocks: r.b1, face: r.f1, sheet: r.s1 }].filter((p) => Array.isArray(p.blocks) && Number(p.face) > 0);
}

async function openUncutMos(admin: Admin, moNos?: string[]): Promise<Map<string, FabricPlanMo>> {
  let q = admin.from("manufacturing_orders").select("id, mo_no, product_sku, product_name, qty, due_date, internal_due_date, cut_done, status").eq("is_active", true);
  q = moNos ? q.in("mo_no", moNos) : q.not("status", "in", "(done,cancelled)").not("cut_done", "is", true);
  const { data, error } = await q.limit(3000);
  if (error) throw new Error("โหลดใบสั่งผลิตไม่สำเร็จ");
  return new Map(((data ?? []) as Row[]).map((m) => [String(m.mo_no), {
    mo_no: String(m.mo_no), id: String(m.id), product_sku: (m.product_sku as string) ?? null, product_name: (m.product_name as string) ?? null,
    qty: Number(m.qty) || 0, due_date: (m.internal_due_date as string) ?? (m.due_date as string) ?? null, cut_done: !!m.cut_done, image_url: null,
  }]));
}

async function summaries(admin: Admin, moNos: string[], sku?: string | null): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < moNos.length; i += 150) {
    let q = admin.from("mo_material_summary").select(`mo_no, component_sku, component_name, uom, required_lay, ${LAY_COLS}`)
      .in("mo_no", moNos.slice(i, i + 150)).eq("is_active", true).not("required_lay", "is", null);
    if (sku) q = q.eq("component_sku", sku);
    const { data, error } = await q.limit(5000);
    if (error) throw new Error("โหลดชิ้นตัดไม่สำเร็จ ลองใหม่อีกครั้ง");
    out.push(...((data ?? []) as Row[]));
  }
  return out;
}

async function divisors(admin: Admin, codes: string[]): Promise<Map<string, { divisor: number; id: string; name: string | null }>> {
  const m = new Map<string, { divisor: number; id: string; name: string | null }>();
  for (let i = 0; i < codes.length; i += 200) {
    const { data } = await admin.from("skus_v2").select("id, code, sku_name, grp:material_groups!material_group_id ( divisor )").in("code", codes.slice(i, i + 200)).eq("is_active", true);
    for (const s of (data ?? []) as Row[]) {
      const g = (Array.isArray(s.grp) ? s.grp[0] : s.grp) as { divisor?: number } | null;
      m.set(String(s.code), { divisor: Number(g?.divisor) || 90, id: String(s.id), name: (s.sku_name as string) ?? null });
    }
  }
  return m;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;
  try {
    // ── ผ้าที่ตัดรวมได้ (ใบที่ยังไม่ตัด)
    if (sp.get("suggest") === "1") {
      const mos = await openUncutMos(admin);
      const rows = await summaries(admin, [...mos.keys()]);
      const groups = new Map<string, FabricSuggest>();
      for (const r of rows) {
        const sku = String(r.component_sku ?? ""); if (!sku) continue;
        for (const p of layParts(r)) {
          const face = Number(p.face), sheet = Number(p.sheet) > 0 ? Number(p.sheet) : null;
          const key = `${sku}|${face}|${sheet ?? ""}`;
          const g = groups.get(key) ?? groups.set(key, { key, sku, name: (r.component_name as string) ?? null, uom: (r.uom as string) ?? null, face_width_cm: face, sheet_length_cm: sheet, mos: [], pieces: 0, separate: 0 }).get(key)!;
          const mo = String(r.mo_no);
          if (!g.mos.includes(mo)) { g.mos.push(mo); g.separate = r2(g.separate + (Number(r.required_lay) || 0)); }
          g.pieces += blocksFromLayout(mo, { blocks: p.blocks as never }).reduce((a, b) => a + b.total_pieces, 0);
        }
      }
      const list = [...groups.values()].sort((a, b) => b.mos.length - a.mos.length || b.separate - a.separate);
      return NextResponse.json({ data: { groups: list, mos: Object.fromEntries(mos) } });
    }

    // ── ชิ้นตัดของใบที่เลือก → กลุ่มผ้า
    const moNos = [...new Set((sp.get("mo_nos") ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 300);
    if (!moNos.length) return bad("ยังไม่ได้เลือกใบสั่งผลิต");
    const sku = (sp.get("sku") ?? "").trim() || null;
    const mos = await openUncutMos(admin, moNos);
    const rows = await summaries(admin, moNos, sku);
    const codes = [...new Set(rows.map((r) => String(r.component_sku ?? "")).filter(Boolean))];
    const info = await divisors(admin, codes);
    const stock = await loadSkuStock(admin, [...info.values()].map((v) => v.id)).catch(() => new Map());
    const groups = new Map<string, PlanGroupInput>();
    for (const r of rows) {
      const code = String(r.component_sku ?? ""); if (!code) continue;
      const inf = info.get(code);
      for (const p of layParts(r)) {
        const face = Number(p.face), sheet = Number(p.sheet) > 0 ? Number(p.sheet) : null;
        const key = `${code}|${face}|${sheet ?? ""}`;
        const st = inf ? stock.get(inf.id) : undefined;
        const g = groups.get(key) ?? groups.set(key, {
          key, sku: code, name: (r.component_name as string) ?? inf?.name ?? null, uom: (r.uom as string) ?? null,
          face_width_cm: face, sheet_length_cm: sheet, divisor: inf?.divisor ?? 90, blocks: [],
          on_hand: st ? r2(Math.max(0, st.onHand)) : null,   // คงเหลือทั้งหมด (ไม่หักที่จองไว้ — การจองอาจเป็นของใบในแผนนี้เอง)
        }).get(key)!;
        g.blocks.push(...blocksFromLayout(String(r.mo_no), { blocks: p.blocks as never }));
      }
    }
    return NextResponse.json({ data: { groups: [...groups.values()].sort((a, b) => a.sku.localeCompare(b.sku)), mos: Object.fromEntries(mos) } });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ", 503);
  }
}
