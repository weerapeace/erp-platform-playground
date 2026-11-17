"use client";
/**
 * ป๊อป "ลง N รูป — สร้างอัลบั้มใหม่?" (หน้า SAMPLE Images · เจ้าของเลือกจาก widget 2026-11-17)
 * เด้งตอนลากรูปมาวางขณะเปิดอัลบั้มอยู่ · ทางเลือก: สร้างอัลบั้มย่อยใหม่ หรือ ใส่ในอัลบั้มนี้เลย (จำทางล่าสุด · pref sample_images_drop_mode)
 * รอบ 2 (ชื่อแบบ A + ข้อ 1-5): เลือก Parent SKU ในป๊อปได้ (ตั้งต้น = Parent ที่อัลบั้มแม่เชื่อมไว้ / ตัวล่าสุดที่เลือก)
 *   - ไม่แยก = 1 อัลบั้ม เชื่อม Parent + SKU ที่ติ๊ก (ไม่ติ๊ก = ทั้งรุ่น)
 *   - แยกเป็นหลายอัลบั้มตาม SKU = กดเลือกรูปแล้วกดชิป SKU (หรือลากรูปไปวางบนชิป) · เดา SKU จากชื่อไฟล์ให้ก่อน
 *     อัลบั้มละ SKU ชื่อ Product 005, 006… · รูปที่ไม่ระบุ SKU = อัลบั้ม "ทั้งรุ่น" 1 อัลบั้ม
 * ตรรกะแบ่งกลุ่ม/เดา = lib/sample-sku-split (เทสต์)
 */
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { ParentSkuPicker, findParentSkuByCode, type ParentSkuPickerValue } from "@/components/pickers";
import { filePathOf } from "@/components/file-drop";
import { guessSku, splitGroups } from "@/lib/sample-sku-split";
import { loadChildSkus, type ChildSku } from "./api";

export type DropMode = "new" | "here";
export type DropGroup = { name: string; files: File[]; parentCode: string | null; skuCodes: string[] };
export type DropPlan = { mode: "here" } | { mode: "new"; groups: DropGroup[] };

const DRAG = "application/x-sample-drop-photo";
const SKU_COLORS = ["#ED93B1", "#85B7EB", "#97C459", "#EF9F27", "#AFA9EC", "#5DCAA5", "#F0997B", "#B4B2A9"];

export function DropAlbumDialog({ files, inside, defaultName, defaultParentCode, mode, onMode, onCancel, onConfirm }: {
  files: File[] | null;
  /** ชื่ออัลบั้มที่เปิดอยู่ (อัลบั้มใหม่จะอยู่ข้างใน) */
  inside: string;
  defaultName: string;
  /** Parent ตั้งต้น (อัลบั้มแม่เชื่อมไว้ / ตัวล่าสุดที่เลือก) */
  defaultParentCode?: string | null;
  mode: DropMode;
  onMode: (m: DropMode) => void;
  onCancel: () => void;
  onConfirm: (plan: DropPlan) => void;
}) {
  const t = useT();
  const open = !!files;
  const list = useMemo(() => files ?? [], [files]);
  const n = list.length;
  const [name, setName] = useState(defaultName);
  const [err, setErr] = useState<string | null>(null);
  const [parent, setParent] = useState<ParentSkuPickerValue | null>(null);
  const [kids, setKids] = useState<ChildSku[] | null>(null);
  const [split, setSplit] = useState(true);
  const [assign, setAssign] = useState<string[]>([]);       // แยกตาม SKU: รูปที่ i → รหัส SKU ("" = ทั้งรุ่น)
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [single, setSingle] = useState<Set<string>>(new Set());   // ไม่แยก: SKU ที่อัลบั้มเดียวเชื่อม
  const [overChip, setOverChip] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName); setErr(null); setSel(new Set()); setSingle(new Set()); setParent(null); setKids(null); setAssign(list.map(() => ""));
    if (defaultParentCode) void findParentSkuByCode(defaultParentCode).then((p) => setParent((cur) => cur ?? p));
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!parent) { setKids(null); return; }
    let alive = true;
    setKids(null);
    loadChildSkus(parent.id).then((k) => {
      if (!alive) return;
      setKids(k);
      // เดา SKU จากชื่อไฟล์/โฟลเดอร์ให้ก่อน (ข้อ 1) · เดาได้อย่างน้อย 1 รูป = เปิดโหมดแยกไว้
      const g = list.map((f) => guessSku(filePathOf(f), { id: parent.id, code: parent.code, name: parent.name }, k));
      setAssign(g); setSplit(k.length > 1); setSel(new Set());
    }).catch((e) => { if (alive) { setKids([]); setErr((e as Error).message); } });
    return () => { alive = false; };
  }, [parent, list]);

  const thumbs = useMemo(() => list.slice(0, 120).map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [list]);
  useEffect(() => () => thumbs.forEach((u) => u && URL.revokeObjectURL(u)), [thumbs]);

  const canSplit = mode === "new" && !!parent && !!kids && kids.length > 0;
  const splitting = canSplit && split;
  const colorOf = useMemo(() => new Map((kids ?? []).map((k, i) => [k.code, SKU_COLORS[i % SKU_COLORS.length]])), [kids]);
  const shortOf = (code: string) => (parent && code.toUpperCase().startsWith(parent.code.toUpperCase()) ? code.slice(parent.code.length).replace(/^[-_\s]+/, "") || code : code);
  const groups = useMemo(() => (splitting ? splitGroups(assign, kids ?? [], name.trim() || defaultName) : []), [splitting, assign, kids, name, defaultName]);

  const assignTo = (code: string, extra: number[] = []) => {
    const idx = new Set([...sel, ...extra]);
    if (!idx.size) { setErr(t("กดเลือกรูปก่อน แล้วค่อยกดชิป SKU", "Pick photos first, then a SKU chip")); return; }
    setAssign((a) => a.map((c, i) => (idx.has(i) ? code : c)));
    setSel(new Set()); setErr(null);
  };
  const toggleSel = (i: number) => setSel((s) => { const x = new Set(s); if (x.has(i)) x.delete(i); else x.add(i); return x; });
  const chipDrop = (code: string) => ({
    onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); setOverChip(code); } },
    onDragLeave: () => setOverChip(null),
    onDrop: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setOverChip(null); const i = Number(e.dataTransfer.getData(DRAG)); if (Number.isFinite(i)) assignTo(code, [i]); },
  });

  const submit = () => {
    if (mode === "here") { onConfirm({ mode: "here" }); return; }
    if (!name.trim()) { setErr(t("ใส่ชื่ออัลบั้มก่อน", "Enter an album name")); return; }
    const pc = parent?.code ?? null;
    if (splitting) {
      onConfirm({ mode: "new", groups: groups.map((g) => ({ name: g.name, files: g.indexes.map((i) => list[i]), parentCode: pc, skuCodes: g.skuCode ? [g.skuCode] : [] })) });
      return;
    }
    onConfirm({ mode: "new", groups: [{ name: name.trim(), files: list, parentCode: pc, skuCodes: pc ? [...single] : [] }] });
  };
  const opt = (on: boolean) => `flex w-full items-start gap-2.5 rounded-xl border p-3 text-left ${on ? "border-violet-500 bg-violet-50/60 ring-1 ring-violet-300" : "border-slate-200 bg-white hover:border-slate-300"}`;
  const chip = (on: boolean) => `inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] ${on ? "border-violet-500 bg-violet-50 text-violet-800 ring-2 ring-violet-200" : "border-slate-300 bg-white text-slate-700 hover:border-violet-300"}`;
  const confirmText = mode === "here" ? t(`ลง ${n} รูป`, `Add ${n}`)
    : splitting ? t(`สร้าง ${groups.length} อัลบั้ม + ลงรูป`, `Create ${groups.length} albums + add`) : t("สร้างอัลบั้ม + ลงรูป", "Create album + add");

  return (
    <ERPModal open={open} onClose={onCancel} size={splitting ? "lg" : "md"} defaultExpanded={false} storageKey="sample-drop-album"
      title={t(`ลง ${n} รูป — สร้างอัลบั้มใหม่?`, `Add ${n} image(s) — new album?`)} description={inside}
      footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
        {err && <span className="mr-auto text-[12px] text-rose-600">{err}</span>}
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={submit} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">{confirmText}</button>
      </div>}>
      <div className="space-y-2.5">
        <div role="radiogroup" className="space-y-2">
          <div role="radio" aria-checked={mode === "new"} tabIndex={0} onClick={() => onMode("new")} onKeyDown={(e) => { if (e.key === " ") onMode("new"); }} className={`${opt(mode === "new")} cursor-pointer`}>
            <input type="radio" readOnly checked={mode === "new"} className="mt-1" tabIndex={-1} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-800">{splitting ? t("สร้างอัลบั้มใหม่ (ชื่ออัลบั้มแรก นับต่อให้เอง)", "New albums (first name, numbered on)") : t("สร้างอัลบั้มใหม่", "New album")}</span>
              <input value={name} onChange={(e) => { setName(e.target.value); setErr(null); onMode("new"); }} onFocus={() => onMode("new")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} autoFocus maxLength={120}
                aria-label={t("ชื่ออัลบั้มใหม่", "New album name")}
                className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-violet-400 focus:outline-none" />
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

        {mode === "new" && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <div className="text-[13px] text-slate-600">{t("เชื่อมสินค้า (ไม่บังคับ) — รูปไปโชว์ที่หน้าสินค้าในส่วน \"รูป SAMPLE\"", "Link a product (optional) — photos show on its SAMPLE section")}</div>
            <ParentSkuPicker value={parent} onChange={(v) => { setParent(v); setErr(null); }} disableCreate />
            {parent && !kids && <p className="text-[12px] text-slate-400">{t("กำลังโหลด SKU ลูก…", "Loading child SKUs…")}</p>}
            {canSplit && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={split} onChange={(e) => { setSplit(e.target.checked); setSel(new Set()); setErr(null); }} />
                {t("แยกเป็นหลายอัลบั้มตาม SKU", "Split into albums by SKU")}
              </label>
            )}
            {/* ไม่แยก: อัลบั้มเดียว เลือก SKU ที่เชื่อม (ไม่เลือก = ทั้งรุ่น) */}
            {canSplit && !split && (
              <div className="flex flex-wrap gap-1.5">
                {kids!.map((k) => <button key={k.id} type="button" className={chip(single.has(k.code))} onClick={() => setSingle((s) => { const x = new Set(s); if (x.has(k.code)) x.delete(k.code); else x.add(k.code); return x; })}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf.get(k.code) }} />{shortOf(k.code)}{k.name ? ` · ${k.name}` : ""}</button>)}
                <span className="self-center text-[12px] text-slate-400">{t("ไม่เลือก = ทั้งรุ่น", "none = whole model")}</span>
              </div>
            )}
            {/* แยก: กดรูปแล้วกดชิป · ลากรูปไปวางบนชิปได้ */}
            {splitting && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {kids!.map((k) => (
                    <button key={k.id} type="button" onClick={() => assignTo(k.code)} {...chipDrop(k.code)} className={chip(overChip === k.code)}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf.get(k.code) }} />{shortOf(k.code)}{k.name ? ` · ${k.name}` : ""}
                      <span className="text-slate-400">{assign.filter((c) => c === k.code).length || ""}</span>
                    </button>
                  ))}
                  <button type="button" onClick={() => assignTo("")} {...chipDrop("")} className={chip(overChip === "")}>{t("ไม่ระบุ SKU (ทั้งรุ่น)", "No SKU (whole model)")}<span className="text-slate-400">{assign.filter((c) => !c).length || ""}</span></button>
                </div>
                <p className="text-[12px] text-slate-400">{t("กดรูป (เลือกได้หลายรูป) แล้วกดชิป SKU · หรือลากรูปไปวางบนชิป", "Click photos then a SKU chip · or drag a photo onto a chip")}{sel.size ? ` · ${t(`เลือกอยู่ ${sel.size} รูป`, `${sel.size} selected`)}` : ""}</p>
              </>
            )}
          </div>
        )}

        <div className={`grid max-h-[340px] gap-1.5 overflow-y-auto ${splitting ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-6 sm:grid-cols-8"}`}>
          {list.slice(0, 120).map((f, i) => {
            const u = thumbs[i], code = assign[i] ?? "", on = sel.has(i);
            return (
              <div key={i} title={filePathOf(f)}
                draggable={splitting}
                onDragStart={(e) => { e.dataTransfer.setData(DRAG, String(i)); e.dataTransfer.effectAllowed = "move"; }}
                onClick={() => splitting && toggleSel(i)}
                className={`relative aspect-square overflow-hidden rounded-md border-2 bg-slate-50 ${splitting ? "cursor-pointer" : ""} ${on ? "border-violet-500" : "border-transparent"}`}>
                {u
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={u} alt="" draggable={false} className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-slate-400"><Icon value="i:photo" /></span>}
                {splitting && code && <span className="absolute inset-x-0.5 bottom-0.5 truncate rounded px-1 text-center text-[10.5px] font-medium text-white" style={{ background: colorOf.get(code) ?? "#7c3aed" }}>{shortOf(code)}</span>}
                {on && <span className="absolute right-0.5 top-0.5 rounded-full bg-white text-base text-violet-600"><Icon value="i:circle-check" /></span>}
              </div>
            );
          })}
          {n > 120 && <span className="col-span-full text-[12px] text-slate-400">{t(`+ อีก ${n - 120} รูป (ไปอยู่ตาม SKU ที่เดาได้ / ทั้งรุ่น)`, `+${n - 120} more`)}</span>}
        </div>

        {splitting && groups.length > 0 && (
          <div className="rounded-lg bg-violet-50/60 px-3 py-2 text-[12px] text-violet-900">
            {t(`จะสร้าง ${groups.length} อัลบั้ม: `, `Will create ${groups.length} albums: `)}
            {groups.map((g) => `${g.name} (${g.skuCode ? shortOf(g.skuCode) : t("ทั้งรุ่น", "whole model")} · ${g.indexes.length})`).join(" · ")}
          </div>
        )}
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
