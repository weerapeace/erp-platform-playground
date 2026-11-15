"use client";

/**
 * 📚 Design Library — ติดแท็กแผงผ้าจากป๊อปเลือกวัสดุ (รอบ 8 · เจ้าของเลือก 2026-11-15)
 * ปัญหาเดิม: จุดซิป/เทปเปิดแท็บแผงแล้วว่าง เพราะแผงยังไม่ติดแท็กของหมวด → ต้องไปตั้งที่หน้า SKU แท็บ Swatch
 * ป๊อปนี้: รายการแผงทั้งหมด (ค้นได้) · กด "ติดแท็ก ซิป" / "เอาออก" ทีละแผง → บันทึกทันทีผ่าน API แผงเดิม (/api/sku-swatches PATCH family_tag_ids)
 * สิทธิ์ products.edit (เหมือนตั้งค่าแผง) · audit ที่ API แผง · ไม่แตะรูป/ชิ้นบนแผง
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { SwatchCard } from "@/app/api/sku-swatches/route";
import { img } from "./shared";

export function BoardTagModal({ open, onClose, tags, onChanged }: {
  open: boolean; onClose: () => void;
  /** แท็กของหมวด (มี id แล้ว) */
  tags: { id: string; name: string }[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [tagId, setTagId] = useState(tags[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SwatchCard[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const tag = tags.find((t) => t.id === tagId) ?? tags[0];

  const load = useCallback(async (search: string) => {
    try {
      const p = new URLSearchParams({ limit: "60", offset: "0" });
      if (search.trim()) p.set("search", search.trim());
      const j = await apiFetch(`/api/sku-swatches?${p}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows(j.swatches as SwatchCard[]);
    } catch (e) { toast.error((e as Error).message || "โหลดแผงไม่สำเร็จ กรุณาลองใหม่"); setRows([]); }
  }, [toast]);
  useEffect(() => { if (!open) return; const t = setTimeout(() => void load(q), 250); return () => clearTimeout(t); }, [open, q, load]);

  const toggle = async (s: SwatchCard) => {
    if (!tag) return;
    const has = s.family_tag_ids.includes(tag.id);
    const next = has ? s.family_tag_ids.filter((x) => x !== tag.id) : [...s.family_tag_ids, tag.id];
    setBusy(s.id);
    try {
      const j = await apiFetch(`/api/sku-swatches`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, family_tag_ids: next }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows((p) => (p ?? []).map((x) => (x.id === s.id ? { ...x, family_tag_ids: next, tags: has ? x.tags.filter((t) => t.id !== tag.id) : [...x.tags, { id: tag.id, name: tag.name }] } : x)));
      setChanged(true);
      toast.success(has ? `เอาแท็ก “${tag.name}” ออกจากแผงแล้ว` : `ติดแท็ก “${tag.name}” ให้แผงแล้ว`);
    } catch (e) { toast.error((e as Error).message || "บันทึกไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(null); }
  };
  const close = () => { if (changed) onChanged(); onClose(); };

  return (
    <ERPModal open={open} onClose={close} title="ติดแท็กแผงผ้า" size="lg" storageKey="design-library-board-tag"
      description="แผงที่ติดแท็กของหมวดจะขึ้นก่อนในแท็บแผงผ้า — กดทีละแผง บันทึกทันที"
      footer={<div className="flex"><button type="button" onClick={close} className="ml-auto h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">เสร็จแล้ว</button></div>}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {tags.length > 1 && tags.map((t) => (
            <button key={t.id} type="button" onClick={() => setTagId(t.id)} aria-pressed={t.id === tag?.id}
              className={`h-8 px-3 text-[12.5px] rounded-full border ${t.id === tag?.id ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>แท็ก {t.name}</button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อแผง / รหัส SW" className="flex-1 min-w-[180px] h-9 px-3 border border-slate-200 rounded-lg text-sm" />
        </div>
        {!rows ? <div className="py-8 text-center text-[13px] text-slate-400">กำลังโหลดแผง…</div>
          : rows.length === 0 ? <div className="py-8 text-center text-[13px] text-slate-400">ไม่พบแผง</div> : (
            <div className="max-h-[55vh] overflow-y-auto space-y-1.5 pr-1">
              {rows.map((s) => {
                const has = !!tag && s.family_tag_ids.includes(tag.id);
                return (
                  <div key={s.id} className={`flex items-center gap-2.5 rounded-lg border p-1.5 ${has ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {s.image_key ? <img src={img(s.image_key, 160)} alt="" className="w-12 h-12 rounded-md object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-12 h-12 rounded-md bg-slate-100 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-slate-800 truncate">{s.name || s.code || "แผงไม่มีชื่อ"}</div>
                      <div className="text-[11px] text-slate-500 truncate">{s.code ? `${s.code} · ` : ""}{s.spot_count} ชิ้น{s.tags.length ? ` · แท็ก: ${s.tags.map((t) => t.name).join(", ")}` : " · ยังไม่มีแท็ก"}</div>
                    </div>
                    <button type="button" disabled={busy === s.id || !tag} onClick={() => void toggle(s)}
                      className={`h-8 px-3 text-[12.5px] rounded-lg border inline-flex items-center gap-1 shrink-0 disabled:opacity-50 ${has ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}>
                      <Icon value={has ? "i:x" : "i:tag"} />{busy === s.id ? "กำลังบันทึก…" : has ? "เอาออก" : `ติดแท็ก ${tag?.name ?? ""}`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </ERPModal>
  );
}
