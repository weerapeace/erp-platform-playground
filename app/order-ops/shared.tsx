"use client";

// ============================================================
// งานหลังขาย — ชิ้นส่วนที่ 2 หน้าใช้ร่วมกัน (/order-ops/instructions · /order-ops/after-sales)
// แถบโหมดทดลอง · ช่องเลขออเดอร์ (ดึงจากศูนย์ออเดอร์) · ป้ายสถานะ · ประวัติ · จัดการตัวเลือก
// API เดียว: /api/order-ops · กติกา: lib/order-ops
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { SkuPicker } from "@/components/pickers";
import { COMMAND_BOX_LABEL, commandBoxOf, guessCommandBox, isCommandBox, type CommandBox } from "@/lib/order-ops";

export type Tone = "neutral" | "accent" | "warning" | "success" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  accent: "bg-sky-50 text-sky-700",
  warning: "bg-amber-50 text-amber-700",
  success: "bg-emerald-50 text-emerald-700",
  danger: "bg-rose-50 text-rose-700",
};

export function Pill({ tone = "neutral", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLASS[tone]}`}>{children}</span>;
}

export function TrialPill() {
  return <Pill tone="warning" title="ข้อมูลทดลอง — กดล้างทีเดียวได้">ทดลอง</Pill>;
}

export async function opsJson<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  return j;
}

/** แถบเหลืองโหมดทดลอง + ใส่ข้อมูลตัวอย่าง + ล้างข้อมูลทดลอง (ย้อนได้) */
export function TrialBanner({ trialCount, onChanged }: { trialCount: number; onChanged: () => void }) {
  const toast = useToast();
  const canManage = usePermission("order_ops.manage");
  const canEdit = usePermission("order_ops.edit");
  const [busy, setBusy] = useState(false);

  const seed = async () => {
    setBusy(true);
    try { await opsJson("/api/order-ops", { method: "POST", body: JSON.stringify({ action: "seed_trial" }) }); toast.success("ใส่ข้อมูลตัวอย่างแล้ว"); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const clear = async () => {
    const ok = await askConfirm({ title: "ล้างข้อมูลทดลองทั้งหมด?", message: `ย้ายรายการที่ติดป้าย "ทดลอง" ${trialCount} รายการลงถังขยะ (ทั้งคำสั่งพิเศษ รอของ ซ่อม/คืน) · กู้คืนได้จากถังขยะ · ข้อมูลจริงไม่ถูกแตะ`, confirmText: "ล้างข้อมูลทดลอง", variant: "danger" });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await opsJson<{ count: number; at: string }>("/api/order-ops", { method: "DELETE", body: JSON.stringify({ action: "clear_trial" }) });
      onChanged();
      toast.undo(`ล้างแล้ว ${r.count} รายการ`, async () => {
        await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ action: "undo_clear_trial", at: r.at }) });
        onChanged();
      }, { ms: 10_000 });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <Icon name="flask" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <b className="font-semibold">โหมดทดลอง</b> — ยังไม่ได้ย้ายข้อมูลจริงจากแอปเก่า · ปุ่มรับเข้าสต๊อกยังไม่แตะสต๊อกจริง · รายการที่สร้างตอนนี้ติดป้าย "ทดลอง"
      </span>
      {canEdit && trialCount === 0 && <button disabled={busy} onClick={seed} className="rounded-md border border-amber-300 bg-white px-2 py-1 font-medium hover:bg-amber-100 disabled:opacity-50">ใส่ข้อมูลตัวอย่าง</button>}
      {canManage && trialCount > 0 && <button disabled={busy} onClick={clear} className="rounded-md border border-amber-300 bg-white px-2 py-1 font-medium hover:bg-amber-100 disabled:opacity-50">ล้างข้อมูลทดลอง ({trialCount})</button>}
    </div>
  );
}

export type OrderHit = {
  id: string; order_no: string; platform: string | null; customer_name: string | null; ordered_at: string | null; status: string | null; note: string | null;
  items: { sku: string | null; name: string | null; qty: number; sku_id: string | null; image_key?: string | null }[];
};
type Existing = { instructions: { id: string; status: string }[]; cases: { id: string; kind: string; status: string }[] };

/** ช่องเลขออเดอร์: พิมพ์/สแกนแล้วหยุด ~0.5 วิ → ดึงข้อมูลจากศูนย์ออเดอร์มาให้ (ไม่เจอก็พิมพ์ต่อเองได้) */
export function OrderNoField({ value, onChange, onFound, autoFocus }: {
  value: string; onChange: (v: string) => void; onFound: (o: OrderHit | null, existing: Existing | null) => void; autoFocus?: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "found" | "none">("idle");
  const [hit, setHit] = useState<OrderHit | null>(null);
  const [existing, setExisting] = useState<Existing | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foundRef = useRef(onFound);
  foundRef.current = onFound;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const v = value.trim();
    if (v.length < 6) { setState("idle"); setHit(null); setExisting(null); return; }
    timer.current = setTimeout(async () => {
      setState("loading");
      try {
        const r = await opsJson<{ order: OrderHit | null; existing: Existing }>(`/api/order-ops?lookup=${encodeURIComponent(v)}`);
        setHit(r.order); setExisting(r.existing); setState(r.order ? "found" : "none");
        foundRef.current(r.order, r.existing);
      } catch { setState("none"); }
    }, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value]);

  const dupCount = (existing?.instructions.length ?? 0) + (existing?.cases.length ?? 0);
  return (
    <div>
      <input autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder="พิมพ์หรือสแกนเลขออเดอร์" className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none" />
      <div className="mt-1 min-h-[1.25rem] text-xs">
        {state === "loading" && <span className="text-slate-400">กำลังหาในศูนย์ออเดอร์…</span>}
        {state === "found" && hit && (
          <span className="text-emerald-700">
            <Icon name="check" className="mr-1 inline h-3.5 w-3.5" />
            เจอในศูนย์ออเดอร์: {hit.platform ?? "-"} · {hit.customer_name ?? "ไม่มีชื่อ"} · {hit.items.map((i) => `${i.sku ?? "?"}×${i.qty}`).join(", ") || "ไม่มีรายการสินค้า"}
          </span>
        )}
        {state === "none" && <span className="text-slate-500">ไม่เจอในศูนย์ออเดอร์ (ใบเก่า/ยังไม่ดึง) — กรอกชื่อลูกค้าและสินค้าเองได้</span>}
        {dupCount > 0 && <span className="ml-2 text-amber-700">· ออเดอร์นี้มีบันทึกอยู่แล้ว {dupCount} รายการ</span>}
      </div>
    </div>
  );
}

/** เลือกสินค้าจากรายการในออเดอร์ (ถ้ามี) หรือพิมพ์รหัสเอง */
export function SkuField({ value, onChange, items, decode }: {
  value: string; onChange: (v: string) => void; items: OrderHit["items"];
  /** ถอดรหัสท้าย SKU เป็นป้าย เช่น "ฟอยทอง · ตรงกลาง" (ไม่ใช่ SKU สลัก = null) */
  decode?: (sku: string | null) => string | null;
}) {
  const own = decode?.(value) ?? null;
  return (
    <div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="รหัสสินค้า เช่น TTM061-04" className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none" />
      {own && !items.some((i) => i.sku === value) && <div className="mt-1"><Pill tone="accent">{own}</Pill></div>}
      {items.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {items.map((i, k) => {
            const d = decode?.(i.sku) ?? null;
            return (
              <button key={k} type="button" onClick={() => onChange(i.sku ?? "")} className={`rounded-full border px-2 py-0.5 text-[11px] ${value === i.sku ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`} title={i.name ?? ""}>
                <span className="font-mono">{i.sku ?? "?"} ×{i.qty}</span>{d && <span className="ml-1 text-indigo-700">· {d}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";

export type OptionRow = { id: string; kind: "instruction_command" | "repair_topic" | "engrave_special" | "engrave_font" | "engrave_sku_type" | "engrave_sku_pos" | "command_choice" | "command_phrase" | "special_wrap" | "card_phrase"; label: string; value?: string | null; sort_order: number; is_active: boolean; extra?: { sku_id?: string; sku_code?: string | null; template_group?: string } | null };

export function useOpsOptions() {
  const [options, setOptions] = useState<OptionRow[]>([]);
  const load = useCallback(async () => {
    try { const r = await opsJson<{ options: OptionRow[] }>("/api/order-ops?t=options"); setOptions(r.options); } catch { /* ใช้ค่าว่าง */ }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { options, reload: load };
}

/** ป๊อปจัดการตัวเลือก (เพิ่ม · แก้ชื่อ · เรียง · ซ่อน/เปิด) — ไม่มีลบจริง กันรายการเก่าที่ใช้อยู่พัง */
export function OptionsManager({ open, onClose, kind, options, onChanged }: {
  open: boolean; onClose: () => void; kind: OptionRow["kind"]; options: OptionRow[]; onChanged: () => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [choiceFor, setChoiceFor] = useState<string | null>(null);
  const [phraseFor, setPhraseFor] = useState<string | null>(null);
  const [cardPhrases, setCardPhrases] = useState(false);
  const [tplGroups, setTplGroups] = useState<string[]>([]);
  useEffect(() => {
    if (!open || kind !== "instruction_command") return;
    opsJson<{ templates: { group?: string | null }[] }>("/api/order-gift-cards?view=templates").then((r) => setTplGroups([...new Set(r.templates.map((t) => (t.group ?? "").trim()).filter(Boolean))])).catch(() => {});
  }, [open, kind]);
  const rows = options.filter((o) => o.kind === kind);
  const title = kind === "instruction_command" ? "จัดการคำสั่ง" : "จัดการหัวข้อซ่อม";

  const add = async () => {
    if (!label.trim()) return;
    try { await opsJson("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "options", kind, label, sort_order: rows.length + 1 }) }); setLabel(""); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const patch = async (o: OptionRow, p: Partial<OptionRow>) => {
    try { await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "options", id: o.id, patch: p }) }); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const rename = async (o: OptionRow) => {
    const v = window.prompt("แก้ชื่อตัวเลือก", o.label);
    if (v && v.trim() && v.trim() !== o.label) await patch(o, { label: v.trim() });
  };
  const move = async (i: number, d: -1 | 1) => {
    const a = rows[i], b = rows[i + d];
    if (!a || !b) return;
    await patch(a, { sort_order: b.sort_order });
    await patch(b, { sort_order: a.sort_order === b.sort_order ? a.sort_order + d : a.sort_order });
  };

  return (
    <ERPModal open={open} onClose={onClose} title={title} size="md" defaultExpanded={false} storageKey="order-ops-options">
      <div className="space-y-2">
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="เพิ่มตัวเลือกใหม่…" className={inputCls} />
          <button onClick={add} className="shrink-0 rounded-lg bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700">เพิ่ม</button>
        </div>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((o, i) => (
            <li key={o.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className={`flex-1 ${o.is_active ? "" : "text-slate-400 line-through"}`}>{o.label}</span>
              {kind === "instruction_command" && (
                <>
                  <select value={isCommandBox(o.value) ? o.value : ""} onChange={(e) => void patch(o, { value: e.target.value || null })} title="กดชิปคำสั่งนี้แล้วโชว์กล่องแบบไหน" className="h-7 rounded border border-slate-200 bg-white px-1 text-xs text-slate-600">
                    <option value="">กล่อง: เดาจากชื่อ ({COMMAND_BOX_LABEL[guessCommandBox(o.label)]})</option>
                    {(Object.keys(COMMAND_BOX_LABEL) as CommandBox[]).map((b) => <option key={b} value={b}>กล่อง: {COMMAND_BOX_LABEL[b]}</option>)}
                  </select>
                  {commandBoxOf(o.label, o.value) === "phrase" && <button onClick={() => setPhraseFor(o.label)} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-sky-700 hover:bg-slate-50">ข้อความลัด ({options.filter((x) => x.kind === "command_phrase" && x.value === o.label).length})</button>}
                  {commandBoxOf(o.label, o.value) === "card" && <button onClick={() => setCardPhrases(true)} title="ข้อความการ์ดสำเร็จรูป (ใช้ร่วมทุกคำสั่งการ์ด)" className="rounded border border-slate-200 px-2 py-0.5 text-xs text-sky-700 hover:bg-slate-50">ข้อความสำเร็จรูป ({options.filter((x) => x.kind === "card_phrase").length})</button>}
                  {commandBoxOf(o.label, o.value) === "card" && (
                    <input defaultValue={o.extra?.template_group ?? ""} list="cmd-tpl-groups" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (o.extra?.template_group ?? "")) void patch(o, { extra: { ...(o.extra ?? {}), template_group: v } } as Partial<OptionRow>); }}
                      placeholder="กลุ่มแม่แบบ (ว่าง = เดา)" title="การ์ดของคำสั่งนี้เปิดกลุ่มแม่แบบไหนก่อน" className="h-7 w-36 rounded border border-slate-200 px-1.5 text-xs" />
                  )}
                  {commandBoxOf(o.label, o.value) === "choice" && <button onClick={() => setChoiceFor(o.label)} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-sky-700 hover:bg-slate-50">ตัวเลือก ({options.filter((x) => x.kind === "command_choice" && String(x.value ?? "").split("|")[0] === o.label).length})</button>}
                </>
              )}
              <button title="เลื่อนขึ้น" onClick={() => move(i, -1)} className="text-slate-400 hover:text-slate-700"><Icon name="chevron-up" className="h-4 w-4" /></button>
              <button title="เลื่อนลง" onClick={() => move(i, 1)} className="text-slate-400 hover:text-slate-700"><Icon name="chevron-down" className="h-4 w-4" /></button>
              <button title="แก้ชื่อ" onClick={() => rename(o)} className="text-slate-400 hover:text-slate-700"><Icon name="edit" className="h-4 w-4" /></button>
              <button onClick={() => patch(o, { is_active: !o.is_active })} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">{o.is_active ? "ซ่อน" : "เปิดใช้"}</button>
            </li>
          ))}
          {!rows.length && <li className="px-3 py-4 text-center text-xs text-slate-400">ยังไม่มีตัวเลือก</li>}
        </ul>
        <p className="text-[11px] text-slate-400">ซ่อนแล้วจะไม่โผล่ให้เลือกในรายการใหม่ แต่รายการเก่าที่เลือกไว้ยังอยู่ครบ</p>
      </div>
      {choiceFor && <CommandChoiceManager command={choiceFor} options={options} onChanged={onChanged} onClose={() => setChoiceFor(null)} />}
      {phraseFor && <CommandChoiceManager command={phraseFor} options={options} onChanged={onChanged} onClose={() => setPhraseFor(null)} phrase />}
      {cardPhrases && <CardPhraseManager options={options} onChanged={onChanged} onClose={() => setCardPhrases(false)} />}
      <datalist id="cmd-tpl-groups">{tplGroups.map((g) => <option key={g} value={g} />)}</datalist>
    </ERPModal>
  );
}

/** ตัวเลือกของคำสั่ง 1 ข้อ (เช่น ห่อ › กระดาษ / ริบบิ้น) — เพิ่ม · แก้ชื่อ · ซ่อน/เปิด (ไม่ลบจริง) · kind command_choice value "<คำสั่ง>|<กลุ่ม>" */
/** ข้อความการ์ดสำเร็จรูป (kind card_phrase · value = กลุ่ม) — เพิ่ม · แก้ · เปลี่ยนกลุ่ม · เรียง · ซ่อน/เปิด (ไม่ลบจริง) */
function CardPhraseManager({ options, onChanged, onClose }: { options: OptionRow[]; onChanged: () => void; onClose: () => void }) {
  const toast = useToast();
  const rows = options.filter((o) => o.kind === "card_phrase").sort((a, b) => a.sort_order - b.sort_order);
  const groups = [...new Set(rows.map((o) => o.value || "ทั่วไป"))];
  const [group, setGroup] = useState("");
  const [label, setLabel] = useState("");
  const add = async () => {
    if (!label.trim()) return;
    try { await opsJson("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "options", kind: "card_phrase", label: label.trim(), value: group.trim() || groups[0] || "ทั่วไป", sort_order: (rows.at(-1)?.sort_order ?? 0) + 1 }) }); setLabel(""); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const patch = async (o: OptionRow, p: Partial<OptionRow>) => {
    try { await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "options", id: o.id, patch: p }) }); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const move = async (list: OptionRow[], i: number, d: -1 | 1) => {
    const a = list[i], b = list[i + d];
    if (!a || !b) return;
    await patch(a, { sort_order: b.sort_order });
    await patch(b, { sort_order: a.sort_order === b.sort_order ? a.sort_order + d : a.sort_order });
  };
  return (
    <ERPModal open onClose={onClose} title="ข้อความการ์ดสำเร็จรูป" size="sm" defaultExpanded={false} storageKey="order-ops-card-phrases" zIndex={70}>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input value={group} onChange={(e) => setGroup(e.target.value)} list="card-phrase-groups" placeholder={groups[0] ? `กลุ่ม (เช่น ${groups[0]})` : "กลุ่ม"} className={`${inputCls} w-32`} />
          <datalist id="card-phrase-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="ข้อความใหม่ เช่น Happy Birthday" className={inputCls} />
          <button onClick={add} className="shrink-0 rounded-lg bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700">เพิ่ม</button>
        </div>
        {groups.map((g) => {
          const list = rows.filter((o) => (o.value || "ทั่วไป") === g);
          return (
            <div key={g}>
              <div className="mb-1 text-xs font-medium text-slate-500">{g}</div>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {list.map((o, i) => (
                  <li key={o.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className={`flex-1 ${o.is_active ? "" : "text-slate-400 line-through"}`}>{o.label}</span>
                    <button title="เลื่อนขึ้น" onClick={() => void move(list, i, -1)} className="text-slate-400 hover:text-slate-700"><Icon name="chevron-up" className="h-4 w-4" /></button>
                    <button title="เลื่อนลง" onClick={() => void move(list, i, 1)} className="text-slate-400 hover:text-slate-700"><Icon name="chevron-down" className="h-4 w-4" /></button>
                    <button title="แก้ข้อความ" onClick={() => { const v = window.prompt("แก้ข้อความ", o.label); if (v && v.trim() && v.trim() !== o.label) void patch(o, { label: v.trim() }); }} className="text-slate-400 hover:text-slate-700"><Icon name="edit" className="h-4 w-4" /></button>
                    <button title="ย้ายกลุ่ม" onClick={() => { const v = window.prompt("ย้ายไปกลุ่ม", o.value ?? ""); if (v && v.trim() && v.trim() !== o.value) void patch(o, { value: v.trim() }); }} className="text-slate-400 hover:text-slate-700"><Icon name="folder" className="h-4 w-4" /></button>
                    <button onClick={() => void patch(o, { is_active: !o.is_active })} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">{o.is_active ? "ซ่อน" : "เปิดใช้"}</button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!rows.length && <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">ยังไม่มีข้อความสำเร็จรูป</p>}
        <p className="text-[11px] text-slate-400">ใช้ร่วมทุกคำสั่งการ์ด · ซ่อน = ไม่โผล่ในป๊อป (การ์ดเก่าไม่เปลี่ยน) · ทุกการแก้ลงประวัติ</p>
      </div>
    </ERPModal>
  );
}

function CommandChoiceManager({ command, options, onChanged, onClose, phrase = false }: { command: string; options: OptionRow[]; onChanged: () => void; onClose: () => void; /** ข้อความลัด (kind command_phrase) แทนตัวเลือก */ phrase?: boolean }) {
  const toast = useToast();
  const [group, setGroup] = useState("");
  const [label, setLabel] = useState("");
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const kindKey = phrase ? "command_phrase" : "command_choice";
  const rows = options.filter((o) => o.kind === kindKey && String(o.value ?? "").split("|")[0] === command);
  const groupOf = (o: OptionRow) => (phrase ? "ข้อความลัด" : String(o.value ?? "").split("|")[1] || "แบบ");
  const groups = [...new Set(rows.map(groupOf))];
  const add = async () => {
    if (!label.trim()) return;
    const g = phrase ? "" : group.trim() || groups[0] || "";
    try { await opsJson("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "options", kind: kindKey, label, value: g && g !== "แบบ" ? `${command}|${g}` : command, sort_order: rows.length + 1 }) }); setLabel(""); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const link = async (o: OptionRow, v: { id: string; code?: string | null } | null) => {
    const before = o.extra ?? {};
    try {
      await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "options", id: o.id, patch: { extra: v ? { ...before, sku_id: v.id, sku_code: v.code ?? "" } : {} } }) });
      setLinkFor(null); onChanged();
      toast.undo(v ? `ผูก "${o.label}" กับ ${v.code ?? "SKU"} แล้ว` : "เอา SKU ออกแล้ว", async () => { await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "options", id: o.id, patch: { extra: before } }) }); onChanged(); });
    } catch (e) { toast.error((e as Error).message); }
  };
  const patch = async (o: OptionRow, p: Partial<OptionRow>) => {
    try { await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "options", id: o.id, patch: p }) }); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <ERPModal open onClose={onClose} title={phrase ? `ข้อความลัดของคำสั่ง "${command}"` : `ตัวเลือกของคำสั่ง "${command}"`} size="sm" defaultExpanded={false} storageKey="order-ops-command-choices" zIndex={70}>
      <div className="space-y-2">
        <div className="flex gap-2">
          {!phrase && <input value={group} onChange={(e) => setGroup(e.target.value)} list="cmd-choice-groups" placeholder={groups[0] ? `กลุ่ม (เช่น ${groups[0]})` : "กลุ่ม (เช่น กระดาษ) ว่างได้"} className={`${inputCls} w-36`} />}
          <datalist id="cmd-choice-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder={phrase ? "เช่น ตัดสายให้สั้นลง {n} {u}" : "ตัวเลือกใหม่ เช่น ลายดอก"} className={inputCls} />
          <button onClick={add} className="shrink-0 rounded-lg bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700">เพิ่ม</button>
        </div>
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1 text-xs font-medium text-slate-500">{g}</div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {rows.filter((o) => groupOf(o) === g).map((o) => (
                <li key={o.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className={`flex-1 ${o.is_active ? "" : "text-slate-400 line-through"}`}>{o.label}</span>
                  {!phrase && (o.extra?.sku_id
                    ? <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 text-[11px] text-emerald-700" title="คงเหลือดึงจากสต๊อกกลางของ SKU นี้">{o.extra.sku_code ?? "SKU"}<button onClick={() => void link(o, null)} className="text-emerald-800" aria-label="เอา SKU ออก">×</button></span>
                    : <button onClick={() => setLinkFor(o.id)} className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-sky-700 hover:bg-slate-50" title="ผูกกับ SKU วัสดุ เพื่อโชว์คงเหลือ">ผูก SKU</button>)}
                  <button title="แก้ชื่อ" onClick={() => { const v = window.prompt("แก้ชื่อตัวเลือก", o.label); if (v && v.trim() && v.trim() !== o.label) void patch(o, { label: v.trim() }); }} className="text-slate-400 hover:text-slate-700"><Icon name="edit" className="h-4 w-4" /></button>
                  <button onClick={() => void patch(o, { is_active: !o.is_active })} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">{o.is_active ? "ซ่อน" : "เปิดใช้"}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!rows.length && <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">ยังไม่มี{phrase ? "ข้อความลัด" : "ตัวเลือก"}</p>}
        {phrase && <p className="text-[11px] text-slate-400">{"{n}"} = ช่องใส่ตัวเลข · {"{u}"} = เลือกหน่วย นิ้ว/ซม. · ซ่อน = ไม่โผล่ในป๊อป (รายการเก่าไม่หาย)</p>}
        {!phrase && <p className="text-[11px] text-slate-400">ผูก SKU วัสดุ (เช่น กระดาษห่อ) → ป๊อปโชว์คงเหลือจากสต๊อกกลาง เหลือไม่เกิน 5 = เตือนใกล้หมด</p>}
        {linkFor && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-2">
            <div className="mb-1 text-xs text-sky-800">เลือก SKU วัสดุของ &quot;{rows.find((x) => x.id === linkFor)?.label}&quot;</div>
            <SkuPicker value={null} onChange={(v) => { const o = rows.find((x) => x.id === linkFor); if (o && v) void link(o, v); }} placeholder="ค้นรหัส/ชื่อ SKU วัสดุ..." />
            <button onClick={() => setLinkFor(null)} className="mt-1 text-xs text-slate-500 underline">ยกเลิก</button>
          </div>
        )}
      </div>
    </ERPModal>
  );
}

type Log = { id: string; action: string; metadata: Record<string, unknown> | null; created_at: string };
const ACTION_TH: Record<string, string> = { create: "สร้าง", update: "แก้ไข", delete: "ย้ายลงถังขยะ", restore: "กู้คืน", print: "พิมพ์ใบสลักชื่อ", hard_delete: "ลบถาวร" };

/** ประวัติว่าใครทำอะไร (อ่านจาก audit_logs ผ่าน API ?id=) */
export function HistoryList({ logs }: { logs: Log[] }) {
  if (!logs.length) return <p className="text-xs text-slate-400">ยังไม่มีประวัติ</p>;
  return (
    <ul className="space-y-1.5">
      {logs.map((l) => {
        const m = l.metadata ?? {};
        const changes = Array.isArray(m.changes) ? (m.changes as { field: string; old: unknown; new: unknown }[]) : [];
        return (
          <li key={l.id} className="text-xs text-slate-600">
            <span className="text-slate-400">{new Date(l.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
            {" · "}<b className="font-medium">{String(m.actor ?? "ไม่ทราบชื่อ")}</b> {ACTION_TH[l.action] ?? l.action}
            {changes.length > 0 && <span className="text-slate-400"> — {changes.map((c) => `${c.field}: ${fmt(c.old)} → ${fmt(c.new)}`).join(" · ")}</span>}
          </li>
        );
      })}
    </ul>
  );
}
function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return "ว่าง";
  if (Array.isArray(v)) return v.join(", ") || "ว่าง";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่";
  return String(v).slice(0, 40);
}

/** ปุ่มสลับดูถังขยะ */
export function TrashToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs ${on ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      <Icon name="trash" className="h-3.5 w-3.5" /> {on ? "กำลังดูถังขยะ" : "ถังขยะ"}
    </button>
  );
}

export function fmtDate(v: unknown) {
  if (!v) return "-";
  return new Date(String(v)).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}
