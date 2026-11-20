"use client";
/**
 * แนะนำค่า "ช่องคุณลักษณะของหมวด" (ของกลาง · ใช้ได้ทุกร้าน — ตอนนี้ใช้ที่หน้าดูก่อนส่ง Shopee · TikTok/Lazada ย้ายมาใช้ได้)
 * --------------------------------------------------------------------------
 *   const s = useAttrSuggest({ fields, values, text: () => name + desc, ai: { platform, name, description, category, imageKeys } });
 *   <AttrSuggestButtons s={s} />                           // ปุ่ม "แนะนำจากชื่อ/รายละเอียด (ฟรี)" + "ให้ AI ช่วยเติม"
 *   <AttrSuggestPanel s={s} onApply={(next, filledIds) => …} />   // กล่องผลแนะนำ → "ใส่ทั้งหมด" (เติมเฉพาะช่องที่ว่าง)
 * แหล่ง: ฟรี = lib/attr-suggest (จับคำ) · AI = POST /api/ai/attr-fill (ด่านกลาง aiChat "ai.attr_fill" · เสียเงิน)
 * กติกา: เติมเฉพาะช่องที่ว่าง · ผล AI ติดป้าย "AI เดา · ตรวจก่อน" · คนกดใส่เอง แล้วกดบันทึกลงร่างของหน้านั้นเอง (ไม่ส่งขึ้นร้าน)
 * ห้ามใช้: เติมค่าแล้วส่งขึ้นร้านอัตโนมัติ
 */
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { suggestAttrsFromText, type SuggestHit } from "@/lib/attr-suggest";
import type { TtsAttrField, TtsAttrState } from "@/lib/tiktok-attrs";

export type AttrSuggestSource = "text" | "ai";
export type AttrSuggestAi = { platform: string; name: string; description: string; category: string | null; imageKeys: string[] };
export type AttrSuggestState = {
  hits: SuggestHit[] | null; source: AttrSuggestSource | null; busy: boolean; error: string | null; canAi: boolean;
  runText: () => void; runAi: () => Promise<void>; clear: () => void;
};

/** ยิง AI เติมช่อง (ของกลาง · ใช้ทั้งปุ่ม "ให้ AI ช่วยเติม" และเดาอัตโนมัติตอนเปิดหน้า Lazada) — เฉพาะช่องที่ส่งมา (ควรเป็นช่องที่ยังว่าง) */
export async function fetchAiAttrHits(ai: AttrSuggestAi, fields: TtsAttrField[]): Promise<{ hits: SuggestHit[]; error: string | null }> {
  if (!fields.length) return { hits: [], error: null };
  try {
    const r = await apiFetch("/api/ai/attr-fill", { method: "POST", body: JSON.stringify({
      platform: ai.platform, name: ai.name, description: ai.description, category: ai.category,
      image_keys: ai.imageKeys.slice(0, 3),
      fields: fields.map((f) => ({ id: f.id, name: f.name, required: f.required, multiple: f.multiple, customizable: f.customizable, numeric: f.numeric, options: f.options.map((o) => ({ id: o.id, name: o.name })) })),
    }) });
    const j = await r.json().catch(() => ({ hits: [], error: `HTTP ${r.status}` })) as { hits: SuggestHit[]; error: string | null };
    if (j.error) return { hits: [], error: r.status === 401 ? "ไม่มีสิทธิ์ใช้ AI — ขอสิทธิ์จากผู้ดูแลระบบ" : j.error };
    return { hits: j.hits ?? [], error: null };
  } catch (e) { return { hits: [], error: (e as Error).message || "AI ตอบไม่ได้" }; }
}

export function useAttrSuggest(opts: { fields: TtsAttrField[]; values: TtsAttrState; text: () => string; ai: AttrSuggestAi | null }): AttrSuggestState {
  const [hits, setHits] = useState<SuggestHit[] | null>(null);
  const [source, setSource] = useState<AttrSuggestSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filled = (id: string) => (opts.values[id] ?? []).length > 0;
  const runText = () => {
    setError(null); setSource("text");
    setHits(suggestAttrsFromText(opts.fields, opts.text(), { skip: filled }));
  };
  const runAi = async () => {
    if (!opts.ai) return;
    const empty = opts.fields.filter((f) => !filled(f.id));
    if (!empty.length) { setSource("ai"); setHits([]); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetchAiAttrHits(opts.ai, empty);
      if (res.error) { setError(res.error); return; }
      setSource("ai"); setHits(res.hits);
    } finally { setBusy(false); }
  };
  return { hits, source, busy, error, canAi: !!opts.ai, runText, runAi, clear: () => { setHits(null); setSource(null); setError(null); } };
}

/** ใส่ผลแนะนำลงค่าปัจจุบัน — เฉพาะช่องที่ว่าง · คืนค่าใหม่ + ช่องที่เติม */
export function applyAttrHits(values: TtsAttrState, hits: SuggestHit[]): { next: TtsAttrState; filledIds: string[] } {
  const next = { ...values }; const filledIds: string[] = [];
  for (const h of hits) {
    if ((next[h.fieldId] ?? []).length) continue;
    next[h.fieldId] = h.values.map((v) => (v.id ? { id: v.id, name: v.name } : { name: v.name }));
    filledIds.push(h.fieldId);
  }
  return { next, filledIds };
}

export function AttrSuggestButtons({ s, disabled }: { s: AttrSuggestState; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" disabled={disabled || s.busy} onClick={s.runText}
        title="อ่านชื่อ + รายละเอียดสินค้า แล้วหาคำที่ตรงกับตัวเลือกของร้าน (ฟรี · เติมเฉพาะช่องที่ว่าง · ตรวจก่อนใส่)"
        className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 text-[11px] text-amber-800 hover:bg-amber-100 disabled:opacity-50"><Icon name="search" />แนะนำจากชื่อ/รายละเอียด (ฟรี)</button>
      {s.canAi && (
        <button type="button" disabled={disabled || s.busy} onClick={() => void s.runAi()}
          title="ให้ AI อ่านชื่อ + รายละเอียด + รูป แล้วเดาค่าช่องที่ว่าง (มีค่าใช้จ่ายเล็กน้อย · ตรวจก่อนใส่)"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 text-[11px] text-violet-800 hover:bg-violet-100 disabled:opacity-50"><Icon name="ai" />{s.busy ? "AI กำลังอ่าน…" : "ให้ AI ช่วยเติม"}</button>
      )}
    </div>
  );
}

export function AttrSuggestPanel({ s, onApply }: { s: AttrSuggestState; onApply: (hits: SuggestHit[], source: AttrSuggestSource) => void }) {
  if (s.error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
        <Icon name="warning" className="mt-0.5 shrink-0" /><span className="min-w-0 flex-1">{s.error}</span>
        <button type="button" onClick={s.clear} className="shrink-0 underline">ปิด</button>
      </div>
    );
  }
  if (!s.hits || !s.source) return null;
  const ai = s.source === "ai";
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${ai ? "border-violet-200 bg-violet-50 text-violet-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      {s.hits.length === 0 ? <span>{ai ? "AI ไม่แน่ใจค่าของช่องที่ว่าง (หรือทุกช่องมีค่าแล้ว) — กรอกเองได้" : "ไม่เจอคำที่ตรงกับตัวเลือกในชื่อ/รายละเอียด (หรือช่องที่เจอมีค่าอยู่แล้ว)"}</span> : (
        <>
          <div className="mb-1 font-medium">{ai ? <><Icon name="ai" /> AI เดา · ตรวจก่อน — {s.hits.length} ช่อง</> : `เจอคำในชื่อ/รายละเอียด ${s.hits.length} ช่อง`} (เติมเฉพาะช่องที่ว่าง แล้วกดบันทึกลงร่าง)</div>
          <ul className="space-y-0.5">{s.hits.map((h) => <li key={h.fieldId}><span className="opacity-70">{h.fieldName}:</span> {h.values.map((x) => x.name).join(", ")}</li>)}</ul>
        </>
      )}
      <div className="mt-1.5 flex gap-2">
        {s.hits.length > 0 && <button type="button" onClick={() => { onApply(s.hits!, s.source!); s.clear(); }} className={`h-7 rounded-md px-2.5 text-white ${ai ? "bg-violet-600 hover:bg-violet-700" : "bg-amber-600 hover:bg-amber-700"}`}>ใส่ทั้งหมด</button>}
        <button type="button" onClick={s.clear} className="h-7 rounded-md border border-current/30 px-2.5 hover:bg-white/50">{s.hits.length ? "ไม่ใช้" : "ปิด"}</button>
      </div>
    </div>
  );
}
