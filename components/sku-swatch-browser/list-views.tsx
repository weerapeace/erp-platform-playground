"use client";

/**
 * มุมมองรายการแผ่น Swatch — การ์ด · จับกลุ่มตามแท็ก · ตาราง (ใช้ใน index.tsx)
 *   การ์ด: ชี้ที่รูป = รูปใหญ่ (HoverPreview) + เลื่อนเมาส์ซ้าย-ขวา = ดูรูปอื่นของแผ่น · แถบสีจิ๋ว = สีของทุกชิ้น
 *          ยังไม่ติดแท็ก = ป้ายเตือน + ปุ่ม "+ แท็ก" (ติดได้จากการ์ดเลย) · โหมดเลือกหลายแผ่น = ติ๊กการ์ด
 *   ตาราง: MiniTable ของกลาง + ส่งออก Excel (exportTable ของกลาง · ราคาต้องมีสิทธิ์ดูต้นทุน)
 */
import { useMemo, useState, type ReactNode } from "react";
import { r2ImageUrl } from "@/lib/r2-image";
import { HoverPreview } from "@/components/hover-image";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { TagGroupFilter, type TagFilterValue } from "@/components/tag-filter";
import type { SwatchCard } from "@/app/api/sku-swatches/route";
import { swatchTitle } from "./viewer";
import { fmtPrice } from "./info-panel";

export type SwatchView = "cards" | "group" | "table";

/** แถบสีจิ๋ว (สีของชิ้นตามลำดับ) */
export function ColorStrip({ colors, className = "h-2" }: { colors: string[]; className?: string }) {
  if (!colors.length) return null;
  return (
    <div className={`flex w-full overflow-hidden ${className}`} title={`${colors.length} สี`}>
      {colors.map((c, i) => <span key={i} className="flex-1 min-w-[2px]" style={{ background: c }} />)}
    </div>
  );
}

/** รูปปกการ์ด: เลื่อนเมาส์ = เปลี่ยนรูป · ชี้ค้าง = รูปใหญ่ */
function CardCover({ s }: { s: SwatchCard }) {
  const keys = s.image_keys.length ? s.image_keys : s.image_key ? [s.image_key] : [];
  const [i, setI] = useState(0);
  const key = keys[Math.min(i, keys.length - 1)] ?? null;
  return (
    <HoverPreview url={key ? r2ImageUrl(key, 1200) : null} previewW={560}>
      <div className="relative h-44 bg-slate-100 flex items-center justify-center overflow-hidden"
        onMouseMove={keys.length > 1 ? (e) => { const r = e.currentTarget.getBoundingClientRect(); setI(Math.min(keys.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * keys.length)))); } : undefined}
        onMouseLeave={() => setI(0)}>
        {key
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={r2ImageUrl(key, 480) ?? ""} alt={swatchTitle(s)} loading="lazy" className="w-full h-full object-cover" />
          : <span className="text-3xl text-slate-300">🎨</span>}
        {keys.length > 1 && (
          <div className="absolute left-0 right-0 bottom-1.5 flex justify-center gap-1 pointer-events-none">
            {keys.map((_, n) => <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-4 bg-white" : "w-1.5 bg-white/60"}`} />)}
          </div>
        )}
        {s.image_count > 1 && <span className="absolute right-1.5 top-1.5 text-[10.5px] px-1.5 py-0.5 rounded bg-slate-900/70 text-white">{s.image_count} รูป</span>}
      </div>
    </HoverPreview>
  );
}

export function SwatchCardItem({ s, canEdit, selecting, checked, onOpen, onToggle, onTags }: {
  s: SwatchCard; canEdit: boolean; selecting: boolean; checked: boolean;
  onOpen: () => void; onToggle: () => void;
  /** ติดแท็กจากการ์ด (ส่งรายการแท็กทั้งหมดของแผ่น) */
  onTags: (tagIds: string[]) => void;
}) {
  const untagged = s.tags.length === 0;
  return (
    <div role="button" tabIndex={0} onClick={() => (selecting ? onToggle() : onOpen())} onKeyDown={(e) => { if (e.key === "Enter") (selecting ? onToggle() : onOpen()); }}
      className={`relative text-left rounded-xl border bg-white hover:shadow-md transition overflow-hidden flex flex-col cursor-pointer ${checked ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"}`}>
      {selecting && (
        <span className={`absolute left-2 top-2 z-[2] w-5 h-5 rounded border-2 flex items-center justify-center text-[12px] ${checked ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white/90 border-slate-300"}`}>{checked ? "✓" : ""}</span>
      )}
      <CardCover s={s} />
      <ColorStrip colors={s.chip_colors} />
      <div className="p-2.5 min-w-0">
        <div className="text-[13px] font-medium text-slate-800 truncate" title={swatchTitle(s)}>{swatchTitle(s)}</div>
        <div className="text-[11px] mt-0.5 flex items-center gap-2 flex-wrap">
          {s.code && s.name?.trim() && <span className="font-mono text-slate-400">{s.code}</span>}
          <span className="text-slate-500">{s.spot_count.toLocaleString("th-TH")} ชิ้น</span>
          {s.spot_count > 0 && <span className="text-slate-400">ผูก SKU {s.linked_count}/{s.spot_count}</span>}
          {canEdit && s.spot_count === 0 && <span className="text-amber-600">⚠ ยังไม่ได้ตั้งชิ้น</span>}
        </div>
        {(s.main_supplier || s.material) && (
          <div className="text-[11px] mt-0.5 text-slate-500 truncate">
            {s.main_supplier?.name}{s.main_supplier?.price != null ? ` · ${fmtPrice(s.main_supplier.price, s.main_supplier.currency, s.main_supplier.unit)}` : ""}
            {s.material ? `${s.main_supplier ? " · " : ""}${s.material}` : ""}
          </div>
        )}
        {s.color_match && (
          <div className="text-[11px] mt-0.5 flex items-center gap-1 text-slate-600">
            <span className="w-3 h-3 rounded-sm ring-1 ring-black/10 shrink-0" style={{ background: s.color_match.hex }} />
            <span className="truncate">ใกล้สุด {s.color_match.code ? `-${s.color_match.code.split("-").pop()}` : ""} {s.color_match.name ?? ""}</span>
            <span className="ml-auto shrink-0 text-slate-400 tabular-nums" title="ค่าความต่างสี ΔE (ยิ่งน้อยยิ่งเหมือน · ≤ 2 แทบแยกไม่ออก)">ต่าง {s.color_match.dE}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
          {s.tags.slice(0, 3).map((t) => <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{t.name}</span>)}
          {s.tags.length > 3 && <span className="text-[10px] text-slate-400">+{s.tags.length - 3}</span>}
          {untagged && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">ยังไม่ติดแท็ก</span>}
          {canEdit && !selecting && (
            <span className="ml-auto [&_button]:!h-6 [&_button]:!px-2 [&_button]:!text-[10.5px]">
              <TagGroupFilter value={{ tagIds: s.family_tag_ids, none: false }} onChange={(v: TagFilterValue) => onTags(v.tagIds)} label={untagged ? "+ แท็ก" : "แท็ก"} showNone={false} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** กริดการ์ดแผงผ้า — ขนาดจากของกลาง มุมมองการ์ดกลาง (ส่ง template จาก SwatchBrowser · ไม่ส่ง = ขนาดเดิม 220px) */
export function SwatchCardGrid({ children, template }: { children: ReactNode; template?: string }) {
  return <div className="grid gap-3" style={{ gridTemplateColumns: template ?? "repeat(auto-fill, minmax(220px, 1fr))" }}>{children}</div>;
}

/** จับกลุ่มตามแท็ก (แผ่นที่ติดหลายแท็กโผล่ทุกกลุ่มของมัน) · "ยังไม่ติดแท็ก" อยู่บนสุด */
export function SwatchGroupView({ rows, render, template }: { rows: SwatchCard[]; render: (s: SwatchCard) => ReactNode; template?: string }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; rows: SwatchCard[] }>();
    for (const s of rows) {
      if (!s.tags.length) { const g = m.get("") ?? { name: "ยังไม่ติดแท็ก", rows: [] }; g.rows.push(s); m.set("", g); }
      for (const t of s.tags) { const g = m.get(t.id) ?? { name: t.name, rows: [] }; g.rows.push(s); m.set(t.id, g); }
    }
    return [...m.entries()].sort(([a, ga], [b, gb]) => (a === "" ? -1 : b === "" ? 1 : ga.name.localeCompare(gb.name, "th")));
  }, [rows]);
  return (
    <div className="space-y-4">
      {groups.map(([id, g]) => {
        const isClosed = closed.has(id);
        return (
          <section key={id || "none"}>
            <button type="button" onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
              className={`w-full flex items-center gap-2 mb-2 px-3 h-9 rounded-lg border text-left ${id === "" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
              <span className="text-[11px] w-3">{isClosed ? "▸" : "▾"}</span>
              <span className="text-[13px] font-semibold">{g.name}</span>
              <span className="text-[11.5px] opacity-70">{g.rows.length} แผ่น</span>
            </button>
            {!isClosed && <SwatchCardGrid template={template}>{g.rows.map((s) => <div key={`${id}:${s.id}`} className="contents">{render(s)}</div>)}</SwatchCardGrid>}
          </section>
        );
      })}
    </div>
  );
}

/** ตาราง (MiniTable ของกลาง) */
export function SwatchTableView({ rows, onOpen, selecting, selected, onSelectedChange, actions }: {
  rows: SwatchCard[]; onOpen: (s: SwatchCard) => void;
  selecting: boolean; selected: Set<string>; onSelectedChange: (n: Set<string>) => void; actions?: ReactNode;
}) {
  const columns: MiniColumn<SwatchCard>[] = [
    {
      key: "board", header: "แผ่น", width: "2.2fr", locked: true, sortValue: (s) => swatchTitle(s), sortLabel: "ชื่อแผ่น",
      cell: (s) => (
        <div className="flex items-center gap-2 min-w-0">
          <HoverPreview url={s.image_key ? r2ImageUrl(s.image_key, 1200) : null} previewW={480}>
            <span className="block w-12 h-9 rounded overflow-hidden bg-slate-100 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.image_key && <img src={r2ImageUrl(s.image_key, 160) ?? ""} alt="" loading="lazy" className="w-full h-full object-cover" />}
            </span>
          </HoverPreview>
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-slate-800 truncate">{swatchTitle(s)}</div>
            <div className="font-mono text-[10.5px] text-slate-400 truncate">{s.code ?? ""}</div>
            <ColorStrip colors={s.chip_colors} className="h-1.5 mt-0.5 rounded-sm" />
          </div>
        </div>
      ),
    },
    { key: "chips", header: "ชิ้น", width: "4.5rem", align: "right", sortValue: (s) => s.spot_count, cell: (s) => <span className="tabular-nums text-[12.5px]">{s.spot_count}</span> },
    { key: "linked", header: "ผูก SKU", width: "5.5rem", align: "right", sortValue: (s) => s.linked_count, cell: (s) => <span className="tabular-nums text-[12.5px] text-slate-600">{s.linked_count}/{s.spot_count}</span> },
    {
      key: "tags", header: "แท็ก", width: "1.4fr", sortValue: (s) => s.tags.map((t) => t.name).join(","),
      cell: (s) => s.tags.length ? <span className="text-[11.5px] text-slate-600 truncate">{s.tags.map((t) => t.name).join(", ")}</span> : <span className="text-[11px] text-amber-700">ยังไม่ติดแท็ก</span>,
    },
    { key: "shop", header: "ร้านหลัก", width: "1.2fr", sortValue: (s) => s.main_supplier?.name ?? "", cell: (s) => <span className="text-[12px] text-slate-700 truncate">{s.main_supplier?.name ?? "—"}</span> },
    { key: "price", header: "ราคา", width: "6.5rem", align: "right", sortValue: (s) => s.main_supplier?.price ?? -1, cell: (s) => <span className="tabular-nums text-[12px]">{s.main_supplier?.price != null ? fmtPrice(s.main_supplier.price, s.main_supplier.currency, s.main_supplier.unit) : "—"}</span> },
    { key: "material", header: "วัสดุ", width: "1fr", sortValue: (s) => s.material ?? "", cell: (s) => <span className="text-[12px] text-slate-600 truncate">{s.material ?? "—"}</span> },
    { key: "updated", header: "แก้ล่าสุด", width: "6.5rem", sortValue: (s) => s.updated_at, defaultHidden: true, cell: (s) => <span className="text-[11.5px] text-slate-500">{new Date(s.updated_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</span> },
  ];
  return (
    <MiniTable rows={rows} rowKey={(s) => s.id} columns={columns} hideSearch countUnit="แผ่น" dense onRowClick={selecting ? undefined : onOpen}
      selectable={selecting} selected={selected} onSelectedChange={onSelectedChange} actions={actions} maxHeightClass="max-h-[70vh]" />
  );
}
