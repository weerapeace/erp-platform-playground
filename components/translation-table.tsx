"use client";

/**
 * ของกลาง — 🌐 ตารางคำแปล (ไทย | อังกฤษ) สำหรับข้อมูลซ้อนหลายชั้น
 * ใช้กับ: ธีม (เมนู/ท้ายเว็บ/แผงเมนูใหญ่/ข้อความหน้าสินค้า) · หมวด · คอลเลกชัน · หัวข้อตัวเลือก/หน่วย
 *
 *   <TranslateButton value={theme} onChange={setTheme} keys={THEME_TEXT_KEYS} crumbOf={THEME_CRUMBS} title="แปลข้อความในธีม" />
 *
 * แก้ค่าลง state ของแผงที่เรียกทันที (ยังไม่บันทึก) → ผู้ใช้กดบันทึกของแผงเองตามปกติ
 * เก็บตามกฎกลาง: `<key>_en` + `_i18n` (lib/content-i18n.ts) · ตัวทำความสะอาดฝั่งเซิร์ฟเวอร์ต้องเรียก carryTranslations()
 */
import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { TranslationBar, TranslationChip } from "@/components/bilingual-field";
import {
  applyPathTranslations,
  confirmPatch,
  coverageOf,
  translationPatch,
  updateAt,
  collectTextPaths,
  type PathSlot,
} from "@/lib/content-i18n";
import { translateContent } from "@/lib/content-translate";

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";

export function TranslationTable<T>({
  value,
  onChange,
  keys,
  crumbOf,
  emptyText = "ยังไม่มีข้อความให้แปล",
}: {
  value: T;
  onChange: (next: T) => void;
  keys: readonly string[];
  crumbOf?: (field: string) => string | null;
  emptyText?: string;
}) {
  const slots = useMemo(() => collectTextPaths(value, keys, crumbOf), [value, keys, crumbOf]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const idOf = (s: PathSlot) => `${s.path.join(".")}|${s.key}`;

  const run = async (todo: PathSlot[], scope: string) => {
    if (!todo.length) return;
    setBusy(scope);
    setError(null);
    try {
      const out = await translateContent(todo.map((s) => s.th));
      const results = todo.map((slot, i) => ({ slot, en: (out[i] ?? "").trim() })).filter((r) => r.en);
      if (!results.length) throw new Error("แปลไม่สำเร็จ ลองใหม่อีกครั้ง");
      onChange(applyPathTranslations(value, results, true));
      if (results.length < todo.length) setError(`แปลได้ ${results.length}/${todo.length} ช่อง — กดอีกครั้งเพื่อแปลส่วนที่เหลือ`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "แปลไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  const shown = onlyMissing ? slots.filter((s) => s.status === "empty" || s.status === "stale" || s.status === "ai") : slots;

  if (!slots.length) return <p className="text-sm text-slate-400 py-6 text-center">{emptyText}</p>;

  return (
    <div className="space-y-3">
      <TranslationBar
        showSwitch={false}
        coverage={coverageOf(slots)}
        busy={busy === "all"}
        error={error}
        onTranslateMissing={() => void run(slots.filter((s) => s.status === "empty" || s.status === "stale"), "all")}
      />
      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
        <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
        เฉพาะที่ยังไม่มีอังกฤษ / ไทยเปลี่ยน / AI รอตรวจ
      </label>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {shown.map((s) => {
          const id = idOf(s);
          const long = s.th.length > 80 || s.th.includes("\n");
          const setEn = (en: string) => onChange(updateAt(value, s.path, (o) => ({ ...o, ...translationPatch(o, s.key, o[s.key], en, false) })));
          return (
            <li key={id} className="px-3 py-2.5 grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400 truncate" title={s.where.join(" › ")}>{s.where.join(" › ")}</p>
                <p className="text-sm text-slate-700 break-words whitespace-pre-line">{s.th}</p>
              </div>
              <div className="min-w-0 space-y-1">
                {long ? (
                  <textarea className={inputCls} rows={3} value={s.en} placeholder="English" onChange={(e) => setEn(e.target.value)} />
                ) : (
                  <input className={inputCls} value={s.en} placeholder="English" onChange={(e) => setEn(e.target.value)} />
                )}
                <div className="flex items-center gap-1.5">
                  <TranslationChip status={s.status} />
                  <span className="flex-1" />
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run([s], id)}
                    className="h-6 px-2 rounded-md border border-indigo-200 bg-white text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {busy === id ? "กำลังแปล…" : s.status === "empty" ? "🌐 แปล" : "🌐 แปลใหม่"}
                  </button>
                  {s.status === "ai" && (
                    <button
                      type="button"
                      onClick={() => onChange(updateAt(value, s.path, (o) => ({ ...o, ...confirmPatch(o, s.key, o[s.key]) })))}
                      className="h-6 px-2 rounded-md border border-emerald-200 bg-white text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      ✓ ตรวจแล้ว
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!shown.length && <p className="text-xs text-emerald-700 text-center">ทุกช่องมีภาษาอังกฤษแล้ว</p>}
    </div>
  );
}

/** ปุ่ม "🌐 ภาษาอังกฤษ x/y" → เปิดตารางคำแปลในป๊อปกลาง */
export function TranslateButton<T>({
  value,
  onChange,
  keys,
  crumbOf,
  title = "ภาษาอังกฤษ",
  description = "แก้แล้วกดบันทึกของหน้านี้ตามปกติ · ช่องที่ยังว่าง ลูกค้าหน้า /en เห็นภาษาไทยแทน",
  className = "",
}: {
  value: T;
  onChange: (next: T) => void;
  keys: readonly string[];
  crumbOf?: (field: string) => string | null;
  title?: string;
  description?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const cov = useMemo(() => coverageOf(collectTextPaths(value, keys, crumbOf)), [value, keys, crumbOf]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="ตั้งข้อความภาษาอังกฤษ (หน้าเว็บ /en)"
        className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border text-xs font-medium ${cov.missing ? "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50" : "border-emerald-200 bg-emerald-50 text-emerald-700"} ${className}`}
      >
        🌐 EN {cov.ready}/{cov.total}
        {cov.aiPending > 0 && <span className="text-violet-700">· รอตรวจ {cov.aiPending}</span>}
      </button>
      <ERPModal open={open} onClose={() => setOpen(false)} title={`🌐 ${title}`} description={description} size="lg"
        footer={<button type="button" onClick={() => setOpen(false)} className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm">เสร็จ</button>}>
        <TranslationTable value={value} onChange={onChange} keys={keys} crumbOf={crumbOf} />
      </ERPModal>
    </>
  );
}
