"use client";

/**
 * แอปเดี่ยว (standalone) "โอนเงินจีน" — mobile-first สำหรับมือถือ/iPad
 * เปิดผ่าน /app/china-pay · เห็นแค่โมดูลนี้ ไม่มี sidebar/โมดูลอื่น
 * reuse data layer กลาง: /api/master-v2/china-bills + RelationPicker + FileInput + toast
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { FileMultiInput } from "@/components/file-multi-input";

const SUPPLIER_CFG: RelationConfig = {
  target_table: "partners_v2", target_module_key: "partners-v2",
  target_label_field: "name_th", target_search_fields: ["name_th", "name_en"], allow_create: false,
  filter: { column: "shop_country", value: "จีน" },   // โชว์เฉพาะร้านจีน
} as RelationConfig;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 4 });
const today = () => new Date().toISOString().slice(0, 10);

// ค่าโอน (¥) ตามชั้นยอด
const FEE_TABLE = [
  { label: "1 – 4,999", fee: 3 }, { label: "5,000 – 9,999", fee: 5 },
  { label: "10,000 – 29,999", fee: 10 }, { label: "30,000 – 49,999", fee: 30 },
  { label: "50,000 ขึ้นไป", fee: 50 },
];
function feeFor(amt: number): number {
  if (amt <= 0) return 0;
  if (amt <= 4999) return 3;
  if (amt <= 9999) return 5;
  if (amt <= 29999) return 10;
  if (amt <= 49999) return 30;
  return 50;
}
// เรทตามชั้นยอด — กรอกแค่ R1, R2-R4 = R1 ลบส่วนต่างคงที่
const RATE_OFFSET = { r2: 0.035, r3: 0.075, r4: 0.08 };
const RATE_TABLE = [
  { tier: "R1", label: "1 – 5,000", off: 0 }, { tier: "R2", label: "5,001 – 99,999", off: RATE_OFFSET.r2 },
  { tier: "R3", label: "100,000 – 399,999", off: RATE_OFFSET.r3 }, { tier: "R4", label: "400,000 ขึ้นไป", off: RATE_OFFSET.r4 },
];
function rateFor(amt: number, r1: number): number {
  if (!r1) return 0;
  if (amt <= 5000) return r1;
  if (amt <= 99999) return +(r1 - RATE_OFFSET.r2).toFixed(4);
  if (amt <= 399999) return +(r1 - RATE_OFFSET.r3).toFixed(4);
  return +(r1 - RATE_OFFSET.r4).toFixed(4);
}
function rateTier(amt: number): string {
  if (amt <= 5000) return "R1"; if (amt <= 99999) return "R2"; if (amt <= 399999) return "R3"; return "R4";
}

type Tab = "bill" | "pending" | "all" | "rate";

const STATUS_STYLE: Record<string, string> = {
  "รอโอน": "bg-amber-100 text-amber-700", "โอนแล้ว": "bg-emerald-100 text-emerald-700", "ยกเลิก": "bg-slate-100 text-slate-500",
};

export default function ChinaPayApp() {
  const { user, ready } = useAuth();
  const [tab, setTab] = useState<Tab>("bill");

  if (!ready) return <Center>กำลังโหลด…</Center>;
  if (!user) return (
    <Center>
      <div className="text-slate-500 mb-3">กรุณาเข้าสู่ระบบก่อนใช้งาน</div>
      <Link href="/login?next=/app/china-pay" className="h-10 px-5 leading-10 bg-blue-600 text-white rounded-lg font-medium">เข้าสู่ระบบ</Link>
    </Center>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-sm">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-gradient-to-r from-rose-600 to-orange-500 text-white px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-lg">💸 โอนเงินจีน</div>
          <div className="text-xs opacity-90">{user.name}</div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 pb-24">
          {tab === "bill" && <BillForm />}
          {tab === "pending" && <PendingList />}
          {tab === "all" && <AllList />}
          {tab === "rate" && <RateTab />}
        </main>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-200 grid grid-cols-4 z-20">
          {([
            { k: "bill", icon: "💴", label: "ลงบิล" },
            { k: "pending", icon: "⏳", label: "รอโอน" },
            { k: "all", icon: "📋", label: "ทั้งหมด" },
            { k: "rate", icon: "💱", label: "เรท" },
          ] as { k: Tab; icon: string; label: string }[]).map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`py-2.5 flex flex-col items-center gap-0.5 text-xs ${tab === t.k ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
              <span className="text-xl">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">{children}</div>;
}

// ---------------- ลงบิล ----------------
function BillForm() {
  const toast = useToast();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [sup, setSup] = useState<Record<string, unknown> | null>(null);
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [rate, setRate] = useState("");
  const [r1, setR1] = useState(0);              // เรทฐาน R1 ของวัน
  const [transferDate, setTransferDate] = useState(today());
  const [files, setFiles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [feeInfo, setFeeInfo] = useState(false);
  const [rateInfo, setRateInfo] = useState(false);
  const [ratePopup, setRatePopup] = useState(false);

  // ดึง R1 ล่าสุด
  const loadR1 = useCallback(() => {
    apiFetch("/api/master-v2/daily-rates?limit=1&sort_by=rate_date&sort_dir=desc")
      .then(r => r.json()).then(j => { const r0 = (j.data ?? [])[0]; setR1(num(r0?.rate)); }).catch(() => {});
  }, []);
  useEffect(() => { loadR1(); }, [loadR1]);

  // auto: ค่าโอน + เรท ตามยอด (แก้มือทับได้)
  useEffect(() => {
    const a = num(amount);
    setFee(a > 0 ? String(feeFor(a)) : "");
    setRate(a > 0 && r1 ? String(rateFor(a, r1)) : (r1 ? String(r1) : ""));
  }, [amount, r1]);

  // ดึงข้อมูลร้านเมื่อเลือก
  useEffect(() => {
    if (!supplierId) { setSup(null); return; }
    apiFetch(`/api/master-v2/partners/${supplierId}`).then(r => r.json()).then(j => setSup(j.data ?? null)).catch(() => setSup(null));
  }, [supplierId]);

  const totalRmb = num(amount) + num(fee);
  const thb = totalRmb * num(rate);

  const save = async () => {
    if (!supplierId) { toast.error("เลือกร้านค้าก่อน"); return; }
    if (num(amount) <= 0) { toast.error("กรอกยอดรวม (¥)"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/china-bills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId, amount_rmb: num(amount), fee_rmb: num(fee),
          rate: num(rate) || null, transfer_date: transferDate || null,
          attachments: files, status: "รอโอน", actor: "china-app",
        }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("บันทึกบิลแล้ว");
      // reset
      setSupplierId(null); setSup(null); setAmount(""); setFee(""); setTransferDate(today());
      setFiles([]);
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <Label>ร้านค้า (จีน)</Label>
        <RelationPicker value={supplierId} onChange={(id) => setSupplierId(id)} config={SUPPLIER_CFG} />
        {sup && (
          <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
            {!!sup.name_en && <div className="text-slate-700 font-medium">{String(sup.name_en)}</div>}
            <Row label="ธนาคาร" v={sup.bank_name_brief} />
            <Row label="เลขบัญชี" v={sup.account_number} />
            <Row label="ชื่อบัญชี" v={sup.bank_account_name} />
            <Row label="โทร" v={sup.phone} />
          </div>
        )}
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>ยอดรวม (¥)</Label><Num value={amount} onChange={setAmount} /></div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-500">ค่าโอน (¥)</span>
              <button type="button" onClick={() => setFeeInfo(v => !v)} className="text-[11px] text-blue-500">ⓘ ตาราง</button>
            </div>
            <Num value={fee} onChange={setFee} />
          </div>
        </div>
        {feeInfo && (
          <div className="mt-2 rounded-lg bg-pink-50 border border-pink-200 p-3 text-xs">
            <div className="font-semibold text-slate-700 mb-1">ค่าธรรมเนียมการโอน</div>
            {FEE_TABLE.map(t => <div key={t.label} className="flex justify-between"><span className="text-slate-500">{t.label}</span><span className="text-slate-700">{t.fee} หยวน</span></div>)}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-500">เรท {amount && r1 ? <span className="text-slate-400">(ชั้น {rateTier(num(amount))})</span> : null}</span>
              <span className="flex gap-2">
                <button type="button" onClick={() => setRateInfo(v => !v)} className="text-[11px] text-blue-500">ⓘ</button>
                <button type="button" onClick={() => setRatePopup(true)} className="text-[11px] text-rose-600 font-medium">ตั้งเรท</button>
              </span>
            </div>
            <Num value={rate} onChange={setRate} />
          </div>
          <div><Label>วันที่โอน</Label>
            <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)}
              className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
        </div>
        {rateInfo && (
          <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs">
            <div className="font-semibold text-slate-700 mb-1">เรตตามชั้นยอด {r1 ? `(R1 = ${fmt(r1)})` : "(ยังไม่ตั้ง R1)"}</div>
            {RATE_TABLE.map(t => <div key={t.tier} className="flex justify-between"><span className="text-slate-500">{t.tier} · {t.label}</span><span className="text-slate-700">{r1 ? fmt(+(r1 - t.off).toFixed(4)) : "—"}</span></div>)}
          </div>
        )}
        {/* สรุปยอด */}
        <div className="mt-3 rounded-lg bg-rose-50 border border-rose-100 p-3 flex justify-between items-center">
          <div className="text-sm text-slate-600">ยอดโอนรวม <b className="text-slate-800">¥{fmt(totalRmb)}</b></div>
          <div className="text-right"><div className="text-[11px] text-slate-400">เป็นเงินบาท</div><div className="text-lg font-bold text-rose-600">฿{fmt(thb)}</div></div>
        </div>
      </Card>

      <Card>
        <FileMultiInput label="📎 ไฟล์แนบ (ใบรับ/บิล, สลิป WeChat ฯลฯ)" value={files} onChange={setFiles} folder="china-bills" />
      </Card>

      <button onClick={save} disabled={saving}
        className="w-full h-12 bg-rose-600 text-white rounded-xl font-semibold text-base disabled:opacity-50 active:scale-[0.99] transition-transform">
        {saving ? "กำลังบันทึก…" : "บันทึกบิล"}
      </button>

      {ratePopup && (
        <RatePopup current={r1} onClose={() => setRatePopup(false)} onSaved={(v) => { setR1(v); setRatePopup(false); }} />
      )}
    </div>
  );
}

// popup ตั้งเรท R1 ของวัน (โชว์ R1-R4 ที่คำนวณ)
function RatePopup({ current, onClose, onSaved }: { current: number; onClose: () => void; onSaved: (r1: number) => void }) {
  const toast = useToast();
  const [val, setVal] = useState(current ? String(current) : "");
  const [saving, setSaving] = useState(false);
  const r1 = num(val);
  const save = async () => {
    if (r1 <= 0) { toast.error("กรอกเรท R1"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/daily-rates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_date: today(), rate: r1, actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("ตั้งเรทแล้ว"); onSaved(r1);
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="text-lg font-semibold text-slate-800 mb-1">ตั้งเรทของวันนี้</div>
        <div className="text-xs text-slate-400 mb-3">{today()} · กรอกแค่ R1 — R2-R4 คำนวณให้</div>
        <Label>เรท R1 (1 – 5,000 ¥)</Label>
        <Num value={val} onChange={setVal} placeholder="เช่น 4.97" />
        <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs space-y-1">
          {RATE_TABLE.map(t => <div key={t.tier} className="flex justify-between"><span className="text-slate-500">{t.tier} · {t.label}</span><span className="font-medium text-slate-700">{r1 ? fmt(+(r1 - t.off).toFixed(4)) : "—"}</span></div>)}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} disabled={saving} className="flex-1 h-11 border border-slate-200 rounded-lg text-slate-700">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="flex-1 h-11 bg-rose-600 text-white rounded-lg font-medium disabled:opacity-50">{saving ? "…" : "บันทึกเรท"}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- บิลรอโอน ----------------
function PendingList() {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [confirm, setConfirm] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const flt = encodeURIComponent(JSON.stringify({ status: { type: "text", value: "รอโอน" } }));
    apiFetch(`/api/master-v2/china-bills?limit=100&filters=${flt}&sort_by=bill_date&sort_dir=desc`)
      .then(r => r.json()).then(j => setRows(j.data ?? [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => rows.reduce((a, r) => a + (num(r.amount_rmb) + num(r.fee_rmb)), 0), [rows]);

  const markDone = async (id: string) => {
    setBusy(id); setConfirm(null);
    try {
      const res = await apiFetch(`/api/master-v2/china-bills/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "โอนแล้ว", actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("ทำเครื่องหมายโอนแล้ว");
      setRows(p => p.filter(r => String(r.id) !== id));
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  const onPrinted = (id: string, at: string) =>
    setRows(p => p.map(r => String(r.id) === id ? { ...r, printed_at: at } : r));

  if (loading) return <div className="text-center text-slate-400 py-10">กำลังโหลด…</div>;
  if (rows.length === 0) return <div className="text-center text-slate-300 py-10">— ไม่มีบิลรอโอน —</div>;

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white border border-slate-200 p-3 flex justify-between items-center">
        <span className="text-sm text-slate-500">รอโอน {rows.length} บิล</span>
        <span className="font-bold text-rose-600">¥{fmt(total)}</span>
      </div>
      {rows.map((r) => (
        <Card key={String(r.id)}>
          <button onClick={() => setDetail(r)} className="w-full text-left flex justify-between items-start gap-2">
            <div className="min-w-0">
              <div className="font-medium text-slate-800 truncate">{String(r.supplier_label ?? r.supplier_id ?? "—")}</div>
              <div className="text-xs text-slate-400">วันที่โอน {String(r.transfer_date ?? "—")}</div>
              {r.printed_at ? <PrintedBadge /> : null}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-semibold text-slate-800">¥{fmt(num(r.amount_rmb) + num(r.fee_rmb))}</div>
              <div className="text-xs text-rose-600">฿{fmt((num(r.amount_rmb) + num(r.fee_rmb)) * num(r.rate))}</div>
            </div>
          </button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => setReport(r)}
              className="h-10 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">🖨️ พิมพ์</button>
            <button onClick={() => setConfirm(r)} disabled={busy === String(r.id)}
              className="h-10 border border-emerald-300 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-50 disabled:opacity-50">
              {busy === String(r.id) ? "…" : "✓ โอนแล้ว"}
            </button>
          </div>
        </Card>
      ))}
      {detail && <BillDetail bill={detail} onClose={() => setDetail(null)} onPrinted={onPrinted} />}
      {confirm && (
        <ConfirmPopup
          title="ยืนยันว่าโอนแล้ว?"
          message={`${String(confirm.supplier_label ?? confirm.supplier_id ?? "บิลนี้")} · ¥${fmt(num(confirm.amount_rmb) + num(confirm.fee_rmb))}`}
          confirmText="ยืนยัน โอนแล้ว" tone="emerald"
          onCancel={() => setConfirm(null)} onConfirm={() => markDone(String(confirm.id))}
        />
      )}
      {report && <ReportPopup bill={report} onClose={() => setReport(null)} onPrinted={onPrinted} />}
    </div>
  );
}

// ---------------- รายการทั้งหมด ----------------
const ALL_FILTERS = ["ทั้งหมด", "รอโอน", "โอนแล้ว", "ยกเลิก"] as const;
function AllList() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ทั้งหมด");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const onPrinted = (id: string, at: string) =>
    setRows(p => p.map(r => String(r.id) === id ? { ...r, printed_at: at } : r));

  useEffect(() => {
    setLoading(true);
    let url = "/api/master-v2/china-bills?limit=200&sort_by=bill_date&sort_dir=desc";
    if (filter !== "ทั้งหมด") {
      const flt = encodeURIComponent(JSON.stringify({ status: { type: "text", value: filter } }));
      url += `&filters=${flt}`;
    }
    apiFetch(url).then(r => r.json()).then(j => setRows(j.data ?? [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="space-y-3">
      {/* ตัวกรองสถานะ */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {ALL_FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-shrink-0 h-8 px-3 rounded-full text-sm border ${filter === f ? "bg-rose-600 text-white border-rose-600 font-medium" : "bg-white text-slate-500 border-slate-200"}`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-10">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-slate-300 py-10">— ไม่มีรายการ —</div>
      ) : (
        rows.map((r) => {
          const st = String(r.status ?? "—");
          return (
            <Card key={String(r.id)}>
              <button onClick={() => setDetail(r)} className="w-full text-left flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">{String(r.supplier_label ?? r.supplier_id ?? "—")}</div>
                  <div className="text-xs text-slate-400">{String(r.transfer_date ?? r.bill_date ?? "—")}</div>
                  {r.printed_at ? <PrintedBadge /> : null}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-semibold text-slate-800">¥{fmt(num(r.amount_rmb) + num(r.fee_rmb))}</div>
                  <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[st] ?? "bg-slate-100 text-slate-500"}`}>{st}</span>
                </div>
              </button>
            </Card>
          );
        })
      )}
      {detail && <BillDetail bill={detail} onClose={() => setDetail(null)} onPrinted={onPrinted} />}
    </div>
  );
}

// ---------------- รายละเอียดบิล (ดูอย่างเดียว) ----------------
function BillDetail({ bill, onClose, onPrinted }: { bill: Record<string, unknown>; onClose: () => void; onPrinted?: (id: string, at: string) => void }) {
  const [sup, setSup] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState(false);
  const supplierId = bill.supplier_id ? String(bill.supplier_id) : null;
  useEffect(() => {
    if (!supplierId) return;
    apiFetch(`/api/master-v2/partners/${supplierId}`).then(r => r.json()).then(j => setSup(j.data ?? null)).catch(() => setSup(null));
  }, [supplierId]);

  const amount = num(bill.amount_rmb), fee = num(bill.fee_rmb), totalRmb = amount + fee, rate = num(bill.rate);
  const thb = totalRmb * rate;
  const st = String(bill.status ?? "—");
  const r2Url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
  // ไฟล์แนบใหม่ (array) + รวมไฟล์เก่า bill_image/wechat_image ของบิลเดิม
  const atts = Array.isArray(bill.attachments) ? (bill.attachments as unknown[]).map(String) : [];
  const legacy = [bill.bill_image, bill.wechat_image].filter(Boolean).map(String);
  const allFiles = [...atts, ...legacy.filter((k) => !atts.includes(k))];
  const isPdf = (k: string) => k.toLowerCase().endsWith(".pdf");

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-slate-800">รายละเอียดบิล</div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[st] ?? "bg-slate-100 text-slate-500"}`}>{st}</span>
            <button onClick={onClose} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* ร้านค้า + ธนาคาร */}
          <div>
            <div className="font-medium text-slate-800">{String(bill.supplier_label ?? sup?.name_th ?? bill.supplier_id ?? "—")}</div>
            {!!sup?.name_en && <div className="text-sm text-slate-500">{String(sup.name_en)}</div>}
            <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
              <Row label="ธนาคาร" v={sup?.bank_name_brief} />
              <Row label="เลขบัญชี" v={sup?.account_number} />
              <Row label="ชื่อบัญชี" v={sup?.bank_account_name} />
              <Row label="โทร" v={sup?.phone} />
            </div>
          </div>

          {/* ยอดเงิน */}
          <div className="rounded-lg bg-rose-50 border border-rose-100 p-3 text-sm space-y-1">
            <Row label="ยอด (¥)" v={fmt(amount)} />
            <Row label="ค่าโอน (¥)" v={fmt(fee)} />
            <div className="flex justify-between border-t border-rose-200/60 pt-1 mt-1"><span className="text-slate-500">ยอดโอนรวม</span><span className="font-semibold text-slate-800">¥{fmt(totalRmb)}</span></div>
            <Row label="เรท" v={rate ? fmt(rate) : "—"} />
            <div className="flex justify-between"><span className="text-slate-500">เป็นเงินบาท</span><span className="font-bold text-rose-600">฿{fmt(thb)}</span></div>
          </div>

          {/* วันที่ */}
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
            <Row label="วันที่โอน" v={bill.transfer_date} />
            <Row label="วันที่ลงบิล" v={bill.bill_date} />
            {bill.printed_at ? <Row label="พิมพ์เมื่อ" v={String(bill.printed_at).slice(0, 16).replace("T", " ")} /> : null}
          </div>

          {/* ปุ่มพิมพ์/ใบสรุป */}
          <button onClick={() => setReport(true)}
            className="w-full h-11 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
            🖨️ พิมพ์ / ใบสรุป
          </button>

          {/* แนบไฟล์ */}
          {allFiles.length > 0 && (
            <div>
              <Label>ไฟล์แนบ ({allFiles.length})</Label>
              <div className="grid grid-cols-3 gap-2">
                {allFiles.map((k) => (
                  <a key={k} href={r2Url(k)} target="_blank" rel="noreferrer"
                    className="block rounded-md border border-slate-200 overflow-hidden bg-slate-50">
                    {isPdf(k) ? (
                      <div className="flex flex-col items-center justify-center h-24 text-slate-600">
                        <span className="text-3xl">📄</span>
                        <span className="text-[10px] truncate w-full px-1 text-center">{k.split("/").pop()}</span>
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={r2Url(k)} alt="" className="w-full h-24 object-cover" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {report && <ReportPopup bill={{ ...bill, _sup: sup }} onClose={() => setReport(false)} onPrinted={onPrinted} />}
    </div>
  );
}

// ---------------- เรท ----------------
function RateTab() {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [date, setDate] = useState(today());
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiFetch("/api/master-v2/daily-rates?limit=20&sort_by=rate_date&sort_dir=desc")
      .then(r => r.json()).then(j => setRows(j.data ?? [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (num(rate) <= 0) { toast.error("กรอกเรท"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/daily-rates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_date: date, rate: num(rate), actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("บันทึกเรทแล้ว"); setRate(""); load();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <Label>เพิ่มเรท R1 ของวัน (กรอกแค่ R1 — R2-R4 คำนวณให้)</Label>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" />
          <Num value={rate} onChange={setRate} placeholder="R1 เช่น 4.97" />
        </div>
        {num(rate) > 0 && (
          <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs space-y-1">
            {RATE_TABLE.map(t => <div key={t.tier} className="flex justify-between"><span className="text-slate-500">{t.tier} · {t.label}</span><span className="font-medium text-slate-700">{fmt(+(num(rate) - t.off).toFixed(4))}</span></div>)}
          </div>
        )}
        <button onClick={save} disabled={saving} className="mt-3 w-full h-11 bg-rose-600 text-white rounded-lg font-medium disabled:opacity-50">
          {saving ? "กำลังบันทึก…" : "บันทึกเรท"}
        </button>
      </Card>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={String(r.id)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex justify-between text-sm">
            <span className="text-slate-500">{String(r.rate_date)}</span>
            <span className="text-slate-700">R1 <b>{fmt(num(r.rate))}</b> <span className="text-slate-400">· R4 {fmt(+(num(r.rate) - RATE_OFFSET.r4).toFixed(4))}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- ป้าย "พิมพ์แล้ว" ----------------
function PrintedBadge() {
  return <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">🖨️ พิมพ์แล้ว</span>;
}

// ---------------- Popup ยืนยัน (ของกลางเล็กๆ) ----------------
function ConfirmPopup({ title, message, confirmText = "ยืนยัน", tone = "rose", onCancel, onConfirm }: {
  title: string; message?: string; confirmText?: string; tone?: "rose" | "emerald"; onCancel: () => void; onConfirm: () => void;
}) {
  const btn = tone === "emerald" ? "bg-emerald-600" : "bg-rose-600";
  return (
    <div className="fixed inset-0 z-[210] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-xs p-5 text-center" onClick={e => e.stopPropagation()}>
        <div className="text-lg font-semibold text-slate-800">{title}</div>
        {message && <div className="mt-1 text-sm text-slate-500">{message}</div>}
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 h-11 border border-slate-200 rounded-lg text-slate-700">ยกเลิก</button>
          <button onClick={onConfirm} className={`flex-1 h-11 ${btn} text-white rounded-lg font-medium`}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- ใบสรุป (report) → บันทึกรูป / ส่ง LINE ----------------
function ReportPopup({ bill, onClose, onPrinted }: {
  bill: Record<string, unknown>; onClose: () => void; onPrinted?: (id: string, at: string) => void;
}) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sup, setSup] = useState<Record<string, unknown> | null>((bill._sup as Record<string, unknown>) ?? null);
  const [busy, setBusy] = useState(false);

  const supplierId = bill.supplier_id ? String(bill.supplier_id) : null;
  useEffect(() => {
    if (sup || !supplierId) return;
    apiFetch(`/api/master-v2/partners/${supplierId}`).then(r => r.json()).then(j => setSup(j.data ?? null)).catch(() => {});
  }, [supplierId, sup]);

  const amount = num(bill.amount_rmb), fee = num(bill.fee_rmb), totalRmb = amount + fee, rate = num(bill.rate);
  const thb = totalRmb * rate;
  const supName = String(bill.supplier_label ?? sup?.name_th ?? bill.supplier_id ?? "—");

  // วาดใบสรุปลง canvas
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    type Line = { l: string; r: string; bold?: boolean; color?: string; big?: boolean; sep?: boolean };
    const lines: Line[] = [
      { l: "ร้านค้า", r: supName, bold: true },
      ...(sup?.name_en ? [{ l: "", r: String(sup.name_en) } as Line] : []),
      { l: "ธนาคาร", r: sup?.bank_name_brief ? String(sup.bank_name_brief) : "—" },
      { l: "เลขบัญชี", r: sup?.account_number ? String(sup.account_number) : "—" },
      { l: "ชื่อบัญชี", r: sup?.bank_account_name ? String(sup.bank_account_name) : "—" },
      { l: "", r: "", sep: true },
      { l: "ยอด (¥)", r: fmt(amount) },
      { l: "ค่าโอน (¥)", r: fmt(fee) },
      { l: "ยอดโอนรวม", r: "¥" + fmt(totalRmb), bold: true },
      { l: "เรท", r: rate ? fmt(rate) : "—" },
      { l: "เป็นเงินบาท", r: "฿" + fmt(thb), bold: true, color: "#e11d48", big: true },
      { l: "", r: "", sep: true },
      { l: "วันที่โอน", r: String(bill.transfer_date ?? "—") },
      { l: "วันที่ลงบิล", r: String(bill.bill_date ?? "—") },
      { l: "สถานะ", r: String(bill.status ?? "—") },
    ];
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const W = 680, headerH = 104, rowH = 48, padX = 40, padTop = 28, padBottom = 36;
    const H = headerH + padTop + lines.length * rowH + padBottom;
    cv.width = W * DPR; cv.height = H * DPR;
    cv.style.width = "100%"; cv.style.height = "auto";
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.scale(DPR, DPR);
    const FONT = "'Noto Sans Thai', 'Sarabun', -apple-system, 'Segoe UI', sans-serif";

    // พื้นหลัง
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    // header gradient
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#e11d48"); grad.addColorStop(1, "#f97316");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = `bold 30px ${FONT}`; ctx.fillText("💸 ใบสรุปการโอนเงินจีน", padX, 44);
    ctx.font = `16px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(`พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")}`, padX, 78);

    // body
    let y = headerH + padTop + rowH / 2;
    for (const ln of lines) {
      if (ln.sep) {
        ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(W - padX, y); ctx.stroke();
        y += rowH; continue;
      }
      ctx.textAlign = "left"; ctx.fillStyle = "#64748b"; ctx.font = `18px ${FONT}`;
      if (ln.l) ctx.fillText(ln.l, padX, y);
      ctx.textAlign = "right";
      ctx.fillStyle = ln.color ?? "#1e293b";
      ctx.font = `${ln.bold ? "bold " : ""}${ln.big ? 26 : 19}px ${FONT}`;
      ctx.fillText(ln.r, W - padX, y);
      y += rowH;
    }
  }, [sup, supName, amount, fee, totalRmb, rate, thb, bill]);

  const filename = `china-bill-${supName}-${String(bill.transfer_date ?? today())}.png`.replace(/[\\/:*?"<>|]/g, "_");

  const markPrinted = async () => {
    const at = new Date().toISOString();
    try {
      await apiFetch(`/api/master-v2/china-bills/${String(bill.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printed_at: at, actor: "china-app" }),
      });
      onPrinted?.(String(bill.id), at);
    } catch { /* best-effort */ }
  };

  const getBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => { const cv = canvasRef.current; if (!cv) return resolve(null); cv.toBlob(resolve, "image/png"); });

  const saveImage = async () => {
    setBusy(true);
    try {
      const blob = await getBlob(); if (!blob) { toast.error("สร้างรูปไม่สำเร็จ"); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("บันทึกรูปแล้ว"); await markPrinted();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const shareImage = async () => {
    setBusy(true);
    try {
      const blob = await getBlob(); if (!blob) { toast.error("สร้างรูปไม่สำเร็จ"); return; }
      const file = new File([blob], filename, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "ใบสรุปการโอนเงินจีน", text: `${supName} · ฿${fmt(thb)}` });
        await markPrinted();
      } else {
        toast.error("อุปกรณ์นี้แชร์รูปไม่ได้ — ใช้ปุ่มบันทึกรูปแทน"); await saveImage();
      }
    } catch (e) {
      // ผู้ใช้กดยกเลิกแชร์ ไม่ต้องแจ้ง error
      if ((e as Error).name !== "AbortError") toast.error(String((e as Error).message ?? e));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[210] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-slate-800">ใบสรุป</div>
          <button onClick={onClose} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
        </div>
        <div className="p-4">
          <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
            <canvas ref={canvasRef} className="block w-full" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={saveImage} disabled={busy}
              className="h-12 border border-slate-300 text-slate-700 rounded-xl font-medium disabled:opacity-50">💾 บันทึกรูป</button>
            <button onClick={shareImage} disabled={busy}
              className="h-12 bg-rose-600 text-white rounded-xl font-medium disabled:opacity-50">📤 แชร์ / ส่ง LINE</button>
          </div>
          <div className="mt-2 text-center text-[11px] text-slate-400">เมื่อบันทึก/แชร์ ระบบจะทำเครื่องหมาย “พิมพ์แล้ว” ให้</div>
        </div>
      </div>
    </div>
  );
}

// ---------------- ชิ้นเล็ก ----------------
function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border border-slate-200 p-4">{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-slate-500 mb-1">{children}</div>;
}
function Num({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="number" inputMode="decimal" step="any" value={value} placeholder={placeholder}
    onChange={e => onChange(e.target.value)} className="w-full h-11 px-3 text-base text-right border border-slate-200 rounded-lg" />;
}
function Row({ label, v }: { label: string; v: unknown }) {
  if (v == null || v === "") return null;
  return <div className="flex justify-between"><span className="text-slate-400">{label}</span><span className="text-slate-700">{String(v)}</span></div>;
}
