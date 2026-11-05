"use client";

/**
 * 📝 ใบจดผลงาน (/master/work-logs) — ถ่ายรูปใบจดที่หัวหน้าเขียน → AI อ่าน → ตรวจ → ยืนยัน
 *   เจ้าของอนุมัติ 2026-11-05 (เฟส 2a) · ใบพิมพ์จากบอร์ดจ่ายงาน 🪜 → 📝 ใบจดผลงาน (lib/work-log-sheet.ts)
 *   ขั้นตอนต่อรูป: ย่อรูป → หา QR ในเครื่อง → อัปขึ้นที่เก็บส่วนตัว (กฎหมวด work_logs) → POST /api/work-logs (AI อ่าน) → ไปหน้าตรวจ
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePermission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { uploadFileByRule } from "@/lib/file-upload";
import { decodeWorkLogQr, prepareWorkLogPhoto } from "@/lib/work-log-image";
import { UploadProgress } from "@/components/upload-progress";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { useFileRefUrls } from "@/components/file-ref";

type SheetItem = {
  id: string; mo_no: string | null; page_no: number | null; page_total: number | null; status: string; ai_error: string | null;
  file_ref: string; uploaded_by_name: string | null; confirmed_by_name: string | null; confirmed_at: string | null; created_at: string; line_count: number;
};
type Job = { key: string; name: string; size: number; step: "prep" | "qr" | "upload" | "read" | "done" | "error"; pct: number | null; result?: { id: string; mo_no: string | null; page: number; rows: number; error: string | null }; error?: string; qr?: boolean };

const STATUS: Record<string, { label: string; cls: string }> = {
  reading: { label: "กำลังอ่าน", cls: "bg-blue-50 text-blue-700" },
  review: { label: "รอตรวจ", cls: "bg-amber-50 text-amber-700" },
  failed: { label: "ต้องเลือกใบงาน / อ่านไม่สำเร็จ", cls: "bg-rose-50 text-rose-700" },
  confirmed: { label: "ยืนยันแล้ว", cls: "bg-emerald-50 text-emerald-700" },
  discarded: { label: "ทิ้งแล้ว", cls: "bg-slate-100 text-slate-500" },
};
const STEP_LABEL: Record<Job["step"], string> = { prep: "กำลังย่อรูป", qr: "กำลังหา QR", upload: "กำลังอัปโหลด", read: "AI กำลังอ่านลายมือ (ประมาณ 20–40 วินาที)", done: "เสร็จ", error: "ไม่สำเร็จ" };
const fmtTime = (s: string) => new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export default function WorkLogsPage() {
  const canEdit = usePermission("products.edit");
  const [tab, setTab] = useState<"open" | "confirmed" | "all">("open");
  const [items, setItems] = useState<SheetItem[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const busy = jobs.some((j) => j.step !== "done" && j.step !== "error");
  const inputRef = useRef<HTMLInputElement>(null);
  const thumbs = useFileRefUrls((items ?? []).map((i) => i.file_ref));

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const j = await apiFetch(`/api/work-logs?status=${tab}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setItems(j.data as SheetItem[]);
    } catch (e) { setLoadErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); setItems([]); }
  }, [tab]);
  useEffect(() => { setItems(null); void load(); }, [load]);

  const patch = (key: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...p } : j)));

  const run = async (files: File[]) => {
    const fresh: Job[] = files.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, size: f.size, step: "prep", pct: null }));
    setJobs((js) => [...fresh, ...js]);
    // ทีละรูป — AI อ่านทีละใบ ไม่ยิงพร้อมกันจนโดนจำกัด
    for (let i = 0; i < files.length; i++) {
      const job = fresh[i];
      try {
        const photo = await prepareWorkLogPhoto(files[i]);
        patch(job.key, { step: "qr", size: photo.size });
        const qr = await decodeWorkLogQr(photo).catch(() => null);
        patch(job.key, { step: "upload", qr: !!qr, pct: 0 });
        const ref = await uploadFileByRule({ category: "work_logs", file: photo, r2Folder: "work-logs", onProgress: (pct) => patch(job.key, { pct }) });
        patch(job.key, { step: "read", pct: null });
        const res = await apiFetch("/api/work-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_ref: ref, qr_text: qr }) });
        const j = await res.json();
        if (!res.ok || !j.id) throw new Error(j.error || "ส่งรูปไม่สำเร็จ");
        patch(job.key, { step: "done", result: j });
      } catch (e) {
        patch(job.key, { step: "error", error: e instanceof Error ? e.message : "ไม่สำเร็จ" });
      }
    }
    void load();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">📝 ใบจดผลงาน</h1>
        <p className="mt-1 text-sm text-slate-500">ถ่ายรูปใบจดที่หัวหน้าเขียน แล้ว AI จะอ่านลายมือให้ · ตรวจและแก้ก่อนกดยืนยันทุกครั้ง · พิมพ์ใบจดได้ที่บอร์ดจ่ายงาน → 🪜 พิมพ์ขั้นตอนงาน → 📝 ใบจดผลงาน</p>
      </div>

      {canEdit && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void run(fs); }} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 px-4 py-6 text-center hover:bg-blue-50 disabled:opacity-60">
            <div className="text-base font-semibold text-blue-700">📷 ถ่ายรูป / เลือกรูปใบจด</div>
            <div className="mt-1 text-xs text-slate-500">ส่งได้หลายรูปพร้อมกัน · ถ่ายให้เห็นจุดดำครบ 4 มุม · แสงพอ ไม่มีเงาบัง QR</div>
          </button>
          {jobs.length > 0 && (
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li key={j.key} className="rounded-lg border border-slate-100 px-3 py-2">
                  {j.step === "done" && j.result ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-emerald-600">✓</span>
                      <span className="font-medium text-slate-700">{j.result.mo_no ?? "ยังไม่รู้ใบงาน"}{j.result.mo_no ? ` · หน้า ${j.result.page}` : ""}</span>
                      <span className="text-slate-500">{j.result.error ? j.result.error : `อ่านได้ ${j.result.rows} บรรทัด`}</span>
                      <Link href={`/master/work-logs/${j.result.id}`} className="ml-auto h-8 rounded-lg bg-blue-600 px-3 text-sm leading-8 text-white hover:bg-blue-700">ตรวจ →</Link>
                    </div>
                  ) : j.step === "error" ? (
                    <div className="text-sm text-rose-600">✕ {j.name}: {j.error}</div>
                  ) : (
                    <UploadProgress name={j.name} size={j.size} pct={j.step === "upload" ? j.pct : null}
                      label={`${STEP_LABEL[j.step]}${j.step !== "prep" && j.step !== "qr" ? (j.qr ? " · เจอ QR" : " · ไม่เจอ QR") : ""}`} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 w-fit">
        {([["open", "รอตรวจ"], ["confirmed", "ยืนยันแล้ว"], ["all", "ทั้งหมด"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-8 rounded-md px-3 text-sm ${tab === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>

      {items === null ? <LoadingState label="กำลังโหลดใบจด…" />
        : loadErr ? <ErrorState title="โหลดรายการใบจดไม่สำเร็จ" hint={loadErr} onRetry={() => void load()} />
        : items.length === 0 ? <EmptyState title={tab === "open" ? "ไม่มีใบจดรอตรวจ" : "ยังไม่มีใบจด"} hint="ถ่ายรูปใบจดผลงานแล้วส่งด้านบน" />
        : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {items.map((it) => {
              const st = STATUS[it.status] ?? STATUS.review;
              const url = thumbs[it.file_ref];
              return (
                <li key={it.id}>
                  <Link href={`/master/work-logs/${it.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                    <div className="h-14 w-11 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-50">
                      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">{it.mo_no ?? "ยังไม่ผูกใบงาน"}{it.page_no ? <span className="text-slate-500"> · หน้า {it.page_no}/{it.page_total ?? 1}</span> : null}</div>
                      <div className="truncate text-xs text-slate-500">ส่ง {fmtTime(it.created_at)}{it.uploaded_by_name ? ` · ${it.uploaded_by_name}` : ""} · {it.line_count} บรรทัด{it.confirmed_at ? ` · ยืนยัน ${fmtTime(it.confirmed_at)}` : ""}</div>
                      {it.ai_error && it.status !== "confirmed" && <div className="truncate text-xs text-rose-600">{it.ai_error}</div>}
                    </div>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
