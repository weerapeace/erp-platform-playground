"use client";

/**
 * แอปเดี่ยว (standalone) "โอนเงินจีน" — mobile-first สำหรับมือถือ/iPad
 * เปิดผ่าน /app/china-pay · เห็นแค่โมดูลนี้ ไม่มี sidebar/โมดูลอื่น
 * reuse data layer กลาง: /api/master-v2/china-bills + RelationPicker + FileInput + toast
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { FileInput } from "@/components/file-input";

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

type Tab = "bill" | "pending" | "rate";

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
          {tab === "rate" && <RateTab />}
        </main>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-200 grid grid-cols-3 z-20">
          {([
            { k: "bill", icon: "💴", label: "ลงบิล" },
            { k: "pending", icon: "⏳", label: "รอโอน" },
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
  const [wechat, setWechat] = useState<string | null>(null);
  const [bill, setBill] = useState<string | null>(null);
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
          wechat_image: wechat, bill_image: bill, status: "รอโอน", actor: "china-app",
        }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("บันทึกบิลแล้ว");
      // reset
      setSupplierId(null); setSup(null); setAmount(""); setFee(""); setTransferDate(today());
      setWechat(null); setBill(null);
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
        <div className="grid grid-cols-2 gap-3">
          <FileInput label="📄 ใบรับ/บิล" value={bill} onChange={setBill} folder="china-bills" />
          <FileInput label="💬 WeChat" value={wechat} onChange={setWechat} folder="china-bills" />
        </div>
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

  const load = useCallback(() => {
    setLoading(true);
    const flt = encodeURIComponent(JSON.stringify({ status: { type: "text", value: "รอโอน" } }));
    apiFetch(`/api/master-v2/china-bills?limit=100&filters=${flt}&sort_by=bill_date&sort_dir=desc`)
      .then(r => r.json()).then(j => setRows(j.data ?? [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => rows.reduce((a, r) => a + (num(r.amount_rmb) + num(r.fee_rmb)), 0), [rows]);

  const markDone = async (id: string) => {
    setBusy(id);
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
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <div className="font-medium text-slate-800 truncate">{String(r.supplier_label ?? r.supplier_id ?? "—")}</div>
              <div className="text-xs text-slate-400">วันที่โอน {String(r.transfer_date ?? "—")}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-semibold text-slate-800">¥{fmt(num(r.amount_rmb) + num(r.fee_rmb))}</div>
              <div className="text-xs text-rose-600">฿{fmt((num(r.amount_rmb) + num(r.fee_rmb)) * num(r.rate))}</div>
            </div>
          </div>
          <button onClick={() => markDone(String(r.id))} disabled={busy === String(r.id)}
            className="mt-3 w-full h-10 border border-emerald-300 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-50 disabled:opacity-50">
            {busy === String(r.id) ? "…" : "✓ ทำเครื่องหมายว่าโอนแล้ว"}
          </button>
        </Card>
      ))}
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
