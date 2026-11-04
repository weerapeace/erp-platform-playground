"use client";

/**
 * ป๊อปจ่ายด่วน — บอร์ดจ่ายงาน โหมดผู้บริหาร (เจ้าของขอ 2026-11-04: "ตรงช่างเหมาและจับกลุ่มจะแตกต่างนิดหน่อย …")
 *   ลากการ์ดลงโต๊ะ / กด "จ่ายให้โต๊ะนี้" → ป๊อปสั้นตามชนิดโต๊ะ (deskKindOf — lib/work-entry-rules)
 *     โต๊ะปกติ  = ใส่จำนวนทีละใบ · คนรับ = ทั้งโต๊ะ
 *     ช่างเหมา  = เลือกช่าง 1 คน (บังคับ) + จำนวน
 *     จับกลุ่ม   = เลือกพนักงานหลายคน (บังคับ) + จำนวน + ค่าแรงรวมกลุ่ม / ตกคนละ (หารเท่า ประมาณการ)
 *   ค่าแรง = ค่าแรง/ชิ้นของใบ (ราคากลางในสูตร) × จำนวน · ไม่มี = เว้นว่าง ใส่ทีหลังได้
 *   วันที่จ่าย = วันนี้ · กำหนดเสร็จ = ของใบสั่งผลิต — อยากแก้ → ปุ่ม "ป๊อปเต็ม" (ป๊อปจ่ายงานเดิมของบอร์ด ทีละใบ)
 * ของกลางที่ใช้: ERPModal · CrewPick (เลือกคน) · dispatchRowIssues (กฎจำนวน/งานเหมาต้องมีช่าง)
 * บันทึกจริงอยู่ที่หน้าบอร์ด (onSubmit → POST /api/mo/work-orders ทีละใบ เหมือนป๊อปเดิม)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { CrewPick, lastCrewIds, type CrewPerson } from "./crew-pick";
import { deskKindOf, dispatchRowIssues } from "@/lib/work-entry-rules";

export type QuickMo = { id: string; mo_no: string; product_sku: string | null; product_name: string | null; remaining: number; image_url: string | null; ready: boolean };
export type QuickRow<M extends QuickMo = QuickMo> = { mo: M; qty: number; rate: number };
type CrewWo = { department_id?: string | null; created_at?: string | null; assignees?: { id: string | null; name: string }[] | null; assignee_type?: string | null; assignee_id?: string | null };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const nick = (p: CrewPerson) => p.nickname?.trim() || p.name;

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
  const [qty, setQty] = useState<Record<string, string>>({});
  const [crew, setCrew] = useState<string[]>([]);
  const sig = `${desk?.id ?? ""}|${mos.map((m) => m.id).join(",")}`;
  useEffect(() => {
    setQty(Object.fromEntries(mos.map((m) => [m.id, String(m.remaining)])));
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

  const rows = mos.map((m) => {
    const q = Number(qty[m.id] ?? m.remaining) || 0, r = rateOf(m);
    const err = dispatchRowIssues({ qty: q, remaining: m.remaining, deskName: desk?.name ?? null, crewCount: kind === "normal" ? 0 : Math.max(1, crew.length) })
      .find((x) => x.level === "error")?.msg ?? null;   // ตรวจเรื่องช่างแยกด้านล่าง (ให้ข้อความอยู่ที่ช่องเลือกคน)
    return { mo: m, qty: q, rate: r, err };
  });
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalLabor = rows.reduce((a, r) => a + r.rate * r.qty, 0);
  const noRate = rows.filter((r) => r.rate <= 0).length;
  const crewErr = kind === "hire" && crew.length !== 1 ? "เลือกช่าง 1 คน" : kind === "group" && crew.length < 1 ? "เลือกพนักงานในกลุ่มอย่างน้อย 1 คน" : null;
  const blocked = !rows.length || rows.some((r) => r.err) || !!crewErr;

  const submit = () => {
    if (blocked || saving) return;
    onSubmit(rows.map(({ mo, qty: q, rate }) => ({ mo, qty: q, rate })), kind === "normal" ? [] : crew);
  };
  const okLabel = kind === "hire" ? (picked[0] ? `จ่ายให้ ${nick(picked[0])}` : "จ่ายให้ช่าง")
    : kind === "group" ? (picked.length ? `จ่ายให้กลุ่ม ${picked.length} คน` : "จ่ายให้กลุ่ม")
    : `จ่าย ${rows.length} ใบ`;

  return (
    <ERPModal open={!!desk} onClose={() => { if (!saving) onClose(); }} size="md" closeOnBackdrop={!saving}
      title={`จ่ายงาน → ${desk?.name ?? ""}`}
      description={kind === "hire" ? "ช่างเหมา — เลือกช่าง 1 คน แล้วใส่จำนวน" : kind === "group" ? "จับกลุ่ม — เลือกพนักงานหลายคนเป็นกลุ่ม แล้วใส่จำนวน" : "โต๊ะปกติ — คนรับ = ทั้งโต๊ะ ใส่จำนวนที่จ่าย"}
      footer={<>
        <button type="button" onClick={() => onFull(mos)} disabled={saving} className="mr-auto inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[12px] text-slate-500 hover:bg-slate-100 hover:text-slate-700">
          <Icon name="open" /> ป๊อปเต็ม (วันที่ · กำหนดเสร็จ · ค่าแรง)</button>
        <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={submit} disabled={blocked || saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40">
          <Icon name="truck" /> {saving ? "กำลังจ่าย…" : okLabel}</button>
      </>}>
      <div className="space-y-3">
        {kind !== "normal" && desk && (
          <div>
            <div className="mb-1 flex items-center gap-2 text-[12px]">
              <span className="font-semibold text-slate-700">{kind === "hire" ? "เลือกช่าง (1 คน)" : "เลือกพนักงานในกลุ่ม (หลายคน)"} <span className="text-rose-500">*</span></span>
              {kind === "hire" && crew.length === 1 && <span className="text-emerald-600">✓ {nick(picked[0] ?? { id: "", name: "" })}</span>}
            </div>
            <CrewPick people={pool} desks={desks} value={crew} required recent={kind === "hire" ? recent.slice(0, 1) : recent}
              requiredMsg={kind === "hire" ? "ช่างเหมา — เลือกช่าง 1 คน" : "จับกลุ่ม — เลือกพนักงานอย่างน้อย 1 คน (หลายคนได้)"}
              onChange={(ids) => setCrew(kind === "hire" ? ids.slice(-1) : ids)} />
          </div>
        )}
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map(({ mo: m, qty: q, rate, err }) => (
            <div key={m.id} className="flex items-center gap-2.5 px-2.5 py-2">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 text-slate-300">
                {m.image_url ? <img src={m.image_url} alt="" className="h-full w-full object-contain" /> : <Icon name="image" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[13px] font-semibold text-slate-800">{m.product_sku ?? m.mo_no}</span>
                  {!m.ready && <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10px] text-amber-700" title="เตรียม/ตัดยังไม่ครบ — จ่ายได้ แต่ควรเช็กก่อน">ยังไม่พร้อม</span>}
                </div>
                <div className="truncate text-[11px] text-slate-400">{m.product_name ?? m.mo_no}</div>
                <div className="text-[11px]">{rate > 0 ? <span className="text-slate-500">฿{fmt(rate)}/ชิ้น · ค่าแรง <b className="text-slate-700">฿{fmt(rate * q)}</b></span> : <span className="text-amber-600">ยังไม่ตั้งค่าแรง (ใส่ทีหลังได้)</span>}</div>
                {err && <div className="text-[11px] text-rose-600">{err}</div>}
              </div>
              <label className="flex shrink-0 items-center gap-1 text-[12px] text-slate-500">
                <input type="number" min={0} max={m.remaining} step="any" value={qty[m.id] ?? String(m.remaining)} aria-label={`จำนวนที่จ่าย ${m.product_sku ?? m.mo_no}`}
                  onChange={(e) => setQty((s) => ({ ...s, [m.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                  className={`h-9 w-20 rounded-lg border px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-400 ${err ? "border-rose-300" : "border-slate-200"}`} />
                / {fmt(m.remaining)}
              </label>
            </div>
          ))}
        </div>
        <div className={`rounded-xl px-3 py-2 text-[13px] ${kind === "group" ? "bg-violet-50 text-violet-800" : "bg-slate-50 text-slate-700"}`}>
          {kind === "group" ? (
            picked.length ? <>
              <div><b>กลุ่ม {picked.length} คน</b> ({picked.map(nick).join(" + ")}) · ค่าแรงรวมกลุ่ม <b className="tabular-nums">฿{fmt(totalLabor)}</b></div>
              <div className="text-[12px]">ตกคนละ ≈ ฿{fmt(totalLabor / picked.length)} (หารเท่า ประมาณการ) · รวม {fmt(totalQty)} ชิ้น</div>
            </> : <span>เลือกพนักงานก่อน แล้วจะเห็นค่าแรงรวมของกลุ่ม · ค่าแรงรวม ฿{fmt(totalLabor)}</span>
          ) : (
            <span>รวม {rows.length} ใบ · {fmt(totalQty)} ชิ้น · ค่าแรง <b className="tabular-nums">฿{fmt(totalLabor)}</b>{kind === "hire" && picked[0] ? ` → ${nick(picked[0])}` : kind === "normal" ? " → ทั้งโต๊ะ" : ""}</span>
          )}
          {noRate > 0 && <div className="text-[11px] text-amber-600">{noRate} ใบยังไม่ตั้งค่าแรง — ยอดค่าแรงยังไม่รวมใบนั้น</div>}
        </div>
      </div>
    </ERPModal>
  );
}
