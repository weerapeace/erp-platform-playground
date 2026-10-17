"use client";

/**
 * ของกลาง — widget ช่องกรอก 2 ภาษา (ไทย / อังกฤษ) แบบ "สลับภาษาทั้งแผง"
 *
 *   <ContentLangProvider>   ครอบแผงตั้งค่า → ทุกช่องข้างในสลับภาษาพร้อมกัน
 *   <ContentLangSwitch/>    ปุ่ม 🇹🇭 ไทย | 🇬🇧 EN
 *   <TranslationBar/>       แถบความครบ "อังกฤษ 3/5" + ปุ่ม 🌐 แปลที่ยังขาด
 *   <BilingualField/>       โครงช่อง: โหมดไทย = ช่องไทย + ป้ายสถานะ · โหมด EN = ช่องอังกฤษ + ไทยให้ดูเทียบ + ปุ่มแปล/ตรวจแล้ว
 *   <BilingualText/>        ช่องข้อความสำเร็จรูป ใช้กับ object ที่เก็บตามกฎกลาง (key + key_en + _i18n)
 *   <RecordLangBar/>        แถบสลับภาษา + ความครบ + แปลที่ยังขาด ของ "1 รายการ" (หมวด/คอลเลกชัน/…) — ส่ง object + ช่องที่แปลได้
 *
 * กฎการเก็บข้อมูล: lib/content-i18n.ts · เอกสาร: docs/bilingual-content.md
 * ไม่มี Provider ครอบ = โชว์ช่องไทยแบบเดิม (ที่เรียกใช้เก่าไม่เปลี่ยน)
 */
import { createContext, useContext, useMemo, useState } from "react";
import {
  confirmPatch,
  coverageOf,
  enKey,
  needsTranslation,
  readMeta,
  textOf,
  translationPatch,
  translationStatus,
  type ContentLang,
  type TranslationCoverage,
  type TranslationStatus,
} from "@/lib/content-i18n";
import { translateContent } from "@/lib/content-translate";

/* ─────────── ภาษาที่กำลังแก้ (ของทั้งแผง) ─────────── */

const Ctx = createContext<{ lang: ContentLang; setLang: (l: ContentLang) => void; enabled: boolean }>({
  lang: "th",
  setLang: () => {},
  enabled: false,
});

/** ครอบแผงตั้งค่า — ส่ง lang/onLangChange มาเอง (คุมจากข้างนอก) หรือไม่ส่ง (จำในตัว) ก็ได้ */
export function ContentLangProvider({
  lang: langProp,
  onLangChange,
  children,
}: {
  lang?: ContentLang;
  onLangChange?: (l: ContentLang) => void;
  children: React.ReactNode;
}) {
  const [own, setOwn] = useState<ContentLang>("th");
  const lang = langProp ?? own;
  const value = useMemo(
    () => ({ lang, setLang: (l: ContentLang) => (onLangChange ? onLangChange(l) : setOwn(l)), enabled: true }),
    [lang, onLangChange],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useContentLang = () => useContext(Ctx);

/** ปุ่มสลับภาษาที่กำลังแก้ (หน้าตาเดียวกับปุ่ม TH/EN ในฟอร์มสินค้า) */
export function ContentLangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useContentLang();
  return (
    <div className={`inline-flex rounded-lg border border-slate-200 overflow-hidden shrink-0 ${className}`} role="group" aria-label="ภาษาที่กำลังแก้">
      {(["th", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          title={l === "th" ? "แก้ข้อความภาษาไทย" : "แก้ข้อความภาษาอังกฤษ (เห็นภาษาไทยเทียบใต้ช่อง)"}
          className={`h-7 px-2.5 text-[12px] font-semibold ${lang === l ? "bg-indigo-50 text-indigo-700" : "bg-white text-slate-500 hover:bg-slate-50"} ${l === "en" ? "border-l border-slate-200" : ""}`}
        >
          {l === "th" ? "🇹🇭 ไทย" : "🇬🇧 EN"}
        </button>
      ))}
    </div>
  );
}

/* ─────────── ป้ายสถานะ ─────────── */

const CHIP: Record<TranslationStatus, { cls: string; label: string; short: string; title: string }> = {
  empty: { cls: "bg-slate-100 text-slate-500", label: "ยังไม่มี EN", short: "ไม่มี EN", title: "ยังไม่มีภาษาอังกฤษ — ลูกค้าที่ดูภาษาอังกฤษจะเห็นภาษาไทยแทน" },
  ai: { cls: "bg-violet-50 text-violet-700", label: "AI แปล · รอตรวจ", short: "AI รอตรวจ", title: "แปลโดย AI ยังไม่มีคนตรวจ — อ่านแล้วกด ✓ ตรวจแล้ว หรือแก้เองได้" },
  ok: { cls: "bg-emerald-50 text-emerald-700", label: "EN ✓", short: "EN ✓", title: "มีภาษาอังกฤษแล้ว" },
  stale: { cls: "bg-amber-50 text-amber-700", label: "ไทยเปลี่ยน · แปลใหม่?", short: "ไทยเปลี่ยน", title: "ภาษาไทยถูกแก้หลังแปล — คำแปลอังกฤษอาจไม่ตรงแล้ว" },
};

/** ป้ายสถานะคำแปล · short = ข้อความสั้น (ใช้ในโหมดไทยที่ช่องแคบ) */
export function TranslationChip({ status, short, className = "" }: { status: TranslationStatus; short?: boolean; className?: string }) {
  const c = CHIP[status];
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium whitespace-nowrap ${c.cls} ${className}`} title={c.title}>
      {short ? c.short : c.label}
    </span>
  );
}

/* ─────────── แถบความครบ + ปุ่มแปลที่ยังขาด ─────────── */

export function TranslationBar({
  coverage,
  busy,
  error,
  onTranslateMissing,
  showSwitch = true,
  className = "",
}: {
  coverage: TranslationCoverage;
  busy?: boolean;
  error?: string | null;
  onTranslateMissing: () => void;
  showSwitch?: boolean;
  className?: string;
}) {
  const { total, ready, missing, aiPending } = coverage;
  const pct = total ? Math.round((ready / total) * 100) : 100;
  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 ${className}`}>
      <div className="flex items-center gap-2">
        {showSwitch && <ContentLangSwitch />}
        <span className="flex-1" />
        {total > 0 && (
          <button
            type="button"
            onClick={onTranslateMissing}
            disabled={busy || missing === 0}
            title={missing ? "ให้ AI แปลช่องที่ยังไม่มีอังกฤษ และช่องที่ไทยเปลี่ยนหลังแปล (ช่องที่แปล/แก้เองไว้แล้วไม่ถูกทับ)" : "ทุกช่องมีภาษาอังกฤษแล้ว"}
            className="shrink-0 h-7 px-2 rounded-lg border border-indigo-200 bg-white text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 disabled:hover:bg-white"
          >
            {busy ? "กำลังแปล…" : missing ? `🌐 แปลที่ยังขาด (${missing})` : "✓ ครบแล้ว"}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <div className="flex-1 h-1 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-1 rounded-full bg-emerald-500 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="shrink-0 text-[11px] text-slate-600 tabular-nums">
          อังกฤษ {ready}/{total}
          {aiPending > 0 && <span className="text-violet-700"> · AI รอตรวจ {aiPending}</span>}
        </p>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

/* ─────────── โครงช่อง 2 ภาษา ─────────── */

const labelCls = "block text-[11px] font-medium text-slate-500";

/**
 * โครงของช่อง 2 ภาษา — ผู้เรียกส่ง "ช่องกรอกไทย" กับ "ช่องกรอกอังกฤษ" มาเอง (ข้อความ/ปุ่ม/รายการ ใช้โครงเดียวกัน)
 * ไม่ได้อยู่ใน ContentLangProvider = โชว์ช่องไทยอย่างเดียวแบบเดิม
 */
export function BilingualField({
  label,
  hint,
  wide,
  status,
  thRef,
  thNode,
  enNode,
  enNote,
  busy,
  error,
  onTranslate,
  onConfirm,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  status: TranslationStatus;
  /** ข้อความไทยให้ดูเทียบตอนแก้อังกฤษ */
  thRef: string;
  thNode: React.ReactNode;
  enNode: React.ReactNode;
  /** หมายเหตุใต้ช่องอังกฤษ (เช่น "ลิงก์ปลายทางใช้ร่วมกับภาษาไทย") */
  enNote?: string;
  busy?: boolean;
  error?: string | null;
  onTranslate?: () => void;
  onConfirm?: () => void;
}) {
  const { lang, enabled } = useContentLang();
  const hasTh = thRef.trim() !== "";
  // เป็นอังกฤษอยู่แล้ว (ไม่มีอักษรไทย) = ไม่ต้องแปล → ไม่ขึ้นป้าย "ไม่มี EN"
  const needs = needsTranslation(thRef);

  if (!enabled || lang === "th") {
    return (
      <div className={wide ? "sm:col-span-2" : ""}>
        <div className="flex items-center gap-1.5 mb-1">
          <label className={`${labelCls} flex-1 min-w-0`}>{label}</label>
          {enabled && needs && <TranslationChip status={status} short />}
        </div>
        {thNode}
        {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
      </div>
    );
  }

  // โหมดอังกฤษ — กว้างเต็มแถวเสมอ (มีไทยเทียบ + ปุ่ม ต้องใช้ที่)
  return (
    <div className="sm:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50/30 p-2">
      <div className="flex items-center gap-1.5 mb-1">
        <label className={`${labelCls} flex-1 min-w-0`}>
          {label} <span className="text-[10px] font-semibold text-indigo-600">EN</span>
        </label>
        {needs && <TranslationChip status={status} />}
      </div>
      {enNode}
      <p className="mt-1 text-[11px] text-slate-500 break-words whitespace-pre-line">
        <span className="text-slate-400">🇹🇭 </span>
        {hasTh ? thRef : <span className="text-slate-400">ภาษาไทยยังว่าง — กรอกไทยก่อนถึงจะแปลได้</span>}
      </p>
      {enNote && <p className="text-[11px] text-slate-400">{enNote}</p>}
      {hasTh && (onTranslate || (status === "ai" && onConfirm)) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {onTranslate && (
            <button
              type="button"
              onClick={onTranslate}
              disabled={busy}
              title={status === "empty" ? "ให้ AI แปลจากภาษาไทย" : "ให้ AI แปลใหม่จากภาษาไทย (ทับคำแปลเดิม)"}
              className="h-7 px-2 rounded-lg border border-indigo-200 bg-white text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              {busy ? "กำลังแปล…" : status === "empty" ? "🌐 แปล" : "🌐 แปลใหม่"}
            </button>
          )}
          {status === "ai" && onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              title="อ่านแล้ว คำแปลถูกต้อง — เอาป้าย AI ออก"
              className="h-7 px-2 rounded-lg border border-emerald-200 bg-white text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
            >
              ✓ ตรวจแล้ว
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

/** แปล 1 ช่อง: คืน [กำลังแปล, error, สั่งแปล] — ใช้ร่วมกันใน widget ต่าง ๆ */
export function useTranslateOne() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (texts: string[], apply: (out: string[]) => void) => {
    setBusy(true);
    setError(null);
    try {
      const out = await translateContent(texts);
      if (!out.some((s) => s.trim())) throw new Error("แปลไม่สำเร็จ ลองใหม่อีกครั้ง");
      apply(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "แปลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";

/**
 * ช่องข้อความ 2 ภาษาสำเร็จรูป — ใช้กับ object ที่เก็บตามกฎกลาง (key = ไทย · key_en = อังกฤษ · _i18n = สถานะ)
 * onPatch ได้แพตช์ที่ต้องรวมเข้า object (อาจมีหลายช่องพร้อมกัน เช่น title_en + _i18n)
 */
export function BilingualText({
  label,
  hint,
  wide,
  multiline,
  rows = 3,
  maxLength,
  placeholder,
  value,
  fieldKey,
  onPatch,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  value: Record<string, unknown>;
  fieldKey: string;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const th = textOf(value[fieldKey]);
  const enRaw = value[enKey(fieldKey)];
  const en = typeof enRaw === "string" ? enRaw : "";
  const status = translationStatus(th, en, readMeta(value)[fieldKey]);
  const tx = useTranslateOne();
  const enMax = maxLength ? Math.ceil(maxLength * 1.5) : undefined;
  const box = (v: string, onText: (s: string) => void, ph?: string, max?: number) =>
    multiline ? (
      <textarea className={inputCls} rows={rows} value={v} placeholder={ph} maxLength={max} onChange={(e) => onText(e.target.value)} />
    ) : (
      <input className={inputCls} value={v} placeholder={ph} maxLength={max} onChange={(e) => onText(e.target.value)} />
    );
  return (
    <BilingualField
      label={label}
      hint={hint}
      wide={wide}
      status={status}
      thRef={th}
      thNode={box(th, (s) => onPatch({ [fieldKey]: s }), placeholder, maxLength)}
      enNode={box(en, (s) => onPatch(translationPatch(value, fieldKey, th, s, false)), "English", enMax)}
      busy={tx.busy}
      error={tx.error}
      onTranslate={() => tx.run([th], (out) => onPatch(translationPatch(value, fieldKey, th, out[0], true)))}
      onConfirm={() => onPatch(confirmPatch(value, fieldKey, th))}
    />
  );
}

/**
 * 🌐 แถบสลับภาษาของ "1 รายการ" — ปุ่ม 🇹🇭 ไทย | 🇬🇧 EN + "อังกฤษ x/y" + 🌐 แปลที่ยังขาด
 * ใช้คู่กับ ContentLangProvider ที่ครอบการ์ดแก้รายการนั้น แล้วเปลี่ยนช่องข้อความเป็น BilingualText
 *   <ContentLangProvider><RecordLangBar value={cat} keys={["label","blurb"]} onPatch={(p) => patch(cat.key, p)} /> …</ContentLangProvider>
 * นับเฉพาะช่องที่มีภาษาไทย (ช่องที่เป็นอังกฤษอยู่แล้ว/ว่าง ไม่ต้องแปล) · แปลแล้วติดป้าย AI รอตรวจ (ช่องที่แปล/แก้เองไม่ถูกทับ)
 */
export function RecordLangBar({
  value,
  keys,
  onPatch,
  note,
  className = "",
}: {
  value: Record<string, unknown>;
  keys: readonly string[];
  onPatch: (patch: Record<string, unknown>) => void;
  /** ข้อความเล็กบนแถบ (เช่น "หน้าเว็บ /en ใช้ค่านี้") */
  note?: string;
  className?: string;
}) {
  const meta = readMeta(value);
  const slots = keys
    .filter((k) => needsTranslation(value[k]))
    .map((k) => ({ key: k, th: textOf(value[k]), status: translationStatus(value[k], value[enKey(k)], meta[k]) }));
  const tx = useTranslateOne();
  const translateMissing = () => {
    const todo = slots.filter((x) => x.status === "empty" || x.status === "stale");
    if (!todo.length) return;
    void tx.run(
      todo.map((x) => x.th),
      (out) => {
        let acc = { ...value };
        let patch: Record<string, unknown> = {};
        todo.forEach((x, i) => {
          if (!out[i]?.trim()) return;
          const p = translationPatch(acc, x.key, x.th, out[i].trim(), true);
          acc = { ...acc, ...p };
          patch = { ...patch, ...p };
        });
        onPatch(patch);
      },
    );
  };
  return (
    <div className={className}>
      {note && <p className="text-[11px] text-slate-500 mb-1.5">{note}</p>}
      <TranslationBar coverage={coverageOf(slots)} busy={tx.busy} error={tx.error} onTranslateMissing={translateMissing} />
    </div>
  );
}
