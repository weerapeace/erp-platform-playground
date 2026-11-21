"use client";

// แผง "รูปกระดาน แยกตามกระดาน" — อยู่ในการ์ดพื้นที่ R2 (คลังไฟล์) ใต้แถวโฟลเดอร์ canvassketch
// ข้อมูล: /api/assets/storage/boards (ผลที่นับไว้ · นับใหม่ = assets.manage วิ่งเบื้องหลัง)
// ดูอย่างเดียว · แถว "ไม่มีกระดานไหนใช้แล้ว" → เปิดป๊อปล้างรูปเดิม (CanvasCleanupModal) ซึ่งถามยืนยันก่อนย้ายเข้าถังขยะ
// เจ้าของขอ 2026-11-21

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { formatBytes } from "@/lib/assets";
import { useT } from "@/components/i18n";
import { runBackgroundTask } from "@/lib/background-tasks";
import type { BoardUsage } from "@/app/api/assets/storage/boards/route";

const TYPE_LABEL: Record<string, [string, string]> = {
  creative_campaign: ["แคมเปญ", "Campaign"],
  creative_trend: ["เทรนด์", "Trend"],
  creative_task_brief: ["บรีฟงาน", "Task brief"],
  creative_task_ref: ["อ้างอิงงาน", "Task reference"],
  creative_board: ["กระดานงาน", "Task board"],
  work_board: ["บอร์ดจ่ายงาน", "Work board"],
  team_plan_board: ["แผนงานทีม", "Team plan"],
  design_sheet: ["ใบออกแบบ", "Design sheet"],
};

export function BoardUsagePanel({ canManage, onOpenCleanup, pushToast }: {
  canManage: boolean;
  /** เปิดป๊อปล้างรูปกระดานที่ไม่ได้ใช้ (ของเดิมในการ์ด) */
  onOpenCleanup?: () => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
}) {
  const t = useT();
  const [data, setData] = useState<BoardUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const j = await apiFetch("/api/assets/storage/boards").then((r) => r.json()); setData((j.data as BoardUsage) ?? null); }
    catch { /* เงียบ */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const recount = () => {
    runBackgroundTask({
      label: t("นับพื้นที่รูปรายกระดาน", "Counting board image storage"),
      run: async () => {
        const j = await apiFetch("/api/assets/storage/boards?refresh=1").then((r) => r.json());
        if (j.error) throw new Error(j.error);
        const u = j.data as BoardUsage; setData(u);
        return { ok: u.boards.length, message: t(`นับเสร็จ — ${u.boards.length} กระดาน`, `Done — ${u.boards.length} boards`) };
      },
    });
    pushToast("info", t("กำลังนับเบื้องหลัง — ดูความคืบหน้าที่มุมขวาล่าง", "Counting in the background"));
  };

  const types = useMemo(() => [...new Set((data?.boards ?? []).map((b) => b.entity_type))], [data]);
  const rows = useMemo(() => (data?.boards ?? []).filter((b) => type === "all" || b.entity_type === type), [data, type]);
  const shown = showAll ? rows : rows.slice(0, 12);
  const max = rows[0]?.bytes || 1;
  const typeLabel = (k: string) => { const m = TYPE_LABEL[k]; return m ? t(m[0], m[1]) : k; };
  const chip = (on: boolean) => `h-6 px-2 rounded-full border text-[11px] ${on ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`;

  if (loading) return <p className="text-[11px] text-slate-400 py-1">{t("กำลังโหลด…", "Loading…")}</p>;

  return (
    <div className="ml-2 sm:ml-6 my-1 rounded-lg border border-slate-100 bg-slate-50/60 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-slate-500">{t("รูปกระดาน แยกตามกระดาน", "Board images by board")}</span>
        {data && <span className="text-[10px] text-slate-300">{t("นับเมื่อ", "as of")} {new Date(data.computed_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>}
        {canManage && <button type="button" onClick={recount} className="ml-auto text-[11px] text-slate-500 hover:text-violet-700 border border-slate-200 bg-white rounded px-2 py-0.5">🔄 {t("นับใหม่", "Recount")}</button>}
      </div>
      {!data ? (
        <p className="text-[11px] text-slate-400">{canManage ? t("ยังไม่เคยนับ — กด \"นับใหม่\"", "Not counted yet — press Recount") : t("ยังไม่เคยนับ", "Not counted yet")}</p>
      ) : (
        <>
          <div className="flex gap-1 flex-wrap">
            <button type="button" onClick={() => setType("all")} className={chip(type === "all")}>{t("ทุกชนิด", "All")}</button>
            {types.map((k) => <button key={k} type="button" onClick={() => setType(k)} className={chip(type === k)}>{typeLabel(k)}</button>)}
          </div>
          {rows.length === 0 && <p className="text-[11px] text-slate-400">{t("ไม่มีกระดานที่เก็บรูปบน R2", "No boards store images on R2")}</p>}
          {shown.map((b) => (
            <div key={`${b.entity_type}:${b.entity_id}`} className="flex items-center gap-2">
              <span className="flex-1 sm:flex-none sm:w-56 min-w-0 truncate text-[11px]">
                {b.href ? <Link href={b.href} target="_blank" className="text-violet-700 hover:underline">{b.label}</Link> : <span className="text-slate-700">{b.label}</span>}
                <span className="ml-1 text-slate-400">{typeLabel(b.entity_type)}</span>
                {b.small && <span className="ml-1 rounded bg-emerald-50 px-1 text-[10px] text-emerald-700 border border-emerald-200" title={t("รูปที่วางใหม่ย่อเหลือ 600px ก่อนเก็บ", "New images are shrunk to 600px")}>{t("ประหยัด 600px", "Saver 600px")}</span>}
              </span>
              <div className="hidden sm:block flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{ width: `${Math.max(2, Math.round((b.bytes / max) * 100))}%` }} /></div>
              <span className="w-16 shrink-0 text-right text-[11px] font-medium text-slate-700">{formatBytes(b.bytes)}</span>
              <span className="hidden sm:inline w-14 shrink-0 text-right text-[10px] text-slate-400">{b.files} {t("รูป", "img")}</span>
            </div>
          ))}
          {rows.length > 12 && <button type="button" onClick={() => setShowAll((s) => !s)} className="text-[11px] text-violet-600 hover:underline">{showAll ? t("ย่อ", "Show less") : t(`ดูทั้งหมด ${rows.length} กระดาน`, `Show all ${rows.length}`)}</button>}
          {type === "all" && (
            <div className="flex items-center gap-2 border-t border-slate-100 pt-1.5">
              <span className="flex-1 text-[11px] text-slate-500">🗑 {t("ไฟล์ที่ไม่มีกระดานไหนใช้แล้ว", "Files no board uses")} <span className="text-slate-400">({data.unused_files.toLocaleString()} {t("ไฟล์", "files")})</span></span>
              <span className="w-16 shrink-0 text-right text-[11px] font-medium text-slate-700">{formatBytes(data.unused_bytes)}</span>
              {canManage && onOpenCleanup && data.unused_files > 0 && <button type="button" onClick={onOpenCleanup} className="shrink-0 text-[11px] text-rose-600 hover:underline">{t("ตรวจ/ล้าง…", "Review…")}</button>}
            </div>
          )}
          {data.truncated && <p className="text-[10px] text-amber-600">⚠ {t("ไฟล์เยอะมาก — ยังนับไม่ครบ", "Too many files — partial count")}</p>}
        </>
      )}
    </div>
  );
}
