/**
 * 🔐 ด่านสิทธิ์ API เว็บไซต์ — ใช้แทน guardApi(products.view/edit) ใน /api/website/*
 *   1) กลุ่มงานจาก path (lib/website-access · websiteApiGroups) × ระดับ view/edit
 *      → ผ่านเมื่อมีสิทธิ์ระดับนั้นในกลุ่มใดกลุ่มหนึ่งที่ใช้ route นี้
 *   2) ร้าน: หา shop จาก query (shop / shopSlug / shopId / shop_id) หรือ body JSON (คำขอที่ไม่ใช่ GET)
 *      → ต้องมี website.shop.<slug> · ไม่รู้ร้าน (เช่น PATCH ด้วย id รายการอย่างเดียว) = เช็กแค่กลุ่ม
 *   route ที่ไม่อยู่ในแผนที่ (ใช้ร่วมแอปอื่น) = กฎเดิม products.view/edit
 * ผลตรวจใช้แคชเดียวกับ guardApi (apiCan · ~60 วิ) — เปลี่ยนสิทธิ์แล้วมีผลช้าสุด ~1 นาที
 */
import { NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DESIGN_TOPIC_PERMS, designAccess, websiteApiGroups, websiteGroupDef, websitePerm, websiteShopPerm, type DesignAccess } from "@/lib/website-access";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOP_TTL = 5 * 60_000;
let shopCache: { at: number; byId: Map<string, string>; slugs: Set<string> } | null = null;

async function shopIndex() {
  if (shopCache && Date.now() - shopCache.at < SHOP_TTL) return shopCache;
  const { data } = await supabaseAdmin().from("shops").select("id, slug");
  const rows = (data ?? []) as { id: string; slug: string }[];
  shopCache = { at: Date.now(), byId: new Map(rows.map((r) => [r.id, r.slug])), slugs: new Set(rows.map((r) => r.slug)) };
  return shopCache;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** slug ร้านของคำขอ (ไม่รู้ = null) */
export async function websiteShopOf(request: Request): Promise<string | null> {
  const sp = new URL(request.url).searchParams;
  let raw = [sp.get("shop"), sp.get("shopSlug"), sp.get("shopId"), sp.get("shop_id")].map(str).find(Boolean) ?? null;
  const json = (request.headers.get("content-type") ?? "").includes("application/json");
  if (!raw && json && request.method !== "GET" && request.method !== "HEAD") {
    try {
      const b = (await request.clone().json()) as Record<string, unknown> | null;
      if (b && typeof b === "object") raw = [b.shop, b.shopSlug, b.shopId, b.shop_id].map(str).find(Boolean) ?? null;
    } catch {
      /* body ไม่ใช่ JSON — เช็กแค่กลุ่ม */
    }
  }
  if (!raw) return null;
  const idx = await shopIndex();
  if (UUID.test(raw)) return idx.byId.get(raw) ?? null;
  return idx.slugs.has(raw) ? raw : null;
}

function deny(status: number, error: string) {
  return NextResponse.json({ data: [], error }, { status });
}

/** คืน NextResponse ถ้าไม่ผ่าน · null = ผ่าน */
export async function guardWebsite(request: Request, level: "view" | "edit"): Promise<NextResponse | null> {
  const groups = websiteApiGroups(new URL(request.url).pathname);
  if (!groups) return guardApi(request, level === "view" ? "products.view" : "products.edit");
  if (!(request.headers.get("authorization") ?? "").startsWith("Bearer ")) return deny(401, "ต้องเข้าสู่ระบบก่อน");

  let ok = false;
  for (const g of groups) {
    if (await apiCan(request, websitePerm(g, level))) {
      ok = true;
      break;
    }
  }
  if (!ok) {
    const names = groups.map((g) => `"${websiteGroupDef(g).label}"`).join(" / ");
    return deny(403, `ไม่มีสิทธิ์${level === "edit" ? "แก้" : "ดู"}ส่วน ${names} ของเว็บไซต์ — ขอสิทธิ์ได้ที่ผู้ดูแลระบบ`);
  }

  const shop = await websiteShopOf(request);
  if (shop && !(await apiCan(request, websiteShopPerm(shop)))) return deny(403, `ไม่มีสิทธิ์เข้าร้าน "${shop}" — ขอสิทธิ์ได้ที่ผู้ดูแลระบบ`);
  return null;
}

/** ร้านที่ผู้ใช้เข้าได้ (กรองรายชื่อร้าน) */
export async function websiteCanShop(request: Request, slug: string): Promise<boolean> {
  return apiCan(request, websiteShopPerm(slug));
}

const NO_DESIGN: DesignAccess = { full: false, topics: [], publish: false, advanced: false };

/**
 * 👷 ด่านแก้หน้าดีไซน์: แก้ได้ทุกหัวข้อ (website.design.edit — แบบเดิม) หรือ บางหัวข้อ (ดูได้ + website.design.topic.*)
 *   denied = แก้ไม่ได้เลย / ไม่มีสิทธิ์ร้าน · access.full = แบบเดิม · บางหัวข้อ → route ต้องคัดเฉพาะค่าของหัวข้อนั้นเอง (applyDesignPages)
 */
export async function guardDesignEdit(request: Request): Promise<{ denied: NextResponse | null; access: DesignAccess }> {
  const fullDenied = await guardWebsite(request, "edit");
  if (!fullDenied) return { denied: null, access: designAccess(() => true) };
  const viewDenied = await guardWebsite(request, "view");
  if (viewDenied) return { denied: viewDenied, access: NO_DESIGN };
  const keys = [websitePerm("design", "view"), ...DESIGN_TOPIC_PERMS];
  const oks = await Promise.all(keys.map((k) => apiCan(request, k)));
  const got = new Set(keys.filter((_, i) => oks[i]));
  const access = designAccess((k) => got.has(k));
  return access.topics.length ? { denied: null, access } : { denied: fullDenied, access };
}
