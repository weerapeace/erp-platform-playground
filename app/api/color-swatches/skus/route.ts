/**
 * /api/color-swatches/skus — 🧹 ทะเบียนสี: ดู / เปลี่ยน "ชื่อสีใน SKU" (เจ้าของขอ 2026-11-11 ข้อ 1/2/4)
 *   GET ?names=ชื่อ1|ชื่อ2 → { skus: SKU ที่ชื่อสีบนเว็บ (สี (ไทย) ก่อน Color = baseColor) ตรงกับชื่อนี้,
 *                             parentLabels: { parentId: ชื่อสีทุกตัวของรุ่นนั้น } — ไว้เช็กว่าเปลี่ยนแล้วชื่อชนกันในรุ่นเดียวไหม }
 *   GET ?codes=WK21-02|WK18-02 → { colorOf: { รหัส: ชื่อสีของ SKU นั้น } } — เซ็ตของขวัญที่ช่องสีเป็นรหัสชิ้นในเซ็ต
 *   POST { changes: [{ id, from, to }] } → เปลี่ยนชื่อสี (ช่องไหนตรงกับ from ก็เปลี่ยนช่องนั้น: สี (ไทย) / Color · คงท้าย "/ S" ของ SKU ไซส์)
 *        ค่าปัจจุบันไม่ตรง from (มีคนแก้ไปแล้ว) = ข้ามตัวนั้น · audit ทุก SKU (ก่อน/หลัง) · ล้างแคชเว็บร้านทุกร้านครั้งเดียว
 * หน้าจอต้องโชว์พรีวิว + ให้เจ้าของกดยืนยันก่อนเรียก POST เสมอ (แตะข้อมูลจริง)
 * สิทธิ์: อ่าน products.view · เปลี่ยน products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { auditDiff, writeAuditMany } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { normColorName } from "@/lib/color-swatch";
import { renamedField } from "@/lib/color-name-tools";
import { baseColor, variantValue } from "@/lib/website-size-options";
import { fetchAllPages } from "@/lib/fetch-all";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type K = { id: string; code: string | null; name_th: string | null; color: string | null; color_th: string | null; attribute_values: Record<string, unknown> | null; parent_sku_id: string | null };
const SEL = "id, code, name_th, color, color_th, attribute_values, parent_sku_id";
const MAX_NAMES = 30;
const MAX_CHANGES = 500;
const esc = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const sp = request.nextUrl.searchParams;

  const codesParam = sp.get("codes");
  if (codesParam !== null) {
    const codes = [...new Set(codesParam.split("|").map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 60);
    if (!codes.length) return NextResponse.json({ data: { colorOf: {} }, error: null });
    const { data } = await sb.from("skus_v2").select("code, color, color_th, attribute_values").in("code", codes);
    const colorOf: Record<string, string> = {};
    for (const k of (data ?? []) as K[]) if (k.code) colorOf[k.code.toUpperCase()] = baseColor(k);
    return NextResponse.json({ data: { colorOf }, error: null });
  }

  const names = [...new Set((sp.get("names") ?? "").split("|").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_NAMES);
  if (!names.length) return NextResponse.json({ data: { skus: [], parentLabels: {} }, error: null });
  const want = new Set(names.map(normColorName));
  // หาได้ทั้งช่อง Color และ สี (ไทย) (+ ท้าย "/ ไซส์") แล้วกรองให้ตรงชื่อที่เว็บโชว์จริง
  const found = new Map<string, K>();
  for (const n of names) {
    for (const col of ["color", "color_th"] as const) {
      // ตรงทั้งช่อง หรือมีท้าย "/ ไซส์" (SKU ไซส์ข้อมูลเก่า) — ไม่ใช้ขึ้นต้นเฉย ๆ ("ดำ%" ได้หลายพันแถว)
      for (const pat of [esc(n), `${esc(n)}%/%`]) {
        const rows = await fetchAllPages<K>((from, to) => sb.from("skus_v2").select(SEL).ilike(col, pat).eq("is_active", true).order("code").range(from, to));
        for (const k of rows) if (want.has(normColorName(baseColor(k)))) found.set(k.id, k);
      }
    }
  }
  const kids = [...found.values()];
  const parentIds = [...new Set(kids.map((k) => k.parent_sku_id).filter((x): x is string => !!x))];
  const [{ data: parents }, { data: listings }, siblings] = await Promise.all([
    parentIds.length ? sb.from("parent_skus_v2").select("id, code").in("id", parentIds) : Promise.resolve({ data: [] }),
    parentIds.length ? sb.from("store_listings").select("parent_sku_id").in("parent_sku_id", parentIds).eq("is_published", true) : Promise.resolve({ data: [] }),
    parentIds.length
      ? fetchAllPages<K>((from, to) => sb.from("skus_v2").select(SEL).in("parent_sku_id", parentIds).eq("is_active", true).order("id").range(from, to))
      : Promise.resolve([] as K[]),
  ]);
  const pCode = new Map(((parents ?? []) as { id: string; code: string | null }[]).map((p) => [p.id, p.code ?? ""]));
  const onWeb = new Set(((listings ?? []) as { parent_sku_id: string }[]).map((l) => l.parent_sku_id));
  const parentLabels: Record<string, string[]> = {};
  for (const s of siblings) {
    if (!s.parent_sku_id) continue;
    const label = baseColor(s);
    if (!label) continue;
    const list = (parentLabels[s.parent_sku_id] ??= []);
    if (!list.includes(label)) list.push(label);
  }
  return NextResponse.json({
    data: {
      skus: kids.map((k) => ({
        id: k.id, code: k.code ?? "", name: k.name_th ?? "", label: baseColor(k), color: k.color ?? "", colorTh: k.color_th ?? "",
        parentId: k.parent_sku_id, parentCode: k.parent_sku_id ? pCode.get(k.parent_sku_id) ?? "" : "", onWeb: !!k.parent_sku_id && onWeb.has(k.parent_sku_id),
      })),
      parentLabels,
    },
    error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "products.edit")))
    return NextResponse.json({ error: "ต้องมีสิทธิ์แก้สินค้า (products.edit) จึงเปลี่ยนชื่อสีใน SKU ได้" }, { status: 401 });
  let b: { changes?: unknown };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const raw = Array.isArray(b.changes) ? (b.changes as { id?: unknown; from?: unknown; to?: unknown }[]) : [];
  if (!raw.length || raw.length > MAX_CHANGES) return NextResponse.json({ error: `เปลี่ยนได้ครั้งละ 1–${MAX_CHANGES} SKU` }, { status: 400 });
  const changes = raw.map((c) => ({ id: String(c?.id ?? ""), from: String(c?.from ?? "").trim(), to: String(c?.to ?? "").trim().replace(/\s+/g, " ") }));
  const bad = changes.find((c) => !c.id || !c.from || !c.to || c.to.length > 120);
  if (bad) return NextResponse.json({ error: bad.to.length > 120 ? "ชื่อสียาวเกิน 120 ตัวอักษร" : "ข้อมูลไม่ครบ (ต้องมี SKU · ชื่อเดิม · ชื่อใหม่)" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const ids = [...new Set(changes.map((c) => c.id))];
  const rows: K[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("skus_v2").select(SEL).in("id", ids.slice(i, i + 200));
    rows.push(...((data ?? []) as K[]));
  }
  const byId = new Map(rows.map((k) => [k.id, k]));

  const results: { id: string; ok: boolean; error?: string }[] = [];
  const audits: Parameters<typeof writeAuditMany>[1] = [];
  for (const c of changes) {
    const k = byId.get(c.id);
    if (!k) { results.push({ id: c.id, ok: false, error: "ไม่พบ SKU" }); continue; }
    const v = variantValue(k);
    const nextTh = renamedField(k.color_th, c.from, c.to, v);
    const nextEn = renamedField(k.color, c.from, c.to, v);
    if (nextTh === null && nextEn === null) { results.push({ id: c.id, ok: false, error: "ชื่อสีของ SKU นี้เปลี่ยนไปแล้ว — โหลดใหม่แล้วลองอีกครั้ง" }); continue; }
    const patch: Record<string, string> = {};
    if (nextTh !== null) patch.color_th = nextTh;
    if (nextEn !== null) patch.color = nextEn;
    const { error } = await admin.from("skus_v2").update(patch).eq("id", k.id);
    if (error) { results.push({ id: c.id, ok: false, error: "บันทึกไม่สำเร็จ" }); continue; }
    results.push({ id: c.id, ok: true });
    audits.push({
      action: "update", entityType: "skus_v2", entityId: k.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { source: "color_registry_rename", code: k.code, from: c.from, to: c.to, changes: auditDiff({ color: k.color, color_th: k.color_th }, patch) },
    });
  }
  if (audits.length) await writeAuditMany(admin, audits);

  // ชื่อสีเปลี่ยน = ปุ่มเลือกสี/จุดสี/ตัวกรองบนเว็บเปลี่ยน → ล้างแคชทุกร้านครั้งเดียว
  let purged = 0;
  if (audits.length) {
    const { data: shops } = await admin.from("shops").select("id").eq("status", "active");
    purged = (await Promise.all(((shops ?? []) as { id: string }[]).map((s) => purgeStorefrontCache(admin, s.id)))).filter(Boolean).length;
  }
  return NextResponse.json({ data: { results, changed: audits.length, purged }, error: null });
}
