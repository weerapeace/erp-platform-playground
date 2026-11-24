/**
 * /api/cron/platform-fees — ดึงค่าธรรมเนียม/เงินที่ร้านได้จริงของออเดอร์ Shopee + Lazada เก็บไว้ (vercel.json ทุก 30 นาที)
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 2 ข้อ 1 "ดึงค่าธรรมเนียมย้อนหลังอัตโนมัติ")
 *
 * ทำอะไร: หาออเดอร์ที่ยังไม่มีรายได้จริง (raw.shopee_income / raw.lazada_income) → ถามร้านทีละใบ (ตัวเดียวกับหน้ารายละเอียดออเดอร์)
 *   · Shopee = v2.payment.get_escrow_detail · Lazada = finance transaction details
 *   · ใบใหม่ (≤ 12 วัน) ถามซ้ำทุก 2 วัน (ค่าธรรมเนียม/คืนเงินเปลี่ยนได้จนจบออเดอร์) · Lazada ที่ยังไม่ตัดรอบ ถามซ้ำวันละครั้ง (≤ 60 วัน)
 *   · ใบที่ร้านตอบผิดพลาด จดไว้ (error) ไม่ถามซ้ำทุกรอบ
 *   รอบละไม่เกิน ~45 วินาที · ย้อนหลังครั้งแรก ~2,300 ใบ ใช้หลายรอบจนครบ แล้วตามเก็บใบใหม่เอง
 * ⚠️ อ่านจากร้านอย่างเดียว ไม่แก้อะไรบนร้าน · เขียนแค่ raw.*_income ในออเดอร์ของเรา (อ่าน raw ล่าสุดก่อนเขียน กันทับของตัวดึงออเดอร์)
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) · คนมีสิทธิ์ marketing.dashboard.view เรียกเอง = ดูว่าค้างกี่ใบ ไม่ดึง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { countsAsSale } from "@/lib/platform-order-status";
import { shopeeErrorText, shopeeGetEscrowDetail } from "@/lib/shopee";
import { lazErrorText, lazGetOrderTransactions } from "@/lib/lazada";
import { lazIncomeOf } from "@/lib/lazada-orders";
import { getPlatformId, shopeeTokenOrReason } from "../../shopee/shared";
import { lazTokenOrReason } from "../../lazada/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const BATCH = 150;          // ต่อแพลตฟอร์มต่อรอบ
const BUDGET_MS = 45_000;
const CONC = 3;
const DAY = 86_400_000;
type Admin = ReturnType<typeof supabaseAdmin>;
type Cand = { id: string; brand_id: string; external_order_id: string; status: string; platform_status: string | null; ordered_at: string | null };
const COLS = "id, brand_id, external_order_id, status, platform_status, ordered_at";
const bkkDate = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);

async function candidates(admin: Admin, platformId: string, key: string, refresh: "shopee" | "lazada"): Promise<Cand[]> {
  const base = () => admin.from("platform_orders").select(COLS).eq("platform_id", platformId).not("brand_id", "is", null).not("external_order_id", "is", null).neq("status", "cancelled");
  const now = Date.now();
  const missing = await base().is(`raw->${key}`, null).order("ordered_at", { ascending: false }).limit(BATCH);
  const again = refresh === "shopee"
    ? await base().lt(`raw->${key}->>at`, new Date(now - 2 * DAY).toISOString()).gte("ordered_at", new Date(now - 12 * DAY).toISOString()).order("ordered_at", { ascending: false }).limit(60)
    : await base().eq(`raw->${key}->>rows`, "0").lt(`raw->${key}->>at`, new Date(now - DAY).toISOString()).gte("ordered_at", new Date(now - 60 * DAY).toISOString()).order("ordered_at", { ascending: false }).limit(60);
  if (missing.error) throw new Error(missing.error.message);
  const seen = new Set<string>();
  return [...((missing.data ?? []) as Cand[]), ...((again.data ?? []) as Cand[])].filter((c) => !seen.has(c.id) && seen.add(c.id) && countsAsSale(c));
}

/** เขียน raw.<key> โดยอ่าน raw ล่าสุดก่อน (กันทับข้อมูลที่ตัวดึงออเดอร์เพิ่งเขียน) */
async function saveIncome(admin: Admin, id: string, key: string, value: Record<string, unknown>) {
  const { data } = await admin.from("platform_orders").select("raw").eq("id", id).maybeSingle();
  const raw = ((data as { raw?: Record<string, unknown> | null } | null)?.raw ?? {}) as Record<string, unknown>;
  await admin.from("platform_orders").update({ raw: { ...raw, [key]: value } }).eq("id", id);
}

async function pool<T>(list: T[], fn: (x: T) => Promise<void>, deadline: number) {
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (i < list.length && Date.now() < deadline) { const x = list[i++]; await fn(x); } }));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cron = isTrustedCron(request);
  if (!cron) { const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied; }
  const admin = supabaseAdmin();
  const deadline = Date.now() + BUDGET_MS;
  try {
    const [spId, lzId] = await Promise.all([getPlatformId(admin, "shopee"), getPlatformId(admin, "lazada")]);
    const sp = spId ? await candidates(admin, spId, "shopee_income", "shopee") : [];
    const lz = lzId ? await candidates(admin, lzId, "lazada_income", "lazada") : [];
    if (!cron) return NextResponse.json({ ok: true, dry: true, pending: { shopee: sp.length, lazada: lz.length }, error: null });

    const stat = { shopee: 0, lazada: 0, failed: 0, noToken: 0 };
    // Shopee
    const spTok = new Map<string, Awaited<ReturnType<typeof shopeeTokenOrReason>>>();
    await pool(sp, async (c) => {
      if (!spTok.has(c.brand_id)) spTok.set(c.brand_id, await shopeeTokenOrReason(admin, c.brand_id, spId as string, null));
      const tok = spTok.get(c.brand_id);
      if (!tok?.ok) { stat.noToken++; return; }
      try {
        await saveIncome(admin, c.id, "shopee_income", { ...(await shopeeGetEscrowDetail(tok.accessToken, tok.shopId, c.external_order_id)), at: new Date().toISOString() });
        stat.shopee++;
      } catch (e) {
        stat.failed++;
        await saveIncome(admin, c.id, "shopee_income", { escrow: null, buyer_paid: null, lines: [], error: shopeeErrorText(e), at: new Date().toISOString() });
      }
    }, deadline);
    // Lazada
    const lzTok = new Map<string, Awaited<ReturnType<typeof lazTokenOrReason>>>();
    await pool(lz, async (c) => {
      if (!lzTok.has(c.brand_id)) lzTok.set(c.brand_id, await lazTokenOrReason(admin, c.brand_id, lzId as string, null));
      const tok = lzTok.get(c.brand_id);
      if (!tok?.ok) { stat.noToken++; return; }
      const ordered = c.ordered_at ? Date.parse(c.ordered_at) : Date.now() - 7 * DAY;
      try {
        const rows = await lazGetOrderTransactions(tok.gateway, tok.accessToken, c.external_order_id, bkkDate(ordered - DAY), bkkDate(Date.now()));
        await saveIncome(admin, c.id, "lazada_income", { ...lazIncomeOf(rows, c.external_order_id), at: new Date().toISOString() });
        stat.lazada++;
      } catch (e) {
        stat.failed++;
        await saveIncome(admin, c.id, "lazada_income", { escrow: null, buyer_paid: null, lines: [], paid: false, rows: -1, error: lazErrorText(e), at: new Date().toISOString() });
      }
    }, deadline);

    const summary = `Shopee ${stat.shopee} · Lazada ${stat.lazada} ใบ${stat.failed ? ` · ร้านตอบผิดพลาด ${stat.failed}` : ""}${stat.noToken ? ` · ไม่ได้เชื่อมร้าน ${stat.noToken}` : ""}`;
    await recordWorkerRun(admin, "platform-fees", { ok: true, summary, warn: stat.failed > 10 });
    return NextResponse.json({ ok: true, ...stat, error: null });
  } catch (e) {
    console.error("[cron/platform-fees]", e);
    await recordWorkerRun(admin, "platform-fees", { ok: false, error: "ดึงค่าธรรมเนียมไม่สำเร็จ" });
    return NextResponse.json({ ok: false, error: "ดึงค่าธรรมเนียมไม่สำเร็จ" }, { status: 500 });
  }
}
