"use client";
/**
 * 🛠 แท็บ "โหมดทำงาน" ของป๊อปเลือกรุ่น (ส่วนเสริมของ components/marketing-sku-picker-modal · เปิดด้วย prop workTab)
 *   เลือกงานที่มีอยู่ในโหมดทำงาน (หน้า SKU การตลาด › 🛠 โหมดทำงาน) → โชว์เฉพาะรุ่นในงานนั้น → ติ๊กทีละรุ่น / ติ๊กทั้งงาน
 *   ข้อมูลงาน = API กลางของโหมดทำงาน (/api/marketing/work-jobs · lib/marketing/work-jobs) — อ่านอย่างเดียว ไม่สร้างรายการงานเอง
 *   ค่าเริ่ม = เฉพาะงานที่ยังทำอยู่ · สวิตช์ "แสดงงานที่เสร็จ/เก็บแล้ว" = ดูทุกงาน
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import type { WorkJob } from "@/lib/marketing/work-jobs";

const chip = (on: boolean) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`;

async function getJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (res.status === 403) throw new Error(tr("คุณไม่มีสิทธิ์ดูโหมดทำงาน (SKU การตลาด)", "You don't have access to Work mode (Marketing SKUs)"));
  if (!res.ok || j.error || !j.data) throw new Error(j.error || tr("โหลดงานไม่สำเร็จ ลองใหม่", "Couldn't load jobs — try again"));
  return j.data;
}

/** สถานะแท็บโหมดทำงาน — active = แท็บเปิดอยู่ (โหลดเมื่อเปิดครั้งแรกเท่านั้น) */
export function useWorkJobPick(active: boolean) {
  const [showDone, setShowDone] = useState(false);
  const [all, setAll] = useState<WorkJob[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [idsByJob, setIdsByJob] = useState<Map<string, string[]>>(new Map());
  const [idsErr, setIdsErr] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // รายการงาน (all=1 = รวมงานที่เก็บแล้ว)
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setErr(null);
    getJson<{ jobs: WorkJob[] }>(`/api/marketing/work-jobs${showDone ? "?all=1" : ""}`)
      .then((d) => { if (alive) setAll(d.jobs); })
      .catch((e) => { if (alive) setErr((e as Error).message); });
    return () => { alive = false; };
  }, [active, showDone, reload]);

  const jobs = useMemo(() => (all ?? []).filter((j) => showDone || j.status === "open"), [all, showDone]);
  // ยังไม่เลือก / งานที่เลือกหายไป → เลือกงานแรก
  useEffect(() => {
    if (!jobs.length) return;
    if (!jobId || !jobs.some((j) => j.id === jobId)) setJobId(jobs[0].id);
  }, [jobs, jobId]);

  // รุ่นในงาน (จำไว้ ไม่โหลดซ้ำ)
  useEffect(() => {
    if (!active || !jobId || idsByJob.has(jobId)) return;
    let alive = true;
    setIdsErr(null);
    getJson<{ items: { parent_sku_id: string }[] }>(`/api/marketing/work-jobs/${jobId}`)
      .then((d) => { if (alive) setIdsByJob((m) => new Map(m).set(jobId, d.items.map((i) => i.parent_sku_id))); })
      .catch((e) => { if (alive) setIdsErr((e as Error).message); });
    return () => { alive = false; };
  }, [active, jobId, idsByJob, reload]);

  const ids = useMemo(() => (jobId && idsByJob.has(jobId) ? new Set(idsByJob.get(jobId)) : null), [jobId, idsByJob]);
  const job = jobs.find((j) => j.id === jobId) ?? null;
  return { loaded: all !== null, jobs, job, jobId, setJobId, ids, err: err ?? idsErr, showDone, setShowDone, retry: () => setReload((n) => n + 1) };
}
export type WorkJobPick = ReturnType<typeof useWorkJobPick>;

/** แถบเลือกงาน + สรุป + ปุ่มติ๊กทั้งงาน (วางแทนแถวตัวกรองของแท็บอื่น) */
export function WorkJobBar({ pick, shown, missing, selectable, allOn, onTickAll, single }: {
  pick: WorkJobPick;
  /** รุ่นในงานที่อยู่ในรายการสินค้า (หลังค้น/ซ่อนที่เพิ่มแล้ว) */
  shown: number;
  /** รุ่นในงานที่ไม่อยู่ในรายการสินค้า (เช่น ปิดใช้แล้ว) */
  missing: number;
  /** ติ๊กได้ (ยังไม่อยู่ในปลายทาง) */
  selectable: number;
  allOn: boolean;
  onTickAll: () => void;
  single?: boolean;
}) {
  const t = useT();
  const { job } = pick;
  if (pick.err) {
    return (
      <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {pick.err}{" "}
        <button type="button" onClick={pick.retry} className="underline">{t("ลองใหม่", "Try again")}</button>
      </div>
    );
  }
  if (!pick.loaded) return <div className="h-8 w-2/3 animate-pulse rounded-full bg-slate-100" />;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        {t("งาน:", "Job:")}
        {pick.jobs.map((j) => (
          <button key={j.id} type="button" className={`${chip(pick.jobId === j.id)} ${j.status !== "open" ? "opacity-70" : ""}`} onClick={() => pick.setJobId(j.id)}>
            {j.name} <b className="font-medium">{j.item_count ?? 0}</b>
            {(j.issue_count ?? 0) > 0 && <span className="text-amber-600">⚠ {j.issue_count}</span>}
            {j.status === "done" && <span className="text-[10px] text-emerald-700">{t("เสร็จแล้ว", "Done")}</span>}
            {j.status === "archived" && <span className="text-[10px] text-slate-400">{t("เก็บแล้ว", "Archived")}</span>}
          </button>
        ))}
        <label className="ml-1 flex cursor-pointer items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={pick.showDone} onChange={(e) => pick.setShowDone(e.target.checked)} className="h-3.5 w-3.5 accent-blue-600" />
          {t("แสดงงานที่เสร็จ/เก็บแล้ว", "Show done/archived jobs")}
        </label>
      </div>
      {!pick.jobs.length ? (
        <p className="py-6 text-center text-sm text-slate-400">
          {t("ยังไม่มีงานที่ทำอยู่ — สร้างงานได้ที่หน้า ", "No active jobs yet — create one on ")}
          <a href="/marketing/skus" target="_blank" rel="noopener" className="text-blue-600 hover:underline">{t("SKU การตลาด › โหมดทำงาน ↗", "Marketing SKUs › Work mode ↗")}</a>
        </p>
      ) : job && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-800">{job.name}</span>
            {" · "}{t(`ทำเสร็จ ${job.item_done ?? 0}/${job.item_count ?? 0} รุ่น`, `${job.item_done ?? 0}/${job.item_count ?? 0} models done`)}
            {job.due_date ? ` · ${t("ครบกำหนด", "Due")} ${job.due_date}` : ""}
            {pick.ids && missing > 0 ? ` · ${t(`อีก ${missing} รุ่นไม่อยู่ในรายการสินค้า`, `${missing} more not in the product list`)}` : ""}
          </p>
          {!single && pick.ids && selectable > 0 && (
            <button type="button" onClick={onTickAll} className="h-8 rounded-lg border border-blue-300 bg-blue-50 px-3 text-xs font-medium text-blue-700 hover:bg-blue-100">
              {allOn ? t("เอาติ๊กทั้งงานออก", "Untick whole job") : t(`ติ๊กทั้งงาน (${selectable})`, `Tick whole job (${selectable})`)}
            </button>
          )}
          {pick.ids && shown === 0 && <span className="text-xs text-slate-400">{t("ไม่มีรุ่นที่เลือกได้ในงานนี้", "No pickable models in this job")}</span>}
        </div>
      )}
    </div>
  );
}
