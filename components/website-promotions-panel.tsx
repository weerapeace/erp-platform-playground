"use client";

/**
 * 🏷 แท็บโปรโมชันอัตโนมัติของเว็บร้าน (/website/<shop>?tab=promotions)
 *
 * รายการ = MiniTable กลาง · เพิ่ม/แก้ = ERPModal · ลบ = ConfirmDialog · เวลาใช้ ERPDateTime24 (24 ชม. · เวลาไทย)
 * ชนิด: ⚡ Flash sale · ซื้อครบ N ชิ้นลด % · ซื้อ X แถม Y · ยอดครบขั้นบันได · ซื้อเป็นเซ็ต (กฎ lib/website-promotions · ERP คิดใหม่ตอนรับออเดอร์)
 * ไม่ต้องใส่โค้ด — ตะกร้าลดให้เอง · โปรตะกร้าใช้ตัวที่ลดมากสุด 1 ตัว + ⚡ ซ้อนได้ · คูปองคิดต่อจากยอดหลังโปร
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { ERPDateTime24 } from "@/components/form";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { loadWebListings } from "@/lib/website-data";
import { isLive, promoBadge, PROMO_KINDS, type DiscountKind, type Promotion, type PromoKind, type PromoScope } from "@/lib/website-promotions";
import { webForm } from "@/lib/website-form-styles";

type Tier = { min: string; kind: DiscountKind; value: string };
type Form = {
  id?: string;
  name: string;
  kind: PromoKind;
  active: boolean;
  startsAt: string;
  endsAt: string;
  scopeMode: PromoScope["mode"];
  codes: string[];
  categories: string[];
  percent: string;
  minQty: string;
  buyQty: string;
  getQty: string;
  getPercent: string;
  tiers: Tier[];
  bundleCodes: string[];
  bundleKind: DiscountKind;
  bundleValue: string;
  noCoupon: boolean;
  badge: string;
};

const EMPTY: Form = { name: "", kind: "qty_percent", active: true, startsAt: "", endsAt: "", scopeMode: "all", codes: [], categories: [], percent: "10", minQty: "2", buyQty: "2", getQty: "1", getPercent: "100", tiers: [{ min: "1500", kind: "fixed", value: "100" }], bundleCodes: [], bundleKind: "fixed", bundleValue: "200", noCoupon: false, badge: "" };

/** ISO → "YYYY-MM-DDTHH:mm" เวลาไทย (ช่อง ERPDateTime24) */
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 16) : "");
const toIso = (local: string) => (local ? `${local}:00+07:00` : "");
const thWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "");
const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

const labelCls = webForm.label;
const inputCls = webForm.inputH9;

function statusOf(p: Promotion): { label: string; cls: string } {
  const now = Date.now();
  if (!p.active) return { label: "ปิดอยู่", cls: "bg-slate-100 text-slate-500" };
  if (p.endsAt && new Date(p.endsAt).getTime() <= now) return { label: "หมดเวลา", cls: "bg-slate-100 text-slate-500" };
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return { label: "ยังไม่เริ่ม", cls: "bg-amber-50 text-amber-700" };
  return isLive(p) ? { label: "ใช้อยู่", cls: "bg-emerald-50 text-emerald-700" } : { label: "—", cls: "" };
}

/** ช่องรหัสรุ่นแบบชิป (พิมพ์/เลือกจากสินค้าที่เผยแพร่ · Enter/จุลภาค = เพิ่ม) */
function CodeChips({ value, onChange, options, placeholder }: { value: string[]; onChange: (v: string[]) => void; options: { code: string; name: string }[]; placeholder: string }) {
  const [text, setText] = useState("");
  const listId = useMemo(() => `codes-${Math.random().toString(36).slice(2, 8)}`, []);
  const known = useMemo(() => new Set(options.map((o) => o.code.toUpperCase())), [options]);
  const add = (raw: string) => {
    const next = raw.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (next.length) onChange([...new Set([...value, ...next])]);
    setText("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 p-1.5 min-h-9">
        {value.map((c) => (
          <span key={c} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-mono ${known.has(c) ? "bg-slate-100 text-slate-800" : "bg-red-50 text-red-700"}`} title={known.has(c) ? options.find((o) => o.code.toUpperCase() === c)?.name : "ไม่พบในสินค้าที่เผยแพร่บนเว็บร้านนี้"}>
            {c}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== c))} className="text-slate-400 hover:text-red-600">×</button>
          </span>
        ))}
        <input
          list={listId}
          value={text}
          onChange={(e) => (/[\s,]$/.test(e.target.value) ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            }
          }}
          onBlur={() => text && add(text)}
          placeholder={value.length ? "" : placeholder}
          className="flex-1 min-w-[8rem] text-sm outline-none px-1"
        />
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.code} value={o.code}>{o.name}</option>
          ))}
        </datalist>
      </div>
      {value.some((c) => !known.has(c)) && <p className="text-[11px] text-red-600 mt-1">รหัสสีแดง = ไม่พบในสินค้าที่เผยแพร่บนเว็บร้านนี้ (โปรจะไม่มีผลกับรหัสนั้น)</p>}
    </div>
  );
}

export function WebsitePromotionsPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<Promotion[] | null>(null);
  const [used, setUsed] = useState<Record<string, { orders: number; discount: number }>>({});
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Promotion | null>(null);
  const [products, setProducts] = useState<{ code: string; name: string }[]>([]);
  const [cats, setCats] = useState<{ key: string; label: string }[]>([]);

  useEffect(() => {
    loadWebListings<{ code: string; erpName: string; published: boolean; display?: { name?: string } }, unknown, { key: string; label: string }>(shopSlug, true)
      .then((j) => {
        setProducts((j.listings ?? []).filter((l) => l.published && l.code).map((l) => ({ code: l.code, name: l.display?.name || l.erpName })));
        setCats((j.categories ?? []).map((c) => ({ key: c.key, label: c.label })));
      })
      .catch(() => undefined);
  }, [shopSlug]);

  const load = useCallback(() => {
    apiFetch(`/api/website/promotions?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) toast.error(j.error);
        setRows(j.promotions ?? []);
        setUsed(j.used ?? {});
      })
      .catch(() => {
        toast.error("โหลดโปรโมชันไม่สำเร็จ");
        setRows([]);
      });
  }, [shopSlug, toast]);
  useEffect(() => load(), [load]);

  const edit = (p: Promotion) => {
    const r = p.rule;
    setForm({
      id: p.id,
      name: p.name,
      kind: p.kind,
      active: p.active,
      startsAt: toLocal(p.startsAt),
      endsAt: toLocal(p.endsAt),
      scopeMode: r.scope.mode,
      codes: r.scope.codes,
      categories: r.scope.categories,
      percent: String(r.percent ?? 10),
      minQty: String(r.minQty ?? 2),
      buyQty: String(r.buyQty ?? 2),
      getQty: String(r.getQty ?? 1),
      getPercent: String(r.getPercent ?? 100),
      tiers: (r.tiers ?? []).map((t) => ({ min: String(t.min), kind: t.kind, value: String(t.value) })),
      bundleCodes: r.bundleCodes ?? [],
      bundleKind: r.bundleKind ?? "fixed",
      bundleValue: String(r.bundleValue ?? 200),
      noCoupon: !!r.noCoupon,
      badge: r.badge ?? "",
    });
  };

  const payload = (f: Form) => ({
    name: f.name,
    kind: f.kind,
    active: f.active,
    startsAt: toIso(f.startsAt),
    endsAt: toIso(f.endsAt),
    rule: {
      scope: { mode: f.scopeMode, codes: f.codes, categories: f.categories },
      percent: Number(f.percent),
      minQty: Number(f.minQty),
      buyQty: Number(f.buyQty),
      getQty: Number(f.getQty),
      getPercent: Number(f.getPercent),
      tiers: f.tiers.map((t) => ({ min: Number(t.min), kind: t.kind, value: Number(t.value) })),
      bundleCodes: f.bundleCodes,
      bundleKind: f.bundleKind,
      bundleValue: Number(f.bundleValue),
      noCoupon: f.noCoupon,
      badge: f.badge,
    },
  });

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const body = { ...payload(form), ...(form.id ? { id: form.id } : { shopId }) };
      const r = await apiFetch("/api/website/promotions", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      toast.success(form.id ? "บันทึกโปรโมชันแล้ว — เว็บอัปเดตภายใน ~1 นาที" : `สร้างโปร "${form.name}" แล้ว — ตะกร้าลดให้เองเมื่อถึงเวลา`);
      setForm(null);
      load();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: Promotion) => {
    const r = await apiFetch("/api/website/promotions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, active: !p.active }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) toast.error(j.error ?? "บันทึกไม่สำเร็จ");
    else {
      toast.success(p.active ? `ปิด "${p.name}" แล้ว` : `เปิด "${p.name}" แล้ว`);
      load();
    }
  };

  const remove = async () => {
    if (!del) return;
    const r = await apiFetch(`/api/website/promotions?id=${encodeURIComponent(del.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) toast.error(j.error ?? "ลบไม่สำเร็จ");
    else {
      toast.success(`ลบ "${del.name}" แล้ว`);
      load();
    }
    setDel(null);
  };

  const f = form;
  const set = (p: Partial<Form>) => setForm((x) => (x ? { ...x, ...p } : x));
  const preview = f ? promoBadge({ kind: f.kind, rule: payload(f).rule as Promotion["rule"] }) : "";

  if (rows === null) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="space-y-3">
      <MiniTable<Promotion>
        title="🏷 โปรโมชันอัตโนมัติ"
        rows={rows}
        rowKey={(r) => r.id}
        countUnit="โปร"
        searchText={(r) => `${r.name} ${r.rule.scope.codes.join(" ")}`}
        searchPlaceholder="ค้นหาชื่อโปร / รหัสรุ่น"
        onRowClick={edit}
        actions={
          <button type="button" onClick={() => setForm({ ...EMPTY })} className="h-8 px-3 text-xs font-medium text-white rounded-lg bg-orange-600 hover:bg-orange-700">
            + สร้างโปรโมชัน
          </button>
        }
        emptyText={
          <div className="py-6 text-center">
            <p className="text-sm text-slate-600">ยังไม่มีโปรโมชัน</p>
            <p className="text-xs text-slate-400 mt-1">เช่น ⚡ Flash sale 11.11 ลด 20% · ซื้อ 2 ชิ้นลด 10% · ซื้อ 2 แถม 1 · ครบ ฿1,500 ลด ฿100 · กระเป๋า+เข็มขัด ลด ฿200 — ลูกค้าไม่ต้องใส่โค้ด</p>
          </div>
        }
        columns={[
          { key: "name", header: "โปรโมชัน", width: "1.6fr", cell: (r) => <span className="min-w-0"><span className="block text-sm font-medium text-slate-800">{r.name}</span><span className="block text-[11px] text-slate-500">{promoBadge(r)}</span></span>, sortValue: (r) => r.name },
          { key: "kind", header: "ชนิด", width: "1fr", cell: (r) => <span className="text-xs text-slate-600">{PROMO_KINDS.find((k) => k.key === r.kind)?.label}</span> },
          {
            key: "scope",
            header: "สินค้าที่ร่วม",
            width: "1fr",
            cell: (r) => <span className="text-xs text-slate-500">{r.rule.scope.mode === "all" ? "ทุกสินค้า" : r.rule.scope.mode === "codes" ? `${r.rule.scope.codes.length} รุ่น` : `${r.rule.scope.categories.length} หมวด`}{r.rule.noCoupon ? " · ห้ามคูปอง" : ""}</span>,
          },
          { key: "when", header: "ช่วงเวลา", width: "1.2fr", cell: (r) => <span className="text-xs text-slate-500">{r.startsAt || r.endsAt ? `${thWhen(r.startsAt) || "ตอนนี้"} – ${thWhen(r.endsAt) || "ไม่มีกำหนด"}` : "ไม่จำกัด"}</span> },
          { key: "used", header: "ใช้ไป (90 วัน)", align: "right", width: "7rem", cell: (r) => <span className="text-xs tabular-nums">{used[r.id] ? `${used[r.id].orders} ออเดอร์ · ${money(used[r.id].discount)}` : "—"}</span>, sortValue: (r) => used[r.id]?.orders ?? 0 },
          { key: "status", header: "สถานะ", width: "6rem", cell: (r) => { const s = statusOf(r); return <span className={`px-1.5 py-0.5 rounded text-[11px] ${s.cls}`}>{s.label}</span>; } },
          {
            key: "act",
            header: "",
            width: "7rem",
            align: "right",
            cell: (r) => (
              <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => void toggle(r)} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 hover:border-slate-400">{r.active ? "ปิด" : "เปิด"}</button>
                <button type="button" onClick={() => setDel(r)} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-red-600 hover:border-red-300">ลบ</button>
              </span>
            ),
          },
        ]}
        footnote="⚡ Flash sale ลดต่อชิ้นและซ้อนกับโปรอื่นได้ · โปรตะกร้า (4 ชนิดที่เหลือ) ใช้ตัวที่ลดได้มากสุด 1 ตัว · คูปองคิดต่อจากยอดหลังโปร · ส่วนลดรวมอยู่ในช่องส่วนลดของออเดอร์ (แยกชื่อโปรให้เห็น)"
      />

      <ERPModal
        open={!!f}
        onClose={() => setForm(null)}
        title={f?.id ? `แก้โปร ${f.name}` : "สร้างโปรโมชัน"}
        size="md"
        defaultExpanded={false}
        footer={
          <div className="flex items-center gap-2 w-full">
            <span className="flex-1 text-xs text-slate-500 line-clamp-2">{preview && `ป้ายบนเว็บ: ${preview}`}</span>
            <button type="button" onClick={() => setForm(null)} className="h-9 px-4 text-sm rounded-lg border border-slate-200">ยกเลิก</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="h-9 px-4 text-sm rounded-lg bg-orange-600 text-white disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
        }
      >
        {f && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>ชนิดโปรโมชัน</label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PROMO_KINDS.map((k) => (
                  <button key={k.key} type="button" onClick={() => set({ kind: k.key })} className={`text-left rounded-lg border px-3 py-2 ${f.kind === k.key ? "border-orange-500 bg-orange-50" : "border-slate-200 hover:border-slate-400"}`}>
                    <span className="block text-sm font-medium text-slate-800">{k.label}</span>
                    <span className="block text-[11px] text-slate-500">{k.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>ชื่อโปร (ลูกค้าเห็นในตะกร้า/ใบเสร็จ)</label>
              <input className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value.slice(0, 80) })} placeholder={f.kind === "flash" ? "Flash sale 11.11" : "ซื้อ 2 ชิ้น ลด 10%"} />
            </div>

            {(f.kind === "flash" || f.kind === "qty_percent") && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>ลดกี่ %</label>
                  <input type="number" min={1} max={99} className={inputCls} value={f.percent} onChange={(e) => set({ percent: e.target.value })} />
                </div>
                {f.kind === "qty_percent" && (
                  <div>
                    <label className={labelCls}>ซื้อครบกี่ชิ้น</label>
                    <input type="number" min={2} max={100} className={inputCls} value={f.minQty} onChange={(e) => set({ minQty: e.target.value })} />
                  </div>
                )}
              </div>
            )}
            {f.kind === "bxgy" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className={labelCls}>ซื้อ (ชิ้น)</label><input type="number" min={1} max={20} className={inputCls} value={f.buyQty} onChange={(e) => set({ buyQty: e.target.value })} /></div>
                <div><label className={labelCls}>แถม (ชิ้น)</label><input type="number" min={1} max={20} className={inputCls} value={f.getQty} onChange={(e) => set({ getQty: e.target.value })} /></div>
                <div><label className={labelCls}>ชิ้นที่แถมลด % (100 = ฟรี)</label><input type="number" min={1} max={100} className={inputCls} value={f.getPercent} onChange={(e) => set({ getPercent: e.target.value })} /></div>
                <p className="sm:col-span-3 text-[11px] text-slate-500">เรียงชิ้นในตะกร้าจากแพงไปถูก ทุก {Number(f.buyQty) + Number(f.getQty) || "?"} ชิ้น → ชิ้นที่ถูกสุด {f.getQty || "?"} ชิ้นได้ลด</p>
              </div>
            )}
            {f.kind === "tier" && (
              <div>
                <label className={labelCls}>ขั้นยอดซื้อ (ใช้ขั้นสูงสุดที่ลูกค้าซื้อถึง)</label>
                <div className="space-y-1.5">
                  {f.tiers.map((t, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-slate-500">ครบ ฿</span>
                      <input type="number" min={1} className={`${inputCls} w-28`} value={t.min} onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)) })} />
                      <span className="text-slate-500">ลด</span>
                      <input type="number" min={1} className={`${inputCls} w-24`} value={t.value} onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                      <select className={`${inputCls} w-24`} value={t.kind} onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, kind: e.target.value as DiscountKind } : x)) })}>
                        <option value="fixed">บาท</option>
                        <option value="percent">%</option>
                      </select>
                      <button type="button" onClick={() => set({ tiers: f.tiers.filter((_, j) => j !== i) })} className="text-xs text-red-600">ลบขั้น</button>
                    </div>
                  ))}
                  {f.tiers.length < 6 && <button type="button" onClick={() => set({ tiers: [...f.tiers, { min: "", kind: "fixed", value: "" }] })} className="text-xs text-orange-700">+ เพิ่มขั้น</button>}
                </div>
              </div>
            )}
            {f.kind === "bundle" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>รุ่นในเซ็ต (ต้องซื้อครบทุกรุ่น · 2–6 รุ่น)</label>
                  <CodeChips value={f.bundleCodes} onChange={(v) => set({ bundleCodes: v.slice(0, 6) })} options={products} placeholder="พิมพ์รหัสรุ่น แล้วกด Enter" />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">ลดต่อเซ็ต</span>
                  <input type="number" min={1} className={`${inputCls} w-28`} value={f.bundleValue} onChange={(e) => set({ bundleValue: e.target.value })} />
                  <select className={`${inputCls} w-24`} value={f.bundleKind} onChange={(e) => set({ bundleKind: e.target.value as DiscountKind })}>
                    <option value="fixed">บาท</option>
                    <option value="percent">%</option>
                  </select>
                </div>
              </div>
            )}

            {f.kind !== "bundle" && (
              <div>
                <label className={labelCls}>สินค้าที่ร่วมโปร</label>
                <div className="flex gap-1.5 mb-2">
                  {([["all", "ทุกสินค้า"], ["codes", "เลือกรุ่น"], ["categories", "ตามหมวด"]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => set({ scopeMode: k })} className={`h-8 px-3 rounded-lg text-xs border ${f.scopeMode === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"}`}>{l}</button>
                  ))}
                </div>
                {f.scopeMode === "codes" && <CodeChips value={f.codes} onChange={(v) => set({ codes: v })} options={products} placeholder="พิมพ์รหัสรุ่น แล้วกด Enter (วางหลายรหัสคั่นจุลภาคได้)" />}
                {f.scopeMode === "categories" && (
                  <div className="flex flex-wrap gap-1.5">
                    {cats.map((c) => {
                      const on = f.categories.includes(c.key);
                      return (
                        <button key={c.key} type="button" onClick={() => set({ categories: on ? f.categories.filter((x) => x !== c.key) : [...f.categories, c.key] })} className={`h-7 px-2.5 rounded-full text-xs border ${on ? "border-orange-500 bg-orange-50 text-orange-800" : "border-slate-200 text-slate-600"}`}>{c.label}</button>
                      );
                    })}
                    {!cats.length && <span className="text-xs text-slate-400">ยังไม่มีหมวดเว็บ — ตั้งที่แท็บ 📂 หมวดหมู่</span>}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>เริ่ม (เว้นว่าง = ตอนนี้)</label>
                <ERPDateTime24 value={f.startsAt} onChange={(v) => set({ startsAt: v })} defaultTime="00:00" />
              </div>
              <div>
                <label className={labelCls}>สิ้นสุด {f.kind === "flash" ? "(ต้องใส่ · เว็บนับถอยหลัง)" : "(เว้นว่าง = ไม่มีกำหนด)"}</label>
                <ERPDateTime24 value={f.endsAt} onChange={(v) => set({ endsAt: v })} defaultTime="23:59" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>ป้ายบนเว็บ (เว้นว่าง = สร้างให้)</label>
                <input className={inputCls} value={f.badge} onChange={(e) => set({ badge: e.target.value.slice(0, 40) })} placeholder={preview} />
              </div>
              <div className="flex flex-col justify-end gap-1.5">
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.noCoupon} onChange={(e) => set({ noCoupon: e.target.checked })} /> ใช้คู่โค้ดส่วนลดไม่ได้</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> เปิดใช้</label>
              </div>
            </div>
          </div>
        )}
      </ERPModal>

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => void remove()}
        variant="danger"
        title={`ลบโปร "${del?.name ?? ""}"?`}
        message="ตะกร้าจะไม่ลดให้อีก · ออเดอร์ที่ใช้โปรนี้ไปแล้วยังเก็บชื่อและยอดลดไว้เหมือนเดิม · ถ้าแค่พักไว้ ใช้ปุ่ม &quot;ปิด&quot; แทน"
        confirmText="ลบโปร"
      />
    </div>
  );
}
