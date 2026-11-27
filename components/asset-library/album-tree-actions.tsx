"use client";
// คลังไฟล์: จัดการอัลบั้มย่อยในแถบซ้าย — เมนู ⋯ ต่ออัลบั้ม · ป๊อปย้ายไปอยู่ใต้อัลบั้มอื่น · ถังขยะอัลบั้ม (กู้คืน)
// API = /api/assets/collections (parent_id / restore / DELETE แบบเก็บไว้) · กติกาต้นไม้ = lib/album-options
// อัลบั้ม SAMPLE (sample=true) จัดการที่หน้า SAMPLE Images — เมนูนี้ให้แค่เปลี่ยนชื่อ/ลบ
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { AlbumSelect } from "@/components/album-picker";
import { albumDescendantIds } from "@/lib/album-options";
import type { AssetCollection } from "@/app/api/assets/collections/route";

export type AlbumAction = "sub" | "rename" | "move" | "delete";

/** ปุ่ม ⋯ ข้างชื่ออัลบั้ม → เมนูเล็ก (โชว์ตอนชี้แถว / มือถือโชว์ตลอด) */
export function AlbumRowMenu({ album, onAction }: { album: AssetCollection; onAction: (a: AlbumAction) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const items: { a: AlbumAction; label: string; danger?: boolean }[] = [
    ...(!album.sample ? [{ a: "sub" as const, label: t("＋ สร้างอัลบั้มย่อย", "＋ New sub-album") }] : []),
    { a: "rename", label: t("✎ เปลี่ยนชื่อ", "✎ Rename") },
    ...(!album.sample ? [{ a: "move" as const, label: t("↪ ย้ายไปอยู่ใต้อัลบั้มอื่น", "↪ Move under another album") }] : []),
    { a: "delete", label: t("🗑 ลบ (เก็บในถังขยะ)", "🗑 Delete (to trash)"), danger: true },
  ];
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} aria-label={t("เมนูอัลบั้ม", "Album menu")}
        className={`w-6 h-6 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 ${open ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover/albumrow:opacity-100"}`}>⋯</button>
      {open && (
        <div className="absolute right-0 top-7 z-30 w-52 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {items.map((it) => (
            <button key={it.a} type="button" onClick={(e) => { e.stopPropagation(); setOpen(false); onAction(it.a); }}
              className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-slate-50 ${it.danger ? "text-rose-600" : "text-slate-700"}`}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** ย้ายอัลบั้มไปอยู่ใต้อัลบั้มอื่น (หรือชั้นบนสุด) — ตัดตัวเอง/อัลบั้มย่อยของตัวเอง/อัลบั้ม SAMPLE ออกจากตัวเลือก */
export function AlbumMoveModal({ album, collections, onClose, onMoved }: {
  album: AssetCollection; collections: AssetCollection[]; onClose: () => void;
  onMoved: (fromParent: string | null) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [to, setTo] = useState<string>(album.parent_id ?? "");
  const [busy, setBusy] = useState(false);
  const choices = useMemo(() => {
    const bad = new Set([album.id, ...albumDescendantIds(collections, album.id)]);
    return collections.filter((c) => !bad.has(c.id) && !c.sample);
  }, [album, collections]);
  const save = async () => {
    setBusy(true);
    try {
      const j = await (await apiFetch("/api/assets/collections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: album.id, parent_id: to || null }) })).json();
      if (j.error) throw new Error(j.error);
      onMoved(album.parent_id ?? null);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ย้ายไม่สำเร็จ", "Move failed")); }
    finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} size="sm" title={`${t("ย้ายอัลบั้ม", "Move album")} “${album.name}”`}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={save} disabled={busy || to === (album.parent_id ?? "")} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("ย้าย", "Move")}</button>
        </div>
      }>
      <p className="text-[12px] text-slate-500 mb-1">{t("ไปอยู่ใต้อัลบั้ม", "Put it under")}</p>
      <AlbumSelect albums={choices} value={to} onChange={setTo} noneLabel={t("— ชั้นบนสุด (ไม่มีอัลบั้มแม่) —", "— Top level (no parent) —")} />
      <p className="text-[11px] text-slate-400 mt-2">{t("อัลบั้มย่อยข้างในย้ายตามไปด้วย · ไฟล์ข้างในไม่เปลี่ยน", "Its sub-albums move with it · files inside stay the same")}</p>
    </ERPModal>
  );
}

/** ถังขยะอัลบั้ม — กู้คืนได้ (อัลบั้มย่อยที่ลบพร้อมกันกลับมาด้วย · ไฟล์ข้างในยังผูกอยู่ครบ) */
export function AlbumTrashModal({ onClose, onRestored }: { onClose: () => void; onRestored: () => void }) {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState<AssetCollection[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = async () => {
    try { const j = await (await apiFetch(`/api/assets/collections?trash=1&_=${Date.now()}`)).json(); setRows((j.data ?? []) as AssetCollection[]); }
    catch { setRows([]); }
  };
  useEffect(() => { void load(); }, []);
  const restore = async (a: AssetCollection) => {
    setBusyId(a.id);
    try {
      const j = await (await apiFetch("/api/assets/collections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, restore: true }) })).json();
      if (j.error) throw new Error(j.error);
      toast.success(`${t("กู้คืนแล้ว", "Restored")} “${a.name}”`);
      await load(); onRestored();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("กู้คืนไม่สำเร็จ", "Restore failed")); }
    finally { setBusyId(null); }
  };
  return (
    <ERPModal open onClose={onClose} size="sm" title={t("ถังขยะอัลบั้ม", "Album trash")}>
      {rows === null ? <p className="text-sm text-slate-400 py-4 text-center">{t("กำลังโหลด…", "Loading…")}</p>
        : rows.length === 0 ? <p className="text-sm text-slate-400 py-4 text-center">{t("ถังขยะว่าง", "Trash is empty")}</p>
        : (
          <div className="flex flex-col divide-y divide-slate-100">
            {rows.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm text-slate-700">📁 {a.name}</span>
                  <span className="text-[11px] text-slate-400">{a.count} {t("ไฟล์", "files")}{a.deleted_at ? ` · ${t("ลบเมื่อ", "deleted")} ${new Date(a.deleted_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}` : ""}</span>
                </span>
                <button onClick={() => restore(a)} disabled={busyId === a.id} className="h-8 px-3 text-[12px] border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">{t("กู้คืน", "Restore")}</button>
              </div>
            ))}
          </div>
        )}
    </ERPModal>
  );
}

/** ข้อมูลที่ลากจากการ์ดไฟล์ (การ์ดที่เลือกอยู่ = ลากทั้งชุด) */
export const ASSET_DRAG_TYPE = "application/x-erp-asset-ids";
