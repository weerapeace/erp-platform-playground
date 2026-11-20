/**
 * /api/cron/platform-cross-daily — สรุปเช็กข้ามร้านทุกเช้า (เช็กข้ามร้าน ข้อ 7 · เจ้าของเลือก 2026-11-20)
 * vercel.json 02:10 UTC = 09:10 เวลาไทย
 *
 * ทุกแบรนด์ที่มีบัญชีร้าน → คิดตารางเช็กข้ามร้านชุดเดียวกับหน้าจอ (lib/platform-cross-shop-server · กฎ lib/platform-cross-shop)
 *   นับ: รุ่นที่ยังไม่ลงบางร้าน · รุ่นที่ราคาลูกค้าจ่ายไม่ตรงระบบ · รุ่นที่พร้อมลงเลย (ผลตรวจทุกคืน)
 *   เทียบกับเมื่อวาน (ui_config platform_cross_daily:<brand>) → ส่งกระดิ่ง "เฉพาะวันที่มีของใหม่" (ขาดเพิ่ม / ราคาไม่ตรงเพิ่ม)
 *   วันแรกที่เริ่มใช้ = ส่งสรุปตั้งต้น 1 ครั้ง · ส่งวันละครั้งต่อแบรนด์ (กันยิงซ้ำ)
 * คนรับ = กฎแจ้งเตือน "platform.cross_daily" (lib/notify-recipients · ไม่มีกฎ = แอดมิน · ปิดกฎ = ไม่ส่ง) · กดลิงก์ → หน้าเช็กข้ามร้านของแบรนด์นั้น
 * อ่านอย่างเดียว ไม่แตะร้าน · ?dry=1 (คนมีสิทธิ์ products.platforms.view กดเอง) = ดูตัวเลขอย่างเดียว ไม่ส่ง ไม่จด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { ruleRecipients } from "@/lib/notify-recipients";
import { loadCrossShop } from "@/lib/platform-cross-shop-server";
import { WEBSITE, activeShops, listableMissing, readyToList } from "@/lib/platform-cross-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const EVENT = "platform.cross_daily";
const SNAP_KEY = (brandId: string) => `platform_cross_daily:${brandId}`;
type Snap = { missing: string[]; pay: string[]; at: string };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cron = isTrustedCron(request);
  if (!cron) { const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied; }
  const dry = !cron || new URL(request.url).searchParams.get("dry") === "1";   // คนกดเอง = ดูผลอย่างเดียว
  const admin = supabaseAdmin();
  try {
    const { data: acc } = await admin.from("platform_accounts").select("brand_id").eq("is_active", true);
    const brandIds = [...new Set(((acc ?? []) as { brand_id: string | null }[]).map((a) => a.brand_id).filter((x): x is string => !!x))];
    const thStart = new Date(Date.parse(`${new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)}T00:00:00+07:00`)).toISOString();
    const { ids: recipients } = dry ? { ids: [] as string[] } : await ruleRecipients(admin, EVENT);

    const out: { brand: string; missing: number; newMissing: number; pay: number; newPay: number; ready: number; sent: boolean }[] = [];
    for (const brandId of brandIds) {
      const d = await loadCrossShop(admin, brandId, { stock: false });
      if (!d.brand) continue;
      const on = activeShops(d.shops).map((s) => s.code);
      const missing = d.rows.filter((r) => listableMissing(r, on).length || r.cells[WEBSITE]?.st === "none").map((r) => r.id);
      const pay = d.rows.filter((r) => on.some((c) => c !== WEBSITE && (r.cells[c]?.pay_diff ?? 0) > 0)).map((r) => r.id);
      const ready = d.rows.filter((r) => readyToList(r, on)).length;

      const { data: snapRow } = await admin.from("ui_config").select("value").eq("key", SNAP_KEY(brandId)).maybeSingle();
      const prev = ((snapRow as { value?: Snap } | null)?.value ?? null) as Snap | null;
      const was = { missing: new Set(prev?.missing ?? []), pay: new Set(prev?.pay ?? []) };
      const newMissing = prev ? missing.filter((id) => !was.missing.has(id)).length : 0;
      const newPay = prev ? pay.filter((id) => !was.pay.has(id)).length : 0;
      const shouldSend = !prev || newMissing > 0 || newPay > 0;

      let sent = false;
      if (!dry) {
        await admin.from("ui_config").upsert({ key: SNAP_KEY(brandId), value: { missing, pay, at: new Date().toISOString() } }, { onConflict: "key" });
        if (shouldSend && recipients.length) {
          const { count } = await admin.from("erp_notifications").select("id", { count: "exact", head: true })
            .eq("event_type", EVENT).eq("entity_id", brandId).gte("created_at", thStart);
          if (!count) {
            const name = d.brand.name || "แบรนด์";
            const title = prev ? `เช็กข้ามร้าน ${name}: มีรุ่นที่ต้องดูเพิ่ม` : `เช็กข้ามร้าน ${name}: สรุปตั้งต้น`;
            const body = [
              `ยังไม่ลงบางร้าน ${missing.length.toLocaleString()} รุ่น${prev ? ` (ใหม่ ${newMissing.toLocaleString()})` : ""}`,
              `ราคาลูกค้าจ่ายไม่ตรงระบบ ${pay.length.toLocaleString()} รุ่น${prev ? ` (ใหม่ ${newPay.toLocaleString()})` : ""}`,
              ready ? `พร้อมลงเลย ${ready.toLocaleString()} รุ่น` : "",
            ].filter(Boolean).join(" · ");
            const { error } = await admin.rpc("erp_notify", {
              p_user_ids: recipients, p_event_type: EVENT, p_title: title, p_body: body,
              p_link_url: `/master/platform-catalog?view=cross&brand=${brandId}`, p_entity_type: "brand", p_entity_id: brandId, p_priority: "normal",
            });
            if (error) console.error("[cron/platform-cross-daily] erp_notify:", error.message); else sent = true;
          }
        }
      }
      out.push({ brand: d.brand.name, missing: missing.length, newMissing, pay: pay.length, newPay, ready, sent });
    }
    const summary = out.length
      ? out.map((b) => `${b.brand}: ขาด ${b.missing} (ใหม่ ${b.newMissing}) · ราคาไม่ตรง ${b.pay} (ใหม่ ${b.newPay})${b.sent ? " · แจ้งแล้ว" : ""}`).join(" | ")
      : "ยังไม่มีแบรนด์ที่ต่อร้าน";
    if (cron && !dry) await recordWorkerRun(admin, "platform-cross-daily", { ok: true, summary });
    return NextResponse.json({ ok: true, dry, brands: out, error: null });
  } catch (e) {
    console.error("[cron/platform-cross-daily]", e instanceof Error ? e.message : e);
    if (cron && !dry) await recordWorkerRun(admin, "platform-cross-daily", { ok: false, error: e instanceof Error ? e.message : "cron failed" });
    return NextResponse.json({ ok: false, error: cron ? "cron failed" : e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
