"use client";
/**
 * 🧵 หน้าดูวัสดุ (product_materials) — แบบที่เจ้าของเลือก 2026-10-17
 * --------------------------------------------------------------------------
 * แทนหน้าดูมาตรฐาน (แท็บ ข้อมูลหลัก/เนื้อหา/อื่น ๆ) ผ่านจุดเสียบกลาง components/record-detail-views
 *   - ทุกอย่างอยู่หน้าเดียว · ไทยคู่อังกฤษวางข้างกัน (ไม่ต้องสลับ TH/EN)
 *   - บอกชัดว่า "ขึ้นลิงก์บนเว็บแล้วหรือยัง" + พูดถึงในสินค้ากี่รุ่นต่อร้าน (/api/product-materials/usage)
 *     กฎลิงก์ = lib/product-materials (เปิดใช้ + มีคำอธิบาย) — ที่เดียวกับเว็บร้าน
 *   - แก้ทีละส่วนในหน้านี้ได้เลย (✏️ → บันทึก · Ctrl+Enter / Esc) · ช่องอังกฤษที่ขาดกด 🌐 แปลจากไทย
 *   - ปุ่ม "แก้ไข" ล่างขวา = ฟอร์มกลางเต็ม (ไม่ได้เปลี่ยน)
 * บันทึกผ่าน ctx.save เท่านั้น (PATCH /api/master-v2/product_materials + audit ที่ API)
 */
import { useEffect, useState } from "react";
import type { DetailViewCtx } from "@/components/master-crud";
import { ImageInput, ImageCell } from "@/components/image-input";
import { ConfirmDialog } from "@/components/modal";
import { CopyButton } from "@/components/copy-button";
import { useToast } from "@/components/toast";
import { useFooterSave } from "@/components/footer-save";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { translateContent } from "@/lib/content-translate";
import { hasMaterialPage, materialTerms, type MaterialRow } from "@/lib/product-materials";

/** ผลจาก /api/product-materials/usage (ร้านที่มีสินค้าเผยแพร่) */
type UsageShop = { id: string; name: string; siteUrl: string | null; listed: number; count: number };
type Usage = { shops: UsageShop[] } | { error: string } | null;

type TextKey = "description" | "description_en" | "care" | "care_en";
type EditKey = "names" | TextKey | "aliases" | "slug" | "sort_order" | "image";

const s = (v: unknown) => String(v ?? "").trim();

/** ช่องที่แต่ละส่วนแก้ (ค่าเริ่มของกล่องแก้) */
const EDIT_FIELDS: Record<EditKey, string[]> = {
  names: ["name", "name_en"],
  description: ["description"], description_en: ["description_en"],
  care: ["care"], care_en: ["care_en"],
  aliases: ["aliases"], slug: ["slug"], sort_order: ["sort_order"], image: [],
};
/** คู่ไทย → อังกฤษ ที่ปุ่ม "แปลส่วนที่ขาด" เติมให้ */
const PAIRS: [string, string][] = [["name", "name_en"], ["description", "description_en"], ["care", "care_en"]];

const fmtDate = (v: unknown) => {
  const d = new Date(String(v ?? ""));
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(tr("th-TH", "en-GB"), { day: "numeric", month: "short", year: "numeric" });
};

export function MaterialDetailView({ ctx }: { ctx: DetailViewCtx }) {
  const { values: v, canEdit } = ctx;
  const toast = useToast();
  const mat = v as unknown as MaterialRow;
  const hasPage = hasMaterialPage(mat);
  const active = v.is_active !== false;
  const slug = s(v.slug);
  const imageKey = s(v.image_key);

  const [edit, setEdit] = useState<{ key: EditKey; draft: Record<string, string>; err?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  // 🌐 ร้านไหนพูดถึงวัสดุนี้กี่รุ่น — นับใหม่เมื่อคำที่ใช้จับเปลี่ยน (ชื่อ/ชื่ออังกฤษ/คำเรียกอื่น)
  const termsKey = materialTerms(mat).join("|");
  const [usage, setUsage] = useState<Usage>(null);
  useEffect(() => {
    let alive = true;
    setUsage(null);
    apiFetch(`/api/product-materials/usage?id=${encodeURIComponent(ctx.recordId)}`)
      .then((r) => r.json())
      .then((j: { data?: { shops?: UsageShop[] }; error?: string }) => {
        if (alive) setUsage(j.error ? { error: j.error } : { shops: j.data?.shops ?? [] });
      })
      .catch(() => { if (alive) setUsage({ error: tr("นับไม่สำเร็จ", "Couldn't count") }); });
    return () => { alive = false; };
  }, [ctx.recordId, termsKey]);
  const shops = usage && "shops" in usage ? usage.shops : [];
  const mentioned = shops.reduce((n, x) => n + x.count, 0);

  // ---- แก้ทีละส่วน ----
  const open = (key: EditKey) => setEdit({ key, draft: Object.fromEntries(EDIT_FIELDS[key].map((k) => [k, v[k] == null ? "" : String(v[k])])) });
  const setDraft = (k: string, val: string) => setEdit((e) => (e ? { ...e, draft: { ...e.draft, [k]: val }, err: undefined } : e));
  const dirty = !!edit && Object.entries(edit.draft).some(([k, val]) => val.trim() !== s(v[k]));

  const commit = async (patch: Record<string, unknown>, okMsg = tr("บันทึกแล้ว", "Saved")): Promise<boolean> => {
    setSaving(true);
    const err = await ctx.save(patch);
    setSaving(false);
    if (err) { toast.error(err); return false; }
    toast.success(okMsg);
    return true;
  };

  const saveEdit = async () => {
    if (!edit) return;
    if (!dirty) { setEdit(null); return; }
    const d = edit.draft;
    const patch: Record<string, unknown> = {};
    for (const [k, raw] of Object.entries(d)) {
      const val = raw.trim();
      if (k === "name" && !val) { setEdit({ ...edit, err: tr("ต้องใส่ชื่อวัสดุ", "Enter a material name") }); return; }
      if (k === "sort_order") {
        const n = Number(val || 0);
        if (!Number.isFinite(n)) { setEdit({ ...edit, err: tr("ลำดับต้องเป็นตัวเลข", "Order must be a number") }); return; }
        patch[k] = Math.round(n);
      } else if (k === "slug") {
        patch[k] = val;   // ว่าง = ระบบสร้างจากชื่ออังกฤษให้เอง (trigger ใน DB)
      } else {
        patch[k] = val || null;
      }
    }
    if (await commit(patch)) setEdit(null);
  };
  // มีของแก้ค้าง → ปุ่มบันทึกโผล่แถบล่าง + ปิดหน้าต่างจะถามก่อน (ของกลาง footer-save)
  useFooterSave(edit && dirty ? { label: tr("วัสดุ", "Material"), dirty, saving, onSave: saveEdit } : null);

  // ---- แปล ----
  const translatePairs = async (pairs: [string, string][]) => {
    const todo = pairs.filter(([th, en]) => s(v[th]) && !s(v[en]));
    if (!todo.length) { toast.info(tr("ไม่มีช่องที่ต้องแปล", "Nothing to translate")); return; }
    setTranslating(true);
    try {
      const out = await translateContent(todo.map(([th]) => s(v[th])));
      const patch: Record<string, unknown> = {};
      todo.forEach(([, en], i) => { if (out[i]) patch[en] = out[i]; });
      const n = Object.keys(patch).length;
      if (!n) toast.error(tr("แปลไม่สำเร็จ ลองใหม่อีกครั้ง", "Translation failed — try again"));
      else await commit(patch, tr(`แปลและบันทึกแล้ว ${n} ช่อง`, `Translated and saved ${n} field(s)`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("แปลไม่สำเร็จ", "Translation failed"));
    } finally { setTranslating(false); }
  };
  // ในกล่องแก้ชื่อ: แปลไทย → ช่องอังกฤษของกล่อง (ยังไม่บันทึก)
  const translateDraftName = async () => {
    const th = s(edit?.draft.name);
    if (!th) return;
    setTranslating(true);
    try {
      const [en] = await translateContent([th]);
      if (en) setDraft("name_en", en);
      else toast.error(tr("แปลไม่สำเร็จ", "Translation failed"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("แปลไม่สำเร็จ", "Translation failed"));
    } finally { setTranslating(false); }
  };
  const missingEn = PAIRS.filter(([th, en]) => s(v[th]) && !s(v[en])).length;

  const toggleActive = async () => {
    if (active) { setConfirmOff(true); return; }
    await commit({ is_active: true }, tr("เปิดใช้แล้ว", "Turned on"));
  };

  if (ctx.loading && !s(v.name)) {
    return <div className="space-y-3 animate-pulse"><div className="h-24 rounded-xl bg-slate-100" /><div className="h-40 rounded-xl bg-slate-100" /></div>;
  }

  // ---- ชิ้นส่วน ----
  const editBtn = (key: EditKey, label = tr("แก้", "Edit")) => canEdit && !edit && (
    <button type="button" onClick={() => open(key)} title={tr("แก้เฉพาะส่วนนี้", "Edit just this part")}
      className="h-6 px-1.5 text-[11.5px] rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 shrink-0">✏️ {label}</button>
  );
  const editorActions = (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      {edit?.err && <span className="text-xs text-red-600">⚠ {edit.err}</span>}
      <span className="mr-auto text-[11px] text-slate-400">{tr("Ctrl+Enter บันทึก · Esc ยกเลิก", "Ctrl+Enter to save · Esc to cancel")}</span>
      <button type="button" onClick={() => setEdit(null)} disabled={saving}
        className="h-8 px-3 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">{tr("ยกเลิก", "Cancel")}</button>
      <button type="button" onClick={() => void saveEdit()} disabled={saving}
        className="h-8 px-3 text-xs font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">{saving ? tr("กำลังบันทึก…", "Saving…") : tr("บันทึก", "Save")}</button>
    </div>
  );
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); setEdit(null); }   // ปิดแค่กล่องแก้ ไม่ปิดหน้าต่าง
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void saveEdit(); }
  };
  const inputCls = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  const textBox = (k: TextKey, opts: { optional?: boolean; rows: number }) => {
    const isEn = k.endsWith("_en");
    const thKey = k.replace(/_en$/, "");
    const val = s(v[k]);
    const soft = !!opts.optional && !s(v[thKey]);
    const langLabel = isEn ? "English" : tr("ไทย", "Thai");
    if (edit?.key === k) {
      return (
        <div>
          <div className="text-[11px] font-medium text-slate-400 mb-1">{langLabel}</div>
          <div className="rounded-lg border border-blue-300 ring-2 ring-blue-100 bg-white p-2">
            <textarea autoFocus rows={opts.rows} value={edit.draft[k] ?? ""} onChange={(e) => setDraft(k, e.target.value)} onKeyDown={keys}
              className="w-full text-sm leading-relaxed text-slate-700 resize-y border-0 bg-transparent p-0 outline-none focus:outline-none focus:ring-0" />
            {editorActions}
          </div>
        </div>
      );
    }
    return (
      <div className="min-w-0 flex flex-col">
        <div className="flex items-center justify-between h-6 mb-0.5">
          <span className="text-[11px] font-medium text-slate-400">{langLabel}</span>
          {val && editBtn(k)}
        </div>
        {val ? (
          <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap break-words min-h-[72px]">{val}</div>
        ) : (
          // ส่วนไม่บังคับที่ยังไม่มีไทยเลย = เทาเฉย ๆ · ส่วนที่ควรมี (หรืออังกฤษที่ตามหลังไทย) = เหลืองเตือน
          <div className={`flex-1 rounded-lg border border-dashed px-3 py-2.5 min-h-[72px] flex flex-col items-start gap-2 text-xs ${soft ? "border-slate-200 text-slate-400" : "border-amber-300 bg-amber-50/40 text-amber-700"}`}>
            <span>{soft ? tr("ยังไม่ได้ใส่ (ไม่บังคับ)", "Not filled (optional)") : isEn ? tr("ยังไม่มีภาษาอังกฤษ", "No English yet") : tr("ยังไม่ได้เขียน", "Not written yet")}</span>
            {canEdit && !edit && (
              <div className="flex gap-1.5 flex-wrap">
                {isEn && s(v[thKey]) && (
                  <button type="button" onClick={() => void translatePairs([[thKey, k]])} disabled={translating}
                    className="h-7 px-2.5 rounded-md border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">{translating ? tr("กำลังแปล…", "Translating…") : tr("🌐 แปลจากไทย", "🌐 Translate from Thai")}</button>
                )}
                <button type="button" onClick={() => open(k)}
                  className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">✏️ {tr("เขียน", "Write")}</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const section = (title: string, hint: string, body: React.ReactNode, action?: React.ReactNode) => (
    <section className="border-t border-slate-100 pt-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
          <p className="text-[11.5px] text-slate-400 mt-0.5">{hint}</p>
        </div>
        {action}
      </div>
      {body}
    </section>
  );

  const aliasList = s(v.aliases).split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const chip = (text: string, note?: string, strong?: boolean) => (
    <span key={`${text}|${note ?? ""}`} className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs bg-slate-50 border ${strong ? "border-slate-300 text-slate-700" : "border-slate-200 text-slate-600"}`}>
      {text}{note && <span className="text-slate-400">· {note}</span>}
    </span>
  );

  return (
    <div className="space-y-4">
      {/* ── หัว: รูป + ชื่อ 2 ภาษา + สถานะ ── */}
      <div className="flex gap-4 items-start">
        <div className="relative shrink-0">
          {imageKey ? (
            <ImageCell r2Key={imageKey} size={96} />
          ) : (
            <button type="button" onClick={() => canEdit && !edit && open("image")} disabled={!canEdit || !!edit}
              className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-orange-300 hover:text-orange-600 disabled:hover:border-slate-200 disabled:hover:text-slate-400 flex flex-col items-center justify-center gap-0.5 text-[11px]">
              <span className="text-xl leading-none">🖼</span>{canEdit ? tr("ใส่รูป", "Add image") : tr("ไม่มีรูป", "No image")}
            </button>
          )}
          {imageKey && canEdit && !edit && (
            <button type="button" onClick={() => open("image")}
              className="mt-1 w-24 text-[11px] text-slate-400 hover:text-orange-600">{tr("เปลี่ยนรูป", "Change image")}</button>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-slate-400">{tr("วัสดุ", "Material")}</div>
          {edit?.key === "names" ? (
            <div className="mt-1 space-y-2" onKeyDown={keys}>
              <label className="block">
                <span className="text-[11px] text-slate-500">{tr("ชื่อวัสดุ (ไทย)", "Name (Thai)")} <span className="text-red-500">*</span></span>
                <input autoFocus value={edit.draft.name ?? ""} onChange={(e) => setDraft("name", e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500 flex items-center gap-2">
                  {tr("ชื่ออังกฤษ", "English name")}
                  <button type="button" onClick={() => void translateDraftName()} disabled={translating || !s(edit.draft.name)}
                    className="text-indigo-600 hover:underline disabled:opacity-40">{translating ? tr("กำลังแปล…", "Translating…") : tr("🌐 แปลจากไทย", "🌐 Translate")}</button>
                </span>
                <input value={edit.draft.name_en ?? ""} onChange={(e) => setDraft("name_en", e.target.value)} className={inputCls} />
              </label>
              {editorActions}
            </div>
          ) : (
            <>
              <div className="flex items-start gap-1">
                <h3 className="text-xl font-semibold text-slate-800 leading-snug break-words min-w-0">{s(v.name) || "—"}</h3>
                {editBtn("names")}
              </div>
              {s(v.name_en)
                ? <div className="text-sm text-slate-500 break-words">{s(v.name_en)}</div>
                : <div className="text-xs text-amber-700 flex items-center gap-2">
                    {tr("ยังไม่มีชื่ออังกฤษ", "No English name yet")}
                    {canEdit && !edit && (
                      <button type="button" onClick={() => void translatePairs([["name", "name_en"]])} disabled={translating}
                        className="text-indigo-600 hover:underline disabled:opacity-50">{tr("🌐 แปลจากไทย", "🌐 Translate")}</button>
                    )}
                  </div>}
            </>
          )}

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => canEdit && void toggleActive()} disabled={!canEdit || saving}
              title={canEdit ? tr("กดเพื่อเปิด/ปิดใช้", "Click to turn on/off") : undefined}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"} ${canEdit ? "hover:ring-2 hover:ring-slate-200" : "cursor-default"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
              {active ? tr("เปิดใช้", "On") : tr("ปิดใช้อยู่", "Off")}
            </button>
            {hasPage ? (
              <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700">
                🌐 {tr("มีหน้าบนเว็บ", "Has a web page")}
                {usage && "shops" in usage && <span className="font-normal">· {tr(`ลิงก์ขึ้นใน ${mentioned} รุ่น`, `linked from ${mentioned} product(s)`)}</span>}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                ⚠️ {tr("ยังไม่ขึ้นลิงก์บนเว็บ", "Not linked on the web yet")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* กล่องใส่/เปลี่ยนรูป (อัปแล้วบันทึกทันที) */}
      {edit?.key === "image" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-600">{tr("รูปวัสดุ (เช่น ภาพผิวหนังระยะใกล้)", "Material image (e.g. a close-up of the surface)")}</span>
            <button type="button" onClick={() => setEdit(null)} className="text-xs text-slate-500 hover:text-slate-800">{tr("เสร็จ", "Done")}</button>
          </div>
          <ImageInput value={imageKey || null} folder={ctx.uploadFolder} disabled={saving}
            onChange={(key) => void commit({ image_key: key }, key ? tr("บันทึกรูปแล้ว", "Image saved") : tr("ลบรูปแล้ว", "Image removed"))} />
        </div>
      )}

      {/* เตือน: ยังไม่ขึ้นลิงก์ (บอกเหตุผล + ทางแก้) */}
      {!hasPage && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-start gap-3 text-sm text-amber-800">
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            {!active
              ? tr("ปิดใช้อยู่ — ชื่อวัสดุในหน้าสินค้าจะไม่เป็นลิงก์", "Turned off — material names on product pages won't link here")
              : tr("ยังไม่มีคำอธิบาย — ชื่อวัสดุในหน้าสินค้าจะยังไม่เป็นลิงก์มาหน้านี้", "No description yet — material names on product pages won't link here yet")}
            {mentioned > 0 && (
              <div className="text-xs text-amber-700 mt-0.5">{tr(`พร้อมแล้วจะลิงก์ได้ทันทีใน ${mentioned} รุ่นที่พูดถึงวัสดุนี้`, `Once ready it links from ${mentioned} product(s) that mention it`)}</div>
            )}
          </div>
          {canEdit && !edit && (active
            ? !s(v.description) && <button type="button" onClick={() => open("description")} className="h-8 px-3 text-xs font-medium rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0">✏️ {tr("เขียนเลย", "Write it")}</button>
            : <button type="button" onClick={() => void toggleActive()} className="h-8 px-3 text-xs font-medium rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0">{tr("เปิดใช้", "Turn on")}</button>)}
        </div>
      )}

      {/* ── บนเว็บร้าน: ลิงก์หน้าวัสดุ + ร้านไหนพูดถึงกี่รุ่น ── */}
      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="px-3.5 py-2.5 flex items-center gap-2 text-sm">
          <span className="text-slate-400 shrink-0">🔗 {tr("ลิงก์หน้าวัสดุ", "Page link")}</span>
          {edit?.key === "slug" ? (
            <div className="flex-1 min-w-0" onKeyDown={keys}>
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-400 font-mono">/materials/</span>
                <input autoFocus value={edit.draft.slug ?? ""} onChange={(e) => setDraft("slug", e.target.value)} placeholder="nappa-leather" className={`${inputCls} font-mono`} />
              </div>
              <div className="text-[11px] text-slate-400 mt-1">{tr("อังกฤษตัวเล็ก/ตัวเลข/ขีด · ว่าง = สร้างจากชื่ออังกฤษให้เอง · ⚠️ เปลี่ยนแล้วลิงก์เดิมที่เคยแชร์จะเปิดไม่ได้", "lowercase letters, numbers, dashes · empty = made from the English name · ⚠️ old shared links stop working")}</div>
              {editorActions}
            </div>
          ) : (
            <>
              <code className="flex-1 min-w-0 truncate text-xs text-slate-600">/materials/{slug || "—"}</code>
              {editBtn("slug", tr("เปลี่ยน", "Change"))}
            </>
          )}
        </div>
        {usage === null ? (
          <div className="px-3.5 py-2.5 text-xs text-slate-400">{tr("กำลังนับสินค้าที่พูดถึงวัสดุนี้…", "Counting products that mention this material…")}</div>
        ) : "error" in usage ? (
          <div className="px-3.5 py-2.5 text-xs text-red-600">⚠ {usage.error}</div>
        ) : usage.shops.length === 0 ? (
          <div className="px-3.5 py-2.5 text-xs text-slate-400">{tr("ยังไม่มีร้านที่เผยแพร่สินค้าบนเว็บ", "No shop has published products yet")}</div>
        ) : usage.shops.map((sh) => {
          const url = sh.siteUrl && slug ? `${sh.siteUrl}/materials/${slug}` : null;
          return (
            <div key={sh.id} className="px-3.5 py-2 flex items-center gap-2 text-sm">
              <div className="flex-1 min-w-0 leading-snug">
                <span className="font-medium text-slate-700 mr-1.5">{sh.name}</span>
                <span className={`text-xs ${sh.count ? "text-slate-500" : "text-slate-400"}`}>
                  {sh.count
                    ? tr(`พูดถึงใน ${sh.count} จาก ${sh.listed} รุ่น`, `mentioned in ${sh.count} of ${sh.listed}`)
                    : tr(`ไม่พบในสินค้า ${sh.listed} รุ่นของร้านนี้`, `not found in this shop's ${sh.listed} products`)}
                </span>
              </div>
              {hasPage && url && (
                <>
                  <CopyButton value={url} title={tr("คัดลอกลิงก์", "Copy link")} className="w-6 h-6" />
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="h-7 px-2.5 inline-flex items-center text-xs rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0">{tr("เปิดดู ↗", "Open ↗")}</a>
                </>
              )}
            </div>
          );
        })}
      </div>

      {section(
        tr("คำอธิบายบนเว็บ", "Web description"),
        tr("มีคำอธิบายแล้ว ชื่อวัสดุในคำอธิบายสินค้าบนเว็บจะกดลิงก์มาหน้านี้ได้", "Once written, material names in product descriptions link to this page"),
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {textBox("description", { rows: 6 })}
          {textBox("description_en", { rows: 6 })}
        </div>,
        canEdit && missingEn > 0 && !edit ? (
          <button type="button" onClick={() => void translatePairs(PAIRS)} disabled={translating}
            title={tr("แปลไทย → อังกฤษ เฉพาะช่องอังกฤษที่ยังว่าง (ชื่อ/คำอธิบาย/วิธีดูแล) แล้วบันทึกเลย", "Translate Thai → empty English fields (name/description/care) and save")}
            className="h-8 px-3 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 shrink-0">
            {translating ? tr("กำลังแปล…", "Translating…") : tr(`🌐 แปลส่วนที่ขาด (${missingEn})`, `🌐 Translate missing (${missingEn})`)}
          </button>
        ) : undefined,
      )}

      {section(
        tr("วิธีดูแลรักษา", "Care"),
        tr("ไม่ใส่ก็ได้ — มีแล้วหน้าวัสดุโชว์หัวข้อ \"วิธีดูแลรักษา\"", "Optional — shown as a \"Care\" section on the material page"),
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {textBox("care", { rows: 4, optional: true })}
          {textBox("care_en", { rows: 4, optional: true })}
        </div>,
      )}

      {section(
        tr("คำที่ใช้จับคู่", "Matching words"),
        tr("ถ้าคำอธิบายสินค้ามีคำเหล่านี้ เว็บจะทำลิงก์มาหน้านี้ให้เอง", "Product descriptions containing these words link here automatically"),
        edit?.key === "aliases" ? (
          <div onKeyDown={keys}>
            <input autoFocus value={edit.draft.aliases ?? ""} onChange={(e) => setDraft("aliases", e.target.value)}
              placeholder={tr("หนังนัปป้า, Nappa leather", "Nappa leather, nappa")} className={inputCls} />
            <div className="text-[11px] text-slate-400 mt-1">{tr("คำเรียกอื่น คั่นด้วยจุลภาค (,) — ชื่อไทย/อังกฤษ ใช้จับให้อยู่แล้ว ไม่ต้องใส่ซ้ำ", "Other names, comma-separated — the Thai/English names already match")}</div>
            {editorActions}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 items-center">
            {s(v.name) && chip(s(v.name), tr("ชื่อหลัก", "main name"), true)}
            {s(v.name_en) && chip(s(v.name_en), tr("ชื่ออังกฤษ", "English name"))}
            {aliasList.map((a) => chip(a))}
            {canEdit && !edit && (
              <button type="button" onClick={() => open("aliases")}
                className="h-7 px-2.5 rounded-full text-xs border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600">
                {aliasList.length ? tr("✏️ แก้คำเรียกอื่น", "✏️ Edit other names") : tr("＋ เพิ่มคำเรียกอื่น", "＋ Add other names")}
              </button>
            )}
          </div>
        ),
      )}

      {/* ข้อมูลเล็ก ๆ ท้ายหน้า */}
      <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-400">
        {edit?.key === "sort_order" ? (
          <span className="inline-flex items-center gap-1.5" onKeyDown={keys}>
            {tr("ลำดับการแสดง", "Display order")}
            <input autoFocus type="number" value={edit.draft.sort_order ?? ""} onChange={(e) => setDraft("sort_order", e.target.value)}
              className="w-20 h-7 px-2 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-400" />
            <button type="button" onClick={() => void saveEdit()} disabled={saving} className="h-7 px-2 rounded-md bg-orange-600 text-white disabled:opacity-50">{tr("บันทึก", "Save")}</button>
            <button type="button" onClick={() => setEdit(null)} className="h-7 px-2 rounded-md border border-slate-200 text-slate-500">{tr("ยกเลิก", "Cancel")}</button>
            {edit.err && <span className="text-red-600">⚠ {edit.err}</span>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            {tr("ลำดับการแสดง", "Display order")} {v.sort_order == null ? "—" : String(v.sort_order)}
            {editBtn("sort_order")}
          </span>
        )}
        {fmtDate(v.created_at) && <span>{tr("สร้าง", "Created")} {fmtDate(v.created_at)}</span>}
        {fmtDate(v.updated_at) && <span>{tr("แก้ล่าสุด", "Updated")} {fmtDate(v.updated_at)}</span>}
      </div>

      <ConfirmDialog open={confirmOff} onClose={() => setConfirmOff(false)}
        title={tr("ปิดใช้วัสดุนี้?", "Turn this material off?")}
        message={tr("ลิงก์ไปหน้าวัสดุนี้บนเว็บร้านจะหายไป และเลือกวัสดุนี้ในป๊อปแทรกรายละเอียดไม่ได้ (เปิดกลับได้ทุกเมื่อ)",
          "Links to this material page disappear from the shop websites (you can turn it back on anytime)")}
        confirmText={tr("ปิดใช้", "Turn off")} cancelText={tr("ยกเลิก", "Cancel")} variant="danger"
        onConfirm={() => { setConfirmOff(false); void commit({ is_active: false }, tr("ปิดใช้แล้ว", "Turned off")); }} />
    </div>
  );
}
