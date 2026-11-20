"use client";

/**
 * เมนู "แบบ" ของหน้าพิมพ์ — บันทึกหน้าตาการพิมพ์เป็นแบบหลายชุด ตั้งชื่อได้ เลือกโหลดกลับมาใช้ (ของกลาง · เจ้าของขอ 2026-11-20)
 *
 *   <PrintPresetMenu tableId="print:qt" storageKey={`qt-print-preset:${id}`} getConfig={() => presetConfig} onApply={(cfg) => apply(cfg)}
 *     onSetDefault={saveDefault} onUseDefault={loadDefault} />
 *
 * - เก็บในระบบ "มุมมองที่บันทึก" ของกลาง (/api/saved-views · ตาราง erp_playground_saved_views · table_id = "print:<ชนิดเอกสาร>")
 *   ไม่มีที่เก็บแยก · ของทีม (ต้องมีสิทธิ์ saved_views.share) / ของฉัน
 * - บันทึกทับ · บันทึกเป็นแบบใหม่ · เปลี่ยนชื่อ · ลบ (ย้อนกลับได้จากแจ้งผล) — แก้/ลบได้เฉพาะเจ้าของ หรือ admin.saved_views
 * - ประวัติ: สร้าง/ลบ จดโดย RPC · แก้ (ชื่อ/ค่า) จดโดย PATCH /api/saved-views (changes: auditDiff)
 * - "ตั้งเป็นค่าเริ่มต้น / ใช้ค่าเริ่มต้น" = ค่าเริ่มต้นของทั้งระบบเดิม (report_layout_defaults) ส่งผ่าน onSetDefault / onUseDefault
 * - จำว่าใบนี้ใช้แบบไหนอยู่ (storageKey ในเครื่อง) — โชว์ชื่อบนปุ่ม
 */
import { useCallback, useEffect, useState } from "react";
import { Popover } from "@/components/popover";
import { Icon } from "@/components/icon";
import { askConfirm, askText } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { SavedView } from "@/app/api/saved-views/route";

type Preset = Pick<SavedView, "id" | "label" | "config" | "owner_id" | "owner_name" | "visibility" | "description">;

const readActive = (key?: string): string | null => { if (!key) return null; try { return localStorage.getItem(key); } catch { return null; } };
const writeActive = (key: string | undefined, id: string | null) => {
  if (!key) return;
  try { if (id) localStorage.setItem(key, id); else localStorage.removeItem(key); } catch { /* ไม่มี storage ก็แค่ไม่จำ */ }
};

export function PrintPresetMenu({ tableId, storageKey, getConfig, onApply, onSetDefault, onUseDefault, savingDefault }: {
  /** กลุ่มแบบ เช่น "print:qt" */
  tableId: string;
  /** จำแบบที่ใช้อยู่ของเอกสารนี้ (localStorage) */
  storageKey?: string;
  /** ค่าหน้าตาปัจจุบันที่จะบันทึก (ตัดค่าเฉพาะใบออกแล้ว) */
  getConfig: () => Record<string, unknown>;
  /** เลือกแบบ → ใช้ค่านี้ */
  onApply: (config: Record<string, unknown>) => void;
  onSetDefault?: () => void;
  onUseDefault?: () => void;
  savingDefault?: boolean;
}) {
  const toast = useToast();
  const { user, can } = useAuth();
  const canShare = can("saved_views.share" as Parameters<typeof can>[0]);
  const isAdmin = can("admin.saved_views" as Parameters<typeof can>[0]);
  const [items, setItems] = useState<Preset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/saved-views?table_id=${encodeURIComponent(tableId)}`).then((r) => r.json());
      if (!j.error) setItems((j.data ?? []) as Preset[]);
    } catch { /* โหลดไม่ได้ = ยังใช้หน้าพิมพ์ได้ปกติ */ }
  }, [tableId]);
  useEffect(() => { void load(); setActiveId(readActive(storageKey)); }, [load, storageKey]);

  const active = items.find((p) => p.id === activeId) ?? null;
  const canEdit = (p: Preset) => p.owner_id === user?.id || isAdmin;
  const choose = (id: string | null) => { setActiveId(id); writeActive(storageKey, id); };

  const call = async (url: string, init: RequestInit) => {
    const j = await apiFetch(url, { headers: { "Content-Type": "application/json" }, ...init }).then((r) => r.json());
    if (j.error) throw new Error(j.error);
    return j;
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "ทำไม่สำเร็จ"); } finally { setBusy(false); }
  };

  const createPreset = (visibility: "personal" | "team") => run(async () => {
    const label = await askText({ title: visibility === "team" ? "บันทึกเป็นแบบใหม่ (ของทีม)" : "บันทึกเป็นแบบใหม่ (ของฉัน)", placeholder: "เช่น แบบลูกค้าเซ็นทรัล / แบบไม่มีราคา", required: true, confirmText: "บันทึก" });
    if (!label) return;
    const j = await call("/api/saved-views", { method: "POST", body: JSON.stringify({ table_id: tableId, label: label.slice(0, 80), config: getConfig(), visibility, actor: user?.name }) });
    const row = j.data as Preset | null;
    await load();
    if (row?.id) choose(row.id);
    toast.success(`บันทึกแบบ "${label}" แล้ว`);
  });
  const overwrite = (p: Preset) => run(async () => {
    const before = p.config;
    await call(`/api/saved-views?id=${p.id}`, { method: "PATCH", body: JSON.stringify({ config: getConfig() }) });
    await load();
    toast.undo(`บันทึกทับแบบ "${p.label}" แล้ว`, async () => {
      try { await call(`/api/saved-views?id=${p.id}`, { method: "PATCH", body: JSON.stringify({ config: before }) }); await load(); onApply(before); }
      catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
    }, { ms: 10000 });
  });
  const rename = (p: Preset) => run(async () => {
    const label = await askText({ title: "เปลี่ยนชื่อแบบ", initial: p.label, required: true, confirmText: "บันทึก" });
    if (!label || label === p.label) return;
    await call(`/api/saved-views?id=${p.id}`, { method: "PATCH", body: JSON.stringify({ label: label.slice(0, 80) }) });
    await load();
  });
  const remove = (p: Preset) => run(async () => {
    if (!(await askConfirm({ title: `ลบแบบ "${p.label}"?`, message: p.visibility === "team" ? "แบบนี้เป็นของทีม — คนอื่นจะไม่เห็นแบบนี้แล้ว · ใบที่พิมพ์ไปแล้วไม่กระทบ" : "ใบที่พิมพ์ไปแล้วไม่กระทบ", variant: "danger", confirmText: "ลบ" }))) return;
    await call(`/api/saved-views?id=${p.id}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
    if (activeId === p.id) choose(null);
    await load();
    toast.undo(`ลบแบบ "${p.label}" แล้ว`, async () => {
      try {
        const j = await call("/api/saved-views", { method: "POST", body: JSON.stringify({ table_id: tableId, label: p.label, config: p.config, visibility: p.visibility === "system" ? "personal" : p.visibility, description: p.description, actor: user?.name }) });
        await load(); if ((j.data as Preset | null)?.id && activeId === p.id) choose((j.data as Preset).id);
      } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
    }, { ms: 10000 });
  });

  const team = items.filter((p) => p.visibility !== "personal");
  const mine = items.filter((p) => p.visibility === "personal");
  const item = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-slate-50 disabled:opacity-40";
  const group = (title: string, list: Preset[], close: () => void) => list.length > 0 && (
    <>
      <div className="px-3 pb-0.5 pt-1.5 text-[11px] text-slate-400">{title}</div>
      {list.map((p) => (
        <button key={p.id} type="button" className={`${item} ${p.id === activeId ? "font-semibold text-slate-900" : "text-slate-700"}`}
          onClick={() => { close(); choose(p.id); onApply(p.config); }} title={p.owner_name ? `บันทึกโดย ${p.owner_name}` : undefined}>
          <Icon value={p.id === activeId ? "i:check" : "i:bookmark"} className={`text-[14px] ${p.id === activeId ? "text-sky-600" : "text-slate-300"}`} />
          <span className="truncate">{p.label}</span>
        </button>
      ))}
    </>
  );

  return (
    <Popover align="left" panelClassName="w-72 py-1"
      trigger={(toggle, open) => (
        <button type="button" onClick={toggle} disabled={busy}
          className={`inline-flex h-9 max-w-[16rem] items-center gap-1.5 rounded-lg border px-3 text-sm ${open ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <Icon value="i:bookmark" className="shrink-0 text-[15px] text-sky-600" />
          <span className="shrink-0 text-slate-500">แบบ:</span>
          <span className="truncate font-medium text-slate-800">{active?.label ?? "ไม่ได้เลือก"}</span>
          <Icon value="i:chevron-down" className="shrink-0 text-[13px] text-slate-400" />
        </button>
      )}>
      {(close) => (
        <div className="max-h-[70vh] overflow-auto">
          {group("ของทีม", team, close)}
          {group("ของฉัน", mine, close)}
          {!items.length && <div className="px-3 py-2 text-[12px] text-slate-400">ยังไม่มีแบบที่บันทึก — จัดหน้าตาให้พอใจแล้วกด "บันทึกเป็นแบบใหม่"</div>}
          <div className="my-1 border-t border-slate-100" />
          {active && canEdit(active) && (
            <button type="button" className={`${item} text-slate-700`} onClick={() => { close(); void overwrite(active); }}>
              <Icon value="i:device-floppy" className="text-[14px] text-slate-400" />บันทึกทับ &quot;{active.label}&quot;</button>
          )}
          <button type="button" className={`${item} text-slate-700`} onClick={() => { close(); void createPreset("personal"); }}>
            <Icon value="i:plus" className="text-[14px] text-slate-400" />บันทึกเป็นแบบใหม่ (ของฉัน)…</button>
          {canShare && (
            <button type="button" className={`${item} text-slate-700`} onClick={() => { close(); void createPreset("team"); }}>
              <Icon value="i:users" className="text-[14px] text-slate-400" />บันทึกเป็นแบบใหม่ (ของทีม)…</button>
          )}
          {active && canEdit(active) && (
            <>
              <button type="button" className={`${item} text-slate-700`} onClick={() => { close(); void rename(active); }}>
                <Icon value="i:pencil" className="text-[14px] text-slate-400" />เปลี่ยนชื่อ…</button>
              <button type="button" className={`${item} text-red-600`} onClick={() => { close(); void remove(active); }}>
                <Icon value="i:trash" className="text-[14px]" />ลบแบบนี้</button>
            </>
          )}
          {(onSetDefault || onUseDefault) && <div className="my-1 border-t border-slate-100" />}
          {onUseDefault && (
            <button type="button" className={`${item} text-slate-700`} onClick={() => { close(); choose(null); onUseDefault(); }}>
              <Icon value="i:refresh" className="text-[14px] text-slate-400" />ใช้ค่าเริ่มต้น</button>
          )}
          {onSetDefault && (
            <button type="button" disabled={savingDefault} className={`${item} text-slate-700`} onClick={() => { close(); onSetDefault(); }}>
              <Icon value="i:star" className="text-[14px] text-amber-500" />ตั้งหน้าตานี้เป็นค่าเริ่มต้น (ทุกใบ)</button>
          )}
        </div>
      )}
    </Popover>
  );
}
