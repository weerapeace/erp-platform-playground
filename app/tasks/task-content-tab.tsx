"use client";

// ============================================================
// แท็บ "คอนเทนต์" ในงาน (Task) — คอนเทนต์โซเชียลที่พ่วงกับงานนี้ (task_id)
// reuse ของกลางเดิม: ContentDrawer (แก้แคปชั่น/ตั้งเวลา/ฯลฯ) · 1 งาน → หลายคอนเทนต์
// สร้างใหม่ผูกงานอัตโนมัติ · แนบคอนเทนต์ที่มีอยู่ · ถอดออกจากงาน
// ============================================================

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ERPModal } from "@/components/modal";
import { ERPInput, ERPSelect } from "@/components/form";
import { useT } from "@/components/i18n";
import { useCreativeOptions, platformLabel } from "./use-options";
import {
  CONTENT_STATUS_META, POST_TYPES,
  listContent, createContent, updateContent,
  type ContentItem, type ContentStatus, type BrandOption,
} from "./data";

const ContentDrawer = dynamic(() => import("./content/content").then((m) => m.ContentDrawer), { ssr: false });
const POST_TYPE_LABEL = Object.fromEntries(POST_TYPES.map((p) => [p.value, p.label]));
type ToastFn = (type: "success" | "error" | "info", m: string) => void;

function StatusChip({ status }: { status: ContentStatus }) {
  const m = CONTENT_STATUS_META[status] ?? CONTENT_STATUS_META.draft;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span>;
}

export function TaskContentTab({ taskId, brandId, brands, pushToast }: {
  taskId: string; brandId: string | null; brands: BrandOption[]; pushToast: ToastFn;
}) {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listContent({ task_id: taskId })); } catch (e) { pushToast("error", (e as Error).message); }
    finally { setLoading(false); }
  }, [taskId, pushToast]);
  useEffect(() => { load(); }, [load]);

  // สร้างคอนเทนต์ใหม่ผูกงานนี้ (brand ตามงาน) → เปิด drawer ให้กรอกแคปชั่นต่อ
  const [form, setForm] = useState({ title: "", post_type: "image", platforms: [] as string[] });
  const [saving, setSaving] = useState(false);
  const openCreate = () => { setForm({ title: "", post_type: "image", platforms: [] }); setCreateOpen(true); };
  const doCreate = async () => {
    if (!form.title.trim()) { pushToast("error", t("กรุณาใส่ชื่อคอนเทนต์", "Please enter a content title")); return; }
    setSaving(true);
    try {
      const { id } = await createContent({ title: form.title.trim(), task_id: taskId, brand_id: brandId, post_type: form.post_type || null, platforms: form.platforms });
      setCreateOpen(false); await load(); setOpenId(id);
      pushToast("success", t("สร้างคอนเทนต์แล้ว — กรอกแคปชั่นต่อได้เลย", "Content created — add captions next"));
    } catch (e) { pushToast("error", (e as Error).message); } finally { setSaving(false); }
  };

  const detach = async (c: ContentItem) => {
    if (!window.confirm(t(`ถอด "${c.title}" ออกจากงานนี้? (คอนเทนต์ไม่ถูกลบ)`, `Remove "${c.title}" from this task? (content is kept)`))) return;
    try { await updateContent(c.id, { task_id: null }); await load(); pushToast("info", t("ถอดออกจากงานแล้ว", "Removed from task")); }
    catch (e) { pushToast("error", (e as Error).message); }
  };

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">📱 {t("คอนเทนต์ของงานนี้", "Content for this task")} ({items.length})</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setAttachOpen(true)} className="h-8 px-3 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">🔗 {t("แนบที่มีอยู่", "Attach existing")}</button>
          <button onClick={openCreate} className="h-8 px-3 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">＋ {t("สร้างคอนเทนต์", "New content")}</button>
        </div>
      </div>

      {loading ? <div className="py-10 text-center text-slate-400 text-sm">{t("กำลังโหลด...", "Loading...")}</div>
        : items.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center">
            <div className="text-3xl mb-1">📱</div>
            <p className="text-sm text-slate-500">{t("ยังไม่มีคอนเทนต์พ่วงงานนี้", "No content linked to this task yet")}</p>
            <button onClick={openCreate} className="mt-3 h-9 px-4 bg-violet-50 text-violet-700 text-sm font-medium rounded-lg hover:bg-violet-100">＋ {t("สร้างคอนเทนต์", "New content")}</button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((c) => (
              <div key={c.id} className="border border-slate-200 rounded-lg p-3 hover:border-violet-300 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => setOpenId(c.id)} className="min-w-0 text-left flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusChip status={c.status} />
                      <span className="font-mono text-[10px] text-slate-400">{c.content_no}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{c.title}</p>
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {(c.platforms ?? []).map((p) => <span key={p} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{platformLabel(p)}</span>)}
                      {c.post_type && <span className="text-[10px] text-slate-400">· {POST_TYPE_LABEL[c.post_type] ?? c.post_type}</span>}
                      {c.scheduled_at && <span className="text-[10px] text-slate-400">· 🗓 {String(c.scheduled_at).slice(0, 16).replace("T", " ")}</span>}
                    </div>
                  </button>
                  <button onClick={() => detach(c)} title={t("ถอดออกจากงาน", "Remove from task")} className="text-slate-300 hover:text-red-500 text-sm shrink-0">⊘</button>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* สร้างคอนเทนต์ใหม่ (ผูกงานนี้) */}
      <ERPModal open={createOpen} onClose={() => setCreateOpen(false)} title={t("สร้างคอนเทนต์ (พ่วงงานนี้)", "New content (linked to this task)")} size="md"
        footer={<>
          <button onClick={() => setCreateOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={doCreate} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังสร้าง...", "Creating...") : t("สร้าง", "Create")}</button>
        </>}>
        <div className="space-y-3">
          <div><label className="text-xs text-slate-400">{t("ชื่อคอนเทนต์", "Content title")}</label><ERPInput value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("เช่น โพสต์โปรโมตสินค้า", "e.g. Promo post")} /></div>
          <div><label className="text-xs text-slate-400">{t("ประเภทโพสต์", "Post type")}</label><ERPSelect value={form.post_type} options={POST_TYPES} onChange={(e) => setForm((f) => ({ ...f, post_type: e.target.value }))} /></div>
          <div>
            <label className="text-xs text-slate-400">{t("แพลตฟอร์ม", "Platforms")}</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {platforms.map((p) => { const on = form.platforms.includes(p.value); return (
                <button key={p.value} type="button" onClick={() => setForm((f) => ({ ...f, platforms: on ? f.platforms.filter((x) => x !== p.value) : [...f.platforms, p.value] }))}
                  className={`px-2.5 py-1 rounded-full text-xs border ${on ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{p.label}</button>
              ); })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{t("เลือกแพลตฟอร์มก่อน แล้วค่อยเขียนแคปชั่นต่อแพลตฟอร์มในหน้าถัดไป", "Pick platforms first, then write per-platform captions next")}</p>
          </div>
        </div>
      </ERPModal>

      {/* แนบคอนเทนต์ที่มีอยู่ (ยังไม่ผูกงาน) */}
      {attachOpen && <AttachContentModal onClose={() => setAttachOpen(false)} onAttached={async () => { setAttachOpen(false); await load(); }} taskId={taskId} pushToast={pushToast} />}

      {/* แก้คอนเทนต์ — ของกลาง ContentDrawer */}
      {openId && <ContentDrawer contentId={openId} brands={brands} onClose={() => setOpenId(null)} onChanged={load} pushToast={pushToast} />}
    </div>
  );
}

// เลือกคอนเทนต์ที่ยังไม่ผูกงาน มาแนบกับงานนี้
function AttachContentModal({ taskId, onClose, onAttached, pushToast }: { taskId: string; onClose: () => void; onAttached: () => void; pushToast: ToastFn }) {
  const t = useT();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { (async () => { setLoading(true); try { setItems(await listContent({ unlinked: true })); } catch (e) { pushToast("error", (e as Error).message); } finally { setLoading(false); } })(); }, [pushToast]);
  const shown = items.filter((c) => !q.trim() || `${c.content_no ?? ""} ${c.title}`.toLowerCase().includes(q.trim().toLowerCase()));
  const attach = async (c: ContentItem) => {
    setBusy(c.id);
    try { await updateContent(c.id, { task_id: taskId }); pushToast("success", t("แนบคอนเทนต์แล้ว", "Content attached")); onAttached(); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(null); }
  };

  return (
    <ERPModal open onClose={onClose} title={t("แนบคอนเทนต์ที่มีอยู่", "Attach existing content")} size="md"
      footer={<button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหาคอนเทนต์...", "Search content...")} className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm mb-3" />
      {loading ? <div className="py-8 text-center text-slate-400 text-sm">{t("กำลังโหลด...", "Loading...")}</div>
        : shown.length === 0 ? <div className="py-8 text-center text-slate-400 text-sm">{t("ไม่มีคอนเทนต์ลอย (ที่ยังไม่ผูกงาน)", "No unlinked content available")}</div>
        : (
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {shown.map((c) => (
              <div key={c.id} className="flex items-center gap-2 border border-slate-100 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 truncate">{c.title}</p>
                  <span className="font-mono text-[10px] text-slate-400">{c.content_no}</span>
                </div>
                <button onClick={() => attach(c)} disabled={busy === c.id} className="h-8 px-3 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 shrink-0">{busy === c.id ? "..." : t("แนบ", "Attach")}</button>
              </div>
            ))}
          </div>
        )}
    </ERPModal>
  );
}
