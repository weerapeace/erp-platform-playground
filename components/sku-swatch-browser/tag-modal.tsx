"use client";

/**
 * SwatchTagModal — ป๊อป "ติดแท็กแผงผ้า" ของกลาง (ย้ายมาจาก Design Library รอบ 8 → ใช้ได้ทุกหน้า)
 *   เลือกแท็ก (ส่งมาจากหน้าแม่ เช่น แท็กของหมวดซิป) → รายการแผง (ค้นได้ · ดูเฉพาะที่ยังไม่ติดแท็ก) → กด "ติดแท็ก" / "เอาออก" ทีละแผง บันทึกทันที
 *   บันทึกผ่าน saveSwatchTags (PATCH /api/sku-swatches family_tag_ids · audit ที่ API) · สิทธิ์ products.edit · ไม่แตะรูป/ชิ้น
 * ใช้ที่: Design Library (ป๊อปเลือกวัสดุ · components/design-library/board-tag.tsx ส่งต่อมาที่นี่)
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { HoverPreview } from "@/components/hover-image";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import type { SwatchCard } from "@/app/api/sku-swatches/route";
import { saveSwatchTags } from "./index";
import { swatchTitle } from "./viewer";
import { ColorStrip } from "./list-views";

export function SwatchTagModal({ open, onClose, tags, onChanged, title = "ติดแท็กแผงผ้า", description = "แผงที่ติดแท็กของหมวดจะขึ้นก่อนในแท็บแผงผ้า — กดทีละแผง บันทึกทันที", storageKey = "design-library-board-tag" }: {
  open: boolean; onClose: () => void;
  /** แท็กที่ให้เลือกติด (มี id แล้ว) */
  tags: { id: string; name: string }[];
  /** ปิดป๊อปหลังมีการเปลี่ยนแท็ก */
  onChanged: () => void;
  title?: string; description?: string; storageKey?: string;
}) {
  const toast = useToast();
  const [tagId, setTagId] = useState(tags[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [onlyUntagged, setOnlyUntagged] = useState(false);
  const [rows, setRows] = useState<SwatchCard[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const tag = tags.find((t) => t.id === tagId) ?? tags[0];

  const load = useCallback(async (search: string, untagged: boolean) => {
    try {
      const p = new URLSearchParams({ limit: "120", offset: "0" });
      if (search.trim()) p.set("search", search.trim());
      if (untagged) p.set("no_tags", "1");
      const j = await apiFetch(`/api/sku-swatches?${p}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows(j.swatches as SwatchCard[]);
    } catch (e) { toast.error((e as Error).message || "โหลดแผงไม่สำเร็จ กรุณาลองใหม่"); setRows([]); }
  }, [toast]);
  useEffect(() => { if (!open) return; const t = setTimeout(() => void load(q, onlyUntagged), 250); return () => clearTimeout(t); }, [open, q, onlyUntagged, load]);

  const toggle = async (s: SwatchCard) => {
    if (!tag) return;
    const has = s.family_tag_ids.includes(tag.id);
    const next = has ? s.family_tag_ids.filter((x) => x !== tag.id) : [...s.family_tag_ids, tag.id];
    setBusy(s.id);
    try {
      await saveSwatchTags(s.id, next);
      setRows((p) => (p ?? []).map((x) => (x.id === s.id ? { ...x, family_tag_ids: next, tags: has ? x.tags.filter((t) => t.id !== tag.id) : [...x.tags, { id: tag.id, name: tag.name }] } : x)));
      setChanged(true);
      toast.success(has ? `เอาแท็ก “${tag.name}” ออกจากแผงแล้ว` : `ติดแท็ก “${tag.name}” ให้แผงแล้ว`);
    } catch (e) { toast.error((e as Error).message || "บันทึกไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(null); }
  };
  const close = () => { if (changed) onChanged(); onClose(); };

  return (
    <ERPModal open={open} onClose={close} title={title} size="lg" storageKey={storageKey} description={description}
      footer={<div className="flex"><button type="button" onClick={close} className="ml-auto h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">เสร็จแล้ว</button></div>}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {tags.length > 1 && tags.map((t) => (
            <button key={t.id} type="button" onClick={() => setTagId(t.id)} aria-pressed={t.id === tag?.id}
              className={`h-8 px-3 text-[12.5px] rounded-full border ${t.id === tag?.id ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>แท็ก {t.name}</button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อแผง / รหัส SW / ชื่อสี" className="flex-1 min-w-[180px] h-9 px-3 border border-slate-200 rounded-lg text-sm" />
          <label className="flex items-center gap-1.5 text-[12px] text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={onlyUntagged} onChange={(e) => setOnlyUntagged(e.target.checked)} className="accent-indigo-600" /> เฉพาะที่ยังไม่ติดแท็ก
          </label>
        </div>
        {!rows ? <div className="py-8 text-center text-[13px] text-slate-400">กำลังโหลดแผง…</div>
          : rows.length === 0 ? <div className="py-8 text-center text-[13px] text-slate-400">{onlyUntagged ? "ทุกแผงติดแท็กแล้ว" : "ไม่พบแผง"}</div> : (
            <div className="max-h-[55vh] overflow-y-auto space-y-1.5 pr-1">
              {rows.map((s) => {
                const has = !!tag && s.family_tag_ids.includes(tag.id);
                return (
                  <div key={s.id} className={`flex items-center gap-2.5 rounded-lg border p-1.5 ${has ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
                    <HoverPreview url={s.image_key ? r2ImageUrl(s.image_key, 1200) : null} previewW={480}>
                      <span className="block w-12 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {s.image_key ? <img src={r2ImageUrl(s.image_key, 160) ?? ""} alt="" className="w-12 h-12 rounded-md object-cover bg-slate-100" loading="lazy" /> : <span className="block w-12 h-12 rounded-md bg-slate-100" />}
                        <ColorStrip colors={s.chip_colors} className="h-1 mt-0.5 rounded-sm" />
                      </span>
                    </HoverPreview>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-slate-800 truncate">{swatchTitle(s)}</div>
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
