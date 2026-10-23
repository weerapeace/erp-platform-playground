"use client";

/**
 * 🎟️ แท็บคูปองส่วนลดของเว็บร้าน (/website/<shop>?tab=coupons)
 *
 * รายการ = MiniTable กลาง · เพิ่ม/แก้ = ERPModal · ลบ = ConfirmDialog (ลบได้เฉพาะที่ยังไม่เคยถูกใช้ — ใช้แล้วให้ปิดแทน)
 * ข้อมูล /api/website/coupons · กฎตรวจ/คิดเงิน lib/website-coupons (ตัวเดียวกับตอนลูกค้าสั่งจริง)
 * ป๊อปอัปลูกค้าใหม่บนเว็บ ตั้งที่แท็บ "🏪 ข้อมูลร้าน" กลุ่ม 🎁 (ใส่โค้ดจากที่นี่)
 * 👤 เฉพาะสมาชิก / ระดับขั้นต่ำ (M5) — ระดับมาจากแท็บ 👥 สมาชิก (/api/website/members/tiers) · สมาชิกเห็นคูปองพวกนี้ในหน้าบัญชีของตัวเอง
 */
import { useCallback, useEffect, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { DateInput } from "@/components/date-input";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { couponLabel, normalizeCouponCode, type StoreCoupon } from "@/lib/website-coupons";
import { webForm } from "@/lib/website-form-styles";

type Row = StoreCoupon & { used: number };

type Form = {
  id?: string;
  code: string;
  kind: "percent" | "fixed";
  value: string;
  minSubtotal: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perPhoneOnce: boolean;
  newCustomersOnly: boolean;
  membersOnly: boolean;
  minTier: string;
  active: boolean;
  note: string;
};

const EMPTY: Form = { code: "", kind: "percent", value: "10", minSubtotal: "", maxDiscount: "", startsAt: "", endsAt: "", usageLimit: "", perPhoneOnce: true, newCustomersOnly: true, membersOnly: false, minTier: "", active: true, note: "" };

const isoDay = (v: string | null) => (v ? v.slice(0, 10) : "");
/** วันที่ (YYYY-MM-DD) → เวลาไทย: เริ่ม 00:00 · หมด 23:59:59 ของวันนั้น */
const thStart = (d: string) => (d ? `${d}T00:00:00+07:00` : "");
const thEnd = (d: string) => (d ? `${d}T23:59:59+07:00` : "");
const thDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" }) : "");
const thIsoDay = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10) : "");

function statusOf(c: Row): { label: string; cls: string } {
  const now = Date.now();
  if (!c.active) return { label: "ปิดอยู่", cls: "bg-slate-100 text-slate-500" };
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return { label: "หมดอายุ", cls: "bg-slate-100 text-slate-500" };
  if (c.usageLimit !== null && c.used >= c.usageLimit) return { label: "ใช้ครบแล้ว", cls: "bg-slate-100 text-slate-500" };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: "ยังไม่เริ่ม", cls: "bg-amber-50 text-amber-700" };
  return { label: "ใช้ได้", cls: "bg-emerald-50 text-emerald-700" };
}

const labelCls = webForm.label;
const inputCls = webForm.inputH9;

export function WebsiteCouponsPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Row | null>(null);
  const [tiers, setTiers] = useState<{ key: string; name: string; minSpend: number }[]>([]);
  useEffect(() => {
    apiFetch(`/api/website/members/tiers?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => setTiers(j.tiers ?? []))
      .catch(() => setTiers([]));
  }, [shopSlug]);
  const tierName = (key: string | null) => (key ? tiers.find((t) => t.key === key)?.name ?? null : null);

  const load = useCallback(() => {
    apiFetch(`/api/website/coupons?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) toast.error(j.error);
        setRows(j.coupons ?? []);
      })
      .catch(() => {
        toast.error("โหลดคูปองไม่สำเร็จ");
        setRows([]);
      });
  }, [shopSlug, toast]);
  useEffect(() => load(), [load]);

  const edit = (c: Row) =>
    setForm({
      id: c.id,
      code: c.code,
      kind: c.kind,
      value: String(c.value),
      minSubtotal: c.minSubtotal ? String(c.minSubtotal) : "",
      maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "",
      startsAt: thIsoDay(c.startsAt),
      endsAt: thIsoDay(c.endsAt),
      usageLimit: c.usageLimit ? String(c.usageLimit) : "",
      perPhoneOnce: c.perPhoneOnce,
      newCustomersOnly: c.newCustomersOnly,
      membersOnly: c.membersOnly,
      minTier: c.minTier ?? "",
      active: c.active,
      note: c.note,
    });

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const payload = { ...form, startsAt: thStart(form.startsAt), endsAt: thEnd(form.endsAt), ...(form.id ? {} : { shopId }) };
      const r = await apiFetch("/api/website/coupons", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      toast.success(form.id ? "บันทึกคูปองแล้ว" : `สร้างคูปอง ${normalizeCouponCode(form.code)} แล้ว — ลูกค้าใส่โค้ดที่หน้าชำระเงินได้ทันที`);
      setForm(null);
      load();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: Row) => {
    const r = await apiFetch("/api/website/coupons", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, active: !c.active }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) toast.error(j.error ?? "บันทึกไม่สำเร็จ");
    else {
      toast.success(c.active ? `ปิดคูปอง ${c.code} แล้ว` : `เปิดคูปอง ${c.code} แล้ว`);
      load();
    }
  };

  const remove = async () => {
    if (!del) return;
    const r = await apiFetch(`/api/website/coupons?id=${encodeURIComponent(del.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) toast.error(j.error ?? "ลบไม่สำเร็จ");
    else {
      toast.success(`ลบคูปอง ${del.code} แล้ว`);
      load();
    }
    setDel(null);
  };

  const f = form;
  const set = (p: Partial<Form>) => setForm((x) => (x ? { ...x, ...p } : x));
  const preview = f && Number(f.value) > 0 ? couponLabel({ kind: f.kind, value: Number(f.value), maxDiscount: f.kind === "percent" && Number(f.maxDiscount) > 0 ? Number(f.maxDiscount) : null, minSubtotal: Number(f.minSubtotal) || 0 }) : "";

  if (rows === null) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="space-y-3">
      <MiniTable<Row>
        title="🎟️ คูปองส่วนลด"
        rows={rows}
        rowKey={(r) => r.id}
        countUnit="คูปอง"
        searchText={(r) => `${r.code} ${r.note}`}
        searchPlaceholder="ค้นหาโค้ด / หมายเหตุ"
        onRowClick={edit}
        actions={
          <button type="button" onClick={() => setForm({ ...EMPTY })} className="h-8 px-3 text-xs font-medium text-white rounded-lg bg-orange-600 hover:bg-orange-700">
            + สร้างคูปอง
          </button>
        }
        emptyText={
          <div className="py-6 text-center">
            <p className="text-sm text-slate-600">ยังไม่มีคูปอง</p>
            <p className="text-xs text-slate-400 mt-1">กด &quot;+ สร้างคูปอง&quot; เช่น WELCOME10 ลด 10% สำหรับลูกค้าใหม่ · ลูกค้าใส่โค้ดที่หน้าชำระเงิน · ระบบคิดส่วนลดให้เอง</p>
          </div>
        }
        columns={[
          { key: "code", header: "โค้ด", width: "9rem", cell: (r) => <span className="font-mono text-sm font-semibold text-slate-800">{r.code}</span>, sortValue: (r) => r.code },
          { key: "what", header: "ส่วนลด", width: "1.6fr", cell: (r) => <span className="text-sm text-slate-700">{couponLabel(r)}{r.newCustomersOnly && <span className="ml-1 text-[10px] text-blue-600">· ลูกค้าใหม่</span>}{(r.membersOnly || r.minTier) && (
                <span className={`ml-1 text-[10px] ${r.minTier && !tierName(r.minTier) ? "text-red-600" : "text-amber-700"}`} title={r.minTier && !tierName(r.minTier) ? "ระดับที่ตั้งไว้ถูกลบแล้ว — ไม่มีใครใช้คูปองนี้ได้ แก้คูปองเลือกระดับใหม่" : undefined}>
                  · 👤 {r.minTier ? (tierName(r.minTier) ? `สมาชิก ${tierName(r.minTier)} ขึ้นไป` : "⚠️ ระดับถูกลบแล้ว") : "เฉพาะสมาชิก"}
                </span>
              )}</span> },
          {
            key: "when",
            header: "ช่วงเวลา",
            width: "1fr",
            cell: (r) => <span className="text-xs text-slate-500">{r.startsAt || r.endsAt ? `${thDay(r.startsAt) || "ตอนนี้"} – ${thDay(r.endsAt) || "ไม่หมดอายุ"}` : "ไม่จำกัด"}</span>,
          },
          { key: "used", header: "ใช้ไป", align: "right", width: "5rem", cell: (r) => <span className="text-sm tabular-nums">{r.used}{r.usageLimit ? ` / ${r.usageLimit}` : ""}</span>, sortValue: (r) => r.used },
          {
            key: "status",
            header: "สถานะ",
            width: "6rem",
            cell: (r) => {
              const s = statusOf(r);
              return <span className={`px-1.5 py-0.5 rounded text-[11px] ${s.cls}`}>{s.label}</span>;
            },
          },
          {
            key: "act",
            header: "",
            width: "7rem",
            align: "right",
            cell: (r) => (
              <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => void toggle(r)} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 hover:border-slate-400">
                  {r.active ? "ปิด" : "เปิด"}
                </button>
                <button type="button" onClick={() => setDel(r)} disabled={r.used > 0} title={r.used > 0 ? "ถูกใช้แล้ว ลบไม่ได้ — ปิดแทน" : "ลบคูปอง"} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-red-600 hover:border-red-300 disabled:opacity-30">
                  ลบ
                </button>
              </span>
            ),
          },
        ]}
        footnote="ส่วนลดคิดจากค่าสินค้า (ไม่รวมค่าส่ง) · ออเดอร์ที่ยกเลิกไม่นับว่าใช้ไปแล้ว · ป๊อปอัปแจกโค้ดลูกค้าใหม่ตั้งที่แท็บ 🏪 ข้อมูลร้าน"
      />

      <ERPModal
        open={!!f}
        onClose={() => setForm(null)}
        title={f?.id ? `แก้คูปอง ${f.code}` : "สร้างคูปอง"}
        size="md"
        defaultExpanded={false}
        footer={
          <div className="flex items-center gap-2 w-full">
            <span className="flex-1 text-xs text-slate-500 line-clamp-2">{preview && `ลูกค้าจะเห็น: ${preview}`}</span>
            <button type="button" onClick={() => setForm(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
              ยกเลิก
            </button>
            <button type="button" disabled={saving} onClick={() => void save()} className="h-9 px-4 text-sm font-medium text-white rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        }
      >
        {f && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>โค้ด (ลูกค้าพิมพ์)</label>
              <input className={`${inputCls} font-mono uppercase`} value={f.code} maxLength={30} onChange={(e) => set({ code: normalizeCouponCode(e.target.value) })} placeholder="WELCOME10" />
            </div>
            <div>
              <label className={labelCls}>ชนิดส่วนลด</label>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden h-9">
                {(["percent", "fixed"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => set({ kind: k })} className={`flex-1 text-xs ${f.kind === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                    {k === "percent" ? "เปอร์เซ็นต์ (%)" : "จำนวนบาท (฿)"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>{f.kind === "percent" ? "ลดกี่ % (1–90)" : "ลดกี่บาท"}</label>
              <MoneyInput className={inputCls} value={f.value} onChange={(v) => set({ value: v })} />
            </div>
            {f.kind === "percent" ? (
              <div>
                <label className={labelCls}>ลดสูงสุด (บาท) — เว้นว่าง = ไม่จำกัด</label>
                <MoneyInput className={inputCls} value={f.maxDiscount} onChange={(v) => set({ maxDiscount: v })} placeholder="เช่น 200" />
              </div>
            ) : (
              <div />
            )}
            <div>
              <label className={labelCls}>ยอดสินค้าขั้นต่ำ (บาท) — เว้นว่าง = ไม่มี</label>
              <MoneyInput className={inputCls} value={f.minSubtotal} onChange={(v) => set({ minSubtotal: v })} placeholder="เช่น 590" />
            </div>
            <div>
              <label className={labelCls}>ใช้ได้ทั้งหมดกี่ครั้ง — เว้นว่าง = ไม่จำกัด</label>
              <MoneyInput className={inputCls} value={f.usageLimit} onChange={(v) => set({ usageLimit: v.replace(/\..*/, "") })} placeholder="เช่น 100" />
            </div>
            <div>
              <label className={labelCls}>เริ่มใช้ได้ (เว้นว่าง = ทันที)</label>
              <DateInput value={f.startsAt} onChange={(v) => set({ startsAt: v })} />
            </div>
            <div>
              <label className={labelCls}>ใช้ได้ถึง (เว้นว่าง = ไม่หมดอายุ)</label>
              <DateInput value={f.endsAt} onChange={(v) => set({ endsAt: v })} />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={f.newCustomersOnly} onChange={(e) => set({ newCustomersOnly: e.target.checked })} />
              เฉพาะลูกค้าใหม่ (เบอร์ที่ยังไม่เคยสั่ง)
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={f.perPhoneOnce} onChange={(e) => set({ perPhoneOnce: e.target.checked })} />
              1 เบอร์ใช้ได้ครั้งเดียว
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={f.active} onChange={(e) => set({ active: e.target.checked })} />
              เปิดใช้งาน
            </label>
            <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 grid gap-2 sm:grid-cols-2" data-member-coupon>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={f.membersOnly || !!f.minTier} onChange={(e) => set({ membersOnly: e.target.checked, ...(e.target.checked ? { newCustomersOnly: false } : { minTier: "" }) })} />
                👤 เฉพาะสมาชิก (ต้องเข้าสู่ระบบ · สมาชิกเห็นในหน้าบัญชี · ระดับคิดจากยอดซื้อ 12 เดือน)
              </label>
              <div>
                <select
                  aria-label="ระดับสมาชิกขั้นต่ำ"
                  className={`${inputCls} bg-white`}
                  value={f.minTier}
                  disabled={!(f.membersOnly || f.minTier) || !tiers.length}
                  onChange={(e) => set({ minTier: e.target.value, membersOnly: true })}
                >
                  <option value="">ทุกระดับ</option>
                  {tiers.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name} ขึ้นไป (≥ ฿{t.minSpend.toLocaleString("th-TH")})
                    </option>
                  ))}
                </select>
                {!tiers.length && (f.membersOnly || !!f.minTier) && <p className="mt-1 text-[11px] text-slate-500">ยังไม่ได้ตั้งระดับ — ตั้งที่แท็บ 👥 สมาชิก ปุ่ม ⭐ ระดับสมาชิก</p>}
                {f.minTier && !tierName(f.minTier) && tiers.length > 0 && <p className="mt-1 text-[11px] text-red-600">ระดับเดิมถูกลบแล้ว — เลือกใหม่</p>}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>หมายเหตุ (ลูกค้าไม่เห็น)</label>
              <input className={inputCls} value={f.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} placeholder="เช่น แจกในป๊อปอัปลูกค้าใหม่" />
            </div>
          </div>
        )}
      </ERPModal>

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => void remove()}
        variant="danger"
        title={`ลบคูปอง ${del?.code ?? ""}?`}
        message="ลูกค้าที่ถือโค้ดนี้จะใช้ไม่ได้อีก (ยังไม่เคยมีใครใช้ จึงไม่กระทบออเดอร์เก่า)"
        confirmText="ลบคูปอง"
      />
    </div>
  );
}
