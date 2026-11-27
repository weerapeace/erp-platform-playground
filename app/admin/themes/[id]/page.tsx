"use client";
/**
 * /admin/themes/[id] — ตัวแก้ธีม (ธีมกลาง ERP)
 *   ตัวแก้แบบเรียบ (2026-11-25 · เจ้าของเลือกแบบ D + ข้อ 1,2,3,4,6,7,12,13):
 *   · พรีวิวเต็มกว้าง + แถบลอยด้านล่าง 4 ปุ่ม: สี / สไตล์ / พื้นหลัง / เพิ่มเติม (กด = แผงเล็กเด้ง · มือถือ = แผงล่าง)
 *   · "เปลี่ยนลุค" = แกลเลอรี 8 ลุคสำเร็จ (เปิดเองเมื่อมาจากสร้างธีมใหม่ ?start=1) · เปลี่ยนแล้วกดย้อนได้
 *   · แถบบนเหลือ ชื่อ + ปุ่ม "เผยแพร่" · ย้อน/ทำซ้ำ/ประวัติ/ทิ้งร่าง + เครื่องมือพรีวิว อยู่ในปุ่ม ⋯ · เหลือแค่ PC/มือถือ + เต็มจอ
 *   · เตือนสีอ่านยาก = จุดเหลืองเล็ก กดแล้วแก้ให้อัตโนมัติ (ย้อนได้)
 *   · คลิกชิ้นในพรีวิว = ป๊อปแก้เฉพาะชิ้น (คงเดิม) · Ctrl+Z / Ctrl+Shift+Z · บันทึกร่างอัตโนมัติ
 *   คนอื่นยังเห็นของเดิมจนกด "เผยแพร่" · เผยแพร่ + เลือกแอปในขั้นเดียว (PublishThemeDialog)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog, Drawer } from "@/components/modal";
import { BottomSheet } from "@/components/modal/bottom-sheet";
import { Popover } from "@/components/popover";
import { PublishThemeDialog } from "@/components/erp-theme/publish-dialog";
import { refreshActiveThemes } from "@/components/erp-theme/active-themes";
import { ErrorState, LoadingState, EmptyState } from "@/components/state-views";
import { shortcutKey } from "@/lib/shortcut-key";
import { ThemePreview, type PreviewOverlay, type PreviewSample } from "@/components/erp-theme/preview";
import { PartQuickEditor, ThemeAdvancedPanel, ThemeBgSheet, ThemeColorSheet, ThemePartsSheet, ThemeStyleSheet, ThemeTypeSheet } from "@/components/erp-theme/editor-panel";
import { PART_INFO, groupOfCat, searchSettings, type AdvGroupKey, type EditorCategory, type PreviewPart } from "@/lib/erp-theme-easy";
import { THEME_PREVIEW_MSG, themePreviewMessage } from "@/components/erp-theme/preview-bridge";
import {
  THEME_PRESETS, autoFixContrast, mergeThemeConfig, normalizeThemeConfig, presetConfig, themeIssues, type ErpThemeConfig,
} from "@/lib/erp-theme-config";

type Version = { version: number; note: string | null; published_by_name: string | null; published_at: string; config: unknown };
type Theme = {
  id: string; name: string; draft_config: unknown; published_config: unknown; published_version: number;
  published_at: string | null; published_by_name: string | null; deleted_at: string | null; has_unpublished: boolean;
};
type Sheet = "color" | "style" | "type" | "bg" | "parts" | "more";

const REAL_PAGES = [
  { href: "/purchase-orders", label: "ใบสั่งซื้อ" },
  { href: "/master/skus", label: "สินค้า (SKU)" },
  { href: "/tasks", label: "งาน Creative" },
  { href: "/apps", label: "หน้าแรกแอป" },
];
const DOCK: { key: Sheet; label: string; icon: string }[] = [
  { key: "color", label: "สี", icon: "i:palette" },
  { key: "style", label: "สไตล์", icon: "i:sparkles" },
  { key: "type", label: "ตัวอักษร", icon: "i:typography" },
  { key: "bg", label: "พื้นหลัง", icon: "i:photo" },
  { key: "parts", label: "ชิ้นส่วน", icon: "i:layout-cards" },
  { key: "more", label: "เพิ่มเติม", icon: "i:adjustments-horizontal" },
];
const SHEET_TITLE: Record<Sheet, string> = { color: "สี", style: "สไตล์", type: "ตัวอักษร", bg: "พื้นหลัง", parts: "ชิ้นส่วน", more: "ตั้งค่าเพิ่มเติม" };
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
  // แถบล่าง: แผงที่เปิด · "เพิ่มเติม" = 4 กลุ่มพับได้ + ค้นหา · หมวดที่ให้เด่น (จากค้นหา/ป๊อปชิ้น)
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [openGroup, setOpenGroup] = useState<AdvGroupKey | null>("look");
  const [focusCat, setFocusCat] = useState<EditorCategory | null>(null);
  const [q, setQ] = useState("");
  const goTo = (cat: EditorCategory) => { setSheet("more"); setOpenGroup(groupOfCat(cat)); setFocusCat(cat); setQ(""); };
  const [gallery, setGallery] = useState(false);
  // แผง "ชิ้นส่วน" บอกว่าจะโชว์ป๊อป/ลิ้นชัก/แจ้งผล/เมนูลอยทับพรีวิว
  const [overlay, setOverlay] = useState<PreviewOverlay>(null);
  const bumpReplay = useCallback(() => setReplay((n) => n + 1), []);
  // แผง "ตัวอักษร": ข้อความที่พิมพ์ลอง (โชว์ในพรีวิว · ไม่บันทึก)
  const [tryText, setTryText] = useState("");
  const [full, setFull] = useState(false);
  // คลิกแก้ในพรีวิว
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
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("history") === "1") setHistOpen(true);
    if (sp.get("start") === "1") setGallery(true);
  }, []);
  const [peek, setPeek] = useState<Version | null>(null);
  const [confirm, setConfirm] = useState<null | "discard">(null);
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
      if (e.key === "Escape") { if (full) setFull(false); else if (sheet) setSheet(null); return; }
      if (!(e.ctrlKey || e.metaKey) || !canEdit) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && (t as HTMLInputElement).type !== "range" && (t as HTMLInputElement).type !== "checkbox") return;
      const k = shortcutKey(e).toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); doRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo, canEdit, full, sheet]);

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
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
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
  const pickLook = (key: string) => {
    if (!cfg) return;
    const before = cfg, p = THEME_PRESETS.find((x) => x.key === key);
    apply(presetConfig(key));
    setGallery(false); setReplay((n) => n + 1);
    toast.undo(`เปลี่ยนเป็นลุค "${p?.name ?? key}" แล้ว`, () => apply(before));
  };

  const published = useMemo(() => (theme?.published_config ? normalizeThemeConfig(theme.published_config) : null), [theme]);
  const shown = peek ? normalizeThemeConfig(peek.config) : showPublished && published ? published : cfg;
  const issues = useMemo(() => (cfg ? themeIssues(cfg) : []), [cfg]);

  // ── พรีวิวหน้าจริง: ส่งธีมเข้า iframe ───────────
  const frameRef = useRef<HTMLIFrameElement>(null);
  const sendVars = useCallback(() => {
    if (!shown || !frameRef.current?.contentWindow) return;
    frameRef.current.contentWindow.postMessage(themePreviewMessage(shown, device === "mobile"), window.location.origin);
  }, [shown, device]);
  useEffect(() => { if (view === "real") sendVars(); }, [view, sendVars, full]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === `${THEME_PREVIEW_MSG}-ready`) sendVars(); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [sendVars]);

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ดูคลังธีม (theme.view)" /></PlaygroundShell>;
  if (err) return <PlaygroundShell><div className="max-w-3xl mx-auto p-6"><ErrorState title="เปิดธีมไม่สำเร็จ" hint={err} onRetry={() => void load()} /></div></PlaygroundShell>;
  if (!theme || !cfg) return <PlaygroundShell><div className="max-w-6xl mx-auto p-6"><LoadingState variant="cards" rows={4} /></div></PlaygroundShell>;

  const readOnly = !canEdit || !!theme.deleted_at || !!peek;
  const status = save === "error" ? { text: "บันทึกไม่สำเร็จ", cls: "bg-red-50 text-red-700" }
    : save === "pending" || save === "saving" ? { text: "กำลังบันทึก…", cls: "bg-slate-100 text-slate-500" }
    : theme.has_unpublished ? { text: "ร่าง", cls: "bg-amber-50 text-amber-800" }
    : theme.published_version > 0 ? { text: `ใช้อยู่ v${theme.published_version}`, cls: "bg-emerald-50 text-emerald-700" }
    : { text: "ยังไม่เผยแพร่", cls: "bg-slate-100 text-slate-600" };
  const statusLong = `${theme.published_version > 0 ? `เผยแพร่ล่าสุด v${theme.published_version}` : "ยังไม่เคยเผยแพร่"}${theme.has_unpublished ? " · มีร่างที่ยังไม่เผยแพร่ (คนอื่นยังเห็นของเดิม)" : ""}`;
  const iconBtn = "h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center disabled:opacity-40";
  const seg = (on: boolean) => `h-7 px-2.5 rounded-md text-xs inline-flex items-center gap-1 ${on ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-500 hover:text-slate-800"}`;
  const menuItem = "w-full h-8 px-2.5 rounded-md text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent inline-flex items-center gap-2";
  const results = searchSettings(q);
  const canCompare = !!published && !peek && view === "sample";
  const fixIssues = () => {
    if (readOnly || !issues.some((i) => i.fixable)) { toast.warning(issues.map((i) => i.message).join(" · ")); return; }
    const before = cfg;
    apply(autoFixContrast(cfg));
    toast.undo("ปรับสีให้อ่านง่ายขึ้นแล้ว", () => apply(before));
  };
  const onPartClick = (part: PreviewPart, el: HTMLElement) => {
    const box = previewBox.current?.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!box) return;
    setSheet(null);
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
  const onSplitDrag = (e: React.PointerEvent) => {
    const box = previewBox.current?.getBoundingClientRect();
    if (!box) return;
    const move = (ev: PointerEvent) => setSplit(Math.min(95, Math.max(5, ((ev.clientX - box.left) / box.width) * 100)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    e.preventDefault();
  };

  // ── เนื้อหาแผงของแถบล่าง ─────────────────────
  const sheetBody = (k: Sheet): ReactNode => {
    if (k === "color") return <ThemeColorSheet config={cfg} onPatch={onPatch} readOnly={readOnly} />;
    if (k === "style") return <ThemeStyleSheet config={cfg} onPatch={onPatch} onReplace={(n) => apply(n)} readOnly={readOnly} />;
    if (k === "bg") return <ThemeBgSheet config={cfg} onPatch={onPatch} readOnly={readOnly} />;
    if (k === "type") return <ThemeTypeSheet config={cfg} onPatch={onPatch} readOnly={readOnly} tryText={tryText} onTryText={setTryText} />;
    if (k === "parts") return <ThemePartsSheet config={cfg} onPatch={onPatch} readOnly={readOnly} onOverlay={setOverlay} onReplay={bumpReplay} />;
    return (
      <div>
        <div className="relative mb-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา เช่น เงา ขอบ กระพริบ" className="w-full h-8 rounded-lg border border-slate-200 px-2.5 text-xs" aria-label="ค้นหาการตั้งค่า" />
          {results.length > 0 && (
            <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
              {results.map((r) => <button key={r.label} type="button" onClick={() => goTo(r.cat)} className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50">{r.label}</button>)}
            </div>
          )}
          {q.trim() && !results.length && <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg px-2.5 py-1.5 text-xs text-slate-400">ไม่พบการตั้งค่านี้</div>}
        </div>
        <ThemeAdvancedPanel config={cfg} onPatch={onPatch} readOnly={readOnly} open={openGroup} onToggle={(g) => { setOpenGroup(g); setFocusCat(null); }} focusCat={focusCat} />
      </div>
    );
  };

  // ── แถบลอยด้านล่าง (ข้อ D) ─────────────────────
  const dock = !readOnly && !gallery && (
    <div className="sticky bottom-3 z-30 mt-3 flex justify-center pointer-events-none">
      <div className="relative pointer-events-auto">
        {sheet && !narrow && (
          <div className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 ${sheet === "more" ? "w-[400px]" : "w-[340px]"} max-h-[62vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl p-3`}>
            <div className="flex items-center mb-2"><span className="text-sm font-semibold text-slate-800 flex-1">{SHEET_TITLE[sheet]}</span>
              <button type="button" onClick={() => setSheet(null)} className="w-7 h-7 rounded-md hover:bg-slate-100 text-slate-500 inline-flex items-center justify-center" aria-label="ปิด"><Icon value="i:x" /></button></div>
            {sheetBody(sheet)}
          </div>
        )}
        <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur p-1.5 shadow-xl">
          {DOCK.map((d) => (
            <button key={d.key} type="button" aria-pressed={sheet === d.key} onClick={() => { setPop(null); setSheet((s) => (s === d.key ? null : d.key)); }}
              className={`min-w-[52px] h-12 px-1 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] ${sheet === d.key ? "bg-blue-50 text-blue-800 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>
              <Icon value={d.icon} size={18} />{d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── แกลเลอรีลุค ─────────────────────────────
  const galleryView = (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex items-center mb-3">
        <div className="flex-1"><div className="font-semibold text-slate-900">เลือกลุคที่ชอบ</div><div className="text-xs text-slate-500">กดแล้วปรับต่อด้วยแถบล่างได้ · เปลี่ยนแล้วกดย้อนได้</div></div>
        <button type="button" onClick={() => setGallery(false)} className="h-8 px-3 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">ใช้ลุคเดิม</button>
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {THEME_PRESETS.map((p) => (
          <button key={p.key} type="button" disabled={readOnly} onClick={() => pickLook(p.key)} title={p.description}
            className="text-left rounded-xl border border-slate-200 p-2 hover:border-blue-400 hover:ring-2 hover:ring-blue-100 disabled:opacity-60">
            <div className="pointer-events-none"><ThemePreview config={presetConfig(p.key)} compact /></div>
            <div className="mt-1.5 text-sm font-medium text-slate-800">{p.name}</div>
          </button>
        ))}
      </div>
    </div>
  );

  // ── พรีวิว ─────────────────────────────────
  const previewView = (
    <div ref={previewBox} className="relative">
      {view === "sample" ? (
        compare && canCompare && device === "pc" && !narrow && published ? (
          <div className="relative select-none">
            <ThemePreview config={published} device={device} sample={sample} dark={dark} replayKey={replay} />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
              <ThemePreview config={cfg} device={device} sample={sample} dark={dark} replayKey={replay} />
            </div>
            <div className="absolute top-0 bottom-0 z-10 w-0.5 bg-slate-900/70 cursor-ew-resize" style={{ left: `${split}%` }} onPointerDown={onSplitDrag}>
              <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white border border-slate-300 shadow flex items-center justify-center text-slate-600"><Icon value="i:arrows-exchange" /></span>
            </div>
            <span className="absolute top-2 left-2 z-10 rounded-full bg-slate-900/75 text-white text-[10px] px-2 py-0.5">ร่างที่แก้อยู่</span>
            <span className="absolute top-2 right-2 z-10 rounded-full bg-slate-900/75 text-white text-[10px] px-2 py-0.5">ที่เผยแพร่ v{theme.published_version}</span>
          </div>
        ) : (
          shown && <ThemePreview config={shown} device={device} sample={sample} dark={dark} replayKey={replay}
            editMode={editMode && canEdit && !readOnly && !showPublished && !(sheet === "parts" && overlay)} selectedPart={pop?.part ?? null} onPartClick={onPartClick}
            overlay={sheet === "parts" ? overlay : null} tryText={sheet === "type" ? tryText : ""} />
        )
      ) : (
        <div className={device === "mobile" ? "flex justify-center rounded-xl bg-slate-200 p-3" : ""}>
          <iframe ref={frameRef} key={realHref} src={`${realHref}?embed=1`} title="พรีวิวหน้าจริง" onLoad={sendVars}
            className={`bg-white rounded-xl border border-slate-300 ${device === "mobile" ? "w-[375px] h-[680px]" : `w-full ${full ? "h-[calc(100vh-120px)]" : "h-[640px]"}`}`} />
        </div>
      )}
      {pop && !narrow && (
        <div className="absolute z-20 w-[280px] rounded-xl border border-slate-200 bg-white shadow-xl p-3" style={{ left: pop.x, top: pop.y }}>
          <div className="flex items-center mb-2"><span className="text-sm font-medium text-slate-800 flex-1">แก้: {PART_INFO[pop.part].label}</span>
            <button type="button" onClick={() => setPop(null)} className="w-6 h-6 rounded hover:bg-slate-100 text-slate-500 inline-flex items-center justify-center" aria-label="ปิด"><Icon value="i:x" /></button></div>
          {popBody}
        </div>
      )}
    </div>
  );

  const deviceSeg = (
    <div className="flex rounded-lg bg-slate-100 p-0.5">
      <button type="button" className={seg(device === "pc")} onClick={() => setDevice("pc")} aria-label="พรีวิวแบบ PC"><Icon value="i:device-desktop" /><span className="hidden sm:inline">PC</span></button>
      <button type="button" className={seg(device === "mobile")} onClick={() => setDevice("mobile")} aria-label="พรีวิวแบบมือถือ"><Icon value="i:device-mobile" /><span className="hidden sm:inline">มือถือ</span></button>
    </div>
  );

  const stage = (
    <>
      {peek && (
        <div className="mb-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm px-3 py-2 flex flex-wrap items-center gap-2">
          กำลังดูเวอร์ชัน {peek.version} ({when(peek.published_at)})
          <span className="ml-auto flex gap-2">
            {canEdit && <button type="button" className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs" disabled={busy} onClick={() => void restoreVersion(peek)}>เอาเวอร์ชันนี้มาเป็นร่าง</button>}
            <button type="button" className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs" onClick={() => setPeek(null)}>กลับไปร่างที่แก้อยู่</button>
          </span>
        </div>
      )}
      {gallery ? galleryView : (
        <>
          <div className="flex items-center gap-2 mb-2 text-xs">
            {!readOnly && <button type="button" onClick={() => { setGallery(true); setSheet(null); setPop(null); }} className="h-7 px-2.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"><Icon value="i:layout-grid" /> เปลี่ยนลุค</button>}
            {showPublished && <span className="rounded-full bg-slate-800 text-white px-2 py-0.5">กำลังดูฉบับที่เผยแพร่</span>}
            {view === "sample" && editMode && canEdit && !readOnly && !compare && <span className="text-slate-400">แตะชิ้นในพรีวิวเพื่อแก้เฉพาะชิ้น</span>}
          </div>
          {previewView}
        </>
      )}
      {dock}
    </>
  );

  return (
    <PlaygroundShell>
      {/* แถบบน (ข้อ 1–2): ชื่อ + เผยแพร่ · ที่เหลืออยู่ใน ⋯ */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex items-center gap-1.5 sm:gap-2">
        <Link href="/admin/themes" className={iconBtn} aria-label="กลับไปคลังธีม" title="กลับไปคลังธีม"><Icon name="back" /></Link>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void saveName()} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          disabled={!canEdit || !!theme.deleted_at} className="h-8 min-w-0 flex-1 sm:flex-none sm:w-56 rounded-lg border border-transparent hover:border-slate-200 focus:border-slate-300 px-2 font-medium text-slate-900" aria-label="ชื่อธีม" />
        <span className={`hidden sm:inline-flex shrink-0 text-[11px] px-2 py-0.5 rounded-full ${status.cls}`} title={statusLong}>{status.text}</span>
        {issues.length > 0 && (
          <button type="button" onClick={fixIssues} className="shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-amber-50"
            title={`${issues.map((i) => i.message).join("\n")}\n— กดเพื่อแก้ให้อัตโนมัติ`} aria-label="มีสีที่อ่านยาก กดเพื่อแก้ให้อัตโนมัติ">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-100" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden sm:block">{deviceSeg}</div>
          <button type="button" className={iconBtn} onClick={() => { setFull(true); setPop(null); }} title="พรีวิวเต็มจอ" aria-label="พรีวิวเต็มจอ"><Icon value="i:maximize" /></button>
          <Popover align="right" panelClassName="w-64 p-1.5"
            trigger={(toggle, open) => <button type="button" onClick={toggle} aria-expanded={open} className={iconBtn} aria-label="เมนูเพิ่มเติม" title="เมนูเพิ่มเติม"><Icon value="i:dots-vertical" /></button>}>
            {(close) => (
              <div>
                <div className={`sm:hidden mx-1 mb-1 text-[11px] px-2 py-0.5 rounded-full inline-block ${status.cls}`}>{status.text}</div>
                <div className="px-2.5 pb-1 text-[11px] text-slate-400">{statusLong}</div>
                {canEdit && <button type="button" className={menuItem} disabled={!undo.current.length} onClick={doUndo}><Icon value="i:arrow-back-up" /> ย้อน <span className="ml-auto text-[10px] text-slate-400">Ctrl+Z</span></button>}
                {canEdit && <button type="button" className={menuItem} disabled={!redo.current.length} onClick={doRedo}><Icon value="i:arrow-forward-up" /> ทำซ้ำ</button>}
                <button type="button" className={menuItem} onClick={() => { close(); setHistOpen(true); }}><Icon name="history" /> ประวัติเวอร์ชัน</button>
                {canEdit && theme.published_version > 0 && theme.has_unpublished && <button type="button" className={`${menuItem} text-red-700`} onClick={() => { close(); setConfirm("discard"); }}><Icon name="delete" /> ทิ้งร่าง</button>}
                <div className="my-1.5 border-t border-slate-100" />
                <div className="px-2.5 pb-1 text-[11px] font-semibold text-slate-500">พรีวิว</div>
                <div className="sm:hidden px-1.5 pb-1.5">{deviceSeg}</div>
                <div className="px-1.5 pb-1.5 flex rounded-lg bg-slate-100 p-0.5 mx-1">
                  <button type="button" className={`flex-1 justify-center ${seg(view === "sample")}`} onClick={() => setView("sample")}>หน้าตัวอย่าง</button>
                  <button type="button" className={`flex-1 justify-center ${seg(view === "real")}`} onClick={() => { setView("real"); setCompare(false); }}>หน้าจริง</button>
                </div>
                <div className="px-1.5 py-1">
                  {view === "sample" ? (
                    <select value={sample} onChange={(e) => { setSample(e.target.value as PreviewSample); setReplay((n) => n + 1); }} className="w-full h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs" aria-label="ตัวอย่างโมดูล">
                      <option value="purchase">ตัวอย่าง: จัดซื้อ</option><option value="products">ตัวอย่าง: สินค้า</option><option value="tasks">ตัวอย่าง: Creative</option>
                    </select>
                  ) : (
                    <select value={realHref} onChange={(e) => setRealHref(e.target.value)} className="w-full h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs" aria-label="หน้าจริง">
                      {REAL_PAGES.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}
                    </select>
                  )}
                </div>
                {view === "sample" && (
                  <>
                    <label className={menuItem}><input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> โหมดมืด</label>
                    <button type="button" className={menuItem} onClick={() => { setReplay((n) => n + 1); close(); }}><Icon name="refresh" /> เล่นแอนิเมชันอีกครั้ง</button>
                    {canEdit && <label className={menuItem}><input type="checkbox" checked={editMode} onChange={(e) => { setEditMode(e.target.checked); setPop(null); }} /> แตะชิ้นในพรีวิวเพื่อแก้</label>}
                    {canCompare && (device === "mobile" || narrow
                      ? <label className={menuItem}><input type="checkbox" checked={showPublished} onChange={(e) => setShowPublished(e.target.checked)} /> ดูฉบับที่เผยแพร่</label>
                      : <label className={menuItem}><input type="checkbox" checked={compare} onChange={(e) => { setCompare(e.target.checked); setPop(null); }} /> เทียบก่อน/หลัง</label>)}
                  </>
                )}
                {!readOnly && <button type="button" className={menuItem} onClick={() => { close(); setGallery(true); setSheet(null); }}><Icon value="i:layout-grid" /> เปลี่ยนลุค</button>}
              </div>
            )}
          </Popover>
          {canPublish && <button type="button" disabled={busy || !!theme.deleted_at} onClick={() => setPublishOpen(true)} className="h-8 px-3 sm:px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40">เผยแพร่</button>}
        </div>
      </div>

      {theme.deleted_at && <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">ธีมนี้อยู่ในถังขยะ — กู้คืนที่หน้าคลังธีมก่อนแก้</div>}

      {/* พรีวิวเต็มกว้าง + แถบล่าง · เต็มจอ (ข้อ 12) ย้ายไปลอยทับทั้งจอ */}
      {!full && <div className="p-3 sm:p-4">{stage}</div>}
      {full && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[60] bg-slate-100 overflow-y-auto p-3 sm:p-5" role="dialog" aria-label="พรีวิวเต็มจอ">
          <div className="sticky top-0 z-40 flex justify-end gap-1.5 mb-2">
            {deviceSeg}
            <button type="button" onClick={() => setFull(false)} className="h-8 px-3 rounded-lg bg-slate-900/80 text-white text-xs inline-flex items-center gap-1"><Icon value="i:minimize" /> ออกจากเต็มจอ</button>
          </div>
          <div className="max-w-6xl mx-auto">{stage}</div>
        </div>,
        document.body,
      )}

      {/* แผงของแถบล่าง (จอเล็ก = แผงล่าง) */}
      <BottomSheet open={!!sheet && narrow} onClose={() => setSheet(null)} title={sheet ? SHEET_TITLE[sheet] : ""} backKey="theme-dock" zIndex={full ? 75 : 70}>
        <div className="px-4 pb-4">{sheet && sheetBody(sheet)}</div>
      </BottomSheet>

      {/* ประวัติเวอร์ชัน */}
      <Drawer open={histOpen} onClose={() => setHistOpen(false)} title="ประวัติเวอร์ชัน" description="ทุกครั้งที่กดเผยแพร่จะเก็บไว้ที่นี่ · เอาเวอร์ชันเก่ามาเป็นร่างได้" size="sm">
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
                  <button type="button" className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs hover:bg-slate-50" onClick={() => { setPeek(v); setHistOpen(false); setView("sample"); setGallery(false); }}>ดู</button>
                  {canEdit && !theme.deleted_at && <button type="button" className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs hover:bg-slate-50" disabled={busy} onClick={() => void restoreVersion(v)}>เอามาเป็นร่าง</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      {/* ป๊อปแก้ชิ้น (จอเล็ก = แผงล่าง) */}
      <BottomSheet open={!!pop && narrow} onClose={() => setPop(null)} title={pop ? `แก้: ${PART_INFO[pop.part].label}` : ""} backKey="theme-part" zIndex={full ? 75 : 70}>
        <div className="px-4 pb-4">{popBody}</div>
      </BottomSheet>

      <PublishThemeDialog open={publishOpen} themeId={theme.id} themeName={theme.name} onClose={() => setPublishOpen(false)} onPublish={doPublish} />

      <ConfirmDialog open={confirm === "discard"} onClose={() => setConfirm(null)} onConfirm={() => void doDiscard()} loading={busy}
        title="ทิ้งร่าง" variant="danger" confirmText="ทิ้งร่าง"
        message={`ร่างที่แก้ไว้จะหาย กลับไปเท่าฉบับที่เผยแพร่ (v${theme.published_version}) · ถ้ายังอยากเก็บไว้ ให้ "ทำสำเนา" ที่หน้าคลังธีมก่อน`} />
    </PlaygroundShell>
  );
}
