"use client";
/**
 * /admin/themes — คลังธีม (ธีมกลาง ERP เฟส 2 · เจ้าของเลือกตัวแก้แบบ A หน้าเต็ม + ข้อ 1,2,3,5 · 2026-11-24)
 *   การ์ดธีม (เรียบ · 2026-11-25 ข้อ 13): พรีวิวใหญ่ + ชื่อ + ป้ายสถานะ · แก้ / ทำสำเนา / ประวัติ / ลบ อยู่ในปุ่ม ⋯ (ลบ = ลงถังขยะ + ปุ่มย้อนกลับ)
 *   ธีมใหม่: จากธีมสำเร็จรูป 8 ชุด · สร้างจากรูป (ดูดสี) · เริ่มจากค่าเริ่ม
 *   ถังขยะ: กู้คืน · ลบถาวร (ยืนยันพิมพ์ชื่อ)
 *   ข้อมูล /api/themes · สิทธิ์ theme.view / theme.edit / theme.publish · docs/erp-theme.md
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ImageInput } from "@/components/image-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { ThemePreview } from "@/components/erp-theme/preview";
import { paletteFromImageKey } from "@/components/erp-theme/palette-from-image";
import { ThemeAssignPanel } from "@/components/erp-theme/assign-panel";
import { Popover } from "@/components/popover";
import {
  DEFAULT_THEME_CONFIG, THEME_PRESETS, mergeThemeConfig, normalizeThemeConfig, presetConfig, type ErpThemeConfig,
} from "@/lib/erp-theme-config";

type ThemeRow = {
  id: string; name: string; preset_key: string | null; draft_config: unknown; published_config: unknown;
  published_version: number; published_at: string | null; deleted_at: string | null;
  updated_by_name: string | null; updated_at: string; has_unpublished: boolean;
  usage?: { apps: string[]; company: boolean };
};

const when = (d: string) => new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ThemesPage() {
  const canView = usePermission("theme.view");
  const canEdit = usePermission("theme.edit");
  const canPublish = usePermission("theme.publish");
  const toast = useToast();
  const router = useRouter();
  const [trash, setTrash] = useState(false);
  // แท็บ: คลังธีม | แอปใช้ธีมไหน (?tab=apps&app=<key> มาจากปุ่มทางลัดในหน้าตั้งค่าแอป)
  const [tab, setTabState] = useState<"library" | "apps">("library");
  const [focusApp, setFocusApp] = useState<string | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("tab") === "apps") setTabState("apps");
    setFocusApp(sp.get("app"));
  }, []);
  const setTab = (t: "library" | "apps") => {
    setTabState(t);
    const u = new URL(window.location.href);
    if (t === "apps") u.searchParams.set("tab", "apps"); else { u.searchParams.delete("tab"); u.searchParams.delete("app"); }
    window.history.replaceState(null, "", u.toString());
  };
  const [rows, setRows] = useState<ThemeRow[] | null>(null);
  const [trashCount, setTrashCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [purge, setPurge] = useState<ThemeRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await apiFetch(`/api/themes${trash ? "?trash=1" : ""}`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setRows(j.data); setTrashCount(j.trash_count ?? 0);
    } catch (e) { setErr((e as Error).message); }
  }, [trash]);
  useEffect(() => { if (canView) { setRows(null); void load(); } }, [canView, load]);

  const act = async (id: string, action: string) => {
    const r = await apiFetch(`/api/themes/${id}`, { method: "POST", body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || "ทำรายการไม่สำเร็จ");
  };

  const toTrash = async (t: ThemeRow) => {
    try {
      await act(t.id, "trash");
      await load();
      toast.undo(`ย้าย "${t.name}" ลงถังขยะแล้ว`, async () => { await act(t.id, "untrash"); await load(); });
    } catch (e) { toast.error((e as Error).message); }
  };
  const restore = async (t: ThemeRow) => {
    try { await act(t.id, "untrash"); toast.success(`กู้คืน "${t.name}" แล้ว`); await load(); } catch (e) { toast.error((e as Error).message); }
  };
  const duplicate = async (t: ThemeRow) => {
    try {
      const r = await apiFetch("/api/themes", { method: "POST", body: JSON.stringify({ from_id: t.id }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "ทำสำเนาไม่สำเร็จ");
      toast.action(`สร้าง "${j.data.name}" แล้ว`, "เปิดแก้", () => router.push(`/admin/themes/${j.data.id}`));
      await load();
    } catch (e) { toast.error((e as Error).message); }
  };
  const doPurge = async () => {
    if (!purge) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/themes/${purge.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "ลบไม่สำเร็จ");
      toast.success(`ลบ "${purge.name}" ถาวรแล้ว`);
      setPurge(null); await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const menuItem = "w-full h-8 px-2.5 rounded-md text-left text-sm text-slate-700 hover:bg-slate-100 inline-flex items-center gap-2";
  const shown = useMemo(() => (rows ?? []).filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ดูคลังธีม (theme.view)" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-6xl mx-auto px-4 py-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Icon name="design" /> คลังธีม</h1>
            <p className="text-sm text-slate-500">สร้างธีม แล้วเลือกให้แต่ละแอปที่แท็บ "แอปใช้ธีมไหน" · แก้ร่างได้โดยคนอื่นยังเห็นธีมเดิมจนกด "เผยแพร่"</p>
          </div>
          {canEdit && !trash && tab === "library" && (
            <button type="button" onClick={() => setCreating(true)} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-1.5">
              <Icon name="plus" /> ธีมใหม่
            </button>
          )}
        </div>

        <div className="flex gap-1 mb-4 border-b border-slate-200">
          {([["library", "คลังธีม"], ["apps", "แอปใช้ธีมไหน"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`h-9 px-3 -mb-px border-b-2 text-sm ${tab === k ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</button>
          ))}
        </div>

        {tab === "apps" ? <ThemeAssignPanel focusApp={focusApp} /> : (<>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อธีม…" className="h-9 flex-1 min-w-[180px] rounded-lg border border-slate-200 px-3 text-sm" />
          <button type="button" onClick={() => setTrash((v) => !v)} className={`h-9 px-3 rounded-lg border text-sm inline-flex items-center gap-1.5 ${trash ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <Icon name="delete" /> {trash ? "กลับไปคลังธีม" : `ถังขยะ (${trashCount})`}
          </button>
        </div>

        {err ? <ErrorState title="โหลดคลังธีมไม่สำเร็จ" hint={err} onRetry={() => void load()} />
          : rows === null ? <LoadingState variant="cards" rows={6} />
          : shown.length === 0 ? (
            trash ? <EmptyState title="ถังขยะว่าง" hint="ธีมที่ลบจะมาอยู่ที่นี่ก่อน กู้คืนได้" />
              : q ? <EmptyState title="ไม่พบธีมที่ค้นหา" onClearFilters={() => setQ("")} />
              : <EmptyState title="ยังไม่มีธีม" hint="เริ่มจากธีมสำเร็จรูป 8 ชุด หรือสร้างจากรูปที่ชอบ" onCreate={canEdit ? () => setCreating(true) : undefined} createLabel="ธีมใหม่" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((t) => {
                const cfg = normalizeThemeConfig(t.draft_config);
                const badge = trash ? { text: "ในถังขยะ", cls: "bg-slate-100 text-slate-500" }
                  : t.published_version > 0 && t.has_unpublished ? { text: "มีร่างใหม่", cls: "bg-amber-50 text-amber-800" }
                  : t.published_version > 0 ? { text: `เผยแพร่ v${t.published_version}`, cls: "bg-emerald-50 text-emerald-700" }
                  : { text: "ร่าง", cls: "bg-slate-100 text-slate-600" };
                const used = [t.usage?.company ? "ธีมบริษัท" : "", t.usage?.apps.length ? `${t.usage.apps.length} แอป` : ""].filter(Boolean).join(" + ");
                return (
                  <div key={t.id} className="group rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-sm transition">
                    <Link href={trash ? "#" : `/admin/themes/${t.id}`} className="block p-2 bg-slate-50" aria-label={`แก้ธีม ${t.name}`} onClick={(e) => { if (trash) e.preventDefault(); }}>
                      <div className="pointer-events-none"><ThemePreview config={cfg} compact /></div>
                    </Link>
                    <div className="px-3 py-2.5 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900 truncate">{t.name}</div>
                        {!trash && used && <div className="text-[11px] text-slate-500 truncate">ใช้อยู่: {used}</div>}
                      </div>
                      <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>
                      <Popover align="right" panelClassName="w-52 p-1.5"
                        trigger={(toggle, open) => <button type="button" onClick={toggle} aria-expanded={open} aria-label={`เมนูของ ${t.name}`} className="shrink-0 w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center"><Icon value="i:dots-vertical" /></button>}>
                        {(close) => (
                          <div>
                            <div className="px-2.5 pb-1 text-[11px] text-slate-400">{t.deleted_at ? `ลบเมื่อ ${when(t.deleted_at)}` : `แก้ล่าสุด ${when(t.updated_at)}${t.updated_by_name ? ` · ${t.updated_by_name}` : ""}`}{!trash && !used ? " · ยังไม่มีแอปใช้" : ""}</div>
                            {trash ? (
                              <>
                                {canEdit && <button type="button" className={menuItem} onClick={() => { close(); void restore(t); }}><Icon name="back" /> กู้คืน</button>}
                                {canPublish && <button type="button" className={`${menuItem} text-red-700`} onClick={() => { close(); setPurge(t); }}><Icon name="delete" /> ลบถาวร</button>}
                              </>
                            ) : (
                              <>
                                <Link href={`/admin/themes/${t.id}`} className={menuItem} onClick={close}><Icon name="edit" /> {canEdit ? "แก้" : "ดู"}</Link>
                                {canEdit && <button type="button" className={menuItem} onClick={() => { close(); void duplicate(t); }}><Icon value="i:copy" /> ทำสำเนา</button>}
                                <Link href={`/admin/themes/${t.id}?history=1`} className={menuItem} onClick={close}><Icon name="history" /> ประวัติเวอร์ชัน</Link>
                                {canEdit && <button type="button" className={`${menuItem} text-red-700`} onClick={() => { close(); void toTrash(t); }}><Icon name="delete" /> ลบ (ลงถังขยะ)</button>}
                              </>
                            )}
                          </div>
                        )}
                      </Popover>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>)}
      </div>

      <NewThemeModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.push(`/admin/themes/${id}`); }} />

      <ConfirmDialog
        open={!!purge} onClose={() => setPurge(null)} onConfirm={() => void doPurge()} loading={busy}
        title="ลบธีมถาวร" variant="danger" confirmText="ลบถาวร" requireTyped={purge?.name}
        message={<>ลบ <b>{purge?.name}</b> พร้อมประวัติเวอร์ชันทั้งหมด <b>กู้คืนไม่ได้</b> · พิมพ์ชื่อธีมเพื่อยืนยัน</>}
      />
    </PlaygroundShell>
  );
}

function NewThemeModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"preset" | "image">("preset");
  const [preset, setPreset] = useState("ocean");
  const [name, setName] = useState("");
  const [imgKey, setImgKey] = useState<string | null>(null);
  const [fromImg, setFromImg] = useState<ErpThemeConfig | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setMode("preset"); setPreset("ocean"); setName(""); setImgKey(null); setFromImg(null); } }, [open]);

  useEffect(() => {
    if (!imgKey) { setFromImg(null); return; }
    let alive = true;
    setReading(true);
    paletteFromImageKey(imgKey).then((p) => {
      if (!alive) return;
      if (!p) { toast.warning("รูปนี้ไม่มีสีสดพอให้ดูดสี ลองรูปอื่นหรือเลือกธีมสำเร็จรูป"); setFromImg(null); return; }
      setFromImg(mergeThemeConfig(DEFAULT_THEME_CONFIG, {
        colors: { primary: p.primary, accent: p.accent },
        gradient: { color2: p.color2, spots: { top: true } },
        background: { image: imgKey, where: "banner", opacity: 70 },
      }));
    }).catch(() => { if (alive) toast.error("อ่านสีจากรูปไม่สำเร็จ"); }).finally(() => { if (alive) setReading(false); });
    return () => { alive = false; };
  }, [imgKey, toast]);

  const chosenName = THEME_PRESETS.find((p) => p.key === preset)?.name ?? "";
  const dirty = !!name || !!imgKey;
  const create = async () => {
    const finalName = name.trim() || (mode === "preset" ? chosenName : "ธีมจากรูป");
    if (mode === "image" && !fromImg) { toast.warning("เลือกรูปก่อน"); return; }
    setSaving(true);
    try {
      const body = mode === "preset" ? { name: finalName, preset_key: preset } : { name: finalName, config: fromImg };
      const r = await apiFetch("/api/themes", { method: "POST", body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "สร้างไม่สำเร็จ");
      toast.success(`สร้าง "${finalName}" แล้ว`);
      onCreated(j.data.id);
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} title="ธีมใหม่" size="xl" hasUnsavedChanges={dirty} storageKey="erp-theme-new"
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 text-sm">ยกเลิก</button><button type="button" disabled={saving || reading} onClick={() => void create()} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">{saving ? "กำลังสร้าง…" : "สร้างแล้วเปิดแก้"}</button></div>}>
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">ชื่อธีม</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={mode === "preset" ? chosenName : "ธีมจากรูป"} className="mt-1 w-full h-9 rounded-lg border border-slate-200 px-3 text-sm" />
        </label>
        <div className="flex gap-1">
          {([["preset", "เริ่มจากธีมสำเร็จรูป"], ["image", "สร้างจากรูป (ดูดสี)"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`h-8 px-3 rounded-lg border text-xs ${mode === k ? "bg-blue-50 border-blue-300 text-blue-800 font-medium" : "bg-white border-slate-200 text-slate-600"}`}>{l}</button>
          ))}
        </div>
        {mode === "preset" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {THEME_PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => setPreset(p.key)} className={`text-left rounded-xl border p-2 ${preset === p.key ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300"}`}>
                <div className="pointer-events-none"><ThemePreview config={presetConfig(p.key)} compact /></div>
                <div className="mt-1.5 text-sm font-medium text-slate-800">{p.name}</div>
                <div className="text-[11px] text-slate-500">{p.description}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <ImageInput value={imgKey} onChange={setImgKey} folder="themes" />
              <p className="text-[11px] text-slate-400 mt-1">ระบบดูดสีหลัก สีเน้น และสีไล่จากรูป แล้วใช้รูปเป็นแบนเนอร์ให้ · ปรับต่อในตัวแก้ได้</p>
            </div>
            <div>{reading ? <LoadingState label="กำลังอ่านสีจากรูป…" /> : fromImg ? <ThemePreview config={fromImg} /> : <EmptyState title="เลือกรูปที่ชอบ" hint="รูปสินค้า รูปแบรนด์ หรือภาพบรรยากาศก็ได้" />}</div>
          </div>
        )}
      </div>
    </ERPModal>
  );
}
