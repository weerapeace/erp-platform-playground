"use client";

// ============================================================
// 🔥 บอร์ดเทรนด์ (1 เทรนด์ = 1 หน้า 16:9)
//   ซ้าย  = กระดานวาดของกลาง CanvasSketch (entity_type=creative_trend) — วางรูป/สี/เลย์เอาต์
//   ขวา   = เช็คลิสต์ "สิ่งที่ต้องมีในเทรนด์" (เตือนอย่างเดียว ไม่บล็อก) + ข้อมูลเทรนด์
//   ปุ่ม  = 🎨 ส่งขึ้นกระดานแคมเปญ (ของกลาง CampaignBoardPicker)
// กระดานเปล่า → ระบบวาง "กรอบหน้า 16:9" + ช่องแนะนำ (โทนสี/ภาพอ้างอิง/เลย์เอาต์/ข้อความ) ให้ครั้งแรก
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useT } from "@/components/i18n";
import { StandaloneShell } from "@/components/standalone-shell";
import { apiFetch } from "@/lib/api";
import { CampaignBoardPicker, useCanSendToBoard } from "@/components/campaign-board-send";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { TREND_CHECKLIST, TREND_HEAT, TREND_PLATFORMS, heatMeta, trendProgress, type TrendChecklist } from "@/lib/creative-trends-meta";
import { getTrend, updateTrend, deleteTrend, listBrands, type TrendItem } from "../../data";

const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <div className="flex h-[60vh] items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-400">กำลังโหลดกระดาน...</div>,
});

/** ขนาด "หน้ากระดาษ" ของบอร์ดเทรนด์ (16:9) */
const PAGE_W = 1600, PAGE_H = 900;

/** กรอบหน้า + ช่องแนะนำที่วางให้ตอนกระดานยังว่าง (ผู้ใช้ลบ/ย้าย/เขียนทับได้ตามใจ) */
function pageFrameSkeleton(t: (th: string, en: string) => string): Record<string, unknown>[] {
  const zone = (x: number, y: number, w: number, h: number, label: string, color: string): Record<string, unknown>[] => ([
    { type: "rectangle", x, y, width: w, height: h, strokeColor: color, backgroundColor: "transparent", strokeStyle: "dashed", roundness: { type: 3 }, strokeWidth: 1 },
    { type: "text", x: x + 14, y: y + 12, text: label, fontSize: 20, strokeColor: color },
  ]);
  return [
    { type: "frame", children: [], name: t("หน้าเทรนด์ · 16:9", "Trend page · 16:9"), x: 0, y: 0, width: PAGE_W, height: PAGE_H },
    ...zone(40, 60, 380, 220, `🎨 ${t("โทนสี", "Palette")}`, "#e11d48"),
    ...zone(40, 310, 760, 540, `🖼 ${t("ภาพอ้างอิง (อย่างน้อย 3 รูป)", "References (3+)")}`, "#7c3aed"),
    ...zone(830, 60, 730, 480, `📐 ${t("เลย์เอาต์แบนเนอร์ + ขนาดที่ใช้", "Banner layout + sizes")}`, "#0f766e"),
    ...zone(830, 570, 730, 280, `💬 ${t("ข้อความหลัก + ฟอนต์", "Key message + fonts")}`, "#b45309"),
  ];
}

export default function TrendBoardPage() {
  const t = useT();
  const id = String(useParams().id ?? "");

  const [trend, setTrend] = useState<TrendItem | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [boardOpen, setBoardOpen] = useState(false);          // ป๊อปเลือกแคมเปญปลายทาง
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const sketchRef = useRef<CanvasSketchControls | null>(null);
  const seededRef = useRef(false);
  const canSend = useCanSendToBoard();

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getTrend(id).then((x) => { if (alive) setTrend(x); }).catch((e) => { if (alive) setErr((e as Error).message); });
    listBrands().then((bs) => { if (alive) setBrands(bs.map((b) => ({ id: b.id, name: b.name }))); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  /** บันทึกทีละฟิลด์ (เช็คลิสต์/ข้อมูล) — เก็บผลกลับเข้า state ให้ % อัปเดตทันที */
  const patch = useCallback(async (p: Parameters<typeof updateTrend>[1]) => {
    if (!id) return;
    setSaving(true);
    try { setTrend(await updateTrend(id, p)); }
    catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }, [id]);

  // กระดานพร้อม → ถ้ายังว่าง วางกรอบหน้า 16:9 + ช่องแนะนำให้ครั้งแรก
  const onBoardReady = useCallback(async () => {
    if (!id || seededRef.current) return;
    seededRef.current = true;
    try {
      const j = await apiFetch(`/api/canvas-sketch?entity_type=creative_trend&entity_id=${encodeURIComponent(id)}`).then((r) => r.json());
      const els = (j?.data?.scene?.elements ?? []) as unknown[];
      if (els.length === 0 && j?.data?.can_edit !== false) await sketchRef.current?.insert(pageFrameSkeleton(t));
    } catch { /* วางกรอบไม่ได้ = ไม่เป็นไร ใช้กระดานเปล่าได้ */ }
  }, [id, t]);

  const addFrame = () => { void sketchRef.current?.insert(pageFrameSkeleton(t)); };

  const archive = async () => {
    if (!id || !trend) return;
    if (!window.confirm(t(`เก็บเทรนด์ "${trend.title}" เข้ากรุ? (กระดานยังอยู่ กู้คืนได้)`, `Archive "${trend.title}"? The board is kept.`))) return;
    try { await deleteTrend(id); window.location.href = "/tasks/trends"; }
    catch (e) { setErr((e as Error).message); }
  };

  if (err && !trend) return <StandaloneShell title={t("เทรนด์", "Trend")} icon="🔥" accent="violet"><div className="p-8 text-red-600">{err}</div></StandaloneShell>;

  const prog = trendProgress(trend?.checklist);
  const h = heatMeta(trend?.heat);
  const barCls = prog.percent >= 80 ? "bg-emerald-500" : prog.percent >= 40 ? "bg-amber-400" : "bg-rose-400";

  return (
    <StandaloneShell title={trend?.title ?? t("เทรนด์", "Trend")} icon="🔥" accent="violet">
      {/* หัวเรื่อง */}
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <a href="/tasks/trends" className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">← {t("เทรนด์ทั้งหมด", "All trends")}</a>
          <input value={trend?.title ?? ""} onChange={(e) => setTrend((x) => (x ? { ...x, title: e.target.value } : x))}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== "" ) void patch({ title: v }); }}
            title={t("แก้ชื่อเทรนด์ได้เลย", "Edit the trend name")}
            className="h-9 min-w-[200px] flex-1 rounded-lg border border-transparent px-2 text-lg font-bold text-slate-900 hover:border-slate-200 focus:border-violet-400 focus:outline-none" />
          <select value={trend?.heat ?? "rising"} onChange={(e) => void patch({ heat: e.target.value })}
            className={`h-9 rounded-full border px-3 text-xs font-medium ${h.cls}`}>
            {TREND_HEAT.map((x) => <option key={x.value} value={x.value}>{x.icon} {t(x.th, x.en)}</option>)}
          </select>
          {canSend && (
            <button onClick={() => setBoardOpen(true)} title={t("วางเทรนด์นี้เป็นการ์ดบนกระดานแคมเปญ", "Place this trend as a card on a campaign board")}
              className="h-9 rounded-lg border border-indigo-300 px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50">🎨 {t("ส่งขึ้นกระดานแคมเปญ", "Send to campaign board")}</button>
          )}
          <button onClick={addFrame} title={t("วางกรอบหน้า 16:9 + ช่องแนะนำอีกชุด", "Insert another 16:9 page frame")}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">🖼 {t("วางกรอบหน้า", "Page frame")}</button>
          <button onClick={() => setSideOpen((v) => !v)}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">{sideOpen ? "▶" : "◀"} {t("เช็คลิสต์", "Checklist")}</button>
          <button onClick={() => void archive()} className="h-9 rounded-lg px-3 text-sm text-slate-400 hover:bg-rose-50 hover:text-rose-600">🗑 {t("เก็บเข้ากรุ", "Archive")}</button>
        </div>
        {/* แถบความครบ */}
        <div className="mt-2 flex items-center gap-2">
          <div className="h-2 max-w-md flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full transition-all ${barCls}`} style={{ width: `${prog.percent}%` }} />
          </div>
          <span className="text-xs tabular-nums text-slate-500">{prog.done}/{prog.total} {t("ข้อ", "items")} · {prog.percent}%</span>
          {prog.missingCore.length > 0 && (
            <span className="truncate text-xs text-amber-600">
              ⚠ {t("ยังขาด", "Missing")}: {prog.missingCore.slice(0, 4).map((c) => `${c.icon} ${t(c.th, c.en)}`).join(" · ")}{prog.missingCore.length > 4 ? " …" : ""}
            </span>
          )}
          {saving && <span className="text-xs text-slate-400">{t("กำลังบันทึก...", "Saving...")}</span>}
        </div>
      </div>

      <div className="flex gap-3 px-4 py-3">
        {/* กระดาน */}
        <div className="min-w-0 flex-1">
          {id && <CanvasSketch entityType="creative_trend" entityId={id} height="calc(100vh - 240px)" controlsRef={sketchRef} onReady={onBoardReady} collab stickyTop={128} />}
        </div>

        {/* เช็คลิสต์ + ข้อมูลเทรนด์ */}
        {sideOpen && (
          <aside className="w-[330px] shrink-0 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">✅ {t("สิ่งที่ต้องมีในเทรนด์", "What this trend needs")}</h3>
                <span className="text-[11px] text-slate-400">{t("ติ๊กเมื่อวางบนกระดานแล้ว", "Tick when it's on the board")}</span>
              </div>
              <div className="max-h-[calc(100vh-360px)] space-y-1 overflow-auto pr-1">
                {TREND_CHECKLIST.map((c) => {
                  const cur = (trend?.checklist ?? {})[c.key];
                  const done = !!cur?.done;
                  return (
                    <div key={c.key} className={`rounded-lg border p-2 ${done ? "border-emerald-200 bg-emerald-50/60" : c.core ? "border-amber-200 bg-amber-50/40" : "border-slate-200"}`}>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input type="checkbox" checked={done} className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
                          onChange={(e) => {
                            const next: TrendChecklist = { ...(trend?.checklist ?? {}) };
                            next[c.key] = { ...(next[c.key] ?? {}), done: e.target.checked };
                            setTrend((x) => (x ? { ...x, checklist: next } : x));
                            void patch({ checklist: next });
                          }} />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-slate-800">
                            {c.icon} {t(c.th, c.en)}
                            {c.core && !done && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">{t("ควรมี", "key")}</span>}
                          </span>
                          <span className="block text-[11px] leading-snug text-slate-400">{t(c.thHint, c.enHint)}</span>
                        </span>
                      </label>
                      <NoteInput value={cur?.note ?? ""} placeholder={t("โน้ตสั้น ๆ / ลิงก์ (ไม่ใส่ก็ได้)", "Short note / link (optional)")}
                        onSave={(note) => {
                          const next: TrendChecklist = { ...(trend?.checklist ?? {}) };
                          next[c.key] = { ...(next[c.key] ?? {}), note };
                          setTrend((x) => (x ? { ...x, checklist: next } : x));
                          void patch({ checklist: next });
                        }} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ข้อมูลเทรนด์ (แก้ได้ทันที) */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <h3 className="text-sm font-semibold text-slate-800">📋 {t("ข้อมูลเทรนด์", "Trend info")}</h3>
              <label className="block">
                <span className="text-[11px] text-slate-500">{t("อธิบายสั้น ๆ", "Summary")}</span>
                <textarea defaultValue={trend?.summary ?? ""} rows={2} onBlur={(e) => void patch({ summary: e.target.value })}
                  className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500">{t("ลิงก์ต้นทาง", "Source link")}</span>
                <div className="mt-0.5 flex gap-1">
                  <input defaultValue={trend?.source_url ?? ""} placeholder="https://..." onBlur={(e) => void patch({ source_url: e.target.value })}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                  {trend?.source_url && <a href={trend.source_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2 text-xs text-blue-600 hover:bg-blue-50">↗</a>}
                </div>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] text-slate-500">{t("แบรนด์", "Brand")}</span>
                  <select value={trend?.brand_id ?? ""} onChange={(e) => void patch({ brand_id: e.target.value || null })}
                    className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-1 text-xs">
                    <option value="">— {t("ทุกแบรนด์", "All")} —</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-500">{t("ใช้ได้ถึง", "Ends")}</span>
                  <input type="date" defaultValue={trend?.end_date ?? ""} onChange={(e) => void patch({ end_date: e.target.value || null })}
                    className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 px-1 text-xs" />
                </label>
              </div>
              <div>
                <span className="text-[11px] text-slate-500">{t("ช่องทางที่จะใช้", "Platforms")}</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {TREND_PLATFORMS.map((p) => {
                    const on = (trend?.platforms ?? []).includes(p.value);
                    return (
                      <button key={p.value} type="button"
                        onClick={() => {
                          const cur = trend?.platforms ?? [];
                          void patch({ platforms: on ? cur.filter((x) => x !== p.value) : [...cur, p.value] });
                        }}
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                        {p.icon} {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {err && <p className="text-[11px] text-rose-600">{err}</p>}
            </div>
          </aside>
        )}
      </div>

      {/* ส่งเทรนด์นี้ขึ้นกระดานแคมเปญ */}
      <CampaignBoardPicker open={boardOpen} onClose={() => setBoardOpen(false)} trendIds={id ? [id] : []} />
    </StandaloneShell>
  );
}

/** ช่องโน้ตต่อข้อ — บันทึกตอนออกจากช่อง (ไม่ยิง API ทุกตัวอักษร) */
function NoteInput({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v); }}
      className="mt-1 h-7 w-full rounded border border-transparent bg-white/60 px-1.5 text-[11px] text-slate-600 hover:border-slate-200 focus:border-violet-300 focus:outline-none" />
  );
}
