"use client";

/**
 * รายการลายที่จะจัดเรียง — แถวละ 1 ลาย (เจ้าของเลือก: คลังใช้เลือกลาย+ขนาด ส่วนไฟล์พิมพ์ "ลากไฟล์ PNG ตัวจริงทุกครั้ง")
 * ไฟล์จริงอัปเข้าตัวช่วยในเครื่อง (ไม่ขึ้นเซิร์ฟเวอร์) · ป้ายเตือน = ความละเอียดต่ำ / ส่วนบางเกินพิมพ์ติด / เศษเล็ก
 */
import { useRef } from "react";
import { useT, useLang } from "@/components/i18n";
import { useFileDrop } from "@/components/file-drop";
import { helperFileUrl } from "@/lib/nesting-helper";
import type { AssetSize } from "@/app/api/assets/shared";
import { toMm, type NestingItem, type RotateLock } from "./data";
import {
  fmt, fmtLen, natural, newKey, safeThicknessPx, sizeOf, switchMode, thinFraction, toUnit, unitScale,
  type FileInfo, type Settings,
} from "./nest-utils";
import { NumInput } from "./num-input";

export type AssetPreview = { url: string | null; sizes: AssetSize[] };

const MODES = ["natural", "width", "height", "scale", "max"] as const;
const ROTATES: RotateLock[] = ["sheet", "none", "flip", "quad"];

export function ItemsPanel({
  items, infos, missing, previews, settings, resultByKey, busy, onChange, onAttach, onAddFiles, onPickLibrary,
  canSplit, onSplit, onMergeBack,
}: {
  items: NestingItem[];
  infos: Record<string, FileInfo>;
  missing: Record<string, string>;
  previews: Record<string, AssetPreview>;
  settings: Settings;
  resultByKey: Record<string, string>;
  busy: boolean;
  onChange: (items: NestingItem[]) => void;
  onAttach: (key: string, file: File) => void;
  onAddFiles: (files: File[]) => void;
  onPickLibrary: () => void;
  canSplit: boolean;                       // ตัวช่วยรุ่นนี้แยกชิ้นได้ (v1.3.0+)
  onSplit: (key: string) => void;
  onMergeBack: (key: string) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const fill = settings.fill;
  const u = settings.unit;
  const pngs = (files: File[]) => files.filter((f) => /\.png$/i.test(f.name) || f.type === "image/png");
  const drop = useFileDrop((files, key) => {
    const ok = pngs(files);
    if (!ok.length) return;
    if (key === "new") onAddFiles(ok); else onAttach(key, ok[0]);
  }, { accept: "image/", disabled: busy });

  const patch = (key: string, p: Partial<NestingItem>) => onChange(items.map((it) => (it.key === key ? { ...it, ...p } : it)));
  const modeLabel = (m: (typeof MODES)[number]) =>
    ({ natural: t("จริง", "Actual"), width: t("กว้าง", "Width"), height: t("สูง", "Height"), scale: "%", max: t("ยาวสุด", "Longest") })[m];
  const rotateLabel = (r: RotateLock) =>
    ({ sheet: t("ตามแผ่น", "Sheet setting"), none: t("ห้ามหมุน", "No rotation"), flip: t("แนวนอน 0°/180°", "Horizontal 0°/180°"), quad: t("แนวนอน/ตั้ง", "Horizontal/vertical") })[r];
  const totalPct = Math.round(items.reduce((a, it) => a + (it.fill_pct || 0), 0) * 100) / 100;
  const evenSplit = () => {
    const n = items.length;
    onChange(items.map((it, i) => ({ ...it, fill_pct: Math.floor(100 / n) + (i < 100 % n ? 1 : 0) })));
  };

  const chips = (it: NestingItem, info: FileInfo | undefined) => {
    const out: { cls: string; text: string; title?: string }[] = [];
    if (!info) return out;
    if (info.error) return [{ cls: "bg-red-50 text-red-700", text: t(`ใช้ไม่ได้: ${info.error}`, `Unusable: ${info.error}`) }];
    const sz = sizeOf(it, info);
    if (sz) {
      const minDpi = settings.min_dpi || 150;
      if (sz.dpi < minDpi) out.push({ cls: "bg-amber-50 text-amber-700", text: t(`ความละเอียด ${fmt(sz.dpi, 0, lang)} dpi (ต่ำกว่า ${minDpi})`, `Resolution ${fmt(sz.dpi, 0, lang)} dpi (below ${minDpi})`) });
      const minLine = settings.min_line_mm || 0.1;
      const pct = 100 * thinFraction(info.thin, minLine / sz.mmPerPx);
      if (pct > 1 && info.thin) {
        const needCm = (natural(info).wpx * (minLine / safeThicknessPx(info.thin))) / 10;
        out.push({
          cls: pct > 5 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700",
          title: t(`ส่วนที่บางกว่า ${minLine} mm งานพิมพ์ส่วนใหญ่ทำไม่ติด`, `Most printers cannot print parts thinner than ${minLine} mm`),
          text: t(`ส่วนที่บางกว่า ${minLine} mm ≈ ${fmt(pct, pct < 10 ? 1 : 0, lang)}% · ควรกว้าง ≥ ${fmt(needCm, 1, lang)} cm`,
            `Thinner than ${minLine} mm ≈ ${fmt(pct, pct < 10 ? 1 : 0, lang)}% · make it ≥ ${fmt(needCm, 1, lang)} cm wide`),
        });
      }
    }
    if (info.specks?.length) out.push({ cls: "bg-amber-50 text-amber-700", text: t(`เศษเล็ก ${info.specks.length} จุด`, `${info.specks.length} tiny speck(s)`) });
    if (info.dpi_source === "default") out.push({ cls: "bg-slate-100 text-slate-600", text: t(`ไฟล์ไม่บอก DPI ใช้ ${settings.default_dpi}`, `No DPI in file, using ${settings.default_dpi}`) });
    if (!out.length) out.push({ cls: "bg-emerald-50 text-emerald-700", text: t("พร้อม", "Ready") });
    return out;
  };

  return (
    <div {...drop.guard}>
      <input ref={fileInput} type="file" accept="image/png" multiple hidden
        onChange={(e) => {
          const files = pngs(Array.from(e.target.files ?? []));
          e.target.value = "";
          if (!files.length) return;
          if (target.current) onAttach(target.current, files[0]); else onAddFiles(files);
        }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPickLibrary} disabled={busy}
          className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm text-violet-700 hover:bg-violet-100 disabled:opacity-50">
          🖼 {t("เลือกลายจากคลัง Artwork", "Pick artwork from library")}
        </button>
      </div>
      <div {...drop.zone("new")}
        onClick={() => { target.current = null; fileInput.current?.click(); }}
        className={`mt-2 cursor-pointer rounded-lg border-2 border-dashed px-3 py-3 text-center text-sm ${drop.over === "new" ? "border-violet-400 bg-violet-50" : "border-slate-300 text-slate-500 hover:border-slate-400"}`}>
        ⬆ {t("ลากไฟล์ PNG มาวางเพื่อเพิ่มลาย หรือกดเลือก", "Drop PNG files here to add, or click to browse")}
      </div>

      <div className="mt-3 space-y-2">
        {items.map((it) => {
          const info = it.file ? infos[it.file.sha] : undefined;
          const miss = it.file ? missing[it.file.sha] : undefined;
          const prev = it.asset_id ? previews[it.asset_id] : undefined;
          const sz = info && !info.error ? sizeOf(it, info) : null;
          const sameSha = it.file ? items.filter((x) => x.file?.sha === it.file?.sha) : [];
          const assetSizes = (prev?.sizes ?? []).filter((s) => s.unit !== "px" && (s.w || s.h));
          return (
            <div key={it.key} {...drop.zone(it.key)}
              className={`rounded-lg border bg-white p-2.5 ${drop.over === it.key ? "border-violet-400 ring-2 ring-violet-200" : !it.file || miss ? "border-amber-300" : "border-slate-200"}`}>
              <div className="flex items-start gap-2">
                <div className="h-12 w-14 shrink-0 overflow-hidden rounded-md bg-[repeating-conic-gradient(#eceef1_0_25%,#fff_0_50%)] bg-[length:12px_12px]">
                  {info && !info.error ? <img src={helperFileUrl(info.sha, "thumb")} alt="" className="h-full w-full object-contain" />
                    : prev?.url ? <img src={prev.url} alt="" className="h-full w-full object-contain opacity-60" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <input value={it.title} onChange={(e) => patch(it.key, { title: e.target.value })}
                    className="w-full rounded border border-transparent px-1 text-sm font-medium text-slate-800 hover:border-slate-200 focus:border-violet-300" />
                  <div className="truncate px-1 text-[11px] text-slate-400">
                    {info && !info.error ? `${info.canvas_px[0]}×${info.canvas_px[1]} px · ${fmt(info.dpi[0], 0, lang)} dpi` : ""}
                    {sameSha.length > 1 ? ` · ${t(`ขนาดที่ ${sameSha.indexOf(it) + 1}/${sameSha.length}`, `size ${sameSha.indexOf(it) + 1}/${sameSha.length}`)}` : ""}
                  </div>
                </div>
                <button type="button" title={t("คัดลอก — ลายเดียวกันอีกขนาด/อีกจำนวน", "Duplicate — the same artwork at another size or quantity")}
                  onClick={() => { const i = items.indexOf(it); onChange([...items.slice(0, i + 1), { ...it, key: newKey(), piece: null }, ...items.slice(i + 1)]); }}
                  className="rounded px-1.5 text-xs text-slate-500 hover:bg-slate-100">⧉</button>
                <button type="button" title={t("เอาลายนี้ออก", "Remove this artwork")} aria-label={t("เอาลายนี้ออก", "Remove this artwork")}
                  onClick={() => onChange(items.filter((x) => x.key !== it.key))}
                  className="rounded px-1.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600">✕</button>
              </div>

              <div className="mt-1.5 flex items-center gap-2 text-xs">
                {it.file && !miss ? (
                  <span className="truncate text-slate-600" title={it.file.name}>📄 {it.file.name}</span>
                ) : (
                  <span className="text-amber-700">
                    {miss && it.piece ? t(`ชิ้นนี้ไม่ได้อยู่ในเครื่องนี้ — ลากไฟล์ต้นฉบับ ${it.piece.source.name} มาใหม่ (แยกชิ้นให้เอง)`, `This piece is not on this computer — drop the original ${it.piece.source.name} again (it splits automatically)`)
                      : miss ? t(`ไฟล์ ${it.file?.name} ไม่ได้อยู่ในเครื่องนี้ — ลากไฟล์เดิมมาใหม่`, `File ${it.file?.name} is not on this computer — drop it again`)
                      : t("ยังไม่มีไฟล์พิมพ์ — ลาก PNG ตัวจริงมาวางที่การ์ดนี้", "No print file yet — drop the real PNG onto this card")}
                  </span>
                )}
                <button type="button" onClick={() => { target.current = it.key; fileInput.current?.click(); }} disabled={busy}
                  className="ml-auto shrink-0 rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  {it.file && !miss ? t("เปลี่ยนไฟล์", "Replace file") : t("เลือกไฟล์", "Browse")}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {assetSizes.length > 0 && (
                  <select className="h-7 rounded border border-slate-300 px-1 text-xs" value=""
                    onChange={(e) => {
                      const s = assetSizes[Number(e.target.value)];
                      if (!s) return;
                      patch(it.key, { size: s.w ? { mode: "width", value: toMm(s.w, s.unit) } : { mode: "height", value: toMm(s.h ?? 0, s.unit) } });
                    }}>
                    <option value="">{t("ไซส์จากคลัง…", "Library size…")}</option>
                    {assetSizes.map((s, k) => (
                      <option key={k} value={k}>{s.label || `#${k + 1}`} · {s.w ? `${t("กว้าง", "W")} ${s.w}` : ""}{s.w && s.h ? " × " : ""}{s.h ? `${t("สูง", "H")} ${s.h}` : ""} {s.unit}</option>
                    ))}
                  </select>
                )}
                <div className="flex overflow-hidden rounded border border-slate-300 text-[11px]">
                  {MODES.map((m) => (
                    <button key={m} type="button" onClick={() => patch(it.key, { size: switchMode(it, info && !info.error ? info : undefined, m) })}
                      className={`px-1.5 py-1 ${it.size.mode === m ? "bg-violet-100 font-semibold text-violet-700" : "text-slate-500 hover:bg-slate-50"}`}>
                      {modeLabel(m)}
                    </button>
                  ))}
                </div>
                {it.size.mode !== "natural" && (
                  <span className="flex items-center gap-1">
                    <NumInput className="h-7 w-16 rounded border border-slate-300 px-1 text-xs"
                      value={it.size.mode === "scale" ? (it.size.value == null ? "" : String(it.size.value)) : toUnit(it.size.value, u)}
                      onChange={(v) => patch(it.key, { size: { mode: it.size.mode, value: v == null ? null : it.size.mode === "scale" ? v : v * unitScale(u) } })} />
                    <span className="text-[11px] text-slate-400">{it.size.mode === "scale" ? "%" : u}</span>
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {sz ? `→ ${fmtLen(sz.w, u, lang)} × ${fmtLen(sz.h, u, lang)} · ${fmt(sz.dpi, 0, lang)} dpi` : it.size.mode !== "natural" && !(Number(it.size.value) > 0) ? t("→ ใส่ขนาด", "→ enter a size") : ""}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">{fill ? t("จำนวนเป๊ะ", "Exact qty") : t("จำนวน", "Qty")}</span>
                <NumInput className="h-7 w-16 rounded border border-slate-300 px-1" value={String(it.qty)} integer
                  onChange={(v) => patch(it.key, { qty: Math.max(0, Math.floor(v ?? 0)) })} />
                {fill && (
                  <>
                    <span className="text-slate-500">{t("เติมที่เหลือ", "Fill share")}</span>
                    <NumInput className="h-7 w-14 rounded border border-slate-300 px-1" value={String(it.fill_pct ?? 0)}
                      onChange={(v) => patch(it.key, { fill_pct: Math.min(100, Math.max(0, v ?? 0)) })} />
                    <span className="text-slate-400">%</span>
                  </>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1 text-slate-600"
                  title={t("ล็อก = ห้ามชิ้นอื่นแทรกในช่องว่างของลายนี้ / จำกัดมุมหมุนเฉพาะลายนี้", "Lock = keep other pieces out of this artwork's gaps / limit its rotation")}>
                  <input type="checkbox" checked={!!it.lock} onChange={(e) => patch(it.key, { lock: e.target.checked ? { box: true, rotate: "quad" } : null })} />
                  🔒 {t("ล็อกลายนี้", "Lock this artwork")}
                </label>
                {settings.layout !== "rows" && (
                  <button type="button" onClick={() => patch(it.key, { rows: !it.rows })}
                    title={t("เรียงลายนี้เป็นแถวตรงแนวที่ต้นแผ่น (ทั้งลายหันทางเดียว · หมุน 90° ได้ถ้าได้มากกว่า) ลายอื่นแทรกที่ว่างที่เหลือ — ตัดง่าย",
                      "Lay this artwork out in straight rows at the start of the sheet (all facing one way · turned 90° if more fit); other artwork fills the rest — easy to cut")}
                    className={`rounded border px-2 py-0.5 ${it.rows ? "border-violet-400 bg-violet-100 font-semibold text-violet-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                    ▤ {t("เรียงเป็นแถว", "Rows")}
                  </button>
                )}
                {!it.piece && it.file && !miss && info && !info.error && (
                  <button type="button" onClick={() => onSplit(it.key)} disabled={!canSplit || busy}
                    title={canSplit ? t("ภาพเดียวมีหลายส่วน (เช่น ช้าง + ตัวหนังสือ) → แยกเป็นหลายชิ้น", "One image with several parts (e.g. elephant + text) → split into pieces")
                      : t("ต้องอัปเดตตัวช่วยเป็น v1.3.0 ก่อน (คลิกขวาไอคอนกรรไกร → ตรวจหาเวอร์ชันใหม่)", "Update the helper to v1.3.0 first (right-click the scissors icon → Check for updates)")}
                    className="rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    ✂️ {t("แยกชิ้น", "Split pieces")}
                  </button>
                )}
              </div>
              {it.lock && (
                <div className="mt-1 space-y-1 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                  <label className="flex items-center gap-1 text-slate-700">
                    <input type="checkbox" checked={it.lock.box} onChange={(e) => patch(it.key, { lock: { ...it.lock!, box: e.target.checked } })} />
                    {t("ห้ามชิ้นอื่นเข้ามาในช่องว่าง (จองเป็นกรอบสี่เหลี่ยม)", "Keep other pieces out of the gaps (reserve a rectangle)")}
                  </label>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-slate-500">{t("การหมุน", "Rotation")}</span>
                    {ROTATES.map((r) => (
                      <button key={r} type="button" onClick={() => patch(it.key, { lock: { ...it.lock!, rotate: r } })}
                        className={`rounded border px-1.5 py-0.5 text-[11px] ${it.lock!.rotate === r ? "border-violet-400 bg-violet-100 font-semibold text-violet-700" : "border-slate-300 bg-white text-slate-600"}`}>
                        {rotateLabel(r)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {it.piece && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
                    ✂️ {t(`ชิ้น ${it.piece.index + 1}/${it.piece.count} ของ ${it.piece.parent.title}`, `Piece ${it.piece.index + 1}/${it.piece.count} of ${it.piece.parent.title}`)}
                  </span>
                  <button type="button" onClick={() => onMergeBack(it.key)} disabled={busy} className="text-slate-500 underline disabled:opacity-50">
                    {t("รวมกลับเป็นภาพเดียว", "Merge back into one image")}
                  </button>
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {chips(it, info).map((c, k) => <span key={k} title={c.title} className={`rounded px-1.5 py-0.5 text-[11px] ${c.cls}`}>{c.text}</span>)}
              </div>
              {resultByKey[it.key] && <div className="mt-1 text-[11px] font-medium text-emerald-700">{resultByKey[it.key]}</div>}
            </div>
          );
        })}
      </div>

      {fill && items.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className={`rounded px-2 py-0.5 ${Math.abs(totalPct - 100) < 0.01 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {Math.abs(totalPct - 100) < 0.01 ? t("รวม 100%", "Total 100%") : t(`รวม ${totalPct}% — ต้องรวมได้ 100%`, `Total ${totalPct}% — must add up to 100%`)}
          </span>
          <button type="button" onClick={evenSplit} className="rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50">
            {t("แบ่งเท่ากัน", "Split evenly")}
          </button>
        </div>
      )}
    </div>
  );
}
