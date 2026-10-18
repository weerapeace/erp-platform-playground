"use client";

/**
 * 📂 ช่อง "หมวดที่โชว์" ของ Section หมวดสินค้า (ตัวจัดหน้า / หน้าเว็บ) — แบบ A ที่เจ้าของเลือก (2026-10-18)
 *
 * - แถวเฉพาะหมวดที่เลือก (รูปย่อ + ชื่อ) · ลาก ⠿ เรียงลำดับ · ✕ เอาออก · ＋ เลือกหมวด = ป๊อปติ๊กแบบต้นไม้ + ค้นหา
 * - 🖼 = กางตั้ง "รูปบนการ์ด" ของหมวดนั้น เฉพาะ Section นี้: ⬆ อัปโหลด (หรือลากรูปมาวางที่แถว) · คลังรูป ·
 *   รูปสินค้าในหมวด · ↺ ใช้รูปหมวดเดิม (รูปจากแท็บ 📂 หมวดหมู่)
 * - ไม่เลือกเลย = ทุกหมวดหลัก (เหมือนเดิม)
 * เก็บ: <fieldKey> = รหัสหมวด[] (ช่องเดิม) · catImg = { รหัสหมวด: r2 key } (ช่องซ่อน categoryImages)
 *   → เว็บร้าน CategoriesView ใช้ catImg แทนรูปหมวด · เอาหมวดออก = ล้างรูปของหมวดนั้นด้วย
 * ของกลางที่ใช้: ERPModal · AssetPicker · ImageChooser (รูปสินค้าในหมวด) · useDragReorder · useFileDrop
 */
import { useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { AssetPicker } from "@/components/asset-picker";
import { ImageChooser, uploadToLibrary } from "@/components/website-canvas-media";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { useToast } from "@/components/toast";
import { categoryTree, categoryPathLabel, topCategories } from "@/lib/website-category-tree";

type Cat = { key: string; label: string; parent?: string | null; imageKey?: string | null; icon?: string };

/** ช่องซ่อนที่เก็บรูปรายหมวด (ต้องตรงกับ schema Section categories) */
const IMG_FIELD = "catImg";
const imgUrl = (k: string, w = 120) => `/api/r2-image?key=${encodeURIComponent(k)}&w=${w}`;
const btnCls = "w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-[11px] text-slate-700 hover:border-blue-400 disabled:opacity-50";

export function WebsiteCategoriesField({
  shopSlug,
  categories,
  value,
  item,
  onPatch,
  fieldKey,
}: {
  shopSlug: string;
  categories: Cat[];
  /** รหัสหมวดที่เลือก (เรียงตามลำดับที่โชว์) */
  value: string[];
  /** ค่าทั้ง Section (อ่าน catImg) */
  item: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
  fieldKey: string;
}) {
  const toast = useToast();
  // อ่านค่าล่าสุดเสมอ (อัปโหลดใช้เวลา ระหว่างนั้นอาจแก้อย่างอื่น)
  const itemRef = useRef(item);
  itemRef.current = item;
  const imgsOf = (it: Record<string, unknown>) => {
    const v = it[IMG_FIELD];
    return (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, string>;
  };
  const imgs = imgsOf(item);
  const byKey = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories]);
  const tops = useMemo(() => topCategories(categories), [categories]);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [chooserFor, setChooserFor] = useState<string | null>(null);
  const [libFor, setLibFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);

  const setCats = (next: string[]) => {
    // เอาหมวดออก = ล้างรูปที่ตั้งไว้ของหมวดนั้นด้วย (ไม่ให้ค้างในข้อมูล)
    const cur = imgsOf(itemRef.current);
    const keep = Object.fromEntries(Object.entries(cur).filter(([k]) => next.includes(k)));
    onPatch({ [fieldKey]: next, [IMG_FIELD]: keep });
  };
  const setImg = (key: string, r2: string | null) => {
    const n = { ...imgsOf(itemRef.current) };
    if (r2) n[key] = r2;
    else delete n[key];
    onPatch({ [IMG_FIELD]: n });
  };
  const toggle = (key: string) => setCats(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);

  const upload = async (key: string, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("เลือกได้เฉพาะไฟล์รูป");
    setBusy(key);
    try {
      const up = await uploadToLibrary(file);
      setImg(key, up.key);
      toast.success("ตั้งรูปบนการ์ดแล้ว — กดบันทึก/เผยแพร่เพื่อขึ้นเว็บ");
    } catch (e) {
      toast.error((e as Error).message || "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // 📥 ลากรูปจากเครื่องมาวางที่แถวหมวด = รูปบนการ์ดของหมวดนั้น
  const drop = useFileDrop((files, key) => void upload(key, files[0]), {
    accept: "image/",
    disabled: !!busy,
    onReject: () => toast.error("ลากมาได้เฉพาะไฟล์รูป"),
    onBusy: () => toast.warning("กำลังอัปโหลดอยู่ — รอสักครู่"),
  });
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => setCats(moveItem(value, from, to)));

  const labelOf = (key: string) => {
    const c = byKey.get(key);
    return c ? categoryPathLabel(categories, key) : key;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11px] text-slate-500">
          {value.length ? `${value.length} หมวด · เรียงตามนี้บนเว็บ` : `ยังไม่เลือก = โชว์ทุกหมวดหลัก (${tops.length})`}
        </span>
        <button type="button" onClick={() => setPickOpen(true)} disabled={!categories.length} className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">
          ＋ เลือกหมวด
        </button>
      </div>

      {!categories.length && <p className="text-xs text-slate-400">ร้านนี้ยังไม่มีหมวด — ตั้งที่แท็บ 📂 หมวดหมู่</p>}

      {/* ยังไม่เลือก: บอกว่าจะโชว์อะไร + ทางลัดเลือกหมวดหลักทั้งหมดมาจัดต่อ (เรียง/ตั้งรูป) */}
      {!value.length && tops.length > 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 px-2.5 py-2">
          <p className="text-[11px] text-slate-500 leading-relaxed">{tops.map((c) => c.label).join(" · ")}</p>
          <button type="button" onClick={() => setCats(tops.map((c) => c.key))} className="mt-1 text-[11px] text-blue-600 hover:underline">
            เลือกหมวดหลักทั้งหมดมาจัดเอง (เรียงลำดับ / ตั้งรูป)
          </button>
        </div>
      )}

      {value.length > 0 && (
        <div className="space-y-1.5">
          {value.map((k, i) => {
            const c = byKey.get(k);
            const own = imgs[k];
            const shownImg = own || c?.imageKey || null;
            const isOpen = openKey === k;
            return (
              <div key={k} {...rowProps(i)} {...drop.zone(k)} className={`relative rounded-lg border bg-white ${isOpen ? "border-blue-300" : "border-slate-200"} ${rowCls(i)}`}>
                <FileDropHint show={drop.over === k} label={`วางรูปเป็นรูปบนการ์ด ${c?.label ?? k}`} />
                <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                  <DragHandle {...handleProps(i)} />
                  <span className="w-8 h-8 shrink-0 rounded-md bg-slate-100 overflow-hidden flex items-center justify-center text-sm">
                    {shownImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imgUrl(shownImg, 80)} alt="" className="w-full h-full object-cover" draggable={false} />
                    ) : (
                      c?.icon || "📁"
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block truncate text-[13px] ${c ? "text-slate-800" : "text-red-600"}`}>{c ? c.label : `${k} (หมวดถูกลบแล้ว)`}</span>
                    {c?.parent && <span className="block truncate text-[10px] text-slate-400">ใน {byKey.get(c.parent)?.label ?? c.parent}</span>}
                  </span>
                  {own && <span className="shrink-0 rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">รูปเอง</span>}
                  {c && (
                    <button
                      type="button"
                      onClick={() => setOpenKey(isOpen ? null : k)}
                      aria-expanded={isOpen}
                      title="ตั้งรูปบนการ์ดของหมวดนี้ (เฉพาะ Section นี้)"
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-sm ${isOpen ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                    >
                      🖼
                    </button>
                  )}
                  <button type="button" onClick={() => setCats(value.filter((x) => x !== k))} title="เอาหมวดนี้ออกจาก Section" className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600">
                    ✕
                  </button>
                </div>

                {/* 🖼 รูปบนการ์ดของหมวดนี้ */}
                {isOpen && c && (
                  <div className="flex gap-2 border-t border-slate-100 px-2 py-2">
                    <span className="w-16 h-16 shrink-0 rounded-md bg-slate-100 overflow-hidden flex items-center justify-center text-xl">
                      {shownImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imgUrl(shownImg, 160)} alt="" className="w-full h-full object-cover" draggable={false} />
                      ) : (
                        c.icon || "📁"
                      )}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => {
                          uploadFor.current = k;
                          fileRef.current?.click();
                        }}
                        className={btnCls}
                      >
                        {busy === k ? "กำลังอัปโหลด…" : "⬆ อัปโหลด (หรือลากรูปมาวาง)"}
                      </button>
                      <button type="button" disabled={!!busy} onClick={() => setLibFor(k)} className={btnCls}>
                        🖼 เลือกจากคลังรูป
                      </button>
                      <button type="button" disabled={!!busy} onClick={() => setChooserFor(k)} className={btnCls}>
                        🛍 เลือกจากรูปสินค้าในหมวด
                      </button>
                      {own && (
                        <button type="button" onClick={() => setImg(k, null)} className="text-[11px] text-slate-500 hover:text-blue-600">
                          ↺ ใช้รูปหมวดเดิม{c.imageKey ? "" : " (ยังไม่มีรูป = ไอคอน)"}
                        </button>
                      )}
                      <p className="text-[10px] text-slate-400 leading-snug">
                        {own ? "รูปนี้ใช้เฉพาะ Section นี้" : c.imageKey ? "ตอนนี้ใช้รูปหมวดจากแท็บ 📂 หมวดหมู่" : "หมวดนี้ยังไม่มีรูป — ไม่ตั้ง = ใช้ไอคอน"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadFor.current && void upload(uploadFor.current, e.target.files?.[0])} />

      <CategoryPickModal open={pickOpen} onClose={() => setPickOpen(false)} categories={categories} value={value} onToggle={toggle} onSet={setCats} />

      {libFor && (
        <AssetPicker
          open
          onClose={() => setLibFor(null)}
          typeFilter="image"
          title={`เลือกรูปบนการ์ด — ${labelOf(libFor)}`}
          onSelect={(rows) => {
            const key = rows[0]?.r2_key;
            if (key) setImg(libFor, key);
            setLibFor(null);
          }}
        />
      )}
      <ImageChooser
        open={!!chooserFor}
        onClose={() => setChooserFor(null)}
        shopSlug={shopSlug}
        title={`รูปบนการ์ด — ${chooserFor ? labelOf(chooserFor) : ""}`}
        initialView="products"
        categoryKeys={chooserFor ? [chooserFor] : undefined}
        categoryLabel={chooserFor ? byKey.get(chooserFor)?.label : undefined}
        note={null}
        onPick={(p) => {
          if (chooserFor) setImg(chooserFor, p.key);
        }}
      />
    </div>
  );
}

/** ป๊อปติ๊กเลือกหมวด — ต้นไม้ (หมวดย่อยเยื้องใต้แม่) + ค้นหา · ติ๊กเพิ่ม = ต่อท้ายลำดับ */
function CategoryPickModal({
  open,
  onClose,
  categories,
  value,
  onToggle,
  onSet,
}: {
  open: boolean;
  onClose: () => void;
  categories: Cat[];
  value: string[];
  onToggle: (key: string) => void;
  onSet: (keys: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => categoryTree(categories), [categories]);
  const t = q.trim().toLowerCase();
  const shown = t ? rows.filter((r) => `${r.cat.label} ${r.cat.key}`.toLowerCase().includes(t)) : rows;
  const tops = rows.filter((r) => r.depth === 0).map((r) => r.cat.key);
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title="＋ เลือกหมวดที่โชว์"
      size="sm"
      defaultExpanded={false}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs text-slate-500">{value.length ? `เลือกแล้ว ${value.length} หมวด` : "ยังไม่เลือก = ทุกหมวดหลัก"}</span>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">
            เสร็จ
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ค้นหาหมวด" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none" />
        <div className="flex flex-wrap gap-2 text-[11px]">
          <button type="button" onClick={() => onSet([...value, ...tops.filter((k) => !value.includes(k))])} className="text-blue-600 hover:underline">
            ติ๊กหมวดหลักทั้งหมด
          </button>
          {value.length > 0 && (
            <button type="button" onClick={() => onSet([])} className="text-slate-500 hover:text-red-600">
              ล้างที่เลือก (กลับไปโชว์ทุกหมวดหลัก)
            </button>
          )}
        </div>
        <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-100">
          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">ไม่พบหมวดที่ค้นหา</p>
          ) : (
            shown.map(({ cat, depth }) => {
              const i = value.indexOf(cat.key);
              return (
                <label key={cat.key} className={`flex cursor-pointer items-center gap-2 border-b border-slate-50 py-1.5 pr-2 hover:bg-slate-50 ${depth && !t ? "pl-8" : "pl-2"}`}>
                  <input type="checkbox" checked={i >= 0} onChange={() => onToggle(cat.key)} className="h-4 w-4 accent-blue-600" />
                  <span className={`flex-1 truncate ${depth ? "text-[13px] text-slate-600" : "text-sm font-medium text-slate-800"}`}>
                    {depth && !t ? "↳ " : ""}
                    {t && depth ? categoryPathLabel(categories, cat.key) : cat.label}
                  </span>
                  {i >= 0 && <span className="shrink-0 rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white tabular-nums">{i + 1}</span>}
                </label>
              );
            })
          )}
        </div>
      </div>
    </ERPModal>
  );
}
