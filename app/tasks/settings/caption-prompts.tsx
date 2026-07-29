"use client";

// ตั้งค่า prompt ให้ AI เขียนแคปชั่น — 4 ระดับ (เจาะจงกว่าชนะ)
//   ① แบรนด์ + แพลตฟอร์ม  ② แบรนด์  ③ แพลตฟอร์ม  ④ ทุกแบรนด์/ทุกแพลตฟอร์ม (ค่ากลาง)
// เลือกช่องซ้าย (แบรนด์/แพลตฟอร์ม) → แก้ข้อความ → บันทึก · ลบระดับนั้นได้ (กลับไปใช้ระดับที่กว้างกว่า)

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { listBrands, type BrandOption } from "../data";
import { useCreativeOptions } from "../use-options";
import { useT } from "@/components/i18n";

type Row = { id: string; brand_id: string | null; platform: string | null; prompt: string; updated_at: string };
const ALL = "__all__";   // ค่าใน dropdown ที่หมายถึง "ทุก…" (= null ใน DB)

export function CaptionPromptsManager({ showToast }: { showToast: (m: string) => void }) {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [brandSel, setBrandSel] = useState(ALL);
  const [platSel, setPlatSel] = useState(ALL);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bs, j] = await Promise.all([listBrands().catch(() => [] as BrandOption[]), apiFetch("/api/ai/caption-prompts").then((r) => r.json())]);
      setBrands(bs);
      if (j.error) throw new Error(j.error);
      setRows((j.data ?? []) as Row[]);
    } catch (e) { showToast((e as Error).message); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const bId = brandSel === ALL ? null : brandSel;
  const pKey = platSel === ALL ? null : platSel;
  const find = (b: string | null, p: string | null) => rows.find((r) => r.brand_id === b && r.platform === p);
  const exact = find(bId, pKey);

  // ระดับที่ "มีผลจริง" ตอนนี้สำหรับคู่ที่เลือก (เจาะจงกว่าชนะ)
  const effective = useMemo(() => {
    const cands: [Row | undefined, string][] = [
      [bId && pKey ? find(bId, pKey) : undefined, t("แบรนด์ + แพลตฟอร์ม", "Brand + platform")],
      [bId ? find(bId, null) : undefined, t("แบรนด์นี้ (ทุกแพลตฟอร์ม)", "This brand (all platforms)")],
      [pKey ? find(null, pKey) : undefined, t("แพลตฟอร์มนี้ (ทุกแบรนด์)", "This platform (all brands)")],
      [find(null, null), t("ค่ากลาง (ทุกแบรนด์/ทุกแพลตฟอร์ม)", "Global default")],
    ];
    const hit = cands.find(([r]) => !!r);
    return hit ? { row: hit[0] as Row, level: hit[1] } : null;
  }, [rows, bId, pKey, t]);

  // เปลี่ยนคู่ที่เลือก → เติมข้อความของ "ระดับนั้นเป๊ะ ๆ" (ไม่มี = ว่าง + โชว์ตัวที่มีผลอยู่ให้ดู)
  useEffect(() => { setDraft(exact?.prompt ?? ""); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [brandSel, platSel, rows.length]);

  const brandName = (id: string | null) => (id ? (brands.find((b) => b.id === id)?.name ?? id.slice(0, 8)) : t("ทุกแบรนด์", "All brands"));
  const platName = (k: string | null) => (k ? (platforms.find((p) => p.value === k)?.label ?? k) : t("ทุกแพลตฟอร์ม", "All platforms"));

  const save = async () => {
    if (!draft.trim()) { showToast(t("กรุณาใส่คำสั่ง (prompt)", "Please enter a prompt")); return; }
    setBusy(true);
    try {
      const j = await apiFetch("/api/ai/caption-prompts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: bId, platform: pKey, prompt: draft }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      showToast(t("บันทึก prompt แล้ว", "Prompt saved")); await load();
    } catch (e) { showToast((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!bId && !pKey) { showToast(t("ค่ากลางลบไม่ได้ — แก้ข้อความแทน", "Global default can't be deleted — edit it instead")); return; }
    if (!window.confirm(t(`ลบ prompt ระดับ "${brandName(bId)} · ${platName(pKey)}" ? (จะกลับไปใช้ระดับที่กว้างกว่า)`, "Delete this level? (falls back to a broader level)"))) return;
    setBusy(true);
    try {
      const q = new URLSearchParams(); if (bId) q.set("brand_id", bId); if (pKey) q.set("platform", pKey);
      const j = await apiFetch(`/api/ai/caption-prompts?${q.toString()}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      showToast(t("ลบแล้ว", "Deleted")); await load();
    } catch (e) { showToast((e as Error).message); } finally { setBusy(false); }
  };

  const sel = "h-9 border border-slate-200 rounded-lg px-2 text-sm bg-white";
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-4xl mx-auto">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">✨ {t("คำสั่ง AI เขียนแคปชั่น (prompt)", "AI caption prompt")}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{t("ตั้งได้ 4 ระดับ — ระดับที่เจาะจงกว่าจะถูกใช้ก่อน: แบรนด์+แพลตฟอร์ม → แบรนด์ → แพลตฟอร์ม → ค่ากลาง", "4 levels — the most specific wins: brand+platform → brand → platform → global")}</p>
      </div>
      <div className="p-5 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-500 block mb-0.5">{t("แบรนด์", "Brand")}</span>
            <select value={brandSel} onChange={(e) => setBrandSel(e.target.value)} className={sel}>
              <option value={ALL}>{t("ทุกแบรนด์", "All brands")}</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-500 block mb-0.5">{t("แพลตฟอร์ม", "Platform")}</span>
            <select value={platSel} onChange={(e) => setPlatSel(e.target.value)} className={sel}>
              <option value={ALL}>{t("ทุกแพลตฟอร์ม", "All platforms")}</option>
              {platforms.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <span className={`text-[11px] px-2 py-1 rounded-full border ${exact ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
            {exact ? t("ระดับนี้ตั้งไว้แล้ว", "This level is set") : t("ระดับนี้ยังไม่ตั้ง", "Not set at this level")}
          </span>
        </div>

        {!exact && effective && (
          <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            {t("ตอนนี้คู่นี้ใช้ prompt จากระดับ", "Currently using the level")}: <b className="text-slate-700">{effective.level}</b>
            {t(" — พิมพ์ด้านล่างแล้วบันทึก = ตั้งเฉพาะคู่นี้ทับ", " — typing below overrides just this combination")}
          </div>
        )}

        {loading ? <p className="py-8 text-center text-sm text-slate-400">{t("กำลังโหลด...", "Loading...")}</p> : (
          <>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={10}
              placeholder={effective?.row.prompt ?? t("พิมพ์คำสั่งให้ AI เช่น โทนเสียง ความยาว ห้ามพูดถึงอะไร", "Describe tone, length, what to avoid…")}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-300" />
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">💾 {t("บันทึกระดับนี้", "Save this level")}</button>
              {exact && (bId || pKey) && <button onClick={remove} disabled={busy} className="h-9 px-3 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-50">🗑 {t("ลบระดับนี้", "Delete this level")}</button>}
              <span className="text-[11px] text-slate-400">{t("กำลังแก้ระดับ", "Editing level")}: <b className="text-slate-600">{brandName(bId)} · {platName(pKey)}</b></span>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <p className="text-[11px] font-semibold text-slate-400 mb-1.5">{t("ระดับที่ตั้งไว้แล้ว", "Levels already set")} ({rows.length})</p>
              <div className="space-y-1">
                {rows.map((r) => {
                  const on = r.brand_id === bId && r.platform === pKey;
                  return (
                    <button key={r.id} type="button" onClick={() => { setBrandSel(r.brand_id ?? ALL); setPlatSel(r.platform ?? ALL); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs ${on ? "border-violet-300 bg-violet-50/50" : "border-slate-200 hover:bg-slate-50"}`}>
                      <b className="text-slate-700">{brandName(r.brand_id)}</b> · {platName(r.platform)}
                      <span className="text-slate-400"> — {r.prompt.slice(0, 70).replace(/\s+/g, " ")}{r.prompt.length > 70 ? "…" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
