"use client";

// ป๊อป "🧹 ล้างรูปกระดานที่ไม่ได้ใช้" — วิเคราะห์ก่อน (ตัวเลข+ตัวอย่าง) → ยืนยัน → ย้ายเข้าถังขยะ (กู้คืนได้ 30 วัน)
// ใช้ของกลาง: ERPModal, ConfirmDialog, /api/assets/canvas-orphans (GET วิเคราะห์ · POST ล้าง), audit ฝั่ง API

import { useCallback, useEffect, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { formatBytes } from "@/lib/assets";
import { r2ImageUrl } from "@/lib/r2-image";
import { useT } from "@/components/i18n";
import type { CanvasOrphanReport } from "@/app/api/assets/canvas-orphans/route";

export function CanvasCleanupModal({ onClose, pushToast }: { onClose: () => void; pushToast: (type: "success" | "error" | "info", m: string) => void }) {
  const t = useT();
  const [minAge, setMinAge] = useState(7);
  const [report, setReport] = useState<CanvasOrphanReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<{ moved: number; moved_bytes: number; library_rows_trashed: number; failed: string[]; remaining: number } | null>(null);

  const load = useCallback(async (age: number) => {
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/assets/canvas-orphans?min_age_days=${age}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setReport(j.data as CanvasOrphanReport);
    } catch (e) { setErr((e as Error).message); setReport(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(minAge); }, [load, minAge]);

  const run = async () => {
    setConfirm(false); setRunning(true);
    try {
      const j = await apiFetch("/api/assets/canvas-orphans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ min_age_days: minAge }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const d = j.data as NonNullable<typeof last>;
      setLast(d);
      pushToast("success", t(`ย้ายเข้าถังขยะแล้ว ${d.moved} ไฟล์ (${formatBytes(d.moved_bytes)})${d.remaining ? ` · เหลืออีก ${d.remaining} กดซ้ำได้` : ""}`, `Moved ${d.moved} files (${formatBytes(d.moved_bytes)}) to trash${d.remaining ? ` · ${d.remaining} left, run again` : ""}`));
      await load(minAge);
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setRunning(false); }
  };

  const Stat = ({ label, n, bytes, tone = "slate" }: { label: string; n: number; bytes: number; tone?: "slate" | "emerald" | "amber" | "rose" }) => {
    const cls = tone === "emerald" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-800" : tone === "rose" ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-slate-50 border-slate-200 text-slate-700";
    return (
      <div className={`rounded-lg border px-3 py-2 ${cls}`}>
        <div className="text-[11px] opacity-80">{label}</div>
        <div className="text-lg font-semibold leading-tight tabular-nums">{n.toLocaleString()} <span className="text-xs font-normal opacity-70">{t("ไฟล์", "files")}</span></div>
        <div className="text-[11px] opacity-80">{formatBytes(bytes)}</div>
      </div>
    );
  };

  return (
    <>
      <ERPModal open onClose={onClose} size="lg" title={`🧹 ${t("ล้างรูปกระดานที่ไม่ได้ใช้", "Clean up unused board images")}`}
        description={t("รูปที่เคยวางบนกระดานแล้วถูกลบออก ไฟล์จริงยังค้างอยู่ใน R2 — ตรวจทุกกระดาน ใบนำเสนอ และที่อื่นในระบบก่อน ย้ายเฉพาะที่ไม่มีใครใช้เข้าถังขยะ (กู้คืนได้ 30 วัน)", "Images removed from boards still sit in R2 — checks every board, presentation and other references, then moves unused ones to trash (recoverable for 30 days)")}
        footer={
          <div className="flex items-center gap-2 w-full">
            <label className="text-xs text-slate-500 flex items-center gap-1.5">{t("เฉพาะที่เก่ากว่า", "Only older than")}
              <select value={minAge} onChange={(e) => setMinAge(Number(e.target.value))} className="h-8 border border-slate-200 rounded-md px-1.5 text-xs bg-white">
                {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} {t("วัน", "days")}</option>)}
              </select>
            </label>
            <button onClick={() => void load(minAge)} disabled={loading} className="h-8 px-2.5 text-xs border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50">🔄 {t("ตรวจใหม่", "Re-check")}</button>
            <span className="flex-1" />
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
            <button onClick={() => setConfirm(true)} disabled={loading || running || !report || report.eligible === 0}
              className="h-9 px-4 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50">
              {running ? t("กำลังย้าย...", "Moving...") : `🧹 ${t("ย้ายเข้าถังขยะ", "Move to trash")}${report?.eligible ? ` (${Math.min(report.eligible, 400).toLocaleString()})` : ""}`}
            </button>
          </div>}>
        {loading && <p className="py-10 text-center text-sm text-slate-400">{t("กำลังไล่ตรวจไฟล์ในโฟลเดอร์กระดานกับทุกกระดาน… (อาจใช้เวลาสักครู่)", "Scanning board images against every board… (may take a moment)")}</p>}
        {!loading && err && <p className="py-6 text-center text-sm text-rose-600">⚠️ {err}</p>}
        {!loading && report && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label={t("ไฟล์รูปกระดานทั้งหมด", "All board images")} n={report.total} bytes={report.total_bytes} />
              <Stat label={t("ยังใช้อยู่ (เก็บไว้)", "Still in use (kept)")} n={report.referenced} bytes={report.referenced_bytes} tone="emerald" />
              <Stat label={t(`ไม่มีใครใช้แต่ยังใหม่ (<${report.min_age_days} วัน)`, `Unused but recent (<${report.min_age_days}d)`)} n={report.too_new} bytes={report.orphan_bytes - report.eligible_bytes} tone="amber" />
              <Stat label={t("ล้างได้ตอนนี้", "Can clean now")} n={report.eligible} bytes={report.eligible_bytes} tone="rose" />
            </div>
            {report.in_library > 0 && (
              <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5">
                ℹ️ {t(`ใน ${report.eligible.toLocaleString()} ไฟล์ที่ล้างได้ มี ${report.in_library.toLocaleString()} ไฟล์ที่ถูกลงคลังกลางอัตโนมัติตอนวางรูป (ไม่มีที่ไหนใช้) — จะย้ายเข้าถังของคลังพร้อมกัน กู้คืนได้จากถังขยะคลังภายใน 30 วัน`, `${report.in_library} of these were auto-registered in the asset library (unused) — they go to the library trash too`)}
              </p>
            )}
            {report.truncated && <p className="text-[11px] text-amber-600">⚠ {t("ไฟล์เยอะมาก ตรวจยังไม่ครบทั้งโฟลเดอร์ — ล้างรอบนี้แล้วกดตรวจใหม่", "Too many files to scan fully — clean this batch, then re-check")}</p>}
            {last && (
              <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                ✓ {t(`รอบล่าสุด: ย้าย ${last.moved} ไฟล์ (${formatBytes(last.moved_bytes)}) · แถวคลัง ${last.library_rows_trashed}`, `Last run: moved ${last.moved} files (${formatBytes(last.moved_bytes)}) · library rows ${last.library_rows_trashed}`)}
                {last.failed.length > 0 && <span className="text-rose-700"> · {t("พลาด", "failed")} {last.failed.length}</span>}
                {last.remaining > 0 && <span> · {t(`เหลืออีก ${last.remaining} กดย้ายซ้ำได้`, `${last.remaining} remaining — run again`)}</span>}
              </div>
            )}
            {report.sample.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1.5">{t("ตัวอย่างที่จะล้าง (เก่าสุดก่อน)", "Preview of files to clean (oldest first)")} <span className="font-normal text-slate-400">· {t("แสดง", "showing")} {report.sample.length}/{report.eligible}</span></div>
                <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5 max-h-[34vh] overflow-y-auto pr-0.5">
                  {report.sample.map((o) => (
                    <div key={o.key} className="relative aspect-square rounded-md overflow-hidden border border-slate-200 bg-slate-50" title={`${o.key}\n${formatBytes(o.size)}${o.age_days != null ? ` · ${o.age_days} ${t("วัน", "days")}` : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r2ImageUrl(o.key, 160) ?? ""} alt="" className="w-full h-full object-cover" loading="lazy" />
                      <span className="absolute bottom-0 inset-x-0 text-[9px] text-white bg-black/50 px-1 truncate">{o.age_days != null ? `${o.age_days}${t("ว.", "d")}` : "—"} · {formatBytes(o.size)}</span>
                      {o.in_library && <span className="absolute top-0.5 left-0.5 text-[8px] bg-violet-600 text-white px-1 rounded" title={t("อยู่ในคลังกลาง", "In library")}>📚</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {report.eligible === 0 && <p className="text-sm text-emerald-700 text-center py-4">🎉 {t("ไม่มีไฟล์ค้างให้ล้าง", "Nothing to clean")}</p>}
          </div>
        )}
      </ERPModal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void run()} variant="danger"
        title={t("ย้ายรูปกระดานที่ไม่ได้ใช้เข้าถังขยะ", "Move unused board images to trash")}
        message={<span>{t(`จะย้าย ${Math.min(report?.eligible ?? 0, 400).toLocaleString()} ไฟล์ (${formatBytes(report?.eligible_bytes ?? 0)}) เข้าถังขยะ trash/ · ไฟล์ที่ยังอยู่บนกระดานหรือมีที่ใช้จะไม่ถูกแตะ · กู้คืนได้ภายใน 30 วัน · บันทึกประวัติผู้กดไว้`, `Moves ${Math.min(report?.eligible ?? 0, 400)} files (${formatBytes(report?.eligible_bytes ?? 0)}) to trash/. Files still on boards or in use are untouched. Recoverable for 30 days. Logged.`)}</span>}
        confirmText={running ? "..." : t("ย้ายเข้าถังขยะ", "Move to trash")} />
    </>
  );
}
