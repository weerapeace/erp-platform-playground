"use client";
// 🖼 เพิ่มรูปจาก Google Drive เข้าคอนเทนต์ — วางลิงก์ไฟล์ (เพิ่มเลย) หรือลิงก์โฟลเดอร์ (ป๊อปติ๊กเลือกรูป)
// เก็บเป็นไฟล์แนบ kind image + url "drive:<fileId>" (ไม่ก็อปไฟล์ลง R2) · ตอนยิงโพสต์ระบบดึงจาก Drive + แปลง JPEG ให้เอง (/api/post-image)
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { r2ImageUrl } from "@/lib/r2-image";
import { useT } from "@/components/i18n";
import { type ToastVariant } from "@/components/toast";
import { resolveDriveLink, type DriveFileRef } from "../data";

export function DriveImageAdd({ existingKeys, onAdd, pushToast }: {
  existingKeys: string[];                              // คีย์ drive:<id> ที่แนบอยู่แล้ว (กันซ้ำ)
  onAdd: (files: DriveFileRef[]) => Promise<void>;
  pushToast: (type: ToastVariant, m: string) => void;
}) {
  const t = useT();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<{ name: string; files: DriveFileRef[] } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const has = (id: string) => existingKeys.includes(`drive:${id}`);

  const check = async () => {
    const l = link.trim(); if (!l) return;
    setBusy(true);
    try {
      const r = await resolveDriveLink(l, "image");
      if (r.files) {
        setPick({ name: r.folder?.name ?? "", files: r.files });
        setSel(r.files.filter((f) => !has(f.file_id)).map((f) => f.file_id));
      } else if (r.file) {
        if (has(r.file.file_id)) pushToast("info", t("รูปนี้แนบไว้แล้ว", "Already attached"));
        else { await onAdd([r.file]); setLink(""); }
      }
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(false); }
  };
  const confirmPick = async () => {
    if (!pick) return;
    const files = pick.files.filter((f) => sel.includes(f.file_id) && !has(f.file_id));
    if (!files.length) { setPick(null); return; }
    setBusy(true);
    try { await onAdd(files); setPick(null); setLink(""); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(false); }
  };
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selectable = pick ? pick.files.filter((f) => !has(f.file_id)) : [];

  return (
    <div className="mt-2">
      <div className="flex gap-1.5">
        <input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void check(); }}
          placeholder={t("วางลิงก์รูป หรือลิงก์โฟลเดอร์จาก Google Drive...", "Paste a Google Drive image or folder link...")}
          className="flex-1 min-w-0 h-8 border border-slate-200 rounded-md px-2 text-xs" />
        <button onClick={() => void check()} disabled={busy || !link.trim()} className="h-8 px-3 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 shrink-0">
          {busy && !pick ? t("⏳ ตรวจ…", "⏳ Checking…") : t("＋ รูปจาก Drive", "＋ From Drive")}
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mt-0.5">{t("รูปอยู่ที่ Drive ที่เดียว (ไม่ก็อปลงระบบ) · โพสต์อัตโนมัติได้ · ต้องแชร์ไฟล์/โฟลเดอร์ให้บัญชีระบบก่อน", "Stays on Drive (no copy) · auto-post ready · share with the system account first")}</p>

      {pick && (
        <ERPModal open onClose={() => setPick(null)} size="lg" title={`📁 ${pick.name || "Google Drive"}`}
          footer={<>
            <button onClick={() => setPick(null)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={() => void confirmPick()} disabled={busy || sel.length === 0} className="h-9 px-5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
              {busy ? t("กำลังเพิ่ม…", "Adding…") : t(`เพิ่ม ${sel.length} รูป`, `Add ${sel.length}`)}
            </button>
          </>}>
          <div className="flex items-center gap-3 mb-2 text-xs text-slate-500">
            <span>{t(`ในโฟลเดอร์มี ${pick.files.length} รูป`, `${pick.files.length} images`)}</span>
            {selectable.length > 0 && (
              <button onClick={() => setSel(sel.length === selectable.length ? [] : selectable.map((f) => f.file_id))} className="text-violet-700 hover:underline">
                {sel.length === selectable.length ? t("ไม่เลือกเลย", "Select none") : t("เลือกทั้งหมด", "Select all")}
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {pick.files.map((f) => {
              const added = has(f.file_id); const on = sel.includes(f.file_id);
              return (
                <button key={f.file_id} type="button" disabled={added} onClick={() => toggle(f.file_id)} title={f.name}
                  className={`relative rounded-lg overflow-hidden border-2 aspect-square bg-slate-100 ${added ? "border-slate-200 opacity-40 cursor-default" : on ? "border-violet-500" : "border-slate-200 opacity-70 hover:opacity-100"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r2ImageUrl(`drive:${f.file_id}`, 200) ?? ""} alt="" loading="lazy" className="w-full h-full object-cover" />
                  {on && !added && <span className="absolute top-1 right-1 bg-violet-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow">✓</span>}
                  {added && <span className="absolute bottom-1 left-1 text-[9px] bg-slate-700 text-white px-1 rounded">{t("แนบแล้ว", "added")}</span>}
                  <span className="absolute bottom-0 inset-x-0 text-[9px] text-white bg-black/50 px-1 truncate text-left">{f.name}</span>
                </button>
              );
            })}
          </div>
        </ERPModal>
      )}
    </div>
  );
}
