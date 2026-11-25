"use client";
/**
 * /admin/themes/[id] — ตัวแก้ธีมแบบหน้าเต็ม (ธีมกลาง ERP เฟส 2 · เจ้าของเลือกแบบ A + ข้อ 1,2,3,5)
 *   ซ้าย: แผงปรับ 9 หมวด · ขวา: พรีวิว (ตัวอย่าง PC/มือถือ หรือ "หน้าจริง" ใน iframe)
 *   ข้อ 1 เตือนสีอ่านยาก + แก้ให้อัตโนมัติ · ข้อ 2 กดค้างที่พรีวิว = ดูฉบับที่เผยแพร่อยู่
 *   ข้อ 3 ย้อน/ทำซ้ำ (Ctrl+Z / Ctrl+Shift+Z) + ประวัติเวอร์ชัน (เอาเวอร์ชันเก่ามาเป็นร่าง)
 *   ข้อ 5 พรีวิวด้วยหน้าจริงของโมดูล (ตอนนี้หน้าจริงตามแค่สี — ที่เหลือมาเฟส 3–4)
 *   แก้แล้วบันทึกร่างอัตโนมัติ · คนอื่นยังเห็นของเดิมจนกด "เผยแพร่"
 *   ใช้ง่าย (2026-11-25 · B+C แบบ 1 + ข้อ 1–6): โหมดง่าย 5 อย่าง / ละเอียด 4 กลุ่ม · ค้นหาการตั้งค่า
 *   · คลิกชิ้นในพรีวิว = ป๊อปแก้เฉพาะชิ้น (มือถือ = แผงล่าง) · ชี้เห็นชื่อชิ้น + สวิตช์โหมดคลิกแก้
 *   · พรีวิวเทียบก่อน/หลังแบบลากเส้นกลาง · เผยแพร่ + เลือกแอปในขั้นเดียว
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog, Drawer } from "@/components/modal";
import { BottomSheet } from "@/components/modal/bottom-sheet";
import { PublishThemeDialog } from "@/components/erp-theme/publish-dialog";
import { refreshActiveThemes } from "@/components/erp-theme/active-themes";
import { ErrorState, LoadingState, EmptyState } from "@/components/state-views";
import { shortcutKey } from "@/lib/shortcut-key";
import { ThemePreview, type PreviewSample } from "@/components/erp-theme/preview";
import { PartQuickEditor, ThemeAdvancedPanel, ThemeEasyPanel } from "@/components/erp-theme/editor-panel";
import { PART_INFO, groupOfCat, searchSettings, type AdvGroupKey, type EditorCategory, type PreviewPart } from "@/lib/erp-theme-easy";
import { THEME_PREVIEW_MSG, themePreviewMessage } from "@/components/erp-theme/preview-bridge";
import {
  autoFixContrast, mergeThemeConfig, normalizeThemeConfig, themeIssues, type ErpThemeConfig,
} from "@/lib/erp-theme-config";

type Version = { version: number; note: string | null; published_by_name: string | null; published_at: string; config: unknown };
type Theme = {
  id: string; name: string; draft_config: unknown; published_config: unknown; published_version: number;
  published_at: string | null; published_by_name: string | null; deleted_at: string | null; has_unpublished: boolean;
};

const REAL_PAGES = [
  { href: "/purchase-orders", label: "ใบสั่งซื้อ" },
  { href: "/master/skus", label: "สินค้า (SKU)" },
  { href: "/tasks", label: "งาน Creative" },
  { href: "/apps", label: "หน้าแรกแอป" },
];
const when = (d: string) => new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ThemeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const canView = usePermission("theme.view");
  const canEdit = usePermission("theme.edit");
  const canPublish = usePermission("theme.publish");
  const toast = useToast();

  const [theme, setTheme] = useState<Theme | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState<ErpThemeConfig | null>(null);
  const [name, setName] = useState("");
  // แผง: โหมดง่าย / ละเอียด (จำต่อเครื่อง) · กลุ่มที่เปิด · หมวดที่ให้เด่น (จากค้นหา/ป๊อป)
  const [mode, setModeState] = useState<"easy" | "adv">("easy");
  useEffect(() => { try { if (localStorage.getItem("erp-theme-editor-mode") === "adv") setModeState("adv"); } catch { /* ข้าม */ } }, []);
  const setMode = (m: "easy" | "adv") => { setModeState(m); try { localStorage.setItem("erp-theme-editor-mode", m); } catch { /* ข้าม */ } };
  const [openGroup, setOpenGroup] = useState<AdvGroupKey | null>("look");
  const [focusCat, setFocusCat] = useState<EditorCategory | null>(null);
  const [q, setQ] = useState("");
  const goTo = (cat: EditorCategory) => { setMode("adv"); setOpenGroup(groupOfCat(cat)); setFocusCat(cat); setQ(""); };
  // คลิกแก้ในพรีวิว (C)
  const [editMode, setEditMode] = useState(true);
  const [pop, setPop] = useState<{ part: PreviewPart; x: number; y: number } | null>(null);
  const previewBox = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 1024); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  // เทียบก่อน/หลัง
  const [compare, setCompare] = useState(false);
  const [split, setSplit] = useState(50);
  const [showPublished, setShowPublished] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [device, setDevice] = useState<"pc" | "mobile">("pc");
  const [sample, setSample] = useState<PreviewSample>("purchase");
  const [view, setView] = useState<"sample" | "real">("sample");
  const [realHref, setRealHref] = useState(REAL_PAGES[0].href);
  const [dark, setDark] = useState(false);
  const [replay, setReplay] = useState(0);
  const [save, setSave] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [histOpen, setHistOpen] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("history") === "1") setHistOpen(true); }, []);
  const [peek, setPeek] = useState<Version | null>(null);
  const [confirm, setConfirm] = useState<null | "publish" | "discard">(null);
  const [busy, setBusy] = useState(false);

  // ── ย้อน/ทำซ้ำ ─────────────────────────────
  const undo = useRef<ErpThemeConfig[]>([]);
  const redo = useRef<ErpThemeConfig[]>([]);
  const lastPush = useRef(0);
  const [, force] = useState(0);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await apiFetch(`/api/themes/${id}`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setTheme(j.data); setVersions(j.versions ?? []);
      setCfg(normalizeThemeConfig(j.data.draft_config)); setName(j.data.name);
      undo.current = []; redo.current = [];
    } catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { if (canView) void load(); }, [canView, load]);

  // ── บันทึกร่างอัตโนมัติ (หน่วง 800ms) ───────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCfg = useRef<ErpThemeConfig | null>(null);
  const flush = useCallback(async () => {
    const next = pendingCfg.current;
    if (!next) return;
    pendingCfg.current = null;
    setSave("saving");
    try {
      const r = await apiFetch(`/api/themes/${id}`, { method: "PATCH", body: JSON.stringify({ draft_config: next }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกร่างไม่สำเร็จ");
      setTheme((t) => (t ? { ...t, ...j.data } : j.data));
      setSave(pendingCfg.current ? "pending" : "saved");
    } catch (e) { setSave("error"); toast.error((e as Error).message); }
  }, [id, toast]);
  const queueSave = useCallback((next: ErpThemeConfig) => {
    pendingCfg.current = next;
    setSave("pending");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 800);
  }, [flush]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (pendingCfg.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const apply = useCallback((next: ErpThemeConfig, opts: { record?: boolean } = {}) => {
    setCfg((prev) => {
      if (prev && opts.record !== false) {
        const now = Date.now();
        if (now - lastPush.current > 500) { undo.current.push(prev); if (undo.current.length > 100) undo.current.shift(); }
        lastPush.current = now;
        redo.current = [];
      }
      return next;
    });
    queueSave(next);
    force((n) => n + 1);
  }, [queueSave]);

  const onPatch = useCallback((p: Record<string, unknown>) => { if (cfg) apply(mergeThemeConfig(cfg, p)); }, [cfg, apply]);
  const doUndo = useCallback(() => {
    const prev = undo.current.pop();
    if (!prev || !cfg) return;
    redo.current.push(cfg); apply(prev, { record: false });
  }, [cfg, apply]);
  const doRedo = useCallback(() => {
    const nxt = redo.current.pop();
    if (!nxt || !cfg) return;
    undo.current.push(cfg); apply(nxt, { record: false });
  }, [cfg, apply]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !canEdit) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && (t as HTMLInputElement).type !== "range" && (t as HTMLInputElement).type !== "checkbox") return;
      const k = shortcutKey(e).toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); doRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo, canEdit]);

  const saveName = async () => {
    const n = name.trim();
    if (!theme || !n || n === theme.name) { setName(theme?.name ?? ""); return; }
    const r = await apiFetch(`/api/themes/${id}`, { method: "PATCH", body: JSON.stringify({ name: n }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { toast.error(j.error || "เปลี่ยนชื่อไม่สำเร็จ"); setName(theme.name); return; }
    setTheme((t) => (t ? { ...t, name: n } : t));
    toast.success("เปลี่ยนชื่อแล้ว");
  };

  const post = async (body: Record<string, unknown>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await flush();
    const r = await apiFetch(`/api/themes/${id}`, { method: "POST", body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || "ทำรายการไม่สำเร็จ");
    return j.data as Theme;
  };
  const doPublish = async (note: string, changes: { scope: string; theme_id: string | null }[]) => {
    setBusy(true);
    try {
      await post({ action: "publish", note });
      if (changes.length) {
        const r = await apiFetch("/api/themes/assignments", { method: "PUT", body: JSON.stringify({ changes }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(`เผยแพร่แล้ว แต่เลือกแอปไม่สำเร็จ: ${j.error || "ลองใหม่ที่แท็บแอปใช้ธีมไหน"}`);
        const prev = j.previous as { scope: string; theme_id: string | null }[];
        toast.undo(`เผยแพร่แล้ว + เปลี่ยนธีมของ ${changes.length} ที่`, async () => {
          await apiFetch("/api/themes/assignments", { method: "PUT", body: JSON.stringify({ changes: prev }) });
          void refreshActiveThemes();
        });
      } else toast.success("เผยแพร่แล้ว — แอปที่ใช้ธีมนี้จะเห็นของใหม่");
      void refreshActiveThemes();
      await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); setConfirm(null); }
  };
  const doDiscard = async () => {
    setBusy(true);
    try { await post({ action: "discard_draft" }); toast.success("ทิ้งร่างแล้ว กลับไปเท่าฉบับที่เผยแพร่"); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); setConfirm(null); }
  };
  const restoreVersion = async (v: Version) => {
    if (!cfg) return;
    const before = cfg;
    setBusy(true);
    try {
      await post({ action: "restore_version", version: v.version });
      await load(); setPeek(null); setHistOpen(false);
      toast.undo(`เอาเวอร์ชัน ${v.version} มาเป็นร่างแล้ว (ยังไม่เผยแพร่)`, () => { apply(before); });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const published = useMemo(() => (theme?.published_config ? normalizeThemeConfig(theme.published_config) : null), [theme]);
  const shown = peek ? normalizeThemeConfig(peek.config) : showPublished && published ? published : cfg;
  const issues = useMemo(() => (cfg ? themeIssues(cfg) : []), [cfg]);

  // ── พรีวิวหน้าจริง: ส่งสีเข้า iframe ───────────
  const frameRef = useRef<HTMLIFrameElement>(null);
  const sendVars = useCallback(() => {
    if (!shown || !frameRef.current?.contentWindow) return;
    frameRef.current.contentWindow.postMessage(themePreviewMessage(shown, device === "mobile"), window.location.origin);
  }, [shown, device]);
  useEffect(() => { if (view === "real") sendVars(); }, [view, sendVars]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === `${THEME_PREVIEW_MSG}-ready`) sendVars(); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [sendVars]);

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ดูคลังธีม (theme.view)" /></PlaygroundShell>;
  if (err) return <PlaygroundShell><div className="max-w-3xl mx-auto p-6"><ErrorState title="เปิดธีมไม่สำเร็จ" hint={err} onRetry={() => void load()} /></div></PlaygroundShell>;
  if (!theme || !cfg) return <PlaygroundShell><div className="max-w-6xl mx-auto p-6"><LoadingState variant="cards" rows={4} /></div></PlaygroundShell>;

  const readOnly = !canEdit || !!theme.deleted_at || !!peek;
  const saveLabel = { idle: theme.has_unpublished ? "มีร่างที่ยังไม่เผยแพร่" : "ตรงกับฉบับที่เผยแพร่", pending: "รอบันทึก…", saving: "กำลังบันทึก…", saved: "บันทึกร่างแล้ว", error: "บันทึกไม่สำเร็จ" }[save];
  const btn = "h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1";
  const seg = (on: boolean) => `h-7 px-2.5 rounded-md text-xs ${on ? "bg-blue-50 text-blue-800 font-medium border border-blue-200" : "text-slate-600 border border-transparent hover:bg-slate-100"}`;
  const results = searchSettings(q);
  const onPartClick = (part: PreviewPart, el: HTMLElement) => {
    const box = previewBox.current?.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!box) return;
    const x = Math.min(Math.max(8, r.left - box.left), Math.max(8, box.width - 290));
    setPop({ part, x, y: r.bottom - box.top + 8 });
  };
  const popBody = pop && (
    <>
      <PartQuickEditor config={cfg} part={pop.part} onPatch={onPatch} readOnly={readOnly} />
      <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">แก้ตรงนี้ = {PART_INFO[pop.part].plural} เปลี่ยนตาม</div>
      <button type="button" className="mt-1.5 text-xs text-blue-700 hover:underline" onClick={() => { goTo(PART_INFO[pop.part].cat); setPop(null); }}>ตั้งค่าทั้งหมดของชิ้นนี้ →</button>
    </>
  );
  const canCompare = !!published && !peek && view === "sample";
  const onSplitDrag = (e: React.PointerEvent) => {
    const box = previewBox.current?.getBoundingClientRect();
    if (!box) return;
    const move = (ev: PointerEvent) => setSplit(Math.min(95, Math.max(5, ((ev.clientX - box.left) / box.width) * 100)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    e.preventDefault();
  };

  return (
    <PlaygroundShell>
      {/* แถบบน */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2">
        <Link href="/admin/themes" className={btn} aria-label="กลับไปคลังธีม"><Icon name="back" /> คลังธีม</Link>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void saveName()} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          disabled={!canEdit || !!theme.deleted_at} className="h-8 min-w-[140px] flex-1 sm:flex-none sm:w-56 rounded-lg border border-transparent hover:border-slate-200 focus:border-slate-300 px-2 font-medium text-slate-900" aria-label="ชื่อธีม" />
        <span className={`text-[11px] ${save === "error" ? "text-red-600" : theme.has_unpublished ? "text-amber-700" : "text-slate-400"}`}>
          {theme.published_version > 0 ? `เผยแพร่ v${theme.published_version} · ` : "ยังไม่เคยเผยแพร่ · "}{saveLabel}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {canEdit && <button type="button" className={btn} onClick={doUndo} disabled={!undo.current.length} title="ย้อน (Ctrl+Z)"><Icon name="arrow-back-up" /> ย้อน</button>}
          {canEdit && <button type="button" className={btn} onClick={doRedo} disabled={!redo.current.length} title="ทำซ้ำ (Ctrl+Shift+Z)"><Icon name="arrow-forward-up" /></button>}
          <button type="button" className={btn} onClick={() => setHistOpen(true)}><Icon name="history" /> ประวัติ</button>
          {canEdit && theme.published_version > 0 && theme.has_unpublished && <button type="button" className={btn} onClick={() => setConfirm("discard")}>ทิ้งร่าง</button>}
          {canPublish && <button type="button" disabled={busy || !!theme.deleted_at} onClick={() => setPublishOpen(true)} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40">{!theme.has_unpublished && theme.published_version > 0 ? "เลือกแอปที่ใช้…" : "เผยแพร่ + เลือกแอป…"}</button>}
        </div>
      </div>

      {theme.deleted_at && <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">ธีมนี้อยู่ในถังขยะ — กู้คืนที่หน้าคลังธีมก่อนแก้</div>}
      {peek && (
        <div className="mx-4 mt-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm px-3 py-2 flex flex-wrap items-center gap-2">
          กำลังดูเวอร์ชัน {peek.version} ({when(peek.published_at)})
          <span className="ml-auto flex gap-2">
            {canEdit && <button type="button" className={btn} disabled={busy} onClick={() => void restoreVersion(peek)}>เอาเวอร์ชันนี้มาเป็นร่าง</button>}
            <button type="button" className={btn} onClick={() => setPeek(null)}>กลับไปร่างที่แก้อยู่</button>
          </span>
        </div>
      )}

      <div className="p-3 sm:p-4 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* แผงปรับ (มือถืออยู่ล่างพรีวิว) */}
        <aside className="order-2 lg:order-1 rounded-xl border border-slate-200 bg-white p-3 lg:sticky lg:top-14 lg:self-start lg:max-h-[calc(100vh-72px)] lg:overflow-y-auto">
          <div className="flex items-center gap-1 mb-2">
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button type="button" className={seg(mode === "easy")} onClick={() => setMode("easy")}>ง่าย</button>
              <button type="button" className={seg(mode === "adv")} onClick={() => setMode("adv")}>ละเอียด</button>
            </div>
            <div className="relative flex-1 min-w-0">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา เช่น เงา ขอบ กระพริบ" className="w-full h-8 rounded-lg border border-slate-200 px-2 text-xs" aria-label="ค้นหาการตั้งค่า" />
              {results.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                  {results.map((r) => <button key={r.label} type="button" onClick={() => goTo(r.cat)} className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50">{r.label}</button>)}
                </div>
              )}
              {q.trim() && !results.length && <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg px-2.5 py-1.5 text-xs text-slate-400">ไม่พบการตั้งค่านี้</div>}
            </div>
          </div>
          {issues.length > 0 && (
            <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 space-y-1">
              {issues.map((i) => <div key={i.key}>• {i.message}</div>)}
              {canEdit && !readOnly && issues.some((i) => i.fixable) && (
                <button type="button" className="mt-1 underline font-medium" onClick={() => { apply(autoFixContrast(cfg)); toast.success("ปรับสีให้อ่านง่ายขึ้นแล้ว (กดย้อนได้)"); }}>แก้ให้อัตโนมัติ</button>
              )}
            </div>
          )}
          {mode === "easy"
            ? <ThemeEasyPanel config={cfg} onPatch={onPatch} onReplace={(n) => apply(n)} readOnly={readOnly} />
            : <ThemeAdvancedPanel config={cfg} onPatch={onPatch} readOnly={readOnly} open={openGroup} onToggle={(g) => { setOpenGroup(g); setFocusCat(null); }} focusCat={focusCat} />}
        </aside>

        {/* พรีวิว */}
        <section className="order-1 lg:order-2 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button type="button" className={seg(view === "sample")} onClick={() => setView("sample")}>หน้าตัวอย่าง</button>
              <button type="button" className={seg(view === "real")} onClick={() => setView("real")}>หน้าจริง</button>
            </div>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button type="button" className={seg(device === "pc")} onClick={() => setDevice("pc")}>PC</button>
              <button type="button" className={seg(device === "mobile")} onClick={() => setDevice("mobile")}>มือถือ</button>
            </div>
            {view === "sample" ? (
              <select value={sample} onChange={(e) => { setSample(e.target.value as PreviewSample); setReplay((n) => n + 1); }} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
                <option value="purchase">ตัวอย่าง: จัดซื้อ</option><option value="products">ตัวอย่าง: สินค้า</option><option value="tasks">ตัวอย่าง: Creative</option>
              </select>
            ) : (
              <select value={realHref} onChange={(e) => setRealHref(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
                {REAL_PAGES.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}
              </select>
            )}
            <label className="text-xs text-slate-600 inline-flex items-center gap-1"><input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} disabled={view === "real"} /> โหมดมืด</label>
            {view === "sample" && <button type="button" className={btn} onClick={() => setReplay((n) => n + 1)}><Icon name="refresh" /> เล่นแอนิเมชันอีกครั้ง</button>}
            <span className="ml-auto flex items-center gap-1.5">
              {view === "sample" && canEdit && <label className="text-xs text-slate-600 inline-flex items-center gap-1" title="ชี้ชิ้นในพรีวิวเห็นชื่อ · คลิกเพื่อแก้เฉพาะชิ้น"><input type="checkbox" checked={editMode} onChange={(e) => { setEditMode(e.target.checked); setPop(null); }} /> คลิกแก้</label>}
              {canCompare && (device === "mobile" || narrow
                ? <div className="flex rounded-lg border border-slate-200 bg-white p-0.5"><button type="button" className={seg(!showPublished)} onClick={() => setShowPublished(false)}>ร่าง</button><button type="button" className={seg(showPublished)} onClick={() => setShowPublished(true)}>ที่เผยแพร่</button></div>
                : <button type="button" className={btn} onClick={() => { setCompare((v) => !v); setPop(null); }} aria-pressed={compare}>{compare ? "ปิดเทียบ" : "เทียบก่อน/หลัง"}</button>)}
            </span>
          </div>

          <div ref={previewBox} className="relative">
            {view === "sample" ? (
              compare && canCompare && device === "pc" && !narrow && published ? (
                <div className="relative select-none">
                  <ThemePreview config={published} device={device} sample={sample} dark={dark} replayKey={replay} />
                  <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
                    <ThemePreview config={cfg} device={device} sample={sample} dark={dark} replayKey={replay} />
                  </div>
                  <div className="absolute top-0 bottom-0 z-10 w-0.5 bg-slate-900/70 cursor-ew-resize" style={{ left: `${split}%` }} onPointerDown={onSplitDrag}>
                    <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white border border-slate-300 shadow flex items-center justify-center text-[10px] text-slate-600">⇆</span>
                  </div>
                  <span className="absolute top-2 left-2 z-10 rounded-full bg-slate-900/75 text-white text-[10px] px-2 py-0.5">ร่างที่แก้อยู่</span>
                  <span className="absolute top-2 right-2 z-10 rounded-full bg-slate-900/75 text-white text-[10px] px-2 py-0.5">ที่เผยแพร่ v{theme.published_version}</span>
                </div>
              ) : (
                shown && <ThemePreview config={shown} device={device} sample={sample} dark={dark} replayKey={replay}
                  editMode={editMode && canEdit && !readOnly && !showPublished} selectedPart={pop?.part ?? null} onPartClick={onPartClick} />
              )
            ) : (
              <div className={device === "mobile" ? "flex justify-center rounded-xl bg-slate-200 p-3" : ""}>
                <iframe ref={frameRef} key={realHref} src={`${realHref}?embed=1`} title="พรีวิวหน้าจริง" onLoad={sendVars}
                  className={`bg-white rounded-xl border border-slate-300 ${device === "mobile" ? "w-[375px] h-[680px]" : "w-full h-[640px]"}`} />
              </div>
            )}
            {/* ป๊อปแก้ชิ้น (PC) */}
            {pop && !narrow && (
              <div className="absolute z-20 w-[280px] rounded-xl border border-slate-200 bg-white shadow-xl p-3" style={{ left: pop.x, top: pop.y }}>
                <div className="flex items-center mb-2"><span className="text-sm font-medium text-slate-800 flex-1">แก้: {PART_INFO[pop.part].label}</span>
                  <button type="button" onClick={() => setPop(null)} className="w-6 h-6 rounded hover:bg-slate-100 text-slate-500" aria-label="ปิด">✕</button></div>
                {popBody}
              </div>
            )}
          </div>
          {view === "sample" && editMode && canEdit && !compare && <p className="text-[11px] text-slate-400 mt-1.5">ชี้ชิ้นในพรีวิวเห็นชื่อ · คลิกเพื่อแก้เฉพาะชิ้น (ปิด "คลิกแก้" ถ้าอยากกดลองปุ่มจริง)</p>}
          {view === "real" && <p className="text-[11px] text-slate-400 mt-1.5">หน้าจริงตอนนี้เปลี่ยนตามได้แค่สีหลัก/สีเน้น · ตัวอักษร ขอบมน รูปพื้นหลัง ไล่สี และแอนิเมชันจะเห็นในหน้าจริงหลังเฟส 3–4 (หน้าตัวอย่างเห็นครบแล้ว) · พรีวิวนี้ไม่บันทึกอะไรลงหน้าจริง</p>}
        </section>
      </div>

      {/* ประวัติเวอร์ชัน */}
      <Drawer open={histOpen} onClose={() => setHistOpen(false)} title="ประวัติเวอร์ชัน" description="ทุกครั้งที่กดเผยแพร่จะเก็บไว้ที่นี่ · เอาเวอร์ชันเก่ามาเป็นร่างได้ (ยังไม่เผยแพร่จนกว่าจะกด)" size="sm">
        {versions.length === 0 ? <EmptyState title="ยังไม่เคยเผยแพร่" hint="กด เผยแพร่ ครั้งแรกแล้วเวอร์ชันจะมาอยู่ที่นี่" /> : (
          <ul className="divide-y divide-slate-100">
            {versions.map((v) => (
              <li key={v.version} className="py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">v{v.version}</span>
                  {v.version === theme.published_version && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">ใช้อยู่</span>}
                  <span className="ml-auto text-[11px] text-slate-400">{when(v.published_at)}</span>
                </div>
                <div className="text-xs text-slate-600">{v.note || "—"}{v.published_by_name ? ` · ${v.published_by_name}` : ""}</div>
                <div className="flex gap-1.5 mt-1.5">
                  <button type="button" className={btn} onClick={() => { setPeek(v); setHistOpen(false); setView("sample"); }}>ดู</button>
                  {canEdit && !theme.deleted_at && <button type="button" className={btn} disabled={busy} onClick={() => void restoreVersion(v)}>เอามาเป็นร่าง</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      {/* ป๊อปแก้ชิ้น (จอเล็ก = แผงล่าง) */}
      <BottomSheet open={!!pop && narrow} onClose={() => setPop(null)} title={pop ? `แก้: ${PART_INFO[pop.part].label}` : ""} backKey="theme-part">
        <div className="px-4 pb-4">{popBody}</div>
      </BottomSheet>

      <PublishThemeDialog open={publishOpen} themeId={theme.id} themeName={theme.name} onClose={() => setPublishOpen(false)} onPublish={doPublish} />

      <ConfirmDialog open={confirm === "discard"} onClose={() => setConfirm(null)} onConfirm={() => void doDiscard()} loading={busy}
        title="ทิ้งร่าง" variant="danger" confirmText="ทิ้งร่าง"
        message={`ร่างที่แก้ไว้จะหาย กลับไปเท่าฉบับที่เผยแพร่ (v${theme.published_version}) · ถ้ายังอยากเก็บไว้ ให้ "ทำสำเนา" ที่หน้าคลังธีมก่อน`} />
    </PlaygroundShell>
  );
}
