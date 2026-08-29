"use client";

/**
 * 📚 เพิ่มทั้งชุด — ลงหนังสือชุดทีเดียวทั้งชุด (เช่น ดาบพิฆาตอสูร 1-23 จบ)
 *
 * ขั้นที่ 1 ตั้งชุด: ชื่อชุด + จำนวนเล่มทั้งหมด + เล่มพิเศษ + ข้อมูลที่ใช้ร่วมกันทุกเล่ม (ผู้แต่ง/หมวด/ร้าน/ราคา)
 * ขั้นที่ 2 ติ๊กว่ามีเล่มไหนแล้ว: เล่มที่ติ๊ก = "มีแล้ว" · ที่เหลือ = "อยากได้" (พิมพ์ช่วงเร็ว ๆ ได้ เช่น 1-10, 15)
 *
 * ชื่อเล่มตั้งให้อัตโนมัติ:
 *   เล่มปกติ/เลขทศนิยม → "<ชื่อชุด> เล่ม <เลข>"   (เช่น "ดาบพิฆาตอสูร เล่ม 25.5")
 *   เล่มพิเศษที่เป็นข้อความ → "<ชื่อชุด> <ข้อความ>" (เช่น "ดาบพิฆาตอสูร Official Book")
 *
 * ของกลางที่ใช้: ERPModal · MoneyInput · RelationPicker · useToast · บันทึกผ่าน /api/master-v2/book_library/import
 */

import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { RelationPicker } from "@/components/relation-picker";
import { STORE_RELATION } from "./store-relation";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";

const MAX_VOLUMES = 200;
const MAX_SPECIALS = 40;

/** ชุดจบหรือยัง — ตรงกับคอลัมน์ book_library.series_status ("" = ยังไม่ระบุ) */
type SeriesStatus = "" | "ongoing" | "ended";
const SERIES_STATUS_CHOICES: { key: SeriesStatus; label: string; hint: string }[] = [
  { key: "",        label: "ยังไม่ระบุ",  hint: "ไม่รู้ / ค่อยมาใส่ทีหลัง" },
  { key: "ongoing", label: "ยังไม่จบ",    hint: "ยังออกเล่มใหม่ต่อ — ต้องตามเก็บอีก" },
  { key: "ended",   label: "จบแล้ว",      hint: "ออกครบทั้งชุดแล้ว ไม่มีเล่มใหม่" },
];

/** เล่มหนึ่งที่วิซาร์ดจะสร้าง (ทั้งเล่มปกติและเล่มพิเศษ ใช้โครงเดียวกัน) */
type Entry = {
  key:     string;    // id ภายในวิซาร์ด
  volume:  string;    // ค่าที่จะลงช่อง "เล่มที่" — "12" / "25.5" / "Official Book"
  title:   string;    // ชื่อเต็มที่จะสร้าง
  titleEn: string;    // ชื่อภาษาอังกฤษ (ว่างได้)
  special: boolean;   // เล่มพิเศษ (ไม่ใช่ 1..N)
};

const isNumericVolume = (v: string) => /^\d+(\.\d+)?$/.test(v);

/** ชื่ออังกฤษต่อเล่ม — เลข → "Name Vol. 12" · ข้อความ → "Name Official Book" (ไม่ใส่ชื่ออังกฤษ = ว่าง) */
const enTitleFor = (nameEn: string, volume: string) =>
  !nameEn ? "" : isNumericVolume(volume) ? `${nameEn} Vol. ${volume}` : `${nameEn} ${volume}`;

/** "1-10, 12, 25.5" → เลขเล่ม/ข้อความที่ผู้ใช้ระบุ (ผู้ใช้พิมพ์เร็วกว่าไล่กดทีละเล่ม) */
function pickKeysFromText(input: string, entries: Entry[]): Set<string> {
  const byVolume = new Map(entries.map((e) => [e.volume.toLowerCase(), e.key]));
  const out = new Set<string>();
  for (const part of input.split(/[,\s]+/)) {
    const t = part.trim();
    if (!t) continue;
    const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(t);   // ช่วง เช่น 1-10
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
        const k = byVolume.get(String(i));
        if (k) out.add(k);
      }
      continue;
    }
    const k = byVolume.get(t.toLowerCase());      // เลขเดี่ยว / 25.5 / ชื่อเล่มพิเศษ
    if (k) out.add(k);
  }
  return out;
}

export function SeriesWizardModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [series, setSeries] = useState("");
  const [seriesEn, setSeriesEn] = useState("");   // ชื่อชุดภาษาอังกฤษ (ไม่บังคับ)
  const [total, setTotal] = useState("");
  const [specials, setSpecials] = useState("");   // เล่มพิเศษ คั่นด้วยจุลภาค เช่น "25.5, Official Book"
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [price, setPrice] = useState<string>("");
  const [seriesStatus, setSeriesStatus] = useState<SeriesStatus>("");   // ชุดนี้จบหรือยัง — ตั้งครั้งเดียว ใช้ทั้งชุด
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [rangeText, setRangeText] = useState("");
  const [saving, setSaving] = useState(false);
  // เล่มที่ "มีในคลังอยู่แล้ว" (เช็กตอนเข้าขั้น 2) — จะไม่สร้างซ้ำ
  const [dupes, setDupes] = useState<Map<string, string>>(new Map());   // entry.key → สถานะเดิมในคลัง
  const [checking, setChecking] = useState(false);

  const n = Math.min(MAX_VOLUMES, Math.max(0, parseInt(total || "0", 10) || 0));

  /** รายชื่อเล่มทั้งหมดที่จะสร้าง = 1..N + เล่มพิเศษที่พิมพ์เพิ่ม (กันซ้ำกันเองด้วย) */
  const entries = useMemo<Entry[]>(() => {
    const s = series.trim();
    const en = seriesEn.trim();
    const list: Entry[] = Array.from({ length: n }, (_, i) => ({
      key: `v${i + 1}`, volume: String(i + 1),
      title: `${s} เล่ม ${i + 1}`, titleEn: enTitleFor(en, String(i + 1)), special: false,
    }));
    const seen = new Set(list.map((e) => e.volume.toLowerCase()));
    for (const raw of specials.split(/[,\n]+/)) {     // คั่นด้วยจุลภาคเท่านั้น — ชื่อเล่มพิเศษมีช่องว่างได้
      const v = raw.trim();
      if (!v || seen.has(v.toLowerCase())) continue;
      if (list.length - n >= MAX_SPECIALS) break;
      seen.add(v.toLowerCase());
      list.push({
        key: `s:${v}`,
        volume: v,
        title: isNumericVolume(v) ? `${s} เล่ม ${v}` : `${s} ${v}`,
        titleEn: enTitleFor(en, v),
        special: true,
      });
    }
    return list;
  }, [series, seriesEn, n, specials]);

  const mainEntries    = entries.filter((e) => !e.special);
  const specialEntries = entries.filter((e) => e.special);
  const toCreate = entries.length - dupes.size;

  const reset = () => {
    setStep(1); setSeries(""); setSeriesEn(""); setTotal(""); setSpecials(""); setAuthor(""); setCategory("");
    setStoreId(null); setPrice(""); setSeriesStatus(""); setOwned(new Set()); setRangeText(""); setSaving(false);
    setDupes(new Map()); setChecking(false);
  };
  const close = () => { reset(); onClose(); };

  const toggle = (k: string) => {
    if (dupes.has(k)) return;   // มีในคลังแล้ว — แตะไม่ได้
    setOwned((prev) => { const s = new Set(prev); if (s.has(k)) s.delete(k); else s.add(k); return s; });
  };

  const applyRange = () => {
    const picked = pickKeysFromText(rangeText, entries);
    if (picked.size === 0) { toast.warning("พิมพ์เล่มที่มี เช่น 1-10, 12, 25.5"); return; }
    for (const k of dupes.keys()) picked.delete(k);
    setOwned(picked);
    toast.success(`ติ๊กให้แล้ว ${picked.size} เล่ม`);
  };

  /** เช็กว่าเล่มไหนมีในคลังแล้ว (เทียบด้วยชื่อเล่มแบบเดียวกับที่ฐานข้อมูลกันซ้ำ) */
  const checkDupes = async (list: Entry[]) => {
    setChecking(true);
    try {
      const res = await apiFetch("/api/book-library/check-duplicates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titles: list.map((e) => e.title) }),
      });
      const j = await res.json();
      const found = (j.existing ?? {}) as Record<string, { status: string }>;
      const map = new Map<string, string>();
      for (const e of list) if (found[e.title]) map.set(e.key, found[e.title].status);
      setDupes(map);
      setOwned((prev) => { const s = new Set(prev); for (const k of map.keys()) s.delete(k); return s; });
      if (map.size > 0) toast.info(`ชุดนี้มีในคลังแล้ว ${map.size} เล่ม — จะข้ามให้ ไม่สร้างซ้ำ`);
    } catch { /* เช็กไม่ได้ก็ปล่อยผ่าน — ฐานข้อมูลกันซ้ำให้อีกชั้น */ }
    finally { setChecking(false); }
  };

  const next = () => {
    if (!series.trim()) { toast.warning("ใส่ชื่อชุดก่อน"); return; }
    if (entries.length === 0) { toast.warning("ใส่จำนวนเล่มทั้งหมด (1-200) หรือใส่เล่มพิเศษอย่างน้อย 1 เล่ม"); return; }
    setStep(2);
    void checkDupes(entries);
  };

  const save = async () => {
    setSaving(true);
    try {
      const priceNum = price === "" ? null : Number(price);
      const rows = entries.filter((e) => !dupes.has(e.key)).map((e) => {
        const row: Record<string, unknown> = {
          title:  e.title,
          series: series.trim(),
          volume: e.volume,
          status: owned.has(e.key) ? "owned" : "wishlist",
        };
        if (e.titleEn) row.title_en = e.titleEn;
        if (seriesStatus) row.series_status = seriesStatus;
        if (author.trim()) row.author = author.trim();
        if (category.trim()) row.category = category.trim();
        if (storeId) row.store_id = storeId;
        if (priceNum != null && priceNum > 0) row.price = priceNum;
        return row;
      });
      if (rows.length === 0) { toast.warning("ชุดนี้มีครบในคลังแล้ว ไม่มีเล่มใหม่ให้เพิ่ม"); return; }
      const res = await apiFetch("/api/master-v2/book_library/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mode: "create", actor: user?.name ?? user?.email }),
      });
      const j = await res.json();
      if (j.error) { toast.error(String(j.error)); return; }
      const failed = (j.failed ?? []) as { error: string }[];
      if (failed.length > 0) toast.warning(`ลงได้ ${j.created ?? 0} เล่ม · ไม่สำเร็จ ${failed.length} เล่ม (${failed[0].error})`);
      else toast.success(`ลงชุด "${series.trim()}" แล้ว ${j.created ?? rows.length} เล่ม`);
      onCreated();
      close();
    } catch (e) {
      toast.error((e as Error).message ?? "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const field = "h-9 w-full px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200";
  const label = "block text-xs font-medium text-slate-600 mb-1";

  /** ปุ่มติ๊กหนึ่งเล่ม (ขั้นที่ 2) — เล่มพิเศษกว้างกว่าเพราะเป็นข้อความ */
  const VolumeButton = ({ e }: { e: Entry }) => {
    const dup = dupes.has(e.key);
    const on = owned.has(e.key);
    return (
      <button onClick={() => toggle(e.key)} disabled={dup}
        title={dup ? `${e.title} — มีในคลังแล้ว (จะไม่สร้างซ้ำ)` : e.title}
        className={`h-11 rounded-lg border text-sm transition-colors
          ${e.special ? "px-3 max-w-[180px] truncate" : "w-11 tabular-nums"}
          ${dup ? "bg-slate-100 border-slate-200 text-slate-300 line-through cursor-not-allowed"
            : on ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-medium"
                 : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}>
        {e.volume}
      </button>
    );
  };

  return (
    <ERPModal
      open={open}
      onClose={close}
      size="lg"
      title="📚 เพิ่มทั้งชุด"
      description={step === 1
        ? "ลงหนังสือชุดทีเดียวทั้งชุด — ใส่ชื่อชุดกับจำนวนเล่ม แล้วระบบตั้งชื่อเล่มให้เอง"
        : `ติ๊กเล่มที่มีอยู่แล้ว — เล่มที่ไม่ติ๊กจะบันทึกเป็น "อยากได้"`}
      hasUnsavedChanges={!!series.trim() && !saving}
      storageKey="book-library-series-wizard"
      footer={
        <>
          <button onClick={close} disabled={saving}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          {step === 2 && (
            <button onClick={() => setStep(1)} disabled={saving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">← ย้อนกลับ</button>
          )}
          {step === 1
            ? <button onClick={next}
                className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">ถัดไป →</button>
            : <button onClick={save} disabled={saving || checking || toCreate === 0}
                className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {saving ? "กำลังบันทึก…" : `บันทึก ${toCreate} เล่ม`}
              </button>}
        </>
      }
    >
      {step === 1 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className={label}>ชื่อชุด <span className="text-red-500">*</span></label>
              <input autoFocus value={series} onChange={(e) => setSeries(e.target.value)}
                placeholder="เช่น ดาบพิฆาตอสูร" className={field} />
            </div>
            <div>
              <label className={label}>จำนวนเล่มทั้งหมด <span className="text-red-500">*</span></label>
              <input value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric" placeholder="23" className={field} />
            </div>
            <div className="sm:col-span-3">
              <label className={label}>ชื่อชุด (ภาษาอังกฤษ)</label>
              <input value={seriesEn} onChange={(e) => setSeriesEn(e.target.value)}
                placeholder="เช่น Demon Slayer — ใส่ก็ได้ ไม่ใส่ก็ได้" className={field} />
              {seriesEn.trim() && (
                <p className="mt-1 text-[10px] text-slate-400">แต่ละเล่มจะได้ชื่ออังกฤษเป็น &quot;{seriesEn.trim()} Vol. 1&quot;, &quot;{seriesEn.trim()} Vol. 2&quot; …</p>
              )}
            </div>
          </div>

          {/* เล่มพิเศษ — เล่มที่ไม่เข้าลำดับ 1..N (เล่ม .5 / ไกด์บุ๊ก / ตอนพิเศษ) */}
          <div>
            <label className={label}>เล่มพิเศษ (ถ้ามี)</label>
            <input value={specials} onChange={(e) => setSpecials(e.target.value)}
              placeholder="เช่น 25.5, Official Book, ตอนพิเศษ" className={field} />
            <p className="mt-1 text-[10px] text-slate-400">
              คั่นด้วยจุลภาค · เป็นตัวเลข เช่น <b>25.5</b> จะได้ชื่อ &quot;…เล่ม 25.5&quot; · เป็นข้อความ เช่น <b>Official Book</b> จะได้ชื่อ &quot;…Official Book&quot;
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>ผู้แต่ง</label>
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="ใส่ครั้งเดียว ใช้ทุกเล่ม" className={field} />
            </div>
            <div>
              <label className={label}>หมวด</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="เช่น การ์ตูน" className={field} />
            </div>
            <div>
              <label className={label}>ร้านที่ซื้อ</label>
              <RelationPicker value={storeId} onChange={(v) => setStoreId(v)} config={STORE_RELATION}
                placeholder="— เลือกร้าน —" />
              <p className="mt-1 text-[10px] text-slate-400">ไม่มีร้านที่ต้องการ? กด + สร้างใหม่ในดรอปดาวน์ · จัดการทั้งหมดที่เมนู 🏪 ร้านหนังสือ</p>
            </div>
            <div>
              <label className={label}>ราคาต่อเล่ม</label>
              <MoneyInput value={price} onChange={setPrice} placeholder="ใส่ก็ได้ ไม่ใส่ก็ได้" className={field} />
            </div>
          </div>

          {/* ชุดนี้จบหรือยัง — ใช้ทั้งชุด (เก็บลงทุกเล่ม แล้วฐานข้อมูลคุมให้ตรงกันทั้งชั้น) */}
          <div>
            <label className={label}>ชุดนี้จบหรือยัง</label>
            <div className="flex flex-wrap gap-2">
              {SERIES_STATUS_CHOICES.map((c) => {
                const on = seriesStatus === c.key;
                return (
                  <button key={c.key || "unset"} type="button" onClick={() => setSeriesStatus(c.key)} title={c.hint}
                    className={`h-9 px-3.5 text-sm rounded-lg border transition-colors
                      ${on
                        ? c.key === "ended"   ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-medium"
                        : c.key === "ongoing" ? "bg-amber-50 border-amber-300 text-amber-700 font-medium"
                        :                       "bg-slate-100 border-slate-300 text-slate-600 font-medium"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    {on ? "✓ " : ""}{c.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              {SERIES_STATUS_CHOICES.find((c) => c.key === seriesStatus)?.hint} · แก้ทีหลังได้ที่เล่มไหนก็ได้ เล่มอื่นในชุดเปลี่ยนตามเอง
            </p>
          </div>

          {series.trim() && entries.length > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm text-slate-600 space-y-1">
              <div>
                จะสร้าง <b className="text-slate-800">{entries.length} เล่ม</b>
                {specialEntries.length > 0 && <span className="text-slate-500"> (ปกติ {mainEntries.length} + พิเศษ {specialEntries.length})</span>}
                {seriesStatus === "ended" && <span className="text-emerald-600"> (จบแล้ว)</span>}
                {seriesStatus === "ongoing" && <span className="text-amber-600"> (ยังไม่จบ)</span>}
              </div>
              {mainEntries.length > 0 && (
                <div>
                  ชื่อ: <span className="text-slate-800">{mainEntries[0].title}</span>
                  {mainEntries.length > 1 && <> … <span className="text-slate-800">{mainEntries[mainEntries.length - 1].title}</span></>}
                </div>
              )}
              {specialEntries.length > 0 && (
                <div>พิเศษ: {specialEntries.map((e) => <span key={e.key} className="text-slate-800">{e.title}</span>).reduce((a, b) => <>{a}<span className="text-slate-400"> · </span>{b}</>)}</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input value={rangeText} onChange={(e) => setRangeText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyRange(); }}
              placeholder="พิมพ์เล่มที่มี เช่น 1-10, 12, 25.5" className={`${field} w-full sm:w-72`} />
            <button onClick={applyRange}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ติ๊กให้</button>
            <button onClick={() => setOwned(new Set(entries.filter((e) => !dupes.has(e.key)).map((e) => e.key)))}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">มีครบทุกเล่ม</button>
            <button onClick={() => setOwned(new Set())}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50">ล้างทั้งหมด</button>
          </div>

          <div className="max-h-[42vh] overflow-auto p-1 space-y-3">
            {mainEntries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {mainEntries.map((e) => <VolumeButton key={e.key} e={e} />)}
              </div>
            )}
            {specialEntries.length > 0 && (
              <div>
                <div className="text-[11px] font-medium text-slate-400 mb-1.5">✨ เล่มพิเศษ</div>
                <div className="flex flex-wrap gap-1.5">
                  {specialEntries.map((e) => <VolumeButton key={e.key} e={e} />)}
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            {checking && <span className="text-slate-400">กำลังเช็กเล่มที่มีอยู่แล้ว…</span>}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />มีแล้ว <b>{owned.size}</b> เล่ม
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />อยากได้ <b>{Math.max(0, toCreate - owned.size)}</b> เล่ม
            </span>
            {dupes.size > 0 && (
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-slate-300" />ข้าม <b>{dupes.size}</b> เล่ม (มีในคลังแล้ว)
              </span>
            )}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
