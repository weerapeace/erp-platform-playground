"use client";

/**
 * แท็บ "ร้านค้าในไลน์" หน้าจัดการ LINE (/admin/line?tab=shops · เจ้าของเลือกข้อ 2.2 + 2.3 · 2026-11-23)
 *   คำขอผูกร้านที่รอยืนยัน (บนสุด) · ทุกร้านที่มีงาน/มีคนผูก: คนที่ผูก · งานค้าง · ยังไม่ใส่วันนัดส่ง
 *   ต่อร้าน: พิมพ์ QR ร้านนี้ · คัดลอกลิงก์ QR · ดูแบบลูกค้า (หน้าเดียวกับที่ร้านเห็นในไลน์ บน PC) · คนที่ผูก (ถอนผูก/ระงับ/ชื่อเรียก — ย้อนได้)
 *   ร้านที่ไม่อยู่ในรายการ: เลือกจากช่อง "ร้านอื่น" แล้วทำได้เหมือนกัน
 * API: GET /api/admin/line-company/shops · การแก้ใช้ POST /api/admin/line-company เดิม · ปุ่มลูกค้า = ของกลาง customer-actions
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { CustomerPicker, type CustomerPickerValue } from "@/components/pickers";
import { useLineCustomerActions } from "@/components/line-console/customer-actions";

const CustomerView = dynamic(() => import("@/app/a/customer-view").then((m) => m.CustomerView), { ssr: false, loading: () => <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div> });

type Person = { id: string; status: string; contact_name: string; line_name: string; linked_at: string | null; unlinked_at: string | null };
type Shop = { id: string; name: string; code: string; people: Person[]; open_orders: number; missing_due: number; last_order: string | null };
type Pending = { id: string; requested_shop: string; contact_name: string; line_name: string; requested_at: string | null };

const STATUS: Record<string, { label: string; cls: string }> = {
  linked: { label: "ผูกอยู่", cls: "bg-emerald-50 text-emerald-700" },
  blocked: { label: "ระงับ", cls: "bg-rose-50 text-rose-700" },
  unlinked: { label: "ถอนผูกแล้ว", cls: "bg-slate-100 text-slate-500" },
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "-");
const PAGE = 30;

export function LineCompanyShops() {
  const toast = useToast();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [extra, setExtra] = useState<CustomerPickerValue | null>(null);
  const [pick, setPick] = useState<Record<string, CustomerPickerValue | null>>({});
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/admin/line-company/shops"); const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setShops(j.shops as Shop[]); setPending(j.pending as Pending[]); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/admin/line-company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "ไม่สำเร็จ");
      await load();
      return j as Record<string, unknown>;
    } catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); return null; }
    finally { setBusy(false); }
  };
  const { customerAction, decide } = useLineCustomerActions(post);

  const copyLink = async (s: { id: string; name: string }) => {
    const j = await post({ shop_qr: s.id });
    const link = j?.link as string | undefined;
    if (!link) return;
    try { await navigator.clipboard.writeText(link); toast.success(`คัดลอกลิงก์ผูกไลน์ของ ${s.name} แล้ว`); }
    catch { toast.info(link); }
  };
  const printQr = (id: string) => window.open(`/print/line-company-qr?shop=${id}`, "_blank", "noopener");

  const live = (s: Shop) => s.people.filter((p) => p.status === "linked" || p.status === "blocked").length;
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (shops ?? []).filter((s) => (!onlyLinked || live(s) > 0) && (!k || s.name.toLowerCase().includes(k) || s.code.toLowerCase().includes(k)
      || s.people.some((p) => `${p.contact_name} ${p.line_name}`.toLowerCase().includes(k))));
  }, [shops, q, onlyLinked]);

  if (err) return (
    <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      <span className="flex-1">{err}</span><button type="button" onClick={() => void load()} className="h-7 rounded-lg border border-rose-200 bg-white px-2.5 text-xs">ลองใหม่</button>
    </div>
  );
  if (!shops) return <div className="py-6 text-center text-sm text-slate-400">กำลังโหลดร้านค้า…</div>;

  const linkedShops = shops.filter((s) => live(s) > 0).length;
  const extraShop: Shop | null = extra && !shops.some((s) => s.id === extra.id) ? { id: extra.id, name: extra.name, code: "", people: [], open_orders: 0, missing_due: 0, last_order: null } : null;

  const row = (s: Shop) => {
    const n = live(s);
    const isOpen = open === s.id;
    const people = s.people.filter((p) => showUnlinked || p.status !== "unlinked");
    return (
      <div key={s.id} className="py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="min-w-[180px] flex-1">
            <div className="text-sm font-medium text-slate-800">{s.name}{s.code && <span className="ml-1 text-[11px] font-normal text-slate-400">{s.code}</span>}</div>
            <div className="text-[11px] text-slate-500">
              {n > 0 ? <span className="text-emerald-700">ผูกไลน์ {n} คน</span> : <span>ยังไม่มีคนผูก</span>}
              {" · "}งานค้าง {s.open_orders}
              {s.missing_due > 0 && <> · <Link href="/sales/orders?nodue=1" className="text-amber-700 underline">ยังไม่ใส่วันนัดส่ง {s.missing_due}</Link></>}
              {s.last_order && <> · สั่งล่าสุด {fmt(s.last_order)}</>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => printQr(s.id)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] text-slate-700 hover:bg-slate-50"><Icon name="print" /> QR ร้านนี้</button>
            <button type="button" disabled={busy} onClick={() => void copyLink(s)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Icon name="link" /> ลิงก์</button>
            <button type="button" onClick={() => setPreview({ id: s.id, name: s.name })} className="inline-flex h-7 items-center gap-1 rounded-lg border border-indigo-200 px-2 text-[11px] text-indigo-700 hover:bg-indigo-50"><Icon name="view" /> ดูแบบลูกค้า</button>
            {s.people.length > 0 && (
              <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] text-slate-700 hover:bg-slate-50">
                <Icon name="users" /> คนที่ผูก {s.people.length}
              </button>
            )}
          </div>
        </div>
        {isOpen && (
          <div className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/60 px-2">
            {people.length === 0 && <div className="py-2 text-[11px] text-slate-500">ไม่มีคนที่ผูกอยู่ (ติ๊ก &ldquo;แสดงที่ถอนผูกแล้ว&rdquo; เพื่อดูประวัติ)</div>}
            {people.map((p) => {
              const ref = { id: p.id, contact_name: p.contact_name, line_name: p.line_name, partner_name: s.name };
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                  <span className="min-w-[140px] flex-1 truncate text-slate-700">{p.contact_name || p.line_name || "-"}<span className="text-slate-400"> · ไลน์ {p.line_name || "-"} · {p.status === "unlinked" ? `ถอนผูก ${fmt(p.unlinked_at)}` : `ผูก ${fmt(p.linked_at)}`}</span></span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 ${STATUS[p.status]?.cls ?? ""}`}>{STATUS[p.status]?.label ?? p.status}</span>
                  <button type="button" disabled={busy} onClick={() => void customerAction(ref, "rename")} className="h-6 shrink-0 rounded border border-slate-200 bg-white px-2 text-slate-600">ชื่อเรียก</button>
                  {p.status === "linked" && <button type="button" disabled={busy} onClick={() => void customerAction(ref, "block")} className="h-6 shrink-0 rounded border border-rose-200 bg-white px-2 text-rose-600">ระงับ</button>}
                  {p.status === "blocked" && <button type="button" disabled={busy} onClick={() => void customerAction(ref, "unblock")} className="h-6 shrink-0 rounded border border-emerald-200 bg-white px-2 text-emerald-700">คืนสิทธิ์</button>}
                  {(p.status === "linked" || p.status === "blocked") && <button type="button" disabled={busy} onClick={() => void customerAction(ref, "unlink")} className="h-6 shrink-0 rounded border border-slate-200 bg-white px-2 text-slate-600">ถอนผูก</button>}
                  {p.status === "unlinked" && <button type="button" disabled={busy} onClick={() => void post({ link_id: p.id, action: "relink" }).then((j) => j && toast.success("ผูกกลับแล้ว"))} className="h-6 shrink-0 rounded border border-slate-200 bg-white px-2 text-slate-600">ผูกกลับ</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
          <div className="mb-1 text-sm font-medium text-amber-800">ขอผูกร้าน รอยืนยัน {pending.length}</div>
          <div className="divide-y divide-amber-100">
            {pending.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                <span className="min-w-[160px] flex-1 truncate text-slate-700">ขอผูกร้าน: <b>{c.requested_shop}</b><span className="text-slate-400"> · {c.contact_name || c.line_name || "-"} · {fmt(c.requested_at)}</span></span>
                <div className="w-full sm:w-56"><CustomerPicker value={pick[c.id] ?? null} onChange={(v) => setPick((m) => ({ ...m, [c.id]: v }))} disabled={busy} placeholder="เลือกร้านที่ตรงกัน…" /></div>
                <button type="button" disabled={busy} onClick={() => void decide(c, "approve", pick[c.id] ?? null)} className="h-7 shrink-0 rounded-lg bg-emerald-600 px-2.5 text-white disabled:opacity-40">ยืนยันร้าน</button>
                <button type="button" disabled={busy} onClick={() => void decide(c, "reject", null)} className="h-7 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-slate-600">ปฏิเสธ</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="ค้นร้าน / รหัส / ชื่อคนที่ผูก…"
          className="h-9 min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.target.checked)} /> เฉพาะร้านที่มีคนผูก ({linkedShops})</label>
        <button type="button" onClick={() => void load()} className="h-9 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50"><Icon name="refresh" /> รีเฟรช</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>ร้านอื่นที่ไม่อยู่ในรายการ:</span>
        <div className="w-full sm:w-64"><CustomerPicker value={extra} onChange={setExtra} placeholder="เลือกร้านลูกค้า…" /></div>
      </div>

      <div className="divide-y divide-slate-100">
        {extraShop && <div className="rounded-lg bg-indigo-50/40 px-2">{row(extraShop)}</div>}
        {filtered.slice(0, limit).map(row)}
        {filtered.length === 0 && !extraShop && <div className="py-6 text-center text-sm text-slate-500">{shops.length === 0 ? "ยังไม่มีร้านที่มีงานใน 180 วัน — เลือกร้านจากช่อง \"ร้านอื่น\" ได้" : "ไม่พบร้านที่ค้น"}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={showUnlinked} onChange={(e) => setShowUnlinked(e.target.checked)} /> แสดงที่ถอนผูกแล้ว</label>
        <span>แสดง {Math.min(limit, filtered.length)} / {filtered.length} ร้าน · ร้านที่มีงาน 180 วัน + ร้านที่เคยผูกไลน์</span>
        {filtered.length > limit && <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="h-7 rounded-lg border border-slate-200 px-3 text-slate-600">ดูเพิ่ม</button>}
      </div>

      <ERPModal open={!!preview} onClose={() => setPreview(null)} size="md" title={preview ? `ดูแบบลูกค้า · ${preview.name}` : ""}>
        {preview && (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-500">หน้าเดียวกับที่ร้านนี้เห็นในไลน์ (ไม่มีราคา) · วันนัดส่งแก้ได้ที่หน้าใบสั่งขาย</p>
            <div className="overflow-hidden rounded-xl border border-slate-200"><CustomerView key={preview.id} initial="orders" preview={{ partnerId: preview.id }} /></div>
          </div>
        )}
      </ERPModal>
    </div>
  );
}
