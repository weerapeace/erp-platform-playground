"use client";

/**
 * SwatchBrowser — แท็บ 🎨 Swatch ในหน้า /master/skus (ข้าง 📦 Bundle) · เจ้าของเรียกว่า "แผงผ้า"
 *
 * Swatch = รูปแผ่นตัวอย่างจริง (การ์ดสีผ้า / ด้าย / อะไหล่) · 1 แผ่นมีได้หลายรูป (รูปแรก = ปก)
 *   ชิ้นบนรูป = รหัสภายใน (SW-0001-01) + สีจริง + ชื่อสี + เลขบนแผง · ผูก SKU ได้ภายหลัง (ไม่บังคับ)
 *   โหมดดู    — เห็นแต่รูป ไม่มีเส้นกรอบ · ชี้ที่ชิ้น = ป้ายรหัส/สี/ชื่อ (+SKU/สต๊อก) · กด = เมนูเล็ก (ขอซื้อ / ดู SKU / ผูก-สร้าง SKU / เลือกหลายรายการ)
 *   โหมดตั้งค่า — ตัวแก้แผง (board-editor.tsx): รูป เพิ่ม/ครอป/หมุน/เรียง/ปก · ชิ้น วาด/✨ อ่านจากรูป (AI)/แบ่ง/แก้
 * จัดหมวดด้วยแท็กกลาง (product_families) ชุดเดียวกับหน้า SKU
 *
 * ไฟล์: index (รายการแผ่น) · create-modal (ป๊อปเพิ่มแผ่น) · viewer (ดู/ตั้งค่า เต็มจอ) · board-editor (ตัวแก้ใช้ร่วม) · swatch-tools (ดูดสี/AI/อัปรูป)
 * ของกลางที่ใช้: ImageRegions · ImageFreeCropModal (ครอปกรอบอิสระ) · ColorInput · SkuPicker · SkuWizard · TagGroupFilter · uploadImagesWithDupCheck
 *               · UploadProgress · ERPModal · ConfirmDialog · MasterRecordDrawer · PrCreateModal · BundleAddModal · lib/sku-swatch (สูตร)
 * API: /api/sku-swatches (GET/POST/PATCH/DELETE) · /api/sku-swatches/ai-read (บริการเสียเงิน ai.swatch_read) · สิทธิ์ตั้งค่า = products.edit · ดู = products.view
 * โหมดเลือกใส่ตะกร้า (2026-11-05 หน้าขอซื้อ แท็บ "แผงผ้า"): ส่ง onPickSkus → "ขอซื้อ" / แถบเลือกหลายรายการ ส่งรายการให้หน้าแม่
 * โหมดเลือก 1 ชิ้น (2026-11-13 Design Library): ส่ง onPickSpot → เมนูเล็กบนชิ้นมี "✓ เลือกชิ้นนี้" บนสุด
 *   คืนรูปที่ชิ้นอยู่ + กรอบของชิ้น (% ของรูป) + รหัส/สี/ชื่อ + SKU (ถ้าผูก) ให้หน้าแม่ แล้วปิดแผง
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { TagGroupFilter, type TagFilterValue } from "@/components/tag-filter";
import type { PrCreateItem } from "@/components/pr-create-modal";
import type { SwatchCard, SwatchSpot } from "@/app/api/sku-swatches/route";
import { CreateSwatchModal } from "./create-modal";
import { SwatchViewer, swatchTitle } from "./viewer";

const PAGE = 60;
const EMPTY_FILTER: TagFilterValue = { tagIds: [], none: false };

/** ชิ้นที่เลือกจากแผง (โหมด onPickSpot) — image_key = รูปที่ชิ้นอยู่ · x/y/w/h = % ของรูปนั้น */
export type SwatchSpotPick = {
  swatch_id: string; swatch_name: string; image_key: string | null; image_w: number | null; image_h: number | null;
  spot_id: string; x: number; y: number; w: number; h: number; label: string | null;
  /** รหัสภายใน (SW-0001-01) · ชื่อสี · สีจริง */
  code: string | null; name: string | null; color_hex: string | null;
  sku: SwatchSpot["sku"];
};

export function SwatchBrowser({ openId, focusSpotId, onPickSkus, onPickSpot }: {
  /** โหมดเลือก 1 ชิ้น — มีค่า = เมนูบนชิ้นมี "✓ เลือกชิ้นนี้" แล้วปิดแผง */
  onPickSpot?: (pick: SwatchSpotPick) => void;
  /** เปิดแผ่นนี้ทันที (มาจากลิงก์ในหน้า SKU) */
  openId?: string | null;
  /** โหมดเลือกใส่ตะกร้า (หน้าขอซื้อ) — มีค่า = ปุ่มขอซื้อส่งรายการให้หน้าแม่แทนการเปิดฟอร์มเอง */
  onPickSkus?: (items: PrCreateItem[], sourceNote: string) => void;
  /** ชี้ตำแหน่งจุดนี้บนแผ่นที่เปิด (วงกะพริบชั่วคราว) */
  focusSpotId?: string | null;
} = {}) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [rows, setRows] = useState<SwatchCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<TagFilterValue>(EMPTY_FILTER);
  const [createOpen, setCreateOpen] = useState(false);
  const [open, setOpen] = useState<{ id: string; edit: boolean; spotId?: string | null } | null>(openId ? { id: openId, edit: false, spotId: focusSpotId ?? null } : null);
  // ลิงก์มาถึงหลังหน้าโหลดแล้ว (พารามิเตอร์อ่านใน effect ของหน้าแม่) → เปิดตาม
  useEffect(() => { if (openId) setOpen({ id: openId, edit: false, spotId: focusSpotId ?? null }); }, [openId, focusSpotId]);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async (append = false, have = 0) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(append ? have : 0) });
      if (q) p.set("search", q);
      if (tagFilter.tagIds.length) p.set("family_ids", tagFilter.tagIds.join(","));
      const j = await apiFetch(`/api/sku-swatches?${p}`).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      setRows((prev) => (append ? [...prev, ...(j.swatches as SwatchCard[])] : (j.swatches as SwatchCard[])));
      setTotal(Number(j.total ?? 0));
    } catch { toast.error("โหลด swatch ไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, [q, tagFilter, toast]);
  useEffect(() => { void load(false); }, [load]);

  return (
    <div>
      {/* แถบบน: ค้นหา + กรองแท็ก + เพิ่ม */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-10 flex-1 min-w-[240px] bg-white focus-within:ring-2 focus-within:ring-indigo-500">
          <span className="text-slate-400">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา (ชื่อแผ่น / รหัส SW / ชื่อสี / เลขบนแผง / รหัสหรือชื่อ SKU)"
            className="flex-1 h-full text-sm outline-none bg-transparent" />
          {search && <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>}
        </div>
        <TagGroupFilter value={tagFilter} onChange={setTagFilter} label="กรองแท็ก" showNone={false} />
        {canEdit && <button onClick={() => setCreateOpen(true)} className="h-10 px-3 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shrink-0">+ เพิ่ม Swatch</button>}
      </div>
      {tagFilter.tagIds.length > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-[12.5px] text-amber-800">🏷️ กำลังดูเฉพาะแท็กที่เลือก ({tagFilter.tagIds.length} แท็ก)</span>
          <button onClick={() => setTagFilter(EMPTY_FILTER)} className="h-7 px-2.5 text-[12px] rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 ml-auto">✕ ล้างตัวกรองแท็ก</button>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-56 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-2">🎨</p>
          <p className="text-slate-500 text-sm font-medium">{q || tagFilter.tagIds.length ? "ไม่พบ swatch ที่ตรงกับตัวกรอง" : "ยังไม่มีแผ่น swatch"}</p>
          {!q && !tagFilter.tagIds.length && (
            <p className="text-slate-400 text-[13px] mt-1">
              {canEdit ? <>กด <b>+ เพิ่ม Swatch</b> → ใส่รูปแผง (ครอปได้ หลายรูปได้) → กด <b>✨ อ่านจากรูป</b> ให้ระบบหาชิ้นสีและตั้งรหัสให้</> : "ยังไม่มีใครเพิ่มแผ่นตัวอย่าง (ต้องมีสิทธิ์แก้ไขสินค้าจึงจะเพิ่มได้)"}
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-[12px] text-slate-400 mb-2">{total.toLocaleString("th-TH")} แผ่น</p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {rows.map((s) => (
              <button key={s.id} onClick={() => setOpen({ id: s.id, edit: false })}
                className="text-left rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition overflow-hidden flex flex-col">
                <div className="relative h-44 bg-slate-100 flex items-center justify-center overflow-hidden">
                  {s.image_key
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={r2ImageUrl(s.image_key, 480) ?? ""} alt={swatchTitle(s)} loading="lazy" className="w-full h-full object-cover" />
                    : <span className="text-3xl text-slate-300">🎨</span>}
                  {s.image_count > 1 && <span className="absolute right-1.5 bottom-1.5 text-[10.5px] px-1.5 py-0.5 rounded bg-slate-900/70 text-white">🖼 {s.image_count} รูป</span>}
                </div>
                <div className="p-2.5 min-w-0">
                  <div className="text-[13px] font-medium text-slate-800 truncate" title={swatchTitle(s)}>{swatchTitle(s)}</div>
                  <div className="text-[11px] mt-0.5 flex items-center gap-2 flex-wrap">
                    {s.code && s.name?.trim() && <span className="font-mono text-slate-400">{s.code}</span>}
                    <span className="text-slate-500">{s.spot_count.toLocaleString("th-TH")} ชิ้น</span>
                    {s.spot_count > 0 && <span className="text-slate-400">ผูก SKU {s.linked_count}/{s.spot_count}</span>}
                    {canEdit && s.spot_count === 0 && <span className="text-amber-600">⚠ ยังไม่ได้ตั้งชิ้น</span>}
                  </div>
                  {s.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.tags.slice(0, 3).map((t) => <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{t.name}</span>)}
                      {s.tags.length > 3 && <span className="text-[10px] text-slate-400">+{s.tags.length - 3}</span>}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
          {rows.length < total && (
            <div className="text-center mt-4">
              <button onClick={() => void load(true, rows.length)} disabled={loading} className="h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">
                {loading ? "กำลังโหลด…" : `โหลดเพิ่ม (เหลืออีก ${(total - rows.length).toLocaleString("th-TH")})`}
              </button>
            </div>
          )}
        </>
      )}

      {createOpen && <CreateSwatchModal onClose={() => setCreateOpen(false)} onCreated={(id, hasChips) => { setCreateOpen(false); void load(false); setOpen({ id, edit: !hasChips }); }} />}
      {open && (
        <SwatchViewer key={open.id} id={open.id} startEdit={open.edit} canEdit={canEdit} focusSpotId={open.spotId ?? null} onPickSkus={onPickSkus} onPickSpot={onPickSpot}
          onClose={() => setOpen(null)} onChanged={() => void load(false)} onDeleted={() => { setOpen(null); void load(false); }} />
      )}
    </div>
  );
}
