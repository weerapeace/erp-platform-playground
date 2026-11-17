"use client";

/**
 * 📚 ป๊อปจัดการ "แหล่งข้อมูล" ของหัวข้อรายละเอียดสินค้า (ปุ่ม ⚙ ข้างช่อง "เอาข้อมูลจาก" ในแท็บดีไซน์ → หน้าสินค้า)
 *
 *   ซ้าย = รายการแหล่ง: ดึงจากสินค้า (อ่านอย่างเดียว ลบไม่ได้) · ข้อความของร้าน (การจัดส่ง + ที่ร้านเพิ่มเอง)
 *   ขวา  = แก้แหล่งที่เลือก: ชื่อ (เฉพาะที่เพิ่มเอง) · บรรทัด (พิมพ์/ลากสลับ/ลบ/เพิ่ม)
 *          การจัดส่ง: บรรทัดอัตโนมัติ 🔒 จากแท็บข้อมูลร้าน (ซ่อนได้) + บรรทัดพิมพ์เพิ่ม
 *   แก้แล้วเข้าธีมทันที → บันทึกพร้อมธีม (บันทึกร่าง/เผยแพร่ ตามปกติ)
 *
 * ข้อมูล/กติกา: lib/website-content-sources · เว็บร้านวาดเป็นรายการจุด (storefront src/lib/product-details.ts)
 */
import { LangInput } from "@/components/bilingual-field";
import { useEffect, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import {
  SHIPPING_SOURCE_ID,
  SHIPPING_SOURCE_NAME,
  SHIPPING_AUTO_LINES,
  MAX_CONTENT_SOURCES,
  MAX_CONTENT_LINES,
  CONTENT_LINE_MAX,
  CONTENT_NAME_MAX,
  newContentLine,
  newContentSource,
  shippingSourceOf,
  upsertSource,
  sourceUsage,
  type ContentLine,
  type ContentSource,
  type ShippingAutoKey,
} from "@/lib/website-content-sources";
import { webForm } from "@/lib/website-form-styles";
import { useT } from "@/components/i18n";

const inputCls = webForm.input;
const groupCls = "text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1";

export interface ContentSourcesModalProps {
  open: boolean;
  onClose: () => void;
  sources: ContentSource[];
  onChange: (next: ContentSource[]) => void;
  /** หัวข้อทั้งหมด — ไว้บอกว่าแหล่งไหนใช้อยู่ที่ไหน (เตือนก่อนลบ) */
  items: { label: string; source: string; sourceId?: string }[];
  /** แหล่งที่ดึงจากสินค้า (โชว์อย่างเดียว) */
  productSources: { value: string; label: string }[];
  /** บรรทัดอัตโนมัติของการจัดส่งตามข้อมูลร้านตอนนี้ (choices.shippingAuto) */
  shippingAuto?: { key: ShippingAutoKey; text: string }[];
  /** เปิดมาแล้วเลือกแหล่งนี้ไว้ (id) */
  focusId?: string | null;
  /** เปิดจากหัวข้อไหน → มีปุ่ม "ใช้แหล่งนี้กับหัวข้อ" (value = ค่าในดรอปดาวน์ shipping / custom:<id>) */
  pickFor?: { label: string; value: string } | null;
  onPick?: (value: string) => void;
}

export function ContentSourcesModal({ open, onClose, sources, onChange, items, productSources, shippingAuto, focusId, pickFor, onPick }: ContentSourcesModalProps) {
  const t = useT();
  const [sel, setSel] = useState<string>(focusId || SHIPPING_SOURCE_ID);
  const [focusLine, setFocusLine] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSel(focusId || SHIPPING_SOURCE_ID);
  }, [open, focusId]);

  const custom = sources.filter((s) => s.id !== SHIPPING_SOURCE_ID);
  const shipping = shippingSourceOf(sources);
  const current = sel === SHIPPING_SOURCE_ID ? shipping : custom.find((s) => s.id === sel) ?? shipping;
  const isShipping = current.id === SHIPPING_SOURCE_ID;
  const usedBy = sourceUsage(items, current.id);
  const save = (src: ContentSource) => onChange(upsertSource(sources, src));
  const setLines = (lines: ContentLine[]) => save({ ...current, lines });

  const addLine = (after?: number) => {
    if (current.lines.length >= MAX_CONTENT_LINES) return;
    const l = newContentLine();
    const next = [...current.lines];
    next.splice(after === undefined ? next.length : after + 1, 0, l);
    setLines(next);
    setFocusLine(l.id);
  };
  const drag = useDragReorder((from, to) => setLines(moveItem(current.lines, from, to)));

  const addSource = () => {
    if (custom.length >= MAX_CONTENT_SOURCES - 1) return;
    const s = newContentSource();
    onChange([...sources, s]);
    setSel(s.id);
    setFocusLine(s.lines[0]?.id ?? null);
  };
  const toggleAuto = (k: ShippingAutoKey) => {
    const hidden = new Set(shipping.hideAuto ?? []);
    if (hidden.has(k)) hidden.delete(k);
    else hidden.add(k);
    save({ ...shipping, hideAuto: SHIPPING_AUTO_LINES.map((a) => a.key).filter((x) => hidden.has(x)) });
  };

  const delSrc = delId ? custom.find((s) => s.id === delId) : null;
  const delUsed = delSrc ? sourceUsage(items, delSrc.id) : [];
  const pickValue = isShipping ? "shipping" : `custom:${current.id}`;

  return (
    <>
      <ERPModal
        open={open}
        onClose={onClose}
        title={t("⚙ จัดการแหล่งข้อมูล", "⚙ Manage content sources")}
        description={t('แหล่งที่หัวข้อรายละเอียดสินค้าเลือกได้ในช่อง "เอาข้อมูลจาก" — เพิ่ม / แก้ / ลบ ได้ที่นี่', 'Sources that product detail sections can pick in "Take content from" — add / edit / delete here')}
        size="xl"
        defaultExpanded={false}
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <p className="text-[11px] text-slate-400">{t("แก้แล้วจะบันทึกไปพร้อมธีม — กด \"บันทึกร่าง\" / \"เผยแพร่\" ตามปกติ", "Changes are saved with the theme — press \"Save draft\" / \"Publish\" as usual")}</p>
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">{t("เสร็จ", "Done")}</button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          {/* ── ซ้าย: รายการแหล่ง ── */}
          <div className="space-y-4">
            <div>
              <p className={groupCls}>{t("ดึงจากสินค้า · ลบไม่ได้", "From products · can't delete")}</p>
              <ul className="space-y-0.5">
                {productSources.map((p) => (
                  <li key={p.value} className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-500" title={t("ข้อมูลมาจากสินค้าแต่ละตัว — แก้ที่หน้าสินค้า", "Comes from each product — edit it on the product page")}>
                    <span aria-hidden>🔒</span>
                    <span className="truncate">{p.label}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className={groupCls}>{t("ข้อความของร้าน", "Shop text")}</p>
              <ul className="space-y-1">
                {[shipping, ...custom].map((s) => {
                  const on = s.id === current.id;
                  const n = sourceUsage(items, s.id).length;
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => setSel(s.id)}
                        className={`w-full text-left rounded-lg border px-2.5 py-1.5 text-sm ${on ? "border-blue-400 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-700 hover:border-slate-400"}`}
                      >
                        <span className="block truncate">{s.id === SHIPPING_SOURCE_ID ? `🚚 ${SHIPPING_SOURCE_NAME}` : s.name || t("(ไม่มีชื่อ)", "(Untitled)")}</span>
                        <span className="block text-[11px] text-slate-400">
                          {s.id === SHIPPING_SOURCE_ID ? t("อัตโนมัติ + ", "Auto + ") : ""}
                          {s.lines.filter((l) => l.text.trim()).length} {t("บรรทัด", "lines")} · {n ? t(`ใช้ใน ${n} หัวข้อ`, `Used in ${n} section(s)`) : t("ยังไม่ได้ใช้", "Not used yet")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                onClick={addSource}
                disabled={custom.length >= MAX_CONTENT_SOURCES - 1}
                className="mt-2 w-full rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40"
              >
                {t("＋ เพิ่มแหล่งใหม่", "＋ Add source")}
              </button>
              <p className="text-[11px] text-slate-400 mt-1 px-1">{t("เช่น การรับประกัน · การคืนสินค้า · วิธีดูแล", "e.g. Warranty · Returns · Care guide")}</p>
            </div>
          </div>

          {/* ── ขวา: แก้แหล่งที่เลือก ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 min-w-0">
            {isShipping ? (
              <div className="mb-3">
                <p className="text-sm font-semibold text-slate-800">🚚 {SHIPPING_SOURCE_NAME}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{t("บรรทัด 🔒 มาจากแท็บ \"ข้อมูลร้าน\" (ค่าส่ง / ส่งฟรี / ช่องทางจ่าย) — เปลี่ยนที่นั่นแล้วอัปเดตเอง · กด 👁 เพื่อซ่อน", "🔒 lines come from the \"Site info\" tab (shipping fee / free shipping / payment methods) — change them there and they update here · press 👁 to hide")}</p>
              </div>
            ) : (
              <div className="mb-3">
                <label htmlFor="content-source-name" className="block text-[11px] font-medium text-slate-500 mb-1">{t("ชื่อแหล่ง (เห็นแค่ในหลังบ้าน)", "Source name (admin only)")}</label>
                <input id="content-source-name" className={inputCls} value={current.name} maxLength={CONTENT_NAME_MAX} onChange={(e) => save({ ...current, name: e.target.value })} placeholder={t("เช่น การรับประกัน", "e.g. Warranty")} />
              </div>
            )}

            <p className="text-[11px] text-slate-500 mb-2">
              {usedBy.length ? <>{t("ใช้อยู่ใน:", "Used in:")} <b className="text-slate-700">{usedBy.join(" · ")}</b></> : <>{t("ยังไม่มีหัวข้อไหนใช้ — เลือกได้ที่ช่อง \"เอาข้อมูลจาก\" ของหัวข้อ", "No section uses it yet — pick it in a section's \"Take content from\" field")}</>}
            </p>

            <p className="block text-[11px] font-medium text-slate-500 mb-1">{t("บรรทัดที่โชว์บนเว็บ (แต่ละบรรทัด = 1 จุด •)", "Lines shown on the site (each line = 1 bullet •)")}</p>
            <ul className="space-y-1.5">
              {isShipping &&
                SHIPPING_AUTO_LINES.map((a) => {
                  const text = shippingAuto?.find((x) => x.key === a.key)?.text ?? "";
                  const hidden = (shipping.hideAuto ?? []).includes(a.key);
                  return (
                    <li key={a.key} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                      <span className="text-xs" aria-hidden title={t("อัตโนมัติจากข้อมูลร้าน", "Automatic from site info")}>🔒</span>
                      <span className={`flex-1 min-w-0 text-sm ${hidden || !text ? "text-slate-400" : "text-slate-700"} ${hidden ? "line-through" : ""}`}>
                        {text || <span className="italic">{a.label} — {t("ยังไม่ได้ตั้งในข้อมูลร้าน (ไม่โชว์)", "not set in site info (hidden)")}</span>}
                      </span>
                      <button
                        onClick={() => toggleAuto(a.key)}
                        className={`shrink-0 h-7 px-2 rounded-lg border text-xs ${hidden ? "border-amber-300 text-amber-700 bg-amber-50" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}
                        title={hidden ? t("กำลังซ่อน — กดเพื่อโชว์", "Hidden — click to show") : t("กดเพื่อซ่อนบรรทัดนี้", "Click to hide this line")}
                      >
                        {hidden ? t("🙈 ซ่อนอยู่", "🙈 Hidden") : t("👁 โชว์", "👁 Shown")}
                      </button>
                    </li>
                  );
                })}
              {current.lines.map((l, i) => (
                <li key={l.id} {...drag.rowProps(i)} className={`flex items-center gap-1.5 rounded-lg ${drag.rowCls(i)}`}>
                  <DragHandle {...drag.handleProps(i)} />
                  <LangInput
                    className={inputCls}
                    obj={l}
                    k="text"
                    maxLength={CONTENT_LINE_MAX}
                    autoFocus={focusLine === l.id}
                    placeholder={isShipping ? t("เช่น จัดส่งภายใน 1–2 วันทำการ", "e.g. Ships within 1–2 business days") : t("พิมพ์ข้อความ 1 บรรทัด", "Type one line of text")}
                    onPatch={(p) => setLines(current.lines.map((x) => (x.id === l.id ? { ...x, ...p } : x)))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        addLine(i);
                      }
                    }}
                    aria-label={t(`บรรทัดที่ ${i + 1}`, `Line ${i + 1}`)}
                  />
                  <button
                    onClick={() => setLines(current.lines.filter((x) => x.id !== l.id))}
                    className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 text-xs text-slate-400 hover:text-red-600 hover:border-red-300"
                    title={t("ลบบรรทัดนี้", "Delete this line")}
                    aria-label={t(`ลบบรรทัดที่ ${i + 1}`, `Delete line ${i + 1}`)}
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={() => addLine()}
              disabled={current.lines.length >= MAX_CONTENT_LINES}
              className="mt-2 text-xs px-2.5 py-1 rounded-lg border border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40"
            >
              {t("＋ เพิ่มบรรทัด", "＋ Add line")}
            </button>
            <p className="text-[11px] text-slate-400 mt-1">{t("กด Enter = ขึ้นบรรทัดใหม่ · ลาก ⠿ เพื่อสลับลำดับ · บรรทัดว่างไม่โชว์ · ภาษาอังกฤษแปลได้ที่แท็บ 🌐 แปลภาษา", "Enter = new line · drag ⠿ to reorder · empty lines are hidden · English goes in the 🌐 Translations tab")}</p>
            {isShipping && <p className="text-[11px] text-amber-700 mt-2">{t("มีผลทั้งหัวข้อในรายละเอียดสินค้า และข้อความใต้ปุ่มใส่ตะกร้า (ถ้าตั้งให้โชว์การจัดส่ง)", "Applies to the product detail section and the text under the add-to-cart button (if shipping is set to show)")}</p>}

            <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-100">
              {pickFor && onPick && pickFor.value !== pickValue && (
                <button onClick={() => { onPick(pickValue); onClose(); }} className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                  {t("✓ ใช้แหล่งนี้กับหัวข้อ", "✓ Use this source for section")} &quot;{pickFor.label}&quot;
                </button>
              )}
              {!isShipping && (
                <button onClick={() => setDelId(current.id)} className="ml-auto text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-300">
                  {t("🗑 ลบแหล่งนี้", "🗑 Delete this source")}
                </button>
              )}
            </div>
          </div>
        </div>
      </ERPModal>

      <ConfirmDialog
        open={!!delSrc}
        onClose={() => setDelId(null)}
        onConfirm={() => {
          if (!delSrc) return;
          onChange(sources.filter((s) => s.id !== delSrc.id));
          setSel(SHIPPING_SOURCE_ID);
          setDelId(null);
        }}
        title={t(`ลบแหล่ง "${delSrc?.name ?? ""}"?`, `Delete source "${delSrc?.name ?? ""}"?`)}
        message={
          delUsed.length ? (
            <>{t("มีหัวข้อที่ใช้แหล่งนี้อยู่", "Sections using this source:")} <b>{delUsed.length}</b> {t("หัวข้อ", "")} ({delUsed.join(" · ")}) — {t("ลบแล้วหัวข้อเหล่านั้นจะไม่โชว์บนเว็บ จนกว่าจะเลือกแหล่งใหม่", "after deleting, those sections won't show on the site until you pick a new source")}</>
          ) : (
            t("ยังไม่มีหัวข้อไหนใช้แหล่งนี้ ลบได้เลย", "No section uses this source — safe to delete")
          )
        }
        confirmText={t("ลบแหล่ง", "Delete source")}
        variant="danger"
      />
    </>
  );
}
