"use client";
/**
 * ป๊อป "ลง N รูป — สร้างอัลบั้มใหม่?" (หน้า SAMPLE Images · เจ้าของเลือกจาก widget 2026-11-17)
 * เด้งตอนลากรูปมาวางขณะเปิดอัลบั้มอยู่ · ทางเลือก: สร้างอัลบั้มย่อยใหม่ หรือ ใส่ในอัลบั้มนี้เลย (จำทางล่าสุด · pref sample_images_drop_mode)
 * "แบ่งรูปยังไง?" 3 แบบ เห็นตั้งแต่เปิดป๊อป (จำแบบล่าสุด · pref sample_images_drop_split):
 *   - อัลบั้มเดียว = 1 อัลบั้ม เชื่อม Parent + SKU ที่ติ๊กได้ (ไม่ติ๊ก = ทั้งรุ่น)
 *   - แยกตาม SKU = รุ่นเดียวกัน · เลือก Parent แล้วกดรูป→กดชิป SKU (ลากรูปไปวางบนชิปได้) · เดา SKU จากชื่อไฟล์ให้ก่อน
 *     อัลบั้มละ SKU ชื่อ Product 005, 006… · ไม่ระบุ SKU = อัลบั้ม "ทั้งรุ่น"
 *   - แยกหลายอัลบั้ม (จัดรูปเยอะ · ข้อเสนอ 1-4 รอบ 2026-11-17):
 *     · หน้าจอ 2 ฝั่ง: รายการอัลบั้มแถบซ้าย (มือถืออยู่บน) ตั้งชื่อ/Parent/SKU ในแถบ · รูปเล็ก ปรับด้วย Ctrl+ลูกกลิ้ง
 *     · รูปเริ่มที่กอง "ยังไม่จัด" (รูปที่ไม่ได้จัด = ลงอัลบั้มที่เปิดอยู่ตรง ๆ)
 *     · Shift+คลิก เลือกเป็นช่วง · "＋ อัลบั้มใหม่จากที่เลือก" (ปุ่ม N) = อัลบั้มใหม่เลขถัดไป
 *     · "แบ่งตามเวลาถ่าย" = ห่างกันเกิน 2 นาที ตัดเป็นอัลบั้มใหม่ (เวลาไฟล์)
 *     · ลากโฟลเดอร์ที่มีโฟลเดอร์ย่อย → แยกตามโฟลเดอร์ย่อยให้เอง
 *   - ลากคลุมเลือกหลายรูปในป๊อปได้ (ของกลาง useMarqueeSelect)
 * ตรรกะแบ่งกลุ่ม/เดา = lib/sample-sku-split (เทสต์)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { ParentSkuPicker, findParentSkuByCode, type ParentSkuPickerValue } from "@/components/pickers";
import { filePathOf } from "@/components/file-drop";
import { useGalleryColumns } from "@/components/gallery-columns";
import { useMarqueeSelect } from "@/lib/use-marquee-select";
import { bumpProductName, folderGroups, guessSku, splitGroups, timeGroups } from "@/lib/sample-sku-split";
import { loadChildSkus, type ChildSku } from "./api";

export type DropMode = "new" | "here";
export type DropSplit = "one" | "sku" | "album";
export type DropGroup = { name: string; files: File[]; parentCode: string | null; skuCodes: string[] };
/** rest = รูปที่ยังไม่จัด → ลงอัลบั้มที่เปิดอยู่ตรง ๆ */
export type DropPlan = { mode: "here" } | { mode: "new"; split: DropSplit; groups: DropGroup[]; rest?: File[] };

const DRAG = "application/x-sample-drop-photo";
const COLORS = ["#ED93B1", "#85B7EB", "#97C459", "#EF9F27", "#AFA9EC", "#5DCAA5", "#F0997B", "#B4B2A9"];
const MAX_THUMBS = 400;
const UNSORTED = -1;
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

/** การ์ดอัลบั้มในแถบซ้าย (แบบแยกหลายอัลบั้ม) — กด/ลากรูปมาวาง = ใส่รูปที่เลือก · ชื่อ + Parent + SKU ของอัลบั้มนั้น */
function AlbumSideCard({ g, color, count, previews, selCount, dropOver, drop, onPut, onChange, onRemove }: {
  g: AlbumGroup; color: string; count: number;
  /** รูปตัวอย่าง (4 รูปแรกของอัลบั้ม) — รู้ทันทีว่าอัลบั้มไหนคือสินค้าอะไร */
  previews: (string | null)[];
  selCount: number; dropOver: boolean;
  drop: { onDragOver: (e: DragEvent) => void; onDragLeave: () => void; onDrop: (e: DragEvent) => void };
  onPut: () => void; onChange: (p: Partial<AlbumGroup>) => void; onRemove: () => void;
}) {
  const t = useT();
  const kids = useKids(g.parent);
  const [editLink, setEditLink] = useState(false);   // ส่วนเชื่อมสินค้า: ย่อเป็นบรรทัดเดียว กด "แก้" ถึงกาง
  const skuShort = g.parent ? g.skus.map((c) => shortCode(g.parent!.code, c)).join(", ") : "";
  return (
    <div {...drop} className={`space-y-2 rounded-xl border bg-white p-2.5 ${dropOver ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200"}`}>
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
        <input value={g.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={120} aria-label={t("ชื่ออัลบั้ม", "Album name")}
          className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-white px-1 text-sm font-semibold text-slate-800 hover:border-slate-200 focus:border-violet-400 focus:outline-none" />
        <span className="shrink-0 rounded-full bg-violet-100 px-2 text-[12px] font-semibold tabular-nums text-violet-800">{count}</span>
        <button type="button" onClick={onRemove} title={t("เอาอัลบั้มนี้ออก (รูปกลับไปกองยังไม่จัด)", "Remove (photos go back to unsorted)")}
          className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Icon value="i:x" /></button>
      </div>
      {count > 0 ? (
        <div className="flex items-center gap-1">
          {previews.map((u, i) => (
            <span key={i} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
              {u
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={u} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
                : <span className="absolute inset-0 flex items-center justify-center text-slate-300"><Icon value="i:photo" /></span>}
            </span>
          ))}
          {count > previews.length && <span className="pl-0.5 text-[12px] text-slate-500">+{count - previews.length}</span>}
        </div>
      ) : <p className="text-[12px] text-slate-400">{t("ว่าง — ลากรูปมาวางที่นี่", "Empty — drop photos here")}</p>}
      {g.hint && <p className="text-[11px] text-slate-400">{t(`จากโฟลเดอร์ ${g.hint}`, `From folder ${g.hint}`)}</p>}
      {editLink ? (
        <div className="space-y-1.5 border-t border-dashed border-slate-200 pt-2">
          <ParentSkuPicker value={g.parent} onChange={(v) => onChange({ parent: v, skus: [] })} placeholder={t("Parent SKU (ไม่บังคับ)", "Parent SKU (optional)")} disableCreate />
          {g.parent && <SkuToggleChips parent={g.parent} kids={kids} value={g.skus} onChange={(skus) => onChange({ skus })} />}
          <button type="button" onClick={() => setEditLink(false)} className="text-[12px] font-medium text-violet-700 hover:underline">{t("เสร็จ", "Done")}</button>
        </div>
      ) : (
        <div className="flex items-start gap-2 border-t border-dashed border-slate-200 pt-1.5 text-[12px]">
          <span className="min-w-0 flex-1 text-slate-500">
            {g.parent
              ? <>{t("สินค้า: ", "Product: ")}<b className="font-medium text-slate-800">{g.parent.code}</b> <span className="text-slate-600">{g.parent.name}</span>{t(` · SKU ${skuShort || "ทั้งรุ่น"}`, ` · SKU ${skuShort || "all"}`)}</>
              : t("ยังไม่เชื่อมสินค้า", "No product linked")}
          </span>
          <button type="button" onClick={() => setEditLink(true)} className="shrink-0 font-medium text-violet-700 hover:underline">{g.parent ? t("แก้", "Edit") : t("＋ เชื่อม Parent", "＋ Link")}</button>
        </div>
      )}
      {selCount > 0 && (
        <button type="button" onClick={onPut} className="flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-violet-600 text-[12px] font-medium text-white hover:bg-violet-700">
          <Icon value="i:transfer-out" />{t(`ใส่ ${selCount} รูปที่เลือก`, `Put ${selCount} selected`)}</button>
      )}
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
  /** แบบแบ่งที่ใช้ล่าสุด */
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
  const [albumOf, setAlbumOf] = useState<number[]>([]);     // รูปที่ i → key อัลบั้ม (UNSORTED = ยังไม่จัด)
  const [onlyUnsorted, setOnlyUnsorted] = useState(true);
  const nextKey = useRef(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const lastClick = useRef<number | null>(null);
  const [overChip, setOverChip] = useState<string | null>(null);
  const gallery = useGalleryColumns("sample-drop-sort", 6, "0.375rem", { options: [4, 5, 6, 8] as const, ctrlWheel: true });

  useEffect(() => {
    if (!open) return;
    setName(defaultName); setErr(null); setSel(new Set()); setSingle([]); setParent(null); setAssign(list.map(() => "")); setOnlyUnsorted(true);
    lastClick.current = null;
    // ลากโฟลเดอร์ที่มีโฟลเดอร์ย่อย → แยกหลายอัลบั้มตามโฟลเดอร์ย่อย
    const fg = folderGroups(list.map((f) => filePathOf(f)));
    if (fg) {
      setAlbums(fg.folders.map((f, i) => ({ key: i, name: bumpProductName(defaultName, i), hint: f, parent: null, skus: [] })));
      setAlbumOf(fg.index); nextKey.current = fg.folders.length; setSplit("album"); setOnlyUnsorted(false);
    } else {
      setAlbums([]); setAlbumOf(list.map(() => UNSORTED)); nextKey.current = 0; setSplit(defaultSplit);
    }
    if (defaultParentCode) void findParentSkuByCode(defaultParentCode).then((p) => setParent((cur) => cur ?? p));
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  // เลือก Parent แล้ว → เดา SKU จากชื่อไฟล์/โฟลเดอร์ให้ก่อน
  useEffect(() => {
    if (!parent || !kids) return;
    setAssign(list.map((f) => guessSku(filePathOf(f), { id: parent.id, code: parent.code, name: parent.name }, kids)));
    setSingle([]); setSel(new Set());
  }, [parent, kids, list]);

  const thumbs = useMemo(() => list.slice(0, MAX_THUMBS).map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [list]);
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
  const previewsOf = (key: number) => albumOf.flatMap((k, i) => (k === key ? [thumbs[i] ?? null] : [])).slice(0, 4);
  const unsortedCount = albumOf.filter((k) => k === UNSORTED).length;
  // รูปที่โชว์ในกริด (แบบแยกหลายอัลบั้ม + กรอง "ยังไม่จัด" = เฉพาะกองยังไม่จัด)
  const visible = useMemo(() => {
    const all = list.slice(0, MAX_THUMBS).map((_, i) => i);
    return byAlbum && onlyUnsorted ? all.filter((i) => albumOf[i] === UNSORTED) : all;
  }, [list, byAlbum, onlyUnsorted, albumOf]);

  const mq = useMarqueeSelect({
    disabled: !picking,
    getSelected: () => [...sel].map((i) => `d:${i}`),
    setSelected: (ids) => setSel(new Set(ids.map((s) => Number(s.slice(2))).filter(Number.isFinite))),
  });
  const mqRef = mq.ref, wheelRef = gallery.wheelRef;
  const gridRef = useCallback((el: HTMLDivElement | null) => { mqRef(el); wheelRef(el); }, [mqRef, wheelRef]);

  const takeSel = (extra: number[]) => {
    const idx = new Set([...sel, ...extra]);
    if (!idx.size) { setErr(t("กดเลือกรูปก่อน (หรือลากคลุม) แล้วค่อยกดชิป", "Pick photos first, then a chip")); return null; }
    setSel(new Set()); setErr(null); lastClick.current = null;
    return idx;
  };
  const toSku = (code: string, extra: number[] = []) => { const idx = takeSel(extra); if (idx) setAssign((a) => a.map((c, i) => (idx.has(i) ? code : c))); };
  const toAlbum = (key: number, extra: number[] = []) => { const idx = takeSel(extra); if (idx) setAlbumOf((a) => a.map((k, i) => (idx.has(i) ? key : k))); };
  // คลิกรูป: สลับเลือก · Shift = เลือกเป็นช่วง (ตามลำดับที่เห็นในกริด)
  const clickPhoto = (i: number, shift: boolean) => {
    const from = lastClick.current;
    if (shift && from !== null) {
      const a = visible.indexOf(from), b = visible.indexOf(i);
      if (a >= 0 && b >= 0) {
        const range = visible.slice(Math.min(a, b), Math.max(a, b) + 1);
        setSel((s) => new Set([...s, ...range]));
        lastClick.current = i;
        return;
      }
    }
    setSel((s) => { const x = new Set(s); if (x.has(i)) x.delete(i); else x.add(i); return x; });
    lastClick.current = i;
  };
  const chipDrop = (id: string, apply: (extra: number[]) => void) => ({
    onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); setOverChip(id); } },
    onDragLeave: () => setOverChip(null),
    onDrop: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setOverChip(null); const i = Number(e.dataTransfer.getData(DRAG)); if (Number.isFinite(i)) apply([i]); },
  });
  const newName = (count: number) => bumpProductName(albums[0]?.name.trim() || defaultName, count);
  // ＋ อัลบั้มใหม่จากที่เลือก (ปุ่ม N) — เลขถัดไปให้เอง
  const newAlbumFromSel = () => {
    if (!sel.size) { setErr(t("เลือกรูปก่อน แล้วค่อยกดสร้างอัลบั้ม", "Pick photos first")); return; }
    const key = nextKey.current++;
    setAlbums((a) => [...a, { key, name: newName(a.length), parent: null, skus: [] }]);
    toAlbum(key);
  };
  // แบ่งตามเวลาถ่าย — แทนที่การจัดเดิมทั้งหมด
  const byTime = () => {
    const g = timeGroups(list.map((f) => f.lastModified));
    if (!g) { setErr(t("ไฟล์ชุดนี้ไม่มีเวลาถ่ายที่ใช้แบ่งได้ (เวลาเท่ากันหมด) — จัดเองแทน", "No usable shooting times in these files")); return; }
    const count = Math.max(...g) + 1;
    setAlbums(Array.from({ length: count }, (_, i) => ({ key: i, name: bumpProductName(defaultName, i), parent: null, skus: [] })));
    setAlbumOf(g); nextKey.current = count; setSel(new Set()); setOnlyUnsorted(false); setErr(null);
  };
  const removeAlbum = (key: number) => {
    setAlbums((a) => a.filter((x) => x.key !== key));
    setAlbumOf((a) => a.map((k) => (k === key ? UNSORTED : k)));
  };
  const patchAlbum = (key: number, p: Partial<AlbumGroup>) => setAlbums((a) => a.map((x) => (x.key === key ? { ...x, ...p } : x)));

  // ปุ่ม N = อัลบั้มใหม่จากที่เลือก (ไม่ทำงานตอนพิมพ์ในช่อง)
  const newRef = useRef(newAlbumFromSel); newRef.current = newAlbumFromSel;
  useEffect(() => {
    if (!open || !byAlbum) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyN" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault(); newRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, byAlbum]);

  const submit = () => {
    if (mode === "here") { onConfirm({ mode: "here" }); return; }
    if (byAlbum) {
      const used = albums.filter((a) => albumCount(a.key) > 0);
      if (!used.length) { onConfirm({ mode: "here" }); return; }   // ยังไม่จัดเลย = ลงอัลบั้มนี้ตรง ๆ
      if (used.some((a) => !a.name.trim())) { setErr(t("ตั้งชื่อทุกอัลบั้มที่มีรูปก่อน", "Name every album that has photos")); return; }
      onConfirm({ mode: "new", split, rest: list.filter((_, i) => albumOf[i] === UNSORTED), groups: used.map((a) => ({
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
    : byAlbum ? (usedAlbums ? t(`สร้าง ${usedAlbums} อัลบั้ม + ลงรูป`, `Create ${usedAlbums} albums + add`) : t(`ลง ${n} รูปในอัลบั้มนี้`, `Add ${n} here`))
    : t("สร้างอัลบั้ม + ลงรูป", "Create album + add");
  const SPLITS: { v: DropSplit; th: string; en: string; subTh: string; subEn: string }[] = [
    { v: "one", th: "อัลบั้มเดียว", en: "One album", subTh: "ทุกรูปอยู่ด้วยกัน", subEn: "All photos together" },
    { v: "sku", th: "แยกตาม SKU", en: "By SKU", subTh: "รุ่นเดียวกัน คนละสี/ไซซ์", subEn: "Same model, per variant" },
    { v: "album", th: "แยกหลายอัลบั้ม", en: "Several albums", subTh: "คนละสินค้า จัดรูปเยอะ", subEn: "Different products" },
  ];

  const photo = (i: number) => {
    const u = thumbs[i], on = sel.has(i), f = list[i];
    const skuCode = bySku ? assign[i] ?? "" : "";
    const ak = byAlbum ? albumOf[i] : undefined;
    return (
      <div key={i} title={filePathOf(f)} data-select-id={picking ? `d:${i}` : undefined}
        draggable={picking}
        onDragStart={(e) => { e.dataTransfer.setData(DRAG, String(i)); e.dataTransfer.effectAllowed = "move"; }}
        onClick={(e) => picking && clickPhoto(i, e.shiftKey)}
        // ช่องจัตุรัสเท่ากันทุกรูป (pt-[100%] — aspect-ratio ในกริดที่สูงจำกัดถูกบีบจนรูปโดนตัด · เจ้าของแจ้ง 2026-11-17) · รูปเต็มใบไม่ตัดขอบ พื้นขาว
        className={`relative w-full select-none overflow-hidden rounded-md border-2 bg-white pt-[100%] ${picking ? "cursor-pointer" : ""} ${on ? "border-violet-500" : "border-slate-200"}`}>
        {u
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={u} alt="" draggable={false} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-0.5" />
          : <span className="absolute inset-0 flex items-center justify-center text-slate-400"><Icon value="i:photo" /></span>}
        {skuCode && <span className="absolute inset-x-0.5 bottom-0.5 truncate rounded px-1 text-center text-[10.5px] font-medium text-white" style={{ background: skuColor.get(skuCode) ?? "#7c3aed" }}>{shortCode(parent?.code, skuCode)}</span>}
        {ak !== undefined && ak !== UNSORTED && <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ background: albumColor(ak) }} title={albums.find((a) => a.key === ak)?.name} />}
        {on && <span className="absolute right-0.5 top-0.5 rounded-full bg-white text-base text-violet-600"><Icon value="i:circle-check" /></span>}
      </div>
    );
  };

  return (
    <ERPModal open={open} onClose={onCancel} size={byAlbum ? "xl" : isNew && split !== "one" ? "lg" : "md"} defaultExpanded={false} storageKey={byAlbum ? "sample-drop-sort" : "sample-drop-album"}
      title={byAlbum ? t(`ลง ${n} รูป — จัดลงอัลบั้ม`, `Add ${n} image(s) — sort into albums`) : t(`ลง ${n} รูป — สร้างอัลบั้มใหม่?`, `Add ${n} image(s) — new album?`)} description={inside}
      footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
        {err && <span className="mr-auto text-[12px] text-rose-600">{err}</span>}
        {!err && byAlbum && <span className="mr-auto text-[12px] text-slate-500">
          {t(`จัดแล้ว ${n - unsortedCount}/${n}`, `Sorted ${n - unsortedCount}/${n}`)}{unsortedCount ? t(` · ยังไม่จัด ${unsortedCount} รูป → ลงใน ${inside} ตรง ๆ`, ` · ${unsortedCount} unsorted → go into ${inside}`) : ""}
        </span>}
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={submit} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">{confirmText}</button>
      </div>}>
      <div className="space-y-2.5">
        {!byAlbum && (
          <div role="radiogroup" className="space-y-2">
            <div role="radio" aria-checked={isNew} tabIndex={0} onClick={() => onMode("new")} onKeyDown={(e) => { if (e.key === " ") onMode("new"); }} className={`${opt(isNew)} cursor-pointer`}>
              <input type="radio" readOnly checked={isNew} className="mt-1" tabIndex={-1} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-800">{t("สร้างอัลบั้มใหม่", "New album")}</span>
                <input value={name} onChange={(e) => { setName(e.target.value); setErr(null); onMode("new"); }} onFocus={() => onMode("new")}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} autoFocus maxLength={120}
                  aria-label={t("ชื่ออัลบั้มใหม่", "New album name")}
                  className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-violet-400 focus:outline-none" />
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
        )}

        {isNew && (
          <div>
            {!byAlbum && <div className="mb-1 text-[12px] text-slate-500">{t("แบ่งรูปยังไง?", "How to split?")}</div>}
            <div role="radiogroup" className={byAlbum ? "flex flex-wrap gap-1.5" : "grid grid-cols-1 gap-1.5 sm:grid-cols-3"}>
              {SPLITS.map((s) => (
                <button key={s.v} type="button" role="radio" aria-checked={split === s.v} onClick={() => { setSplit(s.v); setSel(new Set()); setErr(null); }}
                  className={byAlbum
                    ? `h-7 rounded-full border px-3 text-[12px] ${split === s.v ? "border-violet-500 bg-violet-50 font-medium text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`
                    : `rounded-xl border px-3 py-2 text-left ${split === s.v ? "border-violet-500 bg-violet-50/60 ring-2 ring-violet-200" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  {byAlbum ? t(s.th, s.en) : <>
                    <span className="block text-sm font-medium text-slate-800">{t(s.th, s.en)}</span>
                    <span className="block text-[11.5px] text-slate-500">{t(s.subTh, s.subEn)}</span>
                  </>}
                </button>
              ))}
            </div>
          </div>
        )}

        {isNew && split !== "album" && (
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
                <p className="text-[12px] text-slate-400">{t("กดรูป (Shift = เป็นช่วง) หรือลากคลุมหลายรูป แล้วกดชิป SKU · หรือลากรูปไปวางบนชิป", "Click (Shift = range) or box-select photos, then a SKU chip")}{sel.size ? ` · ${t(`เลือกอยู่ ${sel.size} รูป`, `${sel.size} selected`)}` : ""}</p>
              </>
            )}
          </div>
        )}

        {byAlbum ? (
          // ── จัดรูปเยอะ: แถบอัลบั้ม (ซ้าย · มือถืออยู่บน) + กริดรูปเล็ก ──
          <div className="grid gap-3 sm:grid-cols-[290px_minmax(0,1fr)]">
            <aside className="max-h-[230px] space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-2 sm:max-h-[62vh]">
              {albums.length === 0 && <p className="p-1 text-[12px] text-slate-500">{t("ยังไม่มีอัลบั้ม — เลือกรูปแล้วกด \"＋ อัลบั้มใหม่จากที่เลือก\" หรือ \"แบ่งตามเวลาถ่าย\"", "No albums yet — pick photos then \"＋ New album from selection\"")}</p>}
              {albums.map((a) => (
                <AlbumSideCard key={a.key} g={a} color={albumColor(a.key)} count={albumCount(a.key)} previews={previewsOf(a.key)} selCount={sel.size}
                  dropOver={overChip === `a:${a.key}`} drop={chipDrop(`a:${a.key}`, (x) => toAlbum(a.key, x))}
                  onPut={() => toAlbum(a.key)} onChange={(p) => patchAlbum(a.key, p)} onRemove={() => removeAlbum(a.key)} />
              ))}
            </aside>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setOnlyUnsorted(true)} className={chipCls(onlyUnsorted)}>{t("ยังไม่จัด", "Unsorted")} <b>{unsortedCount}</b></button>
                <button type="button" onClick={() => setOnlyUnsorted(false)} className={chipCls(!onlyUnsorted)}>{t("ทั้งหมด", "All")} {n}</button>
                <button type="button" onClick={byTime} title={t("รูปที่ถ่ายห่างกันเกิน 2 นาที = คนละสินค้า (ใช้เวลาในไฟล์) · แทนที่การจัดตอนนี้", "Photos more than 2 min apart = different products")}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-violet-200 bg-white px-2.5 text-[12px] text-violet-700 hover:bg-violet-50"><Icon value="i:clock" />{t("แบ่งตามเวลาถ่ายให้ก่อน", "Split by shooting time")}</button>
                <span className="ml-auto hidden text-[11px] text-slate-400 sm:inline">{t("Ctrl + ลูกกลิ้ง = ย่อ/ขยายรูป", "Ctrl + wheel = resize")}</span>
              </div>
              <div ref={gridRef} style={gallery.gridStyle} className="relative max-h-[52vh] content-start overflow-y-auto rounded-lg p-1 max-sm:!grid-cols-4">
                {visible.map(photo)}
                {visible.length === 0 && <p className="col-span-full py-8 text-center text-[13px] text-emerald-700">{t("จัดครบทุกรูปแล้ว", "All photos sorted")}</p>}
                {n > MAX_THUMBS && <span className="col-span-full text-[12px] text-slate-400">{t(`+ อีก ${n - MAX_THUMBS} รูป (โชว์ไม่หมด · ไปกองยังไม่จัด)`, `+${n - MAX_THUMBS} more`)}</span>}
                {mq.box && <div style={mq.box} className="rounded border border-violet-400 bg-violet-400/10" />}
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[12px]">
                <span className="text-slate-600">{t(`เลือก ${sel.size} รูป`, `${sel.size} selected`)}</span>
                <button type="button" onClick={newAlbumFromSel} disabled={!sel.size}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-violet-600 px-3 font-medium text-white hover:bg-violet-700 disabled:opacity-40"><Icon value="i:plus" />{t("อัลบั้มใหม่จากที่เลือก", "New album from selection")}</button>
                <kbd className="hidden rounded border border-slate-300 bg-white px-1.5 text-[11px] text-slate-500 sm:inline">N</kbd>
                {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} className="text-slate-500 underline-offset-2 hover:underline">{t("ล้างที่เลือก", "Clear")}</button>}
                <span className="hidden text-slate-400 md:inline">{t("· Shift+คลิก = เลือกเป็นช่วง · ลากคลุม/ลากรูปไปวางบนอัลบั้มซ้ายได้", "· Shift+click = range · drag onto an album")}</span>
              </div>
            </div>
          </div>
        ) : (
          <div ref={mq.ref} className={`relative grid max-h-[340px] gap-1.5 overflow-y-auto p-1 ${picking ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-6 sm:grid-cols-8"}`}>
            {list.slice(0, 120).map((_, i) => photo(i))}
            {n > 120 && <span className="col-span-full text-[12px] text-slate-400">{t(`+ อีก ${n - 120} รูป (ไปตามที่เดา/ทั้งรุ่น)`, `+${n - 120} more`)}</span>}
            {mq.box && <div style={mq.box} className="rounded border border-violet-400 bg-violet-400/10" />}
          </div>
        )}

        {bySku && skuGroups.length > 0 && (
          <div className="rounded-lg bg-violet-50/60 px-3 py-2 text-[12px] text-violet-900">
            {t(`จะสร้าง ${skuGroups.length} อัลบั้ม: `, `Will create ${skuGroups.length} albums: `)}
            {skuGroups.map((g) => `${g.name} (${g.skuCode ? shortCode(parent?.code, g.skuCode) : t("ทั้งรุ่น", "whole model")} · ${g.indexes.length})`).join(" · ")}
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
