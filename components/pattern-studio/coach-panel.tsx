"use client";
/**
 * 🧑‍🏫 CoachPanel — โค้ชแพทเทิร์น (Bag CAD รอบ I3 · ส่วนของสตูดิโอแพทเทิร์น)
 *   บน: โค้ชในเครื่อง (ฟรี) — "ควรทำอะไรต่อ" เรียงตามลำดับงานช่าง + เหตุผล + ปุ่มพาไปเครื่องมือ
 *   ล่าง: ถามโค้ช AI (เสียเงิน · ai.pattern_coach) — ต้องกด "ดูข้อความที่จะส่ง" ก่อน ปุ่มส่งถึงจะกดได้ · ไม่มีรูป ไม่มีราคา/ชื่อลูกค้า
 *   สูตร: lib/pattern-coach (coachTips · coachSummary) · API: POST /api/pattern-projects/ai-coach
 *
 *   <CoachPanel input={{ pieces, seams, issues }} onTool={(id) => …} ai />
 * ใช้ที่: components/pattern-studio · คู่มือ: docs/pattern-studio.md (รอบ I3)
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { coachSummary, coachTips, type CoachInput, type CoachTip } from "@/lib/pattern-coach";

const LV: Record<CoachTip["level"], { th: string; en: string; c: string }> = {
  must: { th: "ต้องแก้", en: "Must fix", c: "bg-rose-100 text-rose-800" },
  next: { th: "ขั้นถัดไป", en: "Next", c: "bg-sky-100 text-sky-800" },
  tip: { th: "เคล็ดลับ", en: "Tip", c: "bg-slate-100 text-slate-700" },
  done: { th: "พร้อม", en: "Ready", c: "bg-emerald-100 text-emerald-800" },
};

export function CoachPanel({ input, onTool, ai = false }: { input: CoachInput; onTool?: (toolId: string) => void; /** ผู้ใช้มีสิทธิ์แก้ = ถาม AI ได้ (เซิร์ฟเวอร์ตรวจสิทธิ์ AI อีกชั้น) */ ai?: boolean }) {
  const t = useT();
  const tips = useMemo(() => coachTips(input), [input]);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ tips: { do: string; why: string }[]; note: string } | null>(null);
  const summary = useMemo(() => coachSummary(input, q), [input, q]);
  const ask = async () => {
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await apiFetch("/api/pattern-projects/ai-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setRes(j.data);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2.5 rounded-lg border border-violet-200 bg-violet-50/50 p-3 text-xs" data-coach-panel>
      <div className="flex items-center gap-1.5 font-medium text-slate-700"><Icon value="i:sparkles" className="text-sm text-violet-600" />{t("โค้ชแนะนำ — ควรทำอะไรต่อ", "Coach — what to do next")}<span className="ml-auto text-[10px] font-normal text-slate-400">{t("ดูจากแบบตอนนี้ · ฟรี ไม่ส่งข้อมูลออก", "From the current pattern · free, nothing sent")}</span></div>
      <ol className="space-y-1.5">
        {tips.map((x) => (
          <li key={x.id} className="flex items-start gap-2 rounded-md bg-white p-2" data-coach-tip={x.id}>
            <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${LV[x.level].c}`}>{t(LV[x.level].th, LV[x.level].en)}</span>
            <div className="min-w-0 flex-1"><div className="text-slate-800">{t(x.th, x.en)}</div><div className="text-[11px] text-slate-500">{t("ทำไม: ", "Why: ")}{t(x.whyTh, x.whyEn)}</div></div>
            {x.tool && onTool && <button type="button" onClick={() => onTool(x.tool!)} className="h-7 shrink-0 rounded-md border border-slate-200 px-2 hover:bg-slate-50">{t("พาไป", "Go")}</button>}
          </li>
        ))}
      </ol>
      {ai && (
        <div className="space-y-1.5 rounded-md border border-slate-200 bg-white p-2" data-coach-ai>
          <div className="font-medium text-slate-600">{t("ถามโค้ช AI (เสียเงินตามการใช้)", "Ask the AI coach (paid per use)")}</div>
          <textarea value={q} onChange={(e) => { setQ(e.target.value.slice(0, 500)); }} rows={2} placeholder={t("คำถาม (ไม่ใส่ก็ได้) เช่น ชิ้นข้างควรกว้างเท่าไรถ้าจะใส่ของหนัก", "Question (optional), e.g. how wide should the gusset be for heavy items")} className="w-full resize-y rounded-md border border-slate-200 p-1.5" />
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-coach-preview onClick={() => setShown(!shown)} aria-expanded={shown} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50">{shown ? t("ซ่อนข้อความที่จะส่ง", "Hide what will be sent") : t("ดูข้อความที่จะส่ง", "See what will be sent")}</button>
            <button type="button" data-coach-send disabled={!shown || busy} onClick={() => void ask()} title={shown ? undefined : t("กดดูข้อความที่จะส่งก่อน", "Look at what will be sent first")} className="h-7 rounded-md bg-violet-600 px-3 text-white hover:bg-violet-700 disabled:opacity-40">{busy ? t("โค้ชกำลังคิด…", "Thinking…") : t("ส่งให้โค้ช AI", "Send to the AI coach")}</button>
            <span className="text-[10px] text-slate-400">{t(`${summary.length.toLocaleString()} ตัวอักษร · ไม่มีรูป ราคา หรือชื่อลูกค้า`, `${summary.length.toLocaleString()} chars · no photos, prices or customer names`)}</span>
          </div>
          {shown && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-[10px] text-slate-600" data-coach-summary>{summary}</pre>}
          {err && <p className="text-[11px] text-rose-700">{err}</p>}
          {res && (
            <div className="space-y-1" data-coach-result>
              <div className="text-[10px] text-amber-700">{t("คำแนะนำจาก AI — เป็นความเห็น ตรวจกับของจริงก่อนทำตาม", "From the AI — an opinion, check against the real thing first")}</div>
              <ol className="list-decimal space-y-1 pl-4">{res.tips.map((x, i) => <li key={i}><span className="text-slate-800">{x.do}</span>{x.why && <span className="text-slate-500"> — {x.why}</span>}</li>)}</ol>
              {res.note && <p className="text-[11px] text-slate-500">{res.note}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
