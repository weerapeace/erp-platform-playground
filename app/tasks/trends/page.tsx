"use client";

// ============================================================
// 🔥 เทรนด์ (Creative Trends) — หน้ารายการ
// 1 เทรนด์ = 1 กระดานวาด (กรอบหน้า 16:9) + เช็คลิสต์ "สิ่งที่ต้องมี" (โทนสี/ref/เลย์เอาต์ ฯลฯ)
// ของกลาง: StandaloneShell · ERPModal · useSWRLite · useT · ข้อมูลผ่าน app/tasks/data.ts
// ============================================================

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n";
import { useSWRLite } from "@/lib/swr-lite";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal } from "@/components/modal";
import { TREND_HEAT, TREND_PLATFORMS, heatMeta, TREND_CHECKLIST } from "@/lib/creative-trends-meta";
import { listTrends, createTrend, listBrands, type TrendItem } from "../data";

type FormState = {
  title: string; summary: string; heat: string; brand_id: string;
  platforms: string[]; source_url: string; start_date: string; end_date: string;
};
const EMPTY: FormState = { title: "", summary: "", heat: "rising", brand_id: "", platforms: [], source_url: "", start_date: "", end_date: "" };

export default function TrendsPage() {
  const router = useRouter();
  const t = useT();
  const [q, setQ] = useState("");
  const [heatFilter, setHeatFilter] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trendsSWR = useSWRLite(`creative:trends:${showArchived ? "all" : "active"}`, () => listTrends({ all: showArchived }));
  const brandsSWR = useSWRLite("creative:brands", () => listBrands());
  const trends = trendsSWR.data ?? [];
  const brands = brandsSWR.data ?? [];

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return trends.filter((x) => {
      if (heatFilter && x.heat !== heatFilter) return false;
      if (!s) return true;
      return `${x.title} ${x.summary ?? ""} ${x.tags.join(" ")} ${x.brand_name ?? ""}`.toLowerCase().includes(s);
    });
  }, [trends, q, heatFilter]);

  const togglePlatform = (v: string) =>
    setForm((f) => ({ ...f, platforms: f.platforms.includes(v) ? f.platforms.filter((x) => x !== v) : [...f.platforms, v] }));

  const save = useCallback(async () => {
    if (!form.title.trim()) { setErr(t("กรุณาใส่ชื่อเทรนด์", "Please enter a trend name")); return; }
    setSaving(true); setErr(null);
    try {
      const created = await createTrend({
        title: form.title.trim(), summary: form.summary.trim() || null, heat: form.heat,
        brand_id: form.brand_id || null, platforms: form.platforms,
        source_url: form.source_url.trim() || null,
        start_date: form.start_date || null, end_date: form.end_date || null,
      });
      setModalOpen(false);
      router.push(`/tasks/trends/${created.id}`);   // สร้างเสร็จ → เข้ากระดานเลย
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }, [form, router, t]);

  return (
    <StandaloneShell title={t("เทรนด์", "Trends")} icon="🔥" accent="violet">
      <div className="border-b border-slate-200 bg-white px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🔥 {t("เทรนด์", "Trends")}</h1>
            <p className="mt-1 text-slate-500">
              {t("บอร์ดเทรนด์ 1 หน้า/1 เทรนด์ — โทนสี · ภาพอ้างอิง · เลย์เอาต์แบนเนอร์ ครบในหน้าเดียว แล้วส่งขึ้นกระดานแคมเปญได้เลย",
                 "One page per trend — palette, references, banner layout in one board, ready to drop onto a campaign board")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href="/tasks" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">← {t("งานทั้งหมด", "All tasks")}</a>
            <button onClick={() => { setForm(EMPTY); setErr(null); setModalOpen(true); }}
              className="h-10 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">＋ {t("สร้างเทรนด์", "New trend")}</button>
          </div>
        </div>

        {/* ตัวกรอง */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔍 ${t("ค้นหาเทรนด์...", "Search trends...")}`}
            className="h-9 w-64 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
          <button onClick={() => setHeatFilter("")}
            className={`h-9 rounded-full border px-3 text-xs font-medium ${!heatFilter ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{t("ทั้งหมด", "All")}</button>
          {TREND_HEAT.map((h) => (
            <button key={h.value} onClick={() => setHeatFilter(heatFilter === h.value ? "" : h.value)}
              className={`h-9 rounded-full border px-3 text-xs font-medium ${heatFilter === h.value ? h.cls : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              {h.icon} {t(h.th, h.en)}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3.5 w-3.5" />
            {t("รวมที่เก็บเข้ากรุ", "Include archived")}
          </label>
        </div>
      </div>

      <div className="px-8 py-6">
        {trendsSWR.loading && trends.length === 0 ? (
          <div className="py-20 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <div className="mb-3 text-4xl">🔥</div>
            <p className="font-medium text-slate-600">{trends.length === 0 ? t("ยังไม่มีเทรนด์", "No trends yet") : t("ไม่พบเทรนด์ที่ตรงกับตัวกรอง", "No trends match the filter")}</p>
            <p className="mt-1 text-sm text-slate-400">
              {t('สร้างเทรนด์เพื่อเก็บโทนสี ภาพอ้างอิง และเลย์เอาต์ไว้ที่เดียว เช่น "โทนพาสเทลหน้าร้อน" หรือ "คลิปรีวิวมือถือ"',
                 'Create a trend to keep palette, references and layout in one place')}
            </p>
            <button onClick={() => { setForm(EMPTY); setErr(null); setModalOpen(true); }}
              className="mt-4 h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">＋ {t("สร้างเทรนด์", "New trend")}</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((x) => <TrendCard key={x.id} trend={x} onOpen={() => router.push(`/tasks/trends/${x.id}`)} />)}
          </div>
        )}
      </div>

      {/* สร้างเทรนด์ใหม่ */}
      <ERPModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="lg"
        title={`🔥 ${t("สร้างเทรนด์ใหม่", "New trend")}`}
        description={t("กรอกแค่ชื่อก็สร้างได้ — ที่เหลือไปใส่บนกระดานทีหลัง", "Only the name is required — fill the rest on the board later")}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button onClick={() => !saving && setModalOpen(false)} className="h-9 rounded-lg border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={() => void save()} disabled={saving} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              {saving ? t("กำลังสร้าง...", "Creating...") : t("สร้าง + เปิดกระดาน", "Create + open board")}</button>
          </div>
        }>
        <div className="space-y-3">
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
          <label className="block">
            <span className="text-xs text-slate-500">{t("ชื่อเทรนด์", "Trend name")} *</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus
              placeholder={t("เช่น โทนพาสเทลหน้าร้อน / คลิปรีวิวมือถือ", "e.g. Summer pastel tone")}
              className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">{t("อธิบายสั้น ๆ", "Short summary")}</span>
            <textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={2}
              placeholder={t("เทรนด์นี้คืออะไร ใช้กับงานแบบไหน", "What is this trend and where do we use it?")}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-slate-500">{t("ความแรง", "Heat")}</span>
              <select value={form.heat} onChange={(e) => setForm({ ...form, heat: e.target.value })}
                className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
                {TREND_HEAT.map((h) => <option key={h.value} value={h.value}>{h.icon} {t(h.th, h.en)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">{t("แบรนด์", "Brand")}</span>
              <select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
                className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
                <option value="">— {t("ใช้ได้ทุกแบรนด์", "All brands")} —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">{t("เริ่มใช้", "Starts")}</span>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">{t("ใช้ได้ถึง", "Ends")}</span>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-slate-500">{t("ลิงก์ต้นทาง (โพสต์/คลิปที่เป็นต้นเรื่อง)", "Source link")}</span>
            <input value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="https://..."
              className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </label>
          <div>
            <span className="text-xs text-slate-500">{t("ช่องทางที่จะใช้", "Platforms")}</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {TREND_PLATFORMS.map((p) => (
                <button key={p.value} type="button" onClick={() => togglePlatform(p.value)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${form.platforms.includes(p.value) ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            💡 {t(`สร้างเสร็จจะเข้ากระดานเลย — บนกระดานมีเช็คลิสต์ ${TREND_CHECKLIST.length} ข้อคอยเตือนว่าต้องมีอะไรบ้าง (โทนสี · ภาพอ้างอิง · เลย์เอาต์ ฯลฯ)`,
                  `You'll go straight to the board — a ${TREND_CHECKLIST.length}-item checklist reminds you what a trend needs`)}
          </p>
        </div>
      </ERPModal>
    </StandaloneShell>
  );
}

/** การ์ดเทรนด์ในหน้ารายการ — รูปปก = ภาพถ่ายกระดานล่าสุด */
function TrendCard({ trend, onOpen }: { trend: TrendItem; onOpen: () => void }) {
  const t = useT();
  const h = heatMeta(trend.heat);
  const bar = trend.percent >= 80 ? "bg-emerald-500" : trend.percent >= 40 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div onClick={onOpen} className="cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-violet-300 hover:shadow">
      <div className="flex h-36 items-center justify-center border-b border-slate-100 bg-slate-50">
        {trend.cover_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={trend.cover_url} alt={trend.title} className="h-full w-full object-contain" />
          : <span className="text-xs text-slate-300">{t("ยังไม่มีอะไรบนกระดาน", "Board is empty")}</span>}
      </div>
      <div className="p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${h.cls}`}>{h.icon} {t(h.th, h.en)}</span>
          {!trend.is_active && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">{t("ในกรุ", "Archived")}</span>}
          {trend.brand_name && <span className="ml-auto truncate text-[11px] text-slate-400">🏷 {trend.brand_name}</span>}
        </div>
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800">{trend.title}</p>
        {trend.summary && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{trend.summary}</p>}
        <div className="mt-2 flex items-center gap-1.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full ${bar}`} style={{ width: `${trend.percent}%` }} />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{trend.done}/{trend.total}</span>
        </div>
        {trend.missing_core.length > 0 && (
          <p className="mt-1 text-[10px] text-amber-600">⚠ {t(`ยังขาดข้อสำคัญ ${trend.missing_core.length} ข้อ`, `${trend.missing_core.length} key item(s) missing`)}</p>
        )}
        {trend.platforms.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {trend.platforms.map((p) => {
              const meta = TREND_PLATFORMS.find((x) => x.value === p);
              return <span key={p} title={meta?.label ?? p} className="text-[11px]">{meta?.icon ?? "•"}</span>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
