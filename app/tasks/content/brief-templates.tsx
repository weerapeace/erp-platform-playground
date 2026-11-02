"use client";
// เทมเพลตบรีฟ — ปุ่ม "เทมเพลต" บนการ์ด "รายการงานที่ต้องการ" (ป๊อปโพสต์ + การ์ดไอเดียหน้าวางแผน)
// กดเลือก = ต่อท้ายโน้ต + รวม Ref (รูป/ลิงก์ตัวเดิม ไม่อัปซ้ำ · รวมไม่เกิน 6) — ผู้เรียกจัดการบันทึกเอง (onApply)
// บันทึกบรีฟที่พิมพ์อยู่เป็นเทมเพลต · จัดการ (เรียง / แก้ / ปิดใช้ / ลบ) · แบรนด์ของโพสต์ขึ้นก่อน
// สิทธิ์: เลือกใช้ = ทุกคนที่เปิดป๊อปได้ · สร้าง/แก้ = tasks.edit · ข้อมูล erp_creative_brief_templates (API /api/creative-brief-templates)
import { useEffect, useMemo, useState } from "react";
import { Popover } from "@/components/popover";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPInput } from "@/components/form";
import { RichTextEditor } from "@/components/rich-text";
import { BrandSelect } from "@/components/brand-select";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
import { type ToastVariant } from "@/components/toast";
import { useDragReorder, moveItem } from "@/components/sortable-list";
import { useSWRLite } from "@/lib/swr-lite";
import { r2ImageUrl } from "@/lib/r2-image";
import { noteToHtml, isEmptyNote } from "@/lib/rich-note";
import { sortBriefTemplates, matchBriefTemplate, parseTags, type BriefState, type BriefTemplate } from "@/lib/brief-templates";
import { listBriefTemplates, createBriefTemplate, updateBriefTemplate, deleteBriefTemplate, reorderBriefTemplates, BRIEF_TEMPLATES_SWR_KEY } from "../data";
import { BriefRefSlots } from "./brief-ref-slots";

type BrandLite = { id: string; name: string; color?: string | null };
type Say = (type: ToastVariant, m: string) => void;

/** รูป Ref ย่อ ๆ + จำนวนลิงก์ (บนรายการเทมเพลต) */
function RefPeek({ tpl }: { tpl: BriefTemplate }) {
  const imgs = tpl.ref_image_keys.slice(0, 3);
  if (!imgs.length && !tpl.ref_links.length) return null;
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {imgs.map((k) => <img key={k} src={r2ImageUrl(k, 80) ?? ""} alt="" className="h-7 w-7 rounded object-cover border border-slate-200" />)}
      {tpl.ref_links.length > 0 && <span className="h-7 px-1 rounded border border-slate-200 bg-slate-50 text-[10px] text-slate-500 inline-flex items-center gap-0.5"><Icon name="link" size={10} />{tpl.ref_links.length}</span>}
    </span>
  );
}

export function BriefTemplatePicker({ brandId, brands, getCurrent, onApply, onMessage }: {
  /** แบรนด์ของโพสต์ (เทมเพลตของแบรนด์นี้ขึ้นก่อน · ใช้ตอนบันทึกเป็น "เฉพาะแบรนด์นี้") */
  brandId: string | null;
  brands: BrandLite[];
  /** บรีฟ + Ref ปัจจุบัน (ตอน "บันทึกบรีฟนี้เป็นเทมเพลต") */
  getCurrent: () => BriefState;
  onApply: (tpl: BriefTemplate) => void;
  onMessage: Say;
}) {
  const t = useT();
  const { can } = useAuth();
  const canEdit = can("tasks.edit");
  const { data, loading, error, revalidate } = useSWRLite(BRIEF_TEMPLATES_SWR_KEY, () => listBriefTemplates(false));
  const [q, setQ] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [onlyBrand, setOnlyBrand] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mgrOpen, setMgrOpen] = useState(false);
  const brandName = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name ?? t("แบรนด์อื่น", "Other brand") : t("ทุกแบรนด์", "All brands"));
  const list = useMemo(() => sortBriefTemplates((data ?? []).filter((x) => matchBriefTemplate(x, q)), brandId), [data, q, brandId]);

  const saveAs = async () => {
    const n = name.trim();
    if (!n) { setErr(t("ใส่ชื่อเทมเพลตก่อน", "Enter a template name")); return; }
    const cur = getCurrent();
    if (isEmptyNote(cur.html) && !cur.images.length && !cur.links.length) { setErr(t("โน้ตกับ Ref ยังว่าง — พิมพ์บรีฟหรือใส่ Ref ก่อน", "The note and refs are empty")); return; }
    setBusy(true); setErr(null);
    try {
      await createBriefTemplate({ name: n, tags: parseTags(tags), brief: isEmptyNote(cur.html) ? null : cur.html, ref_image_keys: cur.images, ref_links: cur.links, brand_id: onlyBrand && brandId ? brandId : null });
      await revalidate(true);
      onMessage("success", t(`บันทึกเทมเพลต "${n}" แล้ว`, `Saved template "${n}"`));
      setName(""); setTags(""); setOnlyBrand(false); setSaveOpen(false);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Popover align="right" panelClassName="w-80 p-2"
        trigger={(toggle, open) => (
          <button type="button" onClick={() => { toggle(); if (!open) void revalidate(); }} title={t("เลือกเทมเพลตงาน — เติมโน้ต + Ref ให้", "Pick a brief template")}
            className={`h-7 px-2 rounded-lg border text-[11px] inline-flex items-center gap-1 ${open ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-white border-amber-200 text-amber-800 hover:bg-amber-50"}`}>
            <Icon name="documents" /> {t("เทมเพลต", "Templates")}
          </button>
        )}>
        {(close) => (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">{t("เลือกเทมเพลตงาน", "Pick a template")}</span>
              <span className="text-[10px] text-slate-400">{t("ต่อท้ายโน้ตเดิม · Ref ใช้ตัวเดิม", "Appends · reuses refs")}</span>
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={t("ค้นหา เช่น warm, video", "Search e.g. warm, video")}
              className="w-full h-8 border border-slate-200 rounded-lg px-2 text-xs" />
            <div className="max-h-72 overflow-y-auto space-y-1">
              {loading && !data ? <div className="py-4 text-center text-slate-400">{t("กำลังโหลด…", "Loading…")}</div>
                : error && !data ? (
                  <div className="py-3 text-center text-rose-600">{t("โหลดเทมเพลตไม่สำเร็จ", "Couldn't load templates")}
                    <button type="button" onClick={() => void revalidate(true)} className="ml-1 text-violet-700 underline">{t("ลองใหม่", "Retry")}</button></div>
                ) : list.length === 0 ? (
                  <div className="py-3 px-2 text-center text-slate-400">{q ? t("ไม่พบเทมเพลต ลองคำอื่น", "No match — try another word")
                    : t("ยังไม่มีเทมเพลต — พิมพ์บรีฟ ใส่ Ref แล้วกด \"บันทึกบรีฟนี้เป็นเทมเพลต\"", "No templates yet — write a brief, add refs, then save it as a template")}</div>
                ) : list.map((x) => (
                  <button key={x.id} type="button" onClick={() => { onApply(x); close(); }}
                    className="w-full text-left flex items-center gap-2 p-1.5 rounded-lg border border-slate-200 hover:border-amber-300 hover:bg-amber-50/50">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-800 truncate">{x.name}</span>
                      <span className="flex flex-wrap gap-1 mt-0.5">
                        {x.tags.map((g) => <span key={g} className="px-1.5 rounded-full bg-amber-50 text-amber-800 text-[10px]">{g}</span>)}
                        <span className={`px-1.5 rounded-full text-[10px] ${x.brand_id && x.brand_id === brandId ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-500"}`}>{brandName(x.brand_id)}</span>
                      </span>
                    </span>
                    <RefPeek tpl={x} />
                  </button>
                ))}
            </div>
            {canEdit && (
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => { setSaveOpen((v) => !v); setErr(null); }} className="h-7 px-2 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"><Icon name="save" /> {t("บันทึกบรีฟนี้เป็นเทมเพลต", "Save this brief as a template")}</button>
                  <button type="button" onClick={() => { close(); setMgrOpen(true); }} className="h-7 px-2 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"><Icon name="settings" /> {t("จัดการ", "Manage")}</button>
                </div>
                {saveOpen && (
                  <div className="space-y-1.5 rounded-lg bg-slate-50 p-2">
                    <input value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} maxLength={120} placeholder={t("ชื่อ เช่น Video Editorial Fashion · Warm", "Name e.g. Video Editorial · Warm")} className="w-full h-8 border border-slate-200 rounded-lg px-2 text-xs bg-white" />
                    <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("ป้าย คั่นด้วย , เช่น Video, Editorial, Warm", "Tags, comma separated")} className="w-full h-8 border border-slate-200 rounded-lg px-2 text-xs bg-white" />
                    {brandId && (
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                        <input type="checkbox" checked={onlyBrand} onChange={(e) => setOnlyBrand(e.target.checked)} />
                        {t(`เฉพาะแบรนด์ ${brandName(brandId)} (ไม่ติ๊ก = ใช้ได้ทุกแบรนด์)`, `Only ${brandName(brandId)} (unticked = all brands)`)}
                      </label>
                    )}
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void saveAs()} disabled={busy} className="h-7 px-3 rounded-lg bg-amber-600 text-white text-[11px] font-medium hover:bg-amber-700 disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
                      {err && <span className="text-[11px] text-rose-600">{err}</span>}
                    </div>
                    <p className="text-[10px] text-slate-400">{t("เก็บโน้ต + Ref ที่มีตอนนี้ (Ref ใช้ตัวเดิม ไม่อัปซ้ำ)", "Saves the current note + refs (refs are reused)")}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Popover>
      {mgrOpen && <BriefTemplateManager brands={brands} onMessage={onMessage} onClose={() => { setMgrOpen(false); void revalidate(true); }} />}
    </>
  );
}

/** หน้าจัดการเทมเพลต — ลากเรียง · แก้ · ปิดใช้ · ลบ */
export function BriefTemplateManager({ brands, onClose, onMessage }: { brands: BrandLite[]; onClose: () => void; onMessage: Say }) {
  const t = useT();
  const { can } = useAuth();
  const canEdit = can("tasks.edit");
  const { data, loading, error, revalidate } = useSWRLite(`${BRIEF_TEMPLATES_SWR_KEY}:all`, () => listBriefTemplates(true));
  const [items, setItems] = useState<BriefTemplate[]>([]);
  useEffect(() => { if (data) setItems(data); }, [data]);
  const [edit, setEdit] = useState<BriefTemplate | "new" | null>(null);
  const [del, setDel] = useState<BriefTemplate | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const brandName = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name ?? t("แบรนด์อื่น", "Other brand") : t("ทุกแบรนด์", "All brands"));
  const drag = useDragReorder((from, to) => {
    const prev = items; const next = moveItem(items, from, to); setItems(next);
    reorderBriefTemplates(next.map((x) => x.id)).catch((e) => { setItems(prev); onMessage("error", (e as Error).message); });
  });
  const toggleActive = async (x: BriefTemplate) => {
    setItems((list) => list.map((y) => (y.id === x.id ? { ...y, is_active: !x.is_active } : y)));
    try { await updateBriefTemplate(x.id, { is_active: !x.is_active }); }
    catch (e) { setItems((list) => list.map((y) => (y.id === x.id ? x : y))); onMessage("error", (e as Error).message); }
  };
  const doDelete = async () => {
    if (!del) return;
    setDelBusy(true);
    try { await deleteBriefTemplate(del.id); setItems((list) => list.filter((y) => y.id !== del.id)); onMessage("success", t("ลบเทมเพลตแล้ว", "Template deleted")); setDel(null); }
    catch (e) { onMessage("error", (e as Error).message); }
    finally { setDelBusy(false); }
  };

  return (
    <>
      <ERPModal open onClose={onClose} size="lg" title={t("จัดการเทมเพลตงาน", "Manage brief templates")}
        description={t("ลากเรียงลำดับ · เทมเพลตของแบรนด์ที่โพสต์ใช้จะขึ้นก่อนเสมอ · ลบแล้วโพสต์ที่เคยใช้ไม่กระทบ", "Drag to reorder · the post's brand shows first · deleting doesn't affect posts")}
        footer={
          <div className="flex w-full items-center gap-2">
            {canEdit && <button type="button" onClick={() => setEdit("new")} className="h-9 px-3 rounded-lg border border-amber-300 text-sm text-amber-800 hover:bg-amber-50 inline-flex items-center gap-1"><Icon name="add" /> {t("เทมเพลตใหม่", "New template")}</button>}
            <button type="button" onClick={onClose} className="ml-auto h-9 px-4 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">{t("ปิด", "Close")}</button>
          </div>
        }>
        {loading && !data ? <div className="py-8 text-center text-sm text-slate-400">{t("กำลังโหลด…", "Loading…")}</div>
          : error && !data ? (
            <div className="py-8 text-center text-sm text-rose-600">{t("โหลดเทมเพลตไม่สำเร็จ", "Couldn't load templates")}
              <button type="button" onClick={() => void revalidate(true)} className="ml-2 text-violet-700 underline">{t("ลองใหม่", "Retry")}</button></div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">{t("ยังไม่มีเทมเพลต — กด \"เทมเพลตใหม่\" หรือบันทึกจากบรีฟในป๊อปโพสต์", "No templates yet — create one or save from a post's brief")}</div>
          ) : (
            <div className="space-y-1.5">
              {items.map((x, i) => (
                <div key={x.id} {...drag.rowProps(i)} className={`flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-white ${x.is_active ? "" : "opacity-60"} ${drag.rowCls(i)}`}>
                  {canEdit && <span {...drag.handleProps(i)} title={t("ลากเพื่อเรียงลำดับ", "Drag to reorder")} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 px-0.5"><Icon name="list" /></span>}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{x.name}</div>
                    <div className="flex flex-wrap gap-1 mt-0.5 text-[10px]">
                      {x.tags.map((g) => <span key={g} className="px-1.5 rounded-full bg-amber-50 text-amber-800">{g}</span>)}
                      <span className="px-1.5 rounded-full bg-slate-100 text-slate-500">{brandName(x.brand_id)}</span>
                      {!x.is_active && <span className="px-1.5 rounded-full bg-slate-200 text-slate-600">{t("ปิดใช้", "Off")}</span>}
                    </div>
                  </div>
                  <RefPeek tpl={x} />
                  {canEdit && <>
                    <button type="button" onClick={() => void toggleActive(x)} className="h-7 px-2 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">{x.is_active ? t("ปิดใช้", "Turn off") : t("เปิดใช้", "Turn on")}</button>
                    <button type="button" onClick={() => setEdit(x)} title={t("แก้ไข", "Edit")} aria-label={t("แก้ไข", "Edit")} className="h-7 w-7 rounded-lg border border-slate-200 text-slate-500 hover:text-violet-700 inline-flex items-center justify-center"><Icon name="edit" /></button>
                    <button type="button" onClick={() => setDel(x)} title={t("ลบ", "Delete")} aria-label={t("ลบ", "Delete")} className="h-7 w-7 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 inline-flex items-center justify-center"><Icon name="delete" /></button>
                  </>}
                </div>
              ))}
            </div>
          )}
      </ERPModal>
      {edit && <BriefTemplateEditor tpl={edit === "new" ? null : edit} brands={brands} onMessage={onMessage} onClose={() => setEdit(null)}
        onSaved={(saved) => { setItems((list) => (list.some((y) => y.id === saved.id) ? list.map((y) => (y.id === saved.id ? saved : y)) : [...list, saved])); setEdit(null); }} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => void doDelete()} loading={delBusy} variant="danger"
        title={t("ลบเทมเพลตนี้?", "Delete this template?")} confirmText={t("ลบ", "Delete")}
        message={t(`ลบ "${del?.name ?? ""}" — โพสต์ที่เคยใช้เทมเพลตนี้ไปแล้วไม่กระทบ (ถ้าแค่ไม่อยากให้เห็น ใช้ "ปิดใช้" แทน)`, `Delete "${del?.name ?? ""}" — posts that used it are not affected (use "Turn off" to just hide it)`)} />
    </>
  );
}

/** แก้/สร้างเทมเพลต — ชื่อ · ป้าย · แบรนด์ · โน้ต · Ref */
function BriefTemplateEditor({ tpl, brands, onClose, onSaved, onMessage }: {
  tpl: BriefTemplate | null; brands: BrandLite[]; onClose: () => void; onSaved: (t: BriefTemplate) => void; onMessage: Say;
}) {
  const t = useT();
  const init = useMemo(() => ({
    name: tpl?.name ?? "", tags: (tpl?.tags ?? []).join(", "), brand_id: tpl?.brand_id ?? "",
    brief: noteToHtml(tpl?.brief), images: tpl?.ref_image_keys ?? [], links: tpl?.ref_links ?? [],
  }), [tpl]);
  const [f, setF] = useState(init);
  const set = (p: Partial<typeof init>) => setF((x) => ({ ...x, ...p }));
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!f.name.trim()) { setErr(t("ใส่ชื่อเทมเพลตก่อน", "Enter a template name")); return; }
    setBusy(true); setErr(null);
    const body = { name: f.name.trim(), tags: parseTags(f.tags), brand_id: f.brand_id || null, brief: isEmptyNote(f.brief) ? null : f.brief, ref_image_keys: f.images, ref_links: f.links };
    try {
      const saved = tpl ? await updateBriefTemplate(tpl.id, body) : await createBriefTemplate(body);
      onMessage("success", t("บันทึกเทมเพลตแล้ว", "Template saved"));
      onSaved(saved);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} size="lg" hasUnsavedChanges={dirty} title={tpl ? t("แก้เทมเพลต", "Edit template") : t("เทมเพลตใหม่", "New template")}
      footer={
        <div className="flex w-full items-center gap-2">
          {err && <span className="text-xs text-rose-600">{err}</span>}
          <button type="button" onClick={onClose} disabled={busy} className="ml-auto h-9 px-4 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" onClick={() => void save()} disabled={busy} className="h-9 px-4 rounded-lg bg-amber-600 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-500">{t("ชื่อเทมเพลต", "Template name")} <span className="text-rose-500">*</span></label>
          <ERPInput value={f.name} maxLength={120} onChange={(e) => { set({ name: e.target.value }); setErr(null); }} placeholder={t("เช่น Video Editorial Fashion · Warm", "e.g. Video Editorial Fashion · Warm")} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-slate-500">{t("ป้าย (คั่นด้วย ,)", "Tags (comma separated)")}</label>
            <ERPInput value={f.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="Video, Editorial, Warm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">{t("แบรนด์", "Brand")}</label>
            <BrandSelect brands={brands} value={f.brand_id} onChange={(v) => set({ brand_id: v })} emptyLabel={t("ใช้ได้ทุกแบรนด์", "All brands")} />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">{t("โน้ต (จะต่อท้ายบรีฟของโพสต์)", "Note (appended to the post's brief)")}</label>
          <RichTextEditor toolbar="basic" value={f.brief} onChange={(v) => set({ brief: v })} minHeight={120} placeholder={t("เช่น วิดีโอแนวตั้ง 15 วิ แสงอุ่น…", "e.g. 15s vertical video, warm light…")} />
        </div>
        <div>
          <label className="text-xs text-slate-500">Ref</label>
          <BriefRefSlots images={f.images} links={f.links} onImages={(images) => set({ images })} onLinks={(links) => set({ links })} onMessage={onMessage} />
        </div>
      </div>
    </ERPModal>
  );
}
