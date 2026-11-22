"use client";

// ============================================================
// แท็บ "คอนเทนต์" ในงาน (Task) — คอนเทนต์โซเชียลที่พ่วงกับงานนี้ (task_id)
// reuse ของกลางเดิม: ContentDrawer (แก้แคปชั่น/ตั้งเวลา/ฯลฯ) · 1 งาน → หลายคอนเทนต์
// สร้างใหม่ผูกงานอัตโนมัติ · แนบคอนเทนต์ที่มีอยู่ · ถอดออกจากงาน
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ERPModal } from "@/components/modal";
import { ERPInput, ERPSelect } from "@/components/form";
import { useT } from "@/components/i18n";
import { useCreativeOptions, platformLabel } from "./use-options";
import { askConfirm } from "@/components/modal/ask-dialog";
import { type PushToast, useToast } from "@/components/toast";
import {
  CONTENT_STATUS_META, CONTENT_DONE, POST_TYPES, contentStatusLabel,
  listContent, createContent, updateContent, addContentAttachment,
  type ContentItem, type ContentStatus, type BrandOption, postTypeLabel,
} from "./data";

import { loadBriefBoardItems, type BriefImage, type BriefNote } from "./brief-board-items";
import { r2ImageUrl } from "@/lib/r2-image";
import { TASK_CONTENT_CHANGED } from "@/lib/task-content-events";

const ContentDrawer = dynamic(() => import("./content/content-drawer").then((m) => m.ContentDrawer), { ssr: false });
type ToastFn = PushToast;   // ชนิดกลาง (components/toast)

function StatusChip({ status }: { status: ContentStatus }) {
  useT();   // subscribe ภาษา
  const m = CONTENT_STATUS_META[status] ?? CONTENT_STATUS_META.draft;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{contentStatusLabel(status)}</span>;
}

export function TaskContentTab({ taskId, brandId, brands, pushToast, taskTitle, compact = false, onChanged }: {
  taskId: string; brandId: string | null; brands: BrandOption[]; pushToast: ToastFn;
  /** ชื่องาน (ตั้งชื่อคอนเทนต์ที่สร้างจากกระดานบรีฟ) */
  taskTitle?: string;
  /** โหมดย่อ = กล่องรายการคอนเทนต์บนสุดของลิ้นชักงาน (คู่กับ Parent SKU · เจ้าของเลือก 2026-11-22) — เปลี่ยนสถานะจากรายการได้ */
  compact?: boolean;
  /** แจ้งหน้าแม่เมื่อรายการ/สถานะคอนเทนต์เปลี่ยน (ให้แถบความคืบหน้าคำนวณใหม่) */
  onChanged?: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { platforms } = useCreativeOptions();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const onChangedRef = useRef(onChanged); onChangedRef.current = onChanged;
  const loadedOnce = useRef(false);
  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    try { setItems(await listContent({ task_id: taskId })); if (loadedOnce.current) onChangedRef.current?.(); loadedOnce.current = true; } catch (e) { pushToast("error", (e as Error).message); }
    finally { setLoading(false); }
  }, [taskId, pushToast]);
  useEffect(() => { loadedOnce.current = false; load(); }, [load]);
  // คอนเทนต์ถูกสร้าง/เปลี่ยนจากที่อื่น (เช่น กระดานบรีฟ) → โหลดรายการใหม่
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<{ taskId?: string }>).detail?.taskId === taskId) void load(); };
    window.addEventListener(TASK_CONTENT_CHANGED, on);
    return () => window.removeEventListener(TASK_CONTENT_CHANGED, on);
  }, [taskId, load]);

  // เปลี่ยนสถานะจากรายการ (โหมดย่อ) + ปุ่มย้อนกลับในแจ้งผล · ประวัติ (audit) บันทึกฝั่ง server
  const changeStatus = async (c: ContentItem, to: ContentStatus) => {
    if (to === c.status) return;
    const from = c.status;
    setItems((xs) => xs.map((x) => (x.id === c.id ? { ...x, status: to } : x)));
    try {
      await updateContent(c.id, { status: to }); await load();
      toast.undo(t(`"${c.title}" → ${contentStatusLabel(to)}`, `"${c.title}" → ${contentStatusLabel(to)}`), async () => {
        try { await updateContent(c.id, { status: from }); await load(); } catch (e) { pushToast("error", (e as Error).message); }
      });
    } catch (e) { pushToast("error", (e as Error).message); await load(); }
  };

  // สร้างคอนเทนต์ใหม่ผูกงานนี้ (brand ตามงาน) → เปิด drawer ให้กรอกแคปชั่นต่อ
  const [form, setForm] = useState({ title: "", post_type: "image", platforms: [] as string[] });
  const [saving, setSaving] = useState(false);
  // โหมด "จากกระดานบรีฟ" (เจ้าของเลือก 2026-11-21): ติ๊กรูปบนกระดาน → แนบเข้าคอนเทนต์ · โน้ตบนกระดาน → ร่างแคปชั่น
  const [brief, setBrief] = useState<{ images: BriefImage[]; notes: BriefNote[] } | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [pickImg, setPickImg] = useState<Set<string>>(new Set());
  const [captionDraft, setCaptionDraft] = useState("");
  const openCreate = () => { setBrief(null); setForm({ title: "", post_type: "image", platforms: [] }); setCreateOpen(true); };
  const openFromBrief = async () => {
    setForm({ title: taskTitle ? `${taskTitle} — ${t("จากบรีฟ", "from brief")}` : "", post_type: "image", platforms: [] });
    setBrief({ images: [], notes: [] }); setPickImg(new Set()); setCaptionDraft(""); setCreateOpen(true); setBriefLoading(true);
    try {
      const b = await loadBriefBoardItems(taskId);
      setBrief(b); setPickImg(new Set(b.images.map((x) => x.r2_key)));
      setCaptionDraft(b.notes.map((n) => n.text).join("\n"));
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setBriefLoading(false); }
  };
  const doCreate = async () => {
    if (!form.title.trim()) { pushToast("error", t("กรุณาใส่ชื่อคอนเทนต์", "Please enter a content title")); return; }
    setSaving(true);
    try {
      const cap = captionDraft.trim();
      const { id } = await createContent({
        title: form.title.trim(), task_id: taskId, brand_id: brandId, post_type: form.post_type || null, platforms: form.platforms,
        ...(brief ? { brief: cap || null, captions: cap ? form.platforms.map((p) => ({ platform: p, caption: cap })) : undefined } : {}),
      });
      // รูปจากกระดานบรีฟ → แนบด้วย r2 key เดิม (ไม่อัปซ้ำ · ไม่เปลือง R2 เพิ่ม)
      if (brief) {
        let failed = 0;
        for (const img of brief.images.filter((x) => pickImg.has(x.r2_key))) {
          try { await addContentAttachment(id, { kind: "image", r2_key: img.r2_key, file_name: img.r2_key.split("/").pop() ?? null }); } catch { failed++; }
        }
        if (failed) pushToast("error", t(`แนบรูปไม่สำเร็จ ${failed} รูป — แนบเพิ่มในคอนเทนต์ได้`, `${failed} image(s) failed to attach — add them in the content`));
      }
      setCreateOpen(false); await load(); setOpenId(id);
      pushToast("success", brief ? t("สร้างคอนเทนต์จากกระดานบรีฟแล้ว — ตรวจแคปชั่นต่อได้เลย", "Content created from the brief board — review captions next") : t("สร้างคอนเทนต์แล้ว — กรอกแคปชั่นต่อได้เลย", "Content created — add captions next"));
    } catch (e) { pushToast("error", (e as Error).message); } finally { setSaving(false); }
  };

  const detach = async (c: ContentItem) => {
    if (!(await askConfirm({ title: t(`ถอด "${c.title}" ออกจากงานนี้? (คอนเทนต์ไม่ถูกลบ)`, `Remove "${c.title}" from this task? (content is kept)`), variant: "danger" }))) return;
    try { await updateContent(c.id, { task_id: null }); await load(); pushToast("info", t("ถอดออกจากงานแล้ว", "Removed from task")); }
    catch (e) { pushToast("error", (e as Error).message); }
  };

  const live = items.filter((c) => c.status !== "cancelled");
  const doneCount = live.filter((c) => CONTENT_DONE.has(c.status)).length;

  return (
    <div className={compact ? "space-y-1.5" : "p-5 space-y-3"}>
      {compact ? (<>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{t("คอนเทนต์", "Content")}{live.length > 0 && <> · <span className={doneCount === live.length ? "text-emerald-600 font-medium" : "text-slate-600 font-medium"}>{doneCount}/{live.length}</span> {t("พร้อม", "ready")}</>}</span>
          <span className="ml-auto inline-flex items-center gap-1">
            <button onClick={() => void openFromBrief()} title={t("สร้างคอนเทนต์จากรูป/โน้ตบนกระดานบรีฟ", "Create content from the brief board")} className="h-6 px-2 text-[11px] text-violet-700 border border-violet-200 bg-violet-50 rounded-md hover:bg-violet-100">🎨 {t("จากบรีฟ", "From brief")}</button>
            <button onClick={() => setAttachOpen(true)} title={t("แนบคอนเทนต์ที่มีอยู่", "Attach existing content")} className="h-6 px-2 text-[11px] text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">🔗</button>
            <button onClick={openCreate} className="h-6 px-2 text-[11px] text-white bg-violet-600 rounded-md hover:bg-violet-700">＋ {t("เพิ่ม", "Add")}</button>
          </span>
        </div>
        {loading ? <div className="h-16 rounded-lg bg-slate-100 animate-pulse" />
          : items.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-xs text-slate-400">{t("ยังไม่มีคอนเทนต์ — กด ＋ เพิ่ม หรือสร้างจากกระดานบรีฟ", "No content yet — add one or create from the brief board")}</p>
          : (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {items.map((c) => (
                <div key={c.id} className={`flex items-center gap-2 px-2.5 py-1.5 ${c.status === "cancelled" ? "opacity-50" : ""}`}>
                  <button onClick={() => setOpenId(c.id)} className="min-w-0 flex-1 text-left text-[13px] text-slate-700 hover:text-violet-700 truncate" title={c.title}>{c.title}</button>
                  <select value={c.status} onChange={(e) => void changeStatus(c, e.target.value as ContentStatus)} aria-label={t("สถานะคอนเทนต์", "Content status")}
                    className={`h-6 shrink-0 rounded-full border px-2 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-violet-200 ${(CONTENT_STATUS_META[c.status] ?? CONTENT_STATUS_META.draft).cls}`}>
                    {(Object.keys(CONTENT_STATUS_META) as ContentStatus[]).map((k) => <option key={k} value={k}>{contentStatusLabel(k)}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
      </>) : (<>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">📱 {t("คอนเทนต์ของงานนี้", "Content for this task")} ({items.length})</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setAttachOpen(true)} className="h-8 px-3 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">🔗 {t("แนบที่มีอยู่", "Attach existing")}</button>
          <button onClick={() => void openFromBrief()} title={t("หยิบรูป/โน้ตจากกระดานบรีฟมาสร้างคอนเทนต์", "Create content from the brief board's images and notes")} className="h-8 px-3 text-xs font-medium text-violet-700 border border-violet-200 bg-violet-50 rounded-lg hover:bg-violet-100">🎨 {t("จากกระดานบรีฟ", "From brief board")}</button>
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
                      {c.post_type && <span className="text-[10px] text-slate-400">· {postTypeLabel(c.post_type)}</span>}
                      {c.scheduled_at && <span className="text-[10px] text-slate-400">· 🗓 {String(c.scheduled_at).slice(0, 16).replace("T", " ")}</span>}
                    </div>
                  </button>
                  <button onClick={() => detach(c)} title={t("ถอดออกจากงาน", "Remove from task")} className="text-slate-300 hover:text-red-500 text-sm shrink-0">⊘</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>)}

      {/* สร้างคอนเทนต์ใหม่ (ผูกงานนี้) */}
      <ERPModal open={createOpen} onClose={() => setCreateOpen(false)} title={brief ? t("สร้างคอนเทนต์จากกระดานบรีฟ", "New content from brief board") : t("สร้างคอนเทนต์ (พ่วงงานนี้)", "New content (linked to this task)")} size={brief ? "lg" : "md"}
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
          {brief && (briefLoading ? <p className="text-sm text-slate-400">{t("กำลังโหลดกระดานบรีฟ…", "Loading brief board…")}</p> : (<>
            <div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">{t("รูปจากกระดานบรีฟ", "Images from brief board")} ({pickImg.size}/{brief.images.length})</label>
                {brief.images.length > 0 && <button type="button" onClick={() => setPickImg(pickImg.size === brief.images.length ? new Set() : new Set(brief.images.map((x) => x.r2_key)))} className="ml-auto text-[11px] text-violet-600 hover:underline">{pickImg.size === brief.images.length ? t("ไม่เลือกเลย", "Select none") : t("เลือกทั้งหมด", "Select all")}</button>}
              </div>
              {brief.images.length === 0 ? <p className="text-xs text-slate-400 mt-1">{t("กระดานบรีฟยังไม่มีรูปที่เก็บไว้ (ลิงก์ Pinterest/TikTok ไม่นับ)", "The brief board has no stored images yet (Pinterest/TikTok links don't count)")}</p> : (
                <div className="mt-1 grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {brief.images.map((img) => { const on = pickImg.has(img.r2_key); return (
                    <button key={img.r2_key} type="button" onClick={() => setPickImg((s) => { const n = new Set(s); if (on) n.delete(img.r2_key); else n.add(img.r2_key); return n; })}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 ${on ? "border-violet-500" : "border-transparent opacity-60"}`}>
                      <img src={r2ImageUrl(img.r2_key, 200) ?? ""} alt="" className="h-full w-full object-cover bg-slate-100" />
                      {on && <span className="absolute right-1 top-1 h-4 w-4 rounded-full bg-violet-600 text-[10px] leading-4 text-white">✓</span>}
                    </button>
                  ); })}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-400">{t("ร่างแคปชั่น (จากโน้ตบนกระดาน · ใส่ทุกแพลตฟอร์มที่เลือก แก้ต่อได้ในหน้าถัดไป)", "Caption draft (from board notes · used for every selected platform, editable next)")}</label>
              <textarea value={captionDraft} onChange={(e) => setCaptionDraft(e.target.value)} rows={4} placeholder={t("กระดานยังไม่มีโน้ต — พิมพ์ร่างแคปชั่นเองได้", "No notes on the board — type a draft caption")}
                className="w-full mt-1 text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-violet-200" />
            </div>
          </>))}
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
