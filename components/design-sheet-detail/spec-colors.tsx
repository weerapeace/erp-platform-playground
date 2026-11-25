"use client";

/**
 * ตารางสี (แท็บรายละเอียดงาน รอบ 2 · เจ้าของขอ 2026-11-05)
 *
 * แถว = ส่วนประกอบ · คอลัมน์ = สีของรุ่น · ช่อง = สีที่เลือก (กดช่องเปิดป๊อปเลือกสี)
 * ป๊อปเลือกสี 4 ทาง: แผงผ้า (ชิ้นบนรูปแผ่น Swatch) · SKU · ทะเบียนสีกลาง · ดูดสีจากรูป / เลือกเอง
 *
 * ของกลางที่ใช้: LineItemsGrid (variant lines) · SwatchBrowser (แผงผ้า โหมดเลือก 1 ชิ้น) · ComponentPicker · ImageEyedropper · ColorInput · ERPModal · ConfirmDialog
 * ข้อมูล: lib/design-sheet-spec-colors (cleanSpecColors ใช้ทั้ง API และหน้าจอ) · บันทึกพร้อมแท็บ (PUT /spec body.colors)
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";
import { ComponentPicker } from "@/components/material-picker";
import { ColorInput } from "@/components/color-picker";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { swatchCss, type SwatchEntry } from "@/lib/color-swatch";
import { newMarkupId } from "@/lib/image-markup";
import {
  SPEC_COLOR_SOURCE_LABEL, cropBackground,
  type SpecColorCell, type SpecColorRow, type SpecColorTable,
} from "@/lib/design-sheet-spec-colors";
import type { SwatchSpotPick } from "@/components/sku-swatch-browser";

const ImageEyedropper = dynamic(() => import("@/components/image-eyedropper").then((m) => m.ImageEyedropper), { ssr: false });
// แผงผ้า = ของกลาง SwatchBrowser (ค้นด้วยข้อความ/สี · กรองแท็ก · ดูแผ่นเต็มจอ) — ห้ามทำรายการแผงเอง (lib/__tests__/sku-swatch-guard.test.ts)
const SwatchBrowser = dynamic(() => import("@/components/sku-swatch-browser").then((m) => m.SwatchBrowser), { ssr: false });

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** ป้าย "มี BOM" ของสีของรุ่น — กดเปิดสูตรในหน้า BOM */
function BomBadge({ bom }: { bom: { code: string; sku: string } }) {
  const t = useT();
  return (
    <a href={`/master/bom?open=${encodeURIComponent(bom.sku)}`} target="_blank" rel="noopener" title={t(`${bom.code} — เปิดสูตร`, `${bom.code} — open recipe`)}
      className="mr-1 shrink-0 rounded bg-emerald-50 px-1.5 text-[10px] font-medium leading-5 text-emerald-700 hover:bg-emerald-100">{t("มี BOM", "Has BOM")}</a>
  );
}

/** จุดสี 1 ช่อง — ชิ้นจากแผ่นผ้า / รูป / หลายสี / สีเดียว */
export function SpecColorChip({ cell, size = 28, className = "" }: { cell: SpecColorCell | null | undefined; size?: number; className?: string }) {
  const style: CSSProperties = { width: size, height: size };
  if (!cell) return <span className={`inline-block shrink-0 rounded-md border border-dashed border-slate-300 bg-white ${className}`} style={style} />;
  if (cell.crop && cell.image_key) Object.assign(style, cropBackground(r2ImageUrl(cell.image_key, 1200) ?? "", cell.crop));
  else if (cell.image_key) style.background = `url("${r2ImageUrl(cell.image_key, 200) ?? ""}") center / cover no-repeat`;
  else if (cell.colors.length > 1) style.background = swatchCss({ colors: cell.colors, imageKey: null }, (k) => k);
  else style.background = cell.hex ?? cell.colors[0] ?? "#e2e8f0";
  return <span className={`inline-block shrink-0 rounded-md border border-slate-300 ${className}`} style={style} title={cell.name ?? cell.hex ?? ""} />;
}

export function SpecColorTableEditor({ value, onChange, canEdit, pinParts, imageKeys, partOptions = [], onCreatePart, onLocatePart, onMakeBom }: {
  /** ปุ่ม "สร้าง BOM จากตารางสี" (./bom-from-colors) — ไม่ส่ง = ไม่โชว์ */
  onMakeBom?: () => void;
  value: SpecColorTable;
  onChange: (next: SpecColorTable) => void;
  canEdit: boolean;
  /** ส่วนประกอบจากหมุดวัตถุดิบ (ไว้ดึงเป็นแถว) */
  pinParts: { name: string; code: string | null }[];
  /** รูปในรายละเอียดงาน (R2 key) — ให้ดูดสี */
  imageKeys: string[];
  /** รายการส่วนประกอบกลาง (material_slots: value = slot_code) */
  partOptions?: SelectOption[];
  /** พิมพ์ชื่อที่ไม่มีในรายการ → เพิ่มเข้ารายการกลาง */
  onCreatePart?: (name: string) => Promise<{ code: string; name: string } | null>;
  /** ปุ่ม "ชี้บนรูป" ของแถว */
  onLocatePart?: (row: SpecColorRow) => void;
}) {
  const t = useT();
  const [picking, setPicking] = useState<{ cw: string; row: string } | null>(null);
  const [delCw, setDelCw] = useState<string | null>(null);
  const { rows, colorways } = value;

  // ส่วนประกอบจากหมุดที่ยังไม่มีแถว (เทียบรหัสในรายการกลางก่อน ไม่มีรหัสเทียบชื่อ)
  const missingParts = useMemo(() => {
    const codes = new Set(rows.map((r) => r.code).filter(Boolean)), names = new Set(rows.map((r) => norm(r.name)));
    const out: { name: string; code: string | null }[] = [];
    for (const p of pinParts) {
      const nm = p.name.trim(); if (!nm) continue;
      if ((p.code && codes.has(p.code)) || names.has(norm(nm)) || out.some((o) => (p.code && o.code === p.code) || norm(o.name) === norm(nm))) continue;
      out.push({ name: nm, code: p.code });
    }
    return out;
  }, [rows, pinParts]);
  const pullParts = () => onChange({ ...value, rows: [...rows, ...missingParts.map((p) => ({ key: newMarkupId(), name: p.name, ...(p.code ? { code: p.code } : {}) }))] });
  const rowValue = (r: SpecColorRow) => r.code ?? (r.name ? `name:${r.name}` : "");
  const rowOptions = (r: SpecColorRow): SelectOption[] => (r.code || !r.name ? partOptions : [{ value: `name:${r.name}`, label: r.name, sub: t("พิมพ์เอง", "Typed") }, ...partOptions]);
  const addColorway = () => onChange({ ...value, colorways: [...colorways, { key: newMarkupId(), name: "", cells: {} }] });
  const setCell = (cwKey: string, rowKey: string, cell: SpecColorCell | null) => onChange({
    ...value,
    colorways: colorways.map((c) => {
      if (c.key !== cwKey) return c;
      const cells = { ...c.cells };
      if (cell) cells[rowKey] = cell; else delete cells[rowKey];
      return { ...c, cells };
    }),
  });
  const cwLabel = (i: number) => colorways[i]?.name.trim() || t(`สีที่ ${i + 1}`, `Colour ${i + 1}`);

  const columns = useMemo<LineColumn<SpecColorRow>[]>(() => [
    { key: "name", header: t("ส่วนประกอบ", "Part"), minWidth: 150,
      render: (r, u, ro) => (
        <div className="flex items-center gap-1 min-w-0">
          {ro
            ? <span className="flex-1 block px-1 text-sm text-slate-700 truncate">{r.name || "—"}</span>
            : (
              <div className="flex-1 min-w-0">
                <SearchableSelect value={rowValue(r)} options={rowOptions(r)} placeholder={t("— เลือกส่วนประกอบ —", "— Select part —")}
                  onChange={(v) => { if (v.startsWith("name:")) u({ name: v.slice(5), code: null }); else { const o = partOptions.find((x) => x.value === v); u({ name: o?.label ?? "", code: v || null }); } }}
                  onCreate={onCreatePart ? (q) => { void onCreatePart(q).then((p) => { if (p) u({ name: p.name, code: p.code }); }); } : undefined}
                  createLabel={t("เพิ่มเข้ารายการ", "Add to list")} />
              </div>
            )}
          {onLocatePart && (r.name || r.code) && (
            <button type="button" onClick={() => onLocatePart(r)} title={t("ชี้บนรูป (มีหมุดแล้ว = ไปที่หมุด · ยังไม่มี = กดบนรูปเพื่อปักหมุด)", "Point on the image")}
              className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-violet-500 hover:bg-violet-50"><Icon name="pin" /></button>
          )}
        </div>
      ) },
    ...colorways.map((cw, i) => ({
      key: `cw_${cw.key}`, header: cwLabel(i), minWidth: 150,
      render: (r: SpecColorRow, _u: unknown, ro: boolean) => {
        const cell = cw.cells[r.key];
        return (
          <button type="button" disabled={ro} onClick={() => setPicking({ cw: cw.key, row: r.key })}
            className={`w-full min-w-0 h-9 px-1 flex items-center gap-1.5 rounded-lg text-left ${ro ? "cursor-default" : "hover:bg-violet-50"}`}>
            <SpecColorChip cell={cell} size={26} />
            {cell ? (
              <span className="min-w-0 leading-tight">
                <span className="block text-sm text-slate-700 truncate">{cell.name || cell.hex || cell.sku_code || "—"}</span>
                <span className="block text-[10px] text-slate-400 truncate">{SPEC_COLOR_SOURCE_LABEL[cell.source]}{cell.sku_code ? ` · ${cell.sku_code}` : ""}</span>
              </span>
            ) : !ro && <span className="text-xs text-slate-400">{t("+ เลือกสี", "+ Pick colour")}</span>}
          </button>
        );
      },
    })),
  ], [colorways, partOptions, onCreatePart, onLocatePart, t]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pickCw = picking ? colorways.find((c) => c.key === picking.cw) : null;
  const pickRow = picking ? rows.find((r) => r.key === picking.row) : null;

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-slate-600 inline-flex items-center gap-1.5"><Icon name="design" /> {t("ตารางสี (ส่วนประกอบ × สีของรุ่น)", "Colour table (parts × colourways)")}</span>
        {onMakeBom && rows.length > 0 && colorways.length > 0 && (
          <button type="button" onClick={onMakeBom} title={t("1 สีของรุ่น = 1 สูตร · วัตถุดิบจากช่องสี · จำนวนจากตีราคา", "One colourway = one BOM · materials from cells · qty from costing")}
            className="ml-auto order-last h-7 px-2.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 inline-flex items-center gap-1">
            <Icon name="sitemap" /> {t("สร้าง BOM จากตารางสี", "Create BOM from colours")}
          </button>
        )}
        {canEdit && missingParts.length > 0 && (
          <button type="button" onClick={pullParts} title={missingParts.map((p) => p.name).join(", ")}
            className="h-7 px-2 text-xs border border-violet-200 text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100">
            {t(`ดึงส่วนประกอบจากหมุด (${missingParts.length})`, `Pull parts from pins (${missingParts.length})`)}
          </button>
        )}
      </div>

      {/* สีของรุ่น: ตั้งชื่อ / ลบ / เพิ่ม */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-slate-400">{t("สีของรุ่น:", "Colourways:")}</span>
        {colorways.map((cw, i) => canEdit ? (
          <span key={cw.key} className="inline-flex items-center gap-0.5 h-8 pl-1 pr-0.5 border border-slate-200 rounded-lg bg-white">
            <input value={cw.name} onChange={(e) => onChange({ ...value, colorways: colorways.map((c) => (c.key === cw.key ? { ...c, name: e.target.value } : c)) })}
              placeholder={t(`สีที่ ${i + 1}`, `Colour ${i + 1}`)} className="w-28 h-7 px-1 text-sm border-0 focus:outline-none focus:ring-0" />
            <button type="button" onClick={() => setDelCw(cw.key)} title={t("ลบสีนี้", "Delete colourway")}
              className="h-7 w-7 inline-flex items-center justify-center text-slate-300 hover:text-rose-600 rounded-md"><Icon name="delete" /></button>
            {cw.bom && <BomBadge bom={cw.bom} />}
          </span>
        ) : (
          <span key={cw.key} className="h-7 px-2 inline-flex items-center gap-1 text-sm border border-slate-200 rounded-lg text-slate-600">{cwLabel(i)}{cw.bom && <BomBadge bom={cw.bom} />}</span>
        ))}
        {canEdit && (
          <button type="button" onClick={addColorway} className="h-8 px-2.5 text-xs border border-dashed border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1">
            <Icon name="add" /> {t("เพิ่มสี", "Add colour")}
          </button>
        )}
        {colorways.length === 0 && !canEdit && <span className="text-xs text-slate-400">—</span>}
      </div>

      <LineItemsGrid<SpecColorRow>
        variant="lines"
        rows={rows}
        columns={columns}
        rowId={(r) => r.key}
        readonly={!canEdit}
        onChange={(next) => onChange({ ...value, rows: next })}
        onAdd={() => ({ key: newMarkupId(), name: "" })}
        addLabel={t("＋ เพิ่มส่วนประกอบ", "＋ Add part")}
        emptyText={t("ยังไม่มีส่วนประกอบ — เพิ่มเอง หรือดึงจากหมุดวัตถุดิบ", "No parts yet — add one or pull from material pins")}
        emptyAction={canEdit && missingParts.length > 0 ? (
          <button type="button" onClick={pullParts} className="h-8 px-3 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700">
            {t(`ดึงส่วนประกอบจากหมุด (${missingParts.length})`, `Pull parts from pins (${missingParts.length})`)}
          </button>
        ) : null}
      />

      {picking && pickCw && pickRow && (
        <SpecColorPickerModal
          title={t(`เลือกสี — ${pickRow.name || "ส่วนประกอบ"} · ${cwLabel(colorways.indexOf(pickCw))}`, `Pick colour — ${pickRow.name || "part"} · ${cwLabel(colorways.indexOf(pickCw))}`)}
          cell={pickCw.cells[pickRow.key] ?? null} imageKeys={imageKeys}
          onClose={() => setPicking(null)}
          onPick={(cell) => { setCell(pickCw.key, pickRow.key, cell); setPicking(null); }} />
      )}
      <ConfirmDialog open={delCw != null} onClose={() => setDelCw(null)} variant="danger"
        title={t("ลบสีนี้ออกจากตาราง?", "Delete this colourway?")}
        message={t("สีที่เลือกไว้ในคอลัมน์นี้จะหายทั้งหมด (มีผลเมื่อกดบันทึก)", "All colours picked in this column will be removed (applies when you save)")}
        confirmText={t("ลบ", "Delete")}
        onConfirm={() => { onChange({ ...value, colorways: colorways.filter((c) => c.key !== delCw) }); setDelCw(null); }} />
    </div>
  );
}

type PickTab = "swatch" | "sku" | "dict" | "pick";
let dictCache: SwatchEntry[] | null = null;   // ทะเบียนสี — โหลดครั้งเดียวต่อการเปิดเว็บ

/** ป๊อปเลือกสี 1 ช่อง */
function SpecColorPickerModal({ title, cell, imageKeys, onClose, onPick }: {
  title: string;
  cell: SpecColorCell | null;
  imageKeys: string[];
  onClose: () => void;
  onPick: (cell: SpecColorCell | null) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<PickTab>(cell?.source ?? "swatch");
  const [draft, setDraft] = useState<SpecColorCell | null>(cell);
  const [eyedrop, setEyedrop] = useState(false);
  const base = (source: SpecColorCell["source"], patch: Partial<SpecColorCell>): SpecColorCell => ({
    source, name: null, hex: null, colors: [], image_key: null, crop: null, sku_id: null, sku_code: null, sku_name: null, swatch_id: null, ...patch,
  });

  // ── แผงผ้า (ของกลาง SwatchBrowser โหมดเลือก 1 ชิ้น) ──
  const pickSpot = (p: SwatchSpotPick) => setDraft(base("swatch", {
    name: p.sku?.color || p.name || p.label || p.sku?.name || null, hex: p.color_hex, image_key: p.image_key, crop: { x: Number(p.x), y: Number(p.y), w: Number(p.w), h: Number(p.h) },
    sku_id: p.sku?.id ?? null, sku_code: p.sku?.code ?? null, sku_name: p.sku?.name ?? null, swatch_id: p.swatch_id,
  }));

  // ── ทะเบียนสี ──
  const [dict, setDict] = useState<SwatchEntry[] | null>(dictCache);
  const [dictQ, setDictQ] = useState("");
  useEffect(() => {
    if (tab !== "dict" || dict) return;
    apiFetch("/api/color-swatches").then((r) => r.json()).then((j) => {
      const list = ((j.data?.entries ?? []) as SwatchEntry[]).sort((a, b) => Number(!!b.kind) - Number(!!a.kind));   // มีจุดสีขึ้นก่อน
      dictCache = list; setDict(list);
    }).catch(() => setDict([]));
  }, [tab, dict]);
  const dictShown = useMemo(() => {
    const q = norm(dictQ);
    return (dict ?? []).filter((e) => !q || norm(e.th).includes(q) || norm(e.en).includes(q)).slice(0, 120);
  }, [dict, dictQ]);

  const TABS: { k: PickTab; label: string }[] = [
    { k: "swatch", label: t("แผงผ้า", "Fabric board") },
    { k: "sku", label: "SKU" },
    { k: "dict", label: t("ทะเบียนสี", "Colour registry") },
    { k: "pick", label: t("ดูดสี / เลือกเอง", "Eyedropper / custom") },
  ];

  return (
    <ERPModal open onClose={onClose} size="lg" title={title}
      footer={<>
        {cell && <button type="button" onClick={() => onPick(null)} className="mr-auto h-9 px-3 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">{t("ล้างช่องนี้", "Clear cell")}</button>}
        <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={() => onPick(draft)} disabled={!draft}
          className="h-9 px-4 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">{t("ใช้สีนี้", "Use this colour")}</button>
      </>}>
      <div className="space-y-3">
        {/* ตัวอย่าง + ชื่อสี */}
        <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50">
          <SpecColorChip cell={draft} size={48} />
          <div className="flex-1 min-w-0 space-y-1">
            <input value={draft?.name ?? ""} disabled={!draft} onChange={(e) => draft && setDraft({ ...draft, name: e.target.value || null })}
              placeholder={draft ? t("ชื่อสี เช่น แดงคลาสสิก", "Colour name, e.g. Classic red") : t("ยังไม่ได้เลือกสี — เลือกจากด้านล่าง", "No colour yet — pick one below")}
              className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:bg-transparent disabled:border-transparent" />
            {draft && <div className="text-[11px] text-slate-400">{SPEC_COLOR_SOURCE_LABEL[draft.source]}{draft.sku_code ? ` · ${draft.sku_code} ${draft.sku_name ?? ""}` : ""}{draft.hex ? ` · ${draft.hex.toUpperCase()}` : ""}</div>}
          </div>
        </div>

        <div className="inline-flex border border-slate-200 rounded-lg overflow-hidden text-sm">
          {TABS.map((x) => (
            <button key={x.k} type="button" onClick={() => setTab(x.k)} aria-pressed={tab === x.k}
              className={`h-8 px-3 ${tab === x.k ? "bg-violet-50 text-violet-700 font-medium" : "bg-white text-slate-500 hover:bg-slate-50"}`}>{x.label}</button>
          ))}
        </div>

        {tab === "swatch" && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">{t("กดแผ่นเพื่อเปิด แล้วกดชิ้นผ้าบนรูป → เลือกชิ้นนี้ · ค้นด้วยสีได้", "Open a board, click a piece → Pick this piece · you can search by colour")}</p>
            <SwatchBrowser onPickSpot={pickSpot} />
          </div>
        )}

        {tab === "sku" && (
          <div className="space-y-1.5">
            <p className="text-xs text-slate-500">{t("เลือก SKU ผ้า/วัสดุ — ใช้รูปปก SKU เป็นจุดสี", "Pick a fabric/material SKU — its cover image becomes the colour chip")}</p>
            <ComponentPicker sku={draft?.source === "sku" ? draft.sku_code ?? "" : ""} name={draft?.source === "sku" ? draft.sku_name ?? "" : ""}
              imageKey={draft?.source === "sku" ? draft.image_key : null} placeholder={t("— ค้นหา SKU —", "— Search SKU —")}
              onPick={(c) => setDraft(base("sku", { name: c.name, image_key: c.image_key, sku_id: c.id, sku_code: c.code, sku_name: c.name }))} />
          </div>
        )}

        {tab === "dict" && (
          <div className="space-y-2">
            <input value={dictQ} onChange={(e) => setDictQ(e.target.value)} placeholder={t("ค้นชื่อสี (ไทย/อังกฤษ)", "Search colour name (TH/EN)")}
              className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
            {dict == null ? <p className="text-sm text-slate-400 py-4 text-center">{t("กำลังโหลดทะเบียนสี…", "Loading colour registry…")}</p> : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-72 overflow-y-auto">
                {dictShown.map((e) => {
                  const has = e.colors.length > 0 || !!e.imageKey;
                  return (
                    <button key={e.id ?? e.th} type="button"
                      onClick={() => setDraft(base("dict", { name: e.th, hex: e.colors[0] ?? null, colors: e.colors, image_key: e.imageKey }))}
                      className="flex items-center gap-1.5 h-9 px-1.5 border border-slate-200 rounded-lg hover:border-violet-300 hover:bg-violet-50 text-left">
                      <span className={`inline-block w-6 h-6 shrink-0 rounded-md border ${has ? "border-slate-300" : "border-dashed border-slate-300"}`}
                        style={has ? { background: swatchCss({ colors: e.colors, imageKey: e.imageKey }, (k) => r2ImageUrl(k, 120) ?? "") } : undefined} />
                      <span className="min-w-0 text-xs text-slate-700 truncate">{e.th}{e.en ? <span className="text-slate-400"> · {e.en}</span> : null}</span>
                    </button>
                  );
                })}
                {dictShown.length === 0 && <p className="col-span-full text-sm text-slate-400 py-3 text-center">{t("ไม่พบสีนี้ในทะเบียน", "Not found in the registry")}</p>}
              </div>
            )}
          </div>
        )}

        {tab === "pick" && (
          <div className="space-y-3">
            <button type="button" onClick={() => setEyedrop(true)}
              className="h-9 px-3 text-sm border border-violet-200 text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 inline-flex items-center gap-1.5">
              <Icon name="design" /> {imageKeys.length ? t("ดูดสีจากรูปในรายละเอียดงาน", "Pick colour from job-detail images") : t("ดูดสีจากรูป (เลือกรูปเอง)", "Pick colour from an image")}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{t("หรือเลือกสีเอง:", "Or choose a colour:")}</span>
              <ColorInput value={draft?.hex ?? ""} onChange={(v) => { if (/^#[0-9a-f]{6}$/i.test(v)) setDraft(base("pick", { hex: v.toLowerCase(), name: draft?.name ?? null })); }} />
            </div>
          </div>
        )}
      </div>

      {eyedrop && (
        <ImageEyedropper open images={imageKeys} title={t("💧 ดูดสีจากรูป", "💧 Pick colour from image")} onClose={() => setEyedrop(false)}
          onPick={(hex) => { setDraft(base("pick", { hex: hex.toLowerCase(), name: draft?.name ?? null })); setEyedrop(false); }} />
      )}
    </ERPModal>
  );
}
