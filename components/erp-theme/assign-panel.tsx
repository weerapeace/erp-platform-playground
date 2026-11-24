"use client";
/**
 * ThemeAssignPanel — "แอปใช้ธีมไหน" (ธีมกลาง ERP เฟส 3 · แท็บในหน้า /admin/themes?tab=apps)
 *   ธีมบริษัท (ค่าเริ่มของทุกแอป) + ตารางแอป (มือถือ = การ์ด) · แก้หลายแถวแล้ว "บันทึกทั้งหมด" ทีเดียว + ย้อนกลับ
 *   แถบบนเดิม: แอปที่ตั้งสี/รูปแถบบนไว้เองคงไว้ (เจ้าของเลือก) · ปุ่ม "ใช้สีตามธีม" ล้างทีละแอป (ย้อนกลับได้)
 *   ดูตัวอย่าง: เปิดหน้าแรกของแอปในป๊อป + ส่งสีธีมเข้าไป (ThemePreviewBridge) — ไม่บันทึกอะไร
 *   ?app=<key> = ไฮไลต์แถว (มาจากปุ่มทางลัดในหน้าตั้งค่าแอป /admin/menu)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { normalizeThemeConfig, scaleOf, type ErpThemeConfig } from "@/lib/erp-theme-config";
import { COMPANY_SCOPE, appScope, diffAssignments, hasOwnHeader, type AppHeaderFields } from "@/lib/erp-theme-assign";
import { refreshActiveThemes } from "./active-themes";
import { THEME_PREVIEW_MSG, themePreviewMessage } from "./preview-bridge";

type App = AppHeaderFields & { key: string; label: string; icon: string | null; default_href: string | null };
type ThemeOpt = { id: string; name: string; published_version: number; config: unknown };

export function ThemeAssignPanel({ focusApp }: { focusApp?: string | null }) {
  const canAssign = usePermission("theme.assign");
  const toast = useToast();
  const [apps, setApps] = useState<App[] | null>(null);
  const [themes, setThemes] = useState<ThemeOpt[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ app: App; cfg: ErpThemeConfig | null } | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await apiFetch("/api/themes/assignments");
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setApps(j.apps); setThemes(j.themes);
      setSaved(Object.fromEntries((j.assignments as { scope: string; theme_id: string }[]).map((a) => [a.scope, a.theme_id])));
      setDraft({});
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const changes = useMemo(() => diffAssignments(saved, draft), [saved, draft]);
  const dirty = changes.length > 0;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const valueOf = (scope: string) => (scope in draft ? draft[scope] : saved[scope] ?? null);
  const setVal = (scope: string, id: string | null) => setDraft((d) => {
    const n = { ...d };
    if ((saved[scope] ?? null) === id) delete n[scope]; else n[scope] = id;
    return n;
  });
  const themeById = (id: string | null) => themes.find((t) => t.id === id) ?? null;
  const cfgOf = (id: string | null) => { const t = themeById(id); return t ? normalizeThemeConfig(t.config) : null; };
  const effective = (scope: string) => valueOf(scope) ?? (scope === COMPANY_SCOPE ? null : valueOf(COMPANY_SCOPE));

  const put = async (list: { scope: string; theme_id: string | null }[]) => {
    const r = await apiFetch("/api/themes/assignments", { method: "PUT", body: JSON.stringify({ changes: list }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
    return j.previous as { scope: string; theme_id: string | null }[];
  };
  const saveAll = async () => {
    setBusy(true);
    try {
      const prev = await put(changes);
      await load(); void refreshActiveThemes();
      toast.undo(`บันทึกธีมของ ${changes.length} รายการแล้ว`, async () => { await put(prev); await load(); void refreshActiveThemes(); });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const clearHeader = async (a: App) => {
    if (!(await askConfirm({ title: `ให้แถบบนของ "${a.label}" ตามธีม?`, message: "สีแถบบนที่ตั้งไว้เองจะถูกล้าง (ย้อนกลับได้จากปุ่มที่เด้งมุมจอ)", confirmText: "ใช้สีตามธีม" }))) return;
    try {
      const r = await apiFetch("/api/themes/assignments", { method: "POST", body: JSON.stringify({ action: "clear_header", app_key: a.key }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "ไม่สำเร็จ");
      await load();
      toast.undo(`แถบบนของ "${a.label}" ตามธีมแล้ว`, async () => {
        await apiFetch("/api/themes/assignments", { method: "POST", body: JSON.stringify({ action: "restore_header", app_key: a.key, values: j.previous }) });
        await load();
      });
    } catch (e) { toast.error((e as Error).message); }
  };

  useEffect(() => {
    if (!focusApp || !apps) return;
    const el = [...document.querySelectorAll<HTMLElement>("[data-focus-row]")].find((x) => x.offsetParent !== null);
    el?.scrollIntoView({ block: "center" });
  }, [focusApp, apps]);

  if (err) return <ErrorState title="โหลดข้อมูลไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!apps) return <LoadingState variant="table" rows={8} />;

  const published = themes.filter((t) => t.published_version > 0);
  const drafts = themes.filter((t) => !t.published_version);
  const renderSelect = (scope: string, company?: boolean) => {
    const v = valueOf(scope);
    const col = cfgOf(effective(scope));
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <span className="w-4 h-4 rounded shrink-0 border border-black/10" style={{ background: col ? scaleOf(col.colors.primary)[600] : "#ea580c" }} />
        <select value={v ?? ""} disabled={!canAssign} onChange={(e) => setVal(scope, e.target.value || null)}
          className="h-8 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-2 text-sm" aria-label={company ? "ธีมบริษัท" : "ธีมของแอป"}>
          <option value="">{company ? "ไม่มี (หน้าตาเดิมของระบบ)" : "ตามธีมบริษัท"}</option>
          {published.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          {drafts.length > 0 && <optgroup label="ยังไม่เผยแพร่ (เลือกไม่ได้)">{drafts.map((t) => <option key={t.id} value={t.id} disabled>{t.name}</option>)}</optgroup>}
        </select>
      </span>
    );
  };
  const edited = (scope: string) => scope in draft && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800">แก้แล้ว</span>;
  const headerCell = (a: App) => hasOwnHeader(a) ? (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      แถบบนสีเดิม <span className="w-3 h-3 rounded inline-block border border-black/10" style={{ background: a.theme_color || a.theme_color2 || "#94a3b8" }} />
      {canAssign && <button type="button" className="underline text-slate-600 hover:text-slate-900" onClick={() => void clearHeader(a)}>ใช้สีตามธีม</button>}
    </span>
  ) : <span className="text-xs text-slate-400">ตามธีม</span>;

  return (
    <div className="pb-20">
      {published.length === 0 && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2">ยังไม่มีธีมที่เผยแพร่ — เปิดธีมในแท็บ "คลังธีม" แล้วกด เผยแพร่ ก่อน ถึงจะเลือกให้แอปได้</div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-3 mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-[160px]">
          <div className="font-medium text-slate-900 flex items-center gap-1.5">ธีมบริษัท {edited(COMPANY_SCOPE)}</div>
          <div className="text-xs text-slate-500">ค่าเริ่มของทุกแอปที่เลือก "ตามธีมบริษัท"</div>
        </div>
        {renderSelect(COMPANY_SCOPE, true)}
      </div>

      {/* PC: ตาราง · มือถือ: การ์ด */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200"><th className="px-3 py-2 font-medium">แอป</th><th className="px-3 py-2 font-medium">ธีม</th><th className="px-3 py-2 font-medium">แถบบน</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {apps.map((a) => {
              const s = appScope(a.key);
              return (
                <tr key={a.key} data-focus-row={a.key === focusApp ? "" : undefined}
                  className={`border-b border-slate-100 last:border-0 ${a.key === focusApp ? "bg-amber-50/60" : ""}`}>
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-2"><Icon value={a.icon} /> <span className="font-medium text-slate-800">{a.label}</span> {edited(s)}</span></td>
                  <td className="px-3 py-2">{renderSelect(s)}</td>
                  <td className="px-3 py-2">{headerCell(a)}</td>
                  <td className="px-3 py-2 text-right"><button type="button" className="h-8 px-3 rounded-lg border border-slate-200 text-xs hover:bg-slate-50" onClick={() => setPreview({ app: a, cfg: cfgOf(effective(s)) })}>ดูตัวอย่าง</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-2">
        {apps.map((a) => {
          const s = appScope(a.key);
          return (
            <div key={a.key} data-focus-row={a.key === focusApp ? "" : undefined} className={`rounded-xl border bg-white p-3 ${a.key === focusApp ? "border-amber-300" : "border-slate-200"}`}>
              <div className="flex items-center gap-2 mb-2"><Icon value={a.icon} /><span className="font-medium text-slate-800">{a.label}</span>{edited(s)}
                <button type="button" className="ml-auto h-7 px-2.5 rounded-lg border border-slate-200 text-xs" onClick={() => setPreview({ app: a, cfg: cfgOf(effective(s)) })}>ดูตัวอย่าง</button></div>
              {renderSelect(s)}
              <div className="mt-1.5">{headerCell(a)}</div>
            </div>
          );
        })}
      </div>

      {/* แถบบันทึกทั้งหมด */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-[min(640px,calc(100%-24px))] rounded-xl border border-slate-200 bg-white shadow-lg px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-slate-500">{dirty ? `แก้ ${changes.length} รายการ ยังไม่บันทึก` : "ไม่มีอะไรค้าง"}</span>
        <span className="ml-auto flex gap-1.5">
          <button type="button" disabled={!dirty || busy} onClick={() => setDraft({})} className="h-8 px-3 rounded-lg border border-slate-200 text-xs disabled:opacity-40">ยกเลิกที่แก้</button>
          <button type="button" disabled={!dirty || busy || !canAssign} onClick={() => void saveAll()} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium disabled:opacity-40">{busy ? "กำลังบันทึก…" : "บันทึกทั้งหมด"}</button>
        </span>
      </div>

      <AppPreviewModal preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function AppPreviewModal({ preview, onClose }: { preview: { app: App; cfg: ErpThemeConfig | null } | null; onClose: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const send = useCallback(() => {
    ref.current?.contentWindow?.postMessage(themePreviewMessage(preview?.cfg ?? null), window.location.origin);
  }, [preview]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === `${THEME_PREVIEW_MSG}-ready`) send(); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [send]);
  const href = preview?.app.default_href || "/apps";
  return (
    <ERPModal open={!!preview} onClose={onClose} title={`ตัวอย่าง: ${preview?.app.label ?? ""}`} description="หน้าแรกของแอปในธีมที่เลือก (ยังไม่บันทึก) · ตอนนี้เห็นสีกับตัวอักษร" size="xl" storageKey="erp-theme-app-preview">
      {preview && <iframe ref={ref} src={`${href}${href.includes("?") ? "&" : "?"}embed=1`} onLoad={send} title="ตัวอย่างแอป" className="w-full h-[70vh] rounded-lg border border-slate-200 bg-white" />}
    </ERPModal>
  );
}
