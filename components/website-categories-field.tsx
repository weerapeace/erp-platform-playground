"use client";

/**
 * 📂 ช่อง "หมวดที่โชว์" ของ Section หมวดสินค้า (ตัวจัดหน้า / หน้าเว็บ) — แบบ A ที่เจ้าของเลือก (2026-10-18)
 *
 * - แถวเฉพาะหมวดที่เลือก (รูปย่อ + ชื่อ) · ลาก ⠿ เรียงลำดับ · ✕ เอาออก · ＋ เลือกหมวด = ป๊อปติ๊กแบบต้นไม้ + ค้นหา
 * - 🖼 = กางตั้ง "รูปบนการ์ด" ของหมวดนั้น เฉพาะ Section นี้: ⬆ อัปโหลด (หรือลากรูปมาวางที่แถว) · คลังรูป ·
 *   รูปสินค้าในหมวด · ↺ ใช้รูปหมวดเดิม (รูปจากแท็บ 📂 หมวดหมู่)
 * - ✏️ = แก้ "ชื่อที่โชว์" ของหมวดนั้น เฉพาะ Section นี้ (ว่าง = ชื่อจากแท็บ 📂 หมวดหมู่)
 * - ไม่เลือกเลย = ทุกหมวดหลัก (เหมือนเดิม)
 * - 🔁 (เมื่อเปิด "เปลี่ยนรูปเมื่อเอาเมาส์วาง" + แบบการ์ดรูปใหญ่) = ในแผง 🖼 มีรายการ "รูปที่วน" ของหมวดนั้น: ＋ อัปโหลด/คลัง/รูปสินค้า · ◀ เลื่อน · ✕ เอาออก
 *   ไม่ตั้ง = เว็บใช้รูปสินค้าในหมวด 4 รูปแรก
 * เก็บ: <fieldKey> = รหัสหมวด[] (ช่องเดิม) · catImg = { รหัสหมวด: r2 key } (ช่องซ่อน categoryImages) · catName = { รหัสหมวด: ชื่อ } (categoryNames)
 *   · cycleImg = { รหัสหมวด: r2 key[] } (categoryImageLists)
 *   → เว็บร้าน CategoriesView ใช้ catImg/catName แทนรูป/ชื่อหมวด · เอาหมวดออก = ล้างรูป/ชื่อของหมวดนั้นด้วย
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
import { useT } from "@/components/i18n";

type Cat = { key: string; label: string; parent?: string | null; imageKey?: string | null; icon?: string };

/** ช่องซ่อนที่เก็บรูปรายหมวด (ต้องตรงกับ schema Section categories) */
const IMG_FIELD = "catImg";
const NAME_FIELD = "catName";
const CYCLE_FIELD = "cycleImg";
/** รูปวนสูงสุดต่อหมวด (ตรงกับตัวทำความสะอาด categoryImageLists) */
const CYCLE_MAX = 8;
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
  const t = useT();
  // อ่านค่าล่าสุดเสมอ (อัปโหลดใช้เวลา ระหว่างนั้นอาจแก้อย่างอื่น)
  const itemRef = useRef(item);
  itemRef.current = item;
  const imgsOf = (it: Record<string, unknown>) => {
    const v = it[IMG_FIELD];
    return (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, string>;
  };
  const imgs = imgsOf(item);
  const namesOf = (it: Record<string, unknown>) => {
    const v = it[NAME_FIELD];
    return (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, string>;
  };
  const names = namesOf(item);
  const cyclesOf = (it: Record<string, unknown>) => {
    const v = it[CYCLE_FIELD];
    return (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, string[]>;
  };
  const cycles = cyclesOf(item);
  /** แผง "รูปที่วน" โชว์เมื่อเปิดเปลี่ยนรูป + การ์ดรูปใหญ่ */
  const cycleOn = item.cycle === true && item.layout === "tile";
  /** อัปโหลด/คลัง/รูปสินค้าที่เลือกครั้งนี้ไปลง: รูปบนการ์ด หรือ รายการรูปวน */
  const targetRef = useRef<"card" | "cycle">("card");
  const [editKey, setEditKey] = useState<string | null>(null);
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
    const keepNames = Object.fromEntries(Object.entries(namesOf(itemRef.current)).filter(([k]) => next.includes(k)));
    const keepCycles = Object.fromEntries(Object.entries(cyclesOf(itemRef.current)).filter(([k]) => next.includes(k)));
    onPatch({ [fieldKey]: next, [IMG_FIELD]: keep, [NAME_FIELD]: keepNames, [CYCLE_FIELD]: keepCycles });
  };
  /** ชื่อที่โชว์ของหมวดนี้ใน Section นี้ (ว่าง = กลับไปใช้ชื่อหมวดเดิม) */
  const setName = (key: string, name: string) => {
    const n = { ...namesOf(itemRef.current) };
    if (name.trim()) n[key] = name.slice(0, 60);
    else delete n[key];
    onPatch({ [NAME_FIELD]: n });
  };
  const setImg = (key: string, r2: string | null) => {
    const n = { ...imgsOf(itemRef.current) };
    if (r2) n[key] = r2;
    else delete n[key];
    onPatch({ [IMG_FIELD]: n });
  };
  /** รูปที่วนของหมวดนี้ (ว่าง = ลบทิ้ง → เว็บใช้รูปสินค้าในหมวดเอง) */
  const setCycle = (key: string, list: string[]) => {
    const n = { ...cyclesOf(itemRef.current) };
    const clean = [...new Set(list)].slice(0, CYCLE_MAX);
    if (clean.length) n[key] = clean;
    else delete n[key];
    onPatch({ [CYCLE_FIELD]: n });
  };
  const addCycle = (key: string, r2: string) => {
    const cur = cyclesOf(itemRef.current)[key] ?? [];
    if (cur.includes(r2)) return toast.info(t("รูปนี้อยู่ในรายการแล้ว", "This image is already in the list"));
    if (cur.length >= CYCLE_MAX) return toast.warning(t(`ใส่ได้หมวดละ ${CYCLE_MAX} รูป`, `Up to ${CYCLE_MAX} images per category`));
    setCycle(key, [...cur, r2]);
  };
  /** รูปที่เลือกมา → ลงที่เป้าหมายตอนนี้ (รูปบนการ์ด / รูปวน) */
  const applyPick = (key: string, r2: string) => (targetRef.current === "cycle" ? addCycle(key, r2) : setImg(key, r2));
  const toggle = (key: string) => setCats(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);

  const upload = async (key: string, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error(t("เลือกได้เฉพาะไฟล์รูป", "Image files only"));
    setBusy(key);
    try {
      const up = await uploadToLibrary(file);
      const cycle = targetRef.current === "cycle";
      applyPick(key, up.key);
      toast.success(cycle ? t("เพิ่มรูปที่วนแล้ว — กดบันทึก/เผยแพร่เพื่อขึ้นเว็บ", "Hover image added — Save / Publish to go live") : t("ตั้งรูปบนการ์ดแล้ว — กดบันทึก/เผยแพร่เพื่อขึ้นเว็บ", "Card image set — Save / Publish to go live"));
    } catch (e) {
      toast.error((e as Error).message || t("อัปโหลดไม่สำเร็จ", "Upload failed"));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // 📥 ลากรูปจากเครื่องมาวางที่แถวหมวด = รูปบนการ์ดของหมวดนั้น
  const drop = useFileDrop((files, key) => {
    targetRef.current = "card";
    void upload(key, files[0]);
  }, {
    accept: "image/",
    disabled: !!busy,
    onReject: () => toast.error(t("ลากมาได้เฉพาะไฟล์รูป", "You can only drop image files")),
    onBusy: () => toast.warning(t("กำลังอัปโหลดอยู่ — รอสักครู่", "Uploading — please wait")),
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
          {value.length ? t(`${value.length} หมวด · เรียงตามนี้บนเว็บ`, `${value.length} categories · shown in this order`) : t(`ยังไม่เลือก = โชว์ทุกหมวดหลัก (${tops.length})`, `None picked = show all main categories (${tops.length})`)}
        </span>
        <button type="button" onClick={() => setPickOpen(true)} disabled={!categories.length} className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">
          {t("＋ เลือกหมวด", "＋ Pick categories")}
        </button>
      </div>

      {!categories.length && <p className="text-xs text-slate-400">{t("ร้านนี้ยังไม่มีหมวด — ตั้งที่แท็บ 📂 หมวดหมู่", "This shop has no categories yet — set them in the 📂 Categories tab")}</p>}

      {/* ยังไม่เลือก: บอกว่าจะโชว์อะไร + ทางลัดเลือกหมวดหลักทั้งหมดมาจัดต่อ (เรียง/ตั้งรูป) */}
      {!value.length && tops.length > 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 px-2.5 py-2">
          <p className="text-[11px] text-slate-500 leading-relaxed">{tops.map((c) => c.label).join(" · ")}</p>
          <button type="button" onClick={() => setCats(tops.map((c) => c.key))} className="mt-1 text-[11px] text-blue-600 hover:underline">
            {t("เลือกหมวดหลักทั้งหมดมาจัดเอง (เรียงลำดับ / ตั้งรูป)", "Pick all main categories to arrange yourself (order / images)")}
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
                <FileDropHint show={drop.over === k} label={t(`วางรูปเป็นรูปบนการ์ด ${c?.label ?? k}`, `Drop to set the card image for ${c?.label ?? k}`)} />
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
                    {c && editKey === k ? (
                      <input
                        autoFocus
                        value={names[k] ?? ""}
                        placeholder={c.label}
                        maxLength={60}
                        onChange={(e) => setName(k, e.target.value)}
                        onBlur={() => setEditKey(null)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setEditKey(null)}
                        className="w-full rounded border border-blue-400 px-1.5 py-0.5 text-[13px] focus:outline-none"
                      />
                    ) : (
                      <span className={`block truncate text-[13px] ${c ? "text-slate-800" : "text-red-600"}`}>{c ? names[k] || c.label : t(`${k} (หมวดถูกลบแล้ว)`, `${k} (category deleted)`)}</span>
                    )}
                    {c && names[k] && editKey !== k ? (
                      <span className="block truncate text-[10px] text-slate-400">
                        {t("ชื่อเดิม:", "Original name:")} {c.label}{" "}
                        <button type="button" onClick={() => setName(k, "")} className="text-blue-600 hover:underline">
                          {t("↺ ใช้ชื่อเดิม", "↺ Use original name")}
                        </button>
                      </span>
                    ) : (
                      c?.parent && <span className="block truncate text-[10px] text-slate-400">{t("ใน", "In")} {byKey.get(c.parent)?.label ?? c.parent}</span>
                    )}
                  </span>
                  {own && <span className="shrink-0 rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">{t("รูปเอง", "Custom image")}</span>}
                  {cycleOn && (cycles[k]?.length ?? 0) > 0 && <span className="shrink-0 rounded bg-sky-100 px-1.5 text-[10px] text-sky-700" title={t("รูปที่วนเมื่อเอาเมาส์วาง", "Images cycled on hover")}>🔁 {cycles[k].length}</span>}
                  {c && (
                    <button
                      type="button"
                      onClick={() => setEditKey(editKey === k ? null : k)}
                      title={t("แก้ชื่อที่โชว์ของหมวดนี้ (เฉพาะ Section นี้ · ว่าง = ชื่อเดิม)", "Edit this category's display name (this section only · empty = original name)")}
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-sm ${names[k] ? "text-blue-600" : "text-slate-500"} hover:bg-slate-100`}
                    >
                      ✏️
                    </button>
                  )}
                  {c && (
                    <button
                      type="button"
                      onClick={() => setOpenKey(isOpen ? null : k)}
                      aria-expanded={isOpen}
                      title={cycleOn ? t("ตั้งรูปบนการ์ด + รูปที่วนของหมวดนี้ (เฉพาะ Section นี้)", "Set the card image + hover images for this category (this section only)") : t("ตั้งรูปบนการ์ดของหมวดนี้ (เฉพาะ Section นี้)", "Set the card image for this category (this section only)")}
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-sm ${isOpen ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                    >
                      🖼
                    </button>
                  )}
                  <button type="button" onClick={() => setCats(value.filter((x) => x !== k))} title={t("เอาหมวดนี้ออกจาก Section", "Remove this category from the section")} className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600">
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
                          targetRef.current = "card";
                          uploadFor.current = k;
                          fileRef.current?.click();
                        }}
                        className={btnCls}
                      >
                        {busy === k && targetRef.current === "card" ? t("กำลังอัปโหลด…", "Uploading…") : t("⬆ อัปโหลด (หรือลากรูปมาวาง)", "⬆ Upload (or drag an image here)")}
                      </button>
                      <button type="button" disabled={!!busy} onClick={() => ((targetRef.current = "card"), setLibFor(k))} className={btnCls}>
                        {t("🖼 เลือกจากคลังรูป", "🖼 Pick from image library")}
                      </button>
                      <button type="button" disabled={!!busy} onClick={() => ((targetRef.current = "card"), setChooserFor(k))} className={btnCls}>
                        {t("🛍 เลือกจากรูปสินค้าในหมวด", "🛍 Pick from product images in this category")}
                      </button>
                      {own && (
                        <button type="button" onClick={() => setImg(k, null)} className="text-[11px] text-slate-500 hover:text-blue-600">
                          {t("↺ ใช้รูปหมวดเดิม", "↺ Use original category image")}{c.imageKey ? "" : t(" (ยังไม่มีรูป = ไอคอน)", " (no image yet = icon)")}
                        </button>
                      )}
                      <p className="text-[10px] text-slate-400 leading-snug">
                        {own ? t("รูปนี้ใช้เฉพาะ Section นี้", "This image is used in this section only") : c.imageKey ? t("ตอนนี้ใช้รูปหมวดจากแท็บ 📂 หมวดหมู่", "Currently using the category image from the 📂 Categories tab") : t("หมวดนี้ยังไม่มีรูป — ไม่ตั้ง = ใช้ไอคอน", "This category has no image — not set = use the icon")}
                      </p>
                    </div>
                  </div>
                )}

                {/* 🔁 รูปที่วนเมื่อเอาเมาส์วาง (หมวดนี้) */}
                {isOpen && c && cycleOn && (
                  <div className="border-t border-slate-100 px-2 py-2">
                    <p className="text-[11px] font-medium text-slate-600">🔁 {t("รูปที่วนเมื่อเอาเมาส์วาง", "Images cycled on hover")}{(cycles[k]?.length ?? 0) > 0 ? ` (${cycles[k].length}/${CYCLE_MAX})` : ""}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(cycles[k] ?? []).map((r, j, list) => (
                        <span key={r} className="group relative h-12 w-12 overflow-hidden rounded-md bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imgUrl(r, 120)} alt="" className="h-full w-full object-cover" draggable={false} />
                          {j > 0 && (
                            <button
                              type="button"
                              onClick={() => setCycle(k, moveItem(list, j, j - 1))}
                              title={t("เลื่อนไปก่อน", "Move earlier")}
                              className="absolute bottom-0 left-0 rounded-tr bg-white/90 px-1 text-[10px] leading-4 text-slate-600 opacity-0 group-hover:opacity-100"
                            >
                              ◀
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setCycle(k, list.filter((x) => x !== r))}
                            title={t("เอารูปนี้ออก", "Remove this image")}
                            className="absolute right-0 top-0 rounded-bl bg-white/90 px-1 text-[10px] leading-4 text-red-600 opacity-0 group-hover:opacity-100"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      {(cycles[k]?.length ?? 0) < CYCLE_MAX && (
                        <>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => {
                              targetRef.current = "cycle";
                              uploadFor.current = k;
                              fileRef.current?.click();
                            }}
                            title={t("อัปโหลดรูป", "Upload image")}
                            className="flex h-12 w-12 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] leading-tight text-slate-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                          >
                            {busy === k && targetRef.current === "cycle" ? "…" : <><span className="text-sm">⬆</span>{t("อัปโหลด", "Upload")}</>}
                          </button>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => ((targetRef.current = "cycle"), setLibFor(k))}
                            title={t("เลือกจากคลังรูป", "Pick from image library")}
                            className="flex h-12 w-12 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] leading-tight text-slate-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                          >
                            <span className="text-sm">🖼</span>{t("คลัง", "Library")}
                          </button>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => ((targetRef.current = "cycle"), setChooserFor(k))}
                            title={t("เลือกจากรูปสินค้าในหมวด", "Pick from product images in this category")}
                            className="flex h-12 w-12 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] leading-tight text-slate-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                          >
                            <span className="text-sm">🛍</span>{t("สินค้า", "Products")}
                          </button>
                        </>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] leading-snug text-slate-400">
                      {(cycles[k]?.length ?? 0) > 0
                        ? t("เริ่มจากรูปบนการ์ด แล้ววนตามลำดับนี้ · ◀ = เลื่อนไปก่อน", "Starts with the card image, then cycles in this order · ◀ = move earlier")
                        : t("ยังไม่ตั้ง = ใช้รูปสินค้าในหมวด 4 รูปแรกอัตโนมัติ", "Not set = automatically use the first 4 product images in the category")}
                    </p>
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
          title={`${targetRef.current === "cycle" ? t("เพิ่มรูปที่วน", "Add hover image") : t("เลือกรูปบนการ์ด", "Pick card image")} — ${labelOf(libFor)}`}
          onSelect={(rows) => {
            const key = rows[0]?.r2_key;
            if (key) applyPick(libFor, key);
            setLibFor(null);
          }}
        />
      )}
      <ImageChooser
        open={!!chooserFor}
        onClose={() => setChooserFor(null)}
        shopSlug={shopSlug}
        title={`${targetRef.current === "cycle" ? t("เพิ่มรูปที่วน", "Add hover image") : t("รูปบนการ์ด", "Card image")} — ${chooserFor ? labelOf(chooserFor) : ""}`}
        initialView="products"
        categoryKeys={chooserFor ? [chooserFor] : undefined}
        categoryLabel={chooserFor ? byKey.get(chooserFor)?.label : undefined}
        note={null}
        onPick={(p) => {
          if (chooserFor) applyPick(chooserFor, p.key);
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
  const t = useT();
  const [q, setQ] = useState("");
  const rows = useMemo(() => categoryTree(categories), [categories]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => `${r.cat.label} ${r.cat.key}`.toLowerCase().includes(needle)) : rows;
  const tops = rows.filter((r) => r.depth === 0).map((r) => r.cat.key);
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={t("＋ เลือกหมวดที่โชว์", "＋ Pick categories to show")}
      size="sm"
      defaultExpanded={false}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs text-slate-500">{value.length ? t(`เลือกแล้ว ${value.length} หมวด`, `${value.length} categories picked`) : t("ยังไม่เลือก = ทุกหมวดหลัก", "None picked = all main categories")}</span>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">
            {t("เสร็จ", "Done")}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("🔍 ค้นหาหมวด", "🔍 Search categories")} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none" />
        <div className="flex flex-wrap gap-2 text-[11px]">
          <button type="button" onClick={() => onSet([...value, ...tops.filter((k) => !value.includes(k))])} className="text-blue-600 hover:underline">
            {t("ติ๊กหมวดหลักทั้งหมด", "Tick all main categories")}
          </button>
          {value.length > 0 && (
            <button type="button" onClick={() => onSet([])} className="text-slate-500 hover:text-red-600">
              {t("ล้างที่เลือก (กลับไปโชว์ทุกหมวดหลัก)", "Clear selection (back to all main categories)")}
            </button>
          )}
        </div>
        <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-100">
          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{t("ไม่พบหมวดที่ค้นหา", "No matching categories")}</p>
          ) : (
            shown.map(({ cat, depth }) => {
              const i = value.indexOf(cat.key);
              return (
                <label key={cat.key} className={`flex cursor-pointer items-center gap-2 border-b border-slate-50 py-1.5 pr-2 hover:bg-slate-50 ${depth && !needle ? "pl-8" : "pl-2"}`}>
                  <input type="checkbox" checked={i >= 0} onChange={() => onToggle(cat.key)} className="h-4 w-4 accent-blue-600" />
                  <span className={`flex-1 truncate ${depth ? "text-[13px] text-slate-600" : "text-sm font-medium text-slate-800"}`}>
                    {depth && !needle ? "↳ " : ""}
                    {needle && depth ? categoryPathLabel(categories, cat.key) : cat.label}
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
