"use client";

// popup ยืนยันก่อนสร้างโฟลเดอร์ Drive ของงาน (เฟส B)
// - โหมดโครงสร้าง (แบรนด์ตั้งโฟลเดอร์แม่): เลือกโฟลเดอร์ปลายทาง (มี/พิมพ์ใหม่) + ตั้งชื่อโฟลเดอร์ + เตือนถ้าชื่อซ้ำ
// - โหมดแบน (ไม่มีโฟลเดอร์แบรนด์): แค่ยืนยัน
// กด "สร้าง" → ปิด popup ทันที แล้วส่งงานให้ตัวเรียก (drawer) ไปทำที่เบื้องหลัง (runBgJob)

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { driveFolderInfo, driveFolderCheckDup, type DriveFolderInfo } from "./data";
import { useT } from "@/components/i18n";

export type DriveCreateOpts = { destination_name: string; folder_name: string };

export function DriveFolderModal({ taskId, onClose, onStart, pushToast }: {
  taskId: string;
  onClose: () => void;
  // fire-and-forget: opts = undefined เมื่อเป็นโหมดแบน · folderLabel = ชื่อสั้นไว้โชว์บนชิปงาน
  onStart: (opts: DriveCreateOpts | undefined, folderLabel: string) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
}) {
  const t = useT();
  const [info, setInfo] = useState<DriveFolderInfo | null>(null);
  const [destination, setDestination] = useState("");
  const [folderName, setFolderName] = useState("");
  const [dup, setDup] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    driveFolderInfo(taskId).then((j) => {
      setInfo(j);
      setDestination(j.suggested_destination ?? "");
      setFolderName(j.suggested_name ?? "");
    }).catch((e) => { pushToast("error", (e as Error).message); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // เช็กชื่อซ้ำ (debounce) เมื่อ destination/ชื่อโฟลเดอร์เปลี่ยน (เฉพาะโหมดโครงสร้าง)
  useEffect(() => {
    if (!info?.structured || !folderName.trim()) { setDup(false); return; }
    setChecking(true);
    const h = setTimeout(async () => {
      try { setDup(await driveFolderCheckDup(taskId, destination.trim(), folderName.trim())); } catch { setDup(false); } finally { setChecking(false); }
    }, 500);
    return () => clearTimeout(h);
  }, [taskId, destination, folderName, info?.structured]);

  const start = () => {
    const structured = !!info?.structured;
    const label = (structured ? folderName.trim() : "") || t("โฟลเดอร์ Drive", "Drive folder");
    onStart(structured ? { destination_name: destination.trim(), folder_name: folderName.trim() } : undefined, label);
    onClose();   // ปิด popup ทันที — งานไปทำต่อที่เบื้องหลัง
  };

  const loading = info === null;
  return (
    <ERPModal open onClose={onClose} title={t("สร้างโฟลเดอร์ Drive", "Create Drive folder")} size="sm" resizable={false}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={start} disabled={loading || (!!info?.structured && !folderName.trim())} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{t("สร้าง", "Create")}</button>
        </div>
      }>
      {loading ? <div className="py-8 text-center text-slate-400 text-sm">{t("กำลังโหลด...", "Loading...")}</div>
        : !info.structured ? (
          <p className="text-sm text-slate-600">{t("จะสร้างโฟลเดอร์ของงานนี้ในโฟลเดอร์กลาง แล้วอัปไฟล์แนบขึ้น Drive · ยืนยันไหม?", "Create this task's folder in the shared Drive and upload attachments?")}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">{t("โฟลเดอร์แม่", "Parent")}: <span className="text-slate-600">📁 {info.parent_name}</span></p>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">{t("โฟลเดอร์ปลายทาง (เว้นว่าง = วางตรงในโฟลเดอร์แม่)", "Destination sub-folder (blank = directly in parent)")}</span>
              <input list="drive-dests" value={destination} onChange={(e) => setDestination(e.target.value)}
                placeholder={t("เช่น TTM (เลือกที่มี หรือพิมพ์ใหม่)", "e.g. TTM (pick existing or type new)")}
                className="mt-0.5 w-full h-9 border border-slate-200 rounded-lg px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              <datalist id="drive-dests">{(info.destinations ?? []).map((d) => <option key={d.id} value={d.name} />)}</datalist>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">{t("ชื่อโฟลเดอร์", "Folder name")}</span>
              <input value={folderName} onChange={(e) => setFolderName(e.target.value)}
                className="mt-0.5 w-full h-9 border border-slate-200 rounded-lg px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </label>
            <div className="text-[11px] text-slate-500 bg-slate-50 rounded-md px-2.5 py-1.5 break-all">📁 {info.parent_name}{destination.trim() ? ` / ${destination.trim()}` : ""} / <b className="text-slate-700">{folderName.trim() || "…"}</b> /</div>
            {checking ? <p className="text-[11px] text-slate-400">{t("กำลังเช็กชื่อซ้ำ...", "Checking for duplicates...")}</p>
              : dup ? <p className="text-[11px] text-amber-600">⚠ {t(`มี "${folderName.trim()}" อยู่แล้วในปลายทางนี้ — กดสร้างจะรวมเข้าโฟลเดอร์เดิม (รูปเก่าถูกเก็บเป็น Ver.)`, `"${folderName.trim()}" already exists here — creating merges into it (old files kept as Ver.)`)}</p>
              : null}
            <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-2">💡 {t("กดสร้างแล้วปิดหน้าต่างนี้ได้เลย — งานจะทำที่เบื้องหลัง มีแถบเล็ก ๆ มุมจอบอกว่าเสร็จหรือยัง", "After you press Create you can close this — it runs in the background; a small chip in the corner shows when it's done")}</p>
          </div>
        )}
    </ERPModal>
  );
}
