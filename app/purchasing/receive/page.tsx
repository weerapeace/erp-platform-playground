"use client";

/**
 * หน้ารับสินค้าเข้า (Goods Receipt) — รับของตามใบสั่งซื้อ (PO) ราย "บรรทัดสินค้า"
 * UX: กรอกแค่จำนวนรับ/เสีย — ถ้าบรรทัดไหนรับไม่ครบ ตอนบันทึกจะเด้ง popup
 *     ให้เลือก "จบงาน (ปิดยอด)" หรือ "รอของ (รับบางส่วน)" แล้วตั้งสถานะตามนั้น
 *     รับเกินจำนวนสั่งได้ (treat เป็นรับครบ)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth } from "@/components/auth";
import { useBackdropDismiss } from "@/components/modal";
import { apiFetch } from "@/lib/api";

type PO = { id: string; po_no: string; seller_name: string; status: string; currency: string };
type Line = { id: string; item_name: string; qty: number; uom: string; qty_received: number };
type Input = { recv: string; def: string };
type PayloadLine = { po_line_id: string; qty_received: number; qty_defective: number; case_type: string };

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export default function ReceiveGoodsPage() {
  const { user } = useAuth();
  const [pos, setPos] = useState<PO[]>([]);
  const [poId, setPoId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [inputs, setInputs] = useState<Record<string, Input>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // popup ถามกรณีรับไม่ครบ — เก็บ payload ที่รอ + รายชื่อบรรทัดที่ไม่ครบ
  const [shortDialog, setShortDialog] = useState<{ base: PayloadLine[]; shortIds: string[]; shortNames: string[] } | null>(null);

  useEffect(() => {
    apiFetch("/api/master-v2/purchase-orders-v2?limit=200").then((r) => r.json()).then((j) => {
      const list = ((j.data ?? []) as PO[]).filter((p) => p.status !== "received" && p.status !== "cancelled");
      setPos(list);
    }).catch(() => {});
  }, [done]);

  const loadLines = useCallback((id: string) => {
    if (!id) { setLines([]); return; }
    setLoading(true); setErr(null);
    const flt = encodeURIComponent(JSON.stringify({ po_id: { type: "text", value: id } }));
    apiFetch(`/api/master-v2/purchase-order-lines-v2?limit=200&filters=${flt}`).then((r) => r.json()).then((j) => {
      const ls = (j.data ?? []) as Line[];
      setLines(ls);
      const init: Record<string, Input> = {};
      for (const l of ls) {
        const remaining = Math.max(0, num(l.qty) - num(l.qty_received));
        init[l.id] = { recv: remaining > 0 ? String(remaining) : "0", def: "0" };
      }
      setInputs(init);
    }).catch((e) => setErr(String(e))).finally(() => setLoading(false));
  }, []);

  const onPickPo = (id: string) => { setPoId(id); setDone(null); loadLines(id); };
  const setInput = (id: string, patch: Partial<Input>) => setInputs((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const selectedPo = useMemo(() => pos.find((p) => p.id === poId), [pos, poId]);

  // ยิง API จริง
  const doSubmit = async (payloadLines: PayloadLine[]) => {
    setSaving(true); setErr(null);
    try {
      const res = await apiFetch("/api/purchasing/receive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ po_id: poId, receiver: user?.name, lines: payloadLines }),
      });
      const j = await res.json();
      if (j.error) { setErr(j.error); return; }
      setDone(`✅ รับสินค้าสำเร็จ — เลขที่ ${j.gr_no} · สถานะ PO: ${j.po_status}`);
      setPoId(""); setLines([]); setInputs({}); setShortDialog(null);
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  };

  // กดบันทึก — เช็คว่ามีบรรทัดรับไม่ครบไหม
  const onSave = () => {
    setErr(null);
    const base: PayloadLine[] = [];
    const shortIds: string[] = [];
    const shortNames: string[] = [];
    for (const l of lines) {
      const recv = num(inputs[l.id]?.recv);
      const def = num(inputs[l.id]?.def);
      if (recv <= 0 && def <= 0) continue;  // ไม่รับบรรทัดนี้
      const remaining = Math.max(0, num(l.qty) - num(l.qty_received));
      const isShort = recv < remaining;     // รับไม่ครบ (รับเกิน/พอดี = ครบ)
      base.push({ po_line_id: l.id, qty_received: recv, qty_defective: def, case_type: isShort ? "partial_wait" : "full" });
      if (isShort) { shortIds.push(l.id); shortNames.push(l.item_name); }
    }
    if (base.length === 0) { setErr("กรอกจำนวนรับอย่างน้อย 1 รายการ"); return; }
    if (shortIds.length > 0) {
      setShortDialog({ base, shortIds, shortNames });  // เด้ง popup ให้เลือก
    } else {
      void doSubmit(base);  // รับครบทุกบรรทัด → บันทึกเลย
    }
  };

  // เลือกในpopup: ใส่ case ให้บรรทัดที่ไม่ครบ แล้วบันทึก
  const resolveShort = (caseType: "partial_close" | "partial_wait") => {
    if (!shortDialog) return;
    const ids = new Set(shortDialog.shortIds);
    const payload = shortDialog.base.map((l) => ids.has(l.po_line_id) ? { ...l, case_type: caseType } : l);
    void doSubmit(payload);
  };

  const dialogDismiss = useBackdropDismiss(() => setShortDialog(null));

  return (
    <PlaygroundShell>
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-slate-800">📥 รับสินค้าเข้า</h1>
        <p className="text-sm text-slate-500 mt-0.5 mb-4">เลือกใบสั่งซื้อ → กรอกจำนวนที่รับจริงต่อสินค้า → บันทึก (รับเกินได้ · ถ้ารับไม่ครบจะถามว่าจบงานหรือรอของ)</p>

        {done && <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{done} — <a href="/m/goods-receipts-v2" className="underline">ดูใบรับสินค้า</a></div>}
        {err && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {err}</div>}

        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <label className="text-xs font-medium text-slate-600">ใบสั่งซื้อ (PO)</label>
          <select value={poId} onChange={(e) => onPickPo(e.target.value)}
            className="mt-1 w-full h-10 px-3 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">— เลือกใบสั่งซื้อที่ต้องการรับ —</option>
            {pos.map((p) => <option key={p.id} value={p.id}>{p.po_no} · {p.seller_name} · {p.status}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
        ) : poId && lines.length > 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">
              รายการสินค้า — {selectedPo?.seller_name}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">สินค้า</th>
                    <th className="text-right px-3 py-2 font-medium">สั่ง</th>
                    <th className="text-right px-3 py-2 font-medium">รับแล้ว</th>
                    <th className="text-right px-3 py-2 font-medium">คงเหลือ</th>
                    <th className="px-3 py-2 font-medium">รับครั้งนี้</th>
                    <th className="px-3 py-2 font-medium">เสีย/ผิด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => {
                    const remaining = Math.max(0, num(l.qty) - num(l.qty_received));
                    const inp = inputs[l.id] ?? { recv: "0", def: "0" };
                    const short = num(inp.recv) > 0 && num(inp.recv) < remaining;
                    return (
                      <tr key={l.id}>
                        <td className="px-4 py-2 text-slate-700">{l.item_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{num(l.qty).toLocaleString()} {l.uom}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{num(l.qty_received).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">{remaining.toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <input type="number" step="any" min={0} value={inp.recv} onChange={(e) => setInput(l.id, { recv: e.target.value })}
                            className={`w-20 h-8 px-2 text-sm text-right border rounded ${short ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="any" min={0} value={inp.def} onChange={(e) => setInput(l.id, { def: e.target.value })}
                            className="w-20 h-8 px-2 text-sm text-right border border-slate-200 rounded" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex justify-end">
              <button onClick={onSave} disabled={saving}
                className="h-10 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {saving ? "กำลังบันทึก…" : "บันทึกรับสินค้า →"}
              </button>
            </div>
          </div>
        ) : poId ? (
          <div className="py-10 text-center text-slate-300 text-sm">— ใบนี้ไม่มีรายการสินค้า —</div>
        ) : null}
      </div>

      {/* popup ถามกรณีรับไม่ครบ */}
      {shortDialog && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" {...dialogDismiss}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-800">มีสินค้ารับไม่ครบ {shortDialog.shortIds.length} รายการ</h3>
              <p className="text-xs text-slate-500 mt-0.5">{shortDialog.shortNames.join(", ")}</p>
            </div>
            <div className="p-5 space-y-2">
              <p className="text-sm text-slate-600 mb-2">ต้องการจัดการยอดที่ขาดอย่างไร?</p>
              <button onClick={() => resolveShort("partial_close")} disabled={saving}
                className="w-full text-left px-4 py-3 border border-slate-200 rounded-lg hover:bg-orange-50 hover:border-orange-300 disabled:opacity-40">
                <div className="font-medium text-slate-800">🔴 จบงาน (ปิดยอดที่ขาด)</div>
                <div className="text-xs text-slate-500 mt-0.5">ไม่รอของส่วนที่เหลือแล้ว — สถานะ &quot;ปิดยอด (ขาด)&quot;</div>
              </button>
              <button onClick={() => resolveShort("partial_wait")} disabled={saving}
                className="w-full text-left px-4 py-3 border border-slate-200 rounded-lg hover:bg-amber-50 hover:border-amber-300 disabled:opacity-40">
                <div className="font-medium text-slate-800">🟡 รอของ (รับเพิ่มภายหลัง)</div>
                <div className="text-xs text-slate-500 mt-0.5">ส่วนที่เหลือยังค้างรับต่อ — สถานะ &quot;รับบางส่วน&quot;</div>
              </button>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShortDialog(null)} disabled={saving}
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </PlaygroundShell>
  );
}
