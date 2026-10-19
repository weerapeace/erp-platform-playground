"use client";
/**
 * 🔔 รายชื่อ "แจ้งฉันเมื่อมีของ" (ของกลาง) — ลูกค้าฝากอีเมล/เบอร์/LINE ไว้ที่หน้าสินค้าที่ตั้ง "สินค้าหมด"
 *   ใช้ที่: แท็บ "🏪 ข้อมูลร้าน" (ทุกสินค้าของร้าน) · drawer สินค้าบนเว็บ (parentId = เฉพาะรุ่นนั้น ผ่าน RestockBadge)
 *   ทีมติดต่อเอง → ติ๊ก "แจ้งแล้ว" (เก็บเวลา+คนแจ้ง) · ยกเลิก · ลบ (ConfirmDialog) · คัดลอกช่องทาง
 *   💬 คัดลอกข้อความ "ของเข้าแล้ว" ในภาษาที่ลูกค้าใช้ตอนฝากชื่อ (ป้าย EN = ลูกค้าหน้าอังกฤษ · ถ้อยคำ lib/customer-messages)
 * API: /api/website/restock · ตรวจค่า lib/website-restock · ตาราง store_restock_requests
 */
import { useCallback, useEffect, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { RESTOCK_CONTACTS, RESTOCK_STATUS_LABEL, formatRestockContact, type RestockContactType, type RestockStatus } from "@/lib/website-restock";
import { localizedUrl, restockMessage } from "@/lib/customer-messages";
import { productHref } from "@/lib/website-links";

type Row = {
  id: string;
  parent_sku_id: string;
  option_label: string | null;
  contact_type: RestockContactType;
  contact: string;
  name: string | null;
  status: RestockStatus;
  notified_at: string | null;
  notified_by: string | null;
  created_at: string;
  /** 🌐 ภาษาที่ลูกค้าใช้ตอนฝากชื่อ */
  lang?: "th" | "en";
  option_en?: string | null;
  product: { code: string; name: string; name_en?: string };
};
type Counts = Record<RestockStatus, number>;
type Scope = { shopId?: string; shopSlug?: string; parentId?: string };

const qs = (s: Scope) =>
  [s.shopId ? `shopId=${encodeURIComponent(s.shopId)}` : `shop=${encodeURIComponent(s.shopSlug ?? "")}`, s.parentId ? `parent=${encodeURIComponent(s.parentId)}` : ""].filter(Boolean).join("&");
const dt = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
const STATUS_CLS: Record<RestockStatus, string> = { pending: "bg-amber-50 text-amber-700", notified: "bg-emerald-50 text-emerald-700", cancelled: "bg-slate-100 text-slate-500" };

/** ตารางรายชื่อ + ตัวกรองสถานะ + ปุ่มจัดการ */
export function RestockRequests({ onCounts, ...scope }: Scope & { onCounts?: (c: Counts) => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<RestockStatus | "all">("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, notified: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [del, setDel] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [msgCtx, setMsgCtx] = useState<{ shopName: string; siteUrl: string | null }>({ shopName: "", siteUrl: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch(`/api/website/restock?${qs(scope)}&status=${status}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows(j.rows ?? []);
      setCounts(j.counts);
      if (j.messaging) setMsgCtx(j.messaging);
      onCounts?.(j.counts);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.shopId, scope.shopSlug, scope.parentId, status]);
  useEffect(() => {
    void load();
  }, [load]);

  const setRowStatus = async (ids: string[], st: RestockStatus) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      const j = await apiFetch("/api/website/restock", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, status: st }) }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "บันทึกไม่สำเร็จ");
      toast.success(st === "notified" ? `ทำเครื่องหมายแจ้งแล้ว ${j.updated} รายการ` : st === "cancelled" ? "ยกเลิกแล้ว" : "กลับเป็นรอแจ้งแล้ว");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      const j = await apiFetch(`/api/website/restock?id=${encodeURIComponent(del.id)}`, { method: "DELETE" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "ลบไม่สำเร็จ");
      toast.success("ลบแล้ว");
      setDel(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`คัดลอก${what}แล้ว`);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  };
  const pending = rows.filter((r) => r.status === "pending");

  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">เกิดข้อผิดพลาดในการโหลดรายชื่อ ({err}) <button className="ml-2 underline" onClick={() => void load()}>ลองใหม่</button></div>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {([["pending", `รอแจ้ง (${counts.pending})`], ["notified", `แจ้งแล้ว (${counts.notified})`], ["cancelled", `ยกเลิก (${counts.cancelled})`], ["all", "ทั้งหมด"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setStatus(k)} className={`px-2.5 py-1 rounded-full text-xs border ${status === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
        {pending.length > 0 && (
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => void copy(pending.map((r) => `${formatRestockContact(r.contact_type, r.contact)}${r.name ? ` (${r.name})` : ""}`).join("\n"), "รายชื่อที่รอ")} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">
              📋 คัดลอกทั้งหมดที่รอ
            </button>
            <button type="button" disabled={busy} onClick={() => void setRowStatus(pending.map((r) => r.id), "notified")} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50">
              ✓ แจ้งครบแล้วทั้ง {pending.length} รายการ
            </button>
          </div>
        )}
      </div>
      <MiniTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        dense
        countUnit="รายการ"
        maxHeightClass="max-h-96"
        searchText={(r) => `${r.product.code} ${r.product.name} ${r.contact} ${r.name ?? ""} ${r.option_label ?? ""}`}
        searchPlaceholder="ค้นหารหัส/ชื่อสินค้า/อีเมล/เบอร์…"
        emptyText={loading ? "กำลังโหลด…" : status === "pending" ? "ยังไม่มีใครรอแจ้งของเข้า — ปุ่มขึ้นในหน้าสินค้าที่ตั้ง \"สินค้าหมด\"" : "ไม่มีรายการ"}
        columns={[
          ...(scope.parentId
            ? []
            : [{ key: "p", header: "สินค้า", width: "minmax(0,1.3fr)", sortValue: (r: Row) => r.product.code, cell: (r: Row) => <div className="min-w-0"><div className="text-xs font-medium text-slate-800 truncate">{r.product.code}</div><div className="text-[11px] text-slate-400 truncate">{r.product.name}</div></div> }]),
          { key: "opt", header: "สี/ตัวเลือก", width: "7rem", cell: (r: Row) => <span className="text-xs text-slate-600">{r.option_label ?? "—"}</span> },
          {
            key: "c",
            header: "ช่องทาง",
            width: "minmax(0,1.4fr)",
            cell: (r: Row) => {
              const t = RESTOCK_CONTACTS.find((x) => x.value === r.contact_type);
              const shown = formatRestockContact(r.contact_type, r.contact);
              return (
                <div className="min-w-0 flex items-center gap-1.5">
                  <span title={t?.label}>{t?.icon}</span>
                  {r.contact_type === "email" ? (
                    <a href={`mailto:${r.contact}`} className="text-xs text-blue-700 hover:underline truncate">{shown}</a>
                  ) : r.contact_type === "phone" ? (
                    <a href={`tel:${r.contact}`} className="text-xs text-blue-700 hover:underline">{shown}</a>
                  ) : (
                    <span className="text-xs text-slate-800 truncate">{shown}</span>
                  )}
                  <button type="button" onClick={() => void copy(shown, t?.label ?? "")} className="text-[11px] text-slate-400 hover:text-slate-700" title="คัดลอก">📋</button>
                  {r.name && <span className="text-[11px] text-slate-400 truncate">· {r.name}</span>}
                  {r.lang === "en" && <span className="text-[10px] px-1 rounded bg-sky-100 text-sky-700" title="ลูกค้าฝากชื่อจากหน้าเว็บภาษาอังกฤษ — ตอบเป็นภาษาอังกฤษ">EN</span>}
                  <button
                    type="button"
                    onClick={() => {
                      const lang = r.lang === "en" ? "en" : "th";
                      const text = restockMessage(
                        {
                          productName: (lang === "en" && r.product.name_en) || r.product.name || r.product.code,
                          option: (lang === "en" && r.option_en) || r.option_label,
                          productUrl: r.product.code ? localizedUrl(msgCtx.siteUrl, productHref(r.product.code), lang) : null,
                          customerName: r.name,
                        },
                        { name: msgCtx.shopName },
                        lang
                      );
                      void copy(text, lang === "en" ? "ข้อความแจ้ง (อังกฤษ)" : "ข้อความแจ้ง");
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-700 shrink-0"
                    title={r.lang === "en" ? "คัดลอกข้อความ \"ของเข้าแล้ว\" ภาษาอังกฤษ" : "คัดลอกข้อความ \"ของเข้าแล้ว\""}
                  >
                    💬
                  </button>
                </div>
              );
            },
          },
          { key: "at", header: "ฝากเมื่อ", width: "7.5rem", sortValue: (r: Row) => r.created_at, cell: (r: Row) => <span className="text-[11px] text-slate-500">{dt(r.created_at)}</span> },
          {
            key: "st",
            header: "สถานะ",
            width: "6.5rem",
            cell: (r: Row) => (
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_CLS[r.status]}`} title={r.notified_at ? `แจ้งเมื่อ ${dt(r.notified_at)}${r.notified_by ? ` โดย ${r.notified_by}` : ""}` : undefined}>
                {RESTOCK_STATUS_LABEL[r.status]}
              </span>
            ),
          },
          {
            key: "act",
            header: "",
            width: "9.5rem",
            cell: (r: Row) => (
              <div className="flex items-center justify-end gap-2 text-[11px]">
                {r.status === "pending" ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => void setRowStatus([r.id], "notified")} className="text-emerald-700 hover:underline">✓ แจ้งแล้ว</button>
                    <button type="button" disabled={busy} onClick={() => void setRowStatus([r.id], "cancelled")} className="text-slate-500 hover:underline">ยกเลิก</button>
                  </>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void setRowStatus([r.id], "pending")} className="text-slate-500 hover:underline">↺ กลับเป็นรอแจ้ง</button>
                )}
                <button type="button" onClick={() => setDel(r)} className="text-red-500 hover:underline">ลบ</button>
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => void remove()}
        title="ลบรายชื่อนี้?"
        message={del ? `ลบ ${formatRestockContact(del.contact_type, del.contact)} (${del.product.code || "สินค้า"}) ออกจากรายชื่อรอของเข้า — ลบแล้วกู้คืนไม่ได้ (ถ้าแค่ไม่ต้องแจ้งแล้ว ใช้ "ยกเลิก" แทน)` : ""}
        confirmText="ลบ"
        variant="danger"
        loading={busy}
      />
    </div>
  );
}

/** การ์ดในแท็บ "🏪 ข้อมูลร้าน" (แท็บย่อย 🔔 รอแจ้งของเข้า) — ทุกสินค้าของร้าน · defaultOpen = เปิดรายชื่อเลย */
export function RestockCard({ shopSlug, cardCls, defaultOpen = false }: { shopSlug: string; cardCls: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/website/restock?shop=${encodeURIComponent(shopSlug)}&countOnly=1`)
      .then((r) => r.json())
      .then((j) => alive && setN(j.counts?.pending ?? 0))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shopSlug]);
  return (
    <section className={cardCls}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">🔔 ลูกค้ารอแจ้งของเข้า</h3>
        <span className="text-xs text-slate-500">{n == null ? "…" : `รอแจ้ง ${n} รายการ`} (ฝากจากหน้าสินค้าที่ตั้ง &quot;สินค้าหมด&quot;)</span>
        <button onClick={() => setOpen((v) => !v)} className="ml-auto px-3 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">
          {open ? "ซ่อน" : "ดูรายชื่อ"}
        </button>
      </div>
      {open && (
        <div className="mt-3">
          <RestockRequests shopSlug={shopSlug} onCounts={(c) => setN(c.pending)} />
        </div>
      )}
    </section>
  );
}

/** ป้ายใน drawer สินค้าบนเว็บ: "🔔 มี N คนรอของเข้า" → ป๊อปรายชื่อเฉพาะรุ่นนี้ (ไม่มีใครรอ = ไม่โชว์) */
export function RestockBadge({ shopId, parentId, soldOut }: { shopId: string; parentId: string; soldOut: boolean }) {
  const [n, setN] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/website/restock?shopId=${encodeURIComponent(shopId)}&parent=${encodeURIComponent(parentId)}&countOnly=1`)
      .then((r) => r.json())
      .then((j) => alive && setN(j.counts?.pending ?? 0))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shopId, parentId]);
  if (!n && !open) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${soldOut ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-800 animate-pulse"}`}
        title={soldOut ? "ลูกค้าที่ฝากให้แจ้งเมื่อมีของ" : "ของกลับมาแล้ว — อย่าลืมแจ้งลูกค้าที่รออยู่"}
      >
        🔔 {soldOut ? `มี ${n} คนรอของเข้า` : `ของเข้าแล้ว — แจ้ง ${n} คนที่รอ`}
      </button>
      <ERPModal open={open} onClose={() => setOpen(false)} title="🔔 ลูกค้ารอแจ้งของเข้า" description="ติดต่อลูกค้าตามช่องทางที่ฝากไว้ แล้วติ๊ก ✓ แจ้งแล้ว" size="xl">
        {open && <RestockRequests shopId={shopId} parentId={parentId} onCounts={(c) => setN(c.pending)} />}
      </ERPModal>
    </>
  );
}
