/**
 * 📊 Meta Conversions API — ส่ง "ซื้อสำเร็จ" จากเซิร์ฟเวอร์ ERP ตรงไป Meta (คู่กับ Pixel บนหน้าเว็บ)
 *
 * ทำไม: Pixel ในเบราว์เซอร์หายเยอะ (iPhone/ตัวบล็อกโฆษณา) → ส่งซ้ำจากเซิร์ฟเวอร์ด้วย event_id เดียวกัน (เลขออเดอร์) Meta ตัดซ้ำให้เอง
 * เงื่อนไข: ร้านตั้ง meta_pixel_id + meta_capi_token (แท็บ 🏪 ข้อมูลร้าน › 📊 วัดผล) และลูกค้ายินยอมคุกกี้การตลาด (tracking.consent จากหน้าเว็บ)
 * ข้อมูลลูกค้า (อีเมล/เบอร์) ส่งแบบแฮช SHA-256 ตามกติกา Meta · เรียกผ่าน after() — ลูกค้าไม่ต้องรอ · พังก็ไม่กระทบออเดอร์
 * รหัสสินค้า = รหัสที่หน้าเว็บคิดจากตัวเลือกที่ลูกค้ากด (tracking.ids · ตรงกับฟีด /feeds/*.xml) — ERP ยอมเฉพาะที่ขึ้นต้นด้วยรหัสรุ่นของบรรทัดจริง
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSiteInfo } from "@/lib/website-site-info";

const GRAPH = "https://graph.facebook.com/v21.0";

/** ข้อมูลวัดผลที่หน้าเว็บส่งมากับออเดอร์ */
export interface OrderTracking {
  /** ลูกค้ายินยอมคุกกี้การตลาด */
  consent: boolean;
  fbp?: string;
  fbc?: string;
  ua?: string;
  url?: string;
  /** รหัสสินค้าแคตตาล็อกของแต่ละบรรทัด (หน้าเว็บคิด · src/lib/catalog-id.ts) — ใช้แค่จับคู่โฆษณา ยอดเงินยังมาจาก ERP */
  ids?: string[];
}

const COOKIE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_.-]{4,200}$/;
const CATALOG_ID = /^[^\s<>"'`]{1,100}$/;
export function parseTracking(raw: unknown): OrderTracking | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const fbp = s(r.fbp, 260);
  const fbc = s(r.fbc, 400);
  const url = s(r.url, 500);
  return {
    consent: r.consent === true,
    fbp: COOKIE.test(fbp) ? fbp : undefined,
    fbc: COOKIE.test(fbc) ? fbc : undefined,
    ua: s(r.ua, 400) || undefined,
    url: /^https?:\/\//.test(url) ? url : undefined,
    ids: Array.isArray(r.ids) ? r.ids.filter((x): x is string => typeof x === "string" && CATALOG_ID.test(x)).slice(0, 60) : undefined,
  };
}

/**
 * รหัสแคตตาล็อกของแต่ละบรรทัดออเดอร์ — ใช้รหัสจากหน้าเว็บที่ขึ้นต้นด้วยรหัสรุ่นของบรรทัดนั้น (ตัวเลือกสีที่ลูกค้ากดจริง)
 * ไม่มี/ไม่ตรง = รหัสรุ่น (SKU ไซส์ในออเดอร์ไม่ใช่รหัสตัวเลือกบนเว็บ จึงคิดเองจาก sku_id ไม่ได้)
 */
export function lineCatalogIds(lines: { parent_code: string | null }[], clientIds?: string[]): string[] {
  const pool = [...(clientIds ?? [])];
  return lines.map((l) => {
    const code = String(l.parent_code ?? "").trim();
    if (!code) return "";
    const i = pool.findIndex((x) => x === code || x.startsWith(`${code}-`));
    return i >= 0 ? pool.splice(i, 1)[0] : code;
  });
}

/** รหัสสินค้าในแคตตาล็อก: รุ่น + ตัวเลือกสี (sku-<8 ตัวแรก>) — ⚠️ กติกาเดียวกับเว็บร้าน src/lib/catalog-id.ts */
export function catalogItemId(parentCode: string | null | undefined, skuId?: string | null): string {
  const code = String(parentCode ?? "").trim();
  if (!code) return "";
  const k = String(skuId ?? "").replace(/^sku-/, "").slice(0, 8);
  return k ? `${code}-${k}` : code;
}

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
/** อีเมล: ตัดช่องว่าง + ตัวเล็ก · เบอร์ไทย 0XXXXXXXXX → 66XXXXXXXXX (ตามรูปแบบ E.164 ไม่มี +) */
export function hashedUserData(email?: string | null, phone?: string | null): { em?: string[]; ph?: string[] } {
  const out: { em?: string[]; ph?: string[] } = {};
  const e = String(email ?? "").trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) out.em = [sha(e)];
  let p = String(phone ?? "").replace(/\D/g, "");
  if (p.startsWith("0") && p.length === 10) p = `66${p.slice(1)}`;
  if (p.length >= 9) out.ph = [sha(p)];
  return out;
}

export interface CapiPurchaseInput {
  orderNo: string;
  createdAt: string;
  value: number;
  items: { id: string; qty: number; price: number }[];
  email?: string | null;
  phone?: string | null;
  ip?: string | null;
  tracking: OrderTracking;
}

/** event ของ Meta (ฟังก์ชันบริสุทธิ์ — ทดสอบได้) */
export function buildCapiPurchase(i: CapiPurchaseInput): Record<string, unknown> {
  const items = i.items.filter((x) => x.id);
  return {
    event_name: "Purchase",
    event_time: Math.floor(new Date(i.createdAt).getTime() / 1000) || Math.floor(Date.now() / 1000),
    event_id: i.orderNo,
    action_source: "website",
    ...(i.tracking.url ? { event_source_url: i.tracking.url } : {}),
    user_data: {
      ...hashedUserData(i.email, i.phone),
      ...(i.ip ? { client_ip_address: i.ip } : {}),
      ...(i.tracking.ua ? { client_user_agent: i.tracking.ua } : {}),
      ...(i.tracking.fbp ? { fbp: i.tracking.fbp } : {}),
      ...(i.tracking.fbc ? { fbc: i.tracking.fbc } : {}),
    },
    custom_data: {
      currency: "THB",
      value: Math.round(i.value * 100) / 100,
      content_type: "product",
      content_ids: items.map((x) => x.id),
      contents: items.map((x) => ({ id: x.id, quantity: x.qty, item_price: x.price })),
      num_items: items.reduce((s, x) => s + x.qty, 0),
      order_id: i.orderNo,
    },
  };
}

/** IP ลูกค้าจาก header (ผ่าน Vercel/พร็อกซี) */
export function clientIp(req: Request): string | null {
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xf || req.headers.get("x-real-ip") || null;
}

/**
 * ส่ง Purchase ของออเดอร์นี้ — ไม่มี Pixel/โทเค็น/ไม่ยินยอม = ข้ามเงียบ · คืนผล (ไว้ log)
 * @param tracking ค่าจาก body.tracking ของออเดอร์ (parseTracking)
 */
export async function sendMetaPurchase(sb: SupabaseClient, shopId: string, orderId: string, tracking: OrderTracking | null, ip: string | null): Promise<"sent" | "skipped" | "failed"> {
  if (!tracking?.consent) return "skipped";
  const info = await readSiteInfo(sb, shopId);
  if (!info.meta_pixel_id || !info.meta_capi_token) return "skipped";
  const [{ data: order }, { data: lines }] = await Promise.all([
    sb.from("store_orders").select("order_no, created_at, grand_total, customer_email, customer_phone").eq("id", orderId).maybeSingle(),
    sb.from("store_order_items").select("parent_code, qty, unit_price").eq("order_id", orderId),
  ]);
  if (!order) return "skipped";
  const o = order as { order_no: string; created_at: string; grand_total: number; customer_email: string | null; customer_phone: string | null };
  const rows = (lines ?? []) as { parent_code: string | null; qty: number; unit_price: number }[];
  const ids = lineCatalogIds(rows, tracking.ids);
  const event = buildCapiPurchase({
    orderNo: o.order_no,
    createdAt: o.created_at,
    value: Number(o.grand_total) || 0,
    items: rows.map((l, i) => ({ id: ids[i], qty: Number(l.qty) || 1, price: Number(l.unit_price) || 0 })),
    email: o.customer_email,
    phone: o.customer_phone,
    ip,
    tracking,
  });
  try {
    const r = await fetch(`${GRAPH}/${encodeURIComponent(info.meta_pixel_id)}/events?access_token=${encodeURIComponent(info.meta_capi_token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      console.error("[meta-capi] purchase", r.status, (await r.text().catch(() => "")).slice(0, 300));
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("[meta-capi] purchase", e);
    return "failed";
  }
}
