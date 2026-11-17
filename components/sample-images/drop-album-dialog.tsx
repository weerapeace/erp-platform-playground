"use client";
/**
 * ป๊อป "ลง N รูป — สร้างอัลบั้มใหม่?" (หน้า SAMPLE Images · เจ้าของเลือกจาก widget 2026-11-17)
 * เด้งตอนลากรูปมาวางขณะเปิดอัลบั้มอยู่ · ทางเลือก: สร้างอัลบั้มย่อยใหม่ หรือ ใส่ในอัลบั้มนี้เลย (จำทางล่าสุด · pref sample_images_drop_mode)
 * รอบ 3 — "แบ่งรูปยังไง?" 3 แบบ เห็นตั้งแต่เปิดป๊อป (จำแบบล่าสุด · pref sample_images_drop_split):
 *   - อัลบั้มเดียว = 1 อัลบั้ม เชื่อม Parent + SKU ที่ติ๊กได้ (ไม่ติ๊ก = ทั้งรุ่น)
 *   - แยกตาม SKU = รุ่นเดียวกัน · เลือก Parent แล้วกดรูป→กดชิป SKU (ลากรูปไปวางบนชิปได้) · เดา SKU จากชื่อไฟล์ให้ก่อน
 *     อัลบั้มละ SKU ชื่อ Product 005, 006… · ไม่ระบุ SKU = อัลบั้ม "ทั้งรุ่น"
 *   - แยกหลายอัลบั้ม = คนละสินค้า · กดรูป→กดชิปอัลบั้ม · แต่ละอัลบั้มตั้งชื่อ + เลือก Parent/SKU ของตัวเองได้
 *     ลากโฟลเดอร์ที่มีโฟลเดอร์ย่อย → แยกตามโฟลเดอร์ย่อยให้เอง (ข้อ 1)
 *   - ลากคลุมเลือกหลายรูปในป๊อปได้ (ข้อ 5 · ของกลาง useMarqueeSelect)
 * ตรรกะแบ่งกลุ่ม/เดา = lib/sample-sku-split (เทสต์)
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { ParentSkuPicker, findParentSkuByCode, type ParentSkuPickerValue } from "@/components/pickers";
import { filePathOf } from "@/components/file-drop";
import { useMarqueeSelect } from "@/lib/use-marquee-select";
import { bumpProductName, folderGroups, guessSku, splitGroups } from "@/lib/sample-sku-split";
import { loadChildSkus, type ChildSku } from "./api";

export type DropMode = "new" | "here";
export type DropSplit = "one" | "sku" | "album";
export type DropGroup = { name: string; files: File[]; parentCode: string | null; skuCodes: string[] };
export type DropPlan = { mode: "here" } | { mode: "new"; split: DropSplit; groups: DropGroup[] };

const DRAG = "application/x-sample-drop-photo";
const COLORS = ["#ED93B1", "#85B7EB", "#97C459", "#EF9F27", "#AFA9EC", "#5DCAA5", "#F0997B", "#B4B2A9"];
const chipCls = (on: boolean) => `inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] ${on ? "border-violet-500 bg-violet-50 text-violet-800 ring-2 ring-violet-200" : "border-slate-300 bg-white text-slate-700 hover:border-violet-300"}`;
const shortCode = (parentCode: string | undefined, code: string) => (parentCode && code.toUpperCase().startsWith(parentCode.toUpperCase()) ? code.slice(parentCode.length).replace(/^[-_\s]+/, "") || code : code);

/** โหลด SKU ลูกของ Parent (null = กำลังโหลด / ยังไม่เลือก) */
function useKids(parent: ParentSkuPickerValue | null, onError?: (m: string) => void) {
  const [kids, setKids] = useState<ChildSku[] | null>(null);
  const err = useRef(onError); err.current = onError;
  useEffect(() => {
    setKids(null);
    if (!parent) return;
    let alive = true;
    loadChildSkus(parent.id).then((k) => { if (alive) setKids(k); }).catch((e) => { if (alive) { setKids([]); err.current?.((e as Error).message); } });
    return () => { alive = false; };
  }, [parent]);
  return kids;
}

/** ชิป SKU ลูกแบบติ๊กหลายตัว (ไม่ติ๊ก = ทั้งรุ่น) */
function SkuToggleChips({ parent, kids, value, onChange }: { parent: ParentSkuPickerValue; kids: ChildSku[] | null; value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  if (!kids) return <p className="text-[12px] text-slate-400">{t("กำลังโหลด SKU ลูก…", "Loading child SKUs…")}</p>;
  if (!kids.length) return <p className="text-[12px] text-slate-400">{t("รุ่นนี้ยังไม่มี SKU ลูก — เชื่อมทั้งรุ่น", "No child SKUs — links the whole model")}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {kids.map((k, i) => {
        const on = value.includes(k.code);
        return <button key={k.id} type="button" className={chipCls(on)} onClick={() => onChange(on ? value.filter((c) => c !== k.code) : [...value, k.code])}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{shortCode(parent.code, k.code)}{k.name ? ` · ${k.name}` : ""}</button>;
      })}
      <span className="self-center text-[12px] text-slate-400">{t("ไม่เลือก = ทั้งรุ่น", "none = whole model")}</span>
    </div>
  );
}

type AlbumGroup = { key: number; name: string; hint?: string; parent: ParentSkuPickerValue | null; skus: string[] };

/** แถวตั้งค่าอัลบั้ม (แบบแยกหลายอัลบั้ม) — ชื่อ + Parent + SKU ของอัลบั้มนั้น (ข้อ 2) */
function AlbumRow({ g, color, count, canRemove, onChange, onRemove }: {
  g: AlbumGroup; color: string; count: number; canRemove: boolean; onChange: (p: Partial<AlbumGroup>) => void; onRemove: () => void;
}) {
  const t = useT();
  const kids = useKids(g.parent);
  return (
    <div className="space-y-1.5 border-t border-dashed border-slate-200 pt-2 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
        <input value={g.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={120} aria-label={t("ชื่ออัลบั้ม", "Album name")}
          className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-violet-400 focus:outline-none" />
        <span className="shrink-0 text-[12px] text-slate-500">{count ? t(`${count} รูป`, `${count}`) : t("ว่าง (ข้าม)", "empty (skip)")}</span>
        {canRemove && <button type="button" onClick={onRemove} title={t("เอาอัลบั้มนี้ออก (รูปกลับไปอัลบั้มแรก)", "Remove (photos go to the first album)")}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Icon value="i:x" /></button>}
      </div>
      {g.hint && <p className="pl-5 text-[11.5px] text-slate-400">{t(`จากโฟลเดอร์ ${g.hint}`, `From folder ${g.hint}`)}</p>}
      <div className="pl-5"><ParentSkuPicker value={g.parent} onChange={(v) => onChange({ parent: v, skus: [] })} placeholder={t("เลือก Parent SKU... (ไม่บังคับ)", "Parent SKU… (optional)")} disableCreate /></div>
      {g.parent && <div className="pl-5"><SkuToggleChips parent={g.parent} kids={kids} value={g.skus} onChange={(skus) => onChange({ skus })} /></div>}
    </div>
  );
}

export function DropAlbumDialog({ files, inside, defaultName, defaultParentCode, defaultSplit = "one", mode, onMode, onCancel, onConfirm }: {
  files: File[] | null;
  /** ชื่ออัลบั้มที่เปิดอยู่ (อัลบั้มใหม่จะอยู่ข้างใน) */
  inside: string;
  defaultName: string;
  /** Parent ตั้งต้น (อัลบั้มแม่เชื่อมไว้ / ตัวล่าสุดที่เลือก) */
  defaultParentCode?: string | null;
  /** แบบแบ่งที่ใช้ล่าสุด (ข้อ 3) */
  defaultSplit?: DropSplit;
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
  const [split, setSplit] = useState<DropSplit>(defaultSplit);
  const [parent, setParent] = useState<ParentSkuPickerValue | null>(null);
  const kids = useKids(parent, (m) => setErr(m));
  const [assign, setAssign] = useState<string[]>([]);       // แยกตาม SKU: รูปที่ i → รหัส SKU ("" = ทั้งรุ่น)
  const [single, setSingle] = useState<string[]>([]);       // อัลบั้มเดียว: SKU ที่เชื่อม
  const [albums, setAlbums] = useState<AlbumGroup[]>([]);   // แยกหลายอัลบั้ม
  const [albumOf, setAlbumOf] = useState<number[]>([]);     // รูปที่ i → key อัลบั้ม
  const nextKey = useRef(1);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [overChip, setOverChip] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName); setErr(null); setSel(new Set()); setSingle([]); setParent(null); setAssign(list.map(() => ""));
    // ข้อ 1: ลากโฟลเดอร์ที่มีโฟลเดอร์ย่อย → แยกหลายอัลบั้มตามโฟลเดอร์ย่อย
    const fg = folderGroups(list.map((f) => filePathOf(f)));
    if (fg) {
      setAlbums(fg.folders.map((f, i) => ({ key: i, name: bumpProductName(defaultName, i), hint: f, parent: null, skus: [] })));
      setAlbumOf(fg.index); nextKey.current = fg.folders.length; setSplit("album");
    } else {
      setAlbums([{ key: 0, name: defaultName, parent: null, skus: [] }]); setAlbumOf(list.map(() => 0)); nextKey.current = 1; setSplit(defaultSplit);
    }
    if (defaultParentCode) void findParentSkuByCode(defaultParentCode).then((p) => setParent((cur) => cur ?? p));
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  // เลือก Parent แล้ว → เดา SKU จากชื่อไฟล์/โฟลเดอร์ให้ก่อน
  useEffect(() => {
    if (!parent || !kids) return;
    setAssign(list.map((f) => guessSku(filePathOf(f), { id: parent.id, code: parent.code, name: parent.name }, kids)));
    setSingle([]); setSel(new Set());
  }, [parent, kids, list]);

  const thumbs = useMemo(() => list.slice(0, 120).map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [list]);
  useEffect(() => () => thumbs.forEach((u) => u && URL.revokeObjectURL(u)), [thumbs]);

  const isNew = mode === "new";
  const bySku = isNew && split === "sku" && !!parent && !!kids && kids.length > 0;
  const byAlbum = isNew && split === "album";
  const picking = bySku || byAlbum;          // กดรูปเพื่อเลือกได้
  const skuColor = useMemo(() => new Map((kids ?? []).map((k, i) => [k.code, COLORS[i % COLORS.length]])), [kids]);
  const albumIdx = useMemo(() => new Map(albums.map((a, i) => [a.key, i])), [albums]);
  const albumColor = (key: number) => COLORS[(albumIdx.get(key) ?? 0) % COLORS.length];
  const skuGroups = useMemo(() => (bySku ? splitGroups(assign, kids ?? [], name.trim() || defaultName) : []), [bySku, assign, kids, name, defaultName]);
  const albumCount = (key: number) => albumOf.filter((k) => k === key).length;

  const mq = useMarqueeSelect({
    disabled: !picking,
    getSelected: () => [...sel].map((i) => `d:${i}`),
    setSelected: (ids) => setSel(new Set(ids.map((s) => Number(s.slice(2))).filter(Number.isFinite))),
  });

  const takeSel = (extra: number[]) => {
    const idx = new Set([...sel, ...extra]);
    if (!idx.size) { setErr(t("กดเลือกรูปก่อน (หรือลากคลุม) แล้วค่อยกดชิป", "Pick photos first, then a chip")); return null; }
    setSel(new Set()); setErr(null);
    return idx;
  };
  const toSku = (code: string, extra: number[] = []) => { const idx = takeSel(extra); if (idx) setAssign((a) => a.map((c, i) => (idx.has(i) ? code : c))); };
  const toAlbum = (key: number, extra: number[] = []) => { const idx = takeSel(extra); if (idx) setAlbumOf((a) => a.map((k, i) => (idx.has(i) ? key : k))); };
  const toggleSel = (i: number) => setSel((s) => { const x = new Set(s); if (x.has(i)) x.delete(i); else x.add(i); return x; });
  const chipDrop = (id: string, apply: (extra: number[]) => void) => ({
    onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); setOverChip(id); } },
    onDragLeave: () => setOverChip(null),
    onDrop: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setOverChip(null); const i = Number(e.dataTransfer.getData(DRAG)); if (Number.isFinite(i)) apply([i]); },
  });
  const addAlbum = () => {
    const key = nextKey.current++;
    setAlbums((a) => [...a, { key, name: bumpProductName(a[0]?.name.trim() || defaultName, a.length), parent: null, skus: [] }]);
    if (sel.size) toAlbum(key);   // เลือกรูปไว้ = ย้ายเข้าอัลบั้มใหม่เลย
  };
  const removeAlbum = (key: number) => {
    const first = albums.find((a) => a.key !== key)?.key ?? 0;
    setAlbums((a) => a.filter((x) => x.key !== key));
    setAlbumOf((a) => a.map((k) => (k === key ? first : k)));
  };
  const patchAlbum = (key: number, p: Partial<AlbumGroup>) => setAlbums((a) => a.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const submit = () => {
    if (mode === "here") { onConfirm({ mode: "here" }); return; }
    if (byAlbum) {
      const used = albums.filter((a) => albumCount(a.key) > 0);
      if (used.some((a) => !a.name.trim())) { setErr(t("ตั้งชื่อทุกอัลบั้มที่มีรูปก่อน", "Name every album that has photos")); return; }
      onConfirm({ mode: "new", split, groups: used.map((a) => ({
        name: a.name.trim(), files: list.filter((_, i) => albumOf[i] === a.key), parentCode: a.parent?.code ?? null, skuCodes: a.parent ? a.skus : [],
      })) });
      return;
    }
    if (!name.trim()) { setErr(t("ใส่ชื่ออัลบั้มก่อน", "Enter an album name")); return; }
    if (split === "sku" && !parent) { setErr(t("แบบแยกตาม SKU ต้องเลือก Parent ก่อน", "Pick a Parent to split by SKU")); return; }
    const pc = parent?.code ?? null;
    if (bySku) {
      onConfirm({ mode: "new", split, groups: skuGroups.map((g) => ({ name: g.name, files: g.indexes.map((i) => list[i]), parentCode: pc, skuCodes: g.skuCode ? [g.skuCode] : [] })) });
      return;
    }
    onConfirm({ mode: "new", split, groups: [{ name: name.trim(), files: list, parentCode: pc, skuCodes: pc ? single : [] }] });
  };

  const opt = (on: boolean) => `flex w-full items-start gap-2.5 rounded-xl border p-3 text-left ${on ? "border-violet-500 bg-violet-50/60 ring-1 ring-violet-300" : "border-slate-200 bg-white hover:border-slate-300"}`;
  const usedAlbums = albums.filter((a) => albumCount(a.key) > 0).length;
  const confirmText = mode === "here" ? t(`ลง ${n} รูป`, `Add ${n}`)
    : bySku ? t(`สร้าง ${skuGroups.length} อัลบั้ม + ลงรูป`, `Create ${skuGroups.length} albums + add`)
    : byAlbum && usedAlbums > 1 ? t(`สร้าง ${usedAlbums} อัลบั้ม + ลงรูป`, `Create ${usedAlbums} albums + add`)
    : t("สร้างอัลบั้ม + ลงรูป", "Create album + add");
  const SPLITS: { v: DropSplit; th: string; en: string; subTh: string; subEn: string }[] = [
    { v: "one", th: "อัลบั้มเดียว", en: "One album", subTh: "ทุกรูปอยู่ด้วยกัน", subEn: "All photos together" },
    { v: "sku", th: "แยกตาม SKU", en: "By SKU", subTh: "รุ่นเดียวกัน คนละสี/ไซซ์", subEn: "Same model, per variant" },
    { v: "album", th: "แยกหลายอัลบั้ม", en: "Several albums", subTh: "คนละสินค้า เลือก Parent แยกกัน", subEn: "Different products" },
  ];

  return (
    <ERPModal open={open} onClose={onCancel} size={isNew && split !== "one" ? "lg" : "md"} defaultExpanded={false} storageKey="sample-drop-album"
      title={t(`ลง ${n} รูป — สร้างอัลบั้มใหม่?`, `Add ${n} image(s) — new album?`)} description={inside}
      footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
        {err && <span className="mr-auto text-[12px] text-rose-600">{err}</span>}
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={submit} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">{confirmText}</button>
      </div>}>
      <div className="space-y-2.5">
        <div role="radiogroup" className="space-y-2">
          <div role="radio" aria-checked={isNew} tabIndex={0} onClick={() => onMode("new")} onKeyDown={(e) => { if (e.key === " ") onMode("new"); }} className={`${opt(isNew)} cursor-pointer`}>
            <input type="radio" readOnly checked={isNew} className="mt-1" tabIndex={-1} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-800">{t("สร้างอัลบั้มใหม่", "New album")}</span>
              {byAlbum
                ? <span className="mt-1 block text-[12px] text-slate-500">{t("ตั้งชื่อ + เลือกสินค้าของแต่ละอัลบั้มด้านล่าง", "Name each album below")}</span>
                : <input value={name} onChange={(e) => { setName(e.target.value); setErr(null); onMode("new"); }} onFocus={() => onMode("new")}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} autoFocus maxLength={120}
                    aria-label={t("ชื่ออัลบั้มใหม่", "New album name")}
                    className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-violet-400 focus:outline-none" />}
              <span className="mt-1 block text-[12px] text-slate-500">{bySku ? t(`อยู่ใน ${inside} · ชื่ออัลบั้มแรก นับต่อให้เอง`, `Inside ${inside} · numbered on`) : t(`อยู่ใน ${inside}`, `Inside ${inside}`)}</span>
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

        {isNew && (
          <>
            <div>
              <div className="mb-1 text-[12px] text-slate-500">{t("แบ่งรูปยังไง?", "How to split?")}</div>
              <div role="radiogroup" className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {SPLITS.map((s) => (
                  <button key={s.v} type="button" role="radio" aria-checked={split === s.v} onClick={() => { setSplit(s.v); setSel(new Set()); setErr(null); }}
                    className={`rounded-xl border px-3 py-2 text-left ${split === s.v ? "border-violet-500 bg-violet-50/60 ring-2 ring-violet-200" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                    <span className="block text-sm font-medium text-slate-800">{t(s.th, s.en)}</span>
                    <span className="block text-[11.5px] text-slate-500">{t(s.subTh, s.subEn)}</span>
                  </button>
                ))}
              </div>
            </div>

            {split !== "album" && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <div className="text-[13px] text-slate-600">{split === "sku"
                  ? t("Parent SKU (ต้องเลือกสำหรับแบบนี้)", "Parent SKU (required here)")
                  : t("เชื่อมสินค้า (ไม่บังคับ) — รูปไปโชว์ที่หน้าสินค้าในส่วน \"รูป SAMPLE\"", "Link a product (optional) — photos show on its SAMPLE section")}</div>
                <ParentSkuPicker value={parent} onChange={(v) => { setParent(v); setErr(null); }} disableCreate />
                {split === "one" && parent && <SkuToggleChips parent={parent} kids={kids} value={single} onChange={setSingle} />}
                {split === "sku" && parent && !kids && <p className="text-[12px] text-slate-400">{t("กำลังโหลด SKU ลูก…", "Loading child SKUs…")}</p>}
                {split === "sku" && parent && kids && !kids.length && <p className="text-[12px] text-amber-700">{t("รุ่นนี้ยังไม่มี SKU ลูก — จะได้อัลบั้มเดียว (ทั้งรุ่น)", "No child SKUs — one album for the whole model")}</p>}
                {bySku && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {kids!.map((k) => (
                        <button key={k.id} type="button" onClick={() => toSku(k.code)} {...chipDrop(`s:${k.code}`, (x) => toSku(k.code, x))} className={chipCls(overChip === `s:${k.code}`)}>
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: skuColor.get(k.code) }} />{shortCode(parent?.code, k.code)}{k.name ? ` · ${k.name}` : ""}
                          <span className="text-slate-400">{assign.filter((c) => c === k.code).length || ""}</span>
                        </button>
                      ))}
                      <button type="button" onClick={() => toSku("")} {...chipDrop("s:", (x) => toSku("", x))} className={chipCls(overChip === "s:")}>{t("ไม่ระบุ SKU (ทั้งรุ่น)", "No SKU (whole model)")}<span className="text-slate-400">{assign.filter((c) => !c).length || ""}</span></button>
                    </div>
                    <p className="text-[12px] text-slate-400">{t("กดรูป หรือลากคลุมหลายรูป แล้วกดชิป SKU · หรือลากรูปไปวางบนชิป", "Click or box-select photos, then a SKU chip · or drag a photo onto a chip")}{sel.size ? ` · ${t(`เลือกอยู่ ${sel.size} รูป`, `${sel.size} selected`)}` : ""}</p>
                  </>
                )}
              </div>
            )}

            {byAlbum && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {albums.map((a) => (
                    <button key={a.key} type="button" onClick={() => toAlbum(a.key)} {...chipDrop(`a:${a.key}`, (x) => toAlbum(a.key, x))} className={chipCls(overChip === `a:${a.key}`)}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: albumColor(a.key) }} />{a.name.trim() || t("(ไม่มีชื่อ)", "(no name)")}
                      <span className="text-slate-400">{albumCount(a.key) || ""}</span>
                    </button>
                  ))}
                  <button type="button" onClick={addAlbum} className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-violet-300 px-2.5 text-[12px] text-violet-700 hover:bg-violet-50">
                    <Icon value="i:plus" />{t("อัลบั้ม", "Album")}</button>
                </div>
                <p className="text-[12px] text-slate-400">{t("กดรูป หรือลากคลุมหลายรูป แล้วกดชิปอัลบั้ม · ลากรูปไปวางบนชิปได้ · เลือกรูปไว้แล้วกด \"+ อัลบั้ม\" = ย้ายเข้าอัลบั้มใหม่เลย", "Pick photos then an album chip · drag onto a chip · \"+ Album\" with a selection moves them in")}{sel.size ? ` · ${t(`เลือกอยู่ ${sel.size} รูป`, `${sel.size} selected`)}` : ""}</p>
                <div className="space-y-2 pt-1">
                  {albums.map((a) => <AlbumRow key={a.key} g={a} color={albumColor(a.key)} count={albumCount(a.key)} canRemove={albums.length > 1}
                    onChange={(p) => patchAlbum(a.key, p)} onRemove={() => removeAlbum(a.key)} />)}
                </div>
              </div>
            )}
          </>
        )}

        <div ref={mq.ref} className={`relative grid max-h-[340px] gap-1.5 overflow-y-auto p-1 ${picking ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-6 sm:grid-cols-8"}`}>
          {list.slice(0, 120).map((f, i) => {
            const u = thumbs[i], on = sel.has(i);
            const skuCode = bySku ? assign[i] ?? "" : "";
            const ak = byAlbum ? albumOf[i] : undefined;
            const albumName = ak !== undefined ? albums.find((a) => a.key === ak)?.name.trim() : "";
            return (
              <div key={i} title={filePathOf(f)} data-select-id={picking ? `d:${i}` : undefined}
                draggable={picking}
                onDragStart={(e) => { e.dataTransfer.setData(DRAG, String(i)); e.dataTransfer.effectAllowed = "move"; }}
                onClick={() => picking && toggleSel(i)}
                className={`relative aspect-square overflow-hidden rounded-md border-2 bg-slate-50 ${picking ? "cursor-pointer" : ""} ${on ? "border-violet-500" : "border-transparent"}`}>
                {u
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={u} alt="" draggable={false} className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-slate-400"><Icon value="i:photo" /></span>}
                {skuCode && <span className="absolute inset-x-0.5 bottom-0.5 truncate rounded px-1 text-center text-[10.5px] font-medium text-white" style={{ background: skuColor.get(skuCode) ?? "#7c3aed" }}>{shortCode(parent?.code, skuCode)}</span>}
                {ak !== undefined && albums.length > 1 && <span className="absolute inset-x-0.5 bottom-0.5 truncate rounded px-1 text-center text-[10.5px] font-medium text-white" style={{ background: albumColor(ak) }}>{albumName || "—"}</span>}
                {on && <span className="absolute right-0.5 top-0.5 rounded-full bg-white text-base text-violet-600"><Icon value="i:circle-check" /></span>}
              </div>
            );
          })}
          {n > 120 && <span className="col-span-full text-[12px] text-slate-400">{t(`+ อีก ${n - 120} รูป (ไปตามที่เดา/กลุ่มแรก)`, `+${n - 120} more`)}</span>}
          {mq.box && <div style={mq.box} className="rounded border border-violet-400 bg-violet-400/10" />}
        </div>

        {bySku && skuGroups.length > 0 && (
          <div className="rounded-lg bg-violet-50/60 px-3 py-2 text-[12px] text-violet-900">
            {t(`จะสร้าง ${skuGroups.length} อัลบั้ม: `, `Will create ${skuGroups.length} albums: `)}
            {skuGroups.map((g) => `${g.name} (${g.skuCode ? shortCode(parent?.code, g.skuCode) : t("ทั้งรุ่น", "whole model")} · ${g.indexes.length})`).join(" · ")}
          </div>
        )}
        {byAlbum && (
          <div className="rounded-lg bg-violet-50/60 px-3 py-2 text-[12px] text-violet-900">
            {t(`จะสร้าง ${usedAlbums} อัลบั้ม: `, `Will create ${usedAlbums} albums: `)}
            {albums.filter((a) => albumCount(a.key) > 0).map((a) => `${a.name.trim() || "—"} (${albumCount(a.key)} รูป${a.parent ? ` · ${a.parent.code}` : ""})`).join(" · ")}
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
