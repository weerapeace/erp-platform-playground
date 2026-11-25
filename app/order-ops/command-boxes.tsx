"use client";

// ============================================================
// กล่องตั้งค่าต่อคำสั่งในป๊อปคำสั่งพิเศษ — รอบ 2 (เจ้าของเลือก widget 2026-11-25 ข้อ 1-6)
//   ChoiceBox   ห่อ/การ์ดแทรก/สติกเกอร์: ตัวเลือกแยกกลุ่ม + คงเหลือวัสดุ (ตัวเลือกผูก SKU → สต๊อกกลาง lib/sku-stock)
//   SpecialWrapPanel  ห่อพิเศษ (สินค้ารหัสขึ้นต้นตามที่ตั้ง เช่น GIFT01): รูป + วัสดุ (Set บรรจุภัณฑ์กลางของหน้าแพ็ก) + วิธีห่อ
//   CardBox     การ์ด: ข้อความจากหมายเหตุ + เลือกแม่แบบ (การ์ดธรรมดาเห็นแม่แบบธรรมดา · การ์ดพิเศษเห็นแม่แบบที่ติ๊กพิเศษ)
//               + ตัวอย่างสด ลากข้อความ/เพิ่มข้อความได้ (CardQuickEdit) + "ออกแบบเต็ม" โหลดตัวออกแบบตอนกดเท่านั้น (รอบ 5)
//               → บันทึกคำสั่ง = สร้าง/อัปเดตการ์ดของออเดอร์ (ผ่าน saveCards)
//   PhraseBox   แก้ไซส์เข็มขัด: ข้อความลัด "{n}" ตัวเลข "{u}" หน่วย
//   SwapBox     เปลี่ยนสินค้า: SKU รุ่นเดียวกันก่อน (ตัวเดารหัสเดียวกับหน้าแพ็ก) + เลือก SKU รุ่นอื่น (SkuPicker กลาง)
// ข้อมูล: /api/order-ops?t=ins_context · ?t=stock · /api/order-gift-cards (การ์ด/แม่แบบ)
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { CardQuickEdit, useCardFonts } from "@/components/card-designer/preview";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { PHRASE_UNITS, choiceGroups, fillPhrase, phraseNeeds, phrasesOf, type CommandDetail } from "@/lib/order-ops";
import { fillTexts, groupTemplates, hasRole, isFolded, isSpecialTemplate, roleTexts, suggestMessage, type CardDoc } from "@/lib/gift-card-design";
import { inputCls, opsJson, type OptionRow } from "./shared";
import dynamic from "next/dynamic";
// Set บรรจุภัณฑ์ต่อรุ่น (ของกลางหน้าแพ็ก) หนัก — โหลดเฉพาะตอนกด "ตั้งวัสดุ + วิธีห่อ"
// ตัวออกแบบการ์ดเต็ม (ย่อ/หมุน/รูป/สติ๊กเกอร์) หนัก — โหลดเฉพาะตอนกด "ออกแบบเต็ม" (เจ้าของเลือก รอบ 5 ข้อ 2)
const CardDesignerAny = dynamic(() => import("@/components/card-designer").then((m) => m.CardDesignerAny), { ssr: false, loading: () => <p className="py-10 text-center text-sm text-slate-400">กำลังโหลดตัวออกแบบ…</p> });
const ParentPackingTab = dynamic(() => import("@/components/packing-station/packaging").then((m) => m.ParentPackingTab), { ssr: false });

const LOW_STOCK = 5;
const stockText = (n: number | null | undefined) => (n == null ? null : n <= 0 ? { t: "หมด", c: "text-rose-600" } : n <= LOW_STOCK ? { t: `เหลือ ${n} · ใกล้หมด`, c: "text-rose-600" } : { t: `เหลือ ${n}`, c: "text-emerald-700" });
const optExtra = (o: OptionRow | undefined) => ((o as OptionRow & { extra?: Record<string, string> } | undefined)?.extra ?? {}) as { sku_id?: string; sku_code?: string; template_group?: string };

/** คงเหลือของ SKU วัสดุ (สต๊อกกลาง) */
export function useMaterialStock(skuIds: string[]): Record<string, number> {
  const [m, setM] = useState<Record<string, number>>({});
  const key = [...new Set(skuIds)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    opsJson<{ stock: Record<string, number> }>(`/api/order-ops?t=stock&ids=${key}`).then((r) => setM(r.stock)).catch(() => {});
  }, [key]);
  return m;
}

export function ChoiceBox({ command, options, detail, onChange }: { command: string; options: OptionRow[]; detail: CommandDetail; onChange: (p: Partial<CommandDetail>) => void }) {
  const groups = choiceGroups(options, command, detail.choice ?? {});
  const optOf = (group: string, label: string) => options.find((o) => o.kind === "command_choice" && o.label === label && (String(o.value ?? "").split("|")[1] || "แบบ") === group && String(o.value ?? "").split("|")[0] === command);
  const skuIds = groups.flatMap((g) => g.items.map((it) => optExtra(optOf(g.group, it)).sku_id).filter((x): x is string => !!x));
  const stock = useMaterialStock(skuIds);
  if (!groups.length) return <p className="text-xs text-slate-500">ยังไม่มีตัวเลือกของคำสั่งนี้ — หัวหน้าเพิ่มได้ที่ ตั้งค่า › จัดการคำสั่ง › ตัวเลือก · พิมพ์รายละเอียดด้านล่างได้</p>;
  return (
    <div className="flex flex-wrap gap-3">
      {groups.map((g) => (
        <div key={g.group}>
          <div className="mb-1 text-xs text-slate-500">{g.group}</div>
          <div className="flex flex-wrap gap-1">
            {g.items.map((it) => {
              const ex = optExtra(optOf(g.group, it));
              const st = ex.sku_id ? stockText(stock[ex.sku_id] ?? null) : null;
              const on = detail.choice?.[g.group] === it;
              return (
                <button key={it} type="button" onClick={() => onChange({ choice: { ...(detail.choice ?? {}), [g.group]: on ? "" : it } })}
                  className={`flex min-w-[64px] flex-col items-start rounded-md border px-2.5 py-1 text-left text-xs ${on ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-700"}`}>
                  <span>{it}</span>
                  {st ? <span className={`text-[10px] ${st.c}`}>{st.t}</span> : ex.sku_id ? <span className="text-[10px] text-slate-400">…</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

type Special = { parent_id: string; code: string | null; name: string | null; image_key: string | null; items: { sku_code: string | null; qty: number }[]; set_name: string | null; materials: { sku_id: string; code: string | null; name: string | null; image_key: string | null; qty: number; on_hand: number | null }[]; how_to: string | null; flags: string[] };

/** ห่อพิเศษของออเดอร์ (ถ้ามี) — โชว์บนสุดของป๊อป */
export function SpecialWrapPanel({ orderId }: { orderId: string | null }) {
  const [list, setList] = useState<Special[]>([]);
  useEffect(() => {
    if (!orderId) { setList([]); return; }
    opsJson<{ special: Special[] }>(`/api/order-ops?t=ins_context&order=${orderId}`).then((r) => setList(r.special ?? [])).catch(() => setList([]));
  }, [orderId]);
  if (!list.length) return null;
  return (
    <div className="space-y-2">
      {list.map((s) => (
        <div key={s.parent_id} className="rounded-lg border border-pink-200 bg-pink-50/50 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm font-medium text-pink-800"><Icon name="gift" className="h-4 w-4" /> ห่อพิเศษ {s.code} <span className="text-xs font-normal text-pink-700">{s.items.map((i) => `${i.sku_code}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(" · ")}</span></div>
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {s.image_key ? <img src={r2ImageUrl(s.image_key, 200) ?? ""} alt="" className="h-20 w-20 shrink-0 rounded-md object-cover" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-white text-[11px] text-slate-400">ไม่มีรูป</div>}
            <div className="min-w-0 flex-1 space-y-1 text-xs">
              {s.materials.length ? (
                <div className="flex flex-wrap gap-1">
                  {s.materials.map((m) => { const st = stockText(m.on_hand); return <span key={m.sku_id} className="rounded-md border border-pink-200 bg-white px-2 py-0.5">{m.name ?? m.code} ×{m.qty}{st && <span className={`ml-1 ${st.c}`}>({st.t})</span>}</span>; })}
                </div>
              ) : <p className="text-amber-700">ยังไม่ได้ตั้งวัสดุที่ใช้ — ตั้งได้ที่ ตั้งค่า › ห่อพิเศษ</p>}
              {s.flags.length > 0 && <div className="flex flex-wrap gap-1">{s.flags.map((f) => <span key={f} className="rounded bg-amber-100 px-1.5 text-[11px] text-amber-800">{f}</span>)}</div>}
              {s.how_to ? <p className="whitespace-pre-line text-slate-700">วิธีห่อ: {s.how_to}</p> : <p className="text-slate-400">ยังไม่ได้เขียนวิธีห่อ</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PhraseBox({ command, options, detail, onChange }: { command: string; options: OptionRow[]; detail: CommandDetail; onChange: (p: Partial<CommandDetail>) => void }) {
  const phrases = phrasesOf(options, command);
  const [tpl, setTpl] = useState<string | null>(null);
  const [n, setN] = useState("");
  const [u, setU] = useState<string>(PHRASE_UNITS[0]);
  const pick = (t: string, nn = n, uu = u) => { setTpl(t); onChange({ text: fillPhrase(t, { n: nn, u: uu }) }); };
  const need = tpl ? phraseNeeds(tpl) : { n: false, u: false };
  return (
    <div className="space-y-2">
      {phrases.length > 0 && <div className="flex flex-wrap gap-1">{phrases.map((p) => <button key={p} type="button" onClick={() => pick(p)} className={`rounded-full border px-2.5 py-1 text-xs ${tpl === p ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-600"}`}>{fillPhrase(p, { n: "", u: "" }).replace(/\bx\b/, "x")}</button>)}</div>}
      {tpl && (need.n || need.u) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {need.n && <input value={n} onChange={(e) => { setN(e.target.value); pick(tpl, e.target.value, u); }} inputMode="decimal" placeholder="ตัวเลข" className="h-8 w-20 rounded-lg border border-slate-300 px-2" autoFocus />}
          {need.u && <div className="flex gap-1">{PHRASE_UNITS.map((x) => <button key={x} type="button" onClick={() => { setU(x); pick(tpl, n, x); }} className={`rounded-md border px-2 py-1 text-xs ${u === x ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600"}`}>{x}</button>)}</div>}
        </div>
      )}
      <input value={detail.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} placeholder="รายละเอียดคำสั่ง (กดข้อความลัดด้านบน หรือพิมพ์เอง)" className={inputCls} />
      {!phrases.length && <p className="text-[11px] text-slate-400">ยังไม่มีข้อความลัด — หัวหน้าเพิ่มได้ที่ ตั้งค่า › จัดการคำสั่ง</p>}
    </div>
  );
}

type Sib = { id: string; code: string | null; name: string | null; color: string | null; image_key: string | null; on_hand: number | null };
export function SwapBox({ fromSku, detail, onChange }: { fromSku: string; detail: CommandDetail; onChange: (p: Partial<CommandDetail>) => void }) {
  const [sibs, setSibs] = useState<Sib[] | null>(null);
  const [other, setOther] = useState(false);
  useEffect(() => {
    if (!fromSku.trim()) { setSibs([]); return; }
    setSibs(null);
    opsJson<{ siblings: Sib[] }>(`/api/order-ops?t=ins_context&sku=${encodeURIComponent(fromSku)}`).then((r) => setSibs(r.siblings ?? [])).catch(() => setSibs([]));
  }, [fromSku]);
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-slate-500">จาก <span className="font-mono">{fromSku || "-"}</span> → เปลี่ยนเป็น{detail.sku_code ? <b className="ml-1 font-mono text-sky-700">{detail.sku_code}</b> : null}</div>
      {sibs === null ? <p className="text-xs text-slate-400">กำลังหา SKU ในรุ่นเดียวกัน…</p> : sibs.length ? (
        <div className="flex flex-wrap gap-1">
          {sibs.map((s) => {
            const st = stockText(s.on_hand); const on = detail.sku_id === s.id;
            return (
              <button key={s.id} type="button" onClick={() => onChange(on ? { sku_id: "", sku_code: "" } : { sku_id: s.id, sku_code: s.code ?? "" })} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs ${on ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.image_key && <img src={r2ImageUrl(s.image_key, 80) ?? ""} alt="" className="h-7 w-7 rounded object-cover" />}
                <span className="flex flex-col"><span className="font-mono">{s.code}</span><span className="text-[10px] text-slate-500">{s.color ?? ""}{st ? <span className={`ml-1 ${st.c}`}>{st.t}</span> : null}</span></span>
              </button>
            );
          })}
        </div>
      ) : <p className="text-xs text-slate-400">ไม่พบรุ่นของ SKU นี้ — เลือก SKU รุ่นอื่นด้านล่าง</p>}
      {other || !sibs?.length ? (
        <SkuPicker value={detail.sku_id && !sibs?.some((s) => s.id === detail.sku_id) ? ({ id: detail.sku_id, code: detail.sku_code ?? "", name: detail.sku_code ?? "" } as SkuPickerValue) : null} onChange={(v) => onChange({ sku_id: v?.id ?? "", sku_code: v?.code ?? "" })} placeholder="เลือก SKU รุ่นอื่น..." />
      ) : <button type="button" onClick={() => setOther(true)} className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"><Icon name="search" className="h-3.5 w-3.5" /> เลือก SKU รุ่นอื่น</button>}
    </div>
  );
}

type Tpl = { id: string; name: string; doc: CardDoc; builtin: boolean; is_special?: boolean | null; group?: string | null; sort_order?: number; replaces_builtin?: string | null };
/** ที่ป๊อปใช้ตอนบันทึก: การ์ดของคำสั่งนี้ (สร้าง/อัปเดต) */
export type CardDraft = { cardId: string | null; baseDoc: CardDoc | null; templateId: string | null; message: string };

export function CardBox({ command, option, orderId, index, detail, onChange, draftRef }: {
  command: string; option?: OptionRow; orderId: string | null; index: number; detail: CommandDetail; onChange: (p: Partial<CommandDetail>) => void;
  draftRef: React.MutableRefObject<Record<string, CardDraft>>;
}) {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [card, setCard] = useState<{ id: string; doc: CardDoc; template_id: string | null; printed_at: string | null; hand_written_at: string | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** หน้าตาที่แก้ในป๊อป (ย้ายข้อความ/เพิ่มข้อความ/ออกแบบเต็ม) — null = ใช้หน้าตาแม่แบบ/การ์ดเดิม */
  const [edited, setEdited] = useState<CardDoc | null>(null);
  const [full, setFull] = useState(false);
  useCardFonts();
  const special = /พิเศษ/.test(command);
  const groupHint = optExtra(option).template_group;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch(orderId ? `/api/order-gift-cards?order=${orderId}` : "/api/order-gift-cards?view=templates");
        const j = await res.json();
        if (!alive) return;
        setTpls((j.templates ?? []) as Tpl[]);
        setNote(j.note ?? null);
        const sib = (j.siblings ?? [])[index] as { id: string } | undefined;
        const cid = detail.card_id || sib?.id;
        if (cid) {
          const c = await apiFetch(`/api/order-gift-cards?id=${cid}`).then((r) => r.json());
          if (alive && c.card) setCard(c.card);
        }
      } catch { /* โหลดไม่ได้ = ใช้ช่องข้อความอย่างเดียว */ }
      finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, index]);

  // ข้อความเริ่มต้น: ที่เคยกรอก → ในการ์ดเดิม → เดาจากหมายเหตุลูกค้า
  useEffect(() => {
    if (!loaded || detail.message !== undefined) return;
    const m = card ? roleTexts(card.doc).message : suggestMessage(note);
    if (m) onChange({ message: m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // การ์ดธรรมดา = แม่แบบธรรมดาเท่านั้น · การ์ดพิเศษ = แม่แบบที่ติ๊กพิเศษเท่านั้น (ติ๊กที่หน้าแม่แบบ · รอบ 5 ข้อ 3)
  const pool = useMemo(() => tpls.filter((t) => isSpecialTemplate(t) === special), [tpls, special]);
  const groups = useMemo(() => groupTemplates(pool.filter((t) => !t.builtin), pool.filter((t) => t.builtin)), [pool]);
  const defaultTpl = useMemo(() => {
    const inGroup = groupHint ? groups.find((g) => g.group === groupHint)?.items ?? [] : [];
    return (inGroup.length ? inGroup : groups.flatMap((g) => g.items))[0] ?? null;
  }, [groups, groupHint]);
  const tplId = detail.template_id || card?.template_id || defaultTpl?.id || "";
  const tpl = tpls.find((t) => t.id === tplId) ?? null;
  const message = detail.message ?? "";
  // การ์ดเดิมและไม่ได้เปลี่ยนแม่แบบ → ใช้หน้าตาเดิม (แก้ทั้งใบไว้ก็ไม่หาย) · เปลี่ยนแม่แบบ → ใช้แม่แบบใหม่
  const baseDoc = card && (!detail.template_id || detail.template_id === card.template_id) ? card.doc : tpl?.doc ?? null;
  // แม่แบบไม่มีช่องข้อความลูกค้า → เพิ่มช่องให้ครั้งเดียว (กันรหัสชิ้นเปลี่ยนทุกครั้งที่วาด = ลากไม่ได้)
  const base = useMemo(() => { const b0 = edited ?? baseDoc; return b0 && !hasRole(b0, "message") ? fillTexts(b0, { message: "" }) : b0; }, [edited, baseDoc]);
  const working = useMemo(() => (base ? fillTexts(base, { message }) : null), [base, message]);
  const pickTpl = (id: string) => { setEdited(null); onChange({ template_id: id }); };

  useEffect(() => {
    draftRef.current[command] = { cardId: card?.id ?? null, baseDoc: base, templateId: tpl && !tpl.builtin ? tpl.id : null, message };
  }, [command, card, base, tpl, message, draftRef]);

  const noPool = loaded && !pool.length && !card;
  return (
    <div className="space-y-2">
      {noPool ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
          ยังไม่มีแม่แบบ{special ? "การ์ดพิเศษ" : "การ์ดธรรมดา"} — ติ๊ก &quot;การ์ดพิเศษ&quot; ที่หน้าแม่แบบการ์ด (ตั้งค่า › แม่แบบการ์ด) · ตอนนี้พิมพ์ข้อความไว้ก่อนได้
        </p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {groups.flatMap((g) => g.items).map((t) => (
            <button key={t.id} type="button" onClick={() => pickTpl(t.id)} title={t.group ?? ""}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${t.id === tplId ? "border-sky-400 bg-sky-50 font-medium text-sky-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {t.name}{isFolded(t.doc) ? " · พับ" : ""}
            </button>
          ))}
          {card && detail.template_id && detail.template_id !== card.template_id && <span className="self-center text-[10px] text-amber-700">เปลี่ยนแม่แบบ = ใช้หน้าตาแม่แบบใหม่แทนการ์ดเดิม</span>}
        </div>
      )}
      {working ? (
        <CardQuickEdit doc={working} onChange={setEdited} message={message} onMessage={(v) => onChange({ message: v })} maxHeight={200}
          onFull={() => setFull(true)} onReset={edited ? () => setEdited(null) : undefined} />
      ) : (
        <textarea value={message} onChange={(e) => onChange({ message: e.target.value })} rows={3} placeholder="ข้อความบนการ์ด" className={inputCls} />
      )}
      {!card && note && <p className="text-[11px] text-slate-400">ข้อความดึงจากหมายเหตุลูกค้าให้แล้ว · แก้ได้</p>}
      <p className="text-[11px] text-slate-500">
        {card ? <>การ์ดของออเดอร์นี้: {card.printed_at ? <span className="text-emerald-700">พิมพ์แล้ว</span> : card.hand_written_at ? <span className="text-emerald-700">เขียนมือแล้ว</span> : <span className="text-rose-600">ยังไม่พิมพ์</span>} · บันทึกคำสั่ง = อัปเดตการ์ดใบนี้</> : orderId ? "บันทึกคำสั่ง = สร้างการ์ดของออเดอร์นี้ให้เลย (อยู่ใน การ์ดทั้งหมด พิมพ์ได้ทันที)" : "ยังไม่ผูกออเดอร์ — บันทึกแล้วสร้างการ์ดไม่ผูกออเดอร์"}
        {card && <a href={`/order-ops/gift-cards/edit?id=${card.id}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-sky-700 hover:underline">เปิดหน้าการ์ด ↗</a>}
      </p>
      {full && working && (
        <ERPModal open onClose={() => setFull(false)} title={`ออกแบบการ์ด — ${command}`} size="xl" storageKey="order-ops-card-full" zIndex={70}
          footer={<div className="flex w-full items-center gap-2"><span className="flex-1 text-[11px] text-slate-500">แก้แล้วมีผลกับการ์ดของคำสั่งนี้ · บันทึกจริงตอนกด &quot;บันทึก&quot; ในป๊อปคำสั่ง</span><button type="button" onClick={() => setFull(false)} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">เสร็จ</button></div>}>
          <CardDesignerAny value={working} onChange={(d) => { setEdited(d); const m = roleTexts(d).message; if (m !== message) onChange({ message: m }); }} height={460} />
        </ERPModal>
      )}
    </div>
  );
}

/** ตอนบันทึกคำสั่ง: สร้าง/อัปเดตการ์ดของคำสั่งการ์ดทุกข้อ → คืน card_id ต่อคำสั่ง (ข้อความว่าง + ไม่มีการ์ดเดิม = ข้าม) */
export async function saveCards(drafts: Record<string, CardDraft>, commands: string[], orderId: string | null, orderNo: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const c of commands) {
    const d = drafts[c];
    if (!d || !d.baseDoc || (!d.message.trim() && !d.cardId)) continue;
    const doc = fillTexts(d.baseDoc, { message: d.message });
    const res = await apiFetch("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "save_card", id: d.cardId ?? undefined, doc, template_id: d.templateId, ...(d.cardId ? {} : orderId ? { platform_order_id: orderId } : { order_no: orderNo }) }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "บันทึกการ์ดไม่สำเร็จ");
    out[c] = String(j.id ?? d.cardId);
  }
  return out;
}

/** ref ของร่างการ์ดในป๊อป */
export const useCardDrafts = () => useRef<Record<string, CardDraft>>({});

/**
 * ตั้งค่า › ห่อพิเศษ — รหัสสินค้าห่อพิเศษ (เช่น GIFT01 · เพิ่มได้) + ต่อรุ่น: รูป · วัสดุที่ใช้ · วิธีห่อ
 *   วัสดุ/ป้าย/วิธีห่อ = ของกลาง ParentPackingTab (Set บรรจุภัณฑ์ของหน้าแพ็ก · โน้ตตอนแพ็ค = วิธีห่อ) ไม่เก็บซ้ำ
 *   ซ่อนรหัส = ไม่นับเป็นห่อพิเศษ (กดเปิดใช้กลับได้ · ไม่ลบจริง)
 */
export function SpecialWrapSettings({ options, onChanged }: { options: OptionRow[]; onChanged: () => void }) {
  const [code, setCode] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [parents, setParents] = useState<{ id: string; code: string | null; name: string | null; image_key: string | null; has_set: boolean; has_note: boolean }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const rows = options.filter((o) => o.kind === "special_wrap");
  const key = rows.map((r) => r.label).join(",");
  useEffect(() => {
    if (!key) { setParents([]); return; }
    opsJson<{ parents: typeof parents }>(`/api/order-ops?t=parents&codes=${encodeURIComponent(key)}`).then((r) => setParents(r.parents)).catch(() => {});
  }, [key]);
  const add = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    try { await opsJson("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "options", kind: "special_wrap", label: c, sort_order: rows.length + 1 }) }); setCode(""); setErr(null); onChanged(); }
    catch (e) { setErr((e as Error).message); }
  };
  const toggle = async (o: OptionRow) => {
    try { await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "options", id: o.id, patch: { is_active: !o.is_active } }) }); onChanged(); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <section>
      <h2 className="text-base font-semibold text-slate-800">ห่อพิเศษ</h2>
      <p className="mb-2 text-[12px] text-slate-500">ออเดอร์ที่มีสินค้ารหัสขึ้นต้นตามนี้ = ห่อพิเศษ (ขึ้นในงานพิเศษเอง + ป๊อปโชว์รูป วัสดุที่ใช้ วิธีห่อ) · วัสดุ/วิธีห่อ ตั้งต่อรุ่นด้านล่าง (ใช้ Set บรรจุภัณฑ์เดียวกับหน้าแพ็ก)</p>
      <div className="mb-2 flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="รหัสรุ่น เช่น GIFT01" className={`${inputCls} max-w-[220px] font-mono`} />
        <button type="button" onClick={() => void add()} className="shrink-0 rounded-lg bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700">เพิ่มรหัส</button>
      </div>
      {err && <p className="mb-2 text-xs text-rose-600">{err}</p>}
      <div className="space-y-2">
        {rows.map((o) => {
          const p = parents.find((x) => (x.code ?? "").toUpperCase() === o.label.toUpperCase());
          return (
            <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p?.image_key ? <img src={r2ImageUrl(p.image_key, 120) ?? ""} alt="" className="h-12 w-12 rounded-md object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-[10px] text-slate-400">รูป</div>}
                <div className="min-w-0 flex-1">
                  <div className={`font-mono text-sm ${o.is_active ? "text-slate-800" : "text-slate-400 line-through"}`}>{o.label}</div>
                  <div className="text-[11px] text-slate-500">{p ? <>{p.name} · {p.has_set ? "ตั้งวัสดุแล้ว" : <span className="text-amber-700">ยังไม่ตั้งวัสดุ</span>} · {p.has_note ? "มีวิธีห่อ" : <span className="text-amber-700">ยังไม่มีวิธีห่อ</span>}</> : <span className="text-amber-700">ไม่พบรุ่นรหัสนี้ใน Parent SKU (ยังจับจากรหัสสินค้าในออเดอร์ได้)</span>}</div>
                </div>
                {p && <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-sky-700 hover:bg-slate-50">{open === p.id ? "ปิด" : "ตั้งวัสดุ + วิธีห่อ"}</button>}
                <button type="button" onClick={() => void toggle(o)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">{o.is_active ? "ซ่อน" : "เปิดใช้"}</button>
              </div>
              {p && open === p.id && <div className="mt-3 border-t border-slate-100 pt-3"><ParentPackingTab parentId={p.id} /></div>}
            </div>
          );
        })}
        {!rows.length && <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">ยังไม่มีรหัสห่อพิเศษ</p>}
      </div>
    </section>
  );
}
