/**
 * /api/cron/perf-watch — ⚡ ผู้ตรวจความเร็ว (ทุกคืน 04:00 เวลาไทย · vercel.json "0 21 * * *" UTC)
 *
 * 1) หน้าเว็บ: วัดหน้าหลัก (PERF_KEY_PAGES) + หน้าที่คนเปิดบ่อยสุด 7 วัน (page_view_daily) — ขนาดโค้ด JS + เวลาตอบ
 *    เทียบค่าฐานใน ui_config `perf_baseline:<path>` (ใช้ร่วมกับสคริปต์ `npm run perf-check` · เวลาแยกแหล่ง "cron")
 * 2) ฐานข้อมูล: RPC erp_perf_query_delta → คำสั่งที่ใหม่และช้า หรือช้าลงเกิน 50% ตั้งแต่เมื่อคืน (แล้วเก็บภาพยอดรวมใหม่)
 * ช้าลง → กระดิ่งถึงคนรับตามกฎแจ้งเตือน "perf.regression" (ตั้งต้น = แอดมิน · แก้ได้ที่แท็บแจ้งเตือนของแผนผัง) วันละครั้งพอ
 * ผลล่าสุด: ui_config `perf_watch_report` + จดรอบให้หน้าออฟฟิศทีม AI (recordWorkerRun "perf-watch")
 * ไม่ใช้ token ของ Claude · ไม่แตะข้อมูลธุรกิจ (เปิดหน้าแบบไม่ล็อกอิน + อ่านสถิติฐานข้อมูล)
 *
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) · แอดมิน (ai_office.view) กดเอง = ดูผลอย่างเดียว ไม่เตือน ไม่จดค่าฐาน ไม่ขยับรอบฐานข้อมูล
 * กติกา/เกณฑ์: lib/perf-check.ts · คู่มือ docs/perf-check.md
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { ruleRecipients } from "@/lib/notify-recipients";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { AI_OFFICE_PERM } from "@/lib/ai-office";
import {
  PERF_PROD_URL, PERF_KEY_PAGES, PERF_LIMITS, PERF_REPORT_KEY, PERF_BASELINE_PREFIX, perfBaselineKey, isMeasurablePath,
  measurePing, measurePath, judgeSample, nextBaseline, parseBaseline, judgeDbRows, queryLabel, fmtSec,
  type PerfBaseline, type ChunkCache, type DbDeltaRow,
} from "@/lib/perf-check";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;   // วัด ~20 หน้า หน้าละ 6 รอบ + ขนาดโค้ด

const EVENT = "perf.regression";
const TOP_VIEWED = 6;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cron = isTrustedCron(request);
  if (!cron) { const denied = await guardApi(request, AI_OFFICE_PERM); if (denied) return denied; }
  const dry = !cron || new URL(request.url).searchParams.get("dry") === "1";   // คนกดเอง = ดูผลอย่างเดียวเสมอ
  const admin = supabaseAdmin();
  const note = (r: { ok: boolean; summary?: string; error?: string; warn?: boolean }) => (cron && !dry ? recordWorkerRun(admin, "perf-watch", r) : Promise.resolve());

  try {
    const now = new Date().toISOString();

    // ── หน้าที่จะวัด: หน้าหลัก + หน้าที่คนเปิดบ่อยสุด 7 วัน ──
    const pages = [...PERF_KEY_PAGES];
    try {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      const { data } = await admin.from("page_view_daily").select("path, views").gte("day", since).limit(5000);
      const sum = new Map<string, number>();
      for (const r of (data ?? []) as { path: string; views: number }[]) sum.set(r.path, (sum.get(r.path) ?? 0) + (Number(r.views) || 0));
      const top = [...sum.entries()].filter(([p]) => isMeasurablePath(p) && p !== "/" && !p.startsWith("/api/") && !p.startsWith("/login") && !pages.includes(p))
        .sort((a, b) => b[1] - a[1]).slice(0, TOP_VIEWED).map(([p]) => p);
      pages.push(...top);
    } catch { /* ไม่มีสถิติเปิดหน้า = วัดแค่หน้าหลัก */ }

    // ── วัดหน้า ──
    const ping = await measurePing(PERF_PROD_URL);
    const systemSlow = ping == null || ping > PERF_LIMITS.pingSlowMs;
    const { data: bRows } = await admin.from("ui_config").select("key, value").in("key", pages.map(perfBaselineKey));
    const baselines = new Map<string, PerfBaseline>();
    for (const r of (bRows ?? []) as { key: string; value: unknown }[]) { const b = parseBaseline(r.value); if (b) baselines.set(r.key.slice(PERF_BASELINE_PREFIX.length), b); }

    const cache: ChunkCache = new Map();
    const results = [];
    for (const p of pages) {
      const s = await measurePath(PERF_PROD_URL, p, "page", { cache });
      const b = baselines.get(p) ?? null;
      const v = judgeSample(s, b, { source: "cron", systemSlow });
      results.push({ s, v, b });
    }
    const badPages = results.filter((r) => r.v.level === "warn" || r.v.level === "slow");

    if (!dry) {
      const rows = results.map((r) => nextBaseline(r.b, r.s, r.v, { source: "cron", systemSlow, now }))
        .filter((b): b is PerfBaseline => !!b).map((b) => ({ key: perfBaselineKey(b.path), value: b, updated_at: now }));
      if (rows.length) await admin.from("ui_config").upsert(rows, { onConflict: "key" });
    }

    // ── ฐานข้อมูล ──
    let dbPrevAt: string | null = null, dbSlow = 0, dbError: string | null = null;
    let dbFlags: ReturnType<typeof judgeDbRows> = [];
    {
      const { data, error } = await admin.rpc("erp_perf_query_delta", { p_commit: !dry });
      if (error) dbError = error.message;
      else {
        const d = (data ?? {}) as { prev_at?: string | null; rows?: DbDeltaRow[] };
        dbPrevAt = d.prev_at ?? null;
        const rows = (d.rows ?? []).map((r) => ({ ...r, calls: Number(r.calls), mean_ms: Number(r.mean_ms), prev_mean_ms: r.prev_mean_ms == null ? null : Number(r.prev_mean_ms), total_ms: Number(r.total_ms) }));
        dbSlow = rows.length;
        dbFlags = dbPrevAt ? judgeDbRows(rows) : [];   // รอบแรกยังไม่มีอะไรให้เทียบ = ไม่เตือน
      }
    }

    // ── สรุป + เตือน ──
    const items = [
      ...badPages.map((r) => `${r.s.path} ${r.v.reasons[0] ?? ""}`.trim()),
      ...dbFlags.map((f) => `${queryLabel(f.query)} ${f.why}`),
    ];
    const headParts = [badPages.length ? `หน้าช้าลง/หนักขึ้น ${badPages.length} หน้า` : "", dbFlags.length ? `คำสั่งฐานข้อมูลช้าขึ้น ${dbFlags.length} ตัว` : ""].filter(Boolean);
    let sent = 0, already = false;
    if (items.length && !dry) {
      const thStart = new Date(Date.parse(`${new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)}T00:00:00+07:00`)).toISOString();
      const { count } = await admin.from("erp_notifications").select("id", { count: "exact", head: true }).eq("event_type", EVENT).gte("created_at", thStart);
      already = (count ?? 0) > 0;
      if (!already) {
        const { ids } = await ruleRecipients(admin, EVENT);   // ปิดกฎ = ไม่ส่ง
        if (ids.length) {
          const { error } = await admin.rpc("erp_notify", {
            p_user_ids: ids, p_event_type: EVENT, p_title: `ระบบช้าลง: ${headParts.join(" · ")}`,
            p_body: items.slice(0, 4).join(" · ") + (items.length > 4 ? ` · …อีก ${items.length - 4} รายการ` : ""),
            p_link_url: "/master/ai-office", p_entity_type: "perf", p_entity_id: null, p_priority: "normal",
          });
          if (!error) sent = ids.length;
        }
      }
    }

    const okCount = results.filter((r) => r.v.level === "ok" || r.v.level === "new").length;
    const heavy = results.filter((r) => (r.s.jsKB ?? 0) > PERF_LIMITS.jsCeilingKB).length;
    const summary = [
      systemSlow ? `ระบบช้าทั้งก้อนตอนวัด (ping ${fmtSec(ping)}) ไม่ตัดสินเวลา` : "",
      badPages.length ? `หน้าช้าลง/หนักขึ้น ${badPages.length} (${badPages.slice(0, 2).map((r) => r.s.path).join(", ")})` : `หน้าเว็บปกติ ${okCount}/${results.length} หน้า`,
      heavy ? `หน้าโค้ดหนักเกิน ${PERF_LIMITS.jsCeilingKB}KB ${heavy} หน้า` : "",
      dbError ? "อ่านสถิติฐานข้อมูลไม่ได้" : !dbPrevAt ? "ฐานข้อมูล: เก็บค่าเริ่มต้นแล้ว เริ่มเทียบรอบหน้า" : dbFlags.length ? `คำสั่งฐานข้อมูลช้าขึ้น ${dbFlags.length}` : "ฐานข้อมูลไม่มีคำสั่งช้าขึ้น",
    ].filter(Boolean).join(" · ");

    const report = {
      at: now, dry, ping, systemSlow, sent, already,
      pages: results.map((r) => ({ path: r.s.path, level: r.v.level, status: r.s.status, jsKB: r.s.jsKB, ms: r.s.ms, jsBase: r.v.jsBase, msBase: r.v.msBase, reasons: r.v.reasons })),
      db: { prev_at: dbPrevAt, slow: dbSlow, error: dbError, flags: dbFlags.map((f) => ({ label: queryLabel(f.query), why: f.why, role: f.role, calls: f.calls, mean_ms: f.mean_ms, prev_mean_ms: f.prev_mean_ms })) },
      summary,
    };
    if (!dry) await admin.from("ui_config").upsert({ key: PERF_REPORT_KEY, value: report, updated_at: now }, { onConflict: "key" });
    await note({ ok: !dbError, warn: !!items.length || systemSlow, summary, ...(dbError ? { error: `อ่านสถิติฐานข้อมูลไม่ได้: ${dbError}` } : {}) });
    return NextResponse.json({ ok: true, ...report, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await note({ ok: false, error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
