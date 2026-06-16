"use client";

// ============================================================
// KnowledgeDrawer (ของกลางในโมดูล) — คลังความรู้ หน้า HTML แก้ไขได้
// ใช้ที่: หน้า /tasks (ปุ่ม 📚 ความรู้) · เก็บเป็น HTML ผ่าน RichTextEditor กลาง
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { listKnowledge, createKnowledge, updateKnowledge, deleteKnowledge, type KnowledgePage } from "./data";
import { RichTextEditor } from "@/components/rich-text";
import { useT } from "@/components/i18n";

type ToastType = "success" | "error" | "info";

export function KnowledgeDrawer({ onClose, canEdit, pushToast }: { onClose: () => void; canEdit: boolean; pushToast: (type: ToastType, m: string) => void }) {
  const t = useT();
  const [pages, setPages] = useState<KnowledgePage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ title: string; body_html: string }>({ title: "", body_html: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const ps = await listKnowledge(); setPages(ps); setActiveId((cur) => cur ?? ps[0]?.id ?? null); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setLoading(false); }
  }, [pushToast]);
  useEffect(() => { load(); }, [load]);

  const active = pages.find((p) => p.id === activeId) ?? null;

  const startEdit = () => { if (!active) return; setDraft({ title: active.title, body_html: active.body_html ?? "" }); setEditing(true); };
  const save = async () => {
    if (!active) return; setBusy(true);
    try { await updateKnowledge(active.id, { title: draft.title.trim() || t("ไม่มีชื่อ","Untitled"), body_html: draft.body_html }); setEditing(false); await load(); pushToast("success", t("บันทึกแล้ว","Saved")); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const addPage = async () => {
    setBusy(true);
    try { const p = await createKnowledge(t("หน้าใหม่","New page")); await load(); setActiveId(p.id); setDraft({ title: p.title, body_html: "" }); setEditing(true); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!active || !window.confirm(`${t("ลบหน้า","Delete page")} "${active.title}" ?`)) return;
    setBusy(true);
    try { await deleteKnowledge(active.id); setActiveId(null); setEditing(false); await load(); pushToast("info", t("ลบแล้ว","Deleted")); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[860px] max-w-[97vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h3 className="text-base font-semibold text-slate-900">📚 {t("คลังความรู้","Knowledge")}</h3>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* รายการหน้า */}
          <div className="w-60 shrink-0 border-r border-slate-100 flex flex-col">
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {loading ? <p className="text-sm text-slate-400 p-3">{t("กำลังโหลด...","Loading...")}</p>
                : pages.length === 0 ? <p className="text-sm text-slate-400 p-3 italic">{t("ยังไม่มีหน้าความรู้","No knowledge pages yet")}</p>
                : pages.map((p) => (
                  <button key={p.id} onClick={() => { setActiveId(p.id); setEditing(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate ${p.id === activeId ? "bg-violet-50 text-violet-800 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>
                    {p.title}
                  </button>
                ))}
            </div>
            {canEdit && <button onClick={addPage} disabled={busy} className="m-2 h-9 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-50">＋ {t("เพิ่มหน้า","Add page")}</button>}
          </div>

          {/* เนื้อหา */}
          <div className="flex-1 overflow-y-auto p-6">
            {!active ? (
              <p className="text-sm text-slate-400 italic">{t("เลือกหน้าจากรายการด้านซ้าย","Select a page from the list on the left")}</p>
            ) : editing ? (
              <div className="space-y-3">
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="w-full text-lg font-semibold border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-200" placeholder={t("หัวข้อ","Title")} />
                <RichTextEditor value={draft.body_html} onChange={(html) => setDraft({ ...draft, body_html: html })} minHeight={320} placeholder={t("พิมพ์เนื้อหา ใส่หัวข้อ/ลิสต์/ลิงก์/รูปได้...","Type content — headings, lists, links, images...")} />
                <div className="flex gap-2">
                  <button onClick={save} disabled={busy} className="px-4 h-9 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50">{busy ? t("กำลังบันทึก...","Saving...") : t("บันทึก","Save")}</button>
                  <button onClick={() => setEditing(false)} disabled={busy} className="px-4 h-9 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก","Cancel")}</button>
                  <button onClick={remove} disabled={busy} className="ml-auto px-3 h-9 rounded-lg text-sm text-red-600 hover:bg-red-50">{t("ลบหน้า","Delete page")}</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="text-xl font-bold text-slate-900">{active.title}</h2>
                  {canEdit && <button onClick={startEdit} className="h-8 px-2.5 shrink-0 flex items-center gap-1 rounded-md text-sm text-slate-600 hover:text-violet-700 hover:bg-violet-50 border border-slate-200">✏️ {t("แก้ไข","Edit")}</button>}
                </div>
                {active.body_html ? <RichTextEditor value={active.body_html} onChange={() => {}} editable={false} />
                  : <p className="text-sm text-slate-400 italic">{t("หน้านี้ยังไม่มีเนื้อหา","This page has no content yet")}{canEdit && ` — ${t("กดแก้ไขเพื่อเพิ่ม","click Edit to add content")}`}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
