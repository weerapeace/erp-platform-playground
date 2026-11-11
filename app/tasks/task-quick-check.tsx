"use client";

// ============================================================
// TaskQuickCheck — ปุ่ม "ตรวจเร็ว" ของลิ้นชักงาน: เปิดแผงตรวจสินค้าเร็วกลาง (ProductQuickCheck) ของสินค้าที่ผูกงาน
//   ท้ายแผง: อนุมัติ (ถามยืนยันในบรรทัดเดิม) · ตีกลับแก้ (ติ๊กจุดที่ระบบเช็กเจอ + พิมพ์เพิ่ม → เป็นเหตุผล)
//   ปุ่มโชว์ตามที่ลิ้นชักงานส่งมา (สิทธิ์ tasks.approve + เส้นทางสถานะจริง) · เปลี่ยนสถานะผ่านของกลาง applyTaskTransition
//   (เช็กงานย่อยค้าง + บันทึกประวัติฝั่ง server เหมือนปุ่มในลิ้นชัก)
// ข้อมูล: GET /api/creative-tasks/[id]/quick-check
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { ProductQuickCheck, type QuickCheckItem } from "@/components/product-quick-check";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { type PushToast } from "@/components/toast";
import type { QuickCheckParent } from "@/lib/product-listing-checks";
import { getTaskQuickCheck, type CreativeTask } from "./data";
import { applyTaskTransition } from "./task-actions";

export function TaskQuickCheck({ task, approveTo, reviseTo, pushToast, onClose, onDone, onViewImages, onOpenParent }: {
  task: CreativeTask;
  approveTo: string | null;   // สถานะปลายทางของ "อนุมัติ" (null = ไม่มีสิทธิ์/สถานะนี้อนุมัติไม่ได้)
  reviseTo: string | null;    // สถานะปลายทางของ "ตีกลับแก้"
  pushToast: PushToast;
  onClose: () => void;
  onDone: () => void | Promise<void>;   // หลังเปลี่ยนสถานะสำเร็จ (ลิ้นชักโหลดใหม่)
  onViewImages: () => void;
  onOpenParent: (id: string) => void;
}) {
  const t = useT();
  const [data, setData] = useState<QuickCheckParent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"" | "confirm" | "revise">("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await getTaskQuickCheck(task.id)); }
    catch (e) { setError((e as Error).message); }
  }, [task.id]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const run = async (toKey: string, comment?: string) => {
    setBusy(true);
    try {
      if (await applyTaskTransition(task, toKey, { pushToast, comment })) { await onDone(); onClose(); }
    } finally { setBusy(false); }
  };

  const itemKey = (c: QuickCheckItem) => `${c.parentCode}|${c.key}`;
  const footer = (checks: QuickCheckItem[]) => {
    const multi = new Set(checks.map((c) => c.parentCode)).size > 1;
    if (!approveTo && !reviseTo) {
      return <p className="text-xs text-slate-400 text-center">{t("ดูอย่างเดียว — ไม่มีสิทธิ์อนุมัติ หรือสถานะนี้ยังอนุมัติไม่ได้", "Read-only — no approval permission, or this status can't be approved")}</p>;
    }
    if (mode === "confirm" && approveTo) {
      return (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {checks.length > 0 && <span className="text-amber-700">{t(`ยังมี ${checks.length} จุดที่ระบบเช็กเจอ ·`, `${checks.length} things still flagged ·`)}</span>}
          <span>{t("อนุมัติงานนี้?", "Approve this task?")}</span>
          <button type="button" disabled={busy} onClick={() => void run(approveTo)} className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("ยืนยันอนุมัติ", "Confirm approve")}</button>
          <button type="button" disabled={busy} onClick={() => setMode("")} className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">{t("ไม่ใช่", "No")}</button>
        </div>
      );
    }
    if (mode === "revise" && reviseTo) {
      const send = () => {
        const lines = checks.filter((c) => picked.has(itemKey(c))).map((c) => `- ${multi ? `${c.parentCode}: ` : ""}${c.text}`);
        const extra = note.trim();
        if (!lines.length && !extra) { setErr(t("ติ๊กอย่างน้อย 1 จุด หรือพิมพ์สิ่งที่ต้องแก้", "Tick at least one item or type what to fix")); return; }
        void run(reviseTo, [...lines, extra].filter(Boolean).join("\n"));
      };
      return (
        <div className="space-y-2">
          {checks.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-1">{t("ติ๊กจุดที่ต้องแก้ (ระบบเติมจากที่เช็กเจอให้)", "Tick what needs fixing (pre-filled from the checks)")}</p>
              <div className="max-h-36 overflow-y-auto space-y-0.5">
                {checks.map((c) => (
                  <label key={itemKey(c)} className="flex items-start gap-2 text-xs text-slate-700">
                    <input type="checkbox" className="mt-0.5" checked={picked.has(itemKey(c))}
                      onChange={(e) => { setErr(""); setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(itemKey(c)); else n.delete(itemKey(c)); return n; }); }} />
                    <span>{multi ? `${c.parentCode}: ` : ""}{c.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <textarea value={note} onChange={(e) => { setNote(e.target.value); setErr(""); }} rows={2}
            placeholder={t("เพิ่มเติม เช่น ขอรูปพื้นหลังขาว 3 รูป", "More detail, e.g. need 3 photos on white background")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-violet-400" />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={send} className="h-9 px-4 rounded-lg border border-orange-200 text-orange-700 text-sm font-medium hover:bg-orange-50 disabled:opacity-50 inline-flex items-center gap-1.5"><Icon name="back" />{busy ? t("กำลังบันทึก…", "Saving…") : t("ส่งกลับให้แก้", "Send back")}</button>
            <button type="button" disabled={busy} onClick={() => setMode("")} className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        {approveTo && <button type="button" onClick={() => setMode("confirm")} className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 inline-flex items-center gap-1.5"><Icon name="done" />{t("อนุมัติ", "Approve")}</button>}
        {reviseTo && <button type="button" onClick={() => { setPicked(new Set(checks.map(itemKey))); setNote(""); setErr(""); setMode("revise"); }} className="h-9 px-4 rounded-lg border border-orange-200 text-orange-700 text-sm font-medium hover:bg-orange-50 inline-flex items-center gap-1.5"><Icon name="back" />{t("ตีกลับแก้", "Send back")}</button>}
      </div>
    );
  };

  return (
    <ProductQuickCheck onClose={onClose}
      title={`${t("ตรวจเร็ว", "Quick check")} · ${task.task_no ? `${task.task_no} ` : ""}${task.title}`}
      parents={data} loading={!data && !error} error={error} onRetry={() => void load()}
      onViewImages={onViewImages} onOpenParent={onOpenParent} footer={footer}
      emptyTitle={t("งานนี้ยังไม่ผูกสินค้า", "This task has no product yet")}
      emptyHint={t("ผูก Parent SKU ในลิ้นชักงานก่อน แล้วข้อมูลสินค้าจะขึ้นที่นี่", "Link a Parent SKU in the task drawer and product details will show here")} />
  );
}
