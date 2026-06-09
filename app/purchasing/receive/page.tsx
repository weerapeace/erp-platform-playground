"use client";

/**
 * หน้ารับสินค้าเข้า (Goods Receipt) — 2 มุมมอง
 *  A) ตามใบสั่งซื้อ (PO): เลือกร้าน/PO → รับทั้งใบ
 *  B) สินค้าที่รอเข้า: รวมทุกบรรทัดที่ยังรับไม่ครบจากทุก PO (sort ตาม ETA → ชื่อ) เลือกรับข้ามใบได้
 * บังคับแนบ "ใบรับของ + บิล" (รูป/PDF) ทุกครั้งก่อนบันทึก
 * รับไม่ครบ (แท็บ A) จะเด้งถามว่าจบงาน/รอของ · รับเกินได้
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth } from "@/components/auth";
import { useBackdropDismiss, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { FileInput } from "@/components/file-input";

type PO = { id: string; po_no: string; seller_name: string; status: string; currency: string; expected_date?: string | null; order_date?: string | null };
type Line = { id: string; item_name: string; qty: number; uom: string; qty_received: number };
type Input = { recv: string; def: string };
type PayloadLine = { po_line_id: string; qty_received: number; qty_defective: number; case_type: string };
// แท็บ B: บรรทัดรอเข้า (ข้อมูลครบจาก /api/purchasing/receivable — รูป/รหัส/วันสั่ง/วันคาด/วันเหลือ)
type PendItem = {
  id: string; po_id: string; po_no: string; seller_name: string;
  item_sku_id: string | null; item_name: string; code: string; image_url: string | null;
  uom: string; remaining: number; currency: string;
  order_date: string | null; expected_date: string | null;
  expected_source: "po" | "lead" | null; lead_time_days: number | null;
  days_remaining: number | null;
};
type PendSort = "eta" | "order" | "name";
type PendGroup = "none" | "shop" | "eta" | "po";

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
// ตัด [code] นำหน้าชื่อสินค้าออก (รหัสโชว์เป็น chip แยกอยู่แล้ว)
const stripCode = (name: string) => name?.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;

// ป้าย "วันที่เหลือ" จนถึงวันคาดการณ์ของเข้า → สี + ข้อความ
function etaBadge(days: number | null): { text: string; cls: string } {
  if (days == null) return { text: "ยังไม่ระบุ", cls: "bg-slate-100 text-slate-500 border-slate-200" };
  if (days < 0) return { text: `เลยกำหนด ${Math.abs(days)} วัน`, cls: "bg-red-50 text-red-700 border-red-200" };
  if (days === 0) return { text: "ถึงกำหนดวันนี้", cls: "bg-orange-50 text-orange-700 border-orange-200" };
  if (days <= 3) return { text: `เหลือ ${days} วัน`, cls: "bg-orange-50 text-orange-700 border-orange-200" };
  return { text: `เหลือ ${days} วัน`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

const PEND_VIEW_KEY = "recv_pend_view", PEND_COLS_KEY = "recv_pend_cols", PEND_SORT_KEY = "recv_pend_sort", PEND_GROUP_KEY = "recv_pend_group";
const COL_OPTIONS = [3, 4, 5, 6, 8, 10];

export default function ReceiveGoodsPage() {
  const { user } = useAuth();
  const toast = useToast();
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
  const [pendView, setPendView] = useState<"card" | "table">("card");
  const [pendCols, setPendCols] = useState(6);
  const [pendSort, setPendSort] = useState<PendSort>("eta");
  const [pendGroup, setPendGroup] = useState<PendGroup>("none");
  const [etaEdit, setEtaEdit] = useState<{ po_id: string; po_no: string; seller_name: string; value: string } | null>(null);
  const [etaSaving, setEtaSaving] = useState(false);
  const [qtyEdit, setQtyEdit] = useState<PendItem | null>(null);   // คลิกการ์ด → popup กรอกจำนวน

  // โหลดค่า view/cols/sort/group ที่จำไว้
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(PEND_VIEW_KEY); if (v === "card" || v === "table") setPendView(v);
    const c = Number(localStorage.getItem(PEND_COLS_KEY)); if (COL_OPTIONS.includes(c)) setPendCols(c);
    const s = localStorage.getItem(PEND_SORT_KEY); if (s === "eta" || s === "order" || s === "name") setPendSort(s as PendSort);
    const g = localStorage.getItem(PEND_GROUP_KEY); if (g === "none" || g === "shop" || g === "eta" || g === "po") setPendGroup(g as PendGroup);
  }, []);
  const changePendView = (v: "card" | "table") => { setPendView(v); localStorage.setItem(PEND_VIEW_KEY, v); };
  const changePendCols = (n: number) => { setPendCols(n); localStorage.setItem(PEND_COLS_KEY, String(n)); };
  const changePendSort = (s: PendSort) => { setPendSort(s); localStorage.setItem(PEND_SORT_KEY, s); };
  const changePendGroup = (g: PendGroup) => { setPendGroup(g); localStorage.setItem(PEND_GROUP_KEY, g); };

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

  // ---- แท็บ B: โหลดบรรทัดที่ยังรับไม่ครบ (API กลาง — รูป/รหัส/วันคาดครบ) ----
  const loadPending = useCallback(async () => {
    setPendLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/purchasing/receivable`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const items = (j.data ?? []) as PendItem[];
      setPend(items);
      const init: Record<string, Input> = {};
      items.forEach((it) => { init[it.id] = { recv: String(it.remaining), def: "0" }; });
      setPendInputs(init);
    } catch (e) { setErr(String(e)); }
    finally { setPendLoading(false); }
  }, []);

  useEffect(() => { if (tab === "pending") void loadPending(); }, [tab, loadPending]);
  const setPendInput = (id: string, patch: Partial<Input>) => setPendInputs((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  // ค้นหา + เรียงลำดับ (วันคาด / วันสั่ง / ชื่อ) — ค่าว่างไปท้ายสุดเสมอ
  const shownPend = useMemo(() => {
    const ql = pendQ.trim().toLowerCase();
    const filtered = !ql ? pend : pend.filter((it) =>
      it.item_name.toLowerCase().includes(ql) || it.code.toLowerCase().includes(ql) ||
      it.po_no.toLowerCase().includes(ql) || it.seller_name.toLowerCase().includes(ql));
    const byName = (a: PendItem, b: PendItem) => a.item_name.localeCompare(b.item_name, "th");
    const byDate = (ka: keyof PendItem) => (a: PendItem, b: PendItem) => {
      const va = (a[ka] as string) || "9999-12-31", vb = (b[ka] as string) || "9999-12-31";
      return va !== vb ? (va < vb ? -1 : 1) : byName(a, b);
    };
    const cmp = pendSort === "name" ? byName : pendSort === "order" ? byDate("order_date") : byDate("expected_date");
    return [...filtered].sort(cmp);
  }, [pend, pendQ, pendSort]);

  // จัดกลุ่ม (ร้าน / วันคาดเข้า / PO) — คงลำดับ sort ภายในกลุ่ม
  const groupedPend = useMemo<{ key: string; label: string; items: PendItem[] }[]>(() => {
    if (pendGroup === "none") return [{ key: "_all", label: "", items: shownPend }];
    const keyOf = (it: PendItem) =>
      pendGroup === "shop" ? (it.seller_name || "—")
      : pendGroup === "po" ? (it.po_no || "—")
      : (it.expected_date || "");   // eta
    const labelOf = (it: PendItem) =>
      pendGroup === "shop" ? `🏪 ${it.seller_name || "—"}`
      : pendGroup === "po" ? `📋 ${it.po_no || "—"} · ${it.seller_name || "—"}`
      : (it.expected_date ? `🚚 คาดเข้า ${formatDate(it.expected_date)}` : "🚚 ยังไม่ระบุวันคาด");
    const m = new Map<string, { key: string; label: string; items: PendItem[] }>();
    for (const it of shownPend) {
      const k = keyOf(it);
      const g = m.get(k); if (g) g.items.push(it);
      else m.set(k, { key: k, label: labelOf(it), items: [it] });
    }
    const groups = [...m.values()];
    // เรียงหัวกลุ่ม: eta ตามวันที่ (ว่าง=ท้าย), อื่นๆ ตามชื่อ
    groups.sort((a, b) => pendGroup === "eta"
      ? ((a.key || "9999-12-31") < (b.key || "9999-12-31") ? -1 : 1)
      : a.label.localeCompare(b.label, "th"));
    return groups;
  }, [shownPend, pendGroup]);

  // บันทึกวันคาดการณ์ของเข้าลงใบ PO (ผ่าน API กลาง — มี audit/guard) → ใช้กับทุกบรรทัดของใบนั้น
  const saveEta = async () => {
    if (!etaEdit) return;
    setEtaSaving(true);
    try {
      const res = await apiFetch(`/api/master-v2/purchase-orders-v2/${etaEdit.po_id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_date: etaEdit.value || null, actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(`บันทึกวันคาดการณ์ของเข้า — ${etaEdit.po_no} แล้ว`);
      setEtaEdit(null);
      await loadPending();
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setEtaSaving(false); }
  };

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
      <div className="p-6 max-w-7xl mx-auto">
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
          <div>
            {/* แถบเครื่องมือ: ค้นหา / เรียงลำดับ / การ์ด-แถว / สลับมุมมอง */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-700">สินค้าที่รอเข้า ({pend.length})</span>
              <input value={pendQ} onChange={(e) => setPendQ(e.target.value)} placeholder="🔎 ค้นหา ชื่อ / รหัส / PO / ร้าน..."
                className="ml-auto w-64 h-9 px-3 text-sm border border-slate-200 rounded-md" />
              <label className="flex items-center gap-1.5 text-xs text-slate-500">เรียงตาม
                <select value={pendSort} onChange={(e) => changePendSort(e.target.value as PendSort)} className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
                  <option value="eta">วันคาดการณ์ของเข้า</option>
                  <option value="order">วันที่สั่ง</option>
                  <option value="name">ชื่อสินค้า</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">จัดกลุ่ม
                <select value={pendGroup} onChange={(e) => changePendGroup(e.target.value as PendGroup)} className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
                  <option value="none">ไม่จัดกลุ่ม</option>
                  <option value="shop">ร้าน</option>
                  <option value="eta">วันคาดการณ์ของเข้า</option>
                  <option value="po">ใบสั่งซื้อ (PO)</option>
                </select>
              </label>
              {pendView === "card" && (
                <label className="flex items-center gap-1.5 text-xs text-slate-500">การ์ด/แถว
                  <select value={pendCols} onChange={(e) => changePendCols(Number(e.target.value))} className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">{COL_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}</select>
                </label>
              )}
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                <button onClick={() => changePendView("card")} className={`h-9 px-3 ${pendView === "card" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>▦ การ์ด</button>
                <button onClick={() => changePendView("table")} className={`h-9 px-3 border-l border-slate-200 ${pendView === "table" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>▤ ตาราง</button>
              </div>
            </div>

            {pendLoading ? (
              <div className="py-16 text-center text-slate-400 text-sm">กำลังโหลด…</div>
            ) : pend.length === 0 ? (
              <div className="py-16 text-center text-slate-300 text-sm">— ไม่มีสินค้าค้างรับ —</div>
            ) : shownPend.length === 0 ? (
              <div className="py-16 text-center text-slate-300 text-sm">— ไม่พบรายการที่ค้นหา —</div>
            ) : pendView === "card" ? (
              /* มุมมองการ์ด — แตะการ์ดเพื่อกรอกจำนวนใน popup */
              <div className="space-y-5">
                {groupedPend.map((g) => (
                  <section key={g.key}>
                    {g.label && <h3 className="text-sm font-semibold text-slate-700 mb-2">{g.label} <span className="text-xs font-normal text-slate-400">({g.items.length})</span></h3>}
                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${pendCols}, minmax(0, 1fr))` }}>
                      {g.items.map((it) => {
                        const inp = pendInputs[it.id] ?? { recv: "0", def: "0" };
                        const recv = num(inp.recv), def = num(inp.def);
                        const hasQty = recv > 0 || def > 0;
                        const short = recv > 0 && recv < it.remaining;
                        const b = etaBadge(it.days_remaining);
                        return (
                          <div key={it.id} onClick={() => setQtyEdit(it)}
                            className={`bg-white border rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all ${hasQty ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200 hover:border-blue-300 hover:shadow-sm"}`}>
                            <div className="aspect-square bg-slate-50 flex items-center justify-center relative">
                              <span className={`absolute top-1.5 left-1.5 z-10 text-[10px] px-1.5 py-0.5 rounded border ${b.cls}`}>{b.text}</span>
                              {it.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-3xl">📦</span>}
                            </div>
                            <div className="p-2.5 flex flex-col flex-1">
                              <div className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug" title={it.item_name}>{stripCode(it.item_name)}</div>
                              {it.code && <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded mt-0.5 max-w-full truncate">{it.code}</div>}
                              <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums leading-none">{it.remaining.toLocaleString()} <span className="text-xs font-normal text-slate-400">{it.uom}</span></div>
                              <div className="text-[11px] text-slate-400">คงเหลือรอรับ</div>
                              <div className="text-[11px] text-slate-500 mt-1 truncate" title={`${it.seller_name} · ${it.po_no}`}>🏪 {it.seller_name} · {it.po_no}</div>
                              <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                                <div>📅 สั่ง: {it.order_date ? formatDate(it.order_date) : "—"}</div>
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span>🚚 คาดเข้า: {it.expected_date ? formatDate(it.expected_date) : <span className="text-slate-300">ยังไม่ระบุ</span>}</span>
                                  {it.expected_source === "lead" && <span title="ประเมินจากลีดไทม์ร้าน (แก้ได้)" className="text-[10px] text-indigo-500">~ลีดไทม์</span>}
                                  <button onClick={(e) => { e.stopPropagation(); setEtaEdit({ po_id: it.po_id, po_no: it.po_no, seller_name: it.seller_name, value: it.expected_source === "po" ? (it.expected_date ?? "") : "" }); }}
                                    title="แก้วันคาดการณ์ของเข้า (ใช้กับทั้งใบ PO)" className="text-slate-400 hover:text-blue-600 text-xs">✎</button>
                                </div>
                              </div>
                              {/* สรุปจำนวนที่จะรับ (กรอกใน popup) */}
                              <div className={`mt-2 h-8 px-2 text-xs font-medium rounded-md flex items-center justify-center ${hasQty ? (short ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-blue-100 text-blue-700 border border-blue-200") : "bg-slate-50 text-slate-400 border border-slate-200"}`}>
                                {hasQty ? <>✓ รับ {recv.toLocaleString()} {it.uom}{def > 0 ? ` · เสีย ${def.toLocaleString()}` : ""}{short ? " (ไม่ครบ)" : ""}</> : "แตะเพื่อกรอกจำนวน"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              /* มุมมองตาราง */
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr>
                        <th className="px-3 py-2 font-medium w-14">รูป</th>
                        <th className="text-left px-3 py-2 font-medium">สินค้า</th>
                        <th className="text-left px-3 py-2 font-medium">ร้าน / PO</th>
                        <th className="text-left px-3 py-2 font-medium">วันที่สั่ง</th>
                        <th className="text-left px-3 py-2 font-medium">คาดเข้า</th>
                        <th className="text-right px-3 py-2 font-medium">คงเหลือ</th>
                        <th className="px-3 py-2 font-medium">รับครั้งนี้</th>
                        <th className="px-3 py-2 font-medium">เสีย/ผิด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {groupedPend.map((g) => (
                        <Fragment key={g.key}>
                          {g.label && <tr className="bg-slate-50/70"><td colSpan={8} className="px-3 py-1.5 text-xs font-semibold text-slate-600">{g.label} <span className="font-normal text-slate-400">({g.items.length})</span></td></tr>}
                          {g.items.map((it) => {
                        const inp = pendInputs[it.id] ?? { recv: "0", def: "0" };
                        const short = num(inp.recv) > 0 && num(inp.recv) < it.remaining;
                        const b = etaBadge(it.days_remaining);
                        return (
                          <tr key={it.id}>
                            <td className="px-3 py-2">
                              <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100">
                                {it.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2"><div className="text-slate-700">{stripCode(it.item_name)}</div>{it.code && <div className="text-[11px] font-mono text-slate-400">{it.code}</div>}</td>
                            <td className="px-3 py-2 text-slate-500"><div className="text-slate-700">{it.seller_name}</div><div className="text-[11px] text-slate-400">{it.po_no}</div></td>
                            <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{it.order_date ? formatDate(it.order_date) : "—"}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="text-xs text-slate-500">{it.expected_date ? formatDate(it.expected_date) : <span className="text-slate-300">ยังไม่ระบุ</span>}{it.expected_source === "lead" && <span className="text-[10px] text-indigo-500 ml-1">~ลีดไทม์</span>}</div>
                              <div className="flex items-center gap-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${b.cls}`}>{b.text}</span>
                                <button onClick={() => setEtaEdit({ po_id: it.po_id, po_no: it.po_no, seller_name: it.seller_name, value: it.expected_source === "po" ? (it.expected_date ?? "") : "" })}
                                  title="แก้วันคาดการณ์ของเข้า (ใช้กับทั้งใบ PO)" className="text-slate-400 hover:text-blue-600 text-xs">✎</button>
                              </div>
                            </td>
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
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* แถบบันทึก (โชว์เมื่อมีรายการ) */}
            {shownPend.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 mt-4 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs text-slate-400">บรรทัดที่รับไม่ครบจะตั้งเป็น &quot;รอของ&quot; อัตโนมัติ</span>
                <button onClick={savePending} disabled={saving || !attachReady} title={!attachReady ? "แนบใบรับของ + บิลก่อน" : ""}
                  className="h-10 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                  {saving ? "กำลังบันทึก…" : "บันทึกรับสินค้า →"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* popup กรอกจำนวนรับ (คลิกจากการ์ด) */}
      {qtyEdit && (() => {
        const it = qtyEdit;
        const inp = pendInputs[it.id] ?? { recv: "0", def: "0" };
        const recv = num(inp.recv), def = num(inp.def);
        const short = recv > 0 && recv < it.remaining;
        const over = recv > it.remaining;
        return (
          <ERPModal open onClose={() => setQtyEdit(null)} size="sm" storageKey="recv-qty"
            title="กรอกจำนวนที่รับ"
            description={`🏪 ${it.seller_name} · ${it.po_no}`}
            footer={<>
              <button onClick={() => { setPendInput(it.id, { recv: "0", def: "0" }); setQtyEdit(null); }} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ล้าง (ไม่รับ)</button>
              <button onClick={() => setQtyEdit(null)} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">ตกลง</button>
            </>}>
            <div className="flex gap-3">
              <div className="w-20 h-20 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 shrink-0">
                {it.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-2xl">📦</span>}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 leading-snug">{stripCode(it.item_name)}</div>
                {it.code && <div className="text-[11px] font-mono text-slate-500 mt-0.5">{it.code}</div>}
                <div className="text-sm text-slate-600 mt-1">คงเหลือรอรับ <b className="text-slate-900">{it.remaining.toLocaleString()}</b> {it.uom}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">รับครั้งนี้ ({it.uom})</label>
                <input type="number" step="any" min={0} autoFocus value={inp.recv} onChange={(e) => setPendInput(it.id, { recv: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  className={`w-full h-11 px-3 text-lg text-right border rounded-md ${short || over ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">เสีย / ผิด ({it.uom})</label>
                <input type="number" step="any" min={0} value={inp.def} onChange={(e) => setPendInput(it.id, { def: e.target.value })}
                  className="w-full h-11 px-3 text-lg text-right border border-slate-200 rounded-md" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => setPendInput(it.id, { recv: String(it.remaining) })} className="h-8 px-3 text-xs font-medium rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">รับครบ ({it.remaining.toLocaleString()})</button>
              {short && <span className="text-[11px] text-amber-600">รับไม่ครบ → ส่วนที่เหลือจะตั้งเป็น &quot;รอของ&quot;</span>}
              {over && <span className="text-[11px] text-amber-600">รับเกินจำนวนคงเหลือ</span>}
            </div>
          </ERPModal>
        );
      })()}

      {/* popup แก้วันคาดการณ์ของเข้า (ใช้กับทั้งใบ PO) */}
      {etaEdit && (
        <ERPModal open onClose={() => !etaSaving && setEtaEdit(null)} size="sm" storageKey="recv-eta"
          title="📅 วันคาดการณ์ของเข้า"
          description={`ใบสั่งซื้อ ${etaEdit.po_no} · ${etaEdit.seller_name} (มีผลกับทุกบรรทัดในใบนี้)`}
          footer={<>
            <button onClick={() => setEtaEdit(null)} disabled={etaSaving} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={() => void saveEta()} disabled={etaSaving} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{etaSaving ? "กำลังบันทึก…" : "บันทึก"}</button>
          </>}>
          <label className="block text-xs font-medium text-slate-600 mb-1">วันที่คาดว่าของจะเข้า</label>
          <input type="date" value={etaEdit.value} onChange={(e) => setEtaEdit((p) => p ? { ...p, value: e.target.value } : p)}
            className="w-full h-10 px-3 text-sm border border-slate-200 rounded-md" />
          <p className="text-[11px] text-slate-400 mt-2">เว้นว่างไว้ = กลับไปใช้ค่าประเมินจากลีดไทม์ร้าน (ถ้ามี)</p>
        </ERPModal>
      )}

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
