/**
 * ดึงสินค้าที่ลงไว้บน Lazada → หน้า "สินค้าบนแพลตฟอร์ม" — /api/lazada/sync-products
 *  POST { brand_id, offset?, run_started_at? }  (products.platforms.edit)
 *   → ต่ออายุกุญแจถ้าใกล้หมด → วนอ่าน /products/get ทีละ 50 (filter=all) จาก offset → แปลงด้วย lazProductToCatalogItem
 *   → บันทึก + จับคู่รหัสตรงด้วยของกลาง lib/platform-catalog-sync (ที่เหลือให้ตัวเดาคู่เสนอในหน้า)
 *   ← { next_offset, done, run_started_at, api_total, fetched, stop_reason, ... }
 *
 * ดึงหลายครั้งต่อกัน (หน้าเว็บเรียกต่อเองจนครบ): Lazada ตอบช้า ~10 วิต่อหน้า (วัดจริง 2026-11-10) → ไม่เริ่มหน้าใหม่หลัง 30 วิ
 *   ครั้งแรกไม่ส่ง offset → เริ่มรอบใหม่ (run_started_at = ตอนนี้) · ครั้งต่อไปส่ง next_offset + run_started_at เดิมกลับมา
 *   ครั้งสุดท้ายจบครบ + จำนวนที่บันทึกตั้งแต่เริ่มรอบ ≥ ยอดที่ Lazada รายงาน → ตัวเดิมที่ไม่ถูกบันทึกในรอบนี้ = ติดป้าย "ไม่อยู่บนร้านแล้ว"
 *   (filter=all ไม่รวมตัวที่ลบแล้ว → ตัวที่ไม่มา = ร้านลบไปแล้ว · ตัวที่ปิดขายยังมาครบ)
 * 🐛 เดิมเริ่มที่ตัวแรกทุกครั้ง + เจอ error หน้า 3 แล้วเงียบ (IG ได้ 100/232 กดอีกก็ได้ 100 เดิม) → ดึงต่อจากจุดค้าง + ลองซ้ำ + บอกเหตุผล
 * ⚠️ อ่านอย่างเดียว — ไม่แก้อะไรบนร้าน Lazada
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lazGetProducts, lazProductToCatalogItem, type LazCatalogItem } from "@/lib/lazada";
import { markMissingSince, seenSince, upsertCatalogListings } from "@/lib/platform-catalog-sync";
import { getPlatformId, lazTokenOrReason } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PAGE = 50;              // Lazada ให้ครั้งละไม่เกิน 50
const MAX_PRODUCTS = 5000;    // กันวนไม่จบ (ร้าน IG มีหลักร้อย)
const TIME_BUDGET_MS = 30_000; // ไม่เริ่มหน้าใหม่หลังจากนี้ (หน้าละ ~10 วิ + เวลาบันทึก · maxDuration 60)
const RETRY_BEFORE_MS = 20_000; // ลองซ้ำได้ถ้ายังไม่เกินนี้ (ไม่งั้นให้หน้าเว็บเรียกครั้งใหม่แทน)
const RUN_MAX_AGE_MS = 30 * 60_000; // รอบดึงเก่ากว่านี้ = เริ่มรอบใหม่ (ไม่ใช้ตัดสินว่าตัวไหนถูกลบ)
const RETRY_WAIT_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; offset?: number; run_started_at?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "เลือกแบรนด์/ร้านก่อน (การเชื่อม Lazada ผูกกับแบรนด์)" }, { status: 400 });
  const startOffset = Math.max(0, Math.min(MAX_PRODUCTS, Math.floor(Number(body.offset) || 0)));
  // รอบดึง: ครั้งแรก = ตอนนี้ · ครั้งต่อไปใช้ของเดิม (ต้องไม่เก่าเกิน 30 นาที และไม่ใช่อนาคต)
  const prevRun = Date.parse(body.run_started_at ?? "");
  const runOk = startOffset > 0 && Number.isFinite(prevRun) && prevRun <= Date.now() && Date.now() - prevRun < RUN_MAX_AGE_MS;
  const runStartedAt = runOk ? new Date(prevRun).toISOString() : new Date().toISOString();

  const admin = supabaseAdmin();
  const lazId = await getPlatformId(admin, "lazada");
  if (!lazId) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม Lazada ในระบบ" }, { status: 400 });
  const tok = await lazTokenOrReason(admin, brandId, lazId, user?.id ?? null);
  if (!tok.ok) return NextResponse.json({ error: tok.reason }, { status: 400 });

  // 1) อ่านทีละหน้าจาก offset (หยุดเมื่อครบตามยอด / หน้าไม่เต็ม / หมดเวลาของครั้งนี้ / Lazada ตอบผิดพลาดซ้ำ)
  const started = Date.now();
  const items: LazCatalogItem[] = [];
  let offset = startOffset, apiTotal = 0, done = false, stopReason: string | null = null;
  while (offset < MAX_PRODUCTS) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    let res: { products: Record<string, unknown>[]; total: number } | null = null;
    for (let attempt = 1; attempt <= 2 && !res; attempt++) {
      try { res = await lazGetProducts(tok.gateway, tok.accessToken, { offset, limit: PAGE }); }
      catch (e) {
        stopReason = (e as Error).message || "Lazada ตอบผิดพลาด";
        if (attempt < 2 && Date.now() - started < RETRY_BEFORE_MS) await sleep(RETRY_WAIT_MS); else break;
      }
    }
    if (!res) break;          // ลองซ้ำแล้วยังผิดพลาด → หยุดที่หน้านี้ (ครั้งหน้าเริ่มที่หน้านี้)
    stopReason = null;
    if (res.total > 0) apiTotal = res.total;
    for (const p of res.products) { const it = lazProductToCatalogItem(p); if (it) items.push(it); }
    if (res.products.length < PAGE) { done = true; offset += res.products.length; break; }
    offset += PAGE;
    if (apiTotal > 0 && offset >= apiTotal) { done = true; break; }
  }
  if (items.length === 0 && stopReason) {
    return NextResponse.json({ error: `อ่านสินค้าจาก Lazada ไม่สำเร็จ (ตัวที่ ${startOffset + 1} เป็นต้นไป): ${stopReason}`, next_offset: startOffset, run_started_at: runStartedAt }, { status: 400 });
  }

  // 2) บันทึก + จับคู่รหัสตรง (ของกลาง · ไม่ทับคู่เดิม)
  let saved;
  try { saved = await upsertCatalogListings(admin, { platformId: lazId, brandId, source: "api", items }); }
  catch (e) { return NextResponse.json({ error: `บันทึกไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 }); }

  // 3) จบรอบครบ → เช็กว่าครบทั้งร้านจริง (นับที่บันทึกตั้งแต่เริ่มรอบ) แล้วค่อยติดป้ายตัวที่ไม่มา
  let seen = 0, complete = false, gone = { removed: 0, removed_skipped: 0 };
  if (done) {
    try {
      seen = await seenSince(admin, { platformId: lazId, brandId, since: runStartedAt });
      complete = apiTotal > 0 && seen >= apiTotal;
      if (complete) gone = await markMissingSince(admin, { platformId: lazId, brandId, since: runStartedAt });
    } catch (e) { stopReason = `เช็กสินค้าที่ร้านลบไม่สำเร็จ: ${(e as Error).message}`; }
  }

  const result = {
    api_total: apiTotal, fetched: items.length, from_offset: startOffset, next_offset: done ? null : offset,
    done, complete, seen_in_run: seen, run_started_at: runStartedAt, stop_reason: stopReason,
    ...saved, ...gone,
  };
  await writeAudit(admin, {
    action: "import", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "lazada_api", brand_id: brandId, ...result },
  });
  return NextResponse.json({ ok: true, partial: !done, ...result, error: null });
}
