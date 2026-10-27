"use client";

/**
 * รายการลายที่จะจัดเรียง — แถวละ 1 ลาย (เจ้าของเลือก: คลังใช้เลือกลาย+ขนาด ส่วนไฟล์พิมพ์ "ลากไฟล์ PNG ตัวจริงทุกครั้ง")
 * ไฟล์จริงอัปเข้าตัวช่วยในเครื่อง (ไม่ขึ้นเซิร์ฟเวอร์) · ป้ายเตือน = ความละเอียดต่ำ / ส่วนบางเกินพิมพ์ติด / เศษเล็ก
 *
 * 2 แบบหน้าตา ใช้ตัวควบคุมชุดเดียวกัน (แก้ที่เดียว ได้ทั้งสองแบบ):
 *   cards = การ์ดในแถบซ้ายของหน้าจัดเรียง
 *   table = ตารางใหญ่ในหน้าต่าง "⤢ ขยาย" (แถวละลาย · ค้นหา · ลากหูจับ ⠿ สลับลำดับ — ของกลาง useDragReorder)
 */
import { useRef, useState } from "react";
import { useT, useLang } from "@/components/i18n";
import { useFileDrop } from "@/components/file-drop";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
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
// ตารางใหญ่: ⠿ · รูป · ชื่อ/ไฟล์ · ขนาด · จำนวน(+เติม) · ล็อก · แถว/แยก · สถานะ · ปุ่ม
const TABLE_COLS = (fill: boolean) =>
  `28px 64px minmax(220px,1.4fr) 330px ${fill ? "205px" : "90px"} 200px 150px minmax(170px,1fr) 64px`;

/** ไฟล์ไม่อยู่ในเครื่องเพราะอะไร: old = มีในคลังแต่ตัวช่วยเก่า · none = ยังไม่มีในคลัง · fail = โหลดจากคลังไม่สำเร็จ */
export type MissWhy = "old" | "none" | "fail";

export function ItemsPanel({
  items, infos, missing, previews, settings, resultByKey, busy, onChange, onAttach, onAddFiles, onPickLibrary,
  canSplit, onSplit, onMergeBack, variant = "cards", cloud = {}, onLibrarySize, librarySizeOf, onSaveSize,
  missWhy = {}, cloudReady = false, helperVersion = null, onDrivePick,
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
  variant?: "cards" | "table";
  cloud?: Record<string, "saving" | "saved" | "fetching" | "error">;   // สถานะไฟล์ในคลังกลาง (ตาม sha)
  onLibrarySize?: (key: string, size: AssetSize) => void;           // ชิ้นที่แยก: ไซส์ในคลัง (ของภาพเต็ม) → ทุกชิ้นของภาพนั้น
  librarySizeOf?: (it: NestingItem) => { w: number; h: number } | null;   // ขนาดที่บันทึกเป็นไซส์ในคลังได้ (cm · ของภาพเต็ม)
  onSaveSize?: (key: string) => void;
  missWhy?: Record<string, MissWhy>;
  cloudReady?: boolean;                    // ตัวช่วยรุ่นนี้ส่ง/โหลดไฟล์กับคลังได้ (v1.5.0+)
  helperVersion?: string | null;
  onDrivePick?: (key: string) => void;     // ใช้ไฟล์จาก Drive ของลายในคลัง
}) {
  const t = useT();
  const { lang } = useLang();
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const [search, setSearch] = useState("");
  const fill = settings.fill;
  const u = settings.unit;
  const pngs = (files: File[]) => files.filter((f) => /\.png$/i.test(f.name) || f.type === "image/png");
  const drop = useFileDrop((files, key) => {
    const ok = pngs(files);
    if (!ok.length) return;
    if (key === "new") onAddFiles(ok); else onAttach(key, ok[0]);
  }, { accept: "image/", disabled: busy });
  const drag = useDragReorder((from, to) => onChange(moveItem(items, from, to)), { group: "nesting-items" });

  const patch = (key: string, p: Partial<NestingItem>) => onChange(items.map((it) => (it.key === key ? { ...it, ...p } : it)));
  const modeLabel = (m: (typeof MODES)[number]) =>
    ({ natural: t("จริง", "Actual"), width: t("กว้าง", "Width"), height: t("สูง", "Height"), scale: "%", max: t("ยาวสุด", "Longest") })[m];
  const rotateLabel = (r: RotateLock) =>
    ({ sheet: t("ตามแผ่น", "Sheet setting"), none: t("ห้ามหมุน", "No rotation"), flip: t("แนวนอน 0°/180°", "Horizontal 0°/180°"), quad: t("แนวนอน/ตั้ง", "Horizontal/vertical") })[r];
  const totalPct = Math.round(items.reduce((a, it) => a + (it.fill_pct || 0), 0) * 100) / 100;
  // แบ่งเท่ากัน = เลิกปักหมุดทุกลาย แล้วให้หน้าจัดเรียงแบ่งให้ (rebalanceFill ใน editor)
  const evenSplit = () => {
    const n = items.length;
    onChange(items.map((it, i) => ({ ...it, fill_pin: false, fill_pct: Math.floor(100 / n) + (i < 100 % n ? 1 : 0) })));
  };
  const browse = (key: string | null) => { target.current = key; fileInput.current?.click(); };

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

  // ---------------------------------------------------------------- ตัวควบคุมรายลาย (ใช้ทั้งการ์ดและตาราง)
  const ctx = (it: NestingItem) => {
    const info = it.file ? infos[it.file.sha] : undefined;
    const miss = it.file ? missing[it.file.sha] : undefined;
    const prev = it.asset_id ? previews[it.asset_id] : undefined;
    return {
      info, miss, prev,
      sz: info && !info.error ? sizeOf(it, info) : null,
      sameSha: it.file ? items.filter((x) => x.file?.sha === it.file?.sha) : [],
      assetSizes: (prev?.sizes ?? []).filter((s) => s.unit !== "px" && (s.w || s.h)),
    };
  };
  type Ctx = ReturnType<typeof ctx>;

  const cloudState = (it: NestingItem) => cloud[(it.piece ? it.piece.source : it.file)?.sha ?? ""];
  const cloudChip = (it: NestingItem) => {
    const st = cloudState(it);
    if (!st) return null;
    const m = {
      saving: ["text-sky-700", t("☁️ กำลังบันทึกเข้าคลัง…", "☁️ Saving to library…")],
      fetching: ["text-sky-700", t("☁️ กำลังโหลดจากคลัง…", "☁️ Downloading…")],
      saved: ["text-emerald-700", t("☁️ เก็บในคลังแล้ว", "☁️ In the library")],
      error: ["text-amber-700", t("☁️ บันทึกเข้าคลังไม่สำเร็จ", "☁️ Not saved to library")],
    }[st];
    return <span className={`shrink-0 text-[11px] ${m[0]}`}>{m[1]}</span>;
  };
  /** แสดงปุ่ม "บันทึกเป็นไซส์ในคลัง" — มีลายในคลัง + ขนาดนี้ยังไม่มีในไซส์ของลาย */
  const canSaveSize = (it: NestingItem, c: Ctx) => {
    const v = librarySizeOf?.(it);
    if (!v || !onSaveSize) return false;
    return !c.assetSizes.some((z) => (z.w ? Math.abs(toMm(z.w, z.unit) / 10 - v.w) < 0.05 : z.h ? Math.abs(toMm(z.h, z.unit) / 10 - v.h) < 0.05 : false));
  };

  const thumb = (it: NestingItem, c: Ctx) => (
    <div className="h-12 w-14 shrink-0 overflow-hidden rounded-md bg-[repeating-conic-gradient(#eceef1_0_25%,#fff_0_50%)] bg-[length:12px_12px]">
      {c.info && !c.info.error ? <img src={helperFileUrl(c.info.sha, "thumb")} alt="" className="h-full w-full object-contain" />
        : c.prev?.url ? <img src={c.prev.url} alt="" className="h-full w-full object-contain opacity-60" /> : null}
    </div>
  );
  const titleBlock = (it: NestingItem, c: Ctx) => (
    <>
      <input value={it.title} onChange={(e) => patch(it.key, { title: e.target.value })}
        className="w-full rounded border border-transparent px-1 text-sm font-medium text-slate-800 hover:border-slate-200 focus:border-violet-300" />
      <div className="truncate px-1 text-[11px] text-slate-400">
        {c.info && !c.info.error ? `${c.info.canvas_px[0]}×${c.info.canvas_px[1]} px · ${fmt(c.info.dpi[0], 0, lang)} dpi` : ""}
        {c.sameSha.length > 1 ? ` · ${t(`ขนาดที่ ${c.sameSha.indexOf(it) + 1}/${c.sameSha.length}`, `size ${c.sameSha.indexOf(it) + 1}/${c.sameSha.length}`)}` : ""}
      </div>
    </>
  );
  /** ข้อความเมื่อไฟล์ไม่อยู่ในเครื่อง — บอกตามสาเหตุจริง */
  const missText = (it: NestingItem, c: Ctx) => {
    if (!c.miss) return t("ยังไม่มีไฟล์พิมพ์ — ลาก PNG ตัวจริงมาวางที่การ์ดนี้", "No print file yet — drop the real PNG onto this card");
    const why = it.file ? missWhy[it.file.sha] : undefined;
    const name = it.piece ? it.piece.source.name : it.file?.name ?? "";
    if (why === "old") return t(`ไฟล์อยู่ในคลังแล้ว แต่ตัวช่วยเครื่องนี้ยังเก่า (${helperVersion ?? "?"}) — อัปเดตแล้วไฟล์จะมาเอง: คลิกขวาไอคอนกรรไกรข้างนาฬิกา → ตรวจหาเวอร์ชันใหม่`,
      `The file is in the library, but this computer's helper is old (${helperVersion ?? "?"}) — update it and the file comes by itself: right-click the scissors icon by the clock → Check for updates`);
    if (why === "fail") return t(`โหลดไฟล์ ${name} จากคลังไม่สำเร็จ — ลองเปิดงานใหม่ หรือลากไฟล์มาใส่`, `Couldn't download ${name} from the library — reopen the job or drop the file in`);
    if (why === "none") {
      const keep = cloudReady ? t(" ระบบเก็บให้ทุกเครื่อง", " it's kept for every computer")
        : t(" (อัปเดตตัวช่วยเป็น 1.5 ขึ้นไป ระบบจึงเก็บให้ทุกเครื่องได้)", " (update the helper to 1.5+ so it's kept for every computer)");
      return it.piece ? t(`ยังไม่มีไฟล์ต้นฉบับ ${name} ในคลัง — ใส่ไฟล์ครั้งเดียว แยกชิ้นให้เอง${keep}`, `The original ${name} isn't in the library yet — add it once, it splits automatically;${keep}`)
        : t(`ยังไม่มีไฟล์พิมพ์ในคลัง — ใส่ไฟล์ครั้งเดียว${keep}`, `No print file in the library yet — add it once;${keep}`);
    }
    return it.piece ? t(`ชิ้นนี้ไม่ได้อยู่ในเครื่องนี้ — ลากไฟล์ต้นฉบับ ${name} มาใหม่ (แยกชิ้นให้เอง)`, `This piece is not on this computer — drop the original ${name} again (it splits automatically)`)
      : t(`ไฟล์ ${name} ไม่ได้อยู่ในเครื่องนี้ — ลากไฟล์เดิมมาใหม่`, `File ${name} is not on this computer — drop it again`);
  };
  const missTone = (it: NestingItem, c: Ctx) => {
    const why = c.miss && it.file ? missWhy[it.file.sha] : undefined;
    return why === "none" ? "text-rose-700" : "text-amber-700";
  };
  const fileLine = (it: NestingItem, c: Ctx) => (
    <div className="flex items-center gap-2 text-xs">
      {it.file && !c.miss ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-slate-600" title={it.file.name}>📄 {it.file.name}</span>
          {cloudChip(it)}
        </span>
      ) : c.miss === undefined && it.file && cloudState(it) === "fetching" ? (
        <span className="text-sky-700">☁️ {t("กำลังโหลดไฟล์จากคลัง…", "Downloading the file from the library…")}</span>
      ) : (
        <span className={`min-w-0 ${missTone(it, c)}`}>{missText(it, c)}</span>
      )}
      {onDrivePick && it.asset_id && (!it.file || (c.miss && missWhy[it.file.sha] !== "old")) && (
        <button type="button" onClick={() => onDrivePick(it.key)} disabled={busy}
          title={t("เลือก PNG จากโฟลเดอร์ Drive ของลายนี้ — ระบบคัดลอกเข้าคลังให้", "Pick a PNG from this artwork's Drive folder — it's copied into the library")}
          className="shrink-0 rounded border border-violet-300 bg-violet-50 px-2 py-0.5 text-violet-700 hover:bg-violet-100 disabled:opacity-50">
          📁 {t("ใช้ไฟล์จาก Drive", "Use a file from Drive")}
        </button>
      )}
      <button type="button" onClick={() => browse(it.key)} disabled={busy}
        className="ml-auto shrink-0 rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
        {it.file && !c.miss ? t("เปลี่ยนไฟล์", "Replace file") : t("เลือกไฟล์", "Browse")}
      </button>
    </div>
  );
  const sizeCtl = (it: NestingItem, c: Ctx) => (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {c.assetSizes.length > 0 && (!it.piece || it.piece.parent_natural_mm) && (
          <select className="h-7 rounded border border-slate-300 px-1 text-xs" value=""
            title={it.piece ? t("ไซส์ของภาพเต็ม — ทุกชิ้นของภาพนี้ปรับตามสัดส่วนเดิม", "Size of the whole image — every piece of it is scaled to match") : undefined}
            onChange={(e) => {
              const s = c.assetSizes[Number(e.target.value)];
              if (!s) return;
              if (it.piece) { onLibrarySize?.(it.key, s); return; }
              patch(it.key, { size: s.w ? { mode: "width", value: toMm(s.w, s.unit) } : { mode: "height", value: toMm(s.h ?? 0, s.unit) } });
            }}>
            <option value="">{t("ไซส์จากคลัง…", "Library size…")}</option>
            {c.assetSizes.map((s, k) => (
              <option key={k} value={k}>{s.label || `#${k + 1}`} · {s.w ? `${t("กว้าง", "W")} ${s.w}` : ""}{s.w && s.h ? " × " : ""}{s.h ? `${t("สูง", "H")} ${s.h}` : ""} {s.unit}</option>
            ))}
          </select>
        )}
        <div className="flex overflow-hidden rounded border border-slate-300 text-[11px]">
          {MODES.map((m) => (
            <button key={m} type="button" onClick={() => patch(it.key, { size: switchMode(it, c.info && !c.info.error ? c.info : undefined, m) })}
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
        {c.sz ? `→ ${fmtLen(c.sz.w, u, lang)} × ${fmtLen(c.sz.h, u, lang)} · ${fmt(c.sz.dpi, 0, lang)} dpi` : it.size.mode !== "natural" && !(Number(it.size.value) > 0) ? t("→ ใส่ขนาด", "→ enter a size") : ""}
        {canSaveSize(it, c) && (
          <button type="button" onClick={() => onSaveSize?.(it.key)}
            title={t("เพิ่มขนาดนี้เป็นไซส์ของลายในคลังไฟล์กลาง (งานต่อไปเลือกได้เลย)", "Add this size to the artwork in the central library (pick it next time)")}
            className="ml-2 rounded border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700 hover:bg-violet-100">
            ＋ {t("บันทึกเป็นไซส์ในคลัง", "Save as library size")}
          </button>
        )}
      </div>
    </>
  );
  const qtyCtl = (it: NestingItem, labels: boolean) => (
    <div className={`flex items-center gap-2 text-xs ${labels ? "flex-wrap" : ""}`}>
      {labels && <span className="text-slate-500">{fill ? t("จำนวนเป๊ะ", "Exact qty") : t("จำนวน", "Qty")}</span>}
      <NumInput className="h-7 w-16 rounded border border-slate-300 px-1" value={String(it.qty)} integer
        onChange={(v) => patch(it.key, { qty: Math.max(0, Math.floor(v ?? 0)) })} />
      {fill && (
        <>
          {labels ? <span className="text-slate-500">{t("เติมที่เหลือ", "Fill share")}</span> : <span className="text-slate-400">+</span>}
          <span className="relative" title={it.fill_pin ? t("พิมพ์เอง — คงค่านี้ไว้", "Typed by you — kept as is") : t("ระบบแบ่งที่เหลือให้อัตโนมัติ — พิมพ์เพื่อกำหนดเอง", "Shared out automatically — type to set it yourself")}>
            <NumInput className={`h-7 w-14 rounded border px-1 ${it.fill_pin ? "border-violet-400 font-semibold text-slate-800" : "border-slate-300 text-slate-500"}`}
              value={String(it.fill_pct ?? 0)}
              onChange={(v) => patch(it.key, { fill_pct: Math.min(100, Math.max(0, v ?? 0)), fill_pin: true })} />
          </span>
          <span className="text-slate-400">%</span>
          {it.fill_pin && (
            <button type="button" onClick={() => patch(it.key, { fill_pin: false })}
              title={t("พิมพ์เอง (คงไว้) — กดเพื่อให้ระบบแบ่งให้แทน", "Typed by you (kept) — click to let the system share it out")}
              aria-label={t("เลิกปักหมุด % นี้", "Unpin this %")} className="rounded px-0.5 text-[13px] leading-none hover:bg-violet-50">📌</button>
          )}
        </>
      )}
    </div>
  );
  const lockToggle = (it: NestingItem) => (
    <label className="flex items-center gap-1 text-xs text-slate-600"
      title={t("ล็อก = ห้ามชิ้นอื่นแทรกในช่องว่างของลายนี้ / จำกัดมุมหมุนเฉพาะลายนี้", "Lock = keep other pieces out of this artwork's gaps / limit its rotation")}>
      <input type="checkbox" checked={!!it.lock} onChange={(e) => patch(it.key, { lock: e.target.checked ? { box: true, rotate: "quad" } : null })} />
      🔒 {t("ล็อกลายนี้", "Lock this artwork")}
    </label>
  );
  const lockDetail = (it: NestingItem, compact: boolean) => it.lock && (
    <div className={compact ? "mt-1 space-y-1 text-[11px]" : "mt-1 space-y-1 rounded-md bg-slate-50 px-2 py-1.5 text-xs"}>
      <label className="flex items-center gap-1 text-slate-700">
        <input type="checkbox" checked={it.lock.box} onChange={(e) => patch(it.key, { lock: { ...it.lock!, box: e.target.checked } })} />
        {compact ? t("ห้ามแทรกช่องว่าง", "Keep gaps clear") : t("ห้ามชิ้นอื่นเข้ามาในช่องว่าง (จองเป็นกรอบสี่เหลี่ยม)", "Keep other pieces out of the gaps (reserve a rectangle)")}
      </label>
      {compact ? (
        <select className="h-6 w-full rounded border border-slate-300 px-1" value={it.lock.rotate} aria-label={t("การหมุน", "Rotation")}
          onChange={(e) => patch(it.key, { lock: { ...it.lock!, rotate: e.target.value as RotateLock } })}>
          {ROTATES.map((r) => <option key={r} value={r}>{t("หมุน: ", "Rotate: ")}{rotateLabel(r)}</option>)}
        </select>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-slate-500">{t("การหมุน", "Rotation")}</span>
          {ROTATES.map((r) => (
            <button key={r} type="button" onClick={() => patch(it.key, { lock: { ...it.lock!, rotate: r } })}
              className={`rounded border px-1.5 py-0.5 text-[11px] ${it.lock!.rotate === r ? "border-violet-400 bg-violet-100 font-semibold text-violet-700" : "border-slate-300 bg-white text-slate-600"}`}>
              {rotateLabel(r)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
  const rowsBtn = (it: NestingItem) => settings.layout !== "rows" && (
    <button type="button" onClick={() => patch(it.key, { rows: !it.rows })}
      title={t("เรียงลายนี้เป็นแถวตรงแนวที่ต้นแผ่น (ทั้งลายหันทางเดียว · หมุน 90° ได้ถ้าได้มากกว่า) ลายอื่นแทรกที่ว่างที่เหลือ — ตัดง่าย",
        "Lay this artwork out in straight rows at the start of the sheet (all facing one way · turned 90° if more fit); other artwork fills the rest — easy to cut")}
      className={`rounded border px-2 py-0.5 text-xs ${it.rows ? "border-violet-400 bg-violet-100 font-semibold text-violet-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
      ▤ {t("เรียงเป็นแถว", "Rows")}
    </button>
  );
  const splitBtn = (it: NestingItem, c: Ctx) => !it.piece && it.file && !c.miss && c.info && !c.info.error && (
    <button type="button" onClick={() => onSplit(it.key)} disabled={!canSplit || busy}
      title={canSplit ? t("ภาพเดียวมีหลายส่วน (เช่น ช้าง + ตัวหนังสือ) → แยกเป็นหลายชิ้น", "One image with several parts (e.g. elephant + text) → split into pieces")
        : t("ต้องอัปเดตตัวช่วยเป็น v1.3.0 ก่อน (คลิกขวาไอคอนกรรไกร → ตรวจหาเวอร์ชันใหม่)", "Update the helper to v1.3.0 first (right-click the scissors icon → Check for updates)")}
      className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">
      ✂️ {t("แยกชิ้น", "Split pieces")}
    </button>
  );
  const pieceInfo = (it: NestingItem) => it.piece && (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
        ✂️ {t(`ชิ้น ${it.piece.index + 1}/${it.piece.count} ของ ${it.piece.parent.title}`, `Piece ${it.piece.index + 1}/${it.piece.count} of ${it.piece.parent.title}`)}
      </span>
      <button type="button" onClick={() => onMergeBack(it.key)} disabled={busy} className="text-slate-500 underline disabled:opacity-50">
        {t("รวมกลับเป็นภาพเดียว", "Merge back into one image")}
      </button>
    </div>
  );
  const statusBlock = (it: NestingItem, c: Ctx) => (
    <>
      <div className="flex flex-wrap gap-1">
        {chips(it, c.info).map((x, k) => <span key={k} title={x.title} className={`rounded px-1.5 py-0.5 text-[11px] ${x.cls}`}>{x.text}</span>)}
      </div>
      {resultByKey[it.key] && <div className="mt-1 text-[11px] font-medium text-emerald-700">{resultByKey[it.key]}</div>}
    </>
  );
  const actionBtns = (it: NestingItem) => (
    <>
      <button type="button" title={t("คัดลอก — ลายเดียวกันอีกขนาด/อีกจำนวน", "Duplicate — the same artwork at another size or quantity")}
        onClick={() => { const i = items.indexOf(it); onChange([...items.slice(0, i + 1), { ...it, key: newKey(), piece: null }, ...items.slice(i + 1)]); }}
        className="rounded px-1.5 text-xs text-slate-500 hover:bg-slate-100">⧉</button>
      <button type="button" title={t("เอาลายนี้ออก", "Remove this artwork")} aria-label={t("เอาลายนี้ออก", "Remove this artwork")}
        onClick={() => onChange(items.filter((x) => x.key !== it.key))}
        className="rounded px-1.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600">✕</button>
    </>
  );
  const frame = (it: NestingItem, c: Ctx) =>
    drop.over === it.key ? "border-violet-400 ring-2 ring-violet-200" : !it.file || c.miss ? "border-amber-300" : "border-slate-200";

  // ---------------------------------------------------------------- ตารางใหญ่ (หน้าต่างขยาย)
  const q = search.trim().toLowerCase();
  const shown = q ? items.filter((it) => `${it.title} ${it.file?.name ?? ""}`.toLowerCase().includes(q)) : items;
  const table = (
    <div className="mt-3 overflow-x-auto">
      <div className="min-w-[1300px]">
        <div className="grid items-center gap-2 border-b border-slate-200 px-2 pb-1.5 text-[11px] font-medium text-slate-500" style={{ gridTemplateColumns: TABLE_COLS(fill) }}>
          <span />
          <span />
          <span>{t("ลาย / ไฟล์พิมพ์", "Artwork / print file")}</span>
          <span>{t("ขนาด", "Size")}</span>
          <span>{fill ? t("จำนวนเป๊ะ + เติม %", "Exact + fill %") : t("จำนวน", "Qty")}</span>
          <span>{t("ล็อก", "Lock")}</span>
          <span>{t("แถว / แยกชิ้น", "Rows / split")}</span>
          <span>{t("สถานะ", "Status")}</span>
          <span />
        </div>
        {shown.map((it) => {
          const c = ctx(it);
          const i = items.indexOf(it);
          return (
            <div key={it.key} {...drop.zone(it.key)} {...(q ? {} : drag.rowProps(i))}
              className={`mt-1.5 grid items-start gap-2 rounded-lg border bg-white px-2 py-2 ${frame(it, c)} ${q ? "" : drag.rowCls(i)}`}
              style={{ gridTemplateColumns: TABLE_COLS(fill) }}>
              <span className="pt-3">{!q && <DragHandle {...drag.handleProps(i)} title={t("ลากเพื่อสลับลำดับ", "Drag to reorder")} />}</span>
              {thumb(it, c)}
              <div className="min-w-0 space-y-1">{titleBlock(it, c)}{fileLine(it, c)}</div>
              <div>{sizeCtl(it, c)}</div>
              <div className="pt-0.5">{qtyCtl(it, false)}</div>
              <div>{lockToggle(it)}{lockDetail(it, true)}</div>
              <div className="flex flex-col items-start gap-1">{rowsBtn(it)}{splitBtn(it, c)}{pieceInfo(it)}</div>
              <div className="min-w-0">{statusBlock(it, c)}</div>
              <div className="flex justify-end">{actionBtns(it)}</div>
            </div>
          );
        })}
        {q && !shown.length && <div className="py-6 text-center text-sm text-slate-400">{t(`ไม่พบลายที่ตรงกับ “${search}”`, `No artwork matches “${search}”`)}</div>}
      </div>
    </div>
  );

  // ---------------------------------------------------------------- การ์ด (แถบซ้าย)
  const cards = (
    <div className="mt-3 space-y-2">
      {items.map((it) => {
        const c = ctx(it);
        return (
          <div key={it.key} {...drop.zone(it.key)} className={`rounded-lg border bg-white p-2.5 ${frame(it, c)}`}>
            <div className="flex items-start gap-2">
              {thumb(it, c)}
              <div className="min-w-0 flex-1">{titleBlock(it, c)}</div>
              {actionBtns(it)}
            </div>
            <div className="mt-1.5">{fileLine(it, c)}</div>
            <div className="mt-2">{sizeCtl(it, c)}</div>
            <div className="mt-1.5">{qtyCtl(it, true)}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">{lockToggle(it)}{rowsBtn(it)}{splitBtn(it, c)}</div>
            {lockDetail(it, false)}
            {it.piece && <div className="mt-1.5">{pieceInfo(it)}</div>}
            <div className="mt-1.5">{statusBlock(it, c)}</div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div {...drop.guard}>
      <input ref={fileInput} type="file" accept="image/png" multiple hidden
        onChange={(e) => {
          const files = pngs(Array.from(e.target.files ?? []));
          e.target.value = "";
          if (!files.length) return;
          if (target.current) onAttach(target.current, files[0]); else onAddFiles(files);
        }} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onPickLibrary} disabled={busy}
          className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm text-violet-700 hover:bg-violet-100 disabled:opacity-50">
          🖼 {t("เลือกลายจากคลัง Artwork", "Pick artwork from library")}
        </button>
        {variant === "table" && (
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("ค้นหาลาย / ชื่อไฟล์…", "Search artwork / file name…")}
            className="ml-auto h-9 w-64 rounded-lg border border-slate-300 px-3 text-sm" />
        )}
      </div>
      <div {...drop.zone("new")} onClick={() => browse(null)}
        className={`mt-2 cursor-pointer rounded-lg border-2 border-dashed px-3 py-3 text-center text-sm ${drop.over === "new" ? "border-violet-400 bg-violet-50" : "border-slate-300 text-slate-500 hover:border-slate-400"}`}>
        ⬆ {t("ลากไฟล์ PNG มาวางเพื่อเพิ่มลาย หรือกดเลือก", "Drop PNG files here to add, or click to browse")}
      </div>

      {variant === "table" ? table : cards}

      {fill && items.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className={`rounded px-2 py-0.5 ${Math.abs(totalPct - 100) < 0.01 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {Math.abs(totalPct - 100) < 0.01 ? t("รวม 100%", "Total 100%") : t(`รวม ${totalPct}% — ต้องรวมได้ 100%`, `Total ${totalPct}% — must add up to 100%`)}
          </span>
          <button type="button" onClick={evenSplit} className="rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50">
            {t("แบ่งเท่ากัน", "Split evenly")}
          </button>
          <span className="text-[11px] text-slate-400">{t("พิมพ์ % ลายไหน = 📌 คงไว้ · ลายอื่นแบ่งที่เหลือให้เอง", "Type a % on any artwork = 📌 kept · the others share the rest automatically")}</span>
        </div>
      )}
    </div>
  );
}
