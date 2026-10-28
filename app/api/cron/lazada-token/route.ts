/**
 * /api/cron/lazada-token — ต่ออายุกุญแจ Lazada ทุกร้านวันละครั้ง (กันหลุดเงียบ)
 *
 * 🐛 ที่มา: access_token อยู่ได้ ~7 วัน · refresh_token ~30 วัน → ไม่มีใครเรียก API = ไม่มีใครต่ออายุ
 *    ร้าน IG หลุดเงียบตั้งแต่ 5 ส.ค. 2026 ขณะหน้าตั้งค่ายังขึ้น "เชื่อมต่อแล้ว"
 *
 * ทุกร้านที่ stage=connected:
 *   - ตัวต่ออายุหมดแล้ว → ข้าม (นับ expired · หน้าตั้งค่าจะขึ้นให้กดเชื่อมใหม่)
 *   - ยังไม่หมด → ต่ออายุเลย (ได้กุญแจใหม่ 7 วัน + ตัวต่ออายุใหม่จาก Lazada)
 *   - เหลือ ≤ 7 วัน → นับ expiring (หน้าตั้งค่า/หน้าสินค้าบนแพลตฟอร์มเตือนให้เชื่อมใหม่ก่อนหลุด)
 *
 * เรียกได้ 2 ทาง (ล้อ /api/cron/wo-due-soon):
 *   1. Vercel Cron (vercel.json) — ตรวจด้วย lib/cron-auth
 *   2. คนมีสิทธิ์ products.platforms.edit กดเอง · ?dry=1 = ดูสถานะเฉย ๆ ไม่ต่ออายุ
 * ไม่ส่งอะไรขึ้นร้าน — แค่ขอกุญแจใหม่จาก auth.lazada.com · ล้มแล้วไม่กระทบข้อมูลอื่น
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { writeAudit } from "@/lib/audit";
import { lazConfigured, lazConnHealth } from "@/lib/lazada";
import { getPlatformId, loadLazConn, refreshLazConn } from "../../lazada/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Result = { brand_id: string; result: "refreshed" | "expired" | "failed" | "skipped"; days_left: number | null; error?: string };

async function run(request: NextRequest): Promise<NextResponse> {
  const cron = isTrustedCron(request);
  if (!cron) { const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied; }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  if (!lazConfigured()) return NextResponse.json({ ok: true, note: "ยังไม่ได้ตั้ง LAZADA_APP_KEY/SECRET", results: [], error: null });

  const admin = supabaseAdmin();
  const lazId = await getPlatformId(admin, "lazada");
  if (!lazId) return NextResponse.json({ ok: true, results: [], error: null });
  const { data: rows } = await admin.from("platform_credentials").select("brand_id").eq("platform_id", lazId);

  const results: Result[] = [];
  for (const r of (rows ?? []) as { brand_id: string }[]) {
    const conn = await loadLazConn(admin, r.brand_id, lazId);
    if (!conn || conn.meta.stage !== "connected") continue;
    const h = lazConnHealth(conn.meta);
    if (h.state === "expired" || !conn.refreshToken) { results.push({ brand_id: r.brand_id, result: "expired", days_left: 0 }); continue; }
    if (dry) { results.push({ brand_id: r.brand_id, result: "skipped", days_left: h.days_left }); continue; }
    try {
      await refreshLazConn(admin, r.brand_id, lazId, { meta: conn.meta, refreshToken: conn.refreshToken }, null);
      const after = await loadLazConn(admin, r.brand_id, lazId);
      results.push({ brand_id: r.brand_id, result: "refreshed", days_left: lazConnHealth(after?.meta).days_left });
    } catch (e) {
      results.push({ brand_id: r.brand_id, result: "failed", days_left: h.days_left, error: (e as Error).message });
    }
  }

  if (!dry && results.length) {
    await writeAudit(admin, { action: "update", entityType: "platform_credentials", entityId: null, actorId: null, actorName: cron ? "cron: lazada-token" : "manual: lazada-token", metadata: { platform: "lazada", results } });
  }
  return NextResponse.json({
    ok: true, dry,
    refreshed: results.filter((x) => x.result === "refreshed").length,
    expiring: results.filter((x) => (x.days_left ?? 99) <= 7 && x.result !== "expired").length,
    expired: results.filter((x) => x.result === "expired").length,
    failed: results.filter((x) => x.result === "failed").length,
    results, error: null,
  });
}

export const GET = run;
export const POST = run;
