"use client";

// ============================================================
// คิวรอตรวจ/อนุมัติ (ของกลางในโมดูล) — ตารางงานย่อยที่ส่งมา + popup ดูรูป/อนุมัติ/ตีกลับ
// ใช้ทั้งในหน้า /tasks/review และฝังในหน้าภาพรวม (กดการ์ด "รอตรวจ/อนุมัติ")
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ImageLightbox } from "@/components/image-lightbox";
import { r2ImageUrl } from "@/lib/r2-image";
import { AssigneeStack } from "./assignee-avatar";
import { listReviewQueue, updateSubtask, type ReviewQueueItem } from "./data";
import { useT } from "@/components/i18n";

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

export function ReviewQueueView({ onChanged }: { onChanged?: () => void }) {
  const t = useT();
  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);
  const [active, setActive] = useState<ReviewQueueItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [lb, setLb] = useState(-1);
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random(); setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3500);
  }, []);

  const load = useCallback(async () => { try { setItems(await listReviewQueue()); } catch (e) { pushToast("error", (e as Error).message); setItems([]); } }, [pushToast]);
  useEffect(() => { load(); }, [load]);

  const act = async (status: string, comment?: string) => {
    if (!active) return; setBusy(true);
    try {
      await updateSubtask(active.task_id, active.id, comment !== undefined ? { status, comment } : { status });
      pushToast("success", status === "approved" ? t("อนุมัติแล้ว", "Approved") : t("ส่งกลับให้แก้แล้ว", "Sent back for revision"));
      setActive(null); setLb(-1); await load(); onChanged?.();
    } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const revise = () => { const r = window.prompt(t("เหตุผลที่ขอแก้ (ส่งให้ผู้ทำ)", "Reason for revision")); if (r === null) return; act("revision_requested", r); };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase(); const list = items ?? [];
    if (!q) return list;
    return list.filter((r) => [r.task_no, r.task_title, r.title, r.brand_label].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [items, search]);

  const lbImages = (active?.images ?? []).map((im) => ({ url: r2ImageUrl(im.r2_key, 1600) ?? "", label: im.file_name }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("ค้นหา เลขงาน/ชื่องาน/งานย่อย/แบรนด์…", "Search task/subtask/brand…")} className="h-9 px-3 text-sm border border-slate-200 rounded-lg w-72 max-w-full" />
        <span className="text-sm text-slate-400">{rows.length} {t("รายการ", "items")}</span>
      </div>
      {items === null ? <div className="py-16 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
        : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-slate-600 font-medium">{t("ไม่มีงานรอตรวจ", "Nothing awaiting review")}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left font-medium px-3 py-2">{t("งาน", "Task")}</th>
                  <th className="text-left font-medium px-3 py-2">{t("งานย่อย", "Subtask")}</th>
                  <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">{t("แบรนด์", "Brand")}</th>
                  <th className="text-left font-medium px-3 py-2 hidden md:table-cell">{t("ผู้รับผิดชอบ", "Assignee")}</th>
                  <th className="text-left font-medium px-3 py-2">{t("รูป", "Images")}</th>
                  <th className="text-right font-medium px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-2 align-top"><div className="font-mono text-[11px] text-slate-400">{r.task_no}</div><div className="text-slate-700 line-clamp-1">{r.task_title}</div></td>
                    <td className="px-3 py-2 align-top text-slate-700">{r.title}</td>
                    <td className="px-3 py-2 align-top hidden sm:table-cell">{r.brand_label ? <span className="inline-flex items-center gap-1 text-xs text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: r.brand_color || "#cbd5e1" }} />{r.brand_label}</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 align-top hidden md:table-cell">{r.assignees.length ? <AssigneeStack list={r.assignees} size={22} /> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 align-top">
                      {r.images.length ? (
                        <button onClick={() => setActive(r)} className="inline-flex items-center gap-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r2ImageUrl(r.images[0].r2_key, 80) ?? ""} alt="" className="h-9 w-9 rounded object-cover border border-slate-200" />
                          {r.images.length > 1 && <span className="text-[11px] text-slate-400">+{r.images.length - 1}</span>}
                        </button>
                      ) : <span className="text-xs text-slate-300">{t("ไม่มีรูป", "none")}</span>}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <button onClick={() => setActive(r)} className="h-8 px-3 text-xs font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600">🔎 {t("ดูงาน", "View")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {active && (
        <ERPModal open onClose={() => { setActive(null); setLb(-1); }} size="lg"
          title={`${t("ตรวจงาน", "Review")}: ${active.title}`}
          footer={<>
            <button onClick={() => { setActive(null); setLb(-1); }} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
            <button onClick={revise} disabled={busy} className="h-9 px-4 text-sm font-medium text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-50 disabled:opacity-50">↩︎ {t("ตีกลับแก้", "Return")}</button>
            <button onClick={() => act("approved")} disabled={busy} className="h-9 px-5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">✓ {t("อนุมัติ", "Approve")}</button>
          </>}>
          <div className="space-y-3">
            <div className="text-sm text-slate-500"><span className="font-mono text-xs">{active.task_no}</span> · {active.task_title}{active.brand_label ? ` · ${active.brand_label}` : ""}</div>
            {active.images.length ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {active.images.map((im, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={im.r2_key} src={r2ImageUrl(im.r2_key, 400) ?? ""} alt={im.file_name ?? ""} onClick={() => setLb(i)} title={t("กดดูเต็มจอ", "Click to view full")} className="w-full h-28 object-cover rounded-lg border border-slate-200 cursor-zoom-in" />
                ))}
              </div>
            ) : <p className="text-sm text-slate-400 italic">{t("งานย่อยนี้ไม่ได้แนบรูป", "No images attached")}</p>}
          </div>
        </ERPModal>
      )}
      <ImageLightbox images={lbImages} index={lb} onClose={() => setLb(-1)} onIndex={setLb} />

      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
        {toasts.map((x) => <div key={x.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${x.type === "success" ? "bg-emerald-600" : x.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{x.message}</div>)}
      </div>
    </div>
  );
}
