/**
 * /api/sku-swatches — 🎨 Swatch = รูปแผ่นตัวอย่าง (การ์ดสีผ้า/ด้าย/อะไหล่) + จุดบนรูปที่ผูกกับ SKU
 * (แท็บ Swatch ในหน้า /master/skus)
 *
 *   GET    ?search=&family_ids=&limit=&offset=   → รายการแผ่น (รูปย่อ + จำนวนจุด + จำนวนที่ผูกแล้ว + ชื่อแท็ก)
 *   GET    ?id=<uuid>                             → แผ่นเดียว + จุดทั้งหมด + ข้อมูล SKU ของแต่ละจุด
 *   POST   { name?, note?, image_key, image_w?, image_h?, family_tag_ids? }   → สร้างแผ่นใหม่
 *   PATCH  { id, name?, note?, image_key?, image_w?, image_h?, family_tag_ids?, spots? }
 *          spots = ชุดจุด "ทั้งแผ่น" หลังแก้ (มี id = แก้ของเดิม · ไม่มี id = เพิ่มใหม่ · id เดิมที่ไม่ส่งมา = ลบ)
 *   DELETE ?id=                                   → ลบแผ่น (จุดลบตาม cascade · SKU ไม่กระทบ)
 *
 * ตำแหน่งจุดเป็น % ของรูป (0-100) · 1 จุด = 1 SKU (sku_id ว่างได้ = ยังไม่ผูก)
 * สิทธิ์: products.view (อ่าน) / products.edit (เขียน) + audit log ของกลาง
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SwatchSpot = {
  id: string; x: number; y: number; w: number; h: number; label: string | null; sort_order: number;
  sku_id: string | null;
  sku: { id: string; code: string; name: string; image: string | null; color: string | null; qty_on_hand: number | null; is_active: boolean } | null;
};
export type SwatchCard = {
  id: string; name: string | null; note: string | null; seq: number;
  image_key: string | null; image_w: number | null; image_h: number | null;
  family_tag_ids: string[]; tags: { id: string; name: string }[];
  spot_count: number; linked_count: number;
  created_at: string; updated_at: string;
};
export type SwatchDetail = SwatchCard & { spots: SwatchSpot[] };

type Admin = ReturnType<typeof supabaseAdmin>;
type SwatchRow = { id: string; name: string | null; note: string | null; image_key: string | null; image_w: number | null; image_h: number | null; family_tag_ids: unknown; created_at: string; updated_at: string };
type SpotRow = { id: string; swatch_id: string; sku_id: string | null; x: number | string; y: number | string; w: number | string; h: number | string; label: string | null; sort_order: number };

const COLS = "id, name, note, image_key, image_w, image_h, family_tag_ids, created_at, updated_at";
const SPOT_COLS = "id, swatch_id, sku_id, x, y, w, h, label, sort_order";
const UUID = /^[0-9a-f-]{36}$/i;
const tagIdsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter((s) => UUID.test(s)) : []);
const clamp = (n: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(n) || 0));
const r2 = (n: number) => Math.round(n * 100) / 100;

async function actorOf(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}
async function tagNames(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  const { data } = await admin.from("product_families").select("id, name").in("id", ids);
  for (const t of (data ?? []) as { id: string; name: string | null }[]) m.set(t.id, t.name ?? "แท็ก");
  return m;
}
/** ลำดับ "Swatch #n" = ลำดับที่สร้าง (เก่าสุด = #1) — ใช้เป็นชื่อเมื่อไม่ได้ตั้งชื่อ */
async function seqMap(admin: Admin): Promise<Map<string, number>> {
  const { data } = await admin.from("sku_swatches").select("id").eq("is_active", true).order("created_at", { ascending: true });
  const m = new Map<string, number>();
  ((data ?? []) as { id: string }[]).forEach((r, i) => m.set(r.id, i + 1));
  return m;
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const admin = supabaseAdmin();
  const id = (sp.get("id") ?? "").trim();

  // ───── แผ่นเดียว + จุด ─────
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    const { data: row } = await admin.from("sku_swatches").select(COLS).eq("id", id).eq("is_active", true).maybeSingle();
    if (!row) return NextResponse.json({ error: "ไม่พบแผ่น swatch นี้" }, { status: 404 });
    const s = row as unknown as SwatchRow;
    const { data: spotRows } = await admin.from("sku_swatch_spots").select(SPOT_COLS).eq("swatch_id", id).order("sort_order").order("created_at");
    const spots = (spotRows ?? []) as unknown as SpotRow[];
    const skuIds = [...new Set(spots.map((p) => p.sku_id).filter((x): x is string => !!x))];
    const skuMap = new Map<string, NonNullable<SwatchSpot["sku"]>>();
    if (skuIds.length) {
      const [skuRes, balRes] = await Promise.all([
        admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key, color, is_active").in("id", skuIds),
        admin.from("sku_stock_balances").select("sku_id, qty_on_hand").in("sku_id", skuIds),
      ]);
      const stock = new Map<string, number>();
      for (const b of (balRes.data ?? []) as { sku_id: string; qty_on_hand: number | string | null }[]) stock.set(b.sku_id, Number(b.qty_on_hand ?? 0));
      for (const k of (skuRes.data ?? []) as { id: string; code: string; name_th: string | null; cover_image_r2_key: string | null; color: string | null; is_active: boolean | null }[]) {
        skuMap.set(k.id, {
          id: k.id, code: k.code, name: k.name_th ?? "", color: k.color ?? null, is_active: k.is_active !== false,
          image: k.cover_image_r2_key ? `/api/r2-image?key=${encodeURIComponent(k.cover_image_r2_key)}` : null,
          qty_on_hand: stock.has(k.id) ? (stock.get(k.id) as number) : null,
        });
      }
    }
    const tids = tagIdsOf(s.family_tag_ids);
    const [names, seq] = await Promise.all([tagNames(admin, tids), seqMap(admin)]);
    const detail: SwatchDetail = {
      id: s.id, name: s.name, note: s.note, seq: seq.get(s.id) ?? 0,
      image_key: s.image_key, image_w: s.image_w, image_h: s.image_h,
      family_tag_ids: tids, tags: tids.map((t) => ({ id: t, name: names.get(t) ?? "แท็ก" })),
      spot_count: spots.length, linked_count: spots.filter((p) => p.sku_id && skuMap.has(p.sku_id)).length,
      created_at: s.created_at, updated_at: s.updated_at,
      spots: spots.map((p) => ({
        id: p.id, x: Number(p.x), y: Number(p.y), w: Number(p.w), h: Number(p.h), label: p.label, sort_order: p.sort_order,
        sku_id: p.sku_id, sku: p.sku_id ? (skuMap.get(p.sku_id) ?? null) : null,
      })),
    };
    return NextResponse.json({ swatch: detail, error: null });
  }

  // ───── รายการแผ่น ─────
  const search = (sp.get("search") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 60)));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));
  const familyIds = (sp.get("family_ids") ?? "").split(",").map((x) => x.trim()).filter((x) => UUID.test(x));

  let q = admin.from("sku_swatches").select(COLS).eq("is_active", true).order("created_at", { ascending: false });
  if (familyIds.length) q = q.or(familyIds.map((f) => `family_tag_ids.cs.["${f}"]`).join(","));   // หลายแท็ก = OR เหมือนหน้า SKU
  const { data: all, error } = await q.limit(2000);
  if (error) return NextResponse.json({ swatches: [], total: 0, error: error.message }, { status: 500 });
  let rows = (all ?? []) as unknown as SwatchRow[];
  const seq = await seqMap(admin);

  // จุดของทุกแผ่น (นับ + ใช้ค้นด้วยรหัส/ชื่อ SKU ข้างใน)
  const ids = rows.map((r) => r.id);
  const spotRows = ids.length ? (((await admin.from("sku_swatch_spots").select("swatch_id, sku_id").in("swatch_id", ids)).data ?? []) as { swatch_id: string; sku_id: string | null }[]) : [];
  if (search) {
    const s = search.toLowerCase();
    const safe = search.replace(/[%,()]/g, " ").trim();
    const hit = new Set<string>();
    if (safe) {
      const { data: skus } = await admin.from("skus_v2").select("id").or(`code.ilike.%${safe}%,name_th.ilike.%${safe}%`).limit(500);
      const skuIds = new Set(((skus ?? []) as { id: string }[]).map((x) => x.id));
      for (const p of spotRows) if (p.sku_id && skuIds.has(p.sku_id)) hit.add(p.swatch_id);
    }
    rows = rows.filter((r) => hit.has(r.id) || (r.name ?? "").toLowerCase().includes(s) || (r.note ?? "").toLowerCase().includes(s) || `swatch #${seq.get(r.id)}`.includes(s));
  }
  const total = rows.length;
  const page = rows.slice(offset, offset + limit);
  const names = await tagNames(admin, [...new Set(page.flatMap((r) => tagIdsOf(r.family_tag_ids)))]);
  const swatches: SwatchCard[] = page.map((r) => {
    const mine = spotRows.filter((p) => p.swatch_id === r.id);
    const tids = tagIdsOf(r.family_tag_ids);
    return {
      id: r.id, name: r.name, note: r.note, seq: seq.get(r.id) ?? 0,
      image_key: r.image_key, image_w: r.image_w, image_h: r.image_h,
      family_tag_ids: tids, tags: tids.map((t) => ({ id: t, name: names.get(t) ?? "แท็ก" })),
      spot_count: mine.length, linked_count: mine.filter((p) => !!p.sku_id).length,
      created_at: r.created_at, updated_at: r.updated_at,
    };
  });
  return NextResponse.json({ swatches, total, error: null });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const imageKey = typeof b.image_key === "string" ? b.image_key.trim() : "";
  if (!imageKey) return NextResponse.json({ error: "ต้องอัปโหลดรูปแผ่น swatch ก่อน" }, { status: 400 });
  const admin = supabaseAdmin();
  const row = {
    name: typeof b.name === "string" && b.name.trim() ? b.name.trim() : null,
    note: typeof b.note === "string" && b.note.trim() ? b.note.trim() : null,
    image_key: imageKey,
    image_w: Number(b.image_w) > 0 ? Math.round(Number(b.image_w)) : null,
    image_h: Number(b.image_h) > 0 ? Math.round(Number(b.image_h)) : null,
    family_tag_ids: tagIdsOf(b.family_tag_ids),
    created_by: actor.id,
  };
  const { data, error } = await admin.from("sku_swatches").insert(row).select("id").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "สร้างไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "sku_swatches", entityId: data.id, actorId: actor.id, actorName: actor.name, metadata: { name: row.name, image_key: imageKey } });
  return NextResponse.json({ id: data.id, error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = typeof b.id === "string" ? b.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();

  const changes: Record<string, unknown> = {};
  if ("name" in b) changes.name = typeof b.name === "string" && b.name.trim() ? b.name.trim() : null;
  if ("note" in b) changes.note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;
  if (typeof b.image_key === "string" && b.image_key.trim()) {
    changes.image_key = b.image_key.trim();
    changes.image_w = Number(b.image_w) > 0 ? Math.round(Number(b.image_w)) : null;
    changes.image_h = Number(b.image_h) > 0 ? Math.round(Number(b.image_h)) : null;
  }
  if (Array.isArray(b.family_tag_ids)) changes.family_tag_ids = tagIdsOf(b.family_tag_ids);

  // จุด — รับ "ทั้งชุด" แล้วเทียบกับของเดิม (เพิ่ม/แก้/ลบ)
  const spotReport = { added: 0, updated: 0, removed: 0 };
  if (Array.isArray(b.spots)) {
    const incoming = (b.spots as Record<string, unknown>[]).map((p, i) => {
      const x = r2(clamp(p.x, 0, 100)), y = r2(clamp(p.y, 0, 100));
      const w = r2(clamp(p.w, 0.5, 100 - x)), h = r2(clamp(p.h, 0.5, 100 - y));   // ไม่ให้ล้นขอบรูป
      return {
        id: typeof p.id === "string" && UUID.test(p.id) ? p.id : null,
        sku_id: typeof p.sku_id === "string" && UUID.test(p.sku_id) ? p.sku_id : null,
        x, y, w, h, label: typeof p.label === "string" && p.label.trim() ? p.label.trim() : null, sort_order: i,
      };
    });
    const { data: cur } = await admin.from("sku_swatch_spots").select("id").eq("swatch_id", id);
    const curIds = new Set(((cur ?? []) as { id: string }[]).map((r) => r.id));
    const keep = new Set(incoming.map((p) => p.id).filter((x): x is string => !!x && curIds.has(x)));
    const remove = [...curIds].filter((x) => !keep.has(x));
    if (remove.length) {
      const { error } = await admin.from("sku_swatch_spots").delete().eq("swatch_id", id).in("id", remove);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      spotReport.removed = remove.length;
    }
    const now = new Date().toISOString();
    for (const p of incoming) {
      if (p.id && curIds.has(p.id)) {
        const { error } = await admin.from("sku_swatch_spots").update({ sku_id: p.sku_id, x: p.x, y: p.y, w: p.w, h: p.h, label: p.label, sort_order: p.sort_order, updated_at: now }).eq("id", p.id).eq("swatch_id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        spotReport.updated++;
      }
    }
    const fresh = incoming.filter((p) => !p.id || !curIds.has(p.id)).map((p) => ({ swatch_id: id, sku_id: p.sku_id, x: p.x, y: p.y, w: p.w, h: p.h, label: p.label, sort_order: p.sort_order }));
    if (fresh.length) {
      const { error } = await admin.from("sku_swatch_spots").insert(fresh);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      spotReport.added = fresh.length;
    }
  }

  const { error: upErr } = await admin.from("sku_swatches").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "sku_swatches", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { changes, spots: Array.isArray(b.spots) ? spotReport : null } });
  return NextResponse.json({ ok: true, spots: spotReport, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  // เก็บ snapshot ลง audit ก่อนลบ (กู้ด้วยมือได้ถ้าลบผิด) — รูปใน R2 ไม่ลบ
  const [{ data: head }, { data: spots }] = await Promise.all([
    admin.from("sku_swatches").select(COLS).eq("id", id).maybeSingle(),
    admin.from("sku_swatch_spots").select(SPOT_COLS).eq("swatch_id", id),
  ]);
  const { error } = await admin.from("sku_swatches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "sku_swatches", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { snapshot: head ?? null, spots: spots ?? [] } });
  return NextResponse.json({ ok: true, error: null });
}
