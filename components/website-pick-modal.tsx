"use client";

/**
 * WebsitePickModal — ป๊อปเลือกหลายรายการกลางของ "จัดการ Website"
 *
 * ใช้โดย WebsiteProductPicker (เลือกรุ่น) + WebsiteSkuPicker (เลือก SKU) — แก้ที่นี่ที่เดียว ทั้งสองตัวเปลี่ยนตาม
 * ERPModal + MiniTable (ของกลาง) เพิ่ม:
 *   • สลับ ☰ ตาราง / ▦ การ์ด — จำต่อคนอัตโนมัติ (useViewPref · ข้ามเครื่อง) · การ์ด = รูปใหญ่ กดทั้งใบ = เลือก
 *   • เรียง ⏱ เลือกล่าสุดก่อน (ค่าเริ่ม) · ✓ ที่เลือกไว้ขึ้นก่อน · ลำดับเดิม · ตามคอลัมน์
 *     ประวัติ = ของกลาง lib/recent-picks (ในเครื่องผู้ใช้) — ผู้เรียกจดตอนกด "ใช้รายการนี้" ด้วย rememberWebPicks()
 * ผู้เรียกเป็นคนคุม state ที่เลือก (selected) + โหลดรายการ · เรนเดอร์เฉพาะตอนเปิด ({open && <WebsitePickModal …/>})
 */
import { useMemo, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { useViewPref } from "@/lib/use-view-pref";
import { loadRecent, pushRecentMany } from "@/lib/recent-picks";

const VIEWS = ["table", "cards"] as const;
type View = (typeof VIEWS)[number];
type RecentPick = { id: string; at: number };
/** จำย้อนหลังกี่ตัว (มากกว่า picker ทั่วไป เพราะใช้เรียงทั้งรายการ ไม่ใช่แค่ทางลัด 6 ตัว) */
const WEB_PICK_LIMIT = 80;

/** จดว่าเพิ่งเลือกอะไร — ids[0] = ล่าสุด (ส่งตัวที่เพิ่งเพิ่มขึ้นก่อน แล้วตามด้วยตัวที่คงไว้) */
export function rememberWebPicks(key: string, ids: string[]) {
  const at = Date.now();
  pushRecentMany<RecentPick>(key, ids.map((id) => ({ id: id.toUpperCase(), at })), WEB_PICK_LIMIT);
}

/** "x นาทีก่อน / เมื่อวาน / 3 วันก่อน" */
function ago(at: number): string {
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีก่อน`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ก่อน`;
  const d = Math.floor(h / 24);
  if (d === 1) return "เมื่อวาน";
  if (d < 30) return `${d} วันก่อน`;
  return new Date(at).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export type PickCard = { image: string | null; code: string; title: string; sub?: string };

export function WebsitePickModal<T>({
  open,
  onClose,
  title,
  unit,
  max,
  rows,
  rowKey,
  loading,
  loadingText,
  emptyText,
  searchText,
  searchPlaceholder,
  columns,
  card,
  selected,
  onSelectedChange,
  chosen,
  recentKey,
  onConfirm,
  note,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** หน่วยนับ เช่น "รุ่น" / "SKU" */
  unit: string;
  max: number;
  rows: T[];
  rowKey: (r: T) => string;
  loading: boolean;
  loadingText: string;
  emptyText: ReactNode;
  searchText: (r: T) => string;
  searchPlaceholder: string;
  columns: MiniColumn<T>[];
  /** เนื้อการ์ด (มุมมองการ์ด) */
  card: (r: T) => PickCard;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  /** รายการที่เลือกไว้ก่อนเปิดป๊อป (ลำดับที่โชว์อยู่) — ใช้กับ "ที่เลือกไว้ขึ้นก่อน" */
  chosen: string[];
  /** key ประวัติจาก RECENT_KEYS */
  recentKey: string;
  onConfirm: () => void;
  /** ข้อความเตือนใต้ตาราง */
  note?: ReactNode;
}) {
  const { view, setView, saveDefault } = useViewPref<View>("website_picker_view", VIEWS, "cards");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "recent", dir: "asc" });

  // ประวัติ "เลือกล่าสุด" (อ่านครั้งเดียวตอนเปิด — ระหว่างติ๊กไม่ขยับ แถวไม่กระโดด)
  const recent = useMemo(() => {
    const m = new Map<string, { i: number; at: number }>();
    loadRecent<RecentPick>(recentKey).forEach((p, i) => p?.id && !m.has(p.id.toUpperCase()) && m.set(p.id.toUpperCase(), { i, at: p.at }));
    return m;
  }, [recentKey]);
  const chosenIdx = useMemo(() => new Map(chosen.map((c, i) => [c.toUpperCase(), i])), [chosen]);
  const recentOf = (r: T) => recent.get(rowKey(r).toUpperCase());
  const hasRecent = rows.some((r) => recentOf(r));
  const NONE = Number.MAX_SAFE_INTEGER;

  const extraSorts = [
    { key: "recent", label: "เรียง: เลือกล่าสุดก่อน", compare: (a: T, b: T) => (recentOf(a)?.i ?? NONE) - (recentOf(b)?.i ?? NONE) },
    { key: "chosen", label: "เรียง: ที่เลือกไว้ขึ้นก่อน", compare: (a: T, b: T) => (chosenIdx.get(rowKey(a).toUpperCase()) ?? NONE) - (chosenIdx.get(rowKey(b).toUpperCase()) ?? NONE) },
  ];

  const badge = (r: T) => {
    const p = recentOf(r);
    if (!p) return null;
    return (
      <span title="เลือกล่าสุดเมื่อ" className="inline-block whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
        ⏱ {p.i === 0 ? "ล่าสุด · " : ""}
        {ago(p.at)}
      </span>
    );
  };

  const cols: MiniColumn<T>[] = hasRecent ? [...columns, { key: "_recent", header: "เลือกล่าสุด", width: "7.5rem", cell: badge }] : columns;

  const renderCard = (r: T) => {
    const c = card(r);
    return (
      <div>
        <div className="aspect-square bg-slate-100">
          {c.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={c.image} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-2xl text-slate-300">🖼</span>
          )}
        </div>
        <div className="space-y-1 p-2">
          <p className="truncate text-[11px] text-slate-500">
            <span className="font-mono">{c.code}</span>
            {c.sub && <span className="font-medium text-slate-700"> · {c.sub}</span>}
          </p>
          <p className="line-clamp-2 text-xs leading-snug text-slate-800">{c.title}</p>
          {badge(r)}
        </div>
      </div>
    );
  };

  const pickView = (v: View) => {
    setView(v);
    void saveDefault(v); // จำต่อคนเลย — เปิดครั้งหน้าได้มุมมองนี้
  };

  const viewToggle = (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="มุมมอง">
      {VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => pickView(v)}
          aria-pressed={view === v}
          data-pick-view={v}
          className={`h-8 px-2.5 text-xs ${v === "table" ? "border-r border-slate-200" : ""} ${view === v ? "bg-blue-50 font-medium text-blue-700" : "bg-white text-slate-500 hover:bg-slate-50"}`}
        >
          {v === "table" ? "☰ ตาราง" : "▦ การ์ด"}
        </button>
      ))}
    </div>
  );

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className={`text-xs ${selected.size > max ? "text-red-600" : "text-slate-500"}`}>
            เลือกแล้ว {selected.size} {unit} (สูงสุด {max})
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              ยกเลิก
            </button>
            <button type="button" onClick={onConfirm} disabled={selected.size > max} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
              ใช้รายการนี้
            </button>
          </div>
        </div>
      }
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">{loadingText}</p>
      ) : (
        <MiniTable<T>
          rows={rows}
          rowKey={rowKey}
          selectable
          selected={selected}
          onSelectedChange={onSelectedChange}
          searchText={searchText}
          searchPlaceholder={searchPlaceholder}
          countUnit={unit}
          emptyText={emptyText}
          dense
          maxHeightClass="max-h-[60vh]"
          columns={cols}
          extraSorts={extraSorts}
          sortKey={sort.key}
          sortDir={sort.dir}
          onSortChange={(key, dir) => setSort({ key, dir })}
          layout={view}
          renderCard={renderCard}
          cardPick
          cardGrid="repeat(auto-fill, minmax(8.5rem, 1fr))"
          actions={viewToggle}
          inlineActions
        />
      )}
      {note}
    </ERPModal>
  );
}
