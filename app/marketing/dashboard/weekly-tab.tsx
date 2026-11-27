"use client";

/**
 * แท็บ "สรุปสัปดาห์" ของหน้าภาพรวมการตลาด — /api/marketing/weekly (แผนการตลาด รอบ 8 · เจ้าของเลือก 2026-11-27 แบบ A + ข้อ 1-4)
 * --------------------------------------------------------------------------
 * 1 ใบ = 1 สัปดาห์ (จันทร์–อาทิตย์) × แบรนด์ที่เลือกด้านบน (ไม่เลือก = ทุกแบรนด์) · ไม่ใช้ช่วงวันที่ของหน้า
 * - ตัวเลขเก็บตอนสร้าง (พิมพ์ซ้ำได้เหมือนเดิม) · AI เขียน บทสรุป / สิ่งที่ควรทำ / สรุปรีวิว (≈ 1–3 บาท/ใบ · ปิดได้ที่ศูนย์บริการที่เสียเงิน)
 * - แก้ได้ทุกบรรทัด · ทุกการแก้เก็บเวอร์ชันเก่า (ประวัติ → ย้อนกลับ) · ลบ = เก็บไว้ กู้คืนได้ (ปุ่มย้อนกลับ + ถังขยะ)
 * - ทุกวันจันทร์ 08:30 ระบบสร้างใบ "ทุกแบรนด์" ของสัปดาห์ที่แล้วให้เอง + แจ้งกระดิ่ง (/api/cron/marketing-weekly)
 * - PDF / ส่ง LINE-อีเมล = หน้าพิมพ์ /print/marketing-weekly/[id] (แถบพิมพ์กลาง + ปุ่มส่ง PDF กลาง)
 * ของกลาง: ERPModal · useToast (undo) · Icon · Loading/Error/EmptyState
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { shiftYmd } from "@/lib/platform-dashboard-calc";
import { campaignLabels, pctChange, weekLabel, type WeeklyAction, type WeeklyData, type WeeklyReview, type WeeklyVersion } from "@/lib/marketing-weekly-calc";

const baht = (n: number | null | undefined) => (n == null ? "—" : `฿${Math.round(n).toLocaleString("th-TH")}`);
const chg = (cur: number, prev: number) => { const p = pctChange(cur, prev); return p == null ? null : p; };
const chgTxt = (p: number | null) => (p == null ? "—" : `${p >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(p * 100))}%`);
const chgCls = (p: number | null) => (p == null ? "text-slate-400" : p >= 0 ? "text-emerald-600" : "text-rose-600");
const dtTh = (iso: string) => { const t = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString(); return `${+t.slice(8, 10)}/${+t.slice(5, 7)} ${t.slice(11, 16)}`; };

type Report = {
  id: string; week_start: string; brand_id: string | null; data: WeeklyData; ai_summary: string | null; ai_actions: WeeklyAction[]; review_summary: Partial<WeeklyReview>;
  ai_error: string | null; edited: boolean; history: WeeklyVersion[]; source: string; updated_at: string; is_active: boolean;
};
type ListRow = { id: string; week_start: string; ai_error: string | null; edited: boolean; source: string; updated_at: string; deleted_at: string | null };
type Resp = { list: ListRow[]; report: Report | null; canEdit: boolean; lastWeek: string; thisWeek: string; error: string | null };

function Card({ label, value, sub, subCls }: { label: string; value: React.ReactNode; sub?: React.ReactNode; subCls?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{value}</div>
      {sub != null && <div className={`mt-0.5 text-xs ${subCls ?? "text-slate-500"}`}>{sub}</div>}
    </div>
  );
}
function Section({ title, icon, right, children }: { title: string; icon: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Icon name={icon} /> {title}</h3>
        <div className="ml-auto flex flex-wrap gap-1.5">{right}</div>
      </div>
      {children}
    </section>
  );
}
const SmallBtn = ({ onClick, icon, children, disabled, tone }: { onClick: () => void; icon: string; children: React.ReactNode; disabled?: boolean; tone?: "primary" | "danger" }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs disabled:opacity-50 ${tone === "primary" ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700" : tone === "danger" ? "border-rose-200 bg-white text-rose-600 hover:bg-rose-50" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
    <Icon name={icon} /> {children}
  </button>
);
const lines = (s: string) => s.split("\n").map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);

export function WeeklyTab({ brandId, brandName, reloadKey }: { brandId: string; brandName: string; reloadKey: number }) {
  const toast = useToast();
  const [d, setD] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<string>("");
  const [trash, setTrash] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [edit, setEdit] = useState<null | { summary: string; actions: WeeklyAction[]; praise: string; complaints: string }>(null);

  const load = useCallback(async (id?: string) => {
    setLoading(true); setErr(null);
    const q = new URLSearchParams();
    if (brandId) q.set("brand_id", brandId);
    if (id) q.set("id", id);
    if (trash) q.set("trash", "1");
    try {
      const res = await apiFetch(`/api/marketing/weekly?${q}`);
      const j = (await res.json()) as Resp;
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setD(j); setPick(j.report?.id ?? "");
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [brandId, trash]);
  useEffect(() => { setEdit(null); void load(); }, [load, reloadKey]);

  const r = d?.report ?? null;
  const call = async (method: "POST" | "PATCH" | "DELETE", body?: unknown, qs = "") => {
    const res = await apiFetch(`/api/marketing/weekly${qs}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error || "ทำรายการไม่สำเร็จ");
    return j as { report?: Report };
  };
  const restoreV0 = (id: string) => async () => { try { await call("PATCH", { id, restore_version: 0 }); toast.success("ย้อนกลับแล้ว"); void load(id); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); } };

  const generate = async (weekStart: string, skipAi: boolean) => {
    setBusy("gen");
    try {
      const existed = d?.list.some((x) => x.week_start === weekStart && !trash);
      const j = await call("POST", { week_start: weekStart, brand_id: brandId || null, skip_ai: skipAi });
      const rep = j.report as Report;
      setNewOpen(false); setTrash(false);
      if (rep.ai_error) toast.warning(`บันทึกตัวเลขแล้ว แต่ AI เขียนไม่สำเร็จ: ${rep.ai_error}`);
      if (existed) toast.undo("สร้างใหม่แล้ว (ข้อความเดิมเก็บในประวัติ)", restoreV0(rep.id), { ms: 10000 });
      else toast.undo(`สร้างใบ ${weekLabel(weekStart)} แล้ว`, async () => { try { await call("DELETE", undefined, `?id=${rep.id}`); void load(); } catch { /* */ } }, { ms: 8000 });
      await load(rep.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  const save = async (patch: { summary?: string; actions?: WeeklyAction[]; review?: WeeklyReview }, msg = "บันทึกแล้ว", undoable = true) => {
    if (!r) return;
    setBusy("save");
    try {
      const before = r;
      const j = await call("PATCH", { id: r.id, ...patch });
      setD((x) => (x && j.report ? { ...x, report: j.report } : x));
      setEdit(null);
      if (undoable) toast.undo(msg, restoreV0(r.id), { ms: 8000 });
      else toast.undo(msg, async () => { try { await call("PATCH", { id: before.id, actions: before.ai_actions }); void load(before.id); } catch { /* */ } }, { ms: 6000 });
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  const toggleDone = (i: number) => {
    if (!r || !d?.canEdit) return;
    const actions = r.ai_actions.map((a, k) => (k === i ? { ...a, done: !a.done } : a));
    void save({ actions }, actions[i].done ? "ติ๊กว่าทำแล้ว" : "เอาติ๊กออกแล้ว", false);
  };

  const del = async () => {
    if (!r) return;
    setBusy("del");
    try {
      await call("DELETE", undefined, `?id=${r.id}`);
      const id = r.id;
      toast.undo(`ลบใบ ${weekLabel(r.week_start)} แล้ว (เก็บไว้ กู้คืนได้)`, async () => { try { await call("PATCH", { id, is_active: true }); toast.success("กู้คืนแล้ว"); void load(id); } catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); } }, { ms: 10000 });
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setBusy(null); }
  };
  const restoreDeleted = async () => {
    if (!r) return;
    setBusy("restore");
    try { await call("PATCH", { id: r.id, is_active: true }); toast.success("กู้คืนแล้ว"); setTrash(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  const weekChoices = useMemo(() => {
    if (!d) return [];
    const out = [d.thisWeek];
    for (let i = 0; i < 8; i++) out.push(shiftYmd(d.lastWeek, -7 * i));
    return out;
  }, [d]);

  if (loading && !d) return <LoadingState label="กำลังโหลดสรุปสัปดาห์…" />;
  if (err && !d) return <ErrorState title="โหลดสรุปสัปดาห์ไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!d) return null;
  const data = r?.data;
  const canEdit = d.canEdit && !!r?.is_active;

  return (
    <div className={`space-y-3 ${loading ? "opacity-60 transition-opacity" : ""}`}>
      {/* แถบบน: เลือกสัปดาห์ + ปุ่ม */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={pick} onChange={(e) => { setEdit(null); void load(e.target.value); }} aria-label="เลือกสัปดาห์"
          className="h-9 min-w-0 max-w-full flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm sm:flex-none">
          {d.list.length === 0 && <option value="">{trash ? "ถังขยะว่าง" : "ยังไม่มีใบสรุป"}</option>}
          {d.list.map((x) => <option key={x.id} value={x.id}>{weekLabel(x.week_start)}{x.edited ? " · แก้แล้ว" : ""}{x.ai_error ? " · ไม่มีบทสรุป AI" : ""}{x.source === "cron" ? " · อัตโนมัติ" : ""}</option>)}
        </select>
        <span className="text-xs text-slate-500">{brandName}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {d.canEdit && !trash && <SmallBtn icon="add" tone="primary" onClick={() => setNewOpen(true)} disabled={!!busy}>สร้างใบใหม่</SmallBtn>}
          {r && canEdit && <SmallBtn icon="ai" onClick={() => void generate(r.week_start, false)} disabled={!!busy}>{busy === "gen" ? "AI กำลังเขียน…" : "ให้ AI เขียนใหม่"}</SmallBtn>}
          {r && r.is_active && <a href={`/print/marketing-weekly/${r.id}`} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"><Icon name="print" /> PDF / ส่ง</a>}
          {r && <SmallBtn icon="history" onClick={() => setHistOpen(true)}>ประวัติ ({r.history?.length ?? 0})</SmallBtn>}
          {r && canEdit && <SmallBtn icon="delete" tone="danger" onClick={() => void del()} disabled={!!busy}>ลบ</SmallBtn>}
          {r && trash && d.canEdit && <SmallBtn icon="refresh" tone="primary" onClick={() => void restoreDeleted()} disabled={!!busy}>กู้คืนใบนี้</SmallBtn>}
          <SmallBtn icon={trash ? "back" : "delete"} onClick={() => { setEdit(null); setTrash((t) => !t); }}>{trash ? "กลับ" : "ถังขยะ"}</SmallBtn>
        </div>
      </div>

      {busy === "gen" && <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">กำลังรวมตัวเลขและให้ AI เขียนสรุป — ใช้เวลาราว 20–60 วินาที</div>}

      {!r || !data ? (
        <EmptyState title={trash ? "ไม่มีใบที่ลบ" : "ยังไม่มีใบสรุปสัปดาห์"} hint={trash ? "ใบที่ลบจะมาอยู่ที่นี่ กู้คืนได้" : `ทุกวันจันทร์ 08:30 ระบบสร้างใบของสัปดาห์ที่แล้วให้เอง (ทุกแบรนด์รวม) · หรือกด "สร้างใบใหม่"`} />
      ) : (
        <>
          {trash && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">ใบนี้อยู่ในถังขยะ — กด "กู้คืนใบนี้" เพื่อเอากลับ</div>}
          <div className="text-sm text-slate-600">สัปดาห์ <b>{weekLabel(r.week_start)}</b> · เทียบ {weekLabel(data.prev.from)} · {data.brand.name}
            {(campaignLabels(data.week).length > 0 || campaignLabels(data.prev).length > 0) && <span className="ml-1 text-xs text-amber-700">· วันแคมเปญ: สัปดาห์นี้ {campaignLabels(data.week).join(", ") || "ไม่มี"} / สัปดาห์ก่อน {campaignLabels(data.prev).join(", ") || "ไม่มี"}</span>}
          </div>

          {/* ตัวเลขหลัก */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Card label="ยอดขาย" value={baht(data.sales.cur)} sub={`${chgTxt(chg(data.sales.cur, data.sales.prev))} (ก่อน ${baht(data.sales.prev)})`} subCls={chgCls(chg(data.sales.cur, data.sales.prev))} />
            <Card label="ออเดอร์" value={data.sales.orders.toLocaleString("th-TH")} sub={`${chgTxt(chg(data.sales.orders, data.sales.prevOrders))} · ต่อบิล ${baht(data.sales.aov)}`} subCls={chgCls(chg(data.sales.orders, data.sales.prevOrders))} />
            <Card label="โฆษณา" value={data.ads ? baht(data.ads.spend) : "—"} sub={data.ads ? `ROAS ${data.ads.roas?.toFixed(1) ?? "—"} (ก่อน ${data.ads.prevRoas?.toFixed(1) ?? "—"})` : "ยังไม่มีข้อมูล"} />
            <Card label="รีวิว" value={data.reviews.avg != null ? `${data.reviews.avg.toFixed(2)} ★` : "—"} sub={`${data.reviews.count} รีวิว · 1-3 ดาว ${data.reviews.low}${data.reviews.lowOpen ? ` · ยังไม่ตอบ ${data.reviews.lowOpen}` : ""}`} subCls={data.reviews.lowOpen ? "text-rose-600" : undefined} />
            <Card label={`เป้าเดือน ${data.sales.target?.month.slice(5) ?? ""}`} value={data.sales.target?.pct != null ? `${Math.round(data.sales.target.pct * 100)}%` : "—"} sub={data.sales.target?.target ? `${baht(data.sales.target.mtd)} / ${baht(data.sales.target.target)}` : "ยังไม่ตั้งเป้า"} />
          </div>

          {/* บทสรุป AI */}
          <Section title="บทสรุปสัปดาห์นี้" icon="ai" right={canEdit && !edit ? <SmallBtn icon="edit" onClick={() => setEdit({ summary: r.ai_summary ?? "", actions: r.ai_actions ?? [], praise: (r.review_summary?.praise ?? []).join("\n"), complaints: (r.review_summary?.complaints ?? []).join("\n") })}>แก้ไขข้อความ</SmallBtn> : null}>
            {r.ai_error && !r.ai_summary && <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">AI ยังไม่ได้เขียน: {r.ai_error} — กด "ให้ AI เขียนใหม่" หรือพิมพ์เองที่ "แก้ไขข้อความ"</div>}
            {edit ? (
              <textarea value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} rows={6} className="w-full rounded-lg border border-slate-200 p-2 text-sm" placeholder="บทสรุปสัปดาห์" />
            ) : r.ai_summary ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{r.ai_summary}</p> : <p className="text-sm text-slate-400">ยังไม่มีบทสรุป</p>}
            {r.edited && !edit && <div className="mt-1 text-[11px] text-slate-400">แก้ไขโดยคนแล้ว · ล่าสุด {dtTh(r.updated_at)}</div>}
          </Section>

          {/* สิ่งที่ควรทำ */}
          <Section title="สิ่งที่ควรทำสัปดาห์หน้า" icon="target">
            {edit ? (
              <div className="space-y-2">
                {edit.actions.map((a, i) => (
                  <div key={i} className="flex flex-col gap-1 rounded-lg border border-slate-200 p-2 sm:flex-row">
                    <input value={a.text} onChange={(e) => setEdit({ ...edit, actions: edit.actions.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} placeholder="สิ่งที่ต้องทำ" className="h-8 flex-1 rounded border border-slate-200 px-2 text-sm" />
                    <input value={a.why ?? ""} onChange={(e) => setEdit({ ...edit, actions: edit.actions.map((x, k) => (k === i ? { ...x, why: e.target.value } : x)) })} placeholder="เหตุผล (ไม่ใส่ก็ได้)" className="h-8 flex-1 rounded border border-slate-200 px-2 text-sm" />
                    <button type="button" onClick={() => setEdit({ ...edit, actions: edit.actions.filter((_, k) => k !== i) })} className="h-8 rounded border border-rose-200 px-2 text-xs text-rose-600 hover:bg-rose-50" aria-label="ลบข้อนี้"><Icon name="delete" /></button>
                  </div>
                ))}
                <SmallBtn icon="add" onClick={() => setEdit({ ...edit, actions: [...edit.actions, { text: "", done: false }] })}>เพิ่มข้อ</SmallBtn>
              </div>
            ) : r.ai_actions?.length ? (
              <ol className="space-y-1.5">
                {r.ai_actions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <input type="checkbox" checked={!!a.done} disabled={!canEdit || !!busy} onChange={() => toggleDone(i)} className="mt-1 h-4 w-4 shrink-0" aria-label="ทำแล้ว" />
                    <div className={a.done ? "text-slate-400 line-through" : "text-slate-800"}>
                      <span className="font-medium">{i + 1}. {a.text}</span>
                      {a.why && <div className="text-xs text-slate-500">{a.why}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-slate-400">ยังไม่มี</p>}
          </Section>

          {/* สรุปรีวิว */}
          <Section title={`ลูกค้าพูดถึงเรา (สรุปจากรีวิว ${data.reviews.windowDays} วันล่าสุด)`} icon="star">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["praise", "complaints"] as const).map((k) => (
                <div key={k}>
                  <div className={`mb-1 text-xs font-semibold ${k === "praise" ? "text-emerald-700" : "text-rose-700"}`}>{k === "praise" ? "ชมบ่อย" : "บ่นบ่อย / ควรแก้"}</div>
                  {edit ? (
                    <textarea value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} rows={4} className="w-full rounded-lg border border-slate-200 p-2 text-sm" placeholder="1 บรรทัด = 1 ข้อ" />
                  ) : (r.review_summary?.[k] ?? []).length ? (
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">{(r.review_summary[k] ?? []).map((t, i) => <li key={i}>{t}</li>)}</ul>
                  ) : <p className="text-sm text-slate-400">{data.reviews.samples.length ? "ไม่มี" : "ไม่มีรีวิวที่มีข้อความให้สรุป"}</p>}
                </div>
              ))}
            </div>
          </Section>

          {edit && (
            <div className="sticky bottom-2 z-10 flex justify-end gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow">
              <SmallBtn icon="cancel" onClick={() => setEdit(null)}>ยกเลิก</SmallBtn>
              <SmallBtn icon="save" tone="primary" disabled={busy === "save"} onClick={() => void save({ summary: edit.summary, actions: edit.actions.filter((a) => a.text.trim()), review: { praise: lines(edit.praise), complaints: lines(edit.complaints) } }, "บันทึกข้อความแล้ว (เวอร์ชันเดิมเก็บในประวัติ)")}>{busy === "save" ? "กำลังบันทึก…" : "บันทึก"}</SmallBtn>
            </div>
          )}

          {/* ตัวเลขประกอบ */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="ช่องทาง" icon="store">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">ช่องทาง</th><th className="py-1 text-right">ยอด</th><th className="py-1 text-right">เทียบ</th><th className="hidden py-1 text-right sm:table-cell">ออเดอร์</th></tr></thead>
                <tbody>{data.channels.map((c) => { const p = chg(c.cur, c.prev); return (
                  <tr key={c.code} className="border-t border-slate-100"><td className="py-1">{c.name}</td><td className="py-1 text-right">{baht(c.cur)}</td><td className={`py-1 text-right ${chgCls(p)}`}>{chgTxt(p)}</td><td className="hidden py-1 text-right sm:table-cell">{c.orders}</td></tr>
                ); })}</tbody>
              </table>
            </Section>
            <Section title="ยอดรายวัน" icon="chart">
              {(() => { const max = Math.max(1, ...data.daily.map((x) => x.sales)); return (
                <div className="flex h-32 items-end gap-1.5">
                  {data.daily.map((x, i) => (
                    <div key={x.date} className="flex flex-1 flex-col items-center gap-1" title={`${x.date}: ${baht(x.sales)} · ${x.orders} ออเดอร์`}>
                      <div className="w-full rounded-t bg-blue-500/80" style={{ height: `${Math.max(2, (x.sales / max) * 100)}%` }} />
                      <span className="text-[10px] text-slate-500">{["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"][i]}</span>
                    </div>
                  ))}
                </div>
              ); })()}
            </Section>
            <Section title="ขายดี 10 อันดับ" icon="trophy">
              <ol className="space-y-1 text-sm">{data.topProducts.map((p, i) => { const c = chg(p.sales, p.prev); return (
                <li key={p.key} className="flex gap-2"><span className="w-5 shrink-0 text-right text-slate-400">{i + 1}</span><span className="min-w-0 flex-1 truncate" title={p.name}>{p.name}</span><span className="shrink-0">{baht(p.sales)}</span><span className={`w-14 shrink-0 text-right text-xs ${chgCls(c)}`}>{chgTxt(c)}</span></li>
              ); })}</ol>
            </Section>
            <Section title="ขึ้นแรง / ตกแรง" icon="trend-up">
              {data.rising.length + data.falling.length === 0 ? <p className="text-sm text-slate-400">ไม่มีสินค้าที่ขึ้น/ลงแรง</p> : (
                <div className="space-y-1 text-sm">
                  {data.rising.map((p) => <div key={`r${p.name}`} className="flex gap-2"><span className="text-emerald-600">▲</span><span className="min-w-0 flex-1 truncate">{p.name}</span><span className="shrink-0 text-xs text-slate-500">{baht(p.prev)} → {baht(p.cur)}</span></div>)}
                  {data.falling.map((p) => <div key={`f${p.name}`} className="flex gap-2"><span className="text-rose-600">▼</span><span className="min-w-0 flex-1 truncate">{p.name}</span><span className="shrink-0 text-xs text-slate-500">{baht(p.prev)} → {baht(p.cur)}</span></div>)}
                </div>
              )}
            </Section>
            <Section title="โฆษณา & ยกเลิก" icon="ads">
              <div className="space-y-1 text-sm text-slate-700">
                {data.ads ? <div>ใช้ {baht(data.ads.spend)} ได้ยอด {baht(data.ads.sales)} · ROAS {data.ads.roas?.toFixed(1) ?? "—"} <span className="text-xs text-slate-500">(ก่อน {baht(data.ads.prevSpend)})</span></div> : <div className="text-slate-400">ยังไม่มีข้อมูลโฆษณา</div>}
                {data.ads?.losing.map((c) => <div key={c.name} className="text-xs text-rose-600">ขาดทุน: {c.name} · ใช้ {baht(c.spend)} · ROAS {c.roas?.toFixed(1) ?? "—"}</div>)}
                <div>ยกเลิก {data.cancels.count} ใบ <span className="text-xs text-slate-500">(ก่อน {data.cancels.prev})</span>{data.cancels.storeFault ? <span className="text-rose-600"> · เพราะฝั่งร้าน {data.cancels.storeFault}</span> : null}</div>
              </div>
            </Section>
            <Section title="โพสต์" icon="image">
              {data.posts.length ? (
                <div className="space-y-1 text-sm">
                  {data.posts.map((p) => <div key={p.platform}>{p.platform === "facebook" ? "Facebook" : p.platform === "instagram" ? "Instagram" : p.platform}: {p.posts} โพสต์ · เฉลี่ย {Math.round(p.avg)} interaction</div>)}
                  {data.topPosts.map((p, i) => <div key={i} className="truncate text-xs text-slate-500">★ {p.link ? <a href={p.link} target="_blank" rel="noopener noreferrer" className="underline">{p.text}</a> : p.text} ({p.engagement})</div>)}
                </div>
              ) : <p className="text-sm text-slate-400">ไม่มีโพสต์ในสัปดาห์นี้</p>}
            </Section>
          </div>

          {data.alerts.length > 0 && (
            <Section title="เรื่องที่ระบบเตือน" icon="warning">
              <ul className="space-y-1 text-sm">{data.alerts.map((a, i) => <li key={i} className={a.level === "danger" ? "text-rose-700" : a.level === "warning" ? "text-amber-700" : "text-slate-600"}>• <b>{a.title}</b> — {a.body}</li>)}</ul>
            </Section>
          )}
          {data.notes.length > 0 && <ul className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{data.notes.map((n) => <li key={n} className="flex gap-1.5"><Icon name="info" className="mt-0.5 shrink-0" /> {n}</li>)}</ul>}
          <p className="text-[11px] text-slate-400">ตัวเลขเก็บตอนสร้างใบ (กด "ให้ AI เขียนใหม่" = ดึงตัวเลขล่าสุด + เขียนใหม่ · ข้อความเดิมเก็บในประวัติ) · ค่า AI ดูที่ศูนย์บริการที่เสียเงิน</p>
        </>
      )}

      {/* สร้างใบใหม่ */}
      <NewModal open={newOpen} onClose={() => setNewOpen(false)} choices={weekChoices} existing={new Set(d.list.map((x) => x.week_start))} busy={busy === "gen"} brandName={brandName} onGo={generate} />

      {/* ประวัติเวอร์ชัน */}
      <ERPModal open={histOpen} onClose={() => setHistOpen(false)} title="ประวัติเวอร์ชันข้อความ" description="ทุกครั้งที่แก้หรือให้ AI เขียนใหม่ ข้อความก่อนหน้าเก็บไว้ที่นี่ — กดย้อนกลับได้" size="lg">
        {!r?.history?.length ? <EmptyState title="ยังไม่มีประวัติ" hint="แก้ข้อความหรือให้ AI เขียนใหม่ แล้วเวอร์ชันเดิมจะมาอยู่ที่นี่" /> : (
          <div className="space-y-2">
            {r.history.map((v, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{dtTh(v.at)} · {v.reason}</span>
                  {canEdit && <span className="ml-auto"><SmallBtn icon="refresh" disabled={!!busy} onClick={async () => { setBusy("restore"); try { await call("PATCH", { id: r.id, restore_version: i }); toast.undo("ย้อนกลับเวอร์ชันแล้ว", restoreV0(r.id), { ms: 8000 }); setHistOpen(false); await load(r.id); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); } finally { setBusy(null); } }}>ย้อนกลับไปเวอร์ชันนี้</SmallBtn></span>}
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap text-sm text-slate-700">{v.summary || "(ไม่มีบทสรุป)"}</p>
                {Array.isArray(v.actions) && v.actions.length > 0 && <div className="mt-1 text-xs text-slate-500">สิ่งที่ควรทำ {v.actions.length} ข้อ</div>}
              </div>
            ))}
          </div>
        )}
      </ERPModal>
    </div>
  );
}

function NewModal({ open, onClose, choices, existing, busy, brandName, onGo }: {
  open: boolean; onClose: () => void; choices: string[]; existing: Set<string>; busy: boolean; brandName: string; onGo: (weekStart: string, skipAi: boolean) => void;
}) {
  const [week, setWeek] = useState(choices[1] ?? choices[0] ?? "");
  const [skipAi, setSkipAi] = useState(false);
  useEffect(() => { if (open) setWeek(choices[1] ?? choices[0] ?? ""); }, [open, choices]);
  return (
    <ERPModal open={open} onClose={onClose} title="สร้างใบสรุปสัปดาห์" description={`แบรนด์: ${brandName} (เปลี่ยนที่ตัวกรองด้านบน)`} size="sm" loading={busy}
      footer={<div className="flex justify-end gap-2"><SmallBtn icon="cancel" onClick={onClose}>ยกเลิก</SmallBtn><SmallBtn icon={skipAi ? "add" : "ai"} tone="primary" disabled={busy || !week} onClick={() => onGo(week, skipAi)}>{busy ? "กำลังสร้าง…" : "สร้าง"}</SmallBtn></div>}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-slate-500">สัปดาห์ (จันทร์–อาทิตย์)</span>
          <select value={week} onChange={(e) => setWeek(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2">
            {choices.map((w, i) => <option key={w} value={w}>{weekLabel(w)}{i === 0 ? " (สัปดาห์นี้ · ยังไม่จบ)" : i === 1 ? " (สัปดาห์ที่แล้ว)" : ""}{existing.has(w) ? " · มีใบแล้ว (สร้างใหม่ทับ)" : ""}</option>)}
          </select>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={skipAi} onChange={(e) => setSkipAi(e.target.checked)} className="mt-0.5" />
          <span>ไม่ใช้ AI — เก็บแต่ตัวเลข (ไม่มีค่าใช้จ่าย · พิมพ์บทสรุปเองได้)</span>
        </label>
        {!skipAi && <p className="text-xs text-slate-500">AI จะเขียนบทสรุป สิ่งที่ควรทำ และสรุปรีวิว (≈ 1–3 บาท/ใบ) ใช้เวลาราว 20–60 วินาที</p>}
        {existing.has(week) && <p className="text-xs text-amber-700">สัปดาห์นี้มีใบแล้ว — สร้างใหม่ = ดึงตัวเลขล่าสุด ข้อความเดิมเก็บในประวัติ (ย้อนกลับได้)</p>}
      </div>
    </ERPModal>
  );
}
