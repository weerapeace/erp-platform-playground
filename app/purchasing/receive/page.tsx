"use client";

/**
 * หน้ารับสินค้าเข้า (Goods Receipt) — 2 มุมมอง
 *  A) ตามใบสั่งซื้อ (PO): เลือกร้าน/PO → รับทั้งใบ
 *  B) สินค้าที่รอเข้า: รวมทุกบรรทัดที่ยังรับไม่ครบจากทุก PO (sort ตาม ETA → ชื่อ) เลือกรับข้ามใบได้
 * บังคับแนบ "ใบรับของ + บิล" (รูป/PDF) ทุกครั้งก่อนบันทึก
 * รับไม่ครบ (แท็บ A) จะเด้งถามว่าจบงาน/รอของ · รับเกินได้
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth } from "@/components/auth";
import { useBackdropDismiss } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { FileInput } from "@/components/file-input";

type PO = { id: string; po_no: string; seller_name: string; status: string; currency: string; expected_date?: string | null; order_date?: string | null };
type Line = { id: string; item_name: string; qty: number; uom: string; qty_received: number };
type Input = { recv: string; def: string };
type PayloadLine = { po_line_id: string; qty_received: number; qty_defective: number; case_type: string };
// แท็บ B: บรรทัดรอเข้า + ข้อมูล PO ต้นทาง
type PendItem = { id: string; po_id: string; po_no: string; seller_name: string; item_name: string; uom: string; remaining: number; eta: string };

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export default function ReceiveGoodsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"po" | "pending">("po");
  const [pos, setPos] = useState<PO[]>([]);
  const [poId, setPoId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [inputs, setInputs] = useState<Record<string, Input>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shortDialog, setShortDialog] = useState<{ base: PayloadLine[]; shortIds: string[]; shortNames: string[] } | null>(null);

  // ไฟล์แนบ (บังคับทั้งคู่)
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [billKey, setBillKey] = useState<string | null>(null);
  const attachReady = !!receiptKey && !!billKey;

  // แท็บ B — สินค้าที่รอเข้า
  const [pend, setPend] = useState<PendItem[]>([]);
  const [pendInputs, setPendInputs] = useState<Record<string, Input>>({});
  const [pendQ, setPendQ] = useState("");
  const [pendLoading, setPendLoading] = useState(false);

  useEffect(() => {
    apiFetch("/api/master-v2/purchase-orders-v2?limit=200").then((r) => r.json()).then((j) => {
      const list = ((j.data ?? []) as PO[]).filter((p) => p.status !== "received" && p.status !== "cancelled");
      setPos(list);
    }).catch(() => {});
  }, [done]);

  // ---- แท็บ A: โหลดบรรทัดของ PO ----
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

  // ---- แท็บ B: โหลดบรรทัดที่ยังรับไม่ครบจากทุก PO ----
  const loadPending = useCallback(async () => {
    setPendLoading(true); setErr(null);
    try {
      const poMap = new Map(pos.map((p) => [p.id, p]));
      const j = await apiFetch(`/api/master-v2/purchase-order-lines-v2?limit=500`).then((r) => r.json());
      const items: PendItem[] = ((j.data ?? []) as (Line & { po_id: string })[])
        .filter((l) => poMap.has(l.po_id) && Math.max(0, num(l.qty) - num(l.qty_received)) > 0)
        .map((l) => {
          const po = poMap.get(l.po_id)!;
          return {
            id: l.id, po_id: l.po_id, po_no: po.po_no, seller_name: po.seller_name,
            item_name: l.item_name, uom: l.uom, remaining: Math.max(0, num(l.qty) - num(l.qty_received)),
            eta: String(po.expected_date || po.order_date || ""),
          };
        });
      // sort: ETA (ว่าง = ท้ายสุด) → ชื่อสินค้า
      items.sort((a, b) => {
        const ea = a.eta || "9999-12-31", eb = b.eta || "9999-12-31";
        if (ea !== eb) return ea < eb ? -1 : 1;
        return a.item_name.localeCompare(b.item_name, "th");
      });
      setPend(items);
      const init: Record<string, Input> = {};
      items.forEach((it) => { init[it.id] = { recv: String(it.remaining), def: "0" }; });
      setPendInputs(init);
    } catch (e) { setErr(String(e)); }
    finally { setPendLoading(false); }
  }, [pos]);

  useEffect(() => { if (tab === "pending") void loadPending(); }, [tab, loadPending]);
  const setPendInput = (id: string, patch: Partial<Input>) => setPendInputs((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const shownPend = useMemo(() => {
    const ql = pendQ.trim().toLowerCase();
    if (!ql) return pend;
    return pend.filter((it) => it.item_name.toLowerCase().includes(ql) || it.po_no.toLowerCase().includes(ql) || it.seller_name.toLowerCase().includes(ql));
  }, [pend, pendQ]);

  // ---- ยิง API (1 PO) ----
  const postReceive = async (poIdArg: string, payloadLines: PayloadLine[]) => {
    const res = await apiFetch("/api/purchasing/receive", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ po_id: poIdArg, receiver: user?.name, lines: payloadLines, receipt_doc_r2_key: receiptKey, bill_doc_r2_key: billKey }),
    });
    return res.json();
  };

  const resetAfterSave = () => { setReceiptKey(null); setBillKey(null); };

  // แท็บ A: บันทึก
  const doSubmit = async (payloadLines: PayloadLine[]) => {
    setSaving(true); setErr(null);
    try {
      const j = await postReceive(poId, payloadLines);
      if (j.error) { setErr(j.error); return; }
      setDone(`✅ รับสินค้าสำเร็จ — เลขที่ ${j.gr_no} · สถานะ PO: ${j.po_status}`);
      setPoId(""); setLines([]); setInputs({}); setShortDialog(null); resetAfterSave();
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  };

  const onSave = () => {
    setErr(null);
    if (!attachReady) { setErr("ต้องแนบ ใบรับของ + บิล ให้ครบก่อนบันทึก"); return; }
    const base: PayloadLine[] = [];
    const shortIds: string[] = [];
    const shortNames: string[] = [];
    for (const l of lines) {
      const recv = num(inputs[l.id]?.recv);
      const def = num(inputs[l.id]?.def);
      if (recv <= 0 && def <= 0) continue;
      const remaining = Math.max(0, num(l.qty) - num(l.qty_received));
      const isShort = recv < remaining;
      base.push({ po_line_id: l.id, qty_received: recv, qty_defective: def, case_type: isShort ? "partial_wait" : "full" });
      if (isShort) { shortIds.push(l.id); shortNames.push(l.item_name); }
    }
    if (base.length === 0) { setErr("กรอกจำนวนรับอย่างน้อย 1 รายการ"); return; }
    if (shortIds.length > 0) setShortDialog({ base, shortIds, shortNames });
    else void doSubmit(base);
  };

  const resolveShort = (caseType: "partial_close" | "partial_wait") => {
    if (!shortDialog) return;
    const ids = new Set(shortDialog.shortIds);
    const payload = shortDialog.base.map((l) => ids.has(l.po_line_id) ? { ...l, case_type: caseType } : l);
    void doSubmit(payload);
  };

  // แท็บ B: บันทึก (จัดกลุ่มตาม PO → ยิงทีละใบ; บรรทัดที่ขาด = รอของ อัตโนมัติ)
  const savePending = async () => {
    setErr(null);
    if (!attachReady) { setErr("ต้องแนบ ใบรับของ + บิล ให้ครบก่อนบันทึก"); return; }
    const byPo = new Map<string, PayloadLine[]>();
    for (const it of pend) {
      const recv = num(pendInputs[it.id]?.recv);
      const def = num(pendInputs[it.id]?.def);
      if (recv <= 0 && def <= 0) continue;
      const isShort = recv < it.remaining;
      const arr = byPo.get(it.po_id) ?? [];
      arr.push({ po_line_id: it.id, qty_received: recv, qty_defective: def, case_type: isShort ? "partial_wait" : "full" });
      byPo.set(it.po_id, arr);
    }
    if (byPo.size === 0) { setErr("กรอกจำนวนรับอย่างน้อย 1 รายการ"); return; }
    setSaving(true);
    try {
      const results: string[] = [];
      for (const [pid, payload] of byPo) {
        const j = await postReceive(pid, payload);
        if (j.error) { setErr(`PO ${pos.find(p => p.id === pid)?.po_no ?? pid}: ${j.error}`); setSaving(false); return; }
        results.push(j.gr_no);
      }
      setDone(`✅ รับสินค้าสำเร็จ ${results.length} ใบรับ (${byPo.size} ใบสั่งซื้อ): ${results.join(", ")}`);
      resetAfterSave();
      await loadPending();
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  };

  const dialogDismiss = useBackdropDismiss(() => setShortDialog(null));

  // กล่องแนบไฟล์ (ใช้ร่วม 2 แท็บ)
  const attachBox = (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
      <div className="text-sm font-semibold text-slate-700 mb-2">📎 เอกสารแนบ (บังคับ) <span className="text-xs font-normal text-slate-400">— รูปถ่ายหรือ PDF</span></div>
      <div className="grid grid-cols-2 gap-3">
        <FileInput label="📄 ใบรับของ" value={receiptKey} onChange={setReceiptKey} folder="goods-receipts" required hasError={!receiptKey && !!err} />
        <FileInput label="🧾 บิล / ใบเสร็จ" value={billKey} onChange={setBillKey} folder="goods-receipts" required hasError={!billKey && !!err} />
      </div>
    </div>
  );

  return (
    <PlaygroundShell>
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-slate-800">📥 รับสินค้าเข้า</h1>
        <p className="text-sm text-slate-500 mt-0.5 mb-4">เลือกวิธีรับ → กรอกจำนวนที่รับจริง → แนบใบรับ/บิล → บันทึก (รับเกินได้ · ถ้ารับไม่ครบจะถามว่าจบงานหรือรอของ)</p>

        {/* แท็บเลือกมุมมอง */}
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden mb-4 text-sm">
          <button onClick={() => { setTab("po"); setDone(null); }} className={`px-4 py-2 transition-colors ${tab === "po" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>📋 ตามใบสั่งซื้อ</button>
          <button onClick={() => { setTab("pending"); setDone(null); }} className={`px-4 py-2 transition-colors ${tab === "pending" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>📦 สินค้าที่รอเข้า</button>
        </div>

        {done && <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{done} — <a href="/m/goods-receipts-v2" className="underline">ดูใบรับสินค้า</a></div>}
        {err && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {err}</div>}

        {attachBox}

        {tab === "po" ? (
          <>
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
                <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">รายการสินค้า — {selectedPo?.seller_name}</div>
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
                  <button onClick={onSave} disabled={saving || !attachReady} title={!attachReady ? "แนบใบรับของ + บิลก่อน" : ""}
                    className="h-10 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                    {saving ? "กำลังบันทึก…" : "บันทึกรับสินค้า →"}
                  </button>
                </div>
              </div>
            ) : poId ? (
              <div className="py-10 text-center text-slate-300 text-sm">— ใบนี้ไม่มีรายการสินค้า —</div>
            ) : null}
          </>
        ) : (
          /* แท็บ B: สินค้าที่รอเข้า */
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">สินค้าที่รอเข้า ({pend.length})</span>
              <input value={pendQ} onChange={(e) => setPendQ(e.target.value)} placeholder="ค้นหา ชื่อสินค้า / PO / ร้าน..."
                className="ml-auto w-72 h-8 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
            {pendLoading ? (
              <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
            ) : pend.length === 0 ? (
              <div className="py-10 text-center text-slate-300 text-sm">— ไม่มีสินค้าค้างรับ —</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">สินค้า</th>
                        <th className="text-left px-3 py-2 font-medium">ร้าน / PO</th>
                        <th className="text-left px-3 py-2 font-medium">วันที่จะถึง</th>
                        <th className="text-right px-3 py-2 font-medium">คงเหลือ</th>
                        <th className="px-3 py-2 font-medium">รับครั้งนี้</th>
                        <th className="px-3 py-2 font-medium">เสีย/ผิด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shownPend.map((it) => {
                        const inp = pendInputs[it.id] ?? { recv: "0", def: "0" };
                        const short = num(inp.recv) > 0 && num(inp.recv) < it.remaining;
                        return (
                          <tr key={it.id}>
                            <td className="px-4 py-2 text-slate-700">{it.item_name}</td>
                            <td className="px-3 py-2 text-slate-500"><div className="text-slate-700">{it.seller_name}</div><div className="text-[11px] text-slate-400">{it.po_no}</div></td>
                            <td className="px-3 py-2 text-slate-500">{it.eta || <span className="text-slate-300">—</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">{it.remaining.toLocaleString()} {it.uom}</td>
                            <td className="px-3 py-2">
                              <input type="number" step="any" min={0} value={inp.recv} onChange={(e) => setPendInput(it.id, { recv: e.target.value })}
                                className={`w-20 h-8 px-2 text-sm text-right border rounded ${short ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" step="any" min={0} value={inp.def} onChange={(e) => setPendInput(it.id, { def: e.target.value })}
                                className="w-20 h-8 px-2 text-sm text-right border border-slate-200 rounded" />
                            </td>
                          </tr>
                        );
                      })}
                      {shownPend.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-300">— ไม่พบรายการที่ค้นหา —</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400">บรรทัดที่รับไม่ครบจะตั้งเป็น &quot;รอของ&quot; อัตโนมัติ</span>
                  <button onClick={savePending} disabled={saving || !attachReady} title={!attachReady ? "แนบใบรับของ + บิลก่อน" : ""}
                    className="h-10 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                    {saving ? "กำลังบันทึก…" : "บันทึกรับสินค้า →"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* popup ถามกรณีรับไม่ครบ (แท็บ A) */}
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
