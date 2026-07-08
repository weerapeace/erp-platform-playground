"use client";

// ============================================================
// GifPokeAdmin — จัดการคลัง GIF (เฉพาะแอดมิน/ผู้จัดการ)
// เพิ่ม (อัปโหลด/ลิงก์) · แก้ชื่อ+หมวด+ลำดับ · แสดง/ซ่อน · ลบ
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { avatarSrc } from "@/lib/r2-image";
import { useT } from "@/components/i18n";

type LibItem = { id: string; gif_url: string | null; gif_key: string | null; title: string | null; category: string | null; is_active: boolean; sort_order: number };
const src = (g: LibItem) => avatarSrc(g.gif_url || g.gif_key || null);

export function GifPokeAdmin({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged?: () => void }) {
  const t = useT();
  const [items, setItems] = useState<LibItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dirty = useRef(false);   // มีการแก้ → แจ้ง parent ตอนปิด

  const load = useCallback(() => {
    setLoading(true);
    apiFetch("/api/gif-poke/library?all=1").then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); else setItems((j.data as LibItem[]) ?? []); })
      .catch(() => setErr(t("โหลดคลังไม่สำเร็จ", "Load failed"))).finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { if (open) { setErr(""); dirty.current = false; load(); } }, [open, load]);

  const patchItem = async (id: string, patch: Partial<LibItem>) => {
    dirty.current = true;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));   // optimistic
    const res = await apiFetch("/api/gif-poke/library", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const j = await res.json();
    if (!res.ok || j.error) { setErr(j.error || t("บันทึกไม่สำเร็จ", "Save failed")); load(); }
  };

  const del = async (id: string) => {
    if (!confirm(t("ลบ GIF นี้ออกจากคลัง?", "Remove this GIF?"))) return;
    dirty.current = true;
    setItems((prev) => prev.filter((it) => it.id !== id));
    await apiFetch(`/api/gif-poke/library?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => { /* noop */ });
  };

  const addUrl = async () => {
    if (!/^https?:\/\//i.test(newUrl.trim())) { setErr(t("ต้องเป็นลิงก์ http(s)", "Must be an http(s) link")); return; }
    setErr(""); setBusy(true);
    try {
      const res = await apiFetch("/api/gif-poke/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gif_url: newUrl.trim(), title: newTitle.trim() }) });
      const j = await res.json();
      if (!res.ok || j.error) { setErr(j.error || t("เพิ่มไม่สำเร็จ", "Add failed")); return; }
      dirty.current = true; setItems((prev) => [j.data as LibItem, ...prev]); setNewUrl(""); setNewTitle("");
    } catch { setErr(t("เพิ่มไม่สำเร็จ", "Add failed")); } finally { setBusy(false); }
  };

  const upload = async (file: File) => {
    setErr(""); setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await apiFetch("/api/gif-poke/library", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || j.error) { setErr(j.error || t("อัปโหลดไม่สำเร็จ", "Upload failed")); return; }
      dirty.current = true; setItems((prev) => [j.data as LibItem, ...prev]);
    } catch { setErr(t("อัปโหลดไม่สำเร็จ", "Upload failed")); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const close = () => { if (dirty.current) onChanged?.(); onClose(); };

  return (
    <ERPModal open={open} onClose={close} size="lg" storageKey="gif-poke-admin"
      title={t("🗂 จัดการคลัง GIF", "🗂 Manage GIF library")}
      description={t("เพิ่ม/ลบ/ซ่อน · แก้ชื่อ หมวด และลำดับ", "Add/remove/hide · edit name, category, order")}
      footer={<button onClick={close} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">{t("เสร็จ", "Done")}</button>}>
      <div className="space-y-3">
        {/* เพิ่มใหม่ */}
        <div className="flex flex-wrap items-end gap-2 bg-slate-50 rounded-xl p-2.5">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] text-slate-500 mb-0.5">{t("เพิ่มลิงก์ GIF", "GIF link")}</label>
            <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://...gif" className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg" />
          </div>
          <div className="w-28">
            <label className="block text-[11px] text-slate-500 mb-0.5">{t("ชื่อ", "Title")}</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t("ชื่อ", "Title")} className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg" />
          </div>
          <button onClick={addUrl} disabled={busy || !newUrl.trim()} className="h-8 px-3 text-xs font-bold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{t("＋ เพิ่มลิงก์", "＋ Add link")}</button>
          <input ref={fileRef} type="file" accept="image/gif,image/webp,image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="h-8 px-3 text-xs font-medium text-violet-700 bg-violet-100 rounded-lg hover:bg-violet-200 disabled:opacity-50">{busy ? t("...", "...") : t("⬆ อัปโหลด", "⬆ Upload")}</button>
        </div>

        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        {loading ? (
          <p className="text-sm text-slate-400 py-6 text-center">{t("กำลังโหลด...", "Loading...")}</p>
        ) : (
          <div className="space-y-1.5 max-h-[52vh] overflow-y-auto">
            {items.map((g) => {
              const s = src(g);
              return (
                <div key={g.id} className={`flex items-center gap-2 p-1.5 rounded-lg border ${g.is_active ? "border-slate-100" : "border-slate-100 bg-slate-50 opacity-60"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s && <img src={s} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" />}
                  <input defaultValue={g.title ?? ""} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (g.title ?? "")) void patchItem(g.id, { title: v }); }}
                    placeholder={t("ชื่อ", "Title")} className="w-32 h-8 px-2 text-sm border border-slate-200 rounded-lg" />
                  <input defaultValue={g.category ?? ""} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (g.category ?? "")) void patchItem(g.id, { category: v }); }}
                    placeholder={t("หมวด", "Category")} className="w-24 h-8 px-2 text-sm border border-slate-200 rounded-lg" />
                  <input type="number" defaultValue={g.sort_order} onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (v !== g.sort_order) void patchItem(g.id, { sort_order: v }); }}
                    title={t("ลำดับ", "Order")} className="w-14 h-8 px-2 text-sm border border-slate-200 rounded-lg" />
                  <button onClick={() => void patchItem(g.id, { is_active: !g.is_active })} title={g.is_active ? t("ซ่อน", "Hide") : t("แสดง", "Show")}
                    className={`h-8 px-2 text-xs rounded-lg shrink-0 ${g.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{g.is_active ? t("แสดง", "Shown") : t("ซ่อน", "Hidden")}</button>
                  <button onClick={() => void del(g.id)} title={t("ลบ", "Delete")} className="h-8 px-2 text-xs text-red-600 hover:bg-red-50 rounded-lg shrink-0">🗑</button>
                </div>
              );
            })}
            {items.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">{t("คลังว่าง — เพิ่ม GIF ด้านบน", "Empty — add GIFs above")}</p>}
          </div>
        )}
      </div>
    </ERPModal>
  );
}
