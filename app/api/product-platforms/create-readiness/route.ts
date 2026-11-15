/**
 * ความพร้อมลงร้าน ทุกร้านของสินค้า 1 ตัว ในคำขอเดียว — /api/product-platforms/create-readiness (แท็บแพลตฟอร์มของ Parent SKU)
 *
 *  GET ?parent_sku_id=&codes=shopee,lazada,…  (products.platforms.view · อ่านอย่างเดียว ไม่ส่งอะไรขึ้นร้าน)
 *    → { data: { [code]: CreateReadiness }, error }
 *
 * ⚠️ ใช้ตัวประกอบข้อมูลตัวเดียวกับตัวช่วยลงสินค้า (หน้า "ดูก่อนส่ง") — ไม่มีตัวตรวจตัวที่ 2:
 *   LINE = buildLineCreate · Lazada/TikTok/Shopee = load ของ /api/<ร้าน>/create-product (lib/<ร้าน>-create-plan)
 *   นับข้อที่ขาดแบบเดียวกับตัวช่วย (lib/platform-create-readiness) → แถวในแท็บกับตัวช่วยบอกตรงกันเสมอ
 * ร้านใหม่ในทะเบียน lib/platform-create-registry → เพิ่มตัวอ่านใน CHECKERS ที่นี่ (ไม่มี = ไม่โชว์ป้าย)
 * ตรวจทุกร้านพร้อมกัน · ร้านไหนช้าเกิน CHECK_TIMEOUT_MS = ป้าย "ตรวจไม่สำเร็จ" ร้านอื่นยังได้ผล
 */
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { buildLineCreate } from "@/lib/line-create-payload";
import { creatorOf } from "@/lib/platform-create-registry";
import { createMissingOf, type CreateReadiness } from "@/lib/platform-create-readiness";
import { loadLazadaCreate } from "@/app/api/lazada/create-product/load";
import { loadTiktokCreate } from "@/app/api/tiktok-shop/create-product/load";
import { loadShopeeCreate } from "@/app/api/shopee/create-product/load";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
const CHECK_TIMEOUT_MS = 15000;

type Checked = Omit<CreateReadiness, "code" | "error">;
type Failed = { ok: false; error: string };
type Checker = (admin: SupabaseClient, parentId: string, userId: string | null) => Promise<Checked | Failed>;

/** หน้าตาค่าที่ทุกร้านมีเหมือนกัน (preview ของ lib/<ร้าน>-create-plan) */
type PlanLike = { name: { value: string }; category: { id: string | null; label: string | null }; missing: string[]; on_shop: string | null };
const fromPlan = (pv: PlanLike, blockers: string[], images: number): Checked => ({
  on_shop: pv.on_shop, missing: createMissingOf(pv.missing, blockers),
  title: pv.name.value || null, category: pv.category.label || pv.category.id || null, images,
});

const CHECKERS: Record<string, Checker> = {
  line_shopping: async (admin, parentId) => {
    const b = await buildLineCreate(admin, parentId);
    return b.ok ? fromPlan(b.preview, b.preview.blockers, b.preview.images.keys.length) : { ok: false, error: b.error };
  },
  lazada: async (admin, parentId, userId) => {
    const r = await loadLazadaCreate(admin, parentId, userId);
    return r.ok ? fromPlan(r.preview, r.blockers, r.preview.images.refs.length) : { ok: false, error: r.error };
  },
  tiktok: async (admin, parentId, userId) => {
    const r = await loadTiktokCreate(admin, parentId, userId);
    return r.ok ? fromPlan(r.preview, r.blockers, r.preview.images.refs.length) : { ok: false, error: r.error };
  },
  shopee: async (admin, parentId, userId) => {
    const r = await loadShopeeCreate(admin, parentId, userId);
    return r.ok ? fromPlan(r.preview, r.blockers, r.preview.images.refs.length) : { ok: false, error: r.error };
  },
};

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => new Promise<T>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("ร้านตอบช้า ลองกดรีเฟรชอีกครั้ง")), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const parentId = (sp.get("parent_sku_id") ?? "").trim();
  if (!parentId) return NextResponse.json({ data: {}, error: "ต้องระบุ parent_sku_id" }, { status: 400, headers: NO_STORE });
  const asked = (sp.get("codes") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const codes = [...new Set(asked.length ? asked : Object.keys(CHECKERS))].filter((c) => CHECKERS[c] && creatorOf(c));
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();

  const results = await Promise.all(codes.map(async (code): Promise<CreateReadiness> => {
    const empty = { code, on_shop: null, missing: [], title: null, category: null, images: 0 };
    try {
      const r = await withTimeout(CHECKERS[code](admin, parentId, user?.id ?? null), CHECK_TIMEOUT_MS);
      if ("ok" in r && r.ok === false) return { ...empty, error: r.error };
      return { code, ...(r as Checked), error: null };
    } catch (e) {
      return { ...empty, error: (e as Error).message || "ตรวจไม่สำเร็จ" };
    }
  }));
  return NextResponse.json({ data: Object.fromEntries(results.map((r) => [r.code, r])), error: null }, { headers: NO_STORE });
}
