/**
 * API สาธารณะ — แบบเข็มขัดที่ลูกค้าออกแบบ : /api/public/storefront/belt-designs
 *
 * POST { shop, selections:{strap_id, buckle_id, keeper_id?, engraving?:{text,font,position}, waist_in?, gender?, width_mm?} }
 *      → { ok:true, design:{ id, code, total } }   (code = 8 ตัวแรกของ id ให้ลูกค้าบอกร้าน/แชร์ลิงก์ ?design=<id>)
 * GET  ?shop=<slug>&id=<uuid>  → { ok:true, design:{ id, code, selections, total, status } }   (โหลดแบบที่บันทึกไว้กลับมาแก้ต่อ)
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS
 * ปลอดภัยเพราะ: รับเฉพาะ id ชิ้นส่วนที่เปิดอยู่ของร้านนั้น · ราคาคิดใหม่ฝั่งเซิร์ฟเวอร์ (lib/belt-builder totalPrice)
 * · ข้อความสลักถูกกรอง (ตัวอักษรที่อนุญาต + ความยาวตามที่ร้านตั้ง) · 1 คำขอ = 1 แถว ไม่มีข้อมูลลูกค้าคนอื่น
 * ก้อน 4 (ใส่ตะกร้า → ใบสั่งขาย) จะต่อจากแถว belt_designs นี้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { readSiteInfo } from "@/lib/website-site-info";
import { buildBeltBuilderPayload, ENGRAVING_FONTS, ENGRAVING_POSITIONS } from "@/lib/belt-builder-public";
import { GENDERS, pickSizeRule, strapLengthCm, totalPrice, type Gender } from "@/lib/belt-builder";
import { storefrontCors, corsPreflight, corsJson } from "@/lib/storefront-cors";
import { activeShopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = storefrontCors("GET, POST");
export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}
const json = corsJson(CORS);

/** ตัวอักษรที่สลักได้ (ชุดเดียวกับปั๊มชื่อ lib/website-personalize) */
const ENGRAVE_ALLOWED_G = /[^A-Za-z0-9 &_\-.,/]/g;
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function loadShop(slug: string) {
  const sb = supabaseAdmin();
  const s = await activeShopBySlug<{ id: string; slug: string }>(sb, slug, "id, slug");
  if (!s) return null;
  return { sb, shop: s };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 🔒 กันยิงรัว (lib/rate-limit · audit 2026-10-21)
  const limited = await overLimit(request, [{ name: "belt-design:ip", limit: 20, windowSec: 3600 }]);
  if (limited) return json({ ok: false, error: limited }, 429);
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  const slug = String(body.shop ?? new URL(request.url).searchParams.get("shop") ?? "").trim();
  if (!slug) return json({ ok: false, error: "ต้องระบุ shop" }, 400);
  const ctx = await loadShop(slug);
  if (!ctx) return json({ ok: false, error: "ไม่พบร้าน" }, 404);
  const { sb, shop } = ctx;

  const info = await readSiteInfo(sb, shop.id);
  if (!info.belt_enabled) return json({ ok: false, error: "ร้านนี้ยังไม่เปิดออกแบบเข็มขัด" }, 403);
  const data = await buildBeltBuilderPayload(sb, shop.id, info);
  if (!data) return json({ ok: false, error: "ร้านยังไม่มีชิ้นส่วนให้เลือก" }, 409);

  const sel = (body.selections && typeof body.selections === "object" ? body.selections : {}) as Record<string, unknown>;
  const byId = new Map(data.parts.map((p) => [p.id, p]));
  const pick = (key: string, type: string, required: boolean) => {
    const id = sel[key];
    if (id == null || id === "") { if (required) throw new Error(`ยังไม่ได้เลือก${type === "strap" ? "สายหนัง" : type === "buckle" ? "หัวเข็มขัด" : "หูเข็มขัด"}`); return null; }
    const p = isUuid(id) ? byId.get(id) : undefined;
    if (!p || p.type !== type) throw new Error("ชิ้นส่วนที่เลือกไม่มีในร้านนี้แล้ว กรุณาเลือกใหม่");
    return p;
  };
  try {
    const strap = pick("strap_id", "strap", true)!;
    const buckle = pick("buckle_id", "buckle", true)!;
    const keeper = pick("keeper_id", "keeper", false);

    // สลักชื่อ: กรองตัวอักษร + ตัดความยาว · ฟอนต์/ตำแหน่งต้องอยู่ในชุดที่ร้านให้
    let engraving: { text: string; font: string; position: string } | null = null;
    const e = (sel.engraving && typeof sel.engraving === "object" ? sel.engraving : null) as Record<string, unknown> | null;
    if (e && data.engraving.enabled) {
      const text = String(e.text ?? "").replace(ENGRAVE_ALLOWED_G, "").trim().slice(0, data.engraving.maxChars);
      if (text) {
        const font = ENGRAVING_FONTS.some((f) => f.key === e.font) ? String(e.font) : ENGRAVING_FONTS[0].key;
        const position = ENGRAVING_POSITIONS.some((p) => p.key === e.position) ? String(e.position) : ENGRAVING_POSITIONS[0].key;
        engraving = { text, font, position };
      }
    }

    // ไซซ์: เพศ + รอบเอวต้องอยู่ในกติกาของร้าน (ไม่บังคับ — ลูกค้าอาจยังไม่วัด)
    const gender = GENDERS.includes(sel.gender as Gender) ? (sel.gender as Gender) : null;
    const waistIn = Number(sel.waist_in);
    let size: { gender: Gender; waist_in: number; strap_cm: number } | null = null;
    if (gender && Number.isFinite(waistIn) && waistIn > 0) {
      const rule = pickSizeRule(data.sizeRules.map((r) => ({ ...r, waist_min_in: r.waistMin, waist_max_in: r.waistMax })), gender, waistIn);
      if (!rule) throw new Error("รอบเอวอยู่นอกช่วงที่ร้านรับทำ — ติดต่อร้านเพื่อสั่งทำพิเศษ");
      size = { gender, waist_in: Math.round(waistIn * 10) / 10, strap_cm: strapLengthCm(waistIn, rule.formula) };
    }

    const total = totalPrice(data.basePrice, [{ price_delta: strap.priceDelta }, { price_delta: buckle.priceDelta }, keeper ? { price_delta: keeper.priceDelta } : null], engraving ? data.engraving.fee : 0);
    const selections = {
      strap_id: strap.id, buckle_id: buckle.id, keeper_id: keeper?.id ?? null,
      engraving, gender: size?.gender ?? gender, waist_in: size?.waist_in ?? null, strap_cm: size?.strap_cm ?? null,
      width_mm: Number((strap.attrs as Record<string, unknown>).width_mm) || null,
      // ชื่อตอนบันทึก (เผื่อชิ้นถูกลบ/เปลี่ยนชื่อทีหลัง ยังอ่านออเดอร์เก่าออก)
      labels: { strap: strap.name, buckle: buckle.name, keeper: keeper?.name ?? null },
      base_price: data.basePrice,
    };
    const { data: row, error } = await sb.from("belt_designs").insert({ shop_id: shop.id, selections, total_price: total, status: "saved" }).select("id").single();
    if (error || !row) return json({ ok: false, error: "บันทึกแบบไม่สำเร็จ กรุณาลองใหม่" }, 500);
    return json({ ok: true, design: { id: row.id, code: String(row.id).slice(0, 8).toUpperCase(), total, selections } }, 201);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : "ข้อมูลไม่ถูกต้อง" }, 400);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("shop") ?? "").trim();
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!slug || !isUuid(id)) return json({ ok: false, error: "ต้องระบุ shop และ id" }, 400);
  const ctx = await loadShop(slug);
  if (!ctx) return json({ ok: false, error: "ไม่พบร้าน" }, 404);
  const { data } = await ctx.sb.from("belt_designs").select("id, selections, total_price, status").eq("id", id).eq("shop_id", ctx.shop.id).maybeSingle();
  if (!data) return json({ ok: false, error: "ไม่พบแบบนี้" }, 404);
  return json({ ok: true, design: { id: data.id, code: String(data.id).slice(0, 8).toUpperCase(), selections: data.selections, total: Number(data.total_price) || 0, status: data.status } });
}
