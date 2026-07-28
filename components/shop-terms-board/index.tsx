"use client";

// ============================================================
// ShopTermsBoard (ของกลาง) — ตั้ง "เครดิตการจ่าย + ระยะเวลาส่งของ" ให้หลายร้านรวดเดียว
//   เดิมต้องเปิดร้านทีละใบใน /master/partners → ไม่มีใครตั้ง ปฏิทินเลยคิดวันให้ไม่ได้
//   หน้านี้เรียงร้านที่ "ซื้อบ่อยสุด" ขึ้นก่อน ตั้ง 10 ร้านแรกก็ครอบคลุมใบส่วนใหญ่แล้ว
//
//   ใช้ของกลาง: PurchaseCreditTermInput / PurchaseLeadTimeInput (ตัวเดียวกับในฟอร์ม Partner)
//   บันทึกผ่าน PATCH /api/master-v2/partners/{id} (เคารพสิทธิ์ + audit log)
//   ใช้ได้ทั้งหน้าเต็ม (/purchasing/shop-terms) และฝังใน popup อื่น
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { Spinner } from "@/components/spinner";
import { PurchaseCreditTermInput } from "@/components/purchase-credit-term-input";
import { PurchaseLeadTimeInput } from "@/components/purchase-lead-time-input";
import { formatCreditTerm, formatLeadTime } from "@/lib/credit-term";
import type { ShopTermRow, ShopTermsResponse } from "@/app/api/purchasing/shop-terms/route";

type Filter = "todo" | "used" | "all";

const EMPTY_SUMMARY = { shops: 0, with_credit: 0, with_lead: 0, pos: 0, pos_covered: 0 };

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone: string }) {
  return (
    <div className="relative overflow-hidden bg-white border border-slate-200 rounded-[14px] px-4 py-3.5">
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${tone}`} />
      <div className="text-[12px] text-slate-500">{label}</div>
      <div className="text-[24px] font-bold mt-0.5 tabular-nums text-slate-800">{value}</div>
      {hint && <div className="text-[11.5px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export function ShopTermsBoard() {
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can("products.edit" as Parameters<typeof can>[0]);

  const [rows, setRows] = useState<ShopTermRow[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("used");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Record<string, { credit_term: string | null; lead_time: string | null }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/purchasing/shop-terms");
      const j = (await res.json()) as ShopTermsResponse;
      if (j.error) throw new Error(j.error);
      setRows(j.rows ?? []);
      setSummary(j.summary ?? EMPTY_SUMMARY);
      setDraft({});
    } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดรายชื่อร้านไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const valueOf = (r: ShopTermRow) => draft[r.id] ?? { credit_term: r.credit_term, lead_time: r.lead_time };
  const isDirty = (r: ShopTermRow) => {
    const d = draft[r.id];
    return !!d && (d.credit_term !== r.credit_term || d.lead_time !== r.lead_time);
  };
  const setDraftVal = (r: ShopTermRow, patch: Partial<{ credit_term: string | null; lead_time: string | null }>) =>
    setDraft((p) => ({ ...p, [r.id]: { ...valueOf(r), ...patch } }));

  const save = async (r: ShopTermRow) => {
    const v = valueOf(r);
    setSaving(r.id);
    try {
      const res = await apiFetch(`/api/master-v2/partners/${r.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_credit_term: v.credit_term, purchase_lead_time: v.lead_time }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, credit_term: v.credit_term, lead_time: v.lead_time } : x)));
      setDraft((p) => { const c = { ...p }; delete c[r.id]; return c; });
      setSummary((s) => {
        const had = !!r.credit_term, has = !!v.credit_term;
        const hadL = !!r.lead_time, hasL = !!v.lead_time;
        return {
          ...s,
          with_credit: s.with_credit + (has ? 1 : 0) - (had ? 1 : 0),
          with_lead: s.with_lead + (hasL ? 1 : 0) - (hadL ? 1 : 0),
          pos_covered: s.pos_covered + (has && !had ? r.po_count : 0) - (!has && had ? r.po_count : 0),
        };
      });
      toast.success(`บันทึก "${r.name}" แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(null); }
  };

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "todo" && r.credit_term) return false;
      if (filter === "used" && r.po_count === 0) return false;
      if (kw && !`${r.name} ${r.code ?? ""}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [rows, filter, q]);

  const pct = summary.pos ? Math.round((summary.pos_covered / summary.pos) * 100) : 0;
  const TABS: { key: Filter; label: string; n: number }[] = [
    { key: "used", label: "ร้านที่เคยซื้อ", n: rows.filter((r) => r.po_count > 0).length },
    { key: "todo", label: "ยังไม่ตั้งเครดิต", n: rows.filter((r) => !r.credit_term).length },
    { key: "all", label: "ทั้งหมด", n: rows.length },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="💳 ตั้งเครดิตแล้ว" value={`${summary.with_credit}/${summary.shops}`} hint="ร้าน" tone="bg-indigo-500" />
        <Stat label="🚚 ตั้งวันส่งของแล้ว" value={`${summary.with_lead}/${summary.shops}`} hint="ร้าน" tone="bg-emerald-500" />
        <Stat label="📄 ใบที่คิดวันจ่ายให้ได้" value={`${pct}%`} hint={`${summary.pos_covered} จาก ${summary.pos} ใบ`} tone="bg-amber-500" />
      </div>

      <div className="text-[12.5px] text-sky-900 bg-sky-50 border border-sky-200 rounded-[10px] px-3.5 py-2.5">
        ตั้งครั้งเดียวที่ร้าน แล้ว<b>ปฏิทินจัดซื้อจะคิดวันครบกำหนดจ่ายและวันของเข้าให้เองทุกใบ</b> —
        ร้านที่ซื้อบ่อยสุดอยู่บนสุด ตั้งไม่กี่ร้านแรกก็ครอบคลุมใบส่วนใหญ่แล้ว
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="inline-flex bg-white border border-slate-200 rounded-[11px] p-[3px] gap-0.5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`text-[13px] font-semibold px-3.5 py-[7px] rounded-lg transition flex items-center gap-1.5 ${filter === t.key ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>
              {t.label} <span className="text-[11px] text-slate-400 tabular-nums">{t.n}</span>
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อร้าน…"
          className="flex-1 min-w-[180px] h-10 border border-slate-200 rounded-[11px] px-3.5 text-[13.5px] focus:outline-2 focus:outline-indigo-500" />
        <button onClick={() => void load()} disabled={loading}
          className="h-10 px-3.5 text-[12.5px] font-semibold border border-slate-200 bg-white text-slate-600 rounded-[11px] hover:bg-slate-50 disabled:opacity-50">↻ โหลดใหม่</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-[14px] shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-[13px]"><Spinner /> กำลังโหลด…</div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-[13px]">ไม่พบร้านที่ตรงเงื่อนไข</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {shown.map((r) => {
              const v = valueOf(r);
              const dirty = isDirty(r);
              return (
                <div key={r.id} className={`px-4 py-3 ${dirty ? "bg-amber-50/40" : ""}`}>
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="min-w-[190px] flex-1">
                      <div className="font-semibold text-[13.5px] flex items-center gap-1.5 flex-wrap">
                        {r.name}
                        {r.is_china && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">🇨🇳</span>}
                      </div>
                      <div className="text-[11.5px] text-slate-400 mt-0.5 flex gap-2 flex-wrap">
                        <span>{r.po_count > 0 ? `${r.po_count} ใบสั่งซื้อ` : "ยังไม่เคยสั่ง"}</span>
                        {r.unpaid_count > 0 && <span className="text-amber-600">ค้างจ่าย {r.unpaid_count} ใบ</span>}
                        {r.last_order_date && <span>ล่าสุด {r.last_order_date}</span>}
                      </div>
                      {!dirty && (r.credit_term || r.lead_time) && (
                        <div className="flex gap-1.5 flex-wrap mt-1.5">
                          {r.credit_term && <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">💳 {formatCreditTerm(r.credit_term)}</span>}
                          {r.lead_time && <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">🚚 {formatLeadTime(r.lead_time)}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-[230px]">
                      <label className="text-[11px] font-semibold text-slate-500">เทอมการจ่าย</label>
                      <PurchaseCreditTermInput value={v.credit_term} disabled={!canEdit}
                        onChange={(val) => setDraftVal(r, { credit_term: val })} />
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-[230px]">
                      <label className="text-[11px] font-semibold text-slate-500">ระยะเวลาส่งของ</label>
                      <PurchaseLeadTimeInput value={v.lead_time} disabled={!canEdit}
                        onChange={(val) => setDraftVal(r, { lead_time: val })} />
                    </div>
                    <div className="pt-[22px]">
                      <button onClick={() => void save(r)} disabled={!dirty || !canEdit || saving === r.id}
                        className="h-[38px] px-4 text-[13px] font-semibold rounded-[10px] bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-2">
                        {saving === r.id && <Spinner />}💾 บันทึก
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
