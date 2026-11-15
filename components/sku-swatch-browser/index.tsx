"use client";

/**
 * SwatchBrowser — แท็บ 🎨 Swatch ในหน้า /master/skus (ข้าง 📦 Bundle) · เจ้าของเรียกว่า "แผงผ้า"
 * ⚠ ของกลาง: ที่ไหนจะค้น/เลือก/ดูแผงผ้า ใช้ตัวนี้ (กติกา + เทสต์กันของซ้ำ: lib/__tests__/sku-swatch-guard.test.ts)
 *
 * Swatch = รูปแผ่นตัวอย่างจริง (การ์ดสีผ้า / ด้าย / อะไหล่) · 1 แผ่นมีได้หลายรูป (รูปแรก = ปก)
 *   ชิ้นบนรูป = รหัสภายใน (SW-0001-01) + สีจริง + ชื่อสี + เลขบนแผง · ผูก SKU ได้ภายหลัง (ไม่บังคับ)
 *   รายการ    — การ์ด (ชี้รูป = รูปใหญ่ + เลื่อนดูรูปอื่น · แถบสีจิ๋ว) · จับกลุ่มตามแท็ก · ตาราง (+ ส่งออก Excel)
 *               ค้นด้วยข้อความ / ค้นด้วยสี (ΔE) · เรียงลำดับ · กรองแท็ก + "ยังไม่ติดแท็ก" · ติดแท็กจากการ์ด / หลายแผ่นพร้อมกัน
 *   โหมดดู    — เห็นแต่รูป ไม่มีเส้นกรอบ · ชี้ที่ชิ้น = ป้ายรหัส/สี/ชื่อ/SKU/สต๊อก/ราคา/ซื้อล่าสุด/BOM · กด = เมนูเล็ก
 *               แผงข้อมูล: รายละเอียด · ร้านที่สั่งได้ + ราคา · สเปก · ชิ้นที่ผูก SKU · ใช้ในสินค้าไหน (BOM) · ไฟล์แนบ · ประวัติ
 *   โหมดตั้งค่า — ตัวแก้แผง (board-editor.tsx): รูป เพิ่ม/ครอป/หมุน/เรียง/ปก · ชิ้น วาด/✨ อ่านจากรูป (AI)/แบ่ง/แก้/ราคา-ร้านรายชิ้น
 * จัดหมวดด้วยแท็กกลาง (product_families) ชุดเดียวกับหน้า SKU
 *
 * ไฟล์: index (รายการแผ่น) · list-views (การ์ด/กลุ่ม/ตาราง) · create-modal (ป๊อปเพิ่มแผ่น) · viewer (ดู/ตั้งค่า เต็มจอ)
 *       · info-panel (แผงข้อมูล) · board-editor (ตัวแก้ใช้ร่วม) · swatch-tools (ดูดสี/AI/อัปรูป/ตัดรูปชิ้น)
 * ของกลางที่ใช้: ImageRegions · ImageFreeCropModal · ColorInput · SkuPicker · SkuWizard · TagGroupFilter · uploadImagesWithDupCheck
 *               · UploadProgress · ERPModal · ConfirmDialog · MasterRecordDrawer · PrCreateModal · BundleAddModal · HoverPreview · MiniTable
 *               · exportTable · SupplierPicker · MoneyInput · RecordFilesField · RecordHistoryDrawer · BomWhereUsed · lib/sku-swatch (สูตร)
 * API: /api/sku-swatches (GET/POST/PATCH/DELETE) · /api/sku-swatches/ai-read (บริการเสียเงิน ai.swatch_read) · สิทธิ์ตั้งค่า = products.edit · ดู = products.view
 * โหมดเลือกใส่ตะกร้า (2026-11-05 หน้าขอซื้อ แท็บ "แผงผ้า"): ส่ง onPickSkus → "ขอซื้อ" / แถบเลือกหลายรายการ ส่งรายการให้หน้าแม่
 * โหมดเลือก 1 ชิ้น (2026-11-13 Design Library): ส่ง onPickSpot → เมนูเล็กบนชิ้นมี "✓ เลือกชิ้นนี้" บนสุด
 *   คืนรูปที่ชิ้นอยู่ + กรอบของชิ้น (% ของรูป) + รหัส/สี/ชื่อ + SKU (ถ้าผูก) ให้หน้าแม่ แล้วปิดแผง
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { exportTable } from "@/lib/export";
import { useToast } from "@/components/toast";
import { useAuth, usePermission, type Permission } from "@/components/auth";
import { TagGroupFilter, type TagFilterValue } from "@/components/tag-filter";
import { ColorInput } from "@/components/color-picker";
import { useUserPref } from "@/lib/use-user-pref";
import type { PrCreateItem } from "@/components/pr-create-modal";
import type { SwatchCard, SwatchSpot } from "@/app/api/sku-swatches/route";
import { CreateSwatchModal } from "./create-modal";
import { SwatchViewer, swatchTitle } from "./viewer";
import { SwatchCardGrid, SwatchCardItem, SwatchGroupView, SwatchTableView, type SwatchView } from "./list-views";
import { SwatchCompare } from "./compare";
import { swatchLabelUrl } from "@/lib/sku-swatch";

const PAGE = 60;
const EMPTY_FILTER: TagFilterValue = { tagIds: [], none: false };
const SORTS: { v: string; label: string }[] = [
  { v: "new", label: "ใหม่สุด" }, { v: "name", label: "ชื่อ ก-ฮ" }, { v: "code", label: "รหัสแผ่น" },
  { v: "chips", label: "ชิ้นเยอะสุด" }, { v: "unlinked", label: "ยังไม่ผูก SKU เยอะสุด" }, { v: "shop", label: "ตามร้านหลัก" },
];
const parseView = (v: unknown): SwatchView | null => (v === "cards" || v === "group" || v === "table" ? v : null);
const parseSort = (v: unknown): string | null => (typeof v === "string" && SORTS.some((s) => s.v === v) ? v : null);

/** ชิ้นที่เลือกจากแผง (โหมด onPickSpot) — image_key = รูปที่ชิ้นอยู่ · x/y/w/h = % ของรูปนั้น */
export type SwatchSpotPick = {
  swatch_id: string; swatch_name: string; image_key: string | null; image_w: number | null; image_h: number | null;
  spot_id: string; x: number; y: number; w: number; h: number; label: string | null;
  /** รหัสภายใน (SW-0001-01) · ชื่อสี · สีจริง */
  code: string | null; name: string | null; color_hex: string | null;
  sku: SwatchSpot["sku"];
};

/** บันทึกแท็กของแผ่น (ของกลางในโฟลเดอร์นี้ — การ์ด / หลายแผ่น / Design Library ใช้ตัวเดียวกัน) */
export async function saveSwatchTags(id: string, tagIds: string[]): Promise<void> {
  const j = await apiFetch("/api/sku-swatches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, family_tag_ids: tagIds }) }).then((r) => r.json());
  if (j.error) throw new Error(j.error);
}

export function SwatchBrowser({ openId, focusSpotId, onPickSkus, onPickSpot, initialTagIds }: {
  /** เริ่มด้วยกรองแท็กนี้ (Design Library: จุดซิป → แผงที่ติดแท็กซิป) · ผู้ใช้ล้างตัวกรองดูทุกแผงได้ */
  initialTagIds?: string[];
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
  const { can } = useAuth();
  const canEdit = usePermission("products.edit");
  const [rows, setRows] = useState<SwatchCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [color, setColor] = useState<string | null>(null);   // ค้นด้วยสี
  const [tagFilter, setTagFilter] = useState<TagFilterValue>(initialTagIds?.length ? { ...EMPTY_FILTER, tagIds: initialTagIds } : EMPTY_FILTER);
  const [view, saveView] = useUserPref<SwatchView>("swatch_list_view", "cards", parseView);
  const [sort, saveSort] = useUserPref<string>("swatch_list_sort", "new", parseSort);
  const [createOpen, setCreateOpen] = useState(false);
  const [open, setOpen] = useState<{ id: string; edit: boolean; spotId?: string | null } | null>(openId ? { id: openId, edit: false, spotId: focusSpotId ?? null } : null);
  // ── เลือกหลายแผ่น → ติดแท็กพร้อมกัน ──
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkTags, setBulkTags] = useState<TagFilterValue>(EMPTY_FILTER);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [compare, setCompare] = useState<[string, string] | null>(null);
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); setBulkTags(EMPTY_FILTER); };
  // ลิงก์มาถึงหลังหน้าโหลดแล้ว (พารามิเตอร์อ่านใน effect ของหน้าแม่) → เปิดตาม
  useEffect(() => { if (openId) setOpen({ id: openId, edit: false, spotId: focusSpotId ?? null }); }, [openId, focusSpotId]);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const pageSize = view === "cards" ? PAGE : 200;   // กลุ่ม/ตาราง = โหลดทีเดียว
  const load = useCallback(async (append = false, have = 0) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: String(pageSize), offset: String(append ? have : 0), sort });
      if (q) p.set("search", q);
      if (color) p.set("color", color);
      if (tagFilter.tagIds.length) p.set("family_ids", tagFilter.tagIds.join(","));
      if (tagFilter.none) p.set("no_tags", "1");
      const j = await apiFetch(`/api/sku-swatches?${p}`).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      setRows((prev) => (append ? [...prev, ...(j.swatches as SwatchCard[])] : (j.swatches as SwatchCard[])));
      setTotal(Number(j.total ?? 0));
    } catch { toast.error("โหลด swatch ไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, [q, color, tagFilter, sort, pageSize, toast]);
  useEffect(() => { void load(false); }, [load]);

  // ติดแท็กจากการ์ด: เปลี่ยนในจอทันที แล้วบันทึกหลังหยุดกด 0.7 วิ (ติ๊กหลายแท็กติดกัน = บันทึกครั้งเดียว)
  const [tagTimers] = useState(() => new Map<string, ReturnType<typeof setTimeout>>());
  const setCardTags = (id: string, tagIds: string[]) => {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, family_tag_ids: tagIds, tags: tagIds.map((t) => r.tags.find((x) => x.id === t) ?? { id: t, name: "…" }) } : r)));
    const old = tagTimers.get(id); if (old) clearTimeout(old);
    tagTimers.set(id, setTimeout(() => {
      tagTimers.delete(id);
      saveSwatchTags(id, tagIds).then(() => { toast.success("บันทึกแท็กแล้ว"); void load(false); }).catch((e) => toast.error(e instanceof Error ? e.message : "บันทึกแท็กไม่สำเร็จ"));
    }, 700));
  };
  const applyBulkTags = async () => {
    if (!picked.size || !bulkTags.tagIds.length) return;
    setBulkBusy(true);
    let ok = 0; const fail: string[] = [];
    for (const r of rows.filter((x) => picked.has(x.id))) {
      try { await saveSwatchTags(r.id, [...new Set([...r.family_tag_ids, ...bulkTags.tagIds])]); ok++; }
      catch { fail.push(swatchTitle(r)); }
    }
    setBulkBusy(false);
    if (ok) toast.success(`ติดแท็กให้ ${ok} แผ่นแล้ว`);
    if (fail.length) toast.error(`ติดแท็กไม่สำเร็จ ${fail.length} แผ่น: ${fail.slice(0, 3).join(", ")}`);
    stopSelecting(); void load(false);
  };
  const exportRows = async () => {
    const list = selecting && picked.size ? rows.filter((r) => picked.has(r.id)) : rows;
    const res = await exportTable({
      format: "excel", filename: "แผงผ้า-swatch", can: (p: string) => can(p as Permission),
      rows: list.map((s) => ({
        title: swatchTitle(s), code: s.code ?? "", chips: s.spot_count, linked: s.linked_count, tags: s.tags.map((t) => t.name).join(", "),
        shop: s.main_supplier?.name ?? "", price: s.main_supplier?.price ?? null, currency: s.main_supplier?.currency ?? "", unit: s.main_supplier?.unit ?? "",
        material: s.material ?? "", weight: s.weight != null ? `${s.weight} ${s.weight_unit ?? ""}`.trim() : "", width: s.width_cm, note: s.note ?? "", updated: s.updated_at.slice(0, 10),
      })),
      columns: [
        { key: "title", header: "แผ่น", width: 28 }, { key: "code", header: "รหัสแผ่น", width: 12 }, { key: "chips", header: "จำนวนชิ้น" }, { key: "linked", header: "ผูก SKU แล้ว" },
        { key: "tags", header: "แท็ก", width: 24 }, { key: "shop", header: "ร้านหลัก", width: 22 },
        { key: "price", header: "ราคา", permission: "products.cost.view" }, { key: "currency", header: "สกุลเงิน", permission: "products.cost.view" }, { key: "unit", header: "ต่อหน่วย" },
        { key: "material", header: "วัสดุ", width: 18 }, { key: "weight", header: "น้ำหนัก" }, { key: "width", header: "หน้ากว้าง (ซม.)" }, { key: "note", header: "รายละเอียด", width: 40 }, { key: "updated", header: "แก้ล่าสุด" },
      ],
      context: { entityType: "sku_swatches", mode: selecting && picked.size ? "selected" : "filtered_all", totalRows: list.length, filterDesc: [q && `ค้น "${q}"`, color && `สี ${color}`, tagFilter.tagIds.length && `${tagFilter.tagIds.length} แท็ก`, tagFilter.none && "ยังไม่ติดแท็ก"].filter(Boolean).join(" · ") || undefined },
    });
    if (res.exported) toast.success(`ส่งออก ${res.exported} แผ่นแล้ว`);
  };

  const filtering = !!q || !!color || tagFilter.tagIds.length > 0 || tagFilter.none;
  const card = (s: SwatchCard) => (
    <SwatchCardItem key={s.id} s={s} canEdit={canEdit} selecting={selecting} checked={picked.has(s.id)}
      onOpen={() => setOpen({ id: s.id, edit: false })} onTags={(t) => setCardTags(s.id, t)}
      onToggle={() => setPicked((p) => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
  );
  const viewBtn = (v: SwatchView, label: string) => (
    <button type="button" onClick={() => saveView(v)} aria-pressed={view === v}
      className={`h-10 px-3 text-[12.5px] ${view === v ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-white text-slate-600 hover:bg-slate-50"} border-l first:border-l-0 border-slate-200`}>{label}</button>
  );

  return (
    <div>
      {/* แถบบน: ค้นหา + ค้นด้วยสี + กรองแท็ก + เรียง + มุมมอง + เพิ่ม */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-10 flex-1 min-w-[240px] bg-white focus-within:ring-2 focus-within:ring-indigo-500">
          <span className="text-slate-400">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา (ชื่อแผ่น / รหัส SW / ชื่อสี / เลขบนแผง / รหัสหรือชื่อ SKU)"
            className="flex-1 h-full text-sm outline-none bg-transparent" />
          {search && <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>}
        </div>
        <div className={`flex items-center gap-1.5 h-10 pl-2 pr-1 rounded-lg border ${color ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white"}`} title="เลือกสีที่อยากได้ → เจอแผ่นที่มีชิ้นสีใกล้เคียง เรียงจากใกล้สุด">
          <span className="text-[12.5px] text-slate-600 whitespace-nowrap">ค้นด้วยสี</span>
          <span className="[&_button]:!h-7 [&_button]:!w-7 [&_button]:rounded"><ColorInput value={color ?? "#cccccc"} allowText={false} onChange={(v) => { if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v.toLowerCase()); }} /></span>
          {color && <button type="button" onClick={() => setColor(null)} className="w-6 h-6 text-[12px] rounded text-slate-500 hover:bg-white" title="เลิกค้นด้วยสี">✕</button>}
        </div>
        <TagGroupFilter value={tagFilter} onChange={setTagFilter} label="กรองแท็ก" />
        <select value={sort} onChange={(e) => saveSort(e.target.value)} disabled={!!color} title={color ? "ค้นด้วยสีอยู่ — เรียงจากสีใกล้สุดเสมอ" : "เรียงลำดับ"}
          className="h-10 px-2 text-[12.5px] border border-slate-200 rounded-lg bg-white disabled:opacity-60" aria-label="เรียงลำดับ">
          {SORTS.map((s) => <option key={s.v} value={s.v}>{color ? "สีใกล้สุด" : s.label}</option>)}
        </select>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">{viewBtn("cards", "การ์ด")}{viewBtn("group", "จับกลุ่มแท็ก")}{viewBtn("table", "ตาราง")}</div>
        {rows.length > 0 && (
          <button onClick={() => (selecting ? stopSelecting() : setSelecting(true))} title="เลือกหลายแผ่น: ติดแท็ก · พิมพ์ป้าย · เทียบ 2 แผ่น · ส่งออก Excel"
            className={`h-10 px-3 text-[12.5px] rounded-lg border ${selecting ? "border-indigo-400 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {selecting ? "เลิกเลือก" : "เลือกหลายแผ่น"}
          </button>
        )}
        {canEdit && <button onClick={() => setCreateOpen(true)} className="h-10 px-3 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shrink-0">+ เพิ่ม Swatch</button>}
      </div>
      {(tagFilter.tagIds.length > 0 || tagFilter.none) && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-[12.5px] text-amber-800">🏷️ กำลังดูเฉพาะ{[tagFilter.tagIds.length ? `แท็กที่เลือก (${tagFilter.tagIds.length} แท็ก)` : "", tagFilter.none ? "แผ่นที่ยังไม่ติดแท็ก" : ""].filter(Boolean).join(" หรือ ")}</span>
          <button onClick={() => setTagFilter(EMPTY_FILTER)} className="h-7 px-2.5 text-[12px] rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 ml-auto">✕ ล้างตัวกรองแท็ก</button>
        </div>
      )}
      {selecting && (
        <div className="sticky top-0 z-[5] flex flex-wrap items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-slate-900 text-white shadow-lg">
          <span className="text-sm">เลือก <b className="tabular-nums">{picked.size}</b> แผ่น</span>
          <button onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))} className="h-8 px-3 text-[12px] rounded-full bg-white/10 hover:bg-white/20">{picked.size === rows.length ? "ไม่เลือกเลย" : "เลือกทั้งหมดที่เห็น"}</button>
          {canEdit && (
            <>
              <span className="[&_button]:!h-8 [&_button]:!bg-white [&_button]:!text-slate-700"><TagGroupFilter value={bulkTags} onChange={setBulkTags} label={bulkTags.tagIds.length ? `แท็กที่จะติด (${bulkTags.tagIds.length})` : "เลือกแท็กที่จะติด"} showNone={false} /></span>
              <button onClick={() => void applyBulkTags()} disabled={!picked.size || !bulkTags.tagIds.length || bulkBusy}
                className="h-8 px-4 text-[13px] font-medium rounded-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40">{bulkBusy ? "กำลังติดแท็ก…" : "ติดแท็ก (เพิ่มจากที่มี)"}</button>
            </>
          )}
          <button onClick={() => { const ids = [...picked]; if (ids.length === 2) setCompare([ids[0], ids[1]]); }} disabled={picked.size !== 2} title={picked.size === 2 ? "เทียบรูป สเปก ร้าน ราคา และสีที่ใกล้กัน" : "เลือก 2 แผ่นพอดีเพื่อเทียบ"}
            className="h-8 px-3 text-[12px] rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40">เทียบ 2 แผ่น</button>
          <a href={picked.size ? swatchLabelUrl([...picked]) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!picked.size}
            className={`h-8 px-3 inline-flex items-center text-[12px] rounded-full bg-white/10 hover:bg-white/20 ${picked.size ? "" : "opacity-40 pointer-events-none"}`}>พิมพ์ป้าย + QR</a>
          <button onClick={() => void exportRows()} disabled={!picked.size} className="h-8 px-3 text-[12px] rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40">ส่งออก Excel</button>
          <button onClick={stopSelecting} className="h-8 px-3 text-[12px] rounded-full hover:bg-white/10 ml-auto">ยกเลิก</button>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <SwatchCardGrid>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-56 rounded-xl bg-slate-100 animate-pulse" />)}</SwatchCardGrid>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-2">🎨</p>
          <p className="text-slate-500 text-sm font-medium">{filtering ? (color ? "ไม่พบแผ่นที่มีสีใกล้เคียง — ลองสีอื่น หรือเลิกค้นด้วยสี" : "ไม่พบ swatch ที่ตรงกับตัวกรอง") : "ยังไม่มีแผ่น swatch"}</p>
          {!filtering && (
            <p className="text-slate-400 text-[13px] mt-1">
              {canEdit ? <>กด <b>+ เพิ่ม Swatch</b> → ใส่รูปแผง (ครอปได้ หลายรูปได้) → กด <b>✨ อ่านจากรูป</b> ให้ระบบหาชิ้นสีและตั้งรหัสให้</> : "ยังไม่มีใครเพิ่มแผ่นตัวอย่าง (ต้องมีสิทธิ์แก้ไขสินค้าจึงจะเพิ่มได้)"}
            </p>
          )}
        </div>
      ) : (
        <>
          {view !== "table" && <p className="text-[12px] text-slate-400 mb-2">{total.toLocaleString("th-TH")} แผ่น{color ? " · เรียงจากสีใกล้สุด" : ""}</p>}
          {view === "table" ? (
            <SwatchTableView rows={rows} onOpen={(s) => setOpen({ id: s.id, edit: false })} selecting={selecting} selected={picked} onSelectedChange={setPicked}
              actions={<button type="button" onClick={() => void exportRows()} className="h-8 px-3 text-[12px] rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">ส่งออก Excel</button>} />
          ) : view === "group" ? (
            <SwatchGroupView rows={rows} render={card} />
          ) : (
            <SwatchCardGrid>{rows.map(card)}</SwatchCardGrid>
          )}
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
      {compare && <SwatchCompare ids={compare} onClose={() => setCompare(null)} onOpen={(id) => { setCompare(null); setOpen({ id, edit: false }); }} />}
      {open && (
        <SwatchViewer key={open.id} id={open.id} startEdit={open.edit} canEdit={canEdit} focusSpotId={open.spotId ?? null} onPickSkus={onPickSkus} onPickSpot={onPickSpot}
          onClose={() => setOpen(null)} onChanged={() => void load(false)} onDeleted={() => { setOpen(null); void load(false); }} />
      )}
    </div>
  );
}
