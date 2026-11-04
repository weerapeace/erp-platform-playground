"use client";

/**
 * 🤖 ออฟฟิศทีม AI — ห้องทำงานของผู้ช่วยอัตโนมัติ / AI ทุกตัวในระบบ พร้อมสถานะจริง
 * ทะเบียน + กติกาสถานะ: lib/ai-office.ts · ข้อมูลสด: /api/ai-office/status (app/api/ai-office/live.ts)
 * ใช้ของกลาง: Drawer (components/modal) · MiniTable · Icon · useT · apiFetch
 * ใช้ที่ /master/ai-office · คู่มือ docs/ai-office.md
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { Drawer } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { useAuth } from "@/components/auth";
import { PixelOffice } from "./pixel";
import {
  OFFICE_ZONES, OFFICE_WORKERS, WORKER_BY_ID, STATUS_LABEL, STATUS_RANK, countStatuses, workersNeedingHelp, CRON_SECRET_FIX, AI_OFFICE_EDIT_PERM,
  type OfficeLive, type OfficeWorker, type OfficeZoneId, type WorkerLive, type WorkerStatus, type OfficeEvent,
} from "@/lib/ai-office";

const REFRESH_MS = 60_000;
const VIEW_KEY = "erp.aiOffice.view";
type View = "office" | "rooms" | "table";
const VIEWS: { id: View; icon: string; th: string; en: string }[] = [
  { id: "office", icon: "🏢", th: "ออฟฟิศ", en: "Office" },
  { id: "rooms", icon: "🗂️", th: "การ์ด", en: "Cards" },
  { id: "table", icon: "📋", th: "ตาราง", en: "Table" },
];

const ST: Record<WorkerStatus, { pill: string; dot: string; card: string }> = {
  ok: { pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", card: "border-slate-200" },
  idle: { pill: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400", card: "border-slate-200" },
  warn: { pill: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500", card: "border-amber-300" },
  error: { pill: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500", card: "border-rose-300" },
  unknown: { pill: "bg-white text-slate-500 ring-slate-200", dot: "bg-slate-300", card: "border-dashed border-slate-300" },
};
const ZONE_STYLE: Record<OfficeZoneId, { dot: string; ava: string }> = {
  control: { dot: "bg-violet-500", ava: "bg-violet-50 text-violet-600" },
  sales: { dot: "bg-cyan-600", ava: "bg-cyan-50 text-cyan-700" },
  purchase: { dot: "bg-orange-500", ava: "bg-orange-50 text-orange-600" },
  production: { dot: "bg-lime-600", ava: "bg-lime-50 text-lime-700" },
  marketing: { dot: "bg-pink-500", ava: "bg-pink-50 text-pink-600" },
  finance: { dot: "bg-emerald-600", ava: "bg-emerald-50 text-emerald-700" },
};
const TONE_TAG: Record<OfficeEvent["tone"], { th: string; en: string; cls: string }> = {
  done: { th: "เสร็จ", en: "Done", cls: "bg-emerald-50 text-emerald-700" },
  error: { th: "ล้ม", en: "Failed", cls: "bg-rose-50 text-rose-700" },
  wait: { th: "รอคน", en: "Waiting", cls: "bg-amber-50 text-amber-700" },
  info: { th: "ใช้ AI", en: "AI used", cls: "bg-violet-50 text-violet-700" },
};
const STAT_TONE = { good: "text-emerald-700", warn: "text-amber-700", bad: "text-rose-700" } as const;

function useAgo() {
  const t = useT();
  return useCallback((iso: string | null | undefined): string => {
    if (!iso) return t("ยังไม่มี", "never");
    const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60_000);
    if (m < 1) return t("เมื่อสักครู่", "just now");
    if (m < 60) return t(`${Math.round(m)} นาทีที่แล้ว`, `${Math.round(m)} min ago`);
    if (m < 60 * 24) return t(`${Math.round(m / 60)} ชม.ที่แล้ว`, `${Math.round(m / 60)} h ago`);
    return t(`${Math.round(m / 1440)} วันที่แล้ว`, `${Math.round(m / 1440)} d ago`);
  }, [t]);
}

function StatusPill({ s }: { s: WorkerStatus }) {
  const t = useT();
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ${ST[s].pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ST[s].dot}`} />{t(STATUS_LABEL[s].th, STATUS_LABEL[s].en)}
    </span>
  );
}

function Avatar({ w, live, size = "md" }: { w: OfficeWorker; live?: WorkerLive; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12 text-2xl" : size === "sm" ? "h-7 w-7 text-sm" : "h-10 w-10 text-xl";
  const fresh = live?.status === "ok" && live.lastAt && Date.now() - Date.parse(live.lastAt) < 2 * 3_600_000;
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full ${box} ${ZONE_STYLE[w.zone].ava} ${live && (live.status === "idle" || live.status === "unknown") ? "opacity-60 grayscale" : ""}`}>
      <Icon value={w.icon} />
      {fresh && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
        </span>
      )}
      {live && (live.status === "error" || live.status === "warn") && (
        <span className={`absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full border-2 border-white text-[9px] font-bold text-white ${ST[live.status].dot}`}>!</span>
      )}
    </span>
  );
}

function KindChip({ w }: { w: OfficeWorker }) {
  const t = useT();
  return w.kind === "ai"
    ? <span className="rounded bg-violet-50 px-1.5 py-px text-[10.5px] font-bold text-violet-700">AI</span>
    : <span className="rounded bg-slate-100 px-1.5 py-px text-[10.5px] font-semibold text-slate-500">{t("อัตโนมัติ", "Auto")}</span>;
}

function WorkerCard({ w, live, dim, onOpen }: { w: OfficeWorker; live?: WorkerLive; dim: boolean; onOpen: () => void }) {
  const t = useT();
  const ago = useAgo();
  const s = live?.status ?? "unknown";
  return (
    <article onClick={onOpen}
      className={`flex cursor-pointer flex-col gap-2 rounded-xl border bg-white p-3 shadow-sm transition hover:shadow-md ${ST[s].card} ${dim ? "opacity-30 saturate-50" : ""}`}>
      <div className="flex items-start gap-2.5">
        <Avatar w={w} live={live} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className="text-left text-[14px] font-semibold leading-snug text-slate-800 hover:text-violet-700">{w.title}</button>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400"><KindChip w={w} />{w.titleEn}</div>
        </div>
        <StatusPill s={s} />
      </div>
      <p className="text-[12.5px] leading-snug text-slate-600">{w.does}</p>
      <div className={`flex gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[11.5px] leading-relaxed ${s === "error" ? "bg-rose-50 text-rose-700" : s === "warn" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"}`}>
        <span className="font-semibold opacity-60">›</span><span className="min-w-0 break-words">{live?.headline ?? t("กำลังโหลด…", "Loading…")}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11.5px] text-slate-400">
        <span className="inline-flex items-center gap-1"><Icon value="🕒" />{t("ล่าสุด", "Last")} {ago(live?.lastAt)}</span>
        <span className="truncate">{w.trigger}</span>
      </div>
    </article>
  );
}

function WorkerDrawer({ id, live, events, onClose }: { id: string | null; live: OfficeLive | null; events: OfficeEvent[]; onClose: () => void }) {
  const t = useT();
  const ago = useAgo();
  const w = id ? WORKER_BY_ID[id] : null;
  const wl = id ? live?.workers[id] : undefined;
  const zone = w ? OFFICE_ZONES.find((z) => z.id === w.zone) : null;
  const mine = useMemo(() => events.filter((e) => e.worker === id).slice(0, 8), [events, id]);
  return (
    <Drawer open={!!w} onClose={onClose} size="lg" title={w?.title ?? ""} description={w ? `${w.titleEn} · ${t("ห้อง", "Room")} ${zone?.name ?? ""}` : ""}
      footer={w?.href ? <Link href={w.href} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 text-[13px] font-semibold text-white hover:bg-violet-700"><Icon value="↗️" />{t("เปิดหน้าที่เกี่ยวข้อง", "Open related page")}</Link> : undefined}>
      {w && (
        <div className="flex flex-col gap-4 text-[13px] text-slate-700">
          <section className="flex items-start gap-3">
            <Avatar w={w} live={wl} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><StatusPill s={wl?.status ?? "unknown"} /><KindChip w={w} /><span className="text-[12px] text-slate-400">{t("ล่าสุด", "Last")} {ago(wl?.lastAt)}</span></div>
              <p className="mt-1.5 font-medium text-slate-800">{wl?.headline ?? t("ยังไม่มีข้อมูล", "No data")}</p>
            </div>
          </section>

          {wl?.fix && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <h3 className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-amber-800"><Icon value="🛠️" />{t("ต้องให้คนช่วย", "Needs a person")}</h3>
              <p className="text-amber-900">{wl.fix}</p>
            </section>
          )}

          {!!wl?.stats.length && (
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {wl.stats.map((x) => (
                <div key={x.label} className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <div className="text-[11px] text-slate-500">{x.label}</div>
                  <div className={`text-[14px] font-semibold tabular-nums ${x.tone ? STAT_TONE[x.tone] : "text-slate-800"}`}>{x.value}</div>
                </div>
              ))}
            </section>
          )}

          <section className="space-y-1.5">
            <h3 className="text-[11.5px] font-bold tracking-wide text-slate-500">{t("ทำอะไร", "What it does")}</h3>
            <p>{w.does}</p>
            <p className="flex items-start gap-1.5 text-slate-500"><Icon value="⏰" className="mt-0.5" />{w.trigger}</p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-[11.5px] font-bold tracking-wide text-slate-500">{t("ทำอะไรได้บ้าง", "Allowed to")}</h3>
            <ul className="space-y-1">
              {w.can.map((c) => <li key={c} className="flex items-start gap-2"><span className="mt-0.5 text-emerald-600"><Icon value="✅" /></span>{c}</li>)}
              {w.cannot.map((c) => (
                <li key={c} className="flex items-start gap-2 text-slate-500"><span className="mt-0.5 text-slate-400"><Icon value="🔒" /></span>
                  <span>{c}<span className="block text-[11px] text-slate-400">{t("ล็อกไว้ ต้องให้คนทำหรืออนุมัติ", "Locked: a person must do or approve this")}</span></span></li>
              ))}
            </ul>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-[11.5px] font-bold tracking-wide text-slate-500">{t("ความเคลื่อนไหวล่าสุด", "Recent activity")}</h3>
            {mine.length ? (
              <ul className="space-y-1.5">{mine.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex items-start gap-2"><span className={`mt-px shrink-0 rounded px-1.5 text-[10.5px] font-bold ${TONE_TAG[e.tone].cls}`}>{t(TONE_TAG[e.tone].th, TONE_TAG[e.tone].en)}</span>
                  <span className="min-w-0 flex-1">{e.text}</span><span className="shrink-0 text-[11px] text-slate-400">{ago(e.at)}</span></li>
              ))}</ul>
            ) : <p className="text-slate-400">{t("ยังไม่มีความเคลื่อนไหวที่บันทึกไว้", "No recorded activity yet")}</p>}
          </section>

          <section className="space-y-1 text-[12px] text-slate-500">
            <h3 className="text-[11.5px] font-bold tracking-wide text-slate-500">{t("สถานะนี้ดูจาก", "Status comes from")}</h3>
            <p>{w.source}</p>
            <details className="mt-1">
              <summary className="cursor-pointer select-none text-slate-400 hover:text-slate-600">{t("ไฟล์โค้ด (สำหรับทีมพัฒนา)", "Code files (for developers)")}</summary>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px]">{w.files.map((f) => <li key={f}>{f}</li>)}{w.cron && <li>vercel.json → {w.cron}</li>}</ul>
            </details>
          </section>
        </div>
      )}
    </Drawer>
  );
}

export function AiOffice() {
  const t = useT();
  const ago = useAgo();
  const [live, setLive] = useState<OfficeLive | null>(null);
  const [err, setErr] = useState<"noperm" | "fail" | null>(null);
  const [loading, setLoading] = useState(false);
  const { can } = useAuth();
  const canEdit = can(AI_OFFICE_EDIT_PERM);
  const [view, setView] = useState<View>("office");
  const [filter, setFilter] = useState<WorkerStatus | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/ai-office/status");
      if (res.status === 401 || res.status === 403) { setErr("noperm"); return; }
      const j = await res.json() as { data?: OfficeLive; error?: string | null };
      if (!res.ok || !j.data) { setErr("fail"); return; }
      setLive(j.data); setErr(null);
    } catch { setErr("fail"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === "table" || v === "rooms" || v === "office") setView(v); } catch { /* ไม่มี storage ก็ใช้ค่าเริ่ม */ }
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const pickView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ไม่เป็นไร */ } };
  const counts = useMemo(() => countStatuses(live?.workers), [live]);
  const help = useMemo(() => workersNeedingHelp(live?.workers), [live]);
  const events = live?.events ?? [];
  const aiCount = OFFICE_WORKERS.filter((w) => w.kind === "ai").length;
  const cronCount = OFFICE_WORKERS.filter((w) => w.cron).length;
  const wl = (id: string) => live?.workers[id];
  const statusOf = (id: string): WorkerStatus => wl(id)?.status ?? "unknown";

  const columns: MiniColumn<OfficeWorker>[] = [
    { key: "title", header: t("ตำแหน่ง", "Position"), width: "1.6fr", locked: true, sortValue: (w) => w.title,
      cell: (w) => <span className="flex items-center gap-2"><Avatar w={w} live={wl(w.id)} size="sm" /><span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{w.title}</span><span className="block truncate text-[11px] text-slate-400">{w.titleEn}</span></span></span> },
    { key: "zone", header: t("ห้อง", "Room"), width: "1fr", sortValue: (w) => w.zone, cell: (w) => OFFICE_ZONES.find((z) => z.id === w.zone)?.name ?? w.zone },
    { key: "kind", header: t("ประเภท", "Type"), width: "6rem", sortValue: (w) => w.kind, cell: (w) => <KindChip w={w} /> },
    { key: "status", header: t("สถานะ", "Status"), width: "8rem", sortValue: (w) => STATUS_RANK[statusOf(w.id)], cell: (w) => <StatusPill s={statusOf(w.id)} /> },
    { key: "headline", header: t("ตอนนี้", "Now"), width: "2.4fr", cell: (w) => <span className="text-slate-600">{wl(w.id)?.headline ?? "—"}</span> },
    { key: "last", header: t("ล่าสุด", "Last"), width: "7rem", align: "right", sortValue: (w) => wl(w.id)?.lastAt ?? "", cell: (w) => <span className="text-slate-500">{ago(wl(w.id)?.lastAt)}</span> },
  ];

  if (err === "noperm") {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-slate-600">
        <div className="text-3xl"><Icon value="🔒" /></div>
        <p className="mt-2 font-semibold text-slate-800">{t("หน้านี้สำหรับเจ้าของและแอดมิน", "This page is for owners and admins")}</p>
        <p className="mt-1 text-[13px]">{t("ถ้าต้องการเข้าดู ให้แอดมินเพิ่มสิทธิ์ ai_office.view ให้คุณ", "Ask an admin to grant ai_office.view")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-4 p-3 sm:p-5">
      {/* หัวหน้า */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 sm:text-2xl"><Icon value="🤖" />{t("ออฟฟิศทีม AI", "AI team office")}</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {t(`ผู้ช่วยอัตโนมัติ ${OFFICE_WORKERS.length} ตำแหน่งที่ระบบมีอยู่จริง (ใช้ AI ${aiCount} ตัว) แสดงสถานะจากบันทึกการทำงานจริง ไม่ใช่ตัวอย่าง`,
              `${OFFICE_WORKERS.length} real automated workers (${aiCount} use AI), status from real run records`)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-slate-400">{live ? t(`อัปเดต ${ago(live.at)}`, `Updated ${ago(live.at)}`) : ""}</span>
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-600 hover:bg-slate-50 disabled:opacity-60">
            <Icon value="🔄" />{loading ? t("กำลังโหลด…", "Loading…") : t("รีเฟรช", "Refresh")}
          </button>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label={t("รูปแบบการดู", "View")}>
            {VIEWS.map((v) => (
              <button key={v.id} type="button" onClick={() => pickView(v.id)} aria-pressed={view === v.id}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium ${view === v.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <Icon value={v.icon} />{t(v.th, v.en)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {err === "fail" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          {t("โหลดสถานะไม่สำเร็จ กรุณากดรีเฟรชอีกครั้ง", "Could not load status. Please refresh.")}
        </div>
      )}
      {!!live?.failed.length && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-800">
          {t(`อ่านข้อมูลบางส่วนไม่สำเร็จ (${live.failed.length} ส่วน) ตำแหน่งนั้นจะขึ้น "ยังไม่มีบันทึก"`, `Some data could not be read (${live.failed.length}); those show "No record"`)}
        </div>
      )}

      {/* แถบสรุป */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("กรองตามสถานะ", "Filter by status")}>
          <span className="mr-1 text-[11.5px] text-slate-400">{t("กดเพื่อกรอง", "Tap to filter")}</span>
          {(["error", "warn", "ok", "idle", "unknown"] as WorkerStatus[]).map((s) => (
            <button key={s} type="button" onClick={() => setFilter(filter === s ? null : s)} aria-pressed={filter === s}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] ${filter === s ? `${ST[s].pill} ring-1 border-transparent` : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
              <span className={`h-2 w-2 rounded-full ${ST[s].dot}`} /><b className="tabular-nums">{counts[s]}</b>{t(STATUS_LABEL[s].th, STATUS_LABEL[s].en)}
            </button>
          ))}
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1">
          <div><dt className="text-[11px] text-slate-500">{t("เรื่องที่ต้องให้คนช่วย", "To-dos for people")}</dt><dd className={`text-xl font-bold tabular-nums ${help.length ? "text-rose-600" : "text-slate-800"}`}>{live ? help.length : "—"}</dd></div>
          <div><dt className="text-[11px] text-slate-500">{t("กดใช้ AI ใน 30 วัน", "AI uses (30 days)")}</dt><dd className="text-xl font-bold tabular-nums text-slate-800">{live ? live.aiUses30.toLocaleString("th-TH") : "—"}<span className="ml-1 text-[12px] font-semibold text-slate-400">{t("ครั้ง", "times")}</span></dd></div>
        </dl>
      </div>

      {/* นาฬิกาปลุกเสีย = เรื่องใหญ่สุด แสดงเด่น */}
      {live && !live.cronSecret && (
        <div className="flex flex-col gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3.5 sm:flex-row sm:items-start">
          <span className="text-xl text-rose-600"><Icon value="⏰" /></span>
          <div className="min-w-0 flex-1 text-[13px] text-rose-900">
            <p className="font-semibold">{t(`งานตั้งเวลา ${cronCount} ตัวไม่ได้ทำงานเลย`, `${cronCount} scheduled jobs are not running`)}</p>
            <p className="mt-0.5">{t("Vercel พยายามปลุกทุกวัน แต่ถูกปฏิเสธ เพราะยังไม่ได้ตั้งรหัสลับ CRON_SECRET (เช่น เตือนใบจ่ายงานใกล้กำหนด ต่ออายุกุญแจ Lazada เตือนเงินสด)", "Vercel calls them daily but they are rejected because CRON_SECRET is not set")}</p>
            <p className="mt-1 text-rose-800">{CRON_SECRET_FIX}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        {/* ออฟฟิศพิกเซล / ห้องทำงาน / ตาราง */}
        <section className="order-2 min-w-0 xl:order-1" aria-label={t("ทีมผู้ช่วย", "Workers")}>
          {view === "office" ? (
            <PixelOffice live={live} canEdit={canEdit} onOpen={setOpenId} />
          ) : view === "rooms" ? (
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
              {OFFICE_ZONES.map((z) => {
                const list = OFFICE_WORKERS.filter((w) => w.zone === z.id);
                const bad = list.filter((w) => { const s = statusOf(w.id); return s === "error" || s === "warn"; }).length;
                return (
                  <section key={z.id} className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3 [background-image:radial-gradient(#dcd9e6_1px,transparent_1.3px)] [background-size:14px_14px]">
                    <header className="flex items-start justify-between gap-2 px-1">
                      <div className="min-w-0">
                        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800"><span className={`h-2.5 w-2.5 rounded-[3px] ${ZONE_STYLE[z.id].dot}`} />{t(z.name, z.nameEn)}</h2>
                        <p className="text-[11.5px] text-slate-500">{z.note}</p>
                      </div>
                      <span className={`shrink-0 whitespace-nowrap rounded-full border bg-white px-2 py-px text-[11px] tabular-nums ${bad ? "border-rose-200 text-rose-600" : "border-slate-200 text-slate-500"}`}>
                        {list.length} {t("ตำแหน่ง", "workers")}{bad ? ` · ${t("ต้องดู", "check")} ${bad}` : ""}
                      </span>
                    </header>
                    {list.map((w) => <WorkerCard key={w.id} w={w} live={wl(w.id)} dim={!!filter && statusOf(w.id) !== filter} onOpen={() => setOpenId(w.id)} />)}
                  </section>
                );
              })}
            </div>
          ) : (
            <MiniTable<OfficeWorker>
              rows={(filter ? OFFICE_WORKERS.filter((w) => statusOf(w.id) === filter) : OFFICE_WORKERS)
                .slice().sort((a, b) => STATUS_RANK[statusOf(a.id)] - STATUS_RANK[statusOf(b.id)])}
              columns={columns}
              rowKey={(w) => w.id}
              onRowClick={(w) => setOpenId(w.id)}
              searchText={(w) => `${w.title} ${w.titleEn} ${w.does}`}
              searchPlaceholder={t("ค้นหาตำแหน่ง…", "Search workers…")}
              countUnit={t("ตำแหน่ง", "workers")}
              emptyText={t("ไม่มีตำแหน่งในสถานะนี้", "No workers in this status")}
            />
          )}
        </section>

        {/* ฝั่งขวา: ต้องให้คนช่วย + ความเคลื่อนไหวจริง */}
        <aside className="order-1 flex min-w-0 flex-col gap-4 xl:sticky xl:top-4 xl:order-2 xl:max-h-[calc(100vh-2rem)]">
          <section className="flex min-h-0 shrink-0 flex-col rounded-xl border border-slate-200 bg-white" aria-labelledby="ai-help-h">
            <header className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
              <Icon value="🛠️" /><h2 id="ai-help-h" className="text-[14.5px] font-semibold text-slate-800">{t("ต้องให้คนช่วย", "Needs a person")}</h2>
              {!!help.length && <span className="rounded-full bg-rose-50 px-2 text-[12px] font-bold text-rose-600">{help.length}</span>}
            </header>
            <div className="flex min-h-0 flex-col gap-2 overflow-auto p-2.5 xl:max-h-[45vh]">
              {!live ? <p className="p-3 text-center text-[12.5px] text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>
                : !help.length ? (
                  <div className="p-4 text-center text-[12.5px] text-slate-500"><div className="text-xl text-emerald-500"><Icon value="✅" /></div>{t("ไม่มีตัวไหนติดปัญหา", "Nothing needs attention")}</div>
                ) : help.map((w) => {
                  const x = live.workers[w.id];
                  return (
                    <button key={w.id} type="button" onClick={() => setOpenId(w.id)}
                      className={`flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left hover:bg-slate-50 ${x.status === "error" ? "border-rose-200" : "border-amber-200"}`}>
                      <Avatar w={w} live={x} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-semibold text-slate-800">{w.title}</span><StatusPill s={x.status} /></span>
                        <span className="mt-0.5 block text-[12px] text-slate-600">{x.headline}</span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>

          <section className="flex min-h-[240px] flex-1 flex-col rounded-xl border border-slate-200 bg-white" aria-labelledby="ai-feed-h">
            <header className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
              <Icon value="🕒" /><h2 id="ai-feed-h" className="text-[14.5px] font-semibold text-slate-800">{t("ความเคลื่อนไหวจริง", "Real activity")}</h2>
              <span className="ml-auto text-[11px] text-slate-400">{t("ล่าสุดอยู่บนสุด", "Newest first")}</span>
            </header>
            <ol className="min-h-0 flex-1 overflow-auto px-3.5 py-1 max-xl:max-h-[420px]">
              {!events.length && <li className="py-6 text-center text-[12.5px] text-slate-400">{live ? t("ยังไม่มีความเคลื่อนไหวที่บันทึกไว้", "No recorded activity yet") : t("กำลังโหลด…", "Loading…")}</li>}
              {events.map((e, i) => {
                const w = WORKER_BY_ID[e.worker];
                if (!w) return null;
                return (
                  <li key={`${e.at}-${e.worker}-${i}`} className="flex gap-2.5 border-b border-slate-100 py-2 last:border-0">
                    <Avatar w={w} size="sm" />
                    <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
                      <p className="break-words"><span className={`mr-1 rounded px-1.5 text-[10.5px] font-bold ${TONE_TAG[e.tone].cls}`}>{t(TONE_TAG[e.tone].th, TONE_TAG[e.tone].en)}</span>
                        <button type="button" onClick={() => setOpenId(w.id)} className="font-semibold text-slate-800 hover:text-violet-700">{w.title}</button> {e.text}</p>
                      <p className="text-[11px] text-slate-400">{ago(e.at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </aside>
      </div>

      <p className="text-center text-[11.5px] text-slate-400">
        {t("ขั้นที่ 1: หน้านี้ดูสถานะอย่างเดียว ยังสั่งงาน AI จากหน้านี้ไม่ได้ · รีเฟรชเองทุก 1 นาที", "Step 1: view-only. Commands come later. Auto-refreshes every minute.")}
      </p>

      <WorkerDrawer id={openId} live={live} events={events} onClose={() => setOpenId(null)} />
    </div>
  );
}
