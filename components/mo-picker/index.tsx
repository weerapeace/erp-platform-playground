"use client";

/**
 * ของกลาง — ตัวเลือกใบงาน (ใบสั่งผลิต) หลายใบ: MoMultiPickerModal
 *   ป๊อปมีรูป · ค้นรหัสสินค้า / เลขใบ / ชื่อ / ที่อยู่ (สแกนเลขใบเข้าช่องค้นได้) · กรองตามขั้น (รอจ่าย / อยู่ที่ช่าง)
 *   จัดกลุ่มตามสินค้าแม่ / ที่อยู่ + ติ๊กทั้งกลุ่ม · "เคยเลือกล่าสุด" · ใบที่อยู่ในตารางแล้ว = ติ๊กค้าง (exclude)
 * ข้อมูล: GET /api/pickers/mos (scope=not_in_qc ค่าตั้งต้น · open = รวมที่เข้า QC ครบแล้ว)
 * ใช้: <MoMultiPickerModal open onClose onConfirm={(rows) => …} exclude={['MO-…']} />
 * ใช้แล้วที่: จ่ายงานเหมา (app/master/work-board/piecework-dispatch.tsx) · ใบสั่งขาย "ดึงจากใบสั่งผลิต" + "ผูกใบสั่งผลิต" ต่อรายการ (single)
 * โหมดใบเดียว: single + initialQuery (รหัสสินค้า) + confirmLabel · ใบที่ผูกใบสั่งขายอื่นแล้วมีป้าย "ผูก SO… แล้ว"
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { apiFetch } from "@/lib/api";
import { useRecentPicks, pushRecentMany, RECENT_KEYS } from "@/lib/recent-picks";
import type { MoPickRow, MoPickStage } from "@/app/api/pickers/mos/route";

export type { MoPickRow } from "@/app/api/pickers/mos/route";

const STAGES: { k: "" | MoPickStage; label: string }[] = [
  { k: "", label: "ทั้งหมด" }, { k: "waiting", label: "รอจ่าย" }, { k: "at_craftsman", label: "อยู่ที่ช่าง" }, { k: "in_qc", label: "เข้า QC แล้ว" },
];
type GroupBy = "" | "parent" | "where";
const SHOW_MAX = 300;
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const dueTh = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "");
const chip = (on: boolean) => `inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] ${on ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

export function MoMultiPickerModal({ open, onClose, onConfirm, exclude = [], scope = "not_in_qc", title = "เลือกใบงาน", single = false, initialQuery = "", confirmLabel, description }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (rows: MoPickRow[]) => void;
  /** เลขใบที่อยู่ในตารางแล้ว (ติ๊กค้าง เลือกซ้ำไม่ได้) */
  exclude?: string[];
  scope?: "not_in_qc" | "open";
  title?: string;
  /** เลือกได้ใบเดียว (เช่น ผูกใบสั่งผลิตให้รายการในใบสั่งขาย) — ติ๊กใบใหม่ = แทนใบเดิม */
  single?: boolean;
  /** ค้นตั้งต้นตอนเปิด (เช่น รหัสสินค้าของรายการ) */
  initialQuery?: string;
  /** ข้อความปุ่มยืนยัน (ไม่ส่ง = "เพิ่ม N ใบ") */
  confirmLabel?: string;
  description?: string;
}) {
  const [rows, setRows] = useState<MoPickRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<"" | MoPickStage>("");
  const [groupBy, setGroupBy] = useState<GroupBy>("parent");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { recent } = useRecentPicks<{ id: string; sku: string | null }>(RECENT_KEYS.mos, open);
  const ex = useMemo(() => new Set(exclude), [exclude]);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set()); setQ(initialQuery);
    if (rows) return;
    apiFetch(`/api/pickers/mos?scope=${scope}`).then((r) => r.json()).then((j) => { if (j.error) setErr(j.error); setRows((j.data ?? []) as MoPickRow[]); })
      .catch(() => { setErr("โหลดรายการใบงานไม่สำเร็จ"); setRows([]); });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": 0 };
    for (const r of rows ?? []) { c[""]++; c[r.stage] = (c[r.stage] ?? 0) + 1; }
    return c;
  }, [rows]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (!stage || r.stage === stage)
      && (!s || `${r.mo_no} ${r.sku ?? ""} ${r.name ?? ""} ${r.parent_code ?? ""} ${r.parent_name ?? ""} ${r.where}`.toLowerCase().includes(s)));
  }, [rows, q, stage]);
  const groups = useMemo(() => {
    const list = shown.slice(0, SHOW_MAX);
    if (!groupBy) return [["", list]] as [string, MoPickRow[]][];
    const m = new Map<string, MoPickRow[]>();
    for (const r of list) {
      const k = groupBy === "parent" ? (r.parent_code ? `${r.parent_code}${r.parent_name ? ` · ${r.parent_name}` : ""}` : "ไม่มีสินค้าแม่") : r.where;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [shown, groupBy]);

  const toggle = (ids: string[], on: boolean) => setPicked((p) => {
    if (single) { const id = ids.find((x) => !ex.has(x)); return on && id ? new Set([id]) : new Set(); }
    const n = new Set(p); for (const id of ids) { if (ex.has(id)) continue; if (on) n.add(id); else n.delete(id); } return n;
  });
  const recentRows = useMemo(() => recent.map((x) => (rows ?? []).find((r) => r.mo_no === x.id)).filter((r): r is MoPickRow => !!r), [recent, rows]);
  const confirm = () => {
    const chosen = (rows ?? []).filter((r) => picked.has(r.mo_no));
    if (!chosen.length) return;
    pushRecentMany(RECENT_KEYS.mos, chosen.map((r) => ({ id: r.mo_no, sku: r.sku })));
    onConfirm(chosen); onClose();
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title={title} storageKey="mo-multi-picker"
      description={description ?? (single ? "เลือก 1 ใบ" : scope === "not_in_qc" ? "เฉพาะใบที่ยังไม่ส่งเข้า QC ครบ — ติ๊กได้หลายใบ แล้วกดเพิ่ม" : "ใบที่ยังไม่ปิด — ติ๊กได้หลายใบ แล้วกดเพิ่ม")}
      footer={
        <>
          <span className="mr-auto text-sm text-slate-600">เลือก <b className="text-violet-700">{picked.size}</b> ใบ</span>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={confirm} disabled={!picked.size} className="h-9 rounded-lg bg-violet-600 px-5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
            {confirmLabel ?? <>เพิ่ม {picked.size ? `${picked.size} ` : ""}ใบ</>}
          </button>
        </>
      }>
      <div className="space-y-2.5">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัสสินค้า / เลขใบ / ชื่อ / โต๊ะ-ช่าง (สแกนเลขใบได้)"
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
        <div className="flex flex-wrap items-center gap-1.5">
          {STAGES.filter((s) => s.k === "" || (counts[s.k] ?? 0) > 0).map((s) => (
            <button key={s.k || "all"} type="button" onClick={() => setStage(s.k)} className={chip(stage === s.k)}>{s.label} {fmt(counts[s.k] ?? 0)}</button>
          ))}
          <div className="flex-1" />
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px]" title="จัดกลุ่มตาม">
            <option value="parent">กลุ่ม: สินค้าแม่</option><option value="where">กลุ่ม: อยู่ที่ (โต๊ะ/ช่าง)</option><option value="">ไม่จัดกลุ่ม</option>
          </select>
        </div>
        {recentRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-slate-400">เคยเลือกล่าสุด:</span>
            {recentRows.map((r) => (
              <button key={r.mo_no} type="button" disabled={ex.has(r.mo_no)} onClick={() => toggle([r.mo_no], !picked.has(r.mo_no))}
                className={`${chip(picked.has(r.mo_no))} disabled:opacity-40`}>{r.sku ?? r.mo_no}</button>
            ))}
          </div>
        )}
        <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-200">
          {err && !rows?.length ? <div className="px-4 py-10 text-center text-sm text-rose-500">{err}</div>
            : rows === null ? <div className="px-4 py-10 text-center text-sm text-slate-400">กำลังโหลดใบงาน…</div>
            : !shown.length ? <div className="px-4 py-10 text-center text-sm text-slate-400">ไม่พบใบงาน{q ? ` “${q}”` : ""} — ลองค้นด้วยรหัสสินค้า หรือเลขใบ</div>
            : groups.map(([label, items]) => {
              const free = items.filter((r) => !ex.has(r.mo_no));
              const all = free.length > 0 && free.every((r) => picked.has(r.mo_no));
              return (
                <div key={label || "_"}>
                  {groupBy && (
                    <label className="sticky top-0 z-10 flex cursor-pointer select-none items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-1.5 text-[12px] font-medium text-slate-700 backdrop-blur">
                      {!single && <input type="checkbox" checked={all} disabled={!free.length} onChange={() => toggle(free.map((r) => r.mo_no), !all)} />}
                      {label} <span className="font-normal text-slate-400">{items.length} ใบ</span>
                    </label>
                  )}
                  <ul className="divide-y divide-slate-100">
                    {items.map((r) => {
                      const inTable = ex.has(r.mo_no), on = inTable || picked.has(r.mo_no);
                      return (
                        <li key={r.mo_no}>
                          <label className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm ${groupBy ? "pl-6" : ""} ${inTable ? "cursor-default bg-slate-50/60 opacity-60" : on ? "bg-violet-50/60" : "hover:bg-slate-50"}`}>
                            <input type="checkbox" checked={on} disabled={inTable} onChange={(e) => toggle([r.mo_no], e.target.checked)} />
                            <HoverImage url={r.image_url} size={36} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-mono text-[13px] font-semibold text-slate-800">{r.sku ?? "-"}</span>
                                <span className="text-[12px] text-slate-500">{r.mo_no}</span>
                                {inTable && <span className="text-[11px] text-slate-400">อยู่ในตารางแล้ว</span>}
                                {r.so_order_no && <span className="rounded bg-amber-50 px-1 text-[11px] text-amber-700">ผูก {r.so_order_no} แล้ว</span>}
                              </div>
                              {r.name && <div className="truncate text-[11px] text-slate-400">{r.name}</div>}
                            </div>
                            <div className="shrink-0 text-right text-[12px] text-slate-500">
                              <div>{fmt(r.qty)} ชิ้น · <span className={r.stage === "waiting" ? "text-amber-700" : "text-slate-600"}>{r.where}</span></div>
                              {r.due_date && <div className="text-[11px] text-slate-400">กำหนด {dueTh(r.due_date)}</div>}
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          {shown.length > SHOW_MAX && <div className="border-t border-slate-100 px-3 py-2 text-center text-[12px] text-amber-700">แสดง {SHOW_MAX} จาก {fmt(shown.length)} ใบ — พิมพ์ค้นให้แคบลง</div>}
        </div>
      </div>
    </ERPModal>
  );
}
