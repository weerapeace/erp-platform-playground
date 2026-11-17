"use client";
/**
 * ป๊อป "ลง N รูป — สร้างอัลบั้มใหม่?" (หน้า SAMPLE Images · เจ้าของเลือกจาก widget 2026-11-17)
 * เด้งตอนลากรูปมาวางขณะเปิดอัลบั้มอยู่ · ทางเลือก: สร้างอัลบั้มย่อยใหม่ (ชื่อ Product ### นับต่อทั้งแบรนด์ / ชื่อโฟลเดอร์ที่ลากมา) หรือ ใส่ในอัลบั้มนี้เลย
 * จำทางที่เลือกล่าสุดรายคน (user-pref sample_images_drop_mode) · หน้ารวมอัลบั้มไม่ถาม (ลงอัลบั้มของวันนี้เหมือนเดิม)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";

export type DropMode = "new" | "here";

export function DropAlbumDialog({ files, inside, defaultName, mode, onMode, onCancel, onConfirm }: {
  files: File[] | null;
  /** ชื่ออัลบั้มที่เปิดอยู่ (อัลบั้มใหม่จะอยู่ข้างใน) */
  inside: string;
  defaultName: string;
  mode: DropMode;
  onMode: (m: DropMode) => void;
  onCancel: () => void;
  /** name = ชื่ออัลบั้มใหม่ · null = ใส่ในอัลบั้มนี้ */
  onConfirm: (name: string | null) => void;
}) {
  const t = useT();
  const open = !!files;
  const [name, setName] = useState(defaultName);
  const [err, setErr] = useState(false);
  useEffect(() => { if (open) { setName(defaultName); setErr(false); } }, [open, defaultName]);
  const thumbs = useMemo(() => (files ?? []).slice(0, 8).map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => thumbs.forEach((u) => u && URL.revokeObjectURL(u)), [thumbs]);
  const n = files?.length ?? 0;

  const submit = () => {
    if (mode === "here") { onConfirm(null); return; }
    if (!name.trim()) { setErr(true); return; }
    onConfirm(name.trim());
  };
  const opt = (on: boolean) => `flex w-full items-start gap-2.5 rounded-xl border p-3 text-left ${on ? "border-violet-500 bg-violet-50/60 ring-1 ring-violet-300" : "border-slate-200 bg-white hover:border-slate-300"}`;

  return (
    <ERPModal open={open} onClose={onCancel} size="sm" defaultExpanded={false} storageKey="sample-drop-album"
      title={t(`ลง ${n} รูป — สร้างอัลบั้มใหม่?`, `Add ${n} image(s) — new album?`)} description={inside}
      footer={<div className="flex w-full justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={submit} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">
          {mode === "new" ? t("สร้างอัลบั้ม + ลงรูป", "Create album + add") : t(`ลง ${n} รูป`, `Add ${n}`)}
        </button>
      </div>}>
      <div className="space-y-2">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {thumbs.map((u, i) => u
            // eslint-disable-next-line @next/next/no-img-element
            ? <img key={i} src={u} alt="" className="h-11 w-11 shrink-0 rounded-md border border-slate-200 object-cover" />
            : <span key={i} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400"><Icon value="i:photo" /></span>)}
          {n > 8 && <span className="self-center px-1 text-[12px] text-slate-400">+{n - 8}</span>}
        </div>
        <div role="radiogroup" className="space-y-2">
          <div role="radio" aria-checked={mode === "new"} tabIndex={0} onClick={() => onMode("new")} onKeyDown={(e) => { if (e.key === " ") onMode("new"); }} className={`${opt(mode === "new")} cursor-pointer`}>
            <input type="radio" readOnly checked={mode === "new"} className="mt-1" tabIndex={-1} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-800">{t("สร้างอัลบั้มใหม่", "New album")}</span>
              <input value={name} onChange={(e) => { setName(e.target.value); setErr(false); onMode("new"); }} onFocus={() => onMode("new")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} autoFocus maxLength={120}
                aria-label={t("ชื่ออัลบั้มใหม่", "New album name")}
                className={`mt-1.5 h-9 w-full rounded-lg border bg-white px-2.5 text-sm focus:outline-none ${err ? "border-rose-400" : "border-slate-200 focus:border-violet-400"}`} />
              {err && <span className="mt-1 block text-[12px] text-rose-600">{t("ใส่ชื่ออัลบั้มก่อน", "Enter an album name")}</span>}
              <span className="mt-1 block text-[12px] text-slate-500">{t(`อยู่ใน ${inside}`, `Inside ${inside}`)}</span>
            </span>
          </div>
          <button type="button" role="radio" aria-checked={mode === "here"} onClick={() => onMode("here")} className={opt(mode === "here")}>
            <input type="radio" readOnly checked={mode === "here"} className="mt-1" tabIndex={-1} />
            <span>
              <span className="block text-sm font-medium text-slate-800">{t("ใส่ในอัลบั้มนี้เลย", "Add to this album")}</span>
              <span className="block text-[12px] text-slate-500">{t("ไม่สร้างอัลบั้มใหม่", "No new album")}</span>
            </span>
          </button>
        </div>
      </div>
    </ERPModal>
  );
}

/** ลากโฟลเดอร์มาวาง → ชื่อโฟลเดอร์ (ทุกไฟล์อยู่ใต้โฟลเดอร์เดียวกัน) · ไม่ใช่ = null */
export function commonFolderName(paths: string[]): string | null {
  const tops = new Set(paths.map((p) => (p.includes("/") ? p.split("/")[0] : "")));
  if (tops.size !== 1) return null;
  const top = [...tops][0];
  return top ? top : null;
}
