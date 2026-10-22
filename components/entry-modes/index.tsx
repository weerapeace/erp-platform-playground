"use client";
/**
 * 📝 โหมดลงรายละเอียด (ของกลาง) — ใช้ใน drawer กลาง MasterCRUD ทุกโมดูล · กฎ/ชุดตั้งต้นอยู่ที่ lib/entry-modes
 *   <EntryModeMenu>     ปุ่มแถบบนของป๊อป + รายการโหมด (บอกว่าลงแล้วกี่ช่องของรายการนี้)
 *   <EntryModePanel>    หน้าจอในโหมด (แบบ C): แถบบาง + ฟอร์ม 2 คอลัมน์ ไฮไลต์ช่องที่ขาด + คำแนะนำในช่องว่าง/ⓘ
 *   <EntryModeSettings> ตั้งค่าโหมด — แยกไฟล์ ./settings (โหลดเฉพาะตอนแอดมินเปิด)
 * ช่องกรอกจริง = ของ drawer กลาง (ผู้เรียกส่ง renderInput) → ชนิดช่อง/ตัวเลือกพิเศษเหมือนหน้าแก้ไขทุกอย่าง
 * docs/entry-modes.md
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { tr } from "@/lib/lang";
import { apiFetch } from "@/lib/api";
import { IMAGES_KEY, type EntryMode, type EntryModeLevel, type EntryModeProgress, type EntryModeStat } from "@/lib/entry-modes";

/** โหลดสรุปทั้งระบบของโมดูล (ใช้ทั้งปุ่มหัวตารางและหน้าจอโหมดในป๊อป) */
export async function fetchEntryModeStats(moduleKey: string): Promise<EntryModeStat[]> {
  const r = await apiFetch(`/api/entry-modes/stats?module=${encodeURIComponent(moduleKey)}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({})) as { modes?: EntryModeStat[]; error?: string | null };
  if (!r.ok || j.error) throw new Error(j.error || tr(`นับไม่สำเร็จ (${r.status})`, `Couldn't count (${r.status})`));
  return j.modes ?? [];
}

export type EntryModeField = { key: string; label: string; type?: string; helpText?: string };

const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/** จำโหมดล่าสุดที่ใช้ต่อโมดูล (ต่อเครื่อง) — ใช้ทำป้าย "ขาด N" บนปุ่มตอนยังไม่เข้าโหมด */
export function lastEntryMode(moduleKey: string): string | null { return lsGet(`entry-mode:last:${moduleKey}`); }
export function rememberEntryMode(moduleKey: string, key: string) { lsSet(`entry-mode:last:${moduleKey}`, key); }

const pctTone = (p: number) => (p >= 100 ? "emerald" : p >= 50 ? "amber" : "rose");
const BAR: Record<string, string> = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500" };

function CountChip({ p }: { p: EntryModeProgress }) {
  const reqMissing = p.reqTotal - p.reqDone;
  const cls = p.done >= p.total ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : reqMissing > 0 ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200";
  return <span className={`text-[11px] px-1.5 py-0.5 rounded-full border tabular-nums ${cls}`}>{p.done}/{p.total}</span>;
}


// "ซ่อนช่องที่ลงแล้ว" — จำต่อเครื่อง + ใช้ร่วมกันระหว่างเมนูโหมดกับหน้าจอโหมด (ติ๊กที่เมนู หน้าจอเปลี่ยนตามทันที)
const HIDE_KEY = "entry-mode:hide-done";
const HIDE_EVT = "entry-mode:hide-done";
function useHideDone(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => lsGet(HIDE_KEY) === "1");
  useEffect(() => {
    const on = () => setV(lsGet(HIDE_KEY) === "1");
    window.addEventListener(HIDE_EVT, on);
    return () => window.removeEventListener(HIDE_EVT, on);
  }, []);
  const set = (nv: boolean) => { lsSet(HIDE_KEY, nv ? "1" : "0"); setV(nv); window.dispatchEvent(new Event(HIDE_EVT)); };
  return [v, set];
}

// ───────────────────────── ปุ่ม + รายการโหมด ─────────────────────────
// แบบ C (เจ้าของเลือก 2026-10-22): ตัวเลขความครบอยู่บนปุ่ม · ทั้งระบบ/ซ่อนที่ลงแล้ว/ออกจากโหมด อยู่ในเมนูของปุ่ม
export function EntryModeMenu({
  modes, progressOf, activeKey, badgeKey, onPick, onExit, onSettings, systemStat, onShowList,
}: {
  modes: EntryMode[];
  progressOf: (m: EntryMode) => EntryModeProgress;
  activeKey: string | null;
  /** โหมดที่ใช้ทำป้าย "ขาด N" บนปุ่มตอนยังไม่เข้าโหมด */
  badgeKey?: string | null;
  onPick: (key: string) => void;
  onExit: () => void;
  /** แอดมิน: เปิดหน้าตั้งค่าโหมด */
  onSettings?: () => void;
  /** ทั้งระบบของโหมดที่เปิดอยู่ (เฉพาะที่เปิดใช้อยู่) — undefined = ไม่โชว์ · null = กำลังนับ */
  systemStat?: EntryModeStat | null;
  /** ไปดูรายการที่ยังไม่ครบโหมดนี้ในตาราง (ไม่ส่ง = ไม่มีลิงก์) */
  onShowList?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hideDone, setHideDone] = useHideDone();
  const active = modes.find((m) => m.key === activeKey) ?? null;
  const badgeMode = active ?? modes.find((m) => m.key === badgeKey) ?? modes[0] ?? null;
  const bp = badgeMode ? progressOf(badgeMode) : null;
  const reqMissing = bp ? bp.reqTotal - bp.reqDone : 0;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        title={tr("โชว์เฉพาะช่องที่ต้องลงสำหรับงานนั้น + เตือนช่องที่ยังไม่ลง + คำแนะนำต่อช่อง", "Show only the fields a job needs + flag missing ones + per-field tips")}
        className={`h-8 px-3 text-[12.5px] font-medium rounded-lg border inline-flex items-center gap-1.5 ${active
          ? "border-blue-400 bg-blue-600 text-white hover:bg-blue-700"
          : "border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"}`}>
        {active ? <>
          {active.icon || "📝"} {active.label}
          {bp && bp.total > 0 && <span className="tabular-nums opacity-90">· {bp.reqTotal ? `${bp.reqDone}/${bp.reqTotal}` : `${bp.done}/${bp.total}`}{bp.done >= bp.total ? " ✓" : ""}</span>}
        </> : <>
          📝 {tr("โหมดลงรายละเอียด", "Entry mode")}
          {bp && bp.total > 0 && (reqMissing > 0
            ? <span className="text-[10.5px] px-1.5 rounded-full bg-rose-100 text-rose-700">{tr(`ขาด ${reqMissing}`, `${reqMissing} missing`)}</span>
            : bp.done >= bp.total ? <span className="text-[10.5px] px-1.5 rounded-full bg-emerald-100 text-emerald-700">✓ {tr("ครบ", "done")}</span> : null)}
        </>}
        <span className="text-[10px] opacity-70">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-[71] w-80 rounded-lg border border-slate-200 bg-white shadow-xl p-1.5">
            {active && (
              <div className="px-2 pt-1 pb-2 mb-1 border-b border-slate-100 space-y-1.5">
                {systemStat !== undefined && (
                  <div className="text-xs text-slate-600 leading-relaxed">
                    🗂 {tr("ทั้งระบบ", "All records")}:{" "}
                    {systemStat === null ? <span className="text-slate-400">{tr("กำลังนับ…", "counting…")}</span>
                      : systemStat.incomplete === 0 ? <b className="text-emerald-700">{tr(`ครบทุกตัว (${systemStat.total.toLocaleString()})`, `all ${systemStat.total.toLocaleString()} complete`)}</b>
                      : <>{tr("ยังขาดช่องที่ต้องมี", "missing required")} <b className="text-rose-700 tabular-nums">{systemStat.incomplete.toLocaleString()}</b> {tr(`จาก ${systemStat.total.toLocaleString()} ตัว`, `of ${systemStat.total.toLocaleString()}`)}</>}
                    {systemStat && systemStat.recOnly > 0 && <span className="text-slate-400"> {tr(`· ขาดแค่ช่องแนะนำ ${systemStat.recOnly.toLocaleString()}`, `· ${systemStat.recOnly.toLocaleString()} only recommended`)}</span>}
                    {onShowList && systemStat && systemStat.incomplete > 0 && (
                      <button type="button" onClick={() => { setOpen(false); onShowList(); }} className="block text-blue-700 hover:underline">{tr("ดูรายการที่ยังไม่ครบในตาราง ↗", "Show incomplete ones in the table ↗")}</button>
                    )}
                  </div>
                )}
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="rounded border-slate-300" />
                  {tr("ซ่อนช่องที่ลงแล้ว (เหลือแต่ที่ต้องทำ)", "Hide filled fields (show only what's left)")}
                </label>
              </div>
            )}
            <div className="px-2 pt-0.5 pb-1 text-[11px] text-slate-400">{tr("เลือกโหมด — ตัวเลข = ลงแล้วกี่ช่องของรายการนี้", "Pick a mode — numbers = fields filled on this record")}</div>
            {modes.length === 0 && <div className="px-2 py-3 text-xs text-slate-400">{tr("ยังไม่มีโหมดของหน้านี้", "No modes yet for this page")}</div>}
            {modes.map((m) => (
              <button key={m.key} type="button" onClick={() => { setOpen(false); onPick(m.key); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm ${m.key === activeKey ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}>
                <span className="w-5 text-center">{m.icon || "📝"}</span>
                <span className="flex-1 min-w-0 truncate">{m.label}</span>
                <CountChip p={progressOf(m)} />
              </button>
            ))}
            {(active || onSettings) && <div className="border-t border-slate-100 mt-1 pt-1">
              {active && (
                <button type="button" onClick={() => { setOpen(false); onExit(); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm text-slate-600 hover:bg-slate-50">
                  <span className="w-5 text-center">✕</span>{tr("ออกจากโหมด (กลับหน้าปกติ)", "Exit mode (back to normal view)")}
                </button>
              )}
              {onSettings && (
                <button type="button" onClick={() => { setOpen(false); onSettings(); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm text-slate-500 hover:bg-slate-50">
                  <span className="w-5 text-center">⚙</span>{tr("ตั้งค่าโหมด / เพิ่มโหมดใหม่", "Mode settings / add a mode")}
                </button>
              )}
            </div>}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────── หน้าจอในโหมด ─────────────────────────
// แบบ C: แถบบางบรรทัดเดียว (ความครบ + ช่องที่ขาด กดกระโดดไป) · ช่องจัดเป็นฟอร์ม 2 คอลัมน์เหมือนหน้าแก้ไข
//   ช่องที่ขาด = กรอบแดง (ต้องมี) / เหลือง (แนะนำ) · ลงแล้ว = ✓ · คำแนะนำอยู่ในช่องว่าง + ⓘ (ชี้/แตะดูเต็ม)
export function EntryModePanel({
  mode, progress, fields, renderInput, imageCount, translatable, onTranslate, onExit, onNextIncomplete, scanning,
}: {
  mode: EntryMode;
  progress: EntryModeProgress;
  /** นิยามช่องตาม field_key (ชื่อ/ชนิด/คำอธิบายจากทะเบียน) */
  fields: Record<string, EntryModeField>;
  /** ช่องกรอกจริงของ drawer กลาง (ไม่มีหัวข้อ) · hint = ใส่เป็นข้อความในช่องว่าง (placeholder) */
  renderInput: (fieldKey: string, hint?: string) => ReactNode;
  imageCount: number | null;
  translatable?: (fieldKey: string) => boolean;
  onTranslate?: (fieldKey: string) => Promise<void>;
  onExit: () => void;
  /** ไปรายการถัดไปที่ยังไม่ครบ (ไม่ส่ง = ไม่มีปุ่ม) */
  onNextIncomplete?: () => void;
  scanning?: boolean;
}) {
  const [hideDone] = useHideDone();
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState<string | null>(null);
  // ช่องที่ผู้ใช้แตะแล้วในรายการนี้ — ยังโชว์อยู่แม้ "ซ่อนช่องที่ลงแล้ว" (ไม่งั้นพิมพ์ตัวแรกแล้วช่องหายกลางคัน)
  //   ผู้เรียกใส่ key ตามรายการ → เลื่อนไปรายการอื่นแล้วเริ่มนับใหม่
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const missingSet = useMemo(() => new Set(progress.missing.map((m) => m.key)), [progress.missing]);
  const touch = (key: string) => setTouched((s) => (s.has(key) ? s : new Set(s).add(key)));

  // ลำดับช่อง: ต้องมี (+ รูป) ก่อน แล้วค่อยแนะนำ — ตามลำดับที่ตั้งในโหมด · เฉพาะช่องที่นับจริง
  const rows = useMemo(() => {
    const out: { key: string; level: EntryModeLevel; hint?: string }[] = [];
    const add = (lv: EntryModeLevel) => {
      for (const it of mode.items) if (it.level === lv && progress.counted.has(it.field)) out.push({ key: it.field, level: lv, hint: it.hint });
      if ((mode.imagesLevel ?? "required") === lv && progress.counted.has(IMAGES_KEY)) out.push({ key: IMAGES_KEY, level: lv, hint: mode.imagesHint });
    };
    add("required"); add("recommended");
    return out;
  }, [mode, progress.counted]);

  const jump = (key: string) => {
    const el = rowRefs.current[key];
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashKey(key);
    window.setTimeout(() => setFlashKey((k) => (k === key ? null : k)), 1400);
    const input = el.querySelector<HTMLElement>("input:not([type=checkbox]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button[role=combobox]");
    window.setTimeout(() => input?.focus({ preventScroll: true }), 250);
  };
  const labelOf = (key: string) => key === IMAGES_KEY
    ? tr(`รูปสินค้า (อย่างน้อย ${mode.imagesMin} รูป)`, `Product images (at least ${mode.imagesMin})`)
    : fields[key]?.label ?? key;
  const tone = pctTone(progress.pct);
  const missingRows = rows.filter((r) => missingSet.has(r.key));   // เรียงเหมือนช่อง (ต้องมีก่อน แนะนำทีหลัง)
  const visibleRows = hideDone ? rows.filter((r) => missingSet.has(r.key) || touched.has(r.key)) : rows;
  const wide = (key: string) => key === IMAGES_KEY || ["textarea", "json", "many2many"].includes(fields[key]?.type ?? "");
  const SHOW_MISSING = 4;

  return (
    <div className="space-y-3">
      {/* แถบบาง: ความครบ · ช่องที่ขาด (กดไปที่ช่อง) · ตัวถัดไปที่ยังไม่ครบ · ออก */}
      <div className="flex items-center gap-2 text-xs text-slate-500 min-h-7 flex-wrap">
        <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0" title={`${progress.pct}%`}><div className={`h-full ${BAR[tone]} transition-all`} style={{ width: `${progress.pct}%` }} /></div>
        <span className="tabular-nums whitespace-nowrap">
          {tr("ต้องมี", "Required")} <b className="text-slate-700">{progress.reqDone}/{progress.reqTotal}</b>
          {progress.recTotal > 0 && <> · {tr("แนะนำ", "Rec.")} <b className="text-slate-700">{progress.recDone}/{progress.recTotal}</b></>}
        </span>
        {missingRows.length === 0
          ? <span className="font-medium text-emerald-700">🎉 {tr("ครบทุกช่องแล้ว", "All filled")}</span>
          : <span className="min-w-0 flex-1 truncate">
              <span className="text-slate-400">{tr("ขาด:", "Missing:")} </span>
              {missingRows.slice(0, SHOW_MISSING).map((m, i) => (
                <span key={m.key}>{i > 0 && <span className="text-slate-300"> · </span>}
                  <button type="button" onClick={() => jump(m.key)} title={tr("กดเพื่อไปที่ช่องนี้", "Go to this field")}
                    className={`hover:underline ${m.level === "required" ? "text-rose-600" : "text-amber-700"}`}>{labelOf(m.key)}</button>
                </span>
              ))}
              {missingRows.length > SHOW_MISSING && <span className="text-slate-400"> {tr(`+อีก ${missingRows.length - SHOW_MISSING}`, `+${missingRows.length - SHOW_MISSING} more`)}</span>}
            </span>}
        {imageCount == null && (mode.imagesMin ?? 0) > 0 && <span className="text-slate-400">{tr("กำลังนับรูป…", "counting images…")}</span>}
        {onNextIncomplete && (
          <button type="button" onClick={onNextIncomplete} disabled={scanning}
            title={tr("ข้ามไปรายการถัดไปในรายการนี้ที่ยังลงไม่ครบ", "Jump to the next record in this list that's still incomplete")}
            className="ml-auto h-7 px-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap">
            {scanning ? tr("กำลังหา…", "Searching…") : tr("ถัดไปที่ยังไม่ครบ ▶", "Next incomplete ▶")}
          </button>
        )}
        <button type="button" onClick={onExit} title={tr("ออกจากโหมด (กลับหน้าปกติ)", "Exit mode")}
          className={`${onNextIncomplete ? "" : "ml-auto "}h-7 w-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100`}>✕</button>
      </div>

      {rows.length === 0 && (
        <div className="text-sm text-slate-400 py-6 text-center">{tr("โหมดนี้ไม่มีช่องที่ใช้กับรายการนี้", "This mode has no fields that apply to this record")}</div>
      )}
      {visibleRows.length === 0 && rows.length > 0 && (
        <div className="text-sm text-emerald-600 py-6 text-center">🎉 {tr("ลงครบแล้ว — ไม่มีช่องที่ต้องทำ", "All done — nothing left to fill")}</div>
      )}
      {/* grid-flow-row-dense: ช่องเต็มแถว (คำอธิบาย/รูป) ไม่ทิ้งช่องว่าง — ช่องเล็กถัดไปขึ้นมาเติม */}
      <div className="grid grid-cols-1 md:grid-cols-2 grid-flow-row-dense gap-x-3 gap-y-1">
        {visibleRows.map((r) => {
          const done = !missingSet.has(r.key);
          const hint = r.hint || fields[r.key]?.helpText;
          const tone2 = done ? "" : r.level === "required" ? "bg-rose-50/70 ring-1 ring-rose-200" : "bg-amber-50/60 ring-1 ring-amber-200";
          return (
            <div key={r.key} ref={(el) => { rowRefs.current[r.key] = el; }} onFocusCapture={() => touch(r.key)} onPointerDownCapture={() => touch(r.key)}
              className={`rounded-lg px-2 py-1.5 transition-shadow ${wide(r.key) ? "md:col-span-2" : ""} ${tone2} ${flashKey === r.key ? "ring-2 ring-rose-400" : ""}`}>
              <div className="flex items-center gap-1 text-[11.5px] mb-0.5 min-w-0">
                <span className="font-medium text-slate-600 truncate">{labelOf(r.key)}</span>
                {r.level === "required" ? (!done && <span className="text-rose-500" title={tr("ต้องมี", "Required")}>*</span>)
                  : <span className="text-slate-400 whitespace-nowrap">({tr("แนะนำ", "rec.")})</span>}
                {done && <span className="text-emerald-600" title={tr("ลงแล้ว", "Filled")}>✓</span>}
                <span className="flex-1" />
                {translatable?.(r.key) && onTranslate && (
                  <button type="button" disabled={busyKey === r.key}
                    onClick={async () => { setBusyKey(r.key); try { await onTranslate(r.key); } finally { setBusyKey(null); } }}
                    className="text-[11px] text-indigo-600 hover:underline disabled:opacity-50 whitespace-nowrap">
                    {busyKey === r.key ? tr("กำลังแปล…", "Translating…") : `🌐 ${tr("แปลจากไทย", "Translate")}`}
                  </button>
                )}
                {hint && (
                  <button type="button" title={hint} onClick={() => setHintOpen((k) => (k === r.key ? null : r.key))}
                    className={`w-4 h-4 leading-4 text-center rounded-full text-[10px] ${hintOpen === r.key ? "bg-blue-100 text-blue-700" : "text-slate-400 hover:text-blue-600"}`}>ⓘ</button>
                )}
              </div>
              {hint && hintOpen === r.key && <div className="text-[11px] text-slate-500 mb-1 leading-relaxed">💡 {hint}</div>}
              {r.key === IMAGES_KEY ? (
                <div className={`text-xs ${done ? "text-slate-600" : "text-rose-600"}`}>
                  {imageCount == null ? tr("กำลังนับรูป…", "Counting images…") : tr(`มี ${imageCount} จาก ${mode.imagesMin} รูป`, `${imageCount} of ${mode.imagesMin} images`)}
                  {!done && <span className="text-slate-400"> · {tr("เพิ่ม/ลากรูปที่ช่อง \"รูปสินค้า\"", "add or drop images in the \"Product images\" box")}</span>}
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-x-3">{renderInput(r.key, hint)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
