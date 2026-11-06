/**
 * Design Sheets — แท็บ "รายละเอียดงาน" (รอบ 1 · 2026-11-05)
 *
 * GET /api/design-sheets/[id]/spec → { pages, pins, colors } เรียงตามลำดับ (pins.no เรียงทั้งใบ)
 * PUT /api/design-sheets/[id]/spec → บันทึกทั้งชุด (ลบหน้าเดิม → หมุดหายตาม cascade → insert ใหม่ตามที่ส่งมา)
 *     + colors (รอบ 2 ตารางสี) → design_sheet_spec_colors 1 แถว/ใบ (ไม่ส่ง colors = ไม่แตะ)
 *
 * หน้า = รูป 1 รูป + สิ่งที่วาด (shapes ผ่าน lib/image-markup cleanMarkupShapes)
 * หมุด = จุดวัตถุดิบบนรูป ผูก SKU (skus_v2) — เก็บ sku_code/sku_name ไว้โชว์แม้ SKU ถูกลบ
 * ของกลาง: guardApi (products.view / products.edit) · supabaseAdmin (RLS deny-all) · writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { cleanMarkupShapes, type MarkupShape } from "@/lib/image-markup";
import { cleanSpecColors, specColorsEmpty, EMPTY_SPEC_COLORS, type SpecColorTable } from "@/lib/design-sheet-spec-colors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SpecPin = {
  id?: string; page_id?: string; no?: number;
  x: number; y: number; part_name: string | null;
  part_code?: string | null;       // ส่วนประกอบจากรายการกลาง material_slots (v2)
  label_dx?: number | null; label_dy?: number | null;   // ป้ายชื่อข้างหมุด ห่างจากหมุด (%) · null = ตั้งต้น
  sku_id: string | null; sku_code: string | null; sku_name: string | null;
  sku_image_key?: string | null;   // รูปปก SKU (GET เติมให้ · ไม่ได้เก็บ)
  qty: number | null; uom: string | null; note: string | null;
};
export type SpecPage = {
  id?: string; title: string | null; image_key: string | null; image_url: string;
  image_w: number | null; image_h: number | null; shapes: MarkupShape[]; sort_order?: number;
};
export type SpecPutPage = SpecPage & { pins: SpecPin[] };

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const txt = (v: unknown, max = 300): string | null => { const s = typeof v === "string" ? v.trim().slice(0, max) : ""; return s || null; };
const pct = (v: unknown): number | null => { const n = num(v); return n == null ? null : Math.round(Math.min(100, Math.max(0, n)) * 100) / 100; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const [pg, pn, co] = await Promise.all([
    admin.from("design_sheet_spec_pages").select("id, title, image_key, image_url, image_w, image_h, shapes, sort_order")
      .eq("sheet_id", id).order("sort_order", { ascending: true }),
    admin.from("design_sheet_spec_pins").select("id, page_id, no, x, y, part_name, part_code, label_dx, label_dy, sku_id, sku_code, sku_name, qty, uom, note")
      .eq("sheet_id", id).order("no", { ascending: true }),
    admin.from("design_sheet_spec_colors").select("data").eq("sheet_id", id).maybeSingle(),
  ]);
  const err = pg.error ?? pn.error ?? co.error;
  if (err) return NextResponse.json({ pages: [], pins: [], colors: EMPTY_SPEC_COLORS, error: friendlyDbError(err.message) }, { status: 500 });
  const colors: SpecColorTable = cleanSpecColors(co.data?.data);
  const pins = (pn.data ?? []) as SpecPin[];
  // เติมรหัส/ชื่อ/รูป SKU ล่าสุด (เผื่อแก้ชื่อ SKU ทีหลัง) — SKU ที่ถูกลบใช้ค่าที่เก็บไว้
  const skuIds = Array.from(new Set(pins.map((p) => p.sku_id).filter((v): v is string => !!v)));
  if (skuIds.length) {
    const { data: skus } = await admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key").in("id", skuIds);
    const byId = new Map((skus ?? []).map((s) => [s.id as string, s]));
    for (const p of pins) {
      const s = p.sku_id ? byId.get(p.sku_id) : undefined;
      if (s) { p.sku_code = (s.code as string) ?? p.sku_code; p.sku_name = (s.name_th as string) ?? p.sku_name; p.sku_image_key = (s.cover_image_r2_key as string | null) ?? null; }
    }
  }
  return NextResponse.json({ pages: (pg.data ?? []) as SpecPage[], pins, colors, error: null });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { pages?: SpecPutPage[]; colors?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const pages = (Array.isArray(body.pages) ? body.pages : []).slice(0, 30).filter((p) => txt(p?.image_url, 2000));

  const admin = supabaseAdmin();
  const { error: delErr } = await admin.from("design_sheet_spec_pages").delete().eq("sheet_id", id);   // หมุดลบตาม cascade
  if (delErr) return NextResponse.json({ error: friendlyDbError(delErr.message) }, { status: 400 });

  let pinNo = 0, shapeCount = 0;
  const pinRows: Record<string, unknown>[] = [];
  if (pages.length) {
    const pageRows = pages.map((p, i) => {
      const shapes = cleanMarkupShapes(p.shapes);
      shapeCount += shapes.length;
      return {
        sheet_id: id, title: txt(p.title, 120), image_key: txt(p.image_key, 500), image_url: txt(p.image_url, 2000),
        image_w: num(p.image_w), image_h: num(p.image_h), shapes, sort_order: i + 1, created_by: user?.id ?? null,
      };
    });
    const { data: inserted, error: insErr } = await admin.from("design_sheet_spec_pages").insert(pageRows).select("id, sort_order");
    if (insErr) return NextResponse.json({ error: friendlyDbError(insErr.message) }, { status: 400 });
    const idByOrder = new Map((inserted ?? []).map((r) => [r.sort_order as number, r.id as string]));
    pages.forEach((p, i) => {
      const pageId = idByOrder.get(i + 1); if (!pageId) return;
      for (const pin of (Array.isArray(p.pins) ? p.pins : []).slice(0, 200)) {
        const x = pct(pin?.x), y = pct(pin?.y);
        if (x == null || y == null) continue;
        const skuId = typeof pin.sku_id === "string" && UUID.test(pin.sku_id) ? pin.sku_id : null;
        const ldx = num(pin.label_dx), ldy = num(pin.label_dy);
        pinRows.push({
          sheet_id: id, page_id: pageId, no: ++pinNo, x, y, part_name: txt(pin.part_name, 120), part_code: txt(pin.part_code, 60),
          label_dx: ldx == null ? null : Math.max(-100, Math.min(100, ldx)), label_dy: ldy == null ? null : Math.max(-100, Math.min(100, ldy)),
          sku_id: skuId, sku_code: skuId ? txt(pin.sku_code, 80) : null, sku_name: skuId ? txt(pin.sku_name, 300) : null,
          qty: num(pin.qty), uom: txt(pin.uom, 30), note: txt(pin.note, 500),
        });
      }
    });
    if (pinRows.length) {
      const { error: pinErr } = await admin.from("design_sheet_spec_pins").insert(pinRows);
      if (pinErr) return NextResponse.json({ error: friendlyDbError(pinErr.message) }, { status: 400 });
    }
  }

  // ตารางสี (รอบ 2) — ส่งมาเมื่อไหร่ก็แทนทั้งก้อน · ว่างทั้งหมด = ลบแถวทิ้ง
  let colorCounts: { rows: number; colorways: number } | null = null;
  if (body.colors !== undefined) {
    const colors = cleanSpecColors(body.colors);
    const { error: cErr } = specColorsEmpty(colors)
      ? await admin.from("design_sheet_spec_colors").delete().eq("sheet_id", id)
      : await admin.from("design_sheet_spec_colors").upsert({ sheet_id: id, data: colors, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "sheet_id" });
    if (cErr) return NextResponse.json({ error: friendlyDbError(cErr.message) }, { status: 400 });
    colorCounts = { rows: colors.rows.length, colorways: colors.colorways.length };
  }

  await writeAudit(admin, {
    action: "spec_update", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { pages: pages.length, pins: pinRows.length, shapes: shapeCount, ...(colorCounts ? { color_rows: colorCounts.rows, colorways: colorCounts.colorways } : {}) },
  });
  return NextResponse.json({ pages: pages.length, pins: pinRows.length, shapes: shapeCount, colors: colorCounts, error: null });
}
