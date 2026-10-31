"use client";

/**
 * 🧾 หน้าต่าง "เลือกใบขาย" ของใบสั่งผลิต 1 ใบ (เจ้าของขอ 2026-10-31: "กดเลือกใบขายได้ไหม … ถ้าผลิต 100 แต่ส่ง 50 จะผูกยังไง")
 *   เห็นทุกบรรทัดใบขายของ SKU นี้ (เหลือผูกได้ · ผูกกับใบไหนแล้ว · ระบบเสนอให้ใบไหน · ใบขายก่อนวันเปิดใบซ่อนไว้) + เตือนใบที่อาจเปิดซ้ำ
 *   ติ๊ก + พิมพ์จำนวนที่ผูก (ไม่เกินที่เหลือผูกได้ และรวมไม่เกินที่ผลิต)
 *   ผูกน้อยกว่าที่ผลิต → เลือกว่าที่เหลือเป็นอย่างไร: เข้าคลังขาย (แนะนำ) / ค้างบนชั้น QC / ทำได้แค่นี้ (ลดจำนวนสั่ง)
 *   ข้อมูล = GET /api/mo/sales-match?mo_no=&detail=1 · ผูกจริง/ตั้งขั้น = หน้าที่เรียก (catch-up-batch onConfirm)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import type { SalesDetail } from "@/app/api/mo/sales-match/route";

export type BillRest = "sales_wh" | "keep" | "cut";
export type BillPick = { parts: { sale_line_id: string; so_number: string; date: string; qty: number }[]; total: number; rest: BillRest | null };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const r2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.0001;

export function SalesBillPicker({ moNo, onClose, onConfirm, canLink }: {
  moNo: string | null;
  onClose: () => void;
  onConfirm: (pick: BillPick) => Promise<void> | void;
  /** false = ส่งคำขอ (ใช้ข้อมูลตั้งขั้นอย่างเดียว ไม่ผูกจริง) */
  canLink: boolean;
}) {
  const [data, setData] = useState<SalesDetail | null>(null);
  const [err, setErr] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [rest, setRest] = useState<BillRest>("sales_wh");
  const [showBefore, setShowBefore] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!moNo) { setData(null); return; }
    setData(null); setErr(""); setShowBefore(false); setRest("sales_wh");
    void (async () => {
      try {
        const r = await apiFetch(`/api/mo/sales-match?mo_no=${encodeURIComponent(moNo)}&detail=1`);
        const j = await r.json();
        if (!r.ok || j?.error) throw new Error(j?.error || "โหลดใบขายไม่สำเร็จ");
        const d = j.data as SalesDetail;
        setData(d);
        // ตั้งต้น: ที่ผูกไว้แล้ว ไม่งั้นที่ระบบเสนอให้ใบนี้
        const q: Record<string, number> = {}, o: Record<string, boolean> = {};
        for (const k of d.mine) { q[k.sale_line_id] = k.qty; o[k.sale_line_id] = true; }
        if (!d.mine.length) for (const l of d.lines) { const s = l.suggested.find((x) => x.mo_no === d.mo.mo_no); if (s) { q[l.id] = s.qty; o[l.id] = true; } }
        setQty(q); setOn(o);
      } catch (e) { setErr(e instanceof Error ? e.message : "โหลดใบขายไม่สำเร็จ"); }
    })();
  }, [moNo]);

  const lines = data?.lines ?? [];
  const shown = lines.filter((l) => showBefore || !l.before || on[l.id]);
  const hiddenBefore = lines.filter((l) => l.before && !on[l.id]).length;
  const total = r2(lines.reduce((a, l) => a + (on[l.id] ? qty[l.id] || 0 : 0), 0));
  const moQty = data?.mo.qty ?? 0;
  const left = r2(moQty - total);
  const lineErr = (id: string) => { const l = lines.find((x) => x.id === id)!; const q = qty[id] || 0; return on[id] && (q <= 0 || q > l.left + EPS) ? (q <= 0 ? "ใส่จำนวน" : `เหลือผูกได้ ${fmt(l.left)}`) : ""; };
  const errors = [...lines.map((l) => lineErr(l.id)).filter(Boolean), ...(total > moQty + EPS ? [`ผูกเกินที่ผลิต ${fmt(total - moQty)} ชิ้น`] : [])];
  const toggle = (id: string, v: boolean) => {
    setOn((o) => ({ ...o, [id]: v }));
    if (v && !(qty[id] > 0)) { const l = lines.find((x) => x.id === id)!; setQty((q) => ({ ...q, [id]: r2(Math.max(0, Math.min(l.left, moQty - total))) })); }
  };
  const preview = !total ? "ยังไม่ได้เลือกใบขาย"
    : left <= EPS ? `ส่งออกจาก QC ${fmt(moQty)} → ขายออก`
    : rest === "sales_wh" ? `ส่งออก ${fmt(total)} → ขายออก · อีก ${fmt(left)} → เข้าคลังขาย`
    : rest === "keep" ? `ส่งออก ${fmt(total)} → ขายออก · อีก ${fmt(left)} ค้างบนชั้น QC`
    : `ลดจำนวนสั่ง ${fmt(moQty)} → ${fmt(total)} · ส่งออก ${fmt(total)} → ขายออก`;
  const confirm = async () => {
    if (!data || !total || errors.length) return;
    setBusy(true);
    try {
      await onConfirm({
        parts: lines.filter((l) => on[l.id] && (qty[l.id] || 0) > 0).map((l) => ({ sale_line_id: l.id, so_number: l.so_number, date: l.date, qty: r2(qty[l.id]) })),
        total, rest: left > EPS ? rest : null,
      });
    } finally { setBusy(false); }
  };
  const inp = "h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const opt = (k: BillRest, title: string, sub: string) => (
    <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-[12px] ${rest === k ? "border-indigo-400 bg-indigo-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}>
      <input type="radio" checked={rest === k} onChange={() => setRest(k)} className="mt-0.5 accent-indigo-600" />
      <span><span className="block font-medium text-slate-800">{title}</span><span className="text-slate-500">{sub}</span></span>
    </label>
  );

  return (
    <ERPModal open={!!moNo} onClose={() => { if (!busy) onClose(); }} size="lg"
      title={data ? `เลือกใบขาย · ${data.mo.sku}` : "เลือกใบขาย"}
      footer={<>
        <span className={`mr-auto text-[12px] ${errors.length ? "text-rose-600" : "text-slate-500"}`}>{errors[0] ?? preview}</span>
        <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm disabled:opacity-40">ยกเลิก</button>
        <button type="button" onClick={() => void confirm()} disabled={busy || !total || errors.length > 0}
          className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
          {busy ? "กำลังบันทึก…" : canLink ? "ผูก + ไปถึงขั้นส่งออก" : "ใช้ข้อมูลนี้ → ขั้นส่งออก"}
        </button>
      </>}>
      {err ? <div className="py-10 text-center text-sm text-rose-600">{err}</div> : !data ? <div className="py-10 text-center text-sm text-slate-400">กำลังโหลดใบขาย…</div> : (
        <div className="space-y-3">
          <div className="text-[13px] text-slate-600"><b className="text-slate-800">{data.mo.mo_no}</b> · ผลิต <b className="text-slate-800">{fmt(moQty)}</b> ชิ้น · เปิดใบ {data.mo.from}</div>
          {data.dupes.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <Icon name="warning" /> SKU เดียวกัน จำนวนเท่ากัน ยังไม่ปิดอีก {data.dupes.length} ใบ: {data.dupes.map((x) => `${x.mo_no} (เปิด ${x.from})`).join(" · ")} — อาจเปิดใบซ้ำ? ระบบเสนอใบขายให้ใบที่เปิดก่อน
            </div>
          )}
          {!lines.length ? <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-[13px] text-slate-500">ยังไม่มีใบขายของ {data.mo.sku} (ไม่นับร่าง/ยกเลิก)</div> : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-[13px]">
                <thead className="bg-slate-50 text-left text-[12px] text-slate-500"><tr>
                  <th className="w-8 px-2 py-2" /><th className="px-2 py-2 font-medium">ใบขาย</th><th className="px-2 py-2 font-medium">วันที่ · ลูกค้า</th>
                  <th className="w-20 px-2 py-2 text-right font-medium">ในบิล</th><th className="w-24 px-2 py-2 text-right font-medium">เหลือผูกได้</th><th className="w-28 px-2 py-2 text-right font-medium">ผูกกี่ชิ้น</th>
                </tr></thead>
                <tbody>
                  {shown.map((l) => {
                    const others = l.linked.filter((x) => x.mo_no !== data.mo.mo_no), sug = l.suggested.filter((x) => x.mo_no !== data.mo.mo_no);
                    const full = l.left <= EPS && !on[l.id], e = lineErr(l.id);
                    return (
                      <tr key={l.id} className={`border-t border-slate-100 ${full ? "opacity-50" : ""}`}>
                        <td className="px-2 py-2"><input type="checkbox" disabled={full} checked={!!on[l.id]} onChange={(ev) => toggle(l.id, ev.target.checked)} className="h-4 w-4 accent-emerald-600" /></td>
                        <td className="px-2 py-2">
                          <div className="font-medium text-slate-800">{l.so_number}</div>
                          {others.length > 0 && <div className="text-[11px] text-slate-500">ผูกกับ {others.map((x) => `${x.mo_no} (${fmt(x.qty)})`).join(", ")}</div>}
                          {sug.length > 0 && <div className="text-[11px] text-indigo-600">ระบบเสนอให้ {sug.map((x) => x.mo_no).join(", ")} (ยังไม่ผูก) — เลือกให้ใบนี้ได้</div>}
                          {l.before && <div className="text-[11px] text-amber-700">ใบขายก่อนวันเปิดใบ — ปกติไม่ใช่ของใบนี้</div>}
                        </td>
                        <td className="px-2 py-2 text-[12px] text-slate-600">{l.date}{l.customer ? ` · ${l.customer}` : ""}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmt(l.qty)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmt(l.left)}</td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" min={0} step="any" disabled={!on[l.id]} value={on[l.id] ? qty[l.id] ?? "" : ""} onChange={(ev) => setQty((q) => ({ ...q, [l.id]: Math.max(0, Number(ev.target.value) || 0) }))}
                            className={`${inp} ${e ? "!border-rose-400 !bg-rose-50" : ""} disabled:bg-slate-50`} />
                          {e && <div className="text-[11px] text-rose-600">{e}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {hiddenBefore > 0 && <button type="button" onClick={() => setShowBefore((v) => !v)} className="text-[12px] text-slate-500 hover:text-slate-800">{showBefore ? "▾" : "▸"} ใบขายก่อนวันเปิดใบ ({hiddenBefore}) — ปกติไม่ใช่ของใบนี้</button>}
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span>ผูกรวม <b className="text-slate-800">{fmt(total)}</b> / ผลิต {fmt(moQty)}</span>
            {total > 0 && (left > EPS ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">อีก {fmt(left)} ชิ้นไม่อยู่ในใบขาย</span>
              : left < -EPS ? null : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">ครบตามที่ผลิต</span>)}
          </div>
          {total > 0 && left > EPS && (
            <div className="space-y-1.5">
              {opt("sales_wh", "ทำครบแล้ว → ที่เหลือเข้าคลังขาย (แนะนำ)", `ขายออก ${fmt(total)} · เก็บสต๊อกคลังขาย ${fmt(left)} (ขายทีหลัง) · ใบปิดได้`)}
              {opt("keep", "ทำครบแล้ว → ที่เหลือยังอยู่บนชั้น QC", "รอส่งรอบหน้า / รอใบขายใบใหม่ (มาผูกเพิ่มทีหลังได้)")}
              {opt("cut", `ทำได้แค่ ${fmt(total)} ชิ้น → ลดจำนวนสั่ง`, "ที่เหลือแยกเป็นใบใหม่รอทำ / ไม่ทำแล้ว (ปรับได้ในช่องเปลี่ยนจำนวน)")}
            </div>
          )}
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-700"><b>ระบบจะทำ:</b> {preview}{total > 0 ? ` · วันส่ง = ${lines.filter((l) => on[l.id]).map((l) => l.date).sort().pop() ?? "—"}` : ""}</div>
          {!canLink && <div className="text-[11px] text-slate-500">คุณส่งเป็นคำขอ — ระบบตั้งขั้นให้ ส่วนการผูกใบขายจริงทำตอนหัวหน้ายืนยัน</div>}
        </div>
      )}
    </ERPModal>
  );
}
