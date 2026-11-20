/**
 * ดึงออเดอร์จาก Lazada เข้า platform_orders — /api/lazada/sync-orders (ปุ่ม "📥 ดึงออเดอร์ 30 วัน" หน้าบัญชีแพลตฟอร์ม)
 * POST { brand_id, days? }  (days = ย้อนหลังกี่วัน, default 30)
 *  - 2026-11-20: ใช้ตัวกลางเดียวกับตัวดึงอัตโนมัติ (../orders-sync) — ที่มา lazada_api · ไม่เก็บที่อยู่ผู้รับ · ต่ออายุ token อัตโนมัติ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getPlatformId, lazTokenOrReason } from "../shared";
import { syncLazadaOrders, LAZADA_ORDER_SOURCE } from "../orders-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

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
  const tok = await lazTokenOrReason(admin, brandId, lazId, user?.id ?? null);
  if (!tok.ok) return NextResponse.json({ error: tok.reason }, { status: 400 });

  const createdAfter = new Date(Date.now() - days * 86_400_000).toISOString();
  const r = await syncLazadaOrders(admin, { platformId: lazId, brandId, accessToken: tok.accessToken, gateway: tok.gateway, window: { createdAfter }, timeBudgetMs: 45_000 });
  await writeAudit(admin, { action: "import", entityType: "platform_orders", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform: "lazada", source: LAZADA_ORDER_SOURCE, brand_id: brandId, days, ...r } });
  if (r.stop_reason && r.fetched === 0) return NextResponse.json({ error: `ดึงออเดอร์ไม่สำเร็จ: ${r.stop_reason}` }, { status: 400 });
  return NextResponse.json({ ok: true, fetched: r.fetched, created: r.created, updated: r.updated, matched: r.items_matched, done: r.done, error: r.stop_reason });
}
