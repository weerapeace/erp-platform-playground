"use client";
// คลังไฟล์: ป๊อปจัดการ (ข้อมูลประกอบ · อัลบั้มใหม่ · ชนิดงานพิมพ์ · ชนิด artwork · กฎ path · แผนที่โฟลเดอร์ Drive) — แยกจาก index.tsx (Y1)
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { HelpButton } from "@/components/help-guides";
import type { PrintType } from "@/app/api/print-types/route";
import type { LookupItem, PathRule } from "./asset-shared";

// ── สร้างอัลบั้มใหม่ ──
/** จัดการ อัลบั้ม / แท็ก — เปลี่ยนชื่อ + ลบ (ไฟล์ข้างในไม่ถูกลบ) */
export function ManageMetaModal({ kind, items, onClose, onChanged }: {
  kind: "albums" | "tags"; items: { id: string; name: string; count: number }[];
  onClose: () => void; onChanged: (deletedId?: string) => void | Promise<void>;
}) {
  const toast = useToast();
  const t = useT();
  const api = kind === "albums" ? "/api/assets/collections" : "/api/assets/tags";
  const noun = kind === "albums" ? t("อัลบั้ม", "album") : t("แท็ก", "tag");
  const [ed, setEd] = useState<{ id: string; name: string } | null>(null);
  const [delAsk, setDelAsk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rename = async () => {
    if (!ed || !ed.name.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ed.id, name: ed.name.trim() }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(t("เปลี่ยนชื่อแล้ว", "Renamed")); setEd(null);
      await onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(`${api}?id=${id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`${t("ลบ", "Deleted ")}${noun}${t("แล้ว", "")}`); setDelAsk(null);
      await onChanged(id);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed")); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="sm" title={kind === "albums" ? t("⚙️ จัดการอัลบั้ม", "⚙️ Manage albums") : t("⚙️ จัดการแท็ก", "⚙️ Manage tags")}
      description={t("เปลี่ยนชื่อ หรือลบ — ไฟล์ข้างในไม่ถูกลบ", "Rename or delete — files are kept")}
      footer={<div className="flex justify-end w-full"><button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button></div>}>
      {items.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">{t("ยังไม่มีรายการ", "Nothing here yet")}</p> : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 max-h-[55vh] overflow-auto">
          {items.map((it) => ed?.id === it.id ? (
            <div key={it.id} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50/40">
              <input value={ed.name} autoFocus disabled={busy} onChange={(e) => setEd({ ...ed, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") void rename(); if (e.key === "Escape") setEd(null); }}
                className="flex-1 min-w-0 h-8 px-2 text-sm border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={() => void rename()} disabled={busy || !ed.name.trim()} className="h-8 px-3 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">{t("บันทึก", "Save")}</button>
              <button onClick={() => setEd(null)} disabled={busy} className="h-8 px-2.5 text-xs border border-slate-200 bg-white rounded-lg text-slate-600">{t("ยกเลิก", "Cancel")}</button>
            </div>
          ) : delAsk === it.id ? (
            <div key={it.id} className="px-3 py-2 bg-rose-50/60 space-y-1.5">
              <p className="text-[13px] text-slate-700">{t("ลบ", "Delete ")}{noun} <b>{it.name}</b>? {it.count > 0 ? `${it.count} ${t("ไฟล์จะหลุดจาก", "files will leave this ")}${noun}${t("นี้ (ไฟล์ยังอยู่ในคลัง)", " (files stay in the library)")}` : ""}</p>
              <div className="flex justify-end gap-1.5">
                <button onClick={() => setDelAsk(null)} disabled={busy} className="h-7 px-2.5 text-xs border border-slate-200 bg-white rounded-md text-slate-600">{t("ไม่ลบ", "Cancel")}</button>
                <button onClick={() => void remove(it.id)} disabled={busy} className="h-7 px-2.5 text-xs bg-rose-600 text-white rounded-md hover:bg-rose-700 disabled:opacity-50">{busy ? "…" : t("ยืนยันลบ", "Delete")}</button>
              </div>
            </div>
          ) : (
            <div key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1 min-w-0 truncate text-slate-700">{kind === "albums" ? "📁 " : "🏷️ "}{it.name}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{it.count} {t("ไฟล์", "files")}</span>
              <button onClick={() => { setDelAsk(null); setEd({ id: it.id, name: it.name }); }} className="shrink-0 text-xs text-indigo-600 hover:underline">✏️ {t("เปลี่ยนชื่อ", "Rename")}</button>
              <button onClick={() => { setEd(null); setDelAsk(it.id); }} className="shrink-0 text-xs text-rose-600 hover:underline">🗑 {t("ลบ", "Delete")}</button>
            </div>
          ))}
        </div>
      )}
    </ERPModal>
  );
}

export function NewCollectionModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) { toast.error(t("ใส่ชื่ออัลบั้มก่อน", "Enter an album name first")); return; }
    setBusy(true);
    try {
      const res = await apiFetch("/api/assets/collections", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(t("สร้างอัลบั้มแล้ว", "Album created")); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("สร้างไม่สำเร็จ", "Create failed")); }
    finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} title={t("สร้างอัลบั้มใหม่", "New album")} size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={create} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("สร้าง", "Create")}</button>
        </div>
      }>
      <label className="text-[12px] text-slate-500">{t("ชื่ออัลบั้ม", "Album name")}
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder={t("เช่น รูปสินค้าใหม่ Q2", "e.g. New product images Q2")}
          className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </label>
    </ERPModal>
  );
}

// ── จัดการประเภทงานพิมพ์ (DTF/UV/…) + ขนาดเริ่มต้นต่อประเภท — ตั้งค่าเองได้ ไม่ต้องแก้โค้ด ──
export function ManagePrintTypesModal({ types, onClose, onChanged }: { types: PrintType[]; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const t = useT();
  const [rows, setRows] = useState<PrintType[]>(types);
  const [busy, setBusy] = useState(false);
  const [nc, setNc] = useState({ code: "", name: "", w: "", h: "", unit: "cm", sub: "" });
  const [delTarget, setDelTarget] = useState<PrintType | null>(null);
  const [root, setRoot] = useState<{ folder_id: string; local_base_path: string }>({ folder_id: "", local_base_path: "" });
  const [rootBusy, setRootBusy] = useState(false);
  const [rootEdit, setRootEdit] = useState(false);   // ตั้งค่าแล้ว = โชว์แบบ readonly มีปุ่มแก้ไข

  useEffect(() => { apiFetch("/api/ui-config?key=print_drive_root").then((r) => r.json()).then((j) => setRoot({ folder_id: String(j.value?.folder_id ?? ""), local_base_path: String(j.value?.local_base_path ?? "") })).catch(() => {}); }, []);
  const saveRoot = async (next: { folder_id: string; local_base_path: string }) => {
    setRootBusy(true);
    try { await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "print_drive_root", value: next }) }); }
    catch { toast.error(t("บันทึกโฟลเดอร์แม่ไม่สำเร็จ", "Failed to save parent folder")); } finally { setRootBusy(false); }
  };

  const reload = async () => {
    try { const j = await (await apiFetch(`/api/print-types?_=${Date.now()}`)).json(); setRows((j.data ?? []) as PrintType[]); } catch { /* ignore */ }
    await onChanged();
  };

  const add = async () => {
    const code = nc.code.trim(); if (!code) { toast.error(t("ใส่รหัสประเภทก่อน (เช่น DTF)", "Enter a type code first (e.g. DTF)")); return; }
    setBusy(true);
    try {
      const res = await apiFetch("/api/print-types", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name: nc.name.trim() || code, default_w: nc.w, default_h: nc.h, unit: nc.unit, drive_subpath: nc.sub }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("เพิ่มไม่สำเร็จ", "Failed to add"));
      setNc({ code: "", name: "", w: "", h: "", unit: "cm", sub: "" }); toast.success(`${t("เพิ่ม", "Added")} “${code}”`); await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เพิ่มไม่สำเร็จ", "Failed to add")); }
    finally { setBusy(false); }
  };

  const patch = async (pt: PrintType, body: Record<string, unknown>) => {
    try {
      const res = await apiFetch(`/api/print-types/${pt.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("แก้ไม่สำเร็จ", "Edit failed"));
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("แก้ไม่สำเร็จ", "Edit failed")); }
  };

  const doDelete = async () => {
    const dt = delTarget; if (!dt) return; setDelTarget(null); setBusy(true);
    try {
      const res = await apiFetch(`/api/print-types/${dt.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || t("ลบไม่สำเร็จ", "Delete failed"));
      toast.success(`${t("ปิดใช้", "Disabled")} “${dt.code}”`); await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed")); }
    finally { setBusy(false); }
  };

  const inp = "h-8 px-2 text-[12px] border border-slate-200 rounded-lg";
  return (
    <ERPModal open onClose={onClose} title={t("⚙️ ประเภทงานพิมพ์", "⚙️ Print types")} size="md"
      description={t("ตั้งขนาดเริ่มต้นต่อประเภท — เลือกประเภทตอนเพิ่มงานพิมพ์แล้วจะเติมขนาดให้เอง (แก้ทับได้)", "Set a default size per type — picking a type when adding a print job fills in the size for you (overridable)")}
      footer={<div className="flex justify-end w-full"><button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button></div>}>
      {/* โฟลเดอร์แม่ของงานพิมพ์ — งานพิมพ์ทุกชิ้นไปที่นี่ (ไม่สนแบรนด์) · ตั้งแล้ว = readonly + ปุ่มแก้ */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5 mb-3">
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <p className="text-[12px] font-medium text-slate-700 flex items-center gap-1.5">{t("📁 โฟลเดอร์แม่ของงานพิมพ์", "📁 Print jobs parent folder")} <HelpButton guideKey="drive-setup" label={t("ตั้งค่า Drive", "Set up Drive")} /></p>
          {root.folder_id && !rootEdit && <button type="button" onClick={() => setRootEdit(true)} className="text-[11px] text-indigo-600 hover:underline shrink-0">{t("✏️ แก้ไข", "✏️ Edit")}</button>}
        </div>
        {root.folder_id && !rootEdit ? (
          // โหมดอ่าน — ตั้งค่าแล้ว
          <div className="space-y-0.5">
            <p className="text-[11px] text-slate-500">Folder ID: <span className="font-mono text-slate-700">{root.folder_id}</span></p>
            {root.local_base_path && <p className="text-[11px] text-slate-500">{t("path ในเครื่อง:", "Local path:")} <span className="font-mono text-slate-700">{root.local_base_path}</span></p>}
            <p className="text-[10px] text-emerald-600 mt-0.5">{t("✓ งานพิมพ์ทุกชิ้นจะเก็บใต้โฟลเดอร์นี้ (ไม่แยกตามแบรนด์)", "✓ Every print job is stored under this folder (not split by brand)")}</p>
          </div>
        ) : (
          // โหมดแก้ไข
          <>
            <p className="text-[10px] text-slate-500 mb-1.5">{t("งานพิมพ์ทุกชิ้นจะเก็บใต้โฟลเดอร์นี้ (ไม่แยกตามแบรนด์) · ต้องแชร์โฟลเดอร์นี้ให้ Service Account เดิมก่อน", "Every print job is stored under this folder (not split by brand) · share this folder with the same Service Account first")}</p>
            <label className="block text-[11px] text-slate-500">Folder ID <span className="text-slate-300">{t("(จาก URL หลัง /folders/)", "(from the URL after /folders/)")}</span>
              <input defaultValue={root.folder_id} onBlur={(e) => { const v = e.target.value.trim(); if (v !== root.folder_id) { const nx = { ...root, folder_id: v }; setRoot(nx); void saveRoot(nx); } }}
                placeholder={t("เช่น 1mCsDfY-E15CHm46_Vvwg9U", "e.g. 1mCsDfY-E15CHm46_Vvwg9U")} className={`${inp} font-mono mt-0.5`} /></label>
            <label className="block text-[11px] text-slate-500 mt-1.5">{t("path ในเครื่อง", "Local path")} <span className="text-slate-300">{t("(ถ้ามี — ไว้ทำ path ต้นฉบับ)", "(if any — used to build the source path)")}</span>
              <input defaultValue={root.local_base_path} onBlur={(e) => { const v = e.target.value.trim(); if (v !== root.local_base_path) { const nx = { ...root, local_base_path: v }; setRoot(nx); void saveRoot(nx); } }}
                placeholder={t("เช่น G:\Shared drives\Printed", "e.g. G:\Shared drives\Printed")} className={`${inp} font-mono mt-0.5`} /></label>
            <div className="flex items-center justify-between mt-1">
              {rootBusy ? <span className="text-[10px] text-indigo-500">{t("กำลังบันทึก…", "Saving…")}</span>
                : !root.folder_id ? <span className="text-[10px] text-amber-600">{t("⚠ ยังไม่ตั้ง — งานพิมพ์จะไปโฟลเดอร์แม่หลัก/ตามแบรนด์แทน", "⚠ Not set yet — print jobs will go to the main parent folder / by brand instead")}</span>
                : <span />}
              {root.folder_id && <button type="button" onClick={() => setRootEdit(false)} className="text-[11px] text-slate-500 hover:text-slate-700">{t("เสร็จ", "Done")}</button>}
            </div>
          </>
        )}
      </div>

      <div className="space-y-1.5 mb-3">
        {rows.length === 0 && <p className="text-[12px] text-slate-400 py-3 text-center">{t("ยังไม่มีประเภทงานพิมพ์", "No print types yet")}</p>}
        {rows.map((pt) => (
          <div key={pt.id} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="w-20 font-mono text-[12px] text-slate-700 truncate">{pt.code}</span>
              <input defaultValue={pt.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== pt.name) void patch(pt, { name: v }); }}
                className={`${inp} flex-1`} placeholder={t("ชื่อที่แสดง", "Display name")} />
              <div className="flex items-center gap-1">
                <input defaultValue={pt.default_w ?? ""} inputMode="decimal" placeholder={t("กว้าง", "Width")}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(pt.default_w ?? "")) void patch(pt, { default_w: v }); }}
                  className={`${inp} w-12 text-center`} />
                <span className="text-slate-300 text-[11px]">×</span>
                <input defaultValue={pt.default_h ?? ""} inputMode="decimal" placeholder={t("สูง", "Height")}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(pt.default_h ?? "")) void patch(pt, { default_h: v }); }}
                  className={`${inp} w-12 text-center`} />
                <span className="text-[10px] text-slate-400">{pt.unit}</span>
              </div>
              <button onClick={() => setDelTarget(pt)} disabled={busy} className="w-6 text-slate-400 hover:text-red-500 text-sm" title={t("ปิดใช้ประเภทนี้", "Disable this type")}>🗑</button>
            </div>
            <div className="flex items-center gap-1.5 mt-1 pl-[5.5rem]">
              <span className="text-[10px] text-slate-400 shrink-0">{t("📁 โฟลเดอร์ Drive", "📁 Drive folder")}</span>
              <input defaultValue={pt.drive_subpath ?? ""} placeholder={t("เช่น Printed/DTF (เว้นว่าง = ใช้รหัส)", "e.g. Printed/DTF (blank = use the code)")}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (pt.drive_subpath ?? "")) void patch(pt, { drive_subpath: v }); }}
                className={`${inp} flex-1 font-mono`} />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-2.5">
        <p className="text-[11px] font-medium text-slate-500 mb-1.5">{t("+ เพิ่มประเภทใหม่", "+ Add a new type")}</p>
        <div className="flex items-center gap-2">
          <input value={nc.code} onChange={(e) => setNc((s) => ({ ...s, code: e.target.value }))} placeholder={t("รหัส เช่น SCREEN", "code, e.g. SCREEN")} className={`${inp} w-24`} />
          <input value={nc.name} onChange={(e) => setNc((s) => ({ ...s, name: e.target.value }))} placeholder={t("ชื่อที่แสดง", "Display name")} className={`${inp} flex-1`} />
          <input value={nc.w} onChange={(e) => setNc((s) => ({ ...s, w: e.target.value }))} inputMode="decimal" placeholder={t("กว้าง", "Width")} className={`${inp} w-14 text-center`} />
          <span className="text-slate-300 text-[11px]">×</span>
          <input value={nc.h} onChange={(e) => setNc((s) => ({ ...s, h: e.target.value }))} inputMode="decimal" placeholder={t("สูง", "Height")} className={`${inp} w-14 text-center`} />
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <input value={nc.sub} onChange={(e) => setNc((s) => ({ ...s, sub: e.target.value }))} placeholder={t("📁 โฟลเดอร์ Drive เช่น Printed/SCREEN", "📁 Drive folder, e.g. Printed/SCREEN")} className={`${inp} flex-1 font-mono`} />
          <button onClick={add} disabled={busy} className="h-8 px-3 text-[12px] font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("เพิ่ม", "Add")}</button>
        </div>
      </div>

      {delTarget && (
        <ConfirmDialog open title={t("ปิดใช้ประเภทนี้?", "Disable this type?")} variant="danger" confirmText={t("ปิดใช้", "Disable")}
          message={`“${delTarget.code}” ${t("จะไม่โผล่ให้เลือกอีก · งานพิมพ์เดิมที่ใช้ประเภทนี้ยังอยู่ครบ", "won't appear for selection anymore · existing print jobs using this type stay intact")}`}
          onConfirm={doDelete} onClose={() => setDelTarget(null)} />
      )}
    </ERPModal>
  );
}

// ── จัดการชนิด Artwork (lookup กลาง: เพิ่ม/แก้/ลบ) ──
export function ManageTypesModal({ types, onClose, onChanged }: { types: LookupItem[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const t = useT();
  const [items, setItems] = useState<LookupItem[]>(types);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      // bust cache — GET /api/lookups ตั้ง max-age=600 ไม่งั้นได้ลิสต์เก่าหลังเพิ่ม/ลบ/แก้ (ดูเหมือนทำไม่ได้)
      const r = await apiFetch(`/api/lookups?type=artwork_type&_=${Date.now()}`); const j = await r.json();
      setItems(((j.data ?? []) as { id: string; name: string }[]).map((x) => ({ id: x.id, name: x.name })));
    } catch { /* ignore */ }
    onChanged();
  };
  const add = async () => {
    const n = newName.trim(); if (!n) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/lookups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lookup_type: "artwork_type", name: n }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setNewName(""); await reload(); toast.success(t("เพิ่มชนิดแล้ว", "Type added"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เพิ่มไม่สำเร็จ", "Failed to add")); } finally { setBusy(false); }
  };
  const rename = async (id: string, name: string) => {
    const n = name.trim(); if (!n) return;
    try {
      const r = await apiFetch(`/api/lookups/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
      const j = await r.json(); if (j.error) throw new Error(j.error); await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("แก้ไม่สำเร็จ", "Edit failed")); }
  };
  const del = async (id: string) => {
    try {
      const r = await apiFetch(`/api/lookups/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({})); if (j.error) throw new Error(j.error);
      await reload(); toast.success(t("ลบแล้ว", "Deleted"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed")); }
  };

  return (
    <ERPModal open onClose={onClose} title={t("จัดการชนิด Artwork", "Manage Artwork types")} size="sm"
      footer={<div className="flex justify-end w-full"><button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button></div>}>
      <div className="flex flex-col gap-1.5 mb-3">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2">
            <input defaultValue={it.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.name) void rename(it.id, v); }}
              className="flex-1 h-8 px-2 text-[13px] border border-slate-200 rounded-lg" />
            <button onClick={() => del(it.id)} className="h-8 px-2.5 text-[12px] text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">{t("ลบ", "Delete")}</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-[12px] text-slate-400">{t("ยังไม่มีชนิด — เพิ่มด้านล่าง", "No types yet — add one below")}</p>}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("ชนิดใหม่ เช่น แบนเนอร์", "new type, e.g. banner")}
          className="flex-1 h-8 px-2 text-[13px] border border-slate-200 rounded-lg" />
        <button onClick={add} disabled={busy || !newName.trim()} className="h-8 px-3 text-[12px] font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("＋ เพิ่ม", "＋ Add")}</button>
      </div>
      <p className="text-[10px] text-slate-400 mt-2">{t("แก้ชื่อ: พิมพ์ทับในช่องแล้วคลิกที่อื่นเพื่อบันทึก · ลบแล้วงานเดิมยังเก็บชื่อชนิดไว้", "Rename: type over the field then click elsewhere to save · after deleting, existing items keep their type name")}</p>
    </ERPModal>
  );
}

// ตั้งค่าโฟลเดอร์ Drive: แบรนด์ → โฟลเดอร์ฐาน · ชนิด → ชื่อซับโฟลเดอร์ (โชว์เมื่อ Drive ตั้งค่าแล้ว)
export function DriveFolderMap() {
  const toast = useToast();
  const t = useT();
  const [driveOn, setDriveOn] = useState(false);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [bDraft, setBDraft] = useState<Record<string, string>>({});   // brand_id → folder id
  const [bLabel, setBLabel] = useState<Record<string, string>>({});   // brand_id → ชื่อโฟลเดอร์ (ตรวจแล้ว)
  const [bLocal, setBLocal] = useState<Record<string, string>>({});   // brand_id → path ในเครื่อง (ฐาน)
  const [tDraft, setTDraft] = useState<Record<string, string>>({});   // type → subfolder name
  useEffect(() => {
    apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {});
    apiFetch("/api/lookups?type=artwork_type").then((r) => r.json()).then((j) => setTypes(((j.data ?? []) as { name: string }[]).map((x) => x.name).filter(Boolean))).catch(() => {});
    apiFetch("/api/drive/brand-folders").then((r) => r.json()).then((j) => {
      setDriveOn(!!j.configured);
      const d: Record<string, string> = {}, l: Record<string, string> = {}, lo: Record<string, string> = {};
      for (const r of (j.data ?? []) as { brand_id: string; folder_id: string | null; folder_label: string | null; local_base_path: string | null }[]) { d[r.brand_id] = r.folder_id ?? ""; l[r.brand_id] = r.folder_label ?? ""; lo[r.brand_id] = r.local_base_path ?? ""; }
      setBDraft(d); setBLabel(l); setBLocal(lo);
    }).catch(() => {});
    apiFetch("/api/drive/folders").then((r) => r.json()).then((j) => {
      const d: Record<string, string> = {};
      for (const r of (j.data ?? []) as { artwork_type: string; subfolder_name: string | null }[]) d[r.artwork_type] = r.subfolder_name ?? "";
      setTDraft(d);
    }).catch(() => {});
  }, []);
  const saveBrand = async (id: string) => {
    const fid = (bDraft[id] ?? "").trim();
    const lbp = (bLocal[id] ?? "").trim();
    try {
      if (!fid && !lbp) { await apiFetch(`/api/drive/brand-folders?brand_id=${encodeURIComponent(id)}`, { method: "DELETE" }); setBLabel((m) => { const n = { ...m }; delete n[id]; return n; }); toast.success(t("ล้างแล้ว", "Cleared")); return; }
      const res = await apiFetch("/api/drive/brand-folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: id, folder_id: fid, local_base_path: lbp }) });
      const j = await res.json(); if (!res.ok || j.error) { toast.error(j.error || t("บันทึกไม่สำเร็จ", "Save failed")); return; }
      setBLabel((m) => ({ ...m, [id]: j.folder_label ?? "" })); toast.success(j.pathUpdated ? `${t("บันทึกแล้ว · อัปเดต path", "Saved · updated path for")} ${j.pathUpdated} ${t("รูปตามฐานใหม่", "images to the new base")}` : t("บันทึกแล้ว", "Saved"));
    } catch { toast.error(t("บันทึกไม่สำเร็จ", "Save failed")); }
  };
  const saveType = async (at: string) => {
    try {
      const res = await apiFetch("/api/drive/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artwork_type: at, subfolder_name: tDraft[at] ?? "" }) });
      const j = await res.json(); if (!res.ok || j.error) { toast.error(j.error || t("บันทึกไม่สำเร็จ", "Save failed")); return; }
      const extra = [j.renamed ? `${t("เปลี่ยนชื่อโฟลเดอร์ Drive", "Renamed Drive folder")} ${j.renamed}` : "", j.pathUpdated ? `${t("อัปเดต path", "updated path")} ${j.pathUpdated} ${t("รูป", "images")}` : ""].filter(Boolean).join(" · ");
      toast.success(extra ? `${t("บันทึกแล้ว ·", "Saved ·")} ${extra}` : t("บันทึกแล้ว", "Saved"));
    } catch { toast.error(t("บันทึกไม่สำเร็จ", "Save failed")); }
  };
  if (!driveOn) return null;
  return (
    <>
      <div className="mt-4 pt-3 border-t border-slate-100">
        <p className="text-[12px] text-slate-600 font-medium">{t("📁 โฟลเดอร์ตามแบรนด์ (Drive folder id + path ในเครื่อง)", "📁 Folder by brand (Drive folder id + local path)")}</p>
        <p className="text-[11px] text-slate-400 mb-2">{t("Drive folder id = ที่อัปไฟล์ขึ้น (ต้องแชร์ให้ service account) · path ในเครื่อง = ฐานสำหรับเติมช่อง “path ต้นฉบับ” อัตโนมัติ เช่น", "Drive folder id = where files are uploaded (must be shared with the service account) · local path = base for auto-filling the “source path” field, e.g.")} <span className="font-mono">G:\Shared drives\Louis Montini\[01] Catalogs\01_Assets\[01] Louis Montini</span></p>
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {brands.map((b) => (
            <div key={b.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex-1 text-[12px] text-slate-700 font-medium truncate" title={b.name}>{b.name}</span>
                {bLabel[b.id] && <span className="text-[11px] text-emerald-600 truncate max-w-[120px] shrink-0" title={bLabel[b.id]}>✓ {bLabel[b.id]}</span>}
                <button type="button" onClick={() => saveBrand(b.id)} className="h-7 px-2.5 text-[11px] rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shrink-0">{t("บันทึก", "Save")}</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 text-[11px] text-slate-400 shrink-0">Drive folder id</span>
                <input value={bDraft[b.id] ?? ""} onChange={(e) => setBDraft((d) => ({ ...d, [b.id]: e.target.value }))} placeholder={t("ปล่อยว่าง = ใช้โฟลเดอร์แม่", "leave blank = use parent folder")}
                  className="flex-1 h-7 px-2 text-[12px] font-mono border border-slate-200 rounded" />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-24 text-[11px] text-slate-400 shrink-0">{t("path ในเครื่อง", "Local path")}</span>
                <input value={bLocal[b.id] ?? ""} onChange={(e) => setBLocal((d) => ({ ...d, [b.id]: e.target.value }))} placeholder="G:\Shared drives\…\[01] Louis Montini"
                  className="flex-1 h-7 px-2 text-[12px] font-mono border border-slate-200 rounded" />
              </div>
            </div>
          ))}
          {brands.length === 0 && <p className="text-[11px] text-slate-400">{t("ยังไม่มีแบรนด์", "No brands yet")}</p>}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100">
        <p className="text-[12px] text-slate-600 font-medium">{t("🗂️ ชื่อซับโฟลเดอร์ตามชนิด (ใต้โฟลเดอร์แบรนด์)", "🗂️ Subfolder name by type (under the brand folder)")}</p>
        <p className="text-[11px] text-slate-400 mb-2">{t("เช่น โลโก้ → “01_Logo” · ปล่อยว่าง = ใช้ชื่อชนิดเป็นชื่อซับ", "e.g. logo → “01_Logo” · blank = use the type name as the subfolder")}</p>
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {types.map((ty) => (
            <div key={ty} className="flex items-center gap-2">
              <span className="w-24 text-[12px] text-slate-600 truncate shrink-0" title={ty}>{ty}</span>
              <input value={tDraft[ty] ?? ""} onChange={(e) => setTDraft((d) => ({ ...d, [ty]: e.target.value }))} placeholder={ty}
                className="flex-1 h-8 px-2 text-[12px] border border-slate-200 rounded" />
              <button type="button" onClick={() => saveType(ty)} className="h-8 px-2 text-[11px] rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shrink-0">{t("บันทึก", "Save")}</button>
            </div>
          ))}
          {types.length === 0 && <p className="text-[11px] text-slate-400">{t("ยังไม่มีชนิดงาน", "No work types yet")}</p>}
        </div>
      </div>
    </>
  );
}

// ตั้งค่าโฟลเดอร์มาตรฐาน (admin) — หลาย path ได้ (บรรทัดละ 1)
export function ArtworkPathRuleModal({ rule, onClose, onSaved }: { rule: PathRule; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const t = useT();
  const [text, setText] = useState(rule.base_paths.join("\n"));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const base_paths = text.split("\n").map((s) => s.trim()).filter(Boolean);
      const res = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "artwork_path_rule", value: { base_paths } }) });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      toast.success(t("บันทึกโฟลเดอร์มาตรฐานแล้ว", "Standard folders saved")); onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); } finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} title={t("ตั้งค่าโฟลเดอร์มาตรฐานของ Artwork", "Configure standard Artwork folders")} size="md"
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{busy ? t("บันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
      </div>}>
      <p className="text-[12px] text-slate-500 mb-2">{t("artwork ทุกอันควรเก็บใต้โฟลเดอร์เหล่านี้ — ถ้า path ที่กรอกไม่ขึ้นต้นด้วยอันใดอันหนึ่ง ระบบจะ", "All artwork should be stored under these folders — if the entered path doesn't start with one of them, the system will")} <b className="text-amber-600">{t("เตือน", "warn")}</b> {t("(ไม่บล็อก). ใส่ได้หลายโฟลเดอร์ บรรทัดละ 1", "(not blocking). Enter multiple folders, one per line")}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} spellCheck={false}
        placeholder={"G:\\Shared drives\\Louis Montini\\[4] Assets\\4. Artworks\n\\\\nas\\Artwork"}
        className="w-full px-3 py-2 text-[12px] font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <DriveFolderMap />
    </ERPModal>
  );
}
