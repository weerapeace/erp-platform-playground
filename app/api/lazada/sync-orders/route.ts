/**
 * ดึงออเดอร์จาก Lazada เข้า platform_orders — /api/lazada/sync-orders
 * POST { brand_id, days? }  (days = ย้อนหลังกี่วัน, default 30)
 *  - ต่ออายุ token อัตโนมัติถ้าใกล้หมด
 *  - ออเดอร์ใหม่ = insert head + items (จับคู่ sku ↔ skus_v2) · ออเดอร์เดิม = อัปเดตสถานะ/ยอด (ไม่แตะ items ที่จับคู่ไว้)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lazGetOrders, lazGetOrderItems, lazRefreshToken, lazGateway } from "@/lib/lazada";
import { getPlatformId, loadLazConn, saveLazConn } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
// Lazada status → สถานะภายใน (new/packed/shipped/cancelled)
function mapStatus(s: string): string {
  const x = (s || "").toLowerCase();
  if (["canceled", "cancelled", "returned", "failed"].includes(x)) return "cancelled";
  if (["shipped", "delivered"].includes(x)) return "shipped";
  if (["packed", "ready_to_ship", "rts"].includes(x)) return "packed";
  return "new";
}
function parseDate(s: unknown): string | null {
  if (!s) return null;
  const d = new Date(String(s));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; days?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? "").trim();
  const days = Math.min(Math.max(num(body.days) || 30, 1), 180);
  if (!brandId) return NextResponse.json({ error: "ต้องมี brand_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const lazId = await getPlatformId(admin, "lazada");
  if (!lazId) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม lazada" }, { status: 400 });
  const conn = await loadLazConn(admin, brandId, lazId);
  if (!conn?.accessToken || conn.meta.stage !== "connected") {
    return NextResponse.json({ error: "แบรนด์นี้ยังไม่ได้เชื่อมต่อ Lazada — ไปเชื่อมต่อที่ 🏪 จัดการร้านก่อน" }, { status: 400 });
  }

  // ต่ออายุ token ถ้าใกล้หมด (< 60 วินาที)
  let accessToken = conn.accessToken;
  const gateway = conn.meta.gateway || lazGateway(conn.meta.country);
  try {
    if ((conn.meta.expires_at ?? 0) < Date.now() + 60000 && conn.refreshToken) {
      const t = await lazRefreshToken(conn.refreshToken);
      accessToken = t.access_token;
      await saveLazConn(admin, brandId, lazId, t.access_token, t.refresh_token, {
        ...conn.meta, expires_at: Date.now() + num(t.expires_in) * 1000, refresh_expires_at: Date.now() + num(t.refresh_expires_in) * 1000,
      }, user?.id ?? null);
    }
  } catch (e) { return NextResponse.json({ error: `ต่ออายุการเชื่อมต่อไม่สำเร็จ (เชื่อมต่อใหม่): ${(e as Error).message}` }, { status: 400 }); }

  const createdAfter = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  // ดึงออเดอร์ (วนหน้า สูงสุด 6 หน้า = 300 ออเดอร์/ครั้ง)
  const orders: Record<string, unknown>[] = [];
  try {
    for (let offset = 0; offset < 300; offset += 50) {
      const { orders: page, total } = await lazGetOrders(gateway, accessToken, { createdAfter, limit: 50, offset });
      orders.push(...page);
      if (page.length < 50 || orders.length >= total) break;
    }
  } catch (e) { return NextResponse.json({ error: `ดึงออเดอร์ไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 }); }

  if (orders.length === 0) return NextResponse.json({ ok: true, fetched: 0, created: 0, updated: 0, matched: 0, error: null });

  const oidOf = (o: Record<string, unknown>) => String(o.order_id ?? o.order_number ?? "");
  const oids = orders.map(oidOf).filter(Boolean);
  const { data: existRows } = await admin.from("platform_orders").select("id, external_order_id").eq("platform_id", lazId).in("external_order_id", oids);
  const existMap = new Map(((existRows ?? []) as { id: string; external_order_id: string }[]).map((r) => [r.external_order_id, r.id]));

  // ดึงรายการสินค้าเฉพาะออเดอร์ใหม่ (ลดจำนวนเรียก API)
  const newOids = oids.filter((o) => !existMap.has(o));
  const itemsBy: Record<string, Record<string, unknown>[]> = {};
  try {
    for (let i = 0; i < newOids.length; i += 50) {
      Object.assign(itemsBy, await lazGetOrderItems(gateway, accessToken, newOids.slice(i, i + 50)));
    }
  } catch { /* ถ้าดึง items พลาด ยังบันทึก head ได้ */ }

  // จับคู่ sku ↔ ERP
  const allSkus = [...new Set(Object.values(itemsBy).flat().map((it) => String((it as Record<string, unknown>).sku ?? "")).filter(Boolean))];
  const skuMap = new Map<string, string>();
  if (allSkus.length) {
    const { data: sk } = await admin.from("skus_v2").select("id, code").in("code", allSkus);
    for (const s of ((sk ?? []) as { id: string; code: string }[])) skuMap.set(s.code, s.id);
  }

  let created = 0, updated = 0, matched = 0;
  for (const o of orders) {
    const oid = oidOf(o); if (!oid) continue;
    const statuses = Array.isArray(o.statuses) ? (o.statuses as string[]) : [];
    const head = {
      order_no: String(o.order_number ?? oid),
      customer_name: `${o.customer_first_name ?? ""} ${o.customer_last_name ?? ""}`.trim() || null,
      status: mapStatus(statuses[0] ?? ""),
      total: num(o.price), currency: String(o.currency ?? "THB"),
      ordered_at: parseDate(o.created_at), raw: o, updated_at: new Date().toISOString(),
    };
    const existId = existMap.get(oid);
    if (existId) {
      await admin.from("platform_orders").update(head).eq("id", existId);
      updated++;
      continue;
    }
    const { data: ins } = await admin.from("platform_orders").insert({
      platform_id: lazId, brand_id: brandId, source: "api", external_order_id: oid, ...head, created_by: user?.id ?? null,
    }).select("id").maybeSingle();
    const orderId = (ins as { id?: string } | null)?.id;
    created++;
    if (orderId) {
      // รวมรายการต่อ sku (Lazada 1 แถว = 1 ชิ้น) → qty = จำนวนแถว
      const byS = new Map<string, { name: string | null; qty: number; price: number; raw: Record<string, unknown> }>();
      for (const it of (itemsBy[oid] ?? [])) {
        const sku = String((it as Record<string, unknown>).sku ?? "");
        const prev = byS.get(sku);
        if (prev) prev.qty += 1;
        else byS.set(sku, { name: String((it as Record<string, unknown>).name ?? "") || null, qty: 1, price: num((it as Record<string, unknown>).item_price), raw: it as Record<string, unknown> });
      }
      const itemRows = [...byS.entries()].map(([sku, v]) => { const m = sku ? (skuMap.get(sku) ?? null) : null; if (m) matched++; return { order_id: orderId, sku_code: sku || null, matched_sku_id: m, name: v.name, qty: v.qty, price: v.price, raw: v.raw }; });
      if (itemRows.length) await admin.from("platform_order_items").insert(itemRows);
    }
  }

  await writeAudit(admin, { action: "import", entityType: "platform_orders", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform: "lazada", brand_id: brandId, fetched: orders.length, created, updated } });
  return NextResponse.json({ ok: true, fetched: orders.length, created, updated, matched, error: null });
}
