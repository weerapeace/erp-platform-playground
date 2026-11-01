"use client";

/**
 * 🔀 ผูกใบขายผิด · ย้าย (เจ้าของอนุมัติ 2026-11-01 จาก widget) — หน้าต่างในแท็บ "ผูกแล้ว" ของ "อัปเดตงานจากใบขาย"
 *   เลือกใบปลายทาง (MoPick: วันที่เปิดใบ + ป้ายผูกแล้ว) · เลือกว่าใบเดิมจริง ๆ เป็นแบบไหน (ยังไม่ได้ทำ / ทำแล้วยังไม่ขาย / ไม่แตะ)
 *   · ตาราง "ก่อน → หลัง" · บันทึกทีละขั้นตาม sales-move-plan (runMove) แล้วบอกว่าสำเร็จถึงไหน
 *   ข้อมูล = GET /api/mo/sales-move (ใบเดิม) + /api/mo/catch-up?edit=1 (ของที่บันทึกไว้ — ไว้ย้อน)
 * MoPick = ตัวเลือกใบสั่งผลิตของหน้านี้ (ใช้ทั้งแท็บยังไม่ผูก และหน้าต่างย้าย)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CatchUpSnapshot } from "@/app/api/mo/catch-up/route";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { MO_STAGE_LABEL, type LinkedLine, type MoCand, type MoStage } from "@/lib/mo-sales-unlinked";
import { MOVE_REVERT, MOVE_REVERTS, defaultRevert, defaultShelf, revertAllForm, revertBlock, runMove, shipLeft, type MoveInfo, type MoveRevert, type MoveStep } from "./sales-move-plan";
import { ceBuild } from "./catch-up-edit-plan";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
export const thDate = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
};
const STAGE_CLS: Record<MoStage, string> = {
  wait: "bg-amber-50 text-amber-700 border-amber-200", work: "bg-blue-50 text-blue-700 border-blue-200",
  recv: "bg-teal-50 text-teal-700 border-teal-200", ship: "bg-violet-50 text-violet-700 border-violet-200", closed: "bg-slate-50 text-slate-500 border-slate-200",
};
export const StageTag = ({ stage }: { stage: MoStage }) => <span className={`inline-block rounded border px-1.5 text-[11px] ${STAGE_CLS[stage]}`}>{MO_STAGE_LABEL[stage]}</span>;
const linkedText = (l: { so_number: string; qty: number }[]) => l.map((x) => `${x.so_number} (${fmt(x.qty)})`).join(", ");

/** ตัวเลือกใบสั่งผลิต: เรียงใบเก่าก่อน · ใบว่างก่อน ใบที่ผูกใบขายอื่นอยู่แยกกลุ่มล่าง (เลือกได้ — ใบขายเดิมจะกลับเป็น "ยังไม่ผูก") */
export function MoPick({ cands, value, onChange, suggested = [], disabled }: { cands: MoCand[]; value: string | null; onChange: (mo: string) => void; suggested?: string[]; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const cur = cands.find((c) => c.mo_no === value) ?? null;
  const free = cands.filter((c) => !c.linked), taken = cands.filter((c) => c.linked);
  const row = (c: MoCand) => {
    const on = c.mo_no === value;
    return (
      <button key={c.mo_no} type="button" onClick={() => { onChange(c.mo_no); setOpen(false); }}
        className={`block w-full px-3 py-1.5 text-left ${on ? "bg-blue-50" : "hover:bg-slate-50"} ${c.linked ? "text-slate-500" : ""}`}>
        <div className={on ? "text-blue-700" : ""}>{on && <Icon name="done" />} {c.linked && <Icon name="link" />} <b className="font-mono font-semibold">{c.mo_no}</b> · ผลิต {fmt(c.qty)}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
          <StageTag stage={c.stage} /> · เปิด {thDate(c.opened)}
          {suggested.includes(c.mo_no) && <span className="rounded border border-blue-200 bg-blue-50 px-1.5 text-blue-700">ระบบเสนอ</span>}
          {c.linked && <span className="rounded border border-slate-300 bg-white px-1.5 text-slate-600">ผูกแล้ว · {linkedText(c.linked)}</span>}
        </div>
      </button>
    );
  };
  return (
    <div ref={ref} className="inline-block max-w-full">
      <button type="button" disabled={disabled || !cands.length} onClick={() => setOpen((o) => !o)}
        className="flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-[12px] hover:bg-slate-50 disabled:opacity-50" aria-label="เลือกใบงาน">
        {cur ? <span className="truncate"><b className="font-mono">{cur.mo_no}</b> · ผลิต {fmt(cur.qty)} · เปิด {thDate(cur.opened)}{cur.linked ? " · ผูกแล้ว" : ""}</span>
          : <span className="text-slate-400">{cands.length ? "เลือกใบงาน…" : "ไม่มีใบงานให้เลือก"}</span>}
        <Icon value="i:chevron-down" />
      </button>
      <FloatingDropdown anchorRef={ref} open={open} onClose={() => setOpen(false)} minWidth={320} maxWidth={440}>
        <div className="overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-[12px] shadow-lg" style={{ maxHeight: "var(--fd-max-h)" }}>
          {free.length > 0 && <div className="px-3 pt-1 text-[11px] text-slate-400">เลือกได้ (ใบเก่าก่อน)</div>}
          {free.map(row)}
          {taken.length > 0 && <div className="mt-1 border-t border-slate-200 px-3 pt-1.5 text-[11px] text-slate-400">ผูกใบขายอื่นแล้ว — เลือกได้ ใบขายเดิมจะกลับเป็น “ยังไม่ผูก”</div>}
          {taken.map(row)}
        </div>
      </FloatingDropdown>
    </div>
  );
}

/** หน้าต่างย้าย — row = คู่ที่ผูกผิด · onDone(ใบปลายทางที่ต้องไปตั้งขั้นส่งออกต่อ หรือ null) */
export function SalesMove({ row, onClose, onDone }: { row: LinkedLine; onClose: () => void; onDone: (openBatch: string | null) => void }) {
  const toast = useToast();
  const [info, setInfo] = useState<MoveInfo | null>(null);
  const [snap, setSnap] = useState<CatchUpSnapshot | null>(null);
  const [err, setErr] = useState("");
  const [to, setTo] = useState<string | null>(row.cands.find((c) => !c.linked)?.mo_no ?? null);
  const [revert, setRevert] = useState<MoveRevert | null>(null);
  const [shelf, setShelf] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<MoveStep[] | null>(null);

  const loadSnap = async () => {
    const r = await apiFetch(`/api/mo/catch-up?mo_no=${encodeURIComponent(row.mo_no)}&edit=1`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.data) throw new Error(j?.error || "โหลดใบงานไม่สำเร็จ");
    return j.data as CatchUpSnapshot;
  };
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const r = await apiFetch(`/api/mo/sales-move?mo_no=${encodeURIComponent(row.mo_no)}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.data) throw new Error(j?.error || "โหลดไม่สำเร็จ");
        const s = await loadSnap();
        if (off) return;
        const inf = j.data as MoveInfo;
        setInfo(inf); setSnap(s); setShelf(defaultShelf(inf));
        setRevert(defaultRevert({ info: inf, snap: s, lineId: row.id, qty: row.link_qty }));
      } catch (e) { if (!off) setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.mo_no, row.id]);

  const cand = row.cands.find((c) => c.mo_no === to) ?? null;
  const qty = cand ? Math.min(row.link_qty, cand.qty) : 0;
  const ctx = info ? { info, snap, lineId: row.id, qty } : null;
  const block = (r: MoveRevert) => (ctx ? revertBlock(r, ctx) : "กำลังโหลด…");
  const left = info ? shipLeft(info.ships) : 0;
  // ตัวอย่างสิ่งที่ตัวแก้ไขใบงานจะย้อน (ของที่ส่งออกจะกลับขึ้นชั้นก่อน แล้วย้อนออกจากชั้นอีกที)
  const waitOps = useMemo(() => (snap && revert === "wait" ? ceBuild(snap, revertAllForm(snap), { departments: [], people: [] }).ops.map((o) => o.label) : []), [snap, revert]);
  const toBatch = !!cand && !cand.linked && cand.stage !== "ship" && cand.stage !== "closed";

  const save = async () => {
    if (!info || !cand || !revert || block(revert)) return;
    const lines = [
      `ถอด ${row.so_number} ออกจาก ${row.mo_no} แล้วผูกกับ ${cand.mo_no} (${fmt(qty)} ชิ้น)`,
      ...(cand.linked ? [`${cand.mo_no} ผูก ${linkedText(cand.linked)} อยู่ — ใบขายนั้นจะกลับเป็น “ยังไม่ผูก”`] : []),
      `${row.mo_no}: ${MOVE_REVERT[revert].label}`,
    ];
    if (!(await askConfirm({ title: "ย้ายใบขาย?", confirmText: "ย้าย", variant: revert === "wait" ? "danger" : undefined,
      message: <div className="space-y-1 text-sm">{lines.map((x, i) => <div key={i}>{i + 1}. {x}</div>)}</div> }))) return;
    const api = async (url: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") => {
      const res = await apiFetch(url, method === "DELETE" ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) throw new Error(res.status === 401 || res.status === 403 ? "คุณไม่มีสิทธิ์ทำส่วนนี้" : (j?.error || "บันทึกไม่สำเร็จ"));
      return j as Record<string, unknown>;
    };
    setRunning(true);
    const res = await runMove({ info, lineId: row.id, soNumber: row.so_number, qty, to: { mo_no: cand.mo_no, relink: !!cand.linked }, revert, shelfId: revert === "none" ? null : shelf, api, loadSnap });
    setRunning(false); setSteps(res);
    if (res.every((x) => x.ok)) { toast.success(`ย้าย ${row.so_number} ไป ${cand.mo_no} แล้ว`); onDone(toBatch ? cand.mo_no : null); }
    else toast.error("ทำไม่ครบ — ดูว่าสำเร็จถึงไหนในหน้าต่าง");
  };

  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm disabled:opacity-50";
  const th = "border-b border-slate-200 px-2 py-1.5 text-left font-normal text-slate-500";
  const td = "border-b border-slate-100 px-2 py-1.5 align-top";
  return (
    <ERPModal open onClose={() => { if (!running) onClose(); }} size="lg" storageKey="wb-sales-move"
      title={`ย้ายใบขาย ${row.so_number} (${fmt(row.link_qty)} ชิ้น)`}
      description={`${row.sku}${row.sku_name ? ` · ${row.sku_name}` : ""} — ผูกกับ ${row.mo_no} อยู่ ย้ายไปใบที่ถูก แล้วเลือกว่าใบเดิมจะกลับเป็นแบบไหน`}
      footer={steps ? (
        <div className="flex justify-end"><button type="button" onClick={() => onDone(steps.every((x) => x.ok) && toBatch && cand ? cand.mo_no : null)} className={`${btn} border-slate-200 bg-white`}>ปิด</button></div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={running} onClick={onClose} className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>ยกเลิก</button>
          <button type="button" disabled={running || !cand || !revert || !!block(revert)} onClick={() => void save()}
            className={`${btn} border-blue-600 bg-blue-600 font-medium text-white hover:bg-blue-700`}>
            <Icon name="shuffle" /> {running ? "กำลังย้าย…" : toBatch ? "ย้าย + ไปตั้งขั้นส่งออก" : "ย้าย"}
          </button>
        </div>
      )}>
      {err ? <div className="py-8 text-center text-red-500">{err}</div>
        : !info ? <div className="py-8 text-center text-slate-400">กำลังโหลดใบงาน…</div>
        : steps ? (
          <div className="space-y-1 text-sm">
            <div className="mb-2 font-medium text-slate-700">{steps.every((x) => x.ok) ? "ย้ายเสร็จแล้ว" : "ทำไม่ครบ — สำเร็จถึงตรงนี้ (ที่เหลือแก้ต่อที่ปุ่ม “แก้ไข” บนบอร์ด)"}</div>
            {steps.map((x, i) => <div key={i} className={x.ok ? "text-slate-700" : "text-red-600"}><Icon name={x.ok ? "done" : "cancel"} /> {x.msg}</div>)}
            {steps.every((x) => x.ok) && toBatch && <div className="pt-2 text-slate-500">กด “ปิด” แล้วไปตั้งขั้นส่งออกของ {cand?.mo_no} ในหน้าอัปเดตเป็นชุด</div>}
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
              <span className="text-slate-500">จากใบเดิม</span>
              <span className="flex flex-wrap items-center gap-1.5"><b className="font-mono">{row.mo_no}</b> · ผลิต {fmt(row.mo_qty)} · เปิด {thDate(row.opened)} <StageTag stage={row.stage} />
                {row.others.length > 0 && <span className="text-[12px] text-slate-500">· ยังผูก {linkedText(row.others)} ด้วย</span>}</span>
              <span className="text-slate-500">ย้ายไปใบ</span>
              <div className="min-w-0">
                <MoPick cands={row.cands} value={to} onChange={setTo} disabled={running} />
                {!row.cands.length && <div className="mt-1 text-[12px] text-amber-700">ไม่มีใบงานอื่นของ {row.sku} ที่เปิดก่อนวันขาย ({thDate(row.date)}) — ถอดผูกอย่างเดียวได้ที่หน้าอัปเดตเป็นชุด</div>}
                {cand?.linked && <div className="mt-1 text-[12px] text-amber-700">{cand.mo_no} ผูก {linkedText(cand.linked)} อยู่ — ใบขายนั้นจะกลับเป็น “ยังไม่ผูก” (สถานะใบ {cand.mo_no} ไม่เปลี่ยน)</div>}
                {cand && cand.qty < row.link_qty && <div className="mt-1 text-[12px] text-amber-700">{cand.mo_no} ผลิตแค่ {fmt(cand.qty)} — ผูกได้ {fmt(cand.qty)} อีก {fmt(row.link_qty - cand.qty)} ชิ้นของใบขายจะยังไม่ผูก</div>}
              </div>
            </div>

            <div>
              <div className="mb-1.5 font-medium text-slate-700">ใบเดิม ({row.mo_no}) ตอนนี้ของจริงอยู่ไหน</div>
              <div className="space-y-1.5">
                {MOVE_REVERTS.map((r) => {
                  const why = block(r), on = revert === r;
                  return (
                    <label key={r} className={`block rounded-lg border px-3 py-2 ${why ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : on ? "cursor-pointer border-blue-400 bg-blue-50" : "cursor-pointer border-slate-200 hover:bg-slate-50"}`}>
                      <div className="flex items-start gap-2">
                        <input type="radio" name="move-revert" className="mt-1" disabled={!!why || running} checked={on} onChange={() => setRevert(r)} />
                        <div className="min-w-0">
                          <div className={on && !why ? "text-blue-800" : ""}>{MOVE_REVERT[r].label}</div>
                          <div className="text-[12px] text-slate-500">{MOVE_REVERT[r].hint}</div>
                          {why && <div className="text-[12px] text-amber-700">{why}</div>}
                          {on && !why && r === "qc" && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                              <span className="text-slate-600">วางของ {fmt(Math.min(qty, left))} ชิ้นที่ชั้น</span>
                              <select value={shelf ?? ""} onChange={(e) => setShelf(e.target.value)} className="h-7 rounded border border-slate-200 bg-white px-1.5">
                                {info.shelves.filter((s) => s.kind !== "defect").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-1.5 font-medium text-slate-700">จะเปลี่ยนอะไรบ้าง</div>
              <table className="w-full border-collapse text-[12px]">
                <thead><tr><th className={th}>ใบ</th><th className={th}>ก่อน</th><th className={th}>หลัง</th></tr></thead>
                <tbody>
                  <tr>
                    <td className={`${td} font-mono`}>{row.mo_no}</td>
                    <td className={td}>{MO_STAGE_LABEL[row.stage]}{left > 0 ? ` (ส่งออก ${fmt(left)})` : ""} · ผูก {row.so_number}</td>
                    <td className={`${td} text-amber-700`}>{revert ? MOVE_REVERT[revert].after : "—"} · {row.others.length ? `ยังผูก ${linkedText(row.others)}` : "ไม่ผูก"}</td>
                  </tr>
                  {cand && (
                    <tr>
                      <td className={`${td} font-mono`}>{cand.mo_no}</td>
                      <td className={td}>{MO_STAGE_LABEL[cand.stage]} · {cand.linked ? `ผูก ${linkedText(cand.linked)}` : "ไม่ผูก"}</td>
                      <td className={`${td} text-emerald-700`}>ผูก {row.so_number} ({fmt(qty)}){toBatch ? " → ไปตั้งขั้นส่งออกต่อ" : ` · ${MO_STAGE_LABEL[cand.stage]} เหมือนเดิม`}</td>
                    </tr>
                  )}
                  {cand?.linked?.map((x) => (
                    <tr key={x.so_number}><td className={td}>{x.so_number}</td><td className={td}>ผูก {cand.mo_no}</td><td className={`${td} text-amber-700`}>ยังไม่ผูก (ไปผูกใหม่ที่แท็บ “ยังไม่ผูก”)</td></tr>
                  ))}
                </tbody>
              </table>
              {revert === "wait" && !block("wait") && (
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                  <div className="mb-0.5 text-slate-500">ระบบจะทำกับ {row.mo_no} ตามลำดับ:</div>
                  {left > 0 && <div>• เอาของที่ส่งออก {fmt(left)} ชิ้นกลับขึ้นชั้น QC แล้วย้อนออกจากชั้น</div>}
                  {waitOps.map((x, i) => <div key={i}>• {x}</div>)}
                </div>
              )}
              <div className="mt-2 text-[12px] text-slate-500"><Icon name="permission" /> รอบส่งคืนที่ลงค่าแรงช่างแล้วจะไม่ให้ย้อนข้อแรก · ทุกขั้นบันทึกประวัติว่าใครย้าย</div>
            </div>
          </div>
        )}
    </ERPModal>
  );
}
