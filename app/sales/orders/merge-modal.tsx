"use client";

/**
 * รวมใบสั่งขาย (เจ้าของสั่ง 2026-11-21 · เลือกจาก widget: รวม + เติมราคา + แยกคืนได้)
 *   ดูตัวอย่างก่อน (POST /api/so-orders/tidy action=preview — ไม่เขียนอะไร) → กดยืนยัน (action=merge)
 *   ใบหลัก = เลขน้อยสุด · ใบอื่น = ยกเลิก (เก็บเลขเดิม · แยกคืนได้จากใบหลัก) · ใบสั่งผลิตย้ายมาผูกใบหลัก
 *   ติ๊ก "เติมราคา" = รายการราคา 0 ใช้ราคาที่เคยขายล่าสุด (ลูกค้าเดียวกันก่อน)
 *   หลังรวม: เลื่อนเลขใบถัดไปขึ้นมาแทนช่องว่าง (เช่น 023 → 011)
 * ของกลาง: ERPModal · apiFetch · useToast
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";

type Preview = {
  target_no: string; others: string[]; before_total: number; after_total: number; problems: string[];
  renumber: { from: string; to: string }[];
  lines: { id: string; order_no: string; sku: string | null; name: string; qty: number; price: number; new_price: number | null; price_from: string | null; mo_no: string | null }[];
};
const money = (n: number) => "฿" + (Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const num = (n: number) => (Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export function SoMergeModal({ ids, onClose, onDone }: { ids: string[] | null; onClose: () => void; onDone: (r: { id: string; order_no: string }) => void }) {
  const toast = useToast();
  const [fill, setFill] = useState(true);
  const [p, setP] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = (ids ?? []).join(",");

  useEffect(() => {
    if (!ids?.length) return;
    setP(null); setErr(null);
    apiFetch("/api/so-orders/tidy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", ids, fill_prices: fill }) })
      .then((r) => r.json()).then((j) => { if (j.error) setErr(j.error); else setP(j.data as Preview); })
      .catch(() => setErr("โหลดตัวอย่างไม่สำเร็จ"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fill]);

  const go = async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/so-orders/tidy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "merge", ids, fill_prices: fill }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "รวมใบไม่สำเร็จ");
      const rn = (j.renumbered ?? []) as { from: string; to: string }[];
      toast.success(`รวม ${j.merged + 1} ใบเป็น ${j.order_no} แล้ว${j.prices_filled ? ` · เติมราคา ${j.prices_filled} รายการ` : ""}${rn.length ? ` · เลื่อนเลข ${rn.map((x) => `${x.from}→${x.to}`).join(", ")}` : ""}`);
      onDone({ id: j.id, order_no: j.order_no });
    } catch (e) { toast.error(e instanceof Error ? e.message : "รวมใบไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const filled = p?.lines.filter((l) => l.new_price != null).length ?? 0;
  const stillZero = p?.lines.filter((l) => !(l.price > 0) && l.new_price == null).length ?? 0;
  return (
    <ERPModal open={!!ids?.length} onClose={() => !busy && onClose()} size="lg" title="รวมใบสั่งขาย — ดูตัวอย่างก่อน"
      description="ยังไม่บันทึกจนกว่าจะกดยืนยัน · รวมแล้วแยกคืนได้จากใบหลัก"
      footer={<>
        <label className="mr-auto flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} /> เติมราคาที่ว่างจากราคาที่เคยขาย</label>
        <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
        <button onClick={() => void go()} disabled={busy || !p || p.problems.length > 0} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {busy ? "กำลังรวม…" : `ยืนยันรวม ${(p?.others.length ?? 0) + 1} ใบ`}</button>
      </>}>
      {err ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>
        : !p ? <div className="py-8 text-center text-sm text-slate-400">กำลังคำนวณ…</div> : (
        <div className="space-y-3">
          {p.problems.length > 0 && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">รวมไม่ได้: {p.problems.join(" · ")}</div>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">ใบหลัก</div><div className="font-mono text-sm font-medium text-slate-800">{p.target_no}</div></div>
            <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">รายการรวม</div><div className="text-sm font-medium text-slate-800">{p.lines.length} รายการ</div></div>
            <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">ยอดก่อน → หลัง</div><div className="text-sm font-medium text-slate-800">{money(p.before_total)} → <span className="text-emerald-700">{money(p.after_total)}</span></div></div>
            <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">ราคาที่เติม</div><div className="text-sm font-medium text-slate-800">{filled} รายการ{stillZero ? <span className="text-amber-700"> · ว่าง {stillZero}</span> : ""}</div></div>
          </div>
          <div className="text-[12px] text-slate-500">ใบที่จะยกเลิก (เก็บไว้ แยกคืนได้): <span className="font-mono">{p.others.join(", ")}</span></div>
          {p.renumber.length > 0 && <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-800">เลื่อนเลขให้ไม่เว้นช่อง: {p.renumber.map((r) => <span key={r.from} className="mr-2 font-mono">{r.from} → {r.to}</span>)}</div>}
          <div className="max-h-[45vh] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500"><tr>
                <th className="px-2 py-1.5 text-left font-medium">#</th><th className="px-2 py-1.5 text-left font-medium">สินค้า</th>
                <th className="hidden px-2 py-1.5 text-left font-medium sm:table-cell">มาจาก</th><th className="px-2 py-1.5 text-right font-medium">จำนวน</th><th className="px-2 py-1.5 text-right font-medium">ราคา</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {p.lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className="px-2 py-1.5 text-[11px] text-slate-400">{i + 1}</td>
                    <td className="px-2 py-1.5"><div className="text-slate-800">{l.name}</div><div className="text-[11px] text-slate-400"><code className="text-orange-700">{l.sku}</code>{l.mo_no ? ` · ${l.mo_no}` : ""}</div></td>
                    <td className="hidden px-2 py-1.5 font-mono text-[11px] text-slate-500 sm:table-cell">{l.order_no}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(l.qty)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {l.price > 0 ? num(l.price) : l.new_price != null
                        ? <span title={`ราคาจาก ${l.price_from}`}><span className="text-slate-300 line-through">0</span> <b className="font-medium text-emerald-700">{num(l.new_price)}</b><div className="text-[10px] text-slate-400">จาก {l.price_from}</div></span>
                        : <span className="text-amber-700">0 (พิมพ์เอง)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ERPModal>
  );
}
