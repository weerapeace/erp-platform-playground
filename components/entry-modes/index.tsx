"use client";
/**
 * 📝 โหมดลงรายละเอียด (ของกลาง) — ใช้ใน drawer กลาง MasterCRUD ทุกโมดูล · กฎ/ชุดตั้งต้นอยู่ที่ lib/entry-modes
 *   <EntryModeMenu>     ปุ่มแถบบนของป๊อป + รายการโหมด (บอกว่าลงแล้วกี่ช่องของรายการนี้)
 *   <EntryModePanel>    หน้าจอในโหมด: โชว์เฉพาะช่องของโหมด + แถบความครบ + ป้ายช่องที่ขาด (กดกระโดดไป) + คำแนะนำ
 *   <EntryModeSettings> ตั้งค่าโหมด — แยกไฟล์ ./settings (โหลดเฉพาะตอนแอดมินเปิด)
 * ช่องกรอกจริง = ของ drawer กลาง (ผู้เรียกส่ง renderInput) → ชนิดช่อง/ตัวเลือกพิเศษเหมือนหน้าแก้ไขทุกอย่าง
 * docs/entry-modes.md
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
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

// ───────────────────────── ปุ่ม + รายการโหมด ─────────────────────────
export function EntryModeMenu({
  modes, progressOf, activeKey, badgeKey, onPick, onExit, onSettings,
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
}) {
  const [open, setOpen] = useState(false);
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
        📝 {active ? `${active.icon ? `${active.icon} ` : ""}${active.label}` : tr("โหมดลงรายละเอียด", "Entry mode")}
        {bp && bp.total > 0 && (reqMissing > 0
          ? <span className={`text-[10.5px] px-1.5 rounded-full ${active ? "bg-white/25" : "bg-rose-100 text-rose-700"}`}>{tr(`ขาด ${reqMissing}`, `${reqMissing} missing`)}</span>
          : bp.done >= bp.total ? <span className={`text-[10.5px] px-1.5 rounded-full ${active ? "bg-white/25" : "bg-emerald-100 text-emerald-700"}`}>✓ {tr("ครบ", "done")}</span> : null)}
        <span className="text-[10px] opacity-70">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-[71] w-72 rounded-lg border border-slate-200 bg-white shadow-xl p-1.5">
            <div className="px-2 pt-1 pb-1.5 text-[11px] text-slate-400">{tr("เลือกโหมด — ตัวเลข = ลงแล้วกี่ช่องของรายการนี้", "Pick a mode — numbers = fields filled on this record")}</div>
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
export function EntryModePanel({
  mode, progress, fields, renderInput, imageCount, translatable, onTranslate, onExit, onNextIncomplete, scanning, systemStat, onShowList,
}: {
  mode: EntryMode;
  progress: EntryModeProgress;
  /** นิยามช่องตาม field_key (ชื่อ/คำอธิบายจากทะเบียน) */
  fields: Record<string, EntryModeField>;
  /** ช่องกรอกจริงของ drawer กลาง (ไม่มีหัวข้อ) */
  renderInput: (fieldKey: string) => ReactNode;
  imageCount: number | null;
  translatable?: (fieldKey: string) => boolean;
  onTranslate?: (fieldKey: string) => Promise<void>;
  onExit: () => void;
  /** ไปรายการถัดไปที่ยังไม่ครบ (ไม่ส่ง = ไม่มีปุ่ม) */
  onNextIncomplete?: () => void;
  scanning?: boolean;
  /** ทั้งระบบ (เฉพาะที่เปิดใช้อยู่) — undefined = ไม่โชว์ · null = กำลังนับ */
  systemStat?: EntryModeStat | null;
  /** ไปดูรายการที่ยังไม่ครบโหมดนี้ในตาราง (ไม่ส่ง = ไม่มีลิงก์) */
  onShowList?: () => void;
}) {
  const [hideDone, setHideDone] = useState(() => lsGet("entry-mode:hide-done") === "1");
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // ช่องที่ผู้ใช้แตะแล้วในรายการนี้ — ยังโชว์อยู่แม้ "ซ่อนช่องที่ลงแล้ว" (ไม่งั้นพิมพ์ตัวแรกแล้วช่องหายกลางคัน)
  //   ผู้เรียกใส่ key ตามรายการ → เลื่อนไปรายการอื่นแล้วเริ่มนับใหม่
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const missingSet = useMemo(() => new Set(progress.missing.map((m) => m.key)), [progress.missing]);
  const touch = (key: string) => setTouched((s) => (s.has(key) ? s : new Set(s).add(key)));

  // ลำดับแถว: ต้องมี (+ รูป) ก่อน แล้วค่อยแนะนำ — ตามลำดับที่ตั้งในโหมด · เฉพาะช่องที่นับจริง
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
  const allDone = progress.missing.length === 0;
  const missingRows = rows.filter((r) => missingSet.has(r.key));   // ป้ายที่ขาด เรียงเหมือนแถว (ต้องมีก่อน แนะนำทีหลัง)
  const visibleRows = hideDone ? rows.filter((r) => missingSet.has(r.key) || touched.has(r.key)) : rows;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-800">{mode.icon || "📝"} {tr("โหมด", "Mode")}: {mode.label}</span>
          <span className="flex-1" />
          {onNextIncomplete && (
            <button type="button" onClick={onNextIncomplete} disabled={scanning}
              title={tr("ข้ามไปรายการถัดไปในรายการนี้ที่ยังลงไม่ครบ", "Jump to the next record in this list that's still incomplete")}
              className="h-7 px-2.5 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {scanning ? tr("กำลังหา…", "Searching…") : tr("ตัวถัดไปที่ยังไม่ครบ ▶", "Next incomplete ▶")}
            </button>
          )}
          <button type="button" onClick={onExit}
            className="h-7 px-2.5 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">✕ {tr("ออกจากโหมด", "Exit mode")}</button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-white border border-slate-200 overflow-hidden"><div className={`h-full ${BAR[tone]} transition-all`} style={{ width: `${progress.pct}%` }} /></div>
          <span className="text-xs font-bold tabular-nums text-slate-700">{progress.pct}%</span>
        </div>
        <div className="text-xs text-slate-500">
          {tr("ต้องมี", "Required")} <b className="text-slate-800 tabular-nums">{progress.reqDone}/{progress.reqTotal}</b>
          {progress.recTotal > 0 && <> · {tr("แนะนำ", "Recommended")} <b className="text-slate-800 tabular-nums">{progress.recDone}/{progress.recTotal}</b></>}
          {imageCount == null && (mode.imagesMin ?? 0) > 0 && <span className="text-slate-400"> · {tr("กำลังนับรูป…", "counting images…")}</span>}
        </div>
        {systemStat !== undefined && (
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500 border-t border-blue-100 pt-2">
            <span>🗂 {tr("ทั้งระบบ:", "All records:")}</span>
            {systemStat === null ? <span className="text-slate-400">{tr("กำลังนับ…", "counting…")}</span>
              : systemStat.incomplete === 0 ? <b className="text-emerald-700">{tr(`ครบทุกตัว (${systemStat.total.toLocaleString()})`, `all ${systemStat.total.toLocaleString()} complete`)}</b>
              : <span>{tr("ยังขาดช่องที่ต้องมี", "missing required")} <b className="text-rose-700 tabular-nums">{systemStat.incomplete.toLocaleString()}</b> {tr(`จาก ${systemStat.total.toLocaleString()} ตัว`, `of ${systemStat.total.toLocaleString()}`)}</span>}
            {systemStat && systemStat.recOnly > 0 && <span className="text-slate-400">{tr(`· ขาดแค่ช่องแนะนำ ${systemStat.recOnly.toLocaleString()} ตัว`, `· ${systemStat.recOnly.toLocaleString()} missing only recommended`)}</span>}
            {onShowList && systemStat && systemStat.incomplete > 0 && (
              <button type="button" onClick={onShowList} className="text-blue-700 hover:underline">{tr("ดูรายการในตาราง ↗", "Show them in the table ↗")}</button>
            )}
          </div>
        )}
        {allDone ? (
          <div className="text-xs font-medium text-emerald-700">🎉 {tr("ลงครบทุกช่องของโหมดนี้แล้ว", "Every field in this mode is filled")}</div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-500">{tr("ยังไม่ลง:", "Missing:")}</span>
            {missingRows.map((m) => (
              <button key={m.key} type="button" onClick={() => jump(m.key)}
                title={tr("กดเพื่อไปที่ช่องนี้", "Go to this field")}
                className={`text-[11.5px] px-2 py-0.5 rounded-full border ${m.level === "required"
                  ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"}`}>
                {labelOf(m.key)} ↘
              </button>
            ))}
          </div>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
          <input type="checkbox" checked={hideDone} onChange={(e) => { setHideDone(e.target.checked); lsSet("entry-mode:hide-done", e.target.checked ? "1" : "0"); }} className="rounded border-slate-300" />
          {tr("ซ่อนช่องที่ลงแล้ว (เหลือแต่ที่ต้องทำ)", "Hide filled fields (show only what's left)")}
        </label>
      </div>

      {rows.length === 0 && (
        <div className="text-sm text-slate-400 py-6 text-center">{tr("โหมดนี้ไม่มีช่องที่ใช้กับรายการนี้", "This mode has no fields that apply to this record")}</div>
      )}
      {visibleRows.length === 0 && rows.length > 0 && (
        <div className="text-sm text-emerald-600 py-6 text-center">🎉 {tr("ลงครบแล้ว — ไม่มีช่องที่ต้องทำ", "All done — nothing left to fill")}</div>
      )}
      {visibleRows.map((r) => {
        const done = !missingSet.has(r.key);
        const f = fields[r.key];
        const hint = r.hint || f?.helpText;
        return (
          <div key={r.key} ref={(el) => { rowRefs.current[r.key] = el; }} onFocusCapture={() => touch(r.key)} onPointerDownCapture={() => touch(r.key)}
            className={`rounded-xl border p-3 flex gap-3 transition-shadow ${flashKey === r.key ? "ring-2 ring-rose-400" : ""} ${done ? "border-slate-200 bg-white" : r.level === "required" ? "border-rose-200 bg-rose-50/30" : "border-amber-200 bg-amber-50/30"}`}>
            <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${done ? "bg-emerald-100 text-emerald-700" : r.level === "required" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}
              title={done ? tr("ลงแล้ว", "Filled") : tr("ยังไม่ลง", "Not filled")}>{done ? "✓" : r.level === "required" ? "!" : "○"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-slate-800">{labelOf(r.key)}</span>
                <span className={`text-[10.5px] px-1.5 py-px rounded-full ${r.level === "required" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`}>
                  {r.level === "required" ? tr("ต้องมี", "Required") : tr("แนะนำ", "Recommended")}
                </span>
                {translatable?.(r.key) && onTranslate && (
                  <button type="button" disabled={busyKey === r.key}
                    onClick={async () => { setBusyKey(r.key); try { await onTranslate(r.key); } finally { setBusyKey(null); } }}
                    className="ml-auto h-6 px-2 text-[11px] rounded-md border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50">
                    {busyKey === r.key ? tr("กำลังแปล…", "Translating…") : `🌐 ${tr("แปลจากไทย", "Translate from Thai")}`}
                  </button>
                )}
              </div>
              {hint && <div className="text-[11.5px] text-slate-500 mt-0.5 mb-1.5 leading-relaxed">💡 {hint}</div>}
              {r.key === IMAGES_KEY ? (
                <div className="text-xs text-slate-600 mt-1">
                  {imageCount == null ? tr("กำลังนับรูป…", "Counting images…") : tr(`มี ${imageCount} จาก ${mode.imagesMin} รูป`, `${imageCount} of ${mode.imagesMin} images`)}
                  {!done && <span className="text-slate-400"> · {tr("เพิ่ม/ลากรูปที่ช่อง \"รูปสินค้า\"", "add or drop images in the \"Product images\" box")}</span>}
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-x-3">{renderInput(r.key)}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

