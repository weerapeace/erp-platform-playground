/**
 * ผลวัดจริงของแบบตัดผ้า (สินค้า + ผ้า) — ตาราง fabric_cut_checks · หน้า /fabric-calc (เจ้าของขอ 2026-11-13)
 *   GET ?pairs=SKU|ผ้า,SKU2|ผ้า2   ผลล่าสุดต่อคู่ (ไม่เกิน 200 คู่)
 *   POST { product_sku, component_sku, pieces_fp, unit, est_per_unit, actual_total, actual_qty, mo_no?, note? }
 *        → คิด actual_per_unit = actual_total ÷ actual_qty และ variance_pct เทียบ est_per_unit ฝั่งเซิร์ฟเวอร์
 *   DELETE ?id=                    ยกเลิกผลวัด (is_active = false)
 *   สถานะบนหน้าจอ = lib/fabric-buy cutCheckState (pieces_fp ไม่ตรงชิ้นตอนนี้ = กลับเป็น "คาดการณ์")
 * ของกลาง: guardApi(products.view) · supabaseAdmin · requestActor · writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import type { CutCheck } from "@/lib/fabric-buy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PERM = "products.view";
const COLS = "id, product_sku, component_sku, pieces_fp, unit, est_per_unit, actual_per_unit, actual_total, actual_qty, variance_pct, mo_no, note, measured_by_name, measured_at";
const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });
const txt = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : NaN; };

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const pairs = (new URL(request.url).searchParams.get("pairs") ?? "").split(",").map((s) => s.trim()).filter((s) => s.includes("|")).slice(0, 200)
    .map((s) => { const i = s.indexOf("|"); return { sku: s.slice(0, i), comp: s.slice(i + 1) }; }).filter((p) => p.sku && p.comp);
  if (pairs.length === 0) return NextResponse.json({ data: [], error: null });
  const skus = [...new Set(pairs.map((p) => p.sku))];
  const want = new Set(pairs.map((p) => `${p.sku}|${p.comp}`));
  const { data, error } = await supabaseAdmin().from("fabric_cut_checks").select(COLS).in("product_sku", skus).eq("is_active", true).order("measured_at", { ascending: false }).limit(2000);
  if (error) return bad("โหลดผลวัดไม่สำเร็จ", 500);
  const latest = new Map<string, CutCheck>();
  for (const r of (data ?? []) as CutCheck[]) {
    const k = `${r.product_sku}|${r.component_sku}`;
    if (want.has(k) && !latest.has(k)) latest.set(k, { ...r, est_per_unit: r.est_per_unit != null ? Number(r.est_per_unit) : null, actual_per_unit: Number(r.actual_per_unit), actual_total: r.actual_total != null ? Number(r.actual_total) : null, variance_pct: r.variance_pct != null ? Number(r.variance_pct) : null });
  }
  return NextResponse.json({ data: [...latest.values()], error: null });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  const product_sku = txt(b?.product_sku), component_sku = txt(b?.component_sku), pieces_fp = txt(b?.pieces_fp, 4000);
  const total = num(b?.actual_total), qty = Math.floor(num(b?.actual_qty)), est = num(b?.est_per_unit);
  if (!product_sku || !component_sku || !pieces_fp) return bad("ไม่รู้ว่าเป็นสินค้า/ผ้าตัวไหน — ดึงชิ้นจากสูตรหรือใบสั่งผลิตก่อน");
  if (!(total > 0)) return bad("ใส่ผ้าที่ใช้จริงก่อน");
  if (!(qty > 0)) return bad("ใส่จำนวนใบที่ตัดจริงก่อน");
  const per = total / qty;
  const variance = est > 0 ? ((per - est) / est) * 100 : null;
  const actor = await requestActor(supabaseFromRequest(request));
  const admin = supabaseAdmin();
  const row = {
    product_sku, component_sku, pieces_fp, unit: txt(b?.unit, 20) || null, est_per_unit: est > 0 ? est : null,
    actual_per_unit: Math.round(per * 10000) / 10000, actual_total: total, actual_qty: qty, variance_pct: variance != null ? Math.round(variance * 100) / 100 : null,
    mo_no: txt(b?.mo_no, 40) || null, note: txt(b?.note, 500) || null, measured_by: actor.id, measured_by_name: actor.name,
  };
  const { data, error } = await admin.from("fabric_cut_checks").insert(row).select(COLS).single();
  if (error || !data) return bad("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  await writeAudit(admin, { action: "create", entityType: "fabric_cut_check", entityId: (data as { id: string }).id, actorId: actor.id, actorName: actor.name,
    metadata: { code: product_sku, name: `${product_sku} · ${component_sku}`, actual_per_unit: row.actual_per_unit, est_per_unit: row.est_per_unit, variance_pct: row.variance_pct, mo_no: row.mo_no } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad("รหัสไม่ถูกต้อง");
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("fabric_cut_checks").select("product_sku, component_sku").eq("id", id).eq("is_active", true).maybeSingle();
  if (!before) return bad("ไม่พบผลวัดนี้ (อาจถูกยกเลิกแล้ว)", 404);
  const actor = await requestActor(supabaseFromRequest(request));
  const { error } = await admin.from("fabric_cut_checks").update({ is_active: false }).eq("id", id);
  if (error) return bad("ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  const b = before as { product_sku: string; component_sku: string };
  await writeAudit(admin, { action: "delete", entityType: "fabric_cut_check", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { code: b.product_sku, name: `${b.product_sku} · ${b.component_sku}` } });
  return NextResponse.json({ data: { id }, error: null });
}
