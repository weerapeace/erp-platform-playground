"use client";

// ============================================================
// ฟอร์มคำสั่งพิเศษ (สร้าง/แก้) — ใช้ใน /order-ops/instructions
// - เลือกออเดอร์จากรายการ (ของกลาง PlatformOrderPicker · หมายเหตุขึ้นก่อน) หรือพิมพ์/สแกนเลข
// - เติม ช่องทาง / ลูกค้า / สินค้า / หมายเหตุลูกค้า ให้เอง (แก้ทับได้)
// - ออเดอร์หลายชิ้น: ติ๊ก SKU ที่ต้องทำ → สร้าง 1 คำสั่งต่อ SKU (สลักคนละชื่อได้)
// - ชื่อสลัก: A-Z a-z 0-9 + ตัวพิเศษที่ตั้งไว้เท่านั้น — มีตัวสลักไม่ได้ = บันทึกไม่ได้ (เจ้าของเลือก 2026-11-24)
// - เดาชื่อสลักจากหมายเหตุลูกค้า (กดรับเอง) · เลือกฟอนต์
// - กดชิปคำสั่ง → กล่องตั้งค่าของคำสั่งนั้น (ทะเบียนชนิดกล่อง lib/order-ops commandBoxOf · ค่าเก็บ command_details) — เจ้าของเลือก 2026-11-25
// - ลูกค้าแจ้งทางแชท (via_chat + โน้ต) · สถานะพิมพ์ใบสลัก = ประวัติพิมพ์กลาง (PrintHistoryBadge doc_type engrave_sheet)
// - prefill = เปิดจากปุ่ม "ส่งไปสั่งสลัก" / "+ คำสั่งพิเศษ" ในหน้ารวม (ยังไม่บันทึกจนกด "บันทึก")
// - รอบ 5 (เจ้าของเลือก widget 2026-11-25): 2 คอลัมน์ — ซ้าย = ออเดอร์ + รูปสินค้าทุกชิ้น + ปุ่มคำสั่งใหญ่ (ไอคอนขยับตอนชี้)
//   ขวา = รายการคำสั่งที่เลือก (กล่องตั้งค่าแต่ละคำสั่ง) · มือถือเรียงบน-ล่าง · "ดูออเดอร์" = ลิ้นชักรายละเอียดออเดอร์ของศูนย์ออเดอร์
//   อ่านหมายเหตุแล้วเพิ่มสลักชื่อ/การ์ดให้เอง (เอาออกได้) · ปุ่มพิมพ์ = ใบสลัก + การ์ดในครั้งเดียว
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Drawer, ERPModal } from "@/components/modal";
import dynamic from "next/dynamic";
import { HoverImage } from "@/components/hover-image";
import { LoadingState } from "@/components/state-views";
import { r2ImageUrl } from "@/lib/r2-image";
import { classifyNote } from "@/lib/gift-card-design";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { PlatformOrderPicker, type PickedOrder } from "@/components/platform-order-picker";
import { PrintHistoryBadge } from "@/components/print-history";
import { CardBox, ChoiceBox, PhraseBox, SpecialWrapPanel, SwapBox, saveCards, useCardDrafts } from "./command-boxes";
import {
  DEFAULT_ENGRAVE_FONT, ENGRAVE_MAX_CHARS, ENGRAVE_POSITIONS, ENGRAVE_TYPES, INSTRUCTION_STATUS,
  commandBoxOf, commandHint, commandIconOf, type CommandDetail,
  decodeEngraveSku, engraveSkuMaps, engraveTextError, guessEngraveFromNote, invalidEngraveChars, splitEngraveChars,
} from "@/lib/order-ops";
import { Field, HistoryList, OrderNoField, SkuField, inputCls, opsJson, type OptionRow, type OrderHit } from "./shared";

export type Ins = {
  id: string; order_no: string; platform: string | null; customer_name: string | null; sku: string | null;
  commands: string[]; engrave: boolean; engrave_text: string | null; engrave_type: string | null; engrave_position: string | null; engrave_font: string | null;
  note: string | null; status: "todo" | "done"; done_at: string | null; done_by_name: string | null;
  print_count: number; is_trial: boolean; platform_order_id: string | null; created_at: string; created_by_name: string | null; deleted_at: string | null;
  command_details?: Record<string, CommandDetail> | null; via_chat?: boolean; chat_note?: string | null;
  /** สถานะพิมพ์ (API คำนวณจาก print_logs + การ์ดของออเดอร์) */
  print_state?: { state: "none" | "todo" | "done"; engrave: { n: number; last: string | null } | null; card: { total: number; printed: number; last: string | null; by: string | null } | null };
};
/** ค่าตั้งต้นตอนเปิดป๊อปจากที่อื่น (ส่งไปสั่งสลัก / คำสั่งจากแชท) */
export type InsPrefill = Partial<Pick<Ins, "order_no" | "platform" | "customer_name" | "sku" | "engrave" | "engrave_text" | "engrave_type" | "engrave_position" | "note" | "platform_order_id" | "via_chat" | "chat_note">>;

// ลิ้นชักรายละเอียดออเดอร์ (ของศูนย์ออเดอร์) หนัก — โหลดเฉพาะตอนกด "ดูออเดอร์"
const OrderDetailView = dynamic(() => import("@/app/master/platform-orders/order-detail-view").then((m) => m.OrderDetailView), { ssr: false, loading: () => <LoadingState /> });

const PLATFORMS = ["Shopee", "Lazada", "TikTok", "LINE", "Facebook", "IG", "เว็บไซต์", "อื่นๆ"];
type Item = OrderHit["items"][number];
type Line = { key: string; sku: string; text: string; type: string; position: string };

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
          return <div key={i} className={`flex h-12 items-end justify-center border-r border-t border-slate-800 pb-1 text-2xl font-bold [&:nth-child(10n)]:border-r-0 [&:nth-child(-n+10)]:border-t-0 ${bad.has(c) ? "bg-rose-100 text-rose-700" : ""}`}>{c}</div>;
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

export function InstructionForm({ row, prefill, options, readOnly, canDelete, onManageEngrave, onClose, onSaved }: {
  row: Ins | null; prefill?: InsPrefill | null; options: OptionRow[]; readOnly: boolean; canDelete: boolean;
  /** เปิดหน้าตั้งค่าตัวพิเศษ/ฟอนต์ (หัวหน้า/แอดมิน) — ไม่ส่ง = ไม่มีปุ่ม */
  onManageEngrave?: () => void;
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const commands = options.filter((o) => o.kind === "instruction_command");
  const specials = options.filter((o) => o.kind === "engrave_special" && o.is_active).map((o) => o.label);
  const fontOpts = options.filter((o) => o.kind === "engrave_font" && (o.is_active || o.label === row?.engrave_font)).map((o) => o.label);
  const fonts = fontOpts.length ? fontOpts : [DEFAULT_ENGRAVE_FONT];
  // รหัสท้าย SKU → รูปแบบ/ตำแหน่ง (WK45-05G/2 = ฟอยทอง · ตรงกลาง) · ตั้งได้ในหน้าตั้งค่าเครื่องสลัก
  const maps = useMemo(() => engraveSkuMaps(options), [options]);
  const dec = (sku: string | null | undefined) => decodeEngraveSku(sku, maps.types, maps.positions);
  const decLabel = (sku: string | null) => { const d = dec(sku); return d ? [d.type, d.position].filter(Boolean).join(" · ") || null : null; };

  const init = useMemo(() => {
    const pf = row ? {} : (prefill ?? {});
    return {
      order_no: row?.order_no ?? pf.order_no ?? "", platform: row?.platform ?? pf.platform ?? "", customer_name: row?.customer_name ?? pf.customer_name ?? "", sku: row?.sku ?? pf.sku ?? "",
      commands: row?.commands ?? [], engrave: row?.engrave ?? pf.engrave ?? false, engrave_text: row?.engrave_text ?? pf.engrave_text ?? "",
      engrave_type: row?.engrave_type ?? pf.engrave_type ?? "พิมพ์จม", engrave_position: row?.engrave_position ?? pf.engrave_position ?? "มุมขวา", engrave_font: row?.engrave_font ?? "",
      note: row?.note ?? pf.note ?? "", status: row?.status ?? "todo", platform_order_id: row?.platform_order_id ?? pf.platform_order_id ?? null as string | null,
      command_details: (row?.command_details ?? {}) as Record<string, CommandDetail>,
      via_chat: row?.via_chat ?? pf.via_chat ?? false, chat_note: row?.chat_note ?? pf.chat_note ?? "",
    };
  }, [row, prefill]);
  // เปิดจากที่อื่นพร้อมค่าตั้งต้น = ยังไม่บันทึก → ถือว่ามีของค้าง (ปิดแล้วถามก่อน)
  const prefilled = !row && !!prefill?.order_no;
  const [f, setF] = useState(init);
  const [items, setItems] = useState<Item[]>([]);
  const [lines, setLines] = useState<Line[]>([]);            // สร้างใหม่ + ออเดอร์หลายชิ้น: SKU ที่ติ๊ก
  const [buyerNote, setBuyerNote] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  /** คำสั่งที่ระบบเพิ่มให้จากหมายเหตุลูกค้า (เอาออกได้) */
  const [auto, setAuto] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ id: string; action: string; metadata: Record<string, unknown> | null; created_at: string }[]>([]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const font = f.engrave_font || fonts[0];
  const multi = !row && items.length > 1;
  const dirty = prefilled || JSON.stringify(f) !== JSON.stringify(init) || lines.length > 0;
  const cardDrafts = useCardDrafts();
  const setDetail = (cmd: string, patch: Partial<CommandDetail>) => setF((p) => ({ ...p, command_details: { ...p.command_details, [cmd]: { ...(p.command_details[cmd] ?? {}), ...patch } } }));

  useEffect(() => {
    if (!row) return;
    opsJson<{ history: typeof history }>(`/api/order-ops?t=instructions&id=${row.id}`).then((r) => setHistory(r.history)).catch(() => {});
  }, [row]);

  /** เติมข้อมูลจากออเดอร์ (เลือกจากรายการ หรือเจอจากเลขที่พิมพ์) — ช่องที่กรอกแล้วไม่ทับ */
  const fillFrom = (o: { id: string; platform: string | null; customer_name: string | null; note: string | null; items: Item[] }) => {
    setItems(o.items);
    setBuyerNote(o.note);
    setF((p) => {
      const sku = p.sku || (o.items.length === 1 ? o.items[0].sku ?? "" : "");
      const d = !p.sku && sku ? dec(sku) : null;
      return {
        ...p, platform_order_id: o.id,
        platform: p.platform || o.platform || "", customer_name: p.customer_name || o.customer_name || "",
        sku, note: p.note || (o.note ? `ลูกค้าเขียน: ${o.note}` : ""),
        ...(d ? { engrave: true, engrave_type: d.type ?? p.engrave_type, engrave_position: d.position ?? p.engrave_position } : {}),
      };
    });
    if (!row && o.items.length > 1) setLines([]);
    autoFromNote(o.note);
  };
  /** อ่านหมายเหตุลูกค้า → ติ๊กสลักชื่อ (+ชื่อที่เดาได้) / เพิ่มคำสั่งการ์ดธรรมดา ให้เอง · ไม่ทับที่กรอกแล้ว · เฉพาะคำสั่งใหม่ */
  const autoFromNote = (note: string | null) => {
    if (row || !note) { setAuto([]); return; }
    const cls = classifyNote(note);
    const g = guessEngraveFromNote(note);
    const regCard = commands.find((o) => o.is_active && commandBoxOf(o.label, o.value) === "card" && !/พิเศษ/.test(o.label))?.label ?? null;
    const wantEngrave = !!g.text || cls.engrave;
    const wantCard = cls.card && !!regCard;
    setF((p) => ({
      ...p,
      ...(wantEngrave ? (p.engrave ? (p.engrave_text ? {} : { engrave_text: g.text ?? "" })
        : { engrave: true, engrave_text: p.engrave_text || g.text || "", engrave_type: g.type ?? p.engrave_type, engrave_position: g.position ?? p.engrave_position }) : {}),
      ...(wantCard && regCard && !p.commands.includes(regCard) ? { commands: [...p.commands, regCard] } : {}),
    }));
    setAuto([...(wantEngrave ? ["สลักชื่อ"] : []), ...(wantCard && regCard ? [regCard] : [])]);
  };
  const undoAuto = () => {
    setF((p) => ({ ...p, ...(auto.includes("สลักชื่อ") ? { engrave: false } : {}), commands: p.commands.filter((c) => !auto.includes(c)) }));
    setAuto([]);
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

  /** เปลี่ยน SKU → ถ้าเป็น SKU สลัก ตั้งรูปแบบ/ตำแหน่งตามรหัสท้ายให้เอง */
  const setSku = (v: string) => setF((p) => {
    const d = dec(v);
    return { ...p, sku: v, ...(d ? { engrave: true, engrave_type: d.type ?? p.engrave_type, engrave_position: d.position ?? p.engrave_position } : {}) };
  });
  const skuDec = !multi ? dec(f.sku) : null;
  const mismatch = (sku: string, type: string, position: string) => {
    const d = dec(sku);
    return !!d && ((!!d.type && d.type !== type) || (!!d.position && d.position !== position));
  };
  const toggleCmd = (c: string) => set("commands", f.commands.includes(c) ? f.commands.filter((x) => x !== c) : [...f.commands, c]);
  const isCardCmd = (c: string) => commandBoxOf(c, commands.find((o) => o.label === c)?.value) === "card";
  const cardCmds = f.commands.filter(isCardCmd);
  const existingCardIds = cardCmds.map((c) => f.command_details[c]?.card_id).filter((x): x is string => !!x);
  /** หน้าพิมพ์: มีสลัก = ใบสลัก (+การ์ดพิมพ์พร้อมกัน) · การ์ดอย่างเดียว = หน้าพิมพ์การ์ด */
  const printUrl = (insIds: string[], cIds: string[]) => (f.engrave && insIds.length
    ? `/print/engrave-sheets?ids=${insIds.join(",")}${cIds.length ? `&cards=${cIds.join(",")}` : ""}`
    : cIds.length ? `/print/order-gift-cards?ids=${cIds.join(",")}` : null);
  const toggleLine = (it: Item, idx: number) => {
    const key = `${idx}:${it.sku ?? ""}`;
    const d = dec(it.sku);
    if (d) set("engrave", true);
    setLines((ls) => ls.some((l) => l.key === key) ? ls.filter((l) => l.key !== key)
      : [...ls, { key, sku: it.sku ?? "", text: ls.length === 0 ? f.engrave_text : "", type: d?.type ?? f.engrave_type, position: d?.position ?? f.engrave_position }]);
  };

  /** บันทึก (print = บันทึกแล้วเปิดใบสลัก · เปิดหน้าต่างก่อนรอ กันเบราว์เซอร์บล็อกป๊อป) */
  const save = async (print = false) => {
    if (!f.order_no.trim()) { toast.error("กรุณาใส่เลขออเดอร์"); return; }
    if (print && !f.engrave && !cardCmds.length) { toast.error("ยังไม่มีอะไรให้พิมพ์ — เลือกสลักชื่อหรือการ์ดก่อน"); return; }
    if (multi && !lines.length) { toast.error("ออเดอร์นี้มีหลายชิ้น — ติ๊กสินค้าที่ต้องทำคำสั่งก่อน"); return; }
    const texts = multi ? lines.map((l) => l.text) : [f.engrave_text];
    if (f.engrave) {
      for (const t of texts) { const e = engraveTextError(t, specials); if (e) { toast.error(e); return; } }
    }
    if (print && row && !dirty) { const u = printUrl([row.id], existingCardIds); if (u) window.open(u, "_blank"); else toast.error("การ์ดยังไม่ได้บันทึก — พิมพ์ข้อความการ์ดแล้วกดบันทึกก่อน"); return; }
    const win = print ? window.open("about:blank", "_blank") : null;
    setSaving(true);
    try {
      const ids: string[] = [];
      // การ์ด: บันทึกคำสั่ง = สร้าง/อัปเดตการ์ดของออเดอร์ (ข้อ 3) → จำ card_id ไว้ในคำสั่ง
      const cardIds = await saveCards(cardDrafts.current, cardCmds, f.platform_order_id, f.order_no);
      const details = Object.fromEntries(Object.entries(f.command_details).filter(([k]) => f.commands.includes(k)).map(([k, v]) => [k, cardIds[k] ? { ...v, card_id: cardIds[k] } : v]));
      for (const [k, id] of Object.entries(cardIds)) if (!details[k]) details[k] = { card_id: id };
      const base = {
        ...f, engrave_font: f.engrave ? font : null,
        command_details: details,
        chat_note: f.via_chat ? f.chat_note : null,
        engrave_text: f.engrave ? f.engrave_text.trim() : null, engrave_type: f.engrave ? f.engrave_type : null, engrave_position: f.engrave ? f.engrave_position : null,
      };
      if (row) { await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "instructions", id: row.id, patch: base }) }); ids.push(row.id); }
      else if (multi) {
        for (const l of lines) {
          const r = await opsJson<{ row: { id: string } }>("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "instructions", ...base, sku: l.sku, engrave_text: f.engrave ? l.text.trim() : null, engrave_type: f.engrave ? l.type : null, engrave_position: f.engrave ? l.position : null, is_trial: true }) });
          ids.push(r.row.id);
        }
      } else { const r = await opsJson<{ row: { id: string } }>("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "instructions", ...base, is_trial: true }) }); ids.push(r.row.id); }
      toast.success(multi ? `บันทึกแล้ว ${lines.length} คำสั่ง` : "บันทึกแล้ว");
      if (win) {
        const cIds = [...new Set([...Object.values(cardIds), ...existingCardIds])];
        const u = printUrl(ids, cIds);
        if (u) win.location.href = u; else { win.close(); toast.warning("บันทึกแล้ว แต่ยังไม่มีการ์ดให้พิมพ์ (ข้อความการ์ดว่าง)"); }
      }
      onSaved();
    } catch (e) { win?.close(); toast.error((e as Error).message); }
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

  const tileCls = (on: boolean) => `group flex flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2.5 text-center text-[12px] leading-tight transition-colors ${on ? "border-sky-400 bg-sky-50 font-medium text-sky-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`;
  // ไอคอนขยับตอนชี้/กด (เจ้าของเลือกแบบ B) — ปิดเองถ้าเครื่องตั้ง "ลดการเคลื่อนไหว"
  const tileIcon = "h-6 w-6 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:scale-110 motion-safe:group-active:scale-90";
  /** เจอออเดอร์ในศูนย์ออเดอร์ (มีรายการสินค้า) → ช่องทาง/ลูกค้า/SKU อ่านอย่างเดียว */
  const linked = !!f.platform_order_id && items.length > 0;
  const listItems: Item[] = items.length ? items : f.sku ? [{ sku: f.sku, name: null, qty: 1, sku_id: null, image_key: null }] : [];

  const engraveBox = f.engrave && (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <Icon name="signature" className="h-4 w-4" /> สลักชื่อ
        {row && <span className="ml-auto font-normal"><PrintHistoryBadge docType="engrave_sheet" docId={row.id} label="ใบสลัก" /></span>}
        {!readOnly && <button type="button" onClick={() => set("engrave", false)} aria-label="เอาสลักชื่อออก" title="เอาออก" className={`${row ? "" : "ml-auto"} rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600`}><Icon name="x" className="h-4 w-4" /></button>}
      </div>
      <div className="space-y-2">
        {!multi && <EngraveNameInput value={f.engrave_text} onChange={(v) => set("engrave_text", v)} specials={specials} onManage={onManageEngrave} label={`ชื่อที่ต้องสลัก (อังกฤษ A-Z a-z ตัวเลข 0-9 และตัวพิเศษที่ตั้งไว้ · สูงสุด ${ENGRAVE_MAX_CHARS} ตัว)`} />}
        {multi && !lines.length && <p className="text-xs text-amber-700">ติ๊กสินค้าที่ต้องสลักทางซ้ายก่อน (1 ชิ้น = 1 คำสั่ง)</p>}
        {multi && lines.map((line) => (
          <div key={line.key} className="rounded-md border border-slate-100 bg-slate-50/60 p-2">
            <EngraveNameInput value={line.text} onChange={(v) => setLines((ls) => ls.map((l) => l.key === line.key ? { ...l, text: v } : l))} specials={specials} label={`ชื่อที่ต้องสลักบน ${line.sku || "ชิ้นนี้"} (สูงสุด ${ENGRAVE_MAX_CHARS} ตัว)`} />
            <div className="mt-2 flex flex-wrap gap-1">
              {ENGRAVE_TYPES.map((t) => <button key={t} type="button" onClick={() => setLines((ls) => ls.map((l) => l.key === line.key ? { ...l, type: t } : l))} className={`rounded-md border px-2 py-0.5 text-xs ${line.type === t ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-600"}`}>{t}</button>)}
              <span className="mx-1 w-px bg-slate-200" />
              {ENGRAVE_POSITIONS.map((t) => <button key={t} type="button" onClick={() => setLines((ls) => ls.map((l) => l.key === line.key ? { ...l, position: t } : l))} className={`rounded-md border px-2 py-0.5 text-xs ${line.position === t ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-600"}`}>{t}</button>)}
            </div>
            {mismatch(line.sku, line.type, line.position) && <p className="mt-1 text-xs text-amber-700"><Icon name="alert-triangle" className="mr-1 inline h-3.5 w-3.5" />ไม่ตรงกับรหัสสินค้า {line.sku} ({decLabel(line.sku)}) — เช็กกับลูกค้าก่อน</p>}
            <div className="mt-2"><EngravePreview text={line.text} specials={specials} font={font} /></div>
          </div>
        ))}
        <div className="flex flex-wrap gap-4">
          <Field label="ฟอนต์">
            <select value={font} onChange={(e) => set("engrave_font", e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
              {fonts.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          {!multi && <Field label="รูปแบบ">
            <div className="flex gap-1">{ENGRAVE_TYPES.map((t) => <button key={t} type="button" onClick={() => set("engrave_type", t)} className={`rounded-md border px-2.5 py-1 text-xs ${f.engrave_type === t ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600"}`}>{t}</button>)}</div>
          </Field>}
          {!multi && <Field label="ตำแหน่ง">
            <div className="flex gap-1">{ENGRAVE_POSITIONS.map((t) => <button key={t} type="button" onClick={() => set("engrave_position", t)} className={`rounded-md border px-2.5 py-1 text-xs ${f.engrave_position === t ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600"}`}>{t}</button>)}</div>
          </Field>}
        </div>
        {!multi && skuDec && (mismatch(f.sku, f.engrave_type, f.engrave_position)
          ? <p className="text-xs text-amber-700"><Icon name="alert-triangle" className="mr-1 inline h-3.5 w-3.5" />ไม่ตรงกับรหัสสินค้า {f.sku} ({decLabel(f.sku)}) — เช็กกับลูกค้าก่อน</p>
          : <p className="text-xs text-emerald-700"><Icon name="check" className="mr-1 inline h-3.5 w-3.5" />รูปแบบ/ตำแหน่งตั้งจากรหัสสินค้า {f.sku}</p>)}
        {!multi && <EngravePreview text={f.engrave_text} specials={specials} font={font} />}
        {!multi && f.engrave_text.trim() && <p className="text-[11px] text-slate-400">ตัวอย่างใช้ฟอนต์ {font} · ช่องแดง = สลักไม่ได้</p>}
      </div>
    </div>
  );

  return (
    <ERPModal
      open onClose={onClose} title={row ? `คำสั่งพิเศษ — ${row.order_no}` : "เพิ่มคำสั่งพิเศษ"} size="xl" defaultExpanded={false}
      storageKey="order-ops-instruction-form-v2" hasUnsavedChanges={dirty && !readOnly}
      footer={readOnly ? undefined : (
        <div className="flex w-full items-center gap-2">
          {row && canDelete && <button onClick={del} className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">ลบ</button>}
          <span className="flex-1" />
          {hasBad && <span className="hidden text-xs text-rose-600 sm:inline">มีตัวที่สลักไม่ได้</span>}
          {(f.engrave || cardCmds.length > 0) && <button onClick={() => save(true)} disabled={saving || hasBad} title={dirty ? "บันทึกก่อนแล้วเปิดหน้าพิมพ์" : "เปิดหน้าพิมพ์"} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"><Icon name="printer" className="h-4 w-4" /> พิมพ์<span className="hidden sm:inline">{f.engrave && cardCmds.length ? "ใบสลัก + การ์ด" : f.engrave ? "ใบสลัก" : "การ์ด"}</span></button>}
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">ยกเลิก</button>
          <button onClick={() => save()} disabled={saving || hasBad} title={hasBad ? "แก้ชื่อสลักก่อน — มีตัวที่เครื่องสลักทำไม่ได้" : ""} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      )}
    >
      <fieldset disabled={readOnly} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ── ซ้าย: ออเดอร์ · สินค้า · ปุ่มคำสั่ง ── */}
        <div className="min-w-0 space-y-3">
          <Field label="ออเดอร์ *">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1"><OrderNoField value={f.order_no} onChange={(v) => set("order_no", v)} onFound={onFound} autoFocus={!row} /></div>
              <button type="button" onClick={() => setPickerOpen(true)} title="เลือกออเดอร์จากรายการ" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-2 text-sm hover:bg-slate-50"><Icon name="list" className="h-4 w-4" /><span className="hidden sm:inline">เลือก</span></button>
              {f.platform_order_id && <button type="button" onClick={() => setOrderOpen(true)} title="ดูรายละเอียดออเดอร์ (ลิ้นชักข้าง ฟอร์มไม่หาย)" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-2 text-sm hover:bg-slate-50"><Icon name="layout-sidebar-right" className="h-4 w-4" /><span className="hidden sm:inline">ดูออเดอร์</span></button>}
            </div>
          </Field>
          {linked ? (
            // เจอออเดอร์ในศูนย์ออเดอร์ = ข้อมูลจากร้าน อ่านอย่างเดียว (เจ้าของสั่ง 2026-11-25) · เปลี่ยนออเดอร์ได้จากปุ่ม "เลือก"
            <div className="grid grid-cols-2 gap-2">
              {([["ช่องทาง", f.platform], ["ชื่อลูกค้า", f.customer_name]] as const).map(([l, v]) => (
                <div key={l}>
                  <div className="mb-1 text-xs text-slate-500">{l}</div>
                  <div title="มาจากศูนย์ออเดอร์ — แก้ไม่ได้" className="flex h-9 items-center gap-1.5 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"><Icon name="lock" className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{v || "-"}</span></div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="ช่องทาง">
                  <select value={f.platform} onChange={(e) => set("platform", e.target.value)} className={inputCls}>
                    <option value="">-</option>
                    {[...new Set([...PLATFORMS, ...(f.platform ? [f.platform] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="ชื่อลูกค้า"><input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} className={inputCls} /></Field>
              </div>
              {!multi && <Field label="สินค้า (SKU)"><SkuField value={f.sku} onChange={setSku} items={items} decode={decLabel} /></Field>}
            </>
          )}
          {listItems.length > 0 && (
            <div>
              <div className="mb-1 text-xs text-slate-500">{multi ? "ลูกค้าซื้อหลายชิ้น — ติ๊กชิ้นที่ต้องทำคำสั่ง (1 ชิ้น = 1 คำสั่ง)" : `ลูกค้าซื้อ ${listItems.reduce((n, i) => n + i.qty, 0)} ชิ้น`}</div>
              <div className="space-y-1.5">
                {listItems.map((it, idx) => {
                  const key = `${idx}:${it.sku ?? ""}`;
                  const on = lines.some((l) => l.key === key);
                  const url = r2ImageUrl(it.image_key ?? null, 400);
                  const body = (
                    <>
                      {url ? <HoverImage url={url} size={48} previewSize={300} rounded="rounded-md" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400"><Icon name="photo" className="h-5 w-5" /></div>}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-xs font-medium">{it.sku ?? "?"}</span><span className="text-xs text-slate-500">×{it.qty}</span></div>
                        {it.name && <div className="truncate text-[11px] text-slate-500">{it.name}</div>}
                        {decLabel(it.sku) && <span className="mt-0.5 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700">สลัก {decLabel(it.sku)}</span>}
                      </div>
                    </>
                  );
                  return multi
                    ? <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-1.5 ${on ? "border-sky-300 bg-sky-50/60" : "border-slate-200 bg-white"}`}><input type="checkbox" checked={on} onChange={() => toggleLine(it, idx)} className="ml-1" />{body}</label>
                    : <div key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5">{body}</div>;
                })}
              </div>
            </div>
          )}
          <SpecialWrapPanel orderId={f.platform_order_id} />
          {buyerNote && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><b className="font-medium">หมายเหตุลูกค้า:</b> “{buyerNote}”</div>}
          {auto.length > 0 && !readOnly && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-800">
              <Icon name="sparkles" className="h-4 w-4" /> เพิ่มจากหมายเหตุลูกค้าให้แล้ว: <b className="font-medium">{auto.join(" · ")}</b>
              <button type="button" onClick={undoAuto} className="ml-auto rounded-md border border-indigo-300 bg-white px-2 py-0.5 hover:bg-indigo-100">เอาออก</button>
            </div>
          )}
          {guess.text && !readOnly && f.engrave && !multi && (f.engrave_text.trim() !== guess.text) && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
              <Icon name="sparkles" className="h-4 w-4" />
              <span>เดาจากหมายเหตุลูกค้า: สลัก <b className="font-semibold">{guess.text}</b>{guess.type ? ` · ${guess.type}` : ""}{guess.position ? ` · ${guess.position}` : ""}</span>
              <button type="button" onClick={applyGuess} className="ml-auto rounded-md border border-indigo-300 bg-white px-2 py-0.5 font-medium hover:bg-indigo-100">ใช้ค่านี้</button>
            </div>
          )}
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-600">กดคำสั่ง (กดซ้ำ = เอาออก)</div>
            <div className="grid grid-cols-4 gap-1.5">
              <button type="button" onClick={() => set("engrave", !f.engrave)} aria-pressed={f.engrave} className={tileCls(f.engrave)}>
                <Icon name={commandIconOf("สลักชื่อ")} className={tileIcon} />สลักชื่อ
              </button>
              {activeCmds.map((c) => {
                const on = f.commands.includes(c);
                return (
                  <button key={c} type="button" onClick={() => toggleCmd(c)} aria-pressed={on} className={tileCls(on)}>
                    <Icon name={commandIconOf(c)} className={tileIcon} />{c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── ขวา: รายการคำสั่ง ── */}
        <div className="min-w-0 space-y-3 rounded-xl bg-slate-50 p-3">
          <div className="text-xs font-medium text-slate-600">รายการคำสั่ง ({(f.engrave ? 1 : 0) + f.commands.length})</div>
          {!f.engrave && !f.commands.length && <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-8 text-center text-xs text-slate-400">กดปุ่มคำสั่งเพื่อเพิ่ม</p>}
          {engraveBox}
          {f.commands.map((c) => {
            const opt = commands.find((o) => o.label === c);
            const box = commandBoxOf(c, opt?.value);
            const hint = commandHint(c);
            const d = f.command_details[c] ?? {};
            return (
              <div key={c} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Icon name={commandIconOf(c)} className="h-4 w-4" /> {c}
                  {!readOnly && <button type="button" onClick={() => toggleCmd(c)} aria-label={`เอา ${c} ออก`} title="เอาออก" className="ml-auto rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="x" className="h-4 w-4" /></button>}
                </div>
                {box === "none" && <p className="text-xs text-slate-500">{hint ?? "ไม่ต้องตั้งค่าเพิ่ม"}</p>}
                {box === "choice" && <ChoiceBox command={c} options={options} detail={d} onChange={(pp) => setDetail(c, pp)} />}
                {box === "swap" && <SwapBox fromSku={f.sku} detail={d} onChange={(pp) => setDetail(c, pp)} />}
                {box === "phrase" && <PhraseBox command={c} options={options} detail={d} onChange={(pp) => setDetail(c, pp)} />}
                {box === "card" && <CardBox command={c} option={opt} orderId={f.platform_order_id} index={cardCmds.indexOf(c)} detail={d} onChange={(pp) => setDetail(c, pp)} draftRef={cardDrafts} />}
                {(box === "text" || box === "choice") && <input value={d.text ?? ""} onChange={(e) => setDetail(c, { text: e.target.value })} placeholder={box === "text" ? "รายละเอียดคำสั่ง" : "รายละเอียดเพิ่ม (ว่างได้)"} className={`${inputCls} ${box === "choice" ? "mt-2" : ""}`} />}
              </div>
            );
          })}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.via_chat} onChange={(e) => set("via_chat", e.target.checked)} /> ลูกค้าแจ้งทางแชท <span className="text-xs text-slate-400">(ไม่ได้ลงหมายเหตุในออเดอร์)</span></label>
            {f.via_chat && <input value={f.chat_note} onChange={(e) => set("chat_note", e.target.value)} maxLength={300} placeholder="โน้ต เช่น แจ้งใน Shopee chat 25/11 · ขอห่อสีแดง" className={`${inputCls} mt-2`} />}
          </div>
          <Field label="หมายเหตุ"><textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={2} className={`${inputCls} bg-white`} /></Field>
          {row && (
            <Field label="สถานะ">
              <div className="flex gap-1">{(["todo", "done"] as const).map((s) => <button key={s} type="button" onClick={() => set("status", s)} className={`rounded-md border px-3 py-1 text-xs ${f.status === s ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-600"}`}>{INSTRUCTION_STATUS[s].label}</button>)}</div>
            </Field>
          )}
        </div>
      </fieldset>
      {!row && <p className="mt-3 text-[11px] text-amber-700">ช่วงทดลอง: รายการใหม่จะติดป้าย "ทดลอง" และล้างทิ้งได้ทีเดียวตอนเริ่มใช้จริง</p>}
      {row && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-1 text-xs font-medium text-slate-600">ประวัติ</div>
          <HistoryList logs={history} />
        </div>
      )}
      <PlatformOrderPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPick} itemBadge={decLabel} />
      {orderOpen && f.platform_order_id && (
        <Drawer open onClose={() => setOrderOpen(false)} size="xl" storageKey="order-ops-order-detail" title={`ออเดอร์ ${f.order_no}`}
          headerActions={() => <a href={`/master/platform-orders/${f.platform_order_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50" title="เปิดเต็มหน้าในแท็บใหม่"><Icon name="external-link" />เต็มหน้า</a>}>
          <OrderDetailView key={f.platform_order_id} id={f.platform_order_id} layout="drawer" />
        </Drawer>
      )}
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
        <SkuCodeList kind="engrave_sku_type" title="รหัสท้าย SKU → รูปแบบ (ตัวอักษรก่อน / เช่น WK45-05G/2 → G)" choices={ENGRAVE_TYPES} options={options} onChanged={onChanged} />
        <SkuCodeList kind="engrave_sku_pos" title="รหัสท้าย SKU → ตำแหน่ง (ตัวเลขหลัง / เช่น WK45-05G/2 → 2)" choices={ENGRAVE_POSITIONS} options={options} onChanged={onChanged} />
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

/** ตารางรหัสท้าย SKU → ความหมาย (เพิ่ม · เปลี่ยนความหมาย · ซ่อน/เปิด) */
function SkuCodeList({ kind, title, choices, options, onChanged }: {
  kind: "engrave_sku_type" | "engrave_sku_pos"; title: string; choices: readonly string[]; options: OptionRow[]; onChanged: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [val, setVal] = useState<string>(choices[0]);
  const rows = options.filter((o) => o.kind === kind);
  const isType = kind === "engrave_sku_type";
  const add = async () => {
    const c = code.trim().toUpperCase();
    if (!(isType ? /^[A-Z]$/ : /^\d{1,2}$/).test(c)) { toast.error(isType ? "รหัสต้องเป็นตัวอักษรอังกฤษ 1 ตัว" : "รหัสต้องเป็นตัวเลข"); return; }
    try { await opsJson("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "options", kind, label: c, value: val, sort_order: rows.length + 1 }) }); setCode(""); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const patch = async (o: OptionRow, p: Partial<OptionRow>) => {
    try { await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "options", id: o.id, patch: p }) }); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-600">{title}</div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.map((o) => (
          <li key={o.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className={`w-8 font-mono font-semibold ${o.is_active ? "" : "text-slate-400 line-through"}`}>{o.label}</span>
            <span className="text-slate-400">=</span>
            <select value={o.value ?? ""} onChange={(e) => patch(o, { value: e.target.value })} className="flex-1 rounded-md border border-slate-200 px-2 py-0.5 text-sm">
              {!choices.includes(o.value ?? "") && <option value={o.value ?? ""}>{o.value || "-"}</option>}
              {choices.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => patch(o, { is_active: !o.is_active })} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">{o.is_active ? "ซ่อน" : "เปิดใช้"}</button>
          </li>
        ))}
        <li className="flex gap-2 px-3 py-1.5">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={isType ? "รหัส เช่น S" : "รหัส เช่น 3"} className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm" />
          <select value={val} onChange={(e) => setVal(e.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm">
            {choices.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={add} className="rounded-md bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-700">เพิ่ม</button>
        </li>
      </ul>
    </div>
  );
}
