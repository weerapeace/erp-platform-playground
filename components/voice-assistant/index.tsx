"use client";

/**
 * ผู้ช่วยเสียง (ของกลาง) — ปุ่มไมค์มุมจอขวาล่างทุกหน้า · กดค้างแล้วพูด → ข้อความ (แก้ได้ก่อนส่ง) → ผู้ช่วยทำตามคำสั่งที่เปิดไว้
 * คู่มือ docs/voice-assistant.md · กติกา lib/voice-assistant · API /api/voice-assistant/{transcribe,command,settings}
 *
 * - โชว์เฉพาะคนที่ศูนย์ AI ให้ใช้ได้ (GET /api/voice-assistant/command → enabled) · ปิดในศูนย์ = ปุ่มหาย
 * - คำสั่งไหนเปิด / ทำได้แค่ไหน (เปิดฟอร์ม หรือ บันทึกหลังกดยืนยัน) / ตัวอย่างคำพูด = หน้าตั้งค่า /admin/voice-assistant
 * - ตัวฟังเสียง = useVoiceInput (ใช้ร่วมกับ "ลองพูดทดสอบ" ในหน้าตั้งค่า)
 * - พูดตอบด้วยเสียงไทยของเบราว์เซอร์ (ฟรี) · ปิดเสียงได้ (จำในเครื่อง)
 * - ไม่บันทึกอะไรโดยไม่มีคนกด:
 *     เพิ่ม SKU  — form = เปิด SkuWizard ของเดิมพร้อมค่า · confirm = การ์ดสรุป (รหัสที่ระบบเสนอ) → "บันทึกเลย" (API เดียวกับ wizard) · ทั้งคู่มีปุ่ม "ย้อนกลับ" (ปิดใช้ SKU)
 *     รายละเอียดสินค้า — หาสินค้าแม่ → เปิดหน้า Parent SKU + ป๊อป "แทรก" ที่ขั้นจุดเด่น (AI ดูรูป) · confirm = AI ร่างให้เลย คนกด "แทรกและบันทึก"
 * PC = แผงลอยขวาล่าง · มือถือ = แผ่นเลื่อนขึ้นจากล่างเต็มกว้าง
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthOptional } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { announceParams } from "@/lib/open-param";
import {
  DEFAULT_VOICE_SETTINGS, matchChoiceLocally, VOICE_COMMAND_INFO, VOICE_COMMANDS, VOICE_LIMITS,
  type VoiceChoice, type VoiceCommandSetting, type VoiceCommandKey, type VoiceReply, type VoiceSkuDraft, type VoiceTurn,
} from "@/lib/voice-assistant";
import { useVoiceInput } from "./use-voice-input";
import type { SkuWizardResult } from "@/app/master/skus/sku-wizard";

// ตัวเพิ่ม SKU หนัก → โหลดเมื่อใช้จริงเท่านั้น (ไม่ถ่วงทุกหน้า)
const SkuWizard = dynamic(() => import("@/app/master/skus/sku-wizard").then((m) => m.SkuWizard), { ssr: false });

type Commands = Record<VoiceCommandKey, VoiceCommandSetting>;
type Status = { enabled: boolean; listen: boolean; commands: Commands; canManage: boolean };
type Msg = { id: number; role: "user" | "assistant"; text: string };
/** ตัวเลือกที่ค้าง: ประเภทสินค้า (เพิ่ม SKU) หรือสินค้าแม่ (ทำรายละเอียด) */
type ChoiceKind = "tag" | "parent";
/** การ์ดยืนยันก่อนบันทึก SKU (โหมด confirm) */
type SkuConfirm = { tagId: string; tagLabel: string; values: Record<string, string | number> };

const MUTE_KEY = "voice-assistant-muted";
/** หน้าที่ทำรายละเอียดสินค้า (MasterCRUD moduleKey parent-skus-v2 — มีแท็บ AI ดูรูปในป๊อปแทรก) */
const PARENT_SKU_PAGE = "/master/parent-skus";
let statusCache: Status | null = null;   // ต่อแท็บ — ไม่ถามซ้ำทุกหน้า

export function VoiceAssistant() {
  const auth = useAuthOptional();
  const userId = auth?.user?.id ?? null;
  const [status, setStatus] = useState<Status | null>(statusCache);
  useEffect(() => {
    if (!userId || statusCache) return;
    let alive = true;
    apiFetch("/api/voice-assistant/command").then((r) => (r.ok ? r.json() : null)).then((j) => {
      const s: Status = { enabled: !!j?.enabled, listen: !!j?.listen, commands: (j?.commands as Commands) ?? DEFAULT_VOICE_SETTINGS.commands, canManage: !!j?.can_manage };
      statusCache = s;
      if (alive) setStatus(s);
    }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);
  if (!userId || !status?.enabled) return null;
  return <VoiceAssistantPanel listenAvailable={status.listen} commands={status.commands} canManage={status.canManage} />;
}

function VoiceAssistantPanel({ listenAvailable, commands, canManage }: { listenAvailable: boolean; commands: Commands; canManage: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [choices, setChoices] = useState<VoiceChoice[]>([]);
  const [choiceKind, setChoiceKind] = useState<ChoiceKind>("tag");
  const [wizard, setWizard] = useState<{ prefill: Record<string, unknown>; tagId: string | null } | null>(null);
  const [confirm, setConfirm] = useState<SkuConfirm | null>(null);
  const [saving, setSaving] = useState(false);
  const [muted, setMuted] = useState(false);
  const pendingSku = useRef<VoiceSkuDraft>({});
  const idRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const enabledCmds = VOICE_COMMANDS.filter((k) => commands[k]?.enabled);
  const examples = enabledCmds.map((k) => commands[k].examples[0]).filter(Boolean).slice(0, 3);

  const voice = useVoiceInput({
    listenAvailable, disabled: thinking,
    onText: (t) => { setDraft(t); setTimeout(() => inputRef.current?.focus(), 0); },
    onInterim: setDraft,
  });

  useEffect(() => { try { setMuted(localStorage.getItem(MUTE_KEY) === "1"); } catch { /* ไม่มีที่เก็บ = เปิดเสียง */ } }, []);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs, choices, confirm]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const push = (role: Msg["role"], text: string) => setMsgs((m) => [...m, { id: ++idRef.current, role, text }].slice(-40));
  const speak = useCallback((text: string) => {
    if (muted || typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "th-TH";
      const v = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith("th"));
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch { /* เบราว์เซอร์พูดไม่ได้ = ข้าม */ }
  }, [muted]);
  const say = (text: string) => { push("assistant", text); speak(text); };
  const toggleMute = () => {
    setMuted((m) => { const n = !m; try { localStorage.setItem(MUTE_KEY, n ? "1" : "0"); } catch { /* ignore */ } if (n) window.speechSynthesis?.cancel(); return n; });
  };
  const offer = (list: VoiceChoice[], kind: ChoiceKind) => { setChoiceKind(kind); setChoices(list); };

  // ── เพิ่ม SKU ──
  const skuPrefill = (): Record<string, string> =>
    Object.fromEntries(Object.entries(pendingSku.current).map(([k, v]) => [k, typeof v === "number" ? String(v) : String(v ?? "")]).filter(([, v]) => v));
  const openWizard = (tagId: string | null) => {
    setChoices([]); setConfirm(null);
    setWizard({ prefill: skuPrefill(), tagId });   // ช่องในฟอร์มเก็บเป็นข้อความ
  };
  const undoSkus = (skus: { id: string; code: string }[]) => {
    const codes = skus.map((s) => s.code).join(", ");
    toast.action(`เพิ่ม SKU ${codes} แล้ว`, "ย้อนกลับ", async () => {
      // ย้อนกลับ = ปิดใช้ (เก็บไว้ ไม่ลบถาวร) ผ่าน API กลาง master-v2 (สิทธิ์ + ประวัติ)
      const res = await Promise.all(skus.map((s) => apiFetch(`/api/master-v2/skus-v2/${encodeURIComponent(s.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: false }),
      }).then((x) => x.ok).catch(() => false)));
      if (res.every(Boolean)) toast.success(`ปิดใช้ ${codes} แล้ว (เปิดกลับได้ที่หน้า SKU)`);
      else toast.error("ย้อนกลับไม่สำเร็จบางรายการ — ไปปิดใช้ที่หน้า SKU แทน");
    }, { ms: 15000 });
  };
  const onCreated = (r?: SkuWizardResult) => {
    setWizard(null);
    const skus = r?.skus ?? [];
    if (!skus.length) return;
    say(`เพิ่ม SKU ${skus.map((s) => s.code).join(", ")} แล้วครับ`);
    undoSkus(skus);
  };
  /** เลือกประเภทแล้ว: โหมด form = เปิดฟอร์ม · confirm = ขอรหัสที่ระบบเสนอ แล้วโชว์การ์ดให้กดยืนยัน */
  const afterTag = async (tag: VoiceChoice | null) => {
    setChoices([]);
    if (!tag || commands.add_sku.mode !== "confirm") {
      say(tag ? `เลือก ${tag.label} แล้ว เปิดฟอร์มให้ตรวจก่อนบันทึกครับ` : "เปิดฟอร์มให้ เลือกประเภทในฟอร์มได้เลยครับ");
      openWizard(tag?.id ?? null);
      return;
    }
    try {
      const j = await apiFetch(`/api/skus/code-suggest?family_tag_id=${encodeURIComponent(tag.id)}`).then((r) => r.json()) as { this_suggested?: string };
      const code = pendingSku.current.code || j.this_suggested || "";
      if (!code) { say("ยังเสนอรหัสให้ไม่ได้ เปิดฟอร์มให้กรอกรหัสเองครับ"); openWizard(tag.id); return; }
      const values: Record<string, string | number> = { ...skuPrefill(), code };
      if (!values.name_th) { say("ยังไม่ได้ยินชื่อสินค้า เปิดฟอร์มให้กรอกต่อครับ"); openWizard(tag.id); return; }
      setConfirm({ tagId: tag.id, tagLabel: tag.label, values });
      say(`เตรียม SKU ${code} ให้แล้ว ตรวจแล้วกดบันทึกได้เลยครับ`);
    } catch { openWizard(tag.id); }
  };
  const saveConfirmed = async () => {
    if (!confirm || saving) return;
    setSaving(true);
    try {
      // API เดียวกับตัวเพิ่ม SKU (สิทธิ์ products.create + ประวัติ) — ไม่มีทางลัด
      const res = await apiFetch("/api/skus/wizard-create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [{ values: confirm.values, family_tag_ids: [confirm.tagId] }] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setConfirm(null);
      const skus = (j.skus ?? []) as { id: string; code: string }[];
      say(`บันทึก SKU ${skus.map((s) => s.code).join(", ") || String(confirm.values.code)} แล้วครับ`);
      if (skus.length) undoSkus(skus);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };
  // ตัวเลือกประเภทจากข้อมูลจริง (ตัวเดาแท็กกลาง — ไม่ใช้ AI) · ไม่มีคำแนะนำ = เปิดฟอร์มเลย
  const offerCategories = async (sku: VoiceSkuDraft) => {
    pendingSku.current = sku;
    try {
      const qs = new URLSearchParams({ name: sku.name_th ?? "", code: sku.code ?? "" });
      const j = await apiFetch(`/api/product-tags/suggest/new?${qs}`).then((r) => r.json());
      const list = ((j.data ?? []) as { tagId: string; name: string }[]).slice(0, 5).map((s) => ({ id: s.tagId, label: s.name }));
      if (list.length) { offer(list, "tag"); return; }
    } catch { /* เดาไม่ได้ = เปิดฟอร์มให้เลือกเอง */ }
    openWizard(null);
  };

  // ── ทำรายละเอียดสินค้า: หาสินค้าแม่ → เปิดหน้า + ป๊อปแทรกที่ขั้นจุดเด่น ──
  const openDetail = (p: VoiceChoice) => {
    setChoices([]);
    const auto = commands.product_detail.mode === "confirm";
    const href = `${PARENT_SKU_PAGE}?open=${encodeURIComponent(p.id)}&insert=ai${auto ? "&insert_auto=1" : ""}`;
    say(auto ? `เปิด ${p.label} แล้ว AI กำลังร่างจุดเด่น ตรวจแล้วกดแทรกและบันทึกครับ` : `เปิด ${p.label} ที่ตัวช่วยเขียนรายละเอียดแล้วครับ`);
    router.push(href);
    announceParams(href);
  };
  const findParents = async (query: string) => {
    try {
      const qs = new URLSearchParams({ search: query, limit: "6" });
      const j = await apiFetch(`/api/master-v2/parent-skus?${qs}`).then((r) => r.json());
      const list = ((j.data ?? []) as { id: string; code?: string; name_th?: string; name_en?: string }[])
        .map((r) => ({ id: String(r.id), label: [r.code, r.name_th || r.name_en].filter(Boolean).join(" · ").slice(0, 80) }));
      if (!list.length) { say(`ไม่เจอสินค้า "${query}" ลองพูดรหัสหรือชื่อให้ชัดขึ้นครับ`); return; }
      if (list.length === 1) { openDetail(list[0]); return; }
      say(`เจอ ${list.length} ตัว เลือกตัวที่ต้องการครับ`);
      offer(list, "parent");
    } catch { say("ค้นหาสินค้าไม่สำเร็จ ลองใหม่อีกครั้งครับ"); }
  };

  const pick = (c: VoiceChoice | null) => {
    if (choiceKind === "parent") { if (c) openDetail(c); else { setChoices([]); say("ยกเลิกแล้วครับ"); } return; }
    void afterTag(c);
  };

  // ── ส่งคำสั่ง ──
  const send = async (raw: string) => {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, VOICE_LIMITS.textChars);
    if (!text || thinking) return;
    setDraft("");
    push("user", text);
    // มีตัวเลือกค้าง → จับคู่ในเครื่องก่อน (ไม่เสียค่า AI)
    if (choices.length) {
      const hit = matchChoiceLocally(text, choices);
      if (hit === "skip") { pick(null); return; }
      if (hit) { pick(hit); return; }
    }
    setThinking(true);
    try {
      const history: VoiceTurn[] = msgs.slice(-VOICE_LIMITS.historyTurns).map((m) => ({ role: m.role, text: m.text }));
      const res = await apiFetch("/api/voice-assistant/command", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, history, choices, path: pathname }),
      });
      const j = (await res.json().catch(() => ({}))) as VoiceReply & { error?: string };
      if (!res.ok) { push("assistant", j.error || "ผู้ช่วยตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง"); return; }
      say(j.say);
      if (j.action === "open_page" && j.page) { setChoices([]); router.push(j.page.href); }
      else if (j.action === "add_sku") await offerCategories(j.sku ?? {});
      else if (j.action === "product_detail" && j.query) await findParents(j.query);
      else if (j.action === "choose" && j.choiceId) { const c = choices.find((x) => x.id === j.choiceId); if (c) pick(c); }
    } catch {
      push("assistant", "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setThinking(false);
    }
  };

  const phase = thinking ? "thinking" : voice.phase;
  const busy = phase === "transcribing" || phase === "thinking";
  const micLabel = phase === "recording" ? "กำลังฟัง… ปล่อยเพื่อหยุด" : phase === "transcribing" ? "กำลังแปลงเสียง…" : phase === "thinking" ? "กำลังคิด…"
    : voice.listenMode === "none" ? "เบราว์เซอร์นี้ฟังเสียงไม่ได้ — พิมพ์แทน" : "กดค้างแล้วพูด";
  const FIELD_LABEL: Record<string, string> = { code: "รหัส", name_th: "ชื่อ", color: "สี", standard_price: "ราคาซื้อ", rmb_cost: "ราคาหยวน" };

  return (
    <>
      {!open && !wizard && (
        <button type="button" onClick={() => setOpen(true)} title="ผู้ช่วยเสียง" aria-label="เปิดผู้ช่วยเสียง"
          className="fixed bottom-4 right-4 z-[55] h-12 w-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center print:hidden">
          <Icon name="microphone" size={22} />
        </button>
      )}

      {open && !wizard && (
        <div role="dialog" aria-label="ผู้ช่วยเสียง"
          className="fixed z-[56] inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[360px] max-h-[75vh] sm:max-h-[70vh] flex flex-col bg-white border border-slate-200 shadow-2xl rounded-t-2xl sm:rounded-2xl print:hidden">
          <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300" />
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
            <Icon name="sparkles" size={16} className="text-blue-600" />
            <span className="text-sm font-medium text-slate-800 flex-1">ผู้ช่วยเสียง</span>
            {canManage && (
              <Link href="/admin/voice-assistant" onClick={() => setOpen(false)} title="ตั้งค่าผู้ช่วยเสียง" aria-label="ตั้งค่าผู้ช่วยเสียง"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"><Icon name="settings" size={16} /></Link>
            )}
            <button type="button" onClick={toggleMute} title={muted ? "เปิดเสียงตอบ" : "ปิดเสียงตอบ"} aria-label={muted ? "เปิดเสียงตอบ" : "ปิดเสียงตอบ"}
              className={`h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 ${muted ? "text-slate-300" : "text-slate-600"}`}>
              <Icon name="volume" size={16} />
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="ปิด" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
              <Icon name="x" size={16} />
            </button>
          </div>

          <div ref={listRef} className="flex-1 min-h-[140px] overflow-y-auto px-3 py-3 flex flex-col gap-2">
            {msgs.length === 0 && (
              <div className="text-[13px] text-slate-500 leading-relaxed">
                {enabledCmds.length
                  ? <>ตอนนี้ช่วยได้: {enabledCmds.map((k, i) => <span key={k}>{i ? " · " : ""}<b className="font-medium text-slate-700">{VOICE_COMMAND_INFO[k].label}</b></span>)} — ลองพูดหรือกดตัวอย่าง</>
                  : "ผู้ดูแลยังไม่ได้เปิดคำสั่งไหนไว้"}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {examples.map((x) => (
                    <button key={x} type="button" onClick={() => setDraft(x)} className="text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">{x}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={`max-w-[88%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "self-end bg-slate-100 text-slate-800" : "self-start bg-white border border-slate-200 text-slate-800"}`}>{m.text}</div>
            ))}
            {phase === "thinking" && <div className="self-start text-xs text-slate-400 px-1">กำลังคิด…</div>}
            {choices.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {choices.map((c) => (
                  <button key={c.id} type="button" onClick={() => { push("user", c.label); pick(c); }}
                    className="text-xs px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 text-left">{c.label}</button>
                ))}
                <button type="button" onClick={() => { push("user", choiceKind === "parent" ? "ยกเลิก" : "เลือกเองในฟอร์ม"); pick(null); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">{choiceKind === "parent" ? "ยกเลิก" : "เลือกเองในฟอร์ม"}</button>
              </div>
            )}
            {confirm && (
              <div className="self-stretch rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[13px]">
                <p className="font-medium text-emerald-900 mb-1.5">ตรวจก่อนบันทึก SKU ใหม่</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-slate-700">
                  <dt className="text-slate-500">ประเภท</dt><dd>{confirm.tagLabel}</dd>
                  {Object.entries(confirm.values).map(([k, v]) => <div key={k} className="contents"><dt className="text-slate-500">{FIELD_LABEL[k] ?? k}</dt><dd className="break-words">{String(v)}</dd></div>)}
                </dl>
                <div className="flex gap-2 mt-2.5">
                  <button type="button" onClick={() => void saveConfirmed()} disabled={saving}
                    className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[13px] hover:bg-emerald-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกเลย"}</button>
                  <button type="button" onClick={() => openWizard(confirm.tagId)} className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[13px] hover:bg-slate-50">แก้ในฟอร์ม</button>
                  <button type="button" onClick={() => { setConfirm(null); say("ยกเลิกแล้วครับ"); }} className="h-8 px-2 rounded-lg text-[13px] text-slate-500 hover:bg-white">ยกเลิก</button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 px-3 pt-2.5 pb-3 flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <textarea ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={VOICE_LIMITS.textChars}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } }}
                placeholder={phase === "recording" ? "กำลังฟัง…" : "คำที่ฟังได้จะขึ้นตรงนี้ แก้ได้ก่อนส่ง"}
                className="flex-1 resize-none max-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <button type="button" onClick={() => void send(draft)} disabled={!draft.trim() || busy} aria-label="ส่งคำสั่ง"
                className="h-9 px-3 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1">
                <Icon name="send" size={15} /> ส่ง
              </button>
            </div>
            <button type="button" disabled={busy || voice.listenMode === "none"} {...voice.holdProps}
              className={`select-none touch-none h-11 rounded-xl text-sm flex items-center justify-center gap-2 border transition-colors disabled:opacity-60 ${phase === "recording" ? "bg-red-50 border-red-300 text-red-700" : "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100"}`}>
              <Icon name="microphone" size={18} /> {micLabel}
            </button>
            {voice.listenMode === "browser" && <div className="text-[11px] text-slate-400 text-center">ใช้ตัวฟังฟรีของเบราว์เซอร์อยู่ (แม่นน้อยกว่า)</div>}
          </div>
        </div>
      )}

      {wizard && (
        <SkuWizard open onClose={() => { setWizard(null); setOpen(true); }} onCreated={(r) => { onCreated(r); setOpen(true); }}
          prefill={wizard.prefill} initialTagId={wizard.tagId} />
      )}
    </>
  );
}
