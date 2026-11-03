"use client";

/**
 * แผนผังการทำงาน — "อยากแก้อะไรในส่วนนี้": เลือกช่องโหว่/พิมพ์เอง → สร้าง prompt บอก AI (คัดลอก) · ใส่ตะกร้า · ส่งเข้ารายงานปัญหา
 * ตะกร้าจำไว้ในเครื่อง (localStorage) — รวมคำขอหลายกล่อง/หลายเส้นแล้วสร้าง prompt เดียว
 * ตัวสร้าง prompt = lib/flow-map-prompt.ts
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { FLOW_NODES, FLOW_EDGES, FLOW_ISSUE_APP, type FlowMetricKey } from "@/lib/flow-map";
import { buildFlowPrompt, flowSourceLabel, FLOW_PROMPT_DEFAULTS, type FlowPromptOpts, type FlowRequestItem } from "@/lib/flow-map-prompt";

type Health = Partial<Record<FlowMetricKey, number | null>> | null;
const BASKET_KEY = "erp.flowMap.basket";

/** ตะกร้ารายการแก้ — จำในเครื่อง (ปิดหน้าแล้วยังอยู่) · อ่าน/เขียนพังได้ (โหมดส่วนตัว) = ใช้ได้เฉพาะรอบนี้ */
export function useFlowBasket() {
  const [items, setItems] = useState<FlowRequestItem[]>([]);
  useEffect(() => {
    try { const raw = localStorage.getItem(BASKET_KEY); if (raw) setItems((JSON.parse(raw) as FlowRequestItem[]).filter((x) => x && x.text && x.ref)); } catch { /* ไม่มีที่เก็บ */ }
  }, []);
  const save = useCallback((next: FlowRequestItem[]) => {
    setItems(next);
    try { localStorage.setItem(BASKET_KEY, JSON.stringify(next)); } catch { /* ไม่มีที่เก็บ */ }
  }, []);
  const add = (list: FlowRequestItem[]) => {
    const seen = new Set(items.map((x) => `${x.kind}:${x.ref}:${x.text}`));
    save([...items, ...list.filter((x) => !seen.has(`${x.kind}:${x.ref}:${x.text}`))]);
  };
  return { items, add, remove: (i: number) => save(items.filter((_, j) => j !== i)), clear: () => save([]) };
}
export type FlowBasket = ReturnType<typeof useFlowBasket>;

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* ใช้วิธีสำรอง */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/** ส่งเป็นคำขอแก้ไขเข้า "แจ้งปัญหาการใช้งาน" (/issue-report) — แอปปลายทางตามส่วนของรายการแรก */
async function sendToIssueReport(items: FlowRequestItem[], description: string, reporterName: string | null): Promise<string> {
  const first = items[0];
  const area = first.kind === "n" ? FLOW_NODES[first.ref]?.area : FLOW_NODES[FLOW_EDGES[first.ref]?.from]?.area;
  const appName = area ? FLOW_ISSUE_APP[area] : null;
  let appId: string | null = null;
  try {
    const j = await apiFetch("/api/issue-reports/apps").then((r) => r.json());
    appId = ((j?.data ?? []) as { id: string; name: string }[]).find((a) => a.name === appName)?.id ?? null;
  } catch { /* ไม่มีรายการแอป = ส่งแบบไม่ผูกแอป */ }
  const r = await apiFetch("/api/issue-reports", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_name: appName ?? "แผนผังการทำงาน", description, priority: "medium", reporterName }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error || "ส่งไม่สำเร็จ");
  return String(j.id ?? "");
}

function OptionToggles({ opts, setOpts }: { opts: FlowPromptOpts; setOpts: (o: FlowPromptOpts) => void }) {
  const t = useT();
  const rows: [keyof FlowPromptOpts, string][] = [
    ["links", t("แนบเส้นที่เข้า/ออก + ไฟล์ที่เกี่ยว", "Attach links + files")],
    ["numbers", t("แนบตัวเลขตอนนี้", "Attach live numbers")],
    ["planFirst", t("ให้เสนอแผน + บอกหน้าที่กระทบก่อนแก้", "Ask for a plan + impact first")],
  ];
  return (
    <div className="space-y-1">
      {rows.map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
          <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />{label}
        </label>
      ))}
    </div>
  );
}

/** ปุ่มชุดเดียวกันใช้ทั้งกล่องคำขอและตะกร้า */
function ActionButtons({ items, health, opts, basket, onAdded, onSent }: {
  items: FlowRequestItem[]; health: Health; opts: FlowPromptOpts; basket?: FlowBasket; onAdded?: () => void; onSent?: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const need = () => { if (items.length) return true; toast.error(t("เลือกหรือพิมพ์สิ่งที่อยากแก้อย่างน้อย 1 ข้อก่อน", "Pick or type at least one item")); return false; };
  const copy = async () => {
    if (!need()) return;
    const text = buildFlowPrompt(items, health, opts);
    setPreview(text);
    if (await copyText(text)) toast.success(t("คัดลอก prompt แล้ว — วางในแชท Claude / Codex ได้เลย", "Prompt copied"));
    else toast.error(t("คัดลอกอัตโนมัติไม่ได้ — คลุมข้อความด้านล่างแล้วคัดลอกเอง", "Copy failed — select the text below"));
  };
  const send = async () => {
    if (!need() || busy) return;
    setBusy(true);
    try {
      await sendToIssueReport(items, buildFlowPrompt(items, health, opts), user?.name ?? null);
      toast.success(t("ส่งเข้า “แจ้งปัญหาการใช้งาน” แล้ว — ติดตามสถานะได้ที่หน้าแจ้งปัญหา", "Sent to issue reports"));
      onSent?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ส่งไม่สำเร็จ", "Send failed")); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <button type="button" onClick={() => void copy()} className="h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
          <Icon value="📋" />{t("สร้าง prompt + คัดลอก", "Build prompt + copy")}
        </button>
        {basket && (
          <button type="button" onClick={() => { if (!need()) return; basket.add(items); toast.success(t(`ใส่ตะกร้าแล้ว ${items.length} ข้อ`, `Added ${items.length} to basket`)); onAdded?.(); }}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
            <Icon value="🧺" />{t("ใส่ตะกร้า", "Add to basket")}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void send()} className="h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Icon value="🛟" />{busy ? t("กำลังส่ง…", "Sending…") : t("ส่งเข้ารายงานปัญหา", "Send to issue report")}
        </button>
      </div>
      {preview && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500"><span>{t("prompt ที่คัดลอก", "Copied prompt")}</span>
            <button type="button" onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600">{t("ซ่อน", "Hide")}</button></div>
          <textarea readOnly value={preview} rows={8} onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full text-[11px] font-mono leading-snug p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700" />
        </div>
      )}
    </div>
  );
}

/** กล่อง "อยากแก้อะไรในส่วนนี้" ในแผงรายละเอียดของกล่อง/เส้น */
export function FlowRequestBox({ kind, target: refId, gaps, health, basket }: {
  kind: "n" | "e"; target: string; gaps: string[]; health: Health; basket: FlowBasket;
}) {
  const t = useT();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [own, setOwn] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState(false);
  const [opts, setOpts] = useState<FlowPromptOpts>(FLOW_PROMPT_DEFAULTS);
  useEffect(() => { setPicked(new Set()); setOwn([]); setDraft(""); setErr(false); }, [kind, refId]);
  const addOwn = () => { const v = draft.trim(); if (!v) { setErr(true); return; } setOwn((o) => [...o, v]); setDraft(""); setErr(false); };
  const items: FlowRequestItem[] = [...gaps.filter((g) => picked.has(g)), ...own].map((text) => ({ kind, ref: refId, text }));
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800"><Icon value="✍️" />{t("อยากแก้อะไรในส่วนนี้", "What to change here")}</div>
      {gaps.length > 0 && (
        <div className="mt-1.5">
          <div className="text-[11px] text-slate-500">{t("เลือกจากช่องโหว่ที่รู้แล้ว", "Pick known gaps")}</div>
          {gaps.map((g) => (
            <label key={g} className="flex items-start gap-2 text-[12px] text-slate-700 py-0.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={picked.has(g)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(g); else n.delete(g); return n; })} />{g}
            </label>
          ))}
        </div>
      )}
      <div className="mt-1.5 text-[11px] text-slate-500">{t("หรือพิมพ์เอง (กด เพิ่ม ได้หลายข้อ)", "Or type your own (add several)")}</div>
      <div className="mt-1 flex gap-1.5">
        <input value={draft} onChange={(e) => { setDraft(e.target.value); setErr(false); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOwn(); } }}
          placeholder={t("เช่น อยากให้ระบบทำส่วนนี้ให้เอง", "e.g. make this automatic")} className="flex-1 min-w-0 h-8 px-2 text-[12px] border border-slate-200 rounded-lg" />
        <button type="button" onClick={addOwn} className="h-8 px-3 text-[12px] rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">{t("เพิ่ม", "Add")}</button>
      </div>
      {err && <div className="text-[12px] text-red-600 mt-1">{t("พิมพ์สิ่งที่อยากแก้ก่อน", "Type something first")}</div>}
      {own.map((o, i) => (
        <div key={`${o}${i}`} className="mt-1 flex items-start gap-2 text-[12px] text-slate-700 px-2 py-1 rounded-lg border border-slate-200">
          <span className="flex-1">{o}</span>
          <button type="button" aria-label={t("ลบรายการ", "Remove")} onClick={() => setOwn((x) => x.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600">✕</button>
        </div>
      ))}
      <div className="mt-2"><OptionToggles opts={opts} setOpts={setOpts} /></div>
      <ActionButtons items={items} health={health} opts={opts} basket={basket} onAdded={() => { setPicked(new Set()); setOwn([]); }} />
    </div>
  );
}

/** ตะกร้ารายการแก้ — รวมหลายส่วน แล้วสร้าง prompt เดียว / ส่งเข้ารายงานปัญหา */
export function FlowBasketPanel({ basket, health, onClose, onPick }: { basket: FlowBasket; health: Health; onClose: () => void; onPick: (kind: "n" | "e", ref: string) => void }) {
  const t = useT();
  const [opts, setOpts] = useState<FlowPromptOpts>(FLOW_PROMPT_DEFAULTS);
  return (
    <div className="rounded-xl border border-indigo-200 bg-white p-4 text-[13px]">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-semibold text-[15px] text-slate-800 flex items-center gap-1.5"><Icon value="🧺" />{t(`ตะกร้ารายการแก้ (${basket.items.length})`, `Basket (${basket.items.length})`)}</span>
        <button type="button" onClick={onClose} className="h-7 px-2 text-[12px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">{t("ปิด", "Close")}</button>
      </div>
      {basket.items.length === 0 ? (
        <p className="mt-2 text-slate-500">{t("ยังไม่มีรายการ — กดกล่องหรือเลขบนเส้น แล้วกด “ใส่ตะกร้า” ในช่องอยากแก้", "Empty — open a box or link and press “Add to basket”")}</p>
      ) : (
        <>
          <div className="mt-2 space-y-1">
            {basket.items.map((it, i) => (
              <div key={`${it.kind}${it.ref}${i}`} className="flex items-start gap-2 px-2 py-1.5 rounded-lg border border-slate-200">
                <div className="flex-1 min-w-0">
                  <button type="button" onClick={() => onPick(it.kind, it.ref)} className="text-[11px] text-indigo-600 hover:underline">{flowSourceLabel(it.kind, it.ref)}</button>
                  <div className="text-[12px] text-slate-700">{it.text}</div>
                </div>
                <button type="button" aria-label={t("ลบรายการ", "Remove")} onClick={() => basket.remove(i)} className="text-slate-400 hover:text-red-600">✕</button>
              </div>
            ))}
          </div>
          <div className="mt-2"><OptionToggles opts={opts} setOpts={setOpts} /></div>
          <ActionButtons items={basket.items} health={health} opts={opts} onSent={basket.clear} />
          <button type="button" onClick={basket.clear} className="mt-2 text-[12px] text-slate-500 hover:text-red-600">{t("ล้างตะกร้า", "Clear basket")}</button>
        </>
      )}
    </div>
  );
}
