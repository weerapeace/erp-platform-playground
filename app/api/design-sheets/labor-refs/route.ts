/**
 * 🧵 ค่าแรงที่เคยผลิต — ตัวเลือกอ้างอิงของ "ค่าแรงผลิต" ในแท็บตีราคา (เจ้าของขอ 2026-11-07 "ดูว่าอะไรเคยผลิตเท่าไหร่ กดเลือกได้")
 *   bom = ค่าแรงกลางต่อชิ้นในสูตรผลิต (bom_labor_rates ไม่ระบุช่าง · ล่าสุด) — รวมต่อรุ่น
 *   wo  = จ่ายจริงจากใบจ่ายงาน (mo_work_orders.labor_cost ÷ qty) — ล่าสุดต่อรุ่น + ขั้นตอน
 *   ds  = ค่าแรงผลิตที่เคยตีไว้ในใบงานออกแบบอื่น (design_sheets.cost_extra)
 *   สิทธิ์: เห็นต้นทุน (products.cost.view) · อ่านอย่างเดียว
 *   image = รูปปกของรุ่น (parent_skus_v2.cover_image_r2_key) · ใบงาน = รูปหลักแกลเลอรีของใบ (เจ้าของขอ 2026-11-09 "ขอรูปด้วย")
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { parentOfCode, type LaborRef } from "@/lib/design-cost-presets";
import { extraKindOf, type SnapExtra } from "@/lib/design-sheet-cost-snapshot";
import { r2ImageUrl } from "@/lib/r2-image";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = { assemble: "ประกอบ", cut: "ตัด", sew: "เย็บ", prep: "เตรียม", qc: "QC", pack: "แพ็ก", print: "พิมพ์", screen: "สกรีน" };
const r2 = (v: number) => Math.round(v * 100) / 100;

export async function GET(request: Request) {
  const denied = await guardApi(request, COST_PERM); if (denied) return denied;
  const url = new URL(request.url);
  const exclude = url.searchParams.get("exclude");   // ใบงานที่เปิดอยู่ (ไม่โชว์ตัวเอง)
  const admin = supabaseAdmin();
  const [rates, wos, sheets] = await Promise.all([
    admin.from("bom_labor_rates").select("bom_code, rate, created_at").eq("is_current", true).is("craftsman_id", null).gt("rate", 0).limit(2000),
    admin.from("mo_work_orders").select("product_sku, product_name, stage, qty, labor_cost, created_at").gt("labor_cost", 0).gt("qty", 0)
      .not("is_active", "is", false).order("created_at", { ascending: false }).limit(2000),
    admin.from("design_sheets").select("id, code, name, cost_extra, updated_at").not("cost_extra", "is", null).order("updated_at", { ascending: false }).limit(500),
  ]);

  // ชื่อสินค้าของ BOM (สูตรผลิต → สินค้า) — จากชื่อในใบจ่ายงานก่อน (มีชื่อเต็ม) ไม่มีค่อยใช้รหัส
  const nameByParent = new Map<string, string>();
  for (const w of wos.data ?? []) {
    const p = parentOfCode(String(w.product_sku ?? ""));
    if (p && w.product_name && !nameByParent.has(p)) nameByParent.set(p, String(w.product_name));
  }

  // bom: รวมต่อรุ่น (หลายสีมักราคาเดียวกัน) → แสดงช่วงราคา
  const bomByParent = new Map<string, { min: number; max: number; n: number; at: string }>();
  for (const r of rates.data ?? []) {
    const p = parentOfCode(String(r.bom_code ?? ""));
    if (!p) continue;
    const v = Number(r.rate) || 0;
    const cur = bomByParent.get(p);
    if (!cur) bomByParent.set(p, { min: v, max: v, n: 1, at: String(r.created_at ?? "") });
    else { cur.min = Math.min(cur.min, v); cur.max = Math.max(cur.max, v); cur.n++; if (String(r.created_at) > cur.at) cur.at = String(r.created_at); }
  }
  const bom: LaborRef[] = [...bomByParent.entries()].map(([code, x]): LaborRef => ({
    source: "bom", code, name: nameByParent.get(code) ?? code, amount: x.max,
    note: x.min !== x.max ? `${x.min}–${x.max} บาท (${x.n} สี)` : x.n > 1 ? `${x.n} สี` : null, at: x.at.slice(0, 10) || null,
  })).sort((a, b) => String(b.at).localeCompare(String(a.at)));

  // wo: ล่าสุดต่อรุ่น + ขั้นตอน
  const woSeen = new Set<string>();
  const wo: LaborRef[] = [];
  for (const w of wos.data ?? []) {
    const p = parentOfCode(String(w.product_sku ?? ""));
    const key = `${p}|${w.stage ?? ""}`;
    if (!p || woSeen.has(key)) continue;
    woSeen.add(key);
    const qty = Number(w.qty) || 0;
    wo.push({ source: "wo", code: p, name: String(w.product_name ?? p), amount: r2((Number(w.labor_cost) || 0) / qty),
      note: `${STAGE_LABEL[String(w.stage)] ?? String(w.stage ?? "")} · ${qty.toLocaleString("th-TH")} ชิ้น`, at: String(w.created_at ?? "").slice(0, 10) || null });
  }

  // ds: ค่าแรงผลิตที่เคยตีไว้ (ทุกแท็บของใบ)
  const ds: LaborRef[] = [];
  const dsSheetId = new Map<LaborRef, string>();
  for (const s of sheets.data ?? []) {
    if (exclude && s.id === exclude) continue;
    const ce = s.cost_extra as unknown;
    const groups: [string, unknown][] = Array.isArray(ce) ? [["", ce]] : ce && typeof ce === "object" ? Object.entries(ce as Record<string, unknown>) : [];
    for (const [tab, arr] of groups) {
      if (!Array.isArray(arr)) continue;
      for (const e of arr as SnapExtra[]) {
        const amt = Number(e?.amount) || 0;
        if (amt > 0 && extraKindOf(e) === "labor") { const ref: LaborRef = { source: "ds", code: String(s.code ?? ""), name: String(s.name ?? ""), amount: r2(amt), note: tab || null, at: String(s.updated_at ?? "").slice(0, 10) || null }; ds.push(ref); dsSheetId.set(ref, String(s.id)); }
      }
    }
  }

  // รูป: รุ่น (bom/wo) = รูปปกของ Parent · ใบงาน (ds) = รูปหลักแกลเลอรี (ไม่มีรูปหลัก = รูปแรก)
  const codes = [...new Set([...bom, ...wo].map((r) => r.code).filter(Boolean))];
  const sheetIds = [...new Set(dsSheetId.values())];
  const [parents, atts] = await Promise.all([
    codes.length ? admin.from("parent_skus_v2").select("id, code, cover_image_r2_key").in("code", codes.slice(0, 600)).eq("is_active", true) : Promise.resolve({ data: [] }),
    sheetIds.length ? admin.from("erp_playground_attachments").select("entity_id, file_path, content_type, is_primary, sort_order").eq("entity_type", "design_sheet").in("entity_id", sheetIds) : Promise.resolve({ data: [] }),
  ]);
  const coverByCode = new Map<string, string>();
  const noCover = new Map<string, string>();   // parent id → code (รุ่นที่ไม่มีรูปปก → ใช้รูปของสีแรกแทน)
  for (const p of (parents.data ?? []) as Array<{ id: string; code: string | null; cover_image_r2_key: string | null }>) {
    const code = String(p.code ?? "").trim(); if (!code) continue;
    const u = r2ImageUrl(p.cover_image_r2_key, 160);
    if (u) { if (!coverByCode.has(code)) coverByCode.set(code, u); } else noCover.set(String(p.id), code);
  }
  if (noCover.size) {
    const { data: kids } = await admin.from("skus_v2").select("parent_sku_id, code, cover_image_r2_key")
      .in("parent_sku_id", [...noCover.keys()]).eq("is_active", true).not("cover_image_r2_key", "is", null).order("code", { ascending: true });
    for (const k of (kids ?? []) as Array<{ parent_sku_id: string; cover_image_r2_key: string | null }>) {
      const code = noCover.get(String(k.parent_sku_id)); const u = r2ImageUrl(k.cover_image_r2_key, 160);
      if (code && u && !coverByCode.has(code)) coverByCode.set(code, u);
    }
  }
  const bestAtt = new Map<string, { key: string; rank: number }>();
  for (const a of (atts.data ?? []) as Array<{ entity_id: string; file_path: string | null; content_type: string | null; is_primary: boolean | null; sort_order: number | null }>) {
    if (!a.file_path || !String(a.content_type ?? "").startsWith("image/")) continue;
    const rank = (a.is_primary ? 0 : 1_000_000) + (Number(a.sort_order) || 0);
    const cur = bestAtt.get(String(a.entity_id));
    if (!cur || rank < cur.rank) bestAtt.set(String(a.entity_id), { key: a.file_path, rank });
  }
  for (const r of [...bom, ...wo]) r.image = coverByCode.get(r.code) ?? null;
  for (const r of ds) { const k = bestAtt.get(dsSheetId.get(r) ?? ""); r.image = k ? r2ImageUrl(k.key, 160) : null; }

  return NextResponse.json({ data: { bom, wo, ds }, error: null });
}
