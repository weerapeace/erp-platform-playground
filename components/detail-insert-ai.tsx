"use client";

/**
 * ✨ AI ดูรูปเสนอจุดเด่น (แท็บในป๊อปแทรก Description ขั้น "จุดเด่น") — เจ้าของสั่ง 2026-11-15
 *   เสนอ 7 ข้อ ไทย + อังกฤษ · ติ๊ก = เอาข้อนี้ (สุ่มใหม่ก็ไม่หาย) · ⭐ ชอบ = จำไว้ ใส่ครั้งหน้าถ้าเหมาะ · 🚫 ไม่ชอบ = AI ไม่เขียนแบบนี้อีก (เลิกทำได้)
 *   ทุกข้อมีป้ายที่มา: เห็นในรูป N · จากข้อมูล · จากคลัง · ต้องตรวจ · แก้ข้อความได้ (ภาษาอื่นแปลตามให้)
 *   🧠 ความจำ AI แก้ได้ในแท็บนี้ (ชอบ / ไม่ชอบ / กฎที่พิมพ์เอง · ใช้กับแบรนด์นี้หรือทุกแบรนด์)
 * state อยู่ที่ป๊อปแม่ (components/detail-insert) — ล้างหน้า/ข้ามขั้นได้ · บรรทัดที่ติ๊ก = sel.ai (lib/detail-snippets composeLines)
 * API: /api/ai/desc-highlights (ศูนย์ AI key ai.desc_highlights · โควตาครั้งต่อคน) · /api/ai/desc-memory
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { translateContent } from "@/lib/content-translate";

export type AiSrc = "seen" | "data" | "library" | "check" | "own";
export type AiItem = { id: string; th: string; en: string; src: AiSrc; photos: number[]; note_th: string; note_en: string; fav?: boolean; on: boolean; keep?: boolean; stale?: "th" | "en" | null };
export type AiState = { items: AiItem[]; shown: string[]; mismatch: { th: string; en: string } | null; ran: boolean };
export const EMPTY_AI: AiState = { items: [], shown: [], mismatch: null, ran: false };
/** บรรทัดที่ติ๊ก → ใส่คำอธิบาย */
export const aiPicked = (s: AiState) => s.items.filter((x) => x.on && x.th.trim()).map((x) => ({ th: x.th.trim(), en: x.en.trim() || null }));

type MemEntry = { text: string; by?: string | null; by_name?: string | null; scope: string };
type Mem = { liked: MemEntry[]; disliked: MemEntry[]; rules: MemEntry[] };
type Status = { model: string; est_thb: number; images: number; quota: { used: number; limit: number | null; on: boolean }; configured: boolean };
const RECOMMENDED = 4;
let seq = 0;
/** รหัสประจำแถว (กันช่องแก้ข้อความหลุดโฟกัสตอนพิมพ์ — key ต้องไม่เปลี่ยนตามข้อความ) */
const newId = () => `ai${Date.now().toString(36)}${(seq++).toString(36)}`;
const key = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export function DetailInsertAi({ parentId, brandId, isEn, state, setState, chosen }: {
  parentId: string;
  brandId: string | null;
  isEn: boolean;
  state: AiState;
  setState: (fn: (p: AiState) => AiState) => void;
  /** บรรทัดที่เลือกในขั้นอื่นแล้ว (ไทย) — ส่งให้ AI เลี่ยงเรื่องซ้ำ */
  chosen: string[];
}) {
  const toast = useToast();
  const { user } = useAuth();
  const t = (th: string, en: string) => (isEn ? en : th);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mem, setMem] = useState<Mem>({ liked: [], disliked: [], rules: [] });
  const [canManage, setCanManage] = useState(false);
  const [memOpen, setMemOpen] = useState(false);
  const [undo, setUndo] = useState<{ item: AiItem; at: number } | null>(null);
  const [own, setOwn] = useState("");
  const [rule, setRule] = useState("");
  const [ruleAll, setRuleAll] = useState(false);
  const [extra, setExtra] = useState("");

  const loadStatus = async () => {
    try {
      const j = await apiFetch(`/api/ai/desc-highlights?parent_id=${encodeURIComponent(parentId)}`).then((r) => r.json());
      if (j.data) setStatus(j.data as Status);
      else if (j.error) setErr(String(j.error));
    } catch { /* โชว์ปุ่มได้แม้โหลดสถานะไม่ได้ */ }
  };
  const loadMem = async () => {
    try {
      const j = await apiFetch(`/api/ai/desc-memory${brandId ? `?brand_id=${encodeURIComponent(brandId)}` : ""}`).then((r) => r.json());
      if (j.data) { setMem(j.data as Mem); setCanManage(!!j.can_manage); }
    } catch { /* ไม่มีความจำ = ใช้ได้ปกติ */ }
  };
  useEffect(() => {
    void loadStatus();
    void loadMem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, brandId]);

  const quota = status?.quota;
  const full = !!quota && quota.limit !== null && quota.used >= quota.limit;
  const picked = state.items.filter((x) => x.on).length;
  const isLiked = (th: string) => mem.liked.some((m) => key(m.text) === key(th));

  /** เรียก AI — reroll = เก็บข้อที่ติ๊กไว้ แล้วขอข้อใหม่แทนข้อที่ไม่ได้ติ๊ก */
  const run = async (reroll: boolean) => {
    setBusy(true);
    setErr("");
    try {
      const keep = reroll ? state.items.filter((x) => x.on && x.th.trim()) : [];
      const r = await apiFetch("/api/ai/desc-highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: parentId, keep: keep.map((k) => ({ th: k.th, en: k.en })), shown: state.shown, chosen, extra }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || t("AI ตอบกลับไม่สำเร็จ", "AI request failed"));
      const got = ((j.data?.items ?? []) as Omit<AiItem, "on" | "id">[]);
      setState((p) => {
        const keptKeys = new Set(keep.map((k) => key(k.th)));
        const kept = p.items.filter((x) => keptKeys.has(key(x.th)));
        const fresh = got.filter((x) => !x.keep).map((x, i) => ({ ...x, id: newId(), on: !reroll && i < RECOMMENDED, stale: null }));
        return {
          items: [...kept, ...fresh],
          shown: [...new Set([...p.shown, ...got.map((x) => x.th)])].slice(-40),
          mismatch: j.data?.mismatch ?? null,
          ran: true,
        };
      });
      if (j.data?.quota) setStatus((s) => (s ? { ...s, quota: j.data.quota, model: j.data.model ?? s.model } : s));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("AI ตอบกลับไม่สำเร็จ", "AI request failed"));
    } finally {
      setBusy(false);
    }
  };

  const memCall = async (action: "add" | "remove", list: keyof Mem, text: string, scope: "brand" | "all" = "brand") => {
    try {
      const r = await apiFetch("/api/ai/desc-memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, list, text, scope, brand_id: brandId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || t("บันทึกความจำไม่สำเร็จ", "Couldn't save memory"));
      setMem(j.data as Mem);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("บันทึกความจำไม่สำเร็จ", "Couldn't save memory"));
      return false;
    }
  };
  const setItem = (i: number, patch: Partial<AiItem>) => setState((p) => ({ ...p, items: p.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  const star = async (i: number) => {
    const it = state.items[i];
    if (isLiked(it.th)) {
      const m = mem.liked.find((x) => key(x.text) === key(it.th));
      await memCall("remove", "liked", it.th, m?.scope === "*" ? "all" : "brand");
    } else if (await memCall("add", "liked", it.th)) {
      toast.success(t("จำไว้แล้ว — ครั้งหน้า AI จะใส่ข้อนี้ถ้าเหมาะกับสินค้า", "Saved — AI will use this next time when it fits"));
    }
  };
  const dislike = async (i: number) => {
    const it = state.items[i];
    setState((p) => ({ ...p, items: p.items.filter((_, k) => k !== i) }));
    setUndo({ item: it, at: i });
    await memCall("add", "disliked", it.th);
  };
  const undoDislike = async () => {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    setState((p) => { const items = [...p.items]; items.splice(Math.min(u.at, items.length), 0, u.item); return { ...p, items }; });
    await memCall("remove", "disliked", u.item.th);
  };
  /** แก้ข้อความ → ออกจากช่อง = แปลอีกภาษาตาม */
  const retranslate = async (i: number, lang: "th" | "en") => {
    const it = state.items[i];
    const src = lang === "th" ? it.th : it.en;
    if (!src.trim()) return;
    try {
      const [out] = await translateContent([src], lang === "th" ? "en" : "th", { place: "product" });
      if (out?.trim()) setItem(i, lang === "th" ? { en: out.trim(), stale: null } : { th: out.trim(), stale: null });
    } catch { /* แปลไม่ได้ = ให้แก้เอง */ }
  };
  const addOwn = async () => {
    const v = own.replace(/\s+/g, " ").trim();
    if (!v) return;
    setOwn("");
    const thai = /[฀-๿]/.test(v);
    let other = "";
    try { other = ((await translateContent([v], thai ? "en" : "th", { place: "product" }))[0] ?? "").trim(); } catch { /* แปลไม่ได้ */ }
    setState((p) => ({ ...p, items: [...p.items, { id: newId(), th: thai ? v : other || v, en: thai ? other : v, src: "own", photos: [], note_th: "", note_en: "", on: true, stale: null }] }));
  };

  const badge = (it: AiItem) => {
    const map: Record<AiSrc, [string, string, string]> = {
      seen: ["bg-emerald-50 text-emerald-700", it.photos.length ? `เห็นในรูป ${it.photos.join(", ")}` : "เห็นในรูป", it.photos.length ? `Photo ${it.photos.join(", ")}` : "Seen in photo"],
      data: ["bg-slate-100 text-slate-600", "จากข้อมูล", "From data"],
      library: ["bg-sky-50 text-sky-700", "จากคลัง", "From library"],
      check: ["bg-amber-50 text-amber-800", "ต้องตรวจ", "Please verify"],
      own: ["bg-violet-50 text-violet-700", "พิมพ์เอง", "Typed"],
    };
    const [cls, th, en] = map[it.src] ?? map.check;
    return <span className={`shrink-0 rounded-full px-1.5 py-px text-[10.5px] ${cls}`} title={isEn ? it.note_en || it.note_th : it.note_th}>{t(th, en)}</span>;
  };

  const thisMonth = quota ? (quota.limit !== null ? t(`เดือนนี้ใช้ไป ${quota.used}/${quota.limit} ครั้ง`, `This month ${quota.used}/${quota.limit} uses`) : t(`เดือนนี้ใช้ไป ${quota.used} ครั้ง`, `Used ${quota.used} times this month`)) : "";
  return (
    <div className="space-y-2" data-insert-ai>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11.5px] text-slate-600">
        <Icon name="ai" />
        <span>{t(`AI ดูรูป ${status?.images ?? "…"} รูป + ข้อมูลสินค้า แล้วเสนอ 7 ข้อ (ไทย + อังกฤษ)`, `AI reads ${status?.images ?? "…"} photos + product data and suggests 7 points (Thai + English)`)}</span>
        {status && <span className="text-slate-400">· {status.model} · ~{status.est_thb.toFixed(2)} {t("บาท/ครั้ง", "THB per run")}</span>}
        {thisMonth && <span className={`ml-auto ${full ? "font-medium text-rose-600" : "text-slate-500"}`} data-ai-quota>{thisMonth}</span>}
      </div>

      {!state.ran ? (
        <div className="space-y-2">
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={t("คำสั่งเพิ่มครั้งนี้ (ไม่ใส่ก็ได้) เช่น เน้นความน่ารัก", "Extra instruction (optional), e.g. focus on cuteness")} aria-label={t("คำสั่งเพิ่มให้ AI", "Extra instruction for AI")}
            className="h-8 w-full rounded-md border border-slate-200 px-2 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-orange-400" />
          <button type="button" onClick={() => void run(false)} disabled={busy || full || status?.quota.on === false} data-ai-run
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
            <Icon name="ai" /> {busy ? t("AI กำลังดูรูป…", "AI is reading the photos…") : t("ให้ AI เสนอ 7 ข้อ", "Ask AI for 7 points")}
          </button>
          {full && <p className="text-[11.5px] text-rose-600">{t("ครบโควตาเดือนนี้แล้ว — ขอผู้ดูแลเพิ่มได้ที่ศูนย์ AI · ติ๊กข้อความสำเร็จรูป/พิมพ์เองได้ตามปกติ", "Monthly limit reached — ask an admin · phrases and typing still work")}</p>}
          {status?.quota.on === false && <p className="text-[11.5px] text-rose-600">{t("ผู้ดูแลปิดฟีเจอร์นี้ไว้ (ศูนย์ AI ที่เสียเงิน)", "An admin turned this feature off")}</p>}
          <p className="text-[11px] text-slate-400">{t("AI ไม่เขียนตัวเลขขนาด/น้ำหนัก · ไม่อ้างวัสดุหรือคุณสมบัติที่ไม่มีข้อมูล · ทุกข้อบอกที่มา", "AI won't write sizes/weights or unproven claims · every point shows where it came from")}</p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-[11px] text-slate-500">
            {t("ติ๊ก = เอาข้อนี้ (สุ่มใหม่ก็ไม่หาย) · ดาว = ชอบ จำไว้ใส่ครั้งหน้าถ้าเหมาะ · ห้าม = ไม่ชอบ AI ไม่เขียนแบบนี้อีก", "Tick = keep (stays on reroll) · Star = like, remembered for next time · Block = dislike, AI won't write this again")}
          </p>
          {state.items.map((it, i) => {
            const liked = isLiked(it.th);
            const shownLang = isEn ? "en" : "th";
            const otherLang = isEn ? "th" : "en";
            return (
              <div key={it.id} className={`flex items-start gap-1.5 rounded-lg border px-2 py-1.5 ${it.on ? "border-orange-300 bg-orange-50" : "border-slate-200"}`} data-ai-item={i}>
                <input type="checkbox" checked={it.on} onChange={(e) => setItem(i, { on: e.target.checked })} className="mt-1.5 h-4 w-4 shrink-0 accent-orange-500" aria-label={t("เอาข้อนี้", "Keep this point")} />
                <div className="min-w-0 flex-1">
                  <input value={it[shownLang]} onChange={(e) => setItem(i, { [shownLang]: e.target.value, stale: otherLang } as Partial<AiItem>)} onBlur={() => { if (it.stale === otherLang) void retranslate(i, shownLang); }}
                    aria-label={t("แก้ข้อความ", "Edit text")} className="h-7 w-full rounded border border-transparent bg-transparent px-1 text-[13px] text-slate-800 hover:border-slate-200 focus:border-orange-300 focus:bg-white focus:outline-none" />
                  <div className="flex flex-wrap items-center gap-1 px-1 text-[11px] text-slate-400">
                    {badge(it)}
                    {it.fav && <span className="rounded-full bg-amber-50 px-1.5 py-px text-[10.5px] text-amber-700">{t("จากที่ชอบ", "From your likes")}</span>}
                    <span className="min-w-0 truncate">{it.stale === otherLang ? t("กำลังแปลใหม่…", "re-translating…") : it[otherLang]}</span>
                  </div>
                </div>
                <button type="button" onClick={() => void star(i)} aria-pressed={liked} title={liked ? t("เลิกชอบ", "Unlike") : t("ชอบ — จำไว้ ครั้งหน้าใส่ถ้าเหมาะ", "Like — remember for next time")} data-ai-star={i}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[14px] ${liked ? "border-amber-300 bg-amber-50 text-amber-600" : "border-slate-200 text-slate-400 hover:text-amber-600"}`}><Icon name="star" /></button>
                <button type="button" onClick={() => void dislike(i)} title={t("ไม่ชอบ — AI จะไม่เขียนแบบนี้อีก", "Dislike — AI won't write this again")} data-ai-dislike={i}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 text-[14px] text-slate-400 hover:border-rose-300 hover:text-rose-600"><Icon name="forbidden" /></button>
              </div>
            );
          })}
          {undo && (
            <p className="text-[11.5px] text-slate-500" data-ai-undo>
              {t(`ซ่อนแล้ว "${undo.item.th}" — AI จะไม่เขียนแบบนี้อีก`, `Hidden "${undo.item.en || undo.item.th}" — AI won't write this again`)}{" "}
              <button type="button" onClick={() => void undoDislike()} className="text-orange-600 hover:underline">{t("เลิกทำ", "Undo")}</button>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className={`text-[11.5px] ${picked > RECOMMENDED ? "text-amber-700" : "text-slate-500"}`}>{t(`เลือก ${picked} ข้อ (แนะนำ ${RECOMMENDED})`, `${picked} picked (suggested ${RECOMMENDED})`)}</span>
            <button type="button" onClick={() => void run(true)} disabled={busy || full} data-ai-reroll
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <Icon name="refresh" /> {busy ? t("กำลังคิด…", "Thinking…") : t(`สุ่มใหม่ เฉพาะข้อที่ไม่ได้ติ๊ก${status ? ` (~${status.est_thb.toFixed(2)} บาท)` : ""}`, `Reroll unticked${status ? ` (~${status.est_thb.toFixed(2)} THB)` : ""}`)}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <input value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addOwn(); } }}
              placeholder={t("พิมพ์จุดเด่นเอง (แปลอีกภาษาให้)", "Type your own point (auto-translated)")} aria-label={t("พิมพ์จุดเด่นเอง", "Your own point")}
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-orange-400" />
            <button type="button" onClick={() => void addOwn()} className="h-8 rounded-md border border-slate-200 px-2.5 text-[12px] text-slate-700 hover:bg-slate-50">{t("เพิ่ม", "Add")}</button>
          </div>
        </div>
      )}
      {err && <p className="rounded-md bg-rose-50 px-2 py-1 text-[11.5px] text-rose-700" data-ai-error>{err}</p>}

      {/* 🧠 ความจำ AI — ชอบ / ไม่ชอบ / กฎ (แบรนด์นี้ + ทุกแบรนด์) */}
      <div className="rounded-lg border border-slate-200" data-ai-memory>
        <button type="button" onClick={() => setMemOpen((v) => !v)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[12px] text-slate-600 hover:bg-slate-50">
          <Icon name="library" /> {t("ความจำ AI", "AI memory")}
          <span className="text-slate-400">{t(`ชอบ ${mem.liked.length} · ไม่ชอบ ${mem.disliked.length} · กฎ ${mem.rules.length}`, `liked ${mem.liked.length} · disliked ${mem.disliked.length} · rules ${mem.rules.length}`)}</span>
          <span className="ml-auto text-slate-400">{memOpen ? "▴" : "▾"}</span>
        </button>
        {memOpen && (
          <div className="space-y-2 border-t border-slate-100 px-2.5 py-2">
            {(["liked", "disliked", "rules"] as const).map((l) => (
              <div key={l}>
                <div className="mb-1 text-[11px] font-medium text-slate-500">
                  {l === "liked" ? t("ชอบ — ใส่เมื่อเหมาะกับสินค้า", "Liked — used when it fits") : l === "disliked" ? t("ไม่ชอบ — AI จะไม่เขียนแบบนี้อีก", "Disliked — never written again") : t("กฎที่พิมพ์เอง", "Your rules")}
                </div>
                <div className="flex flex-wrap gap-1">
                  {mem[l].length ? mem[l].map((m) => (
                    <span key={`${m.scope}:${m.text}`} className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] ${l === "liked" ? "bg-amber-50 text-amber-800" : l === "disliked" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-800"}`}>
                      <span className="truncate">{m.text}</span>
                      <span className="shrink-0 text-[10px] opacity-60">{m.scope === "*" ? t("ทุกแบรนด์", "all brands") : t("แบรนด์นี้", "this brand")}</span>
                      {(canManage || !m.by || m.by === user?.id) && (
                        <button type="button" onClick={() => void memCall("remove", l, m.text, m.scope === "*" ? "all" : "brand")} aria-label={t("เอาออก", "Remove")} className="shrink-0 opacity-60 hover:opacity-100"><Icon name="cancel" /></button>
                      )}
                    </span>
                  )) : <span className="text-[11px] text-slate-400">{t("ยังไม่มี", "None yet")}</span>}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-1.5">
              <input value={rule} onChange={(e) => setRule(e.target.value)} placeholder={t("กฎใหม่ เช่น ห้ามเขียนว่ากันน้ำ ถ้าไม่ได้ระบุวัสดุกันน้ำ", "New rule, e.g. never say waterproof unless stated")} aria-label={t("กฎใหม่", "New rule")}
                className="h-8 min-w-[12rem] flex-1 rounded-md border border-slate-200 px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-orange-400" />
              <label className="flex items-center gap-1 text-[11.5px] text-slate-600"><input type="checkbox" checked={ruleAll} onChange={(e) => setRuleAll(e.target.checked)} className="h-3.5 w-3.5 accent-orange-500" />{t("ทุกแบรนด์", "All brands")}</label>
              <button type="button" onClick={() => { const v = rule.trim(); if (!v) return; void memCall("add", "rules", v, ruleAll ? "all" : "brand").then((ok) => { if (ok) setRule(""); }); }}
                className="h-8 rounded-md border border-slate-200 px-2.5 text-[12px] text-slate-700 hover:bg-slate-50">{t("เพิ่มกฎ", "Add rule")}</button>
            </div>
            <p className="text-[10.5px] text-slate-400">{t("ทุกคนกดชอบ/ไม่ชอบได้ · ลบของคนอื่นได้เฉพาะผู้ดูแล · ทุกการแก้บันทึกประวัติ", "Anyone can like/dislike · only admins remove others' entries · every change is logged")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
