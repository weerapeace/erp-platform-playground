"use client";

// ============================================================
// ฟอร์มคำสั่งพิเศษ (สร้าง/แก้) — ใช้ใน /order-ops/instructions
// - เลือกออเดอร์จากรายการ (ของกลาง PlatformOrderPicker · หมายเหตุขึ้นก่อน) หรือพิมพ์/สแกนเลข
// - เติม ช่องทาง / ลูกค้า / สินค้า / หมายเหตุลูกค้า ให้เอง (แก้ทับได้)
// - ออเดอร์หลายชิ้น: ติ๊ก SKU ที่ต้องทำ → สร้าง 1 คำสั่งต่อ SKU (สลักคนละชื่อได้)
// - ชื่อสลัก: A-Z a-z 0-9 + ตัวพิเศษที่ตั้งไว้เท่านั้น — มีตัวสลักไม่ได้ = บันทึกไม่ได้ (เจ้าของเลือก 2026-11-24)
// - เดาชื่อสลักจากหมายเหตุลูกค้า (กดรับเอง) · เลือกฟอนต์
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { PlatformOrderPicker, type PickedOrder } from "@/components/platform-order-picker";
import {
  DEFAULT_ENGRAVE_FONT, ENGRAVE_MAX_CHARS, ENGRAVE_POSITIONS, ENGRAVE_TYPES, INSTRUCTION_STATUS,
  engraveTextError, guessEngraveFromNote, invalidEngraveChars, splitEngraveChars,
} from "@/lib/order-ops";
import { Field, HistoryList, OrderNoField, SkuField, inputCls, opsJson, type OptionRow, type OrderHit } from "./shared";

export type Ins = {
  id: string; order_no: string; platform: string | null; customer_name: string | null; sku: string | null;
  commands: string[]; engrave: boolean; engrave_text: string | null; engrave_type: string | null; engrave_position: string | null; engrave_font: string | null;
  note: string | null; status: "todo" | "done"; done_at: string | null; done_by_name: string | null;
  print_count: number; is_trial: boolean; platform_order_id: string | null; created_at: string; created_by_name: string | null; deleted_at: string | null;
};

const PLATFORMS = ["Shopee", "Lazada", "TikTok", "LINE", "Facebook", "IG", "เว็บไซต์", "อื่นๆ"];
type Item = OrderHit["items"][number];
type Line = { key: string; sku: string; text: string };

/** ช่องตัวอย่างใบสลัก 10/20 ช่อง — ช่องที่สลักไม่ได้เป็นสีแดง */
export function EngravePreview({ text, specials, font }: { text: string; specials: string[]; font: string }) {
  const chars = splitEngraveChars(text);
  if (!chars.length) return null;
  const bad = new Set(invalidEngraveChars(text, specials));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[420px] grid-cols-10 border border-slate-800 text-center" style={{ fontFamily: `"${font}", serif` }}>
        {Array.from({ length: chars.length > 10 ? 20 : 10 }, (_, i) => {
          const c = chars[i] ?? "";
          return <div key={i} className={`flex h-12 items-end justify-center border-r border-t border-slate-800 pb-1 text-2xl [&:nth-child(10n)]:border-r-0 [&:nth-child(-n+10)]:border-t-0 ${bad.has(c) ? "bg-rose-100 text-rose-700" : ""}`}>{c}</div>;
        })}
      </div>
    </div>
  );
}

/** ช่องชื่อสลัก + ปุ่มตัวพิเศษ + ข้อความเตือน */
function EngraveNameInput({ value, onChange, specials, label, onManage }: { value: string; onChange: (v: string) => void; specials: string[]; label: string; onManage?: () => void }) {
  const err = value.trim() ? engraveTextError(value, specials) : null;
  return (
    <div>
      <Field label={label}>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="เช่น Pitchayapa" className={`${inputCls} ${err ? "border-rose-400 focus:border-rose-500" : ""}`} />
      </Field>
      {err ? <p className="mt-1 text-xs text-rose-600"><Icon name="alert-triangle" className="mr-1 inline h-3.5 w-3.5" />{err} — แก้ก่อนบันทึก</p>
        : value.trim() ? <p className="mt-1 text-xs text-emerald-700"><Icon name="check" className="mr-1 inline h-3.5 w-3.5" />สลักได้ทุกตัว</p> : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="text-xs text-slate-500">ตัวพิเศษ:</span>
        {specials.map((c) => <button key={c} type="button" onClick={() => onChange(value + c)} className="min-w-[30px] rounded-md border border-slate-200 px-1.5 py-0.5 text-sm hover:bg-slate-50">{c}</button>)}
        {!specials.length && <span className="text-xs text-slate-400">ยังไม่ได้ตั้ง</span>}
        {onManage && <button type="button" onClick={onManage} className="ml-1 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"><Icon name="settings" className="h-3 w-3" /> จัดการ</button>}
      </div>
    </div>
  );
}

export function InstructionForm({ row, options, readOnly, canDelete, onManageEngrave, onClose, onSaved }: {
  row: Ins | null; options: OptionRow[]; readOnly: boolean; canDelete: boolean;
  /** เปิดหน้าตั้งค่าตัวพิเศษ/ฟอนต์ (หัวหน้า/แอดมิน) — ไม่ส่ง = ไม่มีปุ่ม */
  onManageEngrave?: () => void;
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const commands = options.filter((o) => o.kind === "instruction_command");
  const specials = options.filter((o) => o.kind === "engrave_special" && o.is_active).map((o) => o.label);
  const fontOpts = options.filter((o) => o.kind === "engrave_font" && (o.is_active || o.label === row?.engrave_font)).map((o) => o.label);
  const fonts = fontOpts.length ? fontOpts : [DEFAULT_ENGRAVE_FONT];

  const init = useMemo(() => ({
    order_no: row?.order_no ?? "", platform: row?.platform ?? "", customer_name: row?.customer_name ?? "", sku: row?.sku ?? "",
    commands: row?.commands ?? [], engrave: row?.engrave ?? false, engrave_text: row?.engrave_text ?? "",
    engrave_type: row?.engrave_type ?? "พิมพ์จม", engrave_position: row?.engrave_position ?? "มุมขวา", engrave_font: row?.engrave_font ?? "",
    note: row?.note ?? "", status: row?.status ?? "todo", platform_order_id: row?.platform_order_id ?? null as string | null,
  }), [row]);
  const [f, setF] = useState(init);
  const [items, setItems] = useState<Item[]>([]);
  const [lines, setLines] = useState<Line[]>([]);            // สร้างใหม่ + ออเดอร์หลายชิ้น: SKU ที่ติ๊ก
  const [buyerNote, setBuyerNote] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ id: string; action: string; metadata: Record<string, unknown> | null; created_at: string }[]>([]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const font = f.engrave_font || fonts[0];
  const multi = !row && items.length > 1;
  const dirty = JSON.stringify(f) !== JSON.stringify(init) || lines.length > 0;

  useEffect(() => {
    if (!row) return;
    opsJson<{ history: typeof history }>(`/api/order-ops?t=instructions&id=${row.id}`).then((r) => setHistory(r.history)).catch(() => {});
  }, [row]);

  /** เติมข้อมูลจากออเดอร์ (เลือกจากรายการ หรือเจอจากเลขที่พิมพ์) — ช่องที่กรอกแล้วไม่ทับ */
  const fillFrom = (o: { id: string; platform: string | null; customer_name: string | null; note: string | null; items: Item[] }) => {
    setItems(o.items);
    setBuyerNote(o.note);
    setF((p) => ({
      ...p, platform_order_id: o.id,
      platform: p.platform || o.platform || "", customer_name: p.customer_name || o.customer_name || "",
      sku: p.sku || (o.items.length === 1 ? o.items[0].sku ?? "" : ""),
      note: p.note || (o.note ? `ลูกค้าเขียน: ${o.note}` : ""),
    }));
    if (!row && o.items.length > 1) setLines([]);
  };
  const onFound = (o: OrderHit | null) => {
    if (!o) { setItems([]); setBuyerNote(null); set("platform_order_id", null); return; }
    fillFrom(o);
  };
  const onPick = (o: PickedOrder) => {
    setF((p) => ({ ...p, order_no: o.order_no, platform: "", customer_name: "", sku: "", note: "" }));
    fillFrom({ ...o });
    if (o.has_instruction) toast.warning("ออเดอร์นี้มีคำสั่งพิเศษอยู่แล้ว — เช็กก่อนว่าไม่ลงซ้ำ");
  };

  const guess = useMemo(() => guessEngraveFromNote(buyerNote), [buyerNote]);
  const applyGuess = () => {
    setF((p) => ({ ...p, engrave: true, engrave_text: guess.text ?? p.engrave_text, engrave_type: guess.type ?? p.engrave_type, engrave_position: guess.position ?? p.engrave_position }));
    if (multi && lines.length === 1 && guess.text) setLines((ls) => ls.map((l) => ({ ...l, text: guess.text ?? l.text })));
  };

  const toggleCmd = (c: string) => set("commands", f.commands.includes(c) ? f.commands.filter((x) => x !== c) : [...f.commands, c]);
  const toggleLine = (it: Item, idx: number) => {
    const key = `${idx}:${it.sku ?? ""}`;
    setLines((ls) => ls.some((l) => l.key === key) ? ls.filter((l) => l.key !== key) : [...ls, { key, sku: it.sku ?? "", text: ls.length === 0 ? f.engrave_text : "" }]);
  };

  const save = async () => {
    if (!f.order_no.trim()) { toast.error("กรุณาใส่เลขออเดอร์"); return; }
    if (multi && !lines.length) { toast.error("ออเดอร์นี้มีหลายชิ้น — ติ๊กสินค้าที่ต้องทำคำสั่งก่อน"); return; }
    const texts = multi ? lines.map((l) => l.text) : [f.engrave_text];
    if (f.engrave) {
      for (const t of texts) { const e = engraveTextError(t, specials); if (e) { toast.error(e); return; } }
    }
    setSaving(true);
    try {
      const base = {
        ...f, engrave_font: f.engrave ? font : null,
        engrave_text: f.engrave ? f.engrave_text.trim() : null, engrave_type: f.engrave ? f.engrave_type : null, engrave_position: f.engrave ? f.engrave_position : null,
      };
      if (row) await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "instructions", id: row.id, patch: base }) });
      else if (multi) {
        for (const l of lines) await opsJson("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "instructions", ...base, sku: l.sku, engrave_text: f.engrave ? l.text.trim() : null, is_trial: true }) });
      } else await opsJson("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "instructions", ...base, is_trial: true }) });
      toast.success(multi ? `บันทึกแล้ว ${lines.length} คำสั่ง` : "บันทึกแล้ว");
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  const del = async () => {
    if (!row) return;
    try {
      await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "instructions", ids: [row.id] }) });
      onSaved();
      toast.undo("ย้ายลงถังขยะแล้ว", async () => { await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "instructions", ids: [row.id], restore: true }) }); onSaved(); });
    } catch (e) { toast.error((e as Error).message); }
  };

  const activeCmds = commands.filter((c) => c.is_active || f.commands.includes(c.label)).map((c) => c.label);
  const hasBad = f.engrave && (multi ? lines.some((l) => !!engraveTextError(l.text, specials)) : !!engraveTextError(f.engrave_text, specials));

  return (
    <ERPModal
      open onClose={onClose} title={row ? `คำสั่งพิเศษ — ${row.order_no}` : "เพิ่มคำสั่งพิเศษ"} size="lg" defaultExpanded={false}
      storageKey="order-ops-instruction-form" hasUnsavedChanges={dirty && !readOnly}
      footer={readOnly ? undefined : (
        <div className="flex w-full items-center gap-2">
          {row && canDelete && <button onClick={del} className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">ลบ</button>}
          <span className="flex-1" />
          {hasBad && <span className="hidden text-xs text-rose-600 sm:inline">มีตัวที่สลักไม่ได้</span>}
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">ยกเลิก</button>
          <button onClick={save} disabled={saving || hasBad} title={hasBad ? "แก้ชื่อสลักก่อน — มีตัวที่เครื่องสลักทำไม่ได้" : ""} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      )}
    >
      <fieldset disabled={readOnly} className="space-y-3">
        <Field label="ออเดอร์ *">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1"><OrderNoField value={f.order_no} onChange={(v) => set("order_no", v)} onFound={onFound} autoFocus={!row} /></div>
            <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"><Icon name="list" className="h-4 w-4" /> เลือกออเดอร์</button>
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="ช่องทาง">
            <select value={f.platform} onChange={(e) => set("platform", e.target.value)} className={inputCls}>
              <option value="">-</option>
              {[...new Set([...PLATFORMS, ...(f.platform ? [f.platform] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="ชื่อลูกค้า"><input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} className={inputCls} /></Field>
          {!multi && <Field label="สินค้า (SKU)"><SkuField value={f.sku} onChange={(v) => set("sku", v)} items={items} /></Field>}
        </div>
        {multi && (
          <Field label="ออเดอร์นี้มีหลายชิ้น — ติ๊กสินค้าที่ต้องทำคำสั่ง (1 ชิ้น = 1 คำสั่ง)">
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {items.map((it, idx) => {
                const key = `${idx}:${it.sku ?? ""}`;
                const line = lines.find((l) => l.key === key);
                return (
                  <div key={key} className="px-3 py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!!line} onChange={() => toggleLine(it, idx)} />
                      <span className="font-mono text-xs">{it.sku ?? "?"}</span> <span className="text-slate-500">×{it.qty}</span>
                      <span className="truncate text-xs text-slate-400">{it.name ?? ""}</span>
                    </label>
                    {line && f.engrave && (
                      <div className="mt-2 pl-6">
                        <EngraveNameInput value={line.text} onChange={(v) => setLines((ls) => ls.map((l) => l.key === key ? { ...l, text: v } : l))} specials={specials} label={`ชื่อที่ต้องสลักบน ${it.sku ?? "ชิ้นนี้"} (สูงสุด ${ENGRAVE_MAX_CHARS} ตัว)`} />
                        <div className="mt-2"><EngravePreview text={line.text} specials={specials} font={font} /></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Field>
        )}
        <Field label="คำสั่ง (เลือกได้หลายข้อ)">
          <div className="flex flex-wrap gap-1.5">
            {activeCmds.map((c) => (
              <button key={c} type="button" onClick={() => toggleCmd(c)} className={`rounded-full border px-3 py-1 text-xs ${f.commands.includes(c) ? "border-sky-400 bg-sky-50 font-medium text-sky-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{c}</button>
            ))}
          </div>
        </Field>

        {guess.text && !readOnly && (f.engrave_text.trim() !== guess.text) && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
            <Icon name="sparkles" className="h-4 w-4" />
            <span>เดาจากหมายเหตุลูกค้า: สลัก <b className="font-semibold">{guess.text}</b>{guess.type ? ` · ${guess.type}` : ""}{guess.position ? ` · ${guess.position}` : ""}</span>
            <button type="button" onClick={applyGuess} className="ml-auto rounded-md border border-indigo-300 bg-white px-2 py-0.5 font-medium hover:bg-indigo-100">ใช้ค่านี้</button>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={f.engrave} onChange={(e) => set("engrave", e.target.checked)} /> สลักชื่อ
          </label>
          {f.engrave && (
            <div className="mt-2 space-y-2">
              {!multi && <EngraveNameInput value={f.engrave_text} onChange={(v) => set("engrave_text", v)} specials={specials} onManage={onManageEngrave} label={`ชื่อที่ต้องสลัก (อังกฤษ A-Z a-z ตัวเลข 0-9 และตัวพิเศษที่ตั้งไว้ · สูงสุด ${ENGRAVE_MAX_CHARS} ตัว)`} />}
              {multi && <p className="text-xs text-slate-500">ใส่ชื่อสลักในแต่ละชิ้นที่ติ๊กด้านบน · รูปแบบ/ตำแหน่ง/ฟอนต์ใช้ร่วมกัน{onManageEngrave && <button type="button" onClick={onManageEngrave} className="ml-2 text-sky-700 underline">จัดการตัวพิเศษ/ฟอนต์</button>}</p>}
              <div className="flex flex-wrap gap-4">
                <Field label="ฟอนต์">
                  <select value={font} onChange={(e) => set("engrave_font", e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                    {fonts.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="รูปแบบ">
                  <div className="flex gap-1">{ENGRAVE_TYPES.map((t) => <button key={t} type="button" onClick={() => set("engrave_type", t)} className={`rounded-md border px-2.5 py-1 text-xs ${f.engrave_type === t ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600"}`}>{t}</button>)}</div>
                </Field>
                <Field label="ตำแหน่ง">
                  <div className="flex gap-1">{ENGRAVE_POSITIONS.map((t) => <button key={t} type="button" onClick={() => set("engrave_position", t)} className={`rounded-md border px-2.5 py-1 text-xs ${f.engrave_position === t ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600"}`}>{t}</button>)}</div>
                </Field>
              </div>
              {!multi && <EngravePreview text={f.engrave_text} specials={specials} font={font} />}
              {!multi && f.engrave_text.trim() && <p className="text-[11px] text-slate-400">ตัวอย่างใช้ฟอนต์ {font} · ช่องแดง = สลักไม่ได้ · กดพิมพ์ได้จากหน้ารายการ</p>}
            </div>
          )}
        </div>
        <Field label="หมายเหตุ"><textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={2} className={inputCls} /></Field>
        {row && (
          <Field label="สถานะ">
            <div className="flex gap-1">{(["todo", "done"] as const).map((s) => <button key={s} type="button" onClick={() => set("status", s)} className={`rounded-md border px-3 py-1 text-xs ${f.status === s ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600"}`}>{INSTRUCTION_STATUS[s].label}</button>)}</div>
          </Field>
        )}
      </fieldset>
      {!row && <p className="mt-3 text-[11px] text-amber-700">ช่วงทดลอง: รายการใหม่จะติดป้าย "ทดลอง" และล้างทิ้งได้ทีเดียวตอนเริ่มใช้จริง</p>}
      {row && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-1 text-xs font-medium text-slate-600">ประวัติ</div>
          <HistoryList logs={history} />
        </div>
      )}
      <PlatformOrderPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPick} />
    </ERPModal>
  );
}

/** ป๊อปตั้งค่าเครื่องสลักชื่อ: ตัวที่สลักได้เสมอ (ล็อก) + ตัวพิเศษ + ฟอนต์ — เพิ่ม/แก้/เรียง/ซ่อน (ไม่ลบจริง) */
export function EngraveSettings({ open, onClose, options, onChanged }: { open: boolean; onClose: () => void; options: OptionRow[]; onChanged: () => void }) {
  return (
    <ERPModal open={open} onClose={onClose} title="ตั้งค่าเครื่องสลักชื่อ" size="md" defaultExpanded={false} storageKey="order-ops-engrave-settings" zIndex={60}>
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">ตัวที่สลักได้เสมอ</div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">A-Z · a-z · 0-9 · เว้นวรรค <span className="text-xs text-slate-400">(ล็อกไว้ แก้ไม่ได้)</span></div>
        </div>
        <OptionList kind="engrave_special" title="ตัวพิเศษที่สลักได้ (ปุ่มลัดในฟอร์ม)" placeholder="วางตัวพิเศษใหม่ 1 ตัว เช่น ♥" options={options} onChanged={onChanged} single />
        <OptionList kind="engrave_font" title="ฟอนต์ที่เครื่องสลักมี (ตัวบนสุด = ค่าเริ่มต้น)" placeholder="ชื่อฟอนต์ใหม่ เช่น Arial" options={options} onChanged={onChanged} fontPreview />
        <p className="text-[11px] text-slate-400">ซ่อนแทนลบ — คำสั่งเก่าที่ใช้ตัวนั้นไม่พัง · ทุกการแก้ลงประวัติ</p>
      </div>
    </ERPModal>
  );
}

function OptionList({ kind, title, placeholder, options, onChanged, single, fontPreview }: {
  kind: OptionRow["kind"]; title: string; placeholder: string; options: OptionRow[]; onChanged: () => void; single?: boolean; fontPreview?: boolean;
}) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const rows = options.filter((o) => o.kind === kind);
  const add = async () => {
    const v = label.trim();
    if (!v) return;
    if (single && splitEngraveChars(v).length !== 1) { toast.error("ใส่ทีละ 1 ตัว"); return; }
    if (single && /^[A-Za-z0-9 ]$/.test(v)) { toast.error("ตัวนี้สลักได้อยู่แล้ว ไม่ต้องเพิ่ม"); return; }
    try { await opsJson("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "options", kind, label: v, sort_order: rows.length + 1 }) }); setLabel(""); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const patch = async (o: OptionRow, p: Partial<OptionRow>) => {
    try { await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "options", id: o.id, patch: p }) }); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const rename = async (o: OptionRow) => {
    const v = window.prompt("แก้ไข", o.label);
    if (v && v.trim() && v.trim() !== o.label) await patch(o, { label: v.trim() });
  };
  const move = async (i: number, d: -1 | 1) => {
    const a = rows[i], b = rows[i + d];
    if (!a || !b) return;
    const sa = a.sort_order, sb = b.sort_order === sa ? sa + d : b.sort_order;
    await patch(a, { sort_order: sb });
    await patch(b, { sort_order: sa });
  };
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-600">{title}</div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.map((o, i) => (
          <li key={o.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className={`flex-1 ${single ? "text-lg" : ""} ${o.is_active ? "" : "text-slate-400 line-through"}`} style={fontPreview ? { fontFamily: `"${o.label}", serif` } : undefined}>{o.label}</span>
            <button title="เลื่อนขึ้น" onClick={() => move(i, -1)} className="text-slate-400 hover:text-slate-700"><Icon name="chevron-up" className="h-4 w-4" /></button>
            <button title="เลื่อนลง" onClick={() => move(i, 1)} className="text-slate-400 hover:text-slate-700"><Icon name="chevron-down" className="h-4 w-4" /></button>
            <button title="แก้ไข" onClick={() => rename(o)} className="text-slate-400 hover:text-slate-700"><Icon name="edit" className="h-4 w-4" /></button>
            <button onClick={() => patch(o, { is_active: !o.is_active })} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">{o.is_active ? "ซ่อน" : "เปิดใช้"}</button>
          </li>
        ))}
        <li className="flex gap-2 px-3 py-1.5">
          <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder={placeholder} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm" />
          <button onClick={add} className="rounded-md bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-700">เพิ่ม</button>
        </li>
      </ul>
    </div>
  );
}
