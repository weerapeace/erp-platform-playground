"use client";

/**
 * ข้อมูลร้านที่หลายแผงในหลังบ้านเว็บใช้ร่วมกัน (ของกลาง) — ที่เดียวที่รู้ URL + แคชต่อร้าน
 *
 * ปัญหาที่แก้: รายการสินค้าบนเว็บ / ข้อมูลร้าน / ชุดมาใหม่ / สินค้าหน้าร้าน ถูก fetch เองซ้ำหลายไฟล์
 * (แคชแยกกันคนละชุด · บางที่ระบุร้านด้วย ?shopId= บางที่ ?shop=)
 *
 *   const j = await loadWebListings(shopSlug, true);     // หน้าแก้ไข → โหลดสดเสมอ
 *   const j = await loadStorefrontProducts(shopSlug);    // ตัวเลือก/ป๊อปเลือก → ใช้ของที่เคยโหลดไว้ได้
 *
 * - ระบุร้านด้วย slug (?shop=) เป็นมาตรฐาน
 * - fresh = false → มีของในแคชแล้วคืนทันที · คำขอที่กำลังบินอยู่ใช้ร่วมกัน (ยิงจริงครั้งเดียว)
 * - fresh = true → ยิงใหม่เสมอ (ไม่รอคำขอเก่าที่อาจเริ่มก่อนบันทึก) · โหลดเสร็จแล้วแคชเป็นค่าล่าสุดให้ตัวอื่นใช้ต่อ
 * - คืน JSON ดิบของ API (ผู้เรียกแปลงเป็นรูปของตัวเอง) · ผลที่มี error ไม่ถูกเก็บแคช
 * - แคชอยู่ใน useSWRLite กลาง (key "website:<ชนิด>:<slug>") → ล้างได้ด้วย invalidateSWR("website:")
 *
 * ⚠️ ฟอร์มที่จะเอาค่าไปแก้ ส่ง fresh = true เสมอ (กันเห็นค่าเก่าแล้วบันทึกทับ)
 */
import { apiFetch } from "@/lib/api";
import { mutateSWR, peekSWR } from "@/lib/swr-lite";

type Kind = "listings" | "settings" | "new-drops" | "storefront-products";

const SOURCES: Record<Kind, { path: string; auth: boolean }> = {
  listings: { path: "/api/website/listings", auth: true },
  settings: { path: "/api/website/settings", auth: true },
  "new-drops": { path: "/api/website/new-drops", auth: true },
  // API สาธารณะ — ชุดเดียวกับที่เว็บร้านเห็น (ไม่ต้องแนบตัวตน · ไม่ใช้แคชเบราว์เซอร์)
  "storefront-products": { path: "/api/public/storefront/products", auth: false },
};

export const websiteDataKey = (kind: Kind, shopSlug: string): string => `website:${kind}:${shopSlug}`;

/** ตอบกลับแบบมาตรฐานของ API ในระบบ (error = ข้อความภาษาคน) */
type ApiJson = { error?: string };

export type WebListingsJson<L = unknown, S = unknown, C = unknown> = ApiJson & {
  shop?: S | null;
  /** slug ที่ขอไม่มีจริง */
  notFound?: boolean;
  listings?: L[];
  categories?: C[];
};

export type WebSettingsJson<F = unknown, G = unknown> = ApiJson & {
  info?: Record<string, unknown>;
  fields?: F[];
  groups?: G[];
  effectiveOrderPrefix?: string;
  siteUrl?: string | null;
};

export type WebNewDropsJson<D = unknown, PG = unknown> = ApiJson & {
  drops?: D[];
  /** id ชุด → มีหน้าจัดเอง/ร่างไหม */
  pages?: Record<string, PG>;
};

export type StorefrontProductsJson<P = unknown> = ApiJson & { products?: P[] };

const inflight = new Map<string, Promise<unknown>>();
/** ลำดับคำขอต่อ key — คำขอที่เริ่มก่อนแต่เสร็จทีหลัง ห้ามเขียนทับค่าที่ใหม่กว่าในแคช */
const seqs = new Map<string, number>();
const stored = new Map<string, number>();

function load<T extends ApiJson>(kind: Kind, shopSlug: string, fresh: boolean): Promise<T> {
  const key = websiteDataKey(kind, shopSlug);
  if (!fresh) {
    const hit = peekSWR<T>(key);
    if (hit !== undefined) return Promise.resolve(hit);
    const flying = inflight.get(key);
    if (flying) return flying as Promise<T>;
  }
  const seq = (seqs.get(key) ?? 0) + 1;
  seqs.set(key, seq);
  const { path, auth } = SOURCES[kind];
  const url = `${path}?shop=${encodeURIComponent(shopSlug)}`;
  const p = (auth ? apiFetch(url) : fetch(url, { cache: "no-store" }))
    .then((r) => r.json() as Promise<T>)
    .then((j) => {
      if (j && !j.error && seq > (stored.get(key) ?? 0)) {
        stored.set(key, seq);
        mutateSWR(key, j);
      }
      return j;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** 🛍 สินค้าที่เพิ่มเข้าเว็บแล้ว (แท็บ "สินค้าบนเว็บ") + ข้อมูลร้าน + หมวด — GET /api/website/listings */
export function loadWebListings<L = unknown, S = unknown, C = unknown>(shopSlug: string, fresh = false): Promise<WebListingsJson<L, S, C>> {
  return load<WebListingsJson<L, S, C>>("listings", shopSlug, fresh);
}

/** 🏪 ข้อมูลร้าน (store_settings) + ช่องที่ตั้งได้ — GET /api/website/settings */
export function loadWebSettings<F = unknown, G = unknown>(shopSlug: string, fresh = false): Promise<WebSettingsJson<F, G>> {
  return load<WebSettingsJson<F, G>>("settings", shopSlug, fresh);
}

/** 🆕 ชุดมาใหม่ของร้าน (รวมที่ยังไม่เปิด) — GET /api/website/new-drops */
export function loadWebNewDrops<D = unknown, PG = unknown>(shopSlug: string, fresh = false): Promise<WebNewDropsJson<D, PG>> {
  return load<WebNewDropsJson<D, PG>>("new-drops", shopSlug, fresh);
}

/** 🏬 สินค้าที่เว็บร้านเห็นจริง (เผยแพร่แล้ว + ตัวเลือกสีพร้อมรูป) — GET /api/public/storefront/products */
export function loadStorefrontProducts<P = unknown>(shopSlug: string, fresh = false): Promise<StorefrontProductsJson<P>> {
  return load<StorefrontProductsJson<P>>("storefront-products", shopSlug, fresh);
}
