"use client";
/**
 * ↕️ จัดเรียง / ซ่อนเมนู — แท็บใน ⚙️ ตั้งค่าแอปเดี่ยว (แอดมิน) · ค่ากลางทั้งทีม เฉพาะแอปนี้
 *   ลาก ⠿ เรียงลำดับ (useDragReorder ของกลาง) · แต่ละเมนูเลือก บนแถบ / ในปุ่ม "เพิ่มเติม ▾" / ซ่อน · ตั้งชื่อปุ่มรวมเมนู
 *   บันทึกแบบร่าง → 💾 · ลำดับ/ที่อยู่ = PATCH /api/menu {app_override} (รวมฝั่งเซิร์ฟเวอร์ + ประวัติ)
 *   ชื่อปุ่ม = PATCH /api/menu/apps {menu_more_label} · กฎ/ที่เก็บ: lib/app-menu-layout
 *   เมนูย่อย (มีเมนูแม่) ไม่โผล่ในลิสต์ — ไปตามเมนูแม่
 */
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { DEFAULT_MORE_LABEL, effectiveSort, menuPlace, planLayoutSave, type AppMenuPlace } from "@/lib/app-menu-layout";
import type { AppSettingsMenuItem } from "./index";

export function MenuLayoutTab({ appKey, appId, moreLabel, defaultHref, items, onSaved }: {
  appKey: string;
  appId?: string | null;
  /** ชื่อปุ่มรวมเมนูที่บันทึกไว้ (erp_app_groups.menu_more_label) */
  moreLabel?: string | null;
  /** หน้าแรกของแอป — เตือนถ้าจะซ่อน */
  defaultHref?: string | null;
  items: AppSettingsMenuItem[];
  onSaved: () => void;
}) {
  const toast = useToast();
  // เมนูหลักของแอป เรียงตามลำดับของแอปนี้
  const top = useMemo(() => {
    const ids = new Set(items.map((i) => i.id));
    return items.filter((i) => !i.parent_id || !ids.has(i.parent_id)).sort((a, b) => effectiveSort(a, appKey) - effectiveSort(b, appKey));
  }, [items, appKey]);
  const origOrder = useMemo(() => top.map((i) => i.id), [top]);
  const origPlaces = useMemo(() => Object.fromEntries(top.map((i) => [i.id, menuPlace(i, appKey)])) as Record<string, AppMenuPlace>, [top, appKey]);
  const origLabel = (moreLabel ?? "").trim();
  const [order, setOrder] = useState(origOrder);
  const [places, setPlaces] = useState(origPlaces);
  const [label, setLabel] = useState(origLabel);
  const [saving, setSaving] = useState(false);
  const reset = () => { setOrder(origOrder); setPlaces(origPlaces); setLabel(origLabel); };
  // โหลดค่าใหม่ (บันทึกแล้ว) → ล้างร่าง
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [origOrder, origPlaces, origLabel]);

  const byId = useMemo(() => new Map(top.map((i) => [i.id, i])), [top]);
  const kidsN = (id: string) => items.filter((k) => k.parent_id === id).length;
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => setOrder((o) => moveItem(o, from, to)));
  const shown = label.trim() || DEFAULT_MORE_LABEL;
  const placeOf = (id: string): AppMenuPlace => places[id] ?? "bar";
  const labelDirty = label.trim() !== origLabel;
  const dirty = order.join() !== origOrder.join() || order.some((id) => placeOf(id) !== (origPlaces[id] ?? "bar")) || labelDirty;
  const rows = order.map((id) => byId.get(id)).filter((x): x is AppSettingsMenuItem => !!x);
  const onBar = rows.filter((r) => placeOf(r.id) === "bar");
  const inMore = rows.filter((r) => placeOf(r.id) === "more");
  const hiddenN = rows.length - onBar.length - inMore.length;
  const homeHidden = rows.some((r) => placeOf(r.id) === "hidden" && defaultHref && r.href === defaultHref);

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    let ok = 0; const errs: string[] = [];
    for (const p of planLayoutSave(top, appKey, order, places)) {
      try {
        const r = await apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, app_override: { app_key: appKey, set: p.set } }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
        ok++;
      } catch (e) { errs.push(`${byId.get(p.id)?.label ?? "เมนู"}: ${e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"}`); }
    }
    if (labelDirty) {
      try {
        if (!appId) throw new Error("ไม่พบแอปนี้ในทะเบียนแอป");
        const r = await apiFetch("/api/menu/apps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: appId, patch: { menu_more_label: label.trim() || null } }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
        ok++;
      } catch (e) { errs.push(`ชื่อปุ่มรวมเมนู: ${e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"}`); }
    }
    setSaving(false);
    if (errs.length) toast.error(errs.slice(0, 3).join(" · "));
    if (ok || !errs.length) { toast.success("บันทึกแล้ว — คนที่เปิดแอปอยู่จะเห็นเมื่อรีเฟรช"); onSaved(); }
  };

  const PLACES: [AppMenuPlace, string][] = [["bar", "บนแถบ"], ["more", `ใน “${shown}”`], ["hidden", "ซ่อน"]];
  const segCls = (on: boolean, p: AppMenuPlace) => `h-7 px-2.5 text-xs whitespace-nowrap transition-colors ${on
    ? (p === "hidden" ? "bg-red-50 text-red-700 font-medium" : p === "more" ? "bg-amber-50 text-amber-800 font-medium" : "bg-violet-50 text-violet-700 font-medium")
    : "text-slate-500 hover:bg-slate-50"}`;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-3 p-4 pb-24">
        <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-slate-600">
          ลาก ⠿ เพื่อเรียงลำดับ · เลือกให้แต่ละเมนู <b>อยู่บนแถบ</b> / <b>รวมในปุ่ม “{shown} ▾”</b> (กดแล้วเป็นรายการ) / <b>ซ่อน</b>
          <br />เป็นค่ากลางทั้งทีม เฉพาะแอปนี้ — เมนูที่ใช้ร่วมกับแอปอื่น (เช่น SKUs) เปลี่ยนเฉพาะในแอปนี้ · ซ่อนเมนูไม่ได้กันเข้าหน้า (กันจริงตั้งที่ “สิทธิ์ตามตำแหน่ง”)
        </div>

        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">ชื่อปุ่มรวมเมนู</span>
          <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 40))} placeholder={DEFAULT_MORE_LABEL}
            className="h-8 w-48 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-violet-400 focus:outline-none" />
          <span className="text-xs text-slate-400">เว้นว่าง = “{DEFAULT_MORE_LABEL}”</span>
        </label>

        {/* ตัวอย่างแถบเมนู (สด ตามร่าง) */}
        <div>
          <div className="mb-1 text-xs text-slate-500">ตัวอย่างแถบเมนู</div>
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-2 text-sm text-white/85">
            {onBar.map((r) => <span key={r.id} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 whitespace-nowrap"><span>{r.icon ?? "•"}</span>{r.label}</span>)}
            {inMore.length > 0 && <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-white/15 px-2 whitespace-nowrap">⋯ {shown} ▾ <span className="text-[11px] text-white/60">({inMore.length})</span></span>}
            {!onBar.length && !inMore.length && <span className="px-2 text-xs text-white/60">ไม่มีเมนูให้เห็นเลย</span>}
          </div>
          <div className="mt-1 text-xs text-slate-500">บนแถบ {onBar.length} · ใน “{shown}” {inMore.length} · ซ่อน {hiddenN}</div>
        </div>

        {homeHidden && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠️ ซ่อนเมนูที่เป็น “หน้าแรกของแอป” อยู่ — เปิดแอปแล้วจะไปเมนูแรกที่เห็นแทน</div>}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {rows.map((r, i) => {
            const p = placeOf(r.id);
            const changed = p !== (origPlaces[r.id] ?? "bar") || origOrder[i] !== r.id;
            const kids = kidsN(r.id);
            return (
              <div key={r.id} {...rowProps(i)} className={`flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2 first:border-t-0 ${changed ? "bg-amber-50/60" : ""} ${rowCls(i)}`}>
                <DragHandle {...handleProps(i)} className="text-lg" />
                <span className="w-6 text-center">{r.icon ?? "•"}</span>
                <span className={`min-w-0 flex-1 truncate text-sm ${p === "hidden" ? "text-slate-400 line-through" : "font-medium text-slate-800"}`}>{r.label}</span>
                {defaultHref && r.href === defaultHref && <span className="rounded bg-blue-50 px-1.5 text-[10px] text-blue-700">หน้าแรก</span>}
                {kids > 0 && <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">▾ เมนูย่อย {kids}</span>}
                <span className="ml-auto inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-200">
                  {PLACES.map(([k, t]) => (
                    <button key={k} type="button" onClick={() => setPlaces((s) => ({ ...s, [r.id]: k }))} className={segCls(p === k, k)}>{t}</button>
                  ))}
                </span>
              </div>
            );
          })}
          {!rows.length && <div className="p-6 text-center text-sm text-slate-400">แอปนี้ยังไม่มีเมนู — เพิ่มได้ที่ “จัดการเมนู/ไอคอน/ลำดับ ↗”</div>}
        </div>
      </div>

      {/* แถบบันทึก (โหมดร่าง) */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)" }}>
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <span className="flex-1 text-sm text-slate-700">จัดเมนูแล้ว (ยังไม่บันทึก) — มีผลกับทุกคนในแอปนี้</span>
            <button type="button" onClick={reset} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "💾 บันทึก"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
