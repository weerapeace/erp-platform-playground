"use client";

/**
 * ป๊อปจ่ายด่วน — บอร์ดจ่ายงาน โหมดผู้บริหาร (เจ้าของขอ 2026-11-04: "ตรงช่างเหมาและจับกลุ่มจะแตกต่างนิดหน่อย …")
 *   ลากการ์ดลงโต๊ะ / กด "จ่ายให้โต๊ะนี้" → ป๊อปสั้นตามชนิดโต๊ะ (deskKindOf — lib/work-entry-rules)
 *     โต๊ะปกติ  = ใส่จำนวนทีละใบ · คนรับ = ทั้งโต๊ะ
 *     ช่างเหมา  = เลือกช่างได้หลายคน (อย่างน้อย 1) + จำนวนรายคน — เจ้าของขอ 2026-11-05:
 *                 "เลือกหลายคนได้ (ใส่จำนวนตามรายคน) แบ่งเท่าๆกันก่อนตอนเลือก แต่เตือนเหลือ, เกินด้วย เหลือได้แค่ห้ามเกิน"
 *                 เลือก/เอาคนออก = แบ่งเท่ากันใหม่ทุกใบ (splitEven เศษให้คนที่เลือกก่อน) · แก้รายคนได้ · ปุ่ม "แบ่งเท่ากันใหม่" รายใบ
 *                 รวมเกินที่เหลือ = ห้ามจ่าย · เหลือ = เตือนสีเหลือง จ่ายได้ (splitIssues) · คนที่ใส่ 0 = ไม่จ่ายคนนั้น
 *                 บันทึก = 1 ใบจ่ายงานต่อ (สินค้า × คน) — ค่าแรง/รับคืน/ส่ง QC แยกรายคน (QuickRow.parts)
 *     จับกลุ่ม   = เลือกพนักงานหลายคน (บังคับ) + จำนวน + ค่าแรงรวมกลุ่ม / ตกคนละ (หารเท่า ประมาณการ) — ใบเดียวหลายคน
 *   ค่าแรง = ค่าแรง/ชิ้นของใบ (ราคากลางในสูตร) × จำนวน · ไม่มี = เว้นว่าง ใส่ทีหลังได้
 *   วันที่จ่าย = วันนี้ · กำหนดเสร็จ = ของใบสั่งผลิต — อยากแก้ → ปุ่ม "ป๊อปเต็ม" (ป๊อปจ่ายงานเดิมของบอร์ด ทีละใบ)
 * ของกลางที่ใช้: ERPModal · CrewPick (เลือกคน + จัดกลุ่ม ช่างเหมา/ไทย/พม่า) · dispatchRowIssues/splitEven/splitIssues (กฎกลาง)
 * บันทึกจริงอยู่ที่หน้าบอร์ด (onSubmit → POST /api/mo/work-orders ทีละใบ เหมือนป๊อปเดิม)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { CrewPick, lastCrewIds, crewGroupOf, crewGroupLabel, CREW_GROUP_DOT, type CrewPerson } from "./crew-pick";
import { deskKindOf, dispatchRowIssues, splitEven, splitIssues } from "@/lib/work-entry-rules";

export type QuickMo = { id: string; mo_no: string; product_sku: string | null; product_name: string | null; remaining: number; image_url: string | null; ready: boolean };
/** parts = โต๊ะเหมา: จำนวนรายคน (เฉพาะคนที่ได้ > 0) → บันทึก 1 ใบจ่ายงานต่อคน · qty = ผลรวม */
export type QuickRow<M extends QuickMo = QuickMo> = { mo: M; qty: number; rate: number; parts?: { id: string; qty: number }[] };
type CrewWo = { department_id?: string | null; created_at?: string | null; assignees?: { id: string | null; name: string }[] | null; assignee_type?: string | null; assignee_id?: string | null };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const nick = (p: CrewPerson) => p.nickname?.trim() || p.name;
/** แบ่งเท่ากัน → ค่าในช่องกรอกรายคน */
const evenParts = (total: number, ids: string[]) => { const s = splitEven(total, ids.length); return Object.fromEntries(ids.map((id, i) => [id, String(s[i] ?? 0)])); };

export function ExecQuickDispatch<M extends QuickMo>({ desk, mos, people, desks, workOrders, rateOf, saving, onClose, onSubmit, onFull }: {
  /** โต๊ะปลายทาง (null = ปิด) */
  desk: { id: string; name: string } | null;
  mos: M[];
  /** พนักงานทั้งหมด (craftsmen ของบอร์ด) */
  people: CrewPerson[];
  desks: { id: string; name: string }[];
  /** ใบจ่ายงานเดิม — หา "ชุดคนล่าสุดของโต๊ะนี้" */
  workOrders: CrewWo[];
  /** ค่าแรง/ชิ้นของใบ (สูตรเดียวกับการ์ด) */
  rateOf: (m: M) => number;
  saving: boolean;
  onClose: () => void;
  onSubmit: (rows: QuickRow<M>[], crewIds: string[]) => void;
  /** เปิดป๊อปจ่ายงานเดิม (แก้วันที่/กำหนดเสร็จ/ค่าแรง) */
  onFull: (mos: M[]) => void;
}) {
  const kind = deskKindOf(desk?.name);
  const hire = kind === "hire";
  const [qty, setQty] = useState<Record<string, string>>({});
  /** โต๊ะเหมา: จำนวนรายคนต่อใบ { moId: { personId: "จำนวน" } } */
  const [parts, setParts] = useState<Record<string, Record<string, string>>>({});
  const [crew, setCrew] = useState<string[]>([]);
  const sig = `${desk?.id ?? ""}|${mos.map((m) => m.id).join(",")}`;
  useEffect(() => {
    setQty(Object.fromEntries(mos.map((m) => [m.id, String(m.remaining)])));
    setParts({});
    setCrew([]);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  // คนให้เลือก: โต๊ะเหมา/จับกลุ่ม = ทุกคน (คนในโต๊ะขึ้นก่อน) · โต๊ะปกติไม่ต้องเลือกคน
  const pool = useMemo(() => {
    if (!desk) return [] as CrewPerson[];
    const mine = people.filter((p) => p.department_id === desk.id);
    return [...mine, ...people.filter((p) => p.department_id !== desk.id)];
  }, [people, desk]);
  const recent = useMemo(() => (desk ? lastCrewIds(workOrders, desk.id, pool) : []), [workOrders, desk, pool]);
  const picked = crew.map((id) => pool.find((p) => p.id === id)).filter((p): p is CrewPerson => !!p);

  // เลือก/เอาคนออก → โต๊ะเหมาแบ่งเท่ากันใหม่ทุกใบ (เจ้าของ: "แบ่งเท่าๆกันก่อนตอนเลือก")
  const pickCrew = (ids: string[]) => {
    setCrew(ids);
    if (hire) setParts(Object.fromEntries(mos.map((m) => [m.id, evenParts(m.remaining, ids)])));
  };
  const resplit = (m: M) => setParts((s) => ({ ...s, [m.id]: evenParts(m.remaining, crew) }));

  const rows = mos.map((m) => {
    const r = rateOf(m);
    if (hire) {
      const ps = picked.map((p) => ({ id: p.id, qty: Math.max(0, Number(parts[m.id]?.[p.id] ?? 0) || 0) }));
      const iss = ps.length ? splitIssues({ parts: ps.map((x) => x.qty), remaining: m.remaining }) : [];
      const sum = Math.round(ps.reduce((a, x) => a + x.qty, 0) * 100) / 100;
      return { mo: m, qty: sum, rate: r, parts: ps, err: iss.find((x) => x.level === "error")?.msg ?? null, warn: iss.find((x) => x.level === "warn")?.msg ?? null };
    }
    const q = Number(qty[m.id] ?? m.remaining) || 0;
    const err = dispatchRowIssues({ qty: q, remaining: m.remaining, deskName: desk?.name ?? null, crewCount: kind === "normal" ? 0 : Math.max(1, crew.length) })
      .find((x) => x.level === "error")?.msg ?? null;   // ตรวจเรื่องช่างแยกด้านล่าง (ให้ข้อความอยู่ที่ช่องเลือกคน)
    return { mo: m, qty: q, rate: r, parts: [] as { id: string; qty: number }[], err, warn: null as string | null };
  });
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalLabor = rows.reduce((a, r) => a + r.rate * r.qty, 0);
  const noRate = rows.filter((r) => r.rate <= 0).length;
  const crewErr = hire && crew.length < 1 ? "เลือกช่างอย่างน้อย 1 คน" : kind === "group" && crew.length < 1 ? "เลือกพนักงานในกลุ่มอย่างน้อย 1 คน" : null;
  const overCount = rows.filter((r) => r.err).length;
  const blocked = !rows.length || overCount > 0 || !!crewErr;
  // โต๊ะเหมา: ยอดรวมรายคน (ทุกใบ) + จำนวนใบจ่ายงานที่จะเกิด
  const perPerson = picked.map((p) => {
    let q = 0, l = 0;
    for (const r of rows) { const x = r.parts.find((y) => y.id === p.id)?.qty ?? 0; q += x; l += x * r.rate; }
    return { p, q, l };
  });
  const woCount = rows.reduce((a, r) => a + r.parts.filter((x) => x.qty > 0).length, 0);

  const submit = () => {
    if (blocked || saving) return;
    onSubmit(rows.map(({ mo, qty: q, rate, parts: ps }) => (hire ? { mo, qty: q, rate, parts: ps.filter((x) => x.qty > 0) } : { mo, qty: q, rate })), kind === "normal" ? [] : crew);
  };
  const okLabel = hire ? (picked.length === 1 ? `จ่ายให้ ${nick(picked[0])}` : picked.length ? `จ่ายให้ ${picked.length} คน` : "จ่ายให้ช่าง")
    : kind === "group" ? (picked.length ? `จ่ายให้กลุ่ม ${picked.length} คน` : "จ่ายให้กลุ่ม")
    : `จ่าย ${rows.length} ใบ`;

  return (
    <ERPModal open={!!desk} onClose={() => { if (!saving) onClose(); }} size="md" closeOnBackdrop={!saving}
      title={`จ่ายงาน → ${desk?.name ?? ""}`}
      description={hire ? "ช่างเหมา — เลือกช่างได้หลายคน ระบบแบ่งจำนวนให้เท่า ๆ กัน แล้วแก้รายคนได้" : kind === "group" ? "จับกลุ่ม — เลือกพนักงานหลายคนเป็นกลุ่ม แล้วใส่จำนวน" : "โต๊ะปกติ — คนรับ = ทั้งโต๊ะ ใส่จำนวนที่จ่าย"}
      footer={<>
        <button type="button" onClick={() => onFull(mos)} disabled={saving} className="mr-auto inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[12px] text-slate-500 hover:bg-slate-100 hover:text-slate-700">
          <Icon name="open" /> ป๊อปเต็ม (วันที่ · กำหนดเสร็จ · ค่าแรง)</button>
        {blocked && !saving && (crewErr || overCount > 0) && (
          <span className="text-[11px] text-rose-600">{crewErr ?? `มี ${overCount} ใบที่จำนวนไม่ถูก — แก้ก่อนจ่าย`}</span>
        )}
        <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={submit} disabled={blocked || saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40">
          <Icon name="truck" /> {saving ? "กำลังจ่าย…" : okLabel}</button>
      </>}>
      <div className="space-y-3">
        {kind !== "normal" && desk && (
          <div>
            <div className="mb-1 flex items-center gap-2 text-[12px]">
              <span className="font-semibold text-slate-700">{hire ? "เลือกช่าง (หลายคนได้)" : "เลือกพนักงานในกลุ่ม (หลายคน)"} <span className="text-rose-500">*</span></span>
              {hire && picked.length > 1 && <span className="text-slate-500">แบ่งให้เท่า ๆ กันแล้ว (เศษให้คนที่เลือกก่อน) — แก้รายคนได้ด้านล่าง</span>}
            </div>
            <CrewPick people={pool} desks={desks} value={crew} required recent={recent}
              requiredMsg={hire ? "ช่างเหมา — เลือกอย่างน้อย 1 คน (หลายคนได้)" : "จับกลุ่ม — เลือกพนักงานอย่างน้อย 1 คน (หลายคนได้)"}
              onChange={pickCrew} />
          </div>
        )}
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map(({ mo: m, qty: q, rate, parts: ps, err, warn }) => (
            <div key={m.id} className="px-2.5 py-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 text-slate-300">
                  {m.image_url ? <img src={m.image_url} alt="" className="h-full w-full object-contain" /> : <Icon name="image" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-[13px] font-semibold text-slate-800">{m.product_sku ?? m.mo_no}</span>
                    {!m.ready && <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10px] text-amber-700" title="เตรียม/ตัดยังไม่ครบ — จ่ายได้ แต่ควรเช็กก่อน">ยังไม่พร้อม</span>}
                  </div>
                  <div className="truncate text-[11px] text-slate-400">{m.product_name ?? m.mo_no}</div>
                  <div className="text-[11px]">{rate > 0
                    ? <span className="text-slate-500">฿{fmt(rate)}/ชิ้น{hire ? "" : <> · ค่าแรง <b className="text-slate-700">฿{fmt(rate * q)}</b></>}</span>
                    : <span className="text-amber-600">ยังไม่ตั้งค่าแรง (ใส่ทีหลังได้)</span>}</div>
                  {!hire && err && <div className="text-[11px] text-rose-600">{err}</div>}
                </div>
                {hire ? (
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] text-slate-400">เหลือให้จ่าย</div>
                    <div className="text-[13px] font-semibold tabular-nums text-slate-700">{fmt(m.remaining)} ชิ้น</div>
                  </div>
                ) : (
                  <label className="flex shrink-0 items-center gap-1 text-[12px] text-slate-500">
                    <input type="number" min={0} max={m.remaining} step="any" value={qty[m.id] ?? String(m.remaining)} aria-label={`จำนวนที่จ่าย ${m.product_sku ?? m.mo_no}`}
                      onChange={(e) => setQty((s) => ({ ...s, [m.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                      className={`h-9 w-20 rounded-lg border px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-400 ${err ? "border-rose-300" : "border-slate-200"}`} />
                    / {fmt(m.remaining)}
                  </label>
                )}
              </div>
              {hire && (picked.length ? (
                <div className="mt-1.5 space-y-1 sm:pl-[54px]">
                  {picked.map((p) => {
                    const v = parts[m.id]?.[p.id] ?? "0";
                    const n = ps.find((x) => x.id === p.id)?.qty ?? 0;
                    const g = crewGroupOf(p);
                    return (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${CREW_GROUP_DOT[g]}`} title={crewGroupLabel(g)} />
                        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700" title={p.code ? `[${p.code}] ${p.name}` : p.name}>
                          {nick(p)} <span className="text-[10px] text-slate-400">{crewGroupLabel(g)}</span>
                        </span>
                        <input type="number" min={0} step="any" value={v} aria-label={`จำนวนของ ${nick(p)} — ${m.product_sku ?? m.mo_no}`}
                          onChange={(e) => setParts((s) => ({ ...s, [m.id]: { ...(s[m.id] ?? {}), [p.id]: e.target.value } }))}
                          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                          className={`h-8 w-20 rounded-lg border px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-400 ${err ? "border-rose-300" : "border-slate-200"}`} />
                        <span className="w-24 shrink-0 text-right text-[11px] tabular-nums">
                          {n <= 0 ? <span className="text-amber-600">0 = ไม่จ่ายคนนี้</span> : rate > 0 ? <span className="text-slate-500">฿{fmt(rate * n)}</span> : <span className="text-slate-300">—</span>}
                        </span>
                      </div>
                    );
                  })}
                  <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5 text-[11px] ${err ? "bg-rose-50 text-rose-700" : warn ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
                    <Icon name={err ? "cancel" : warn ? "warning" : "done"} />
                    <span className="min-w-0 flex-1">{err ?? warn ?? `ครบพอดี ${fmt(q)} / ${fmt(m.remaining)} ชิ้น`}</span>
                    {picked.length > 1 && (
                      <button type="button" onClick={() => resplit(m)} className="inline-flex items-center gap-1 rounded-md border border-black/10 bg-white/70 px-1.5 py-0.5 hover:bg-white">
                        <Icon name="refresh" /> แบ่งเท่ากันใหม่</button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-slate-400 sm:pl-[54px]">เลือกช่างด้านบนก่อน — ระบบจะแบ่ง {fmt(m.remaining)} ชิ้นให้เท่า ๆ กัน</div>
              ))}
            </div>
          ))}
        </div>
        <div className={`rounded-xl px-3 py-2 text-[13px] ${kind === "group" ? "bg-violet-50 text-violet-800" : "bg-slate-50 text-slate-700"}`}>
          {kind === "group" ? (
            picked.length ? <>
              <div><b>กลุ่ม {picked.length} คน</b> ({picked.map(nick).join(" + ")}) · ค่าแรงรวมกลุ่ม <b className="tabular-nums">฿{fmt(totalLabor)}</b></div>
              <div className="text-[12px]">ตกคนละ ≈ ฿{fmt(totalLabor / picked.length)} (หารเท่า ประมาณการ) · รวม {fmt(totalQty)} ชิ้น</div>
            </> : <span>เลือกพนักงานก่อน แล้วจะเห็นค่าแรงรวมของกลุ่ม · ค่าแรงรวม ฿{fmt(totalLabor)}</span>
          ) : hire ? (
            picked.length ? <>
              <div>รวม {rows.length} ใบ · {picked.length} คน · จ่าย <b className="tabular-nums">{fmt(totalQty)}</b> ชิ้น · ค่าแรง <b className="tabular-nums">฿{fmt(totalLabor)}</b></div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {perPerson.map(({ p, q: pq, l }) => (
                  <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                    <span className={`h-1.5 w-1.5 rounded-full ${CREW_GROUP_DOT[crewGroupOf(p)]}`} />
                    {nick(p)} · {fmt(pq)} ชิ้น{l > 0 ? ` · ฿${fmt(l)}` : ""}
                  </span>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">บันทึกเป็น {woCount} ใบจ่ายงาน (1 ใบต่อคนต่อสินค้า) — ชื่อแต่ละคนขึ้นการ์ดบนบอร์ดแยกกัน รับคืน/ค่าแรงแยกรายคน</div>
            </> : <span>รวม {rows.length} ใบ · เลือกช่างก่อน</span>
          ) : (
            <span>รวม {rows.length} ใบ · {fmt(totalQty)} ชิ้น · ค่าแรง <b className="tabular-nums">฿{fmt(totalLabor)}</b> → ทั้งโต๊ะ</span>
          )}
          {noRate > 0 && <div className="text-[11px] text-amber-600">{noRate} ใบยังไม่ตั้งค่าแรง — ยอดค่าแรงยังไม่รวมใบนั้น</div>}
        </div>
      </div>
    </ERPModal>
  );
}
