"use client";

// ============================================================
// การ์ดโฟลเดอร์บนกระดานวาด (ของกลาง) — ดับเบิลคลิกการ์ด = เปิดโฟลเดอร์ใน File Explorer
//
// ใช้ที่: กระดานแคมเปญ (/tasks/campaigns/[id]) · กระดาน flowchart กลาง (components/flowchart-board → แผนผังการเก็บไฟล์)
// ประกอบด้วย 3 ชิ้น:
//   folderCardSkeleton(f)  → โครงการ์ด Excalidraw (ส่งเข้า CanvasSketchControls.insert)
//   openCanvasFolder(path) → เปิดโฟลเดอร์ผ่าน erpfolder: (ลง .reg ครั้งเดียวต่อเครื่อง) + คัดลอก path สำรอง
//   <FolderCardModal>      → ป๊อปกรอกชื่อ + path แล้วคืนโครงการ์ดให้ผู้เรียกวางเอง
// ห้ามใช้: เปิดไฟล์บน R2/Drive (เป็นลิงก์เว็บ ใช้ลิงก์ธรรมดา) — อันนี้สำหรับโฟลเดอร์ในเครื่อง/ไดรฟ์แชร์เท่านั้น
// ============================================================

import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPInput } from "@/components/form";
import { useT } from "@/components/i18n";
import { suppressUnload } from "@/lib/canvas-unload-guard";

/** การ์ดโฟลเดอร์บน Excalidraw (กล่องเล็ก): 📁 ชื่อ (บน) + path เล็กสีเทา (ล่าง) · คำใบ้เป็น tooltip ตอนชี้ */
export function folderCardSkeleton(f: { path: string; label: string }): Record<string, unknown>[] {
  const fid = Math.random().toString(36).slice(2, 9);
  const gid = `folder-${fid}`;
  const data = { kind: "folder", id: fid, path: f.path, label: f.label, tooltip: "ดับเบิลคลิก = เปิดโฟลเดอร์" };
  const W = 250, H = 60;
  return [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ecfeff", strokeColor: "#0891b2", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
    { type: "text", x: 12, y: 9, width: W - 24, text: `📁 ${f.label || "โฟลเดอร์"}`, fontSize: 15, strokeColor: "#155e75", groupIds: [gid], customData: data },
    { type: "text", x: 12, y: 32, width: W - 24, text: f.path, fontSize: 10, strokeColor: "#64748b", groupIds: [gid], customData: data },
  ];
}

/** เปิดโฟลเดอร์: ยิง custom protocol erpfolder: (ลง .reg แล้วเปิด File Explorer ทันที) + คัดลอก path เป็นทางสำรอง
 *  ⚠️ ต้อง suppressUnload() ก่อนยิง — การยิง protocol ทำให้ Chrome เรียก beforeunload ของกระดาน ("Leave site?")
 *  · ใช้ erpfolder: (ไม่มี //) แบบ mailto: กัน Chrome ตีความเป็น host */
export function openCanvasFolder(path: string): void {
  if (!path) return;
  navigator.clipboard?.writeText(path).catch(() => {});
  suppressUnload();
  try { window.location.href = "erpfolder:" + encodeURIComponent(path); } catch { /* ไม่มี handler ก็ข้าม */ }
}

/** ป๊อปเพิ่มการ์ดโฟลเดอร์ — กรอกชื่อ (ไม่ใส่ = ชื่อโฟลเดอร์สุดท้าย) + path → onPlace(โครงการ์ด) ให้ผู้เรียกวางลงกระดาน */
export function FolderCardModal({ open, onClose, onPlace }: {
  open: boolean;
  onClose: () => void;
  onPlace: (skeletons: Record<string, unknown>[], info: { path: string; label: string }) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({ label: "", path: "" });
  const place = () => {
    const path = form.path.trim();
    if (!path) return;
    const label = form.label.trim() || path.split(/[\\/]/).filter(Boolean).pop() || "โฟลเดอร์";
    onPlace(folderCardSkeleton({ path, label }), { path, label });
    setForm({ label: "", path: "" });
  };
  return (
    <ERPModal open={open} onClose={onClose} title={t("เพิ่มการ์ดโฟลเดอร์", "Add Folder card")} size="md"
      footer={<div className="flex justify-end gap-2"><button onClick={onClose} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button><button onClick={place} disabled={!form.path.trim()} className="h-9 px-4 text-sm text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-50">📁 {t("วางการ์ด", "Place card")}</button></div>}>
      <div className="space-y-3">
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("ชื่อ (ไม่ใส่ = ใช้ชื่อโฟลเดอร์สุดท้าย)", "Label (empty = last folder name)")}</p>
          <ERPInput value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder={t("เช่น วิดีโอ Pasio", "e.g. Pasio videos")} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("ที่อยู่โฟลเดอร์ (path)", "Folder path")}</p>
          <ERPInput value={form.path} onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && form.path.trim()) place(); }} placeholder="Z:\Work In Process\[02]\Video\Pasio" />
        </div>
        <div className="text-[11px] text-cyan-800 bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2 space-y-1">
          <p className="font-medium">📌 {t("ดับเบิลคลิกการ์ด = เปิดโฟลเดอร์ใน File Explorer ทันที", "Double-click card = open folder in File Explorer instantly")}</p>
          <p className="text-cyan-700">{t("ลงครั้งเดียวต่อเครื่อง (Windows):", "Install once per PC (Windows):")}</p>
          <p>{t("1) ดาวน์โหลดไฟล์ตั้งค่า  2) ดับเบิลคลิก → กด Yes  3) ", "1) Download  2) double-click → Yes  3) ")}<b>{t("ปิด-เปิดเบราว์เซอร์ใหม่ 1 ครั้ง", "restart the browser once")}</b></p>
          <p>{t("ครั้งแรกที่กดการ์ด Chrome จะถาม → กด ", "First click, Chrome asks → click ")}<b>Open</b>{t(" (ติ๊ก Always allow)", " (tick Always allow)")}</p>
          <a href="/erp-open-folder.reg" download className="inline-flex items-center gap-1 font-medium underline text-cyan-700 hover:text-cyan-900">⬇️ {t("ดาวน์โหลดไฟล์ตั้งค่า (.reg)", "Download setup file (.reg)")}</a>
          <p className="text-cyan-600">{t("ยังไม่ลง/ยังไม่ restart = กดแล้วจะคัดลอก path ให้วางเองใน File Explorer (Ctrl+V → Enter)", "Not installed/not restarted = clicking copies the path to paste manually (Ctrl+V → Enter)")}</p>
        </div>
      </div>
    </ERPModal>
  );
}
