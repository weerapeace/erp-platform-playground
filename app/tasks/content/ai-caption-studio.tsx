"use client";
/**
 * ✨ ป๊อป "ให้ AI เขียนแคปชั่น" แบบเลือกได้ (drawer โพสต์ · คอนเทนต์ 1 ใบ) — เจ้าของเลือกข้อเสนอ 1-6 เมื่อ 2026-11-20
 *   ขั้น 1 ตั้งค่า: รูปที่ AI จะอ่าน (กด × เอาออก) · คำสั่งประจำ (บันทึก/แก้/ลบ/ตั้งค่าเริ่มต้น) · คำสั่งเพิ่มครั้งนี้ · เขียน 1 หรือ 3 แบบ
 *                  · ดูรูปละเอียด · รุ่น AI + ราคา (เฉพาะผู้ดูแล) / "ใช้ได้อีก N ครั้ง" (พนักงาน) · ความจำ AI
 *   ขั้น 2 เลือก: เลือกทีละย่อหน้าจากหลายแบบ หรือ "ใช้ทั้งแบบ" · ชอบ/ไม่ชอบ ต่อย่อหน้า → ความจำ AI ของแบรนด์
 *                  · กด "ใช้แคปชั่น" = ใส่ช่องแคปชั่น (ยังต้องกดบันทึกโพสต์) + ย้อนกลับได้ในแจ้งเตือน · ย่อหน้าที่กดเลือกเอง = จำว่าชอบให้
 * API: /api/ai/caption-options (GET สถานะ · POST เขียน) · /api/ai/caption-presets · /api/ai/desc-memory?kind=caption
 * ของกลาง: ERPModal · AiMemoryPanel/useAiMemory · Icon · toast.undo · r2ImageUrl
 * ป๊อปแบบเดิม (AiCaptionModal) ยังใช้กับ "สั่งหลายคอนเทนต์พร้อมกัน" ในหน้ารายการ
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { r2ImageUrl } from "@/lib/r2-image";
import { AiMemoryPanel, useAiMemory } from "@/components/ai-memory";

type Quota = { used: number; limit: number | null; remaining: number | null; shared?: boolean; on: boolean };
type Status = { can_see_cost: boolean; images: { key: string }[]; quota: Quota; configured: boolean; model?: string; est_thb?: number; models?: { id: string; label: string; note: string; est_thb: number }[] };
type Preset = { id: string; name: string; text: string; is_default?: boolean; scope: string; by?: string | null };
type Variant = { paragraphs: string[]; hashtags: string[] };
type Result = { platform: string; variants: Variant[] };

const LETTER = "ABCDE";

export function AiCaptionStudio({ contentId, brandId, platforms, onClose, onApply }: {
  contentId: string;
  brandId: string | null;
  platforms: { code: string; label: string }[];
  onClose: () => void;
  /** ใส่แคปชั่นลงช่อง — คืนฟังก์ชันย้อนกลับ */
  onApply: (items: { platform: string; caption: string; hashtags: string[] }[]) => () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { user } = useAuth();
  const memory = useAiMemory("caption", brandId);
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  // ── ขั้น 1 ──
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState<string>("");
  const [canManagePresets, setCanManagePresets] = useState(false);
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; name: string; text: string; all: boolean } | null>(null);
  const [extra, setExtra] = useState("");
  const [variants, setVariants] = useState<1 | 3>(3);
  const [high, setHigh] = useState(false);
  const [model, setModel] = useState<string>("");
  // ── ขั้น 2 ──
  const [results, setResults] = useState<Result[]>([]);
  const [tab, setTab] = useState("");
  const [pick, setPick] = useState<Record<string, number[]>>({});        // platform → [variant ต่อย่อหน้า] (-1 = ไม่ใช้ย่อหน้านี้)
  const [touched, setTouched] = useState<Set<string>>(new Set());          // "platform|row" ที่ผู้ใช้กดเลือกเอง
  const [useTags, setUseTags] = useState(true);

  const platformCodes = useMemo(() => platforms.map((p) => p.code), [platforms]);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/ai/caption-options?content_id=${contentId}&platforms=${encodeURIComponent(platformCodes.join(","))}`).then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.data) { setStatus(j.data as Status); setModel((j.data as Status).model ?? ""); } else setErr(String(j.error ?? t("โหลดไม่สำเร็จ", "Couldn't load"))); })
      .catch(() => alive && setErr(t("โหลดไม่สำเร็จ", "Couldn't load")));
    return () => { alive = false; };
  }, [contentId, platformCodes, t]);
  const loadPresets = (keepId?: string) => apiFetch(`/api/ai/caption-presets${brandId ? `?brand_id=${brandId}` : ""}`).then((r) => r.json()).then((j) => {
    if (!j.data) return;
    setPresets(j.data.items as Preset[]); setCanManagePresets(!!j.can_manage);
    setPresetId((cur) => keepId ?? (cur || (j.data.defaultId as string | null) || ""));
  }).catch(() => {});
  useEffect(() => { void loadPresets(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [brandId]);

  const preset = presets.find((p) => p.id === presetId) ?? null;
  const images = (status?.images ?? []).filter((i) => !excluded.has(i.key));
  const isAdmin = !!status?.can_see_cost;
  const curModel = status?.models?.find((m) => m.id === model);
  const perPlatform = curModel ? curModel.est_thb * (variants === 3 ? 1 : 0.7) * (high ? 2.5 : 1) : null;
  const quotaText = (q?: Quota) => !q ? "" : q.remaining === null ? t("ใช้ได้ไม่จำกัด", "Unlimited") : q.shared
    ? t(`ใช้ได้อีกประมาณ ${q.remaining} ครั้ง (งบรวมของทีมเดือนนี้)`, `About ${q.remaining} uses left (team budget)`)
    : t(`ใช้ได้อีก ${q.remaining} ครั้งเดือนนี้`, `${q.remaining} uses left this month`);
  const outOfQuota = !!status?.quota && status.quota.remaining !== null && status.quota.remaining < platforms.length;

  // ── คำสั่งประจำ: บันทึก / ลบ (ย้อนกลับได้) / ตั้งค่าเริ่มต้น ──
  const presetCall = async (payload: Record<string, unknown>, okMsg?: string) => {
    const r = await apiFetch("/api/ai/caption-presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, ...payload }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { toast.error(j.error || t("บันทึกไม่สำเร็จ", "Couldn't save")); return false; }
    setPresets(j.data.items as Preset[]);
    if (okMsg) toast.success(okMsg);
    return true;
  };
  const savePreset = async () => {
    if (!editing) return;
    const ok = await presetCall({ action: "save", scope: editing.all ? "all" : "brand", preset: { id: editing.id, name: editing.name, text: editing.text } }, t("บันทึกคำสั่งประจำแล้ว", "Preset saved"));
    if (ok) { setEditing(null); void loadPresets(); }
  };
  const removePresetUndo = async (p: Preset) => {
    const scope = p.scope === "*" ? "all" : "brand";
    if (!(await presetCall({ action: "remove", scope, id: p.id }))) return;
    if (presetId === p.id) setPresetId("");
    toast.undo(t(`ลบคำสั่ง “${p.name}” แล้ว`, `Deleted “${p.name}”`), async () => { await presetCall({ action: "save", scope, preset: { id: p.id, name: p.name, text: p.text, is_default: p.is_default } }); });
  };

  // ── เขียน ──
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch("/api/ai/caption-options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        content_id: contentId, platforms: platformCodes, variants, detail_high: high,
        extra: [preset?.text ?? "", extra.trim()].filter(Boolean).join("\n"),
        image_keys: excluded.size ? images.map((i) => i.key) : undefined,
        ...(isAdmin && model ? { model } : {}),
      }) });
      const j = await r.json().catch(() => ({}));
      if (j.quota && status) setStatus({ ...status, quota: j.quota });
      if (!r.ok || j.error || !j.data) throw new Error(j.error || t("AI เขียนไม่สำเร็จ", "AI failed"));
      if (j.data.quota && status) setStatus({ ...status, quota: j.data.quota });
      const res = j.data.results as Result[];
      setResults(res); setTab(res[0]?.platform ?? "");
      setPick(Object.fromEntries(res.map((x) => [x.platform, Array.from({ length: Math.max(...x.variants.map((v) => v.paragraphs.length)) }, (_, i) => (x.variants[0].paragraphs[i] ? 0 : x.variants.findIndex((v) => v.paragraphs[i])))])));
      setTouched(new Set());
      if (j.data.warning) toast.warning(String(j.data.warning));
      setStep(2);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const composed = (res: Result) => (pick[res.platform] ?? []).map((v, i) => (v >= 0 ? res.variants[v]?.paragraphs[i] ?? "" : "")).filter(Boolean).join("\n\n");
  const tagsFor = (res: Result) => {
    const counts = new Map<number, number>();
    for (const v of pick[res.platform] ?? []) if (v >= 0) counts.set(v, (counts.get(v) ?? 0) + 1);
    const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    return res.variants[main]?.hashtags ?? [];
  };
  const setRow = (platform: string, row: number, v: number) => {
    setPick((p) => ({ ...p, [platform]: (p[platform] ?? []).map((x, i) => (i === row ? v : x)) }));
    setTouched((s) => new Set(s).add(`${platform}|${row}`));
  };
  const memState = (text: string): "liked" | "disliked" | null =>
    memory.mem.liked.some((m) => m.text === text.trim().slice(0, 200)) ? "liked" : memory.mem.disliked.some((m) => m.text === text.trim().slice(0, 200)) ? "disliked" : null;
  const vote = (text: string, list: "liked" | "disliked") => {
    const s = memState(text);
    void memory.call(s === list ? "remove" : "add", list, text.trim().slice(0, 200));
  };
  const apply = () => {
    const items = results.map((res) => ({ platform: res.platform, caption: composed(res), hashtags: useTags ? tagsFor(res) : [] })).filter((x) => x.caption.trim());
    if (!items.length) { toast.error(t("ยังไม่ได้เลือกย่อหน้า", "Pick at least one paragraph")); return; }
    const undo = onApply(items);
    // ย่อหน้าที่ผู้ใช้กดเลือกเอง (ตอนมีหลายแบบ) = จำว่าชอบ
    for (const res of results) if (res.variants.length > 1) (pick[res.platform] ?? []).forEach((v, i) => {
      const text = v >= 0 ? res.variants[v]?.paragraphs[i] : "";
      if (text && touched.has(`${res.platform}|${i}`) && memState(text) === null) void memory.call("add", "liked", text.trim().slice(0, 200));
    });
    toast.undo(t(`ใส่แคปชั่น ${items.length} แพลตฟอร์มแล้ว — กด “บันทึก” เพื่อเก็บ`, `Filled ${items.length} caption(s) — press Save to keep`), undo);
    onClose();
  };

  const cur = results.find((r) => r.platform === tab) ?? results[0];
  const btn = "h-9 px-4 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50";
  const footer = (
    <div className="flex flex-wrap items-center gap-2 w-full">
      <span className="text-[11px] text-slate-500 min-w-0">
        {step === 1
          ? isAdmin
            ? perPlatform != null ? t(`ประมาณ ~${(perPlatform * platforms.length).toFixed(2)} บาท (${platforms.length} แพลตฟอร์ม · ${model})`, `~${(perPlatform * platforms.length).toFixed(2)} THB (${platforms.length} platforms · ${model})`) : ""
            : quotaText(status?.quota)
          : t("กดเลือกเอง = AI จำว่าชอบ", "Your picks are remembered as liked")}
      </span>
      <span className="flex-1" />
      {step === 1 ? (
        <>
          <button onClick={onClose} disabled={busy} className={btn}>{t("ยกเลิก", "Cancel")}</button>
          <button onClick={() => void run()} disabled={busy || !status || outOfQuota || !status.configured}
            className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-fuchsia-600 rounded-lg hover:bg-fuchsia-700 disabled:opacity-50">
            <Icon name="ai" />{busy ? t("กำลังเขียน...", "Writing...") : t("เขียนเลย", "Write")}
          </button>
        </>
      ) : (
        <>
          <button onClick={() => setStep(1)} className={btn}>{t("เขียนใหม่", "Write again")}</button>
          <button onClick={apply} className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-fuchsia-600 rounded-lg hover:bg-fuchsia-700"><Icon name="done" />{t("ใช้แคปชั่นนี้", "Use this caption")}</button>
        </>
      )}
    </div>
  );

  return (
    <ERPModal open onClose={busy ? () => {} : onClose} size="lg" storageKey="ai-caption-studio" title={t("ให้ AI เขียนแคปชั่น", "AI write captions")}
      description={step === 1 ? t("AI อ่านรูปที่เลือก + prompt ของแต่ละแพลตฟอร์ม + การ์ดแบรนด์ + ความจำ AI", "AI reads the chosen photos + each platform prompt + brand card + AI memory") : t("แตะย่อหน้าที่ชอบ (ผสมจากหลายแบบได้) แล้วกด “ใช้แคปชั่นนี้”", "Tap the paragraphs you like (mix versions), then use it")}
      footer={footer}>
      {!status && !err && <p className="text-sm text-slate-400 py-6 text-center">{t("กำลังโหลด…", "Loading…")}</p>}
      {err && <p className="mb-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-[12px] text-rose-700">{err}</p>}
      {status && step === 1 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">{platforms.map((p) => <span key={p.code} className="text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{p.label}</span>)}</div>
          {!status.configured && <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-800">{t("ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ OPENAI_API_KEY", "AI isn't configured yet")}</p>}

          {/* รูปที่ AI จะอ่าน */}
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1">{t("AI จะอ่านรูปเหล่านี้", "AI will read these photos")} <span className="font-normal text-slate-400">{status.images.length ? t(`(${images.length}/${status.images.length} รูป · กด × เอาออก)`, `(${images.length}/${status.images.length} · tap × to drop)`) : t("(ไม่มีรูป — เขียนจากข้อความ)", "(no photos — text only)")}</span></div>
            <div className="flex flex-wrap gap-1.5">
              {status.images.map((im) => {
                const off = excluded.has(im.key);
                return (
                  <div key={im.key} className={`relative h-12 w-12 rounded-md overflow-hidden border ${off ? "border-dashed border-slate-300 opacity-40" : "border-slate-200"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r2ImageUrl(im.key, 120) ?? ""} alt="" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => setExcluded((s) => { const n = new Set(s); if (n.has(im.key)) n.delete(im.key); else n.add(im.key); return n; })}
                      aria-label={off ? t("ใช้รูปนี้", "Use") : t("ไม่ใช้รูปนี้", "Drop")} className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-white/90 text-[10px] leading-none text-slate-600 shadow">{off ? "+" : "×"}</button>
                  </div>
                );
              })}
            </div>
            <label className="mt-1.5 flex items-center gap-1.5 text-[12px] text-slate-600">
              <input type="checkbox" checked={high} onChange={(e) => setHigh(e.target.checked)} className="h-3.5 w-3.5 accent-fuchsia-600" />
              {t("ดูรูปละเอียด (อ่านตัวหนังสือบนรูปได้ · แพงขึ้นราว 3 เท่า)", "Look closely (reads text on photos · ~3× cost)")}
            </label>
          </div>

          {/* คำสั่งประจำ */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-slate-600">{t("คำสั่งประจำ", "Saved prompt")}</span>
              <button type="button" onClick={() => setManaging((v) => !v)} className="ml-auto text-[11px] text-fuchsia-700 hover:underline">{managing ? t("เสร็จ", "Done") : t("จัดการ", "Manage")}</button>
            </div>
            <select value={presetId} onChange={(e) => setPresetId(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
              <option value="">{t("— ไม่ใช้คำสั่งประจำ —", "— None —")}</option>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? t(" (ค่าเริ่มต้น)", " (default)") : ""}{p.scope === "*" ? t(" · ทุกแบรนด์", " · all brands") : ""}</option>)}
            </select>
            {preset && !managing && <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 px-2 py-1 text-[11.5px] text-slate-600">{preset.text}</p>}
            {managing && (
              <div className="mt-1.5 space-y-1 rounded-lg border border-slate-200 p-2">
                {presets.length === 0 && <p className="text-[11px] text-slate-400">{t("ยังไม่มีคำสั่งประจำ", "No saved prompts yet")}</p>}
                {presets.map((p) => {
                  const mine = canManagePresets || !p.by || p.by === user?.id;
                  return (
                    <div key={`${p.scope}:${p.id}`} className="flex items-center gap-1.5 text-[12px]">
                      <span className="min-w-0 flex-1 truncate">{p.name}{p.scope === "*" && <span className="text-slate-400"> · {t("ทุกแบรนด์", "all brands")}</span>}</span>
                      <button type="button" onClick={() => void presetCall({ action: p.is_default ? "undefault" : "default", scope: p.scope === "*" ? "all" : "brand", id: p.id })}
                        className={`rounded px-1.5 py-0.5 text-[11px] ${p.is_default ? "bg-fuchsia-100 text-fuchsia-800" : "text-slate-500 hover:bg-slate-100"}`}>{p.is_default ? t("ค่าเริ่มต้น", "Default") : t("ตั้งเป็นค่าเริ่มต้น", "Make default")}</button>
                      {mine && <button type="button" onClick={() => setEditing({ id: p.id, name: p.name, text: p.text, all: p.scope === "*" })} aria-label={t("แก้", "Edit")} className="text-slate-500 hover:text-fuchsia-700"><Icon name="edit" /></button>}
                      {mine && <button type="button" onClick={() => void removePresetUndo(p)} aria-label={t("ลบ", "Delete")} className="text-slate-400 hover:text-rose-600"><Icon name="delete" /></button>}
                    </div>
                  );
                })}
                <button type="button" onClick={() => setEditing({ name: "", text: extra.trim(), all: false })} className="text-[11.5px] text-fuchsia-700 hover:underline">+ {t("เพิ่มคำสั่งประจำ", "Add saved prompt")}</button>
              </div>
            )}
            {editing && (
              <div className="mt-1.5 space-y-1.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-2">
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t("ชื่อ เช่น เน้นโปรลด", "Name, e.g. Promo push")} className="h-8 w-full rounded-md border border-slate-200 px-2 text-[12.5px]" />
                <textarea value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} rows={3} placeholder={t("ข้อความคำสั่ง", "Prompt text")} className="w-full rounded-md border border-slate-200 px-2 py-1 text-[12.5px]" />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11.5px] text-slate-600"><input type="checkbox" checked={editing.all} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, all: e.target.checked })} className="h-3.5 w-3.5" />{t("ใช้ทุกแบรนด์", "All brands")}</label>
                  <span className="flex-1" />
                  <button type="button" onClick={() => setEditing(null)} className="h-7 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white">{t("ยกเลิก", "Cancel")}</button>
                  <button type="button" onClick={() => void savePreset()} disabled={!editing.name.trim() || !editing.text.trim()} className="h-7 px-2.5 text-[12px] rounded-md bg-fuchsia-600 text-white disabled:opacity-50">{t("บันทึก", "Save")}</button>
                </div>
              </div>
            )}
          </div>

          {/* คำสั่งเพิ่มครั้งนี้ */}
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{t("คำสั่งเพิ่มครั้งนี้ (ไม่ใส่ก็ได้)", "Extra instruction (optional)")}</span>
            <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={2} disabled={busy}
              placeholder={t("เช่น เน้นโปรลด 50% ถึงสิ้นเดือน", "e.g. push the 50% promo")}
              className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-300" />
            {extra.trim() && !editing && <button type="button" onClick={() => { setManaging(true); setEditing({ name: "", text: extra.trim(), all: false }); }} className="text-[11px] text-fuchsia-700 hover:underline">+ {t("บันทึกเป็นคำสั่งประจำ", "Save as a saved prompt")}</button>}
          </label>

          {/* จำนวนแบบ */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">{t("ให้เขียนมา", "Versions")}</span>
            {([1, 3] as const).map((n) => (
              <button key={n} type="button" onClick={() => setVariants(n)} className={`h-7 px-3 rounded-full border text-[12px] ${variants === n ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{t(`${n} แบบ`, `${n}`)}</button>
            ))}
          </div>

          {/* รุ่น AI (ผู้ดูแล) */}
          {isAdmin && status.models && (
            <div>
              <div className="text-xs font-medium text-slate-600 mb-1">{t("รุ่น AI", "AI model")} <span className="font-normal text-slate-400">{t("(เห็นเฉพาะผู้ดูแล · ค่าเริ่มต้นตามศูนย์ AI)", "(admins only · default from the AI center)")}</span></div>
              <div className="grid gap-1 sm:grid-cols-2">
                {status.models.map((m) => (
                  <label key={m.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[12px] cursor-pointer ${model === m.id ? "border-fuchsia-300 bg-fuchsia-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <input type="radio" name="ai-model" checked={model === m.id} onChange={() => setModel(m.id)} className="accent-fuchsia-600" />
                    <span className="min-w-0 flex-1"><span className="font-medium">{m.label}</span><span className="block truncate text-[11px] text-slate-400">{m.note}</span></span>
                    <span className="shrink-0 text-slate-600">~{m.est_thb.toFixed(2)} ฿</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {!isAdmin && <p className={`text-[12px] ${outOfQuota ? "text-rose-600" : "text-slate-500"}`}>{outOfQuota ? t("ใช้ครบโควตาเดือนนี้แล้ว — ติดต่อผู้ดูแล", "Monthly quota used up — ask an admin") : quotaText(status.quota)}</p>}

          <AiMemoryPanel mem={memory.mem} canManage={memory.canManage} userId={user?.id} onCall={memory.call}
            likedHint={t("ชอบ — AI ใช้เป็นแนวทางเมื่อเหมาะ", "Liked — used as a guide when it fits")} ruleHint={t("กฎใหม่ เช่น ห้ามใช้อีโมจิเกิน 3 ตัว", "New rule, e.g. max 3 emoji")} />
        </div>
      )}

      {step === 2 && cur && (
        <div className="space-y-3">
          {results.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {results.map((r) => <button key={r.platform} type="button" onClick={() => setTab(r.platform)} className={`h-7 px-3 rounded-full border text-[12px] ${tab === r.platform ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800" : "border-slate-200 text-slate-600"}`}>{platforms.find((p) => p.code === r.platform)?.label ?? r.platform}</button>)}
            </div>
          )}
          {(pick[cur.platform] ?? []).map((sel, row) => (
            <div key={row}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-slate-600">{t(`ย่อหน้า ${row + 1}`, `Paragraph ${row + 1}`)}</span>
                <button type="button" onClick={() => setRow(cur.platform, row, sel === -1 ? cur.variants.findIndex((v) => v.paragraphs[row]) : -1)} className="ml-auto text-[11px] text-slate-400 hover:text-slate-600">{sel === -1 ? t("ใช้ย่อหน้านี้", "Include") : t("ไม่ใช้ย่อหน้านี้", "Skip")}</button>
              </div>
              <div className="space-y-1">
                {cur.variants.map((v, vi) => {
                  const text = v.paragraphs[row];
                  if (!text) return null;
                  const on = sel === vi;
                  const ms = memState(text);
                  return (
                    <div key={vi} onClick={() => setRow(cur.platform, row, vi)} role="button" tabIndex={0}
                      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] leading-relaxed cursor-pointer ${on ? "border-fuchsia-400 bg-fuchsia-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      {cur.variants.length > 1 && <span className={`mt-0.5 shrink-0 rounded-full px-1.5 text-[10px] ${on ? "bg-fuchsia-600 text-white" : "bg-slate-100 text-slate-500"}`}>{t(`แบบ ${LETTER[vi]}`, LETTER[vi])}</span>}
                      <span className="min-w-0 flex-1 whitespace-pre-wrap">{text}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); vote(text, "liked"); }} aria-label={t("ชอบ", "Like")} title={t("ชอบ — AI ใช้เป็นแนวทาง", "Like")}
                        className={`shrink-0 h-6 w-6 grid place-items-center rounded-md border ${ms === "liked" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-400 hover:text-emerald-600"}`}><Icon name="done" size={13} /></button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); vote(text, "disliked"); }} aria-label={t("ไม่ชอบ", "Dislike")} title={t("ไม่ชอบ — AI จะไม่เขียนแบบนี้อีก", "Dislike — never again")}
                        className={`shrink-0 h-6 w-6 grid place-items-center rounded-md border ${ms === "disliked" ? "border-rose-300 bg-rose-50 text-rose-600" : "border-slate-200 text-slate-400 hover:text-rose-600"}`}><Icon name="cancel" size={13} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {cur.variants.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {cur.variants.map((_, vi) => (
                <button key={vi} type="button" onClick={() => { setPick((p) => ({ ...p, [cur.platform]: (p[cur.platform] ?? []).map((_x, i) => (cur.variants[vi].paragraphs[i] ? vi : -1)) })); setTouched((s) => { const n = new Set(s); (pick[cur.platform] ?? []).forEach((_x, i) => n.add(`${cur.platform}|${i}`)); return n; }); }}
                  className="h-7 px-3 rounded-full border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50">{t(`ใช้ทั้งแบบ ${LETTER[vi]}`, `Use all of ${LETTER[vi]}`)}</button>
              ))}
            </div>
          )}
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1">{t("แคปชั่นที่จะใช้", "Caption to use")}</div>
            <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-sans text-[13px] leading-relaxed text-slate-800">{composed(cur) || "—"}</pre>
            {tagsFor(cur).length > 0 && (
              <label className="mt-1.5 flex items-start gap-1.5 text-[12px] text-slate-600">
                <input type="checkbox" checked={useTags} onChange={(e) => setUseTags(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-fuchsia-600" />
                <span>{t("เพิ่มแฮชแท็กที่ AI แนะนำ:", "Add suggested hashtags:")} <span className="text-slate-400">{tagsFor(cur).join(" ")}</span></span>
              </label>
            )}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
