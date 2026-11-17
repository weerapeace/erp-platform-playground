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
import { useT } from "@/components/i18n";
import { getLang, tr } from "@/lib/lang";

type Row = {
  id: string;
  parent_sku_id: string;
  option_label: string | null;
  /** member = สมาชิกกดครั้งเดียว (contact = รหัสสมาชิก · ดูชื่อที่ member) */
  contact_type: RestockContactType | "member";
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
  /** 🆕 ฝากแจ้งตอนชุดมาใหม่เปิดขาย */
  drop?: { id: string; title: string } | null;
  member?: { name: string; email: string } | null;
  /** 🤖 ระบบส่งเองสำเร็จทางไหน */
  auto_channel?: "email" | "line" | null;
};
type Counts = Record<RestockStatus, number>;
type Scope = { shopId?: string; shopSlug?: string; parentId?: string };

const qs = (s: Scope) =>
  [s.shopId ? `shopId=${encodeURIComponent(s.shopId)}` : `shop=${encodeURIComponent(s.shopSlug ?? "")}`, s.parentId ? `parent=${encodeURIComponent(s.parentId)}` : ""].filter(Boolean).join("&");
const dt = (s: string) => new Date(s).toLocaleString(getLang() === "en" ? "en-GB" : "th-TH", { dateStyle: "short", timeStyle: "short" });
const STATUS_CLS: Record<RestockStatus, string> = { pending: "bg-amber-50 text-amber-700", notified: "bg-emerald-50 text-emerald-700", cancelled: "bg-slate-100 text-slate-500" };

/** ตารางรายชื่อ + ตัวกรองสถานะ + ปุ่มจัดการ */
export function RestockRequests({ onCounts, ...scope }: Scope & { onCounts?: (c: Counts) => void }) {
  const t = useT();
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
      setErr(e instanceof Error ? e.message : tr("โหลดไม่สำเร็จ", "Load failed"));
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
      if (!j.ok) throw new Error(j.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
      toast.success(st === "notified" ? t(`ทำเครื่องหมายแจ้งแล้ว ${j.updated} รายการ`, `Marked ${j.updated} as notified`) : st === "cancelled" ? t("ยกเลิกแล้ว", "Cancelled") : t("กลับเป็นรอแจ้งแล้ว", "Moved back to waiting"));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      const j = await apiFetch(`/api/website/restock?id=${encodeURIComponent(del.id)}`, { method: "DELETE" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? t("ลบไม่สำเร็จ", "Delete failed"));
      toast.success(t("ลบแล้ว", "Deleted"));
      setDel(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed"));
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t(`คัดลอก${what}แล้ว`, `Copied ${what}`));
    } catch {
      toast.error(t("คัดลอกไม่สำเร็จ", "Copy failed"));
    }
  };
  const pending = rows.filter((r) => r.status === "pending");
  // ⚡ ส่งแจ้งอัตโนมัติที่ถึงเวลาเดี๋ยวนี้ (ไม่ต้องรอรอบตรวจ ~30 นาที) — ร้านต้องเปิด "แจ้งอัตโนมัติ" ใน 🔔 ก่อน
  const runNow = async () => {
    if (!scope.shopSlug) return;
    setBusy(true);
    try {
      const j = await apiFetch(`/api/cron/webshop-reminders?shop=${encodeURIComponent(scope.shopSlug)}`).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? t("ส่งไม่สำเร็จ", "Send failed"));
      const res = (j.results ?? [])[0] as { restock?: { ready: number; sent: number } } | undefined;
      if (!res) toast.warning(t("ร้านยังไม่ได้เปิด \"แจ้งอัตโนมัติ\" (🏪 ข้อมูลร้าน › 🔔)", "This shop hasn't turned on \"Auto notify\" (🏪 Shop info › 🔔)"));
      else toast.success(t(`ถึงเวลาแจ้ง ${res.restock?.ready ?? 0} รายการ · ส่งแล้ว ${res.restock?.sent ?? 0}`, `${res.restock?.ready ?? 0} due · ${res.restock?.sent ?? 0} sent`));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ส่งไม่สำเร็จ", "Send failed"));
    } finally {
      setBusy(false);
    }
  };
  const contactText = (r: Row) => (r.contact_type === "member" ? `👤 ${r.member?.name || t("สมาชิก", "Member")}${r.member?.email ? ` <${r.member.email}>` : ""}` : formatRestockContact(r.contact_type, r.contact));

  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t(`เกิดข้อผิดพลาดในการโหลดรายชื่อ (${err})`, `Couldn't load the list (${err})`)} <button className="ml-2 underline" onClick={() => void load()}>{t("ลองใหม่", "Retry")}</button></div>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {([["pending", t(`รอแจ้ง (${counts.pending})`, `Waiting (${counts.pending})`)], ["notified", t(`แจ้งแล้ว (${counts.notified})`, `Notified (${counts.notified})`)], ["cancelled", t(`ยกเลิก (${counts.cancelled})`, `Cancelled (${counts.cancelled})`)], ["all", t("ทั้งหมด", "All")]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setStatus(k)} className={`px-2.5 py-1 rounded-full text-xs border ${status === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
        {pending.length > 0 && (
          <div className="ml-auto flex gap-2">
            {scope.shopSlug && (
              <button type="button" disabled={busy} onClick={() => void runNow()} title={t("ส่งให้คนที่ฝากอีเมล / สมาชิก ที่สินค้ามีของแล้ว หรือชุดเปิดขายแล้ว (เบอร์โทร/LINE ID ยังต้องติดต่อเอง)", "Send to email / member requests whose product is back in stock or whose drop is live (phone/LINE ID still need manual contact)")} className="px-2.5 py-1 rounded-lg border border-blue-300 bg-blue-50 text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                {t("⚡ ส่งที่พร้อมตอนนี้", "⚡ Send ready ones now")}
              </button>
            )}
            <button type="button" onClick={() => void copy(pending.map((r) => `${contactText(r)}${r.name && r.contact_type !== "member" ? ` (${r.name})` : ""}`).join("\n"), t("รายชื่อที่รอ", "waiting list"))} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">
              {t("📋 คัดลอกทั้งหมดที่รอ", "📋 Copy all waiting")}
            </button>
            <button type="button" disabled={busy} onClick={() => void setRowStatus(pending.map((r) => r.id), "notified")} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50">
              {t(`✓ แจ้งครบแล้วทั้ง ${pending.length} รายการ`, `✓ Mark all ${pending.length} as notified`)}
            </button>
          </div>
        )}
      </div>
      <MiniTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        dense
        countUnit={t("รายการ", "items")}
        maxHeightClass="max-h-96"
        searchText={(r) => `${r.product.code} ${r.product.name} ${r.drop?.title ?? ""} ${r.member?.name ?? ""} ${r.member?.email ?? ""} ${r.contact} ${r.name ?? ""} ${r.option_label ?? ""}`}
        searchPlaceholder={t("ค้นหารหัส/ชื่อสินค้า/อีเมล/เบอร์…", "Search code/product/email/phone…")}
        emptyText={loading ? t("กำลังโหลด…", "Loading…") : status === "pending" ? t("ยังไม่มีใครรอแจ้งของเข้า — ปุ่มขึ้นในหน้าสินค้าที่ตั้ง \"สินค้าหมด\" (และการ์ดชุดมาใหม่ที่ยังไม่เปิด เมื่อเปิดแจ้งอัตโนมัติ)", "No one is waiting yet — the button shows on products set to \"Sold out\" (and on upcoming new-drop cards when auto notify is on)") : t("ไม่มีรายการ", "No items")}
        columns={[
          ...(scope.parentId
            ? []
            : [{ key: "p", header: t("สินค้า", "Product"), width: "minmax(0,1.3fr)", sortValue: (r: Row) => r.product.code, cell: (r: Row) =>
                  r.drop ? (
                    <div className="min-w-0"><div className="text-xs font-medium text-slate-800 truncate">{t("🆕 ชุด", "🆕 Drop")} {r.drop.title}</div><div className="text-[11px] text-slate-400 truncate">{t("แจ้งตอนเปิดขาย", "Notify at launch")}</div></div>
                  ) : (
                    <div className="min-w-0"><div className="text-xs font-medium text-slate-800 truncate">{r.product.code}</div><div className="text-[11px] text-slate-400 truncate">{r.product.name}</div></div>
                  ) }]),
          { key: "opt", header: t("สี/ตัวเลือก", "Color/option"), width: "7rem", cell: (r: Row) => <span className="text-xs text-slate-600">{r.option_label ?? "—"}</span> },
          {
            key: "c",
            header: t("ช่องทาง", "Contact"),
            width: "minmax(0,1.4fr)",
            cell: (r: Row) => {
              if (r.contact_type === "member")
                return (
                  <div className="min-w-0 flex items-center gap-1.5" title={t("สมาชิกกดรับแจ้ง — ระบบส่งทาง LINE ที่เข้าระบบไว้ / อีเมลที่ยืนยันแล้ว", "Member requested — sent via their logged-in LINE / verified email")}>
                    <span>👤</span>
                    <span className="text-xs text-slate-800 truncate">{r.member?.name || t("สมาชิก", "Member")}</span>
                    {r.member?.email && <span className="text-[11px] text-slate-400 truncate">· {r.member.email}</span>}
                    {r.lang === "en" && <span className="text-[10px] px-1 rounded bg-sky-100 text-sky-700">EN</span>}
                  </div>
                );
              const ct = RESTOCK_CONTACTS.find((x) => x.value === r.contact_type);
              const shown = formatRestockContact(r.contact_type, r.contact);
              return (
                <div className="min-w-0 flex items-center gap-1.5">
                  <span title={ct?.label}>{ct?.icon}</span>
                  {r.contact_type === "email" ? (
                    <a href={`mailto:${r.contact}`} className="text-xs text-blue-700 hover:underline truncate">{shown}</a>
                  ) : r.contact_type === "phone" ? (
                    <a href={`tel:${r.contact}`} className="text-xs text-blue-700 hover:underline">{shown}</a>
                  ) : (
                    <span className="text-xs text-slate-800 truncate">{shown}</span>
                  )}
                  <button type="button" onClick={() => void copy(shown, ct?.label ?? "")} className="text-[11px] text-slate-400 hover:text-slate-700" title={t("คัดลอก", "Copy")}>📋</button>
                  {r.name && <span className="text-[11px] text-slate-400 truncate">· {r.name}</span>}
                  {r.lang === "en" && <span className="text-[10px] px-1 rounded bg-sky-100 text-sky-700" title={t("ลูกค้าฝากชื่อจากหน้าเว็บภาษาอังกฤษ — ตอบเป็นภาษาอังกฤษ", "Customer signed up from the English site — reply in English")}>EN</span>}
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
                      void copy(text, lang === "en" ? t("ข้อความแจ้ง (อังกฤษ)", "message (English)") : t("ข้อความแจ้ง", "message"));
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-700 shrink-0"
                    title={r.lang === "en" ? t("คัดลอกข้อความ \"ของเข้าแล้ว\" ภาษาอังกฤษ", "Copy the English \"back in stock\" message") : t("คัดลอกข้อความ \"ของเข้าแล้ว\"", "Copy the \"back in stock\" message")}
                  >
                    💬
                  </button>
                </div>
              );
            },
          },
          { key: "at", header: t("ฝากเมื่อ", "Requested"), width: "7.5rem", sortValue: (r: Row) => r.created_at, cell: (r: Row) => <span className="text-[11px] text-slate-500">{dt(r.created_at)}</span> },
          {
            key: "st",
            header: t("สถานะ", "Status"),
            width: "6.5rem",
            cell: (r: Row) => (
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_CLS[r.status]}`} title={r.notified_at ? t(`แจ้งเมื่อ ${dt(r.notified_at)}${r.notified_by ? ` โดย ${r.notified_by}` : ""}`, `Notified ${dt(r.notified_at)}${r.notified_by ? ` by ${r.notified_by}` : ""}`) : undefined}>
                {r.auto_channel ? "🤖 " : ""}
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
                    <button type="button" disabled={busy} onClick={() => void setRowStatus([r.id], "notified")} className="text-emerald-700 hover:underline">{t("✓ แจ้งแล้ว", "✓ Notified")}</button>
                    <button type="button" disabled={busy} onClick={() => void setRowStatus([r.id], "cancelled")} className="text-slate-500 hover:underline">{t("ยกเลิก", "Cancel")}</button>
                  </>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void setRowStatus([r.id], "pending")} className="text-slate-500 hover:underline">{t("↺ กลับเป็นรอแจ้ง", "↺ Back to waiting")}</button>
                )}
                <button type="button" onClick={() => setDel(r)} className="text-red-500 hover:underline">{t("ลบ", "Delete")}</button>
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => void remove()}
        title={t("ลบรายชื่อนี้?", "Delete this entry?")}
        message={del ? t(`ลบ ${contactText(del)} (${del.drop ? `ชุด ${del.drop.title}` : del.product.code || "สินค้า"}) ออกจากรายชื่อรอของเข้า — ลบแล้วกู้คืนไม่ได้ (ถ้าแค่ไม่ต้องแจ้งแล้ว ใช้ "ยกเลิก" แทน)`, `Remove ${contactText(del)} (${del.drop ? `drop ${del.drop.title}` : del.product.code || "product"}) from the restock waiting list — this can't be undone (if you just don't need to notify, use "Cancel" instead)`) : ""}
        confirmText={t("ลบ", "Delete")}
        variant="danger"
        loading={busy}
      />
    </div>
  );
}

/** การ์ดในแท็บ "🏪 ข้อมูลร้าน" (แท็บย่อย 🔔 รอแจ้งของเข้า) — ทุกสินค้าของร้าน · defaultOpen = เปิดรายชื่อเลย */
export function RestockCard({ shopSlug, cardCls, defaultOpen = false }: { shopSlug: string; cardCls: string; defaultOpen?: boolean }) {
  const t = useT();
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
        <h3 className="text-sm font-semibold text-slate-800">{t("🔔 ลูกค้ารอแจ้งของเข้า", "🔔 Customers waiting for restock")}</h3>
        <span className="text-xs text-slate-500">{n == null ? "…" : t(`รอแจ้ง ${n} รายการ`, `${n} waiting`)} {t(`(ฝากจากหน้าสินค้าที่ตั้ง "สินค้าหมด")`, `(from products set to "Sold out")`)}</span>
        <button onClick={() => setOpen((v) => !v)} className="ml-auto px-3 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">
          {open ? t("ซ่อน", "Hide") : t("ดูรายชื่อ", "View list")}
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
  const t = useT();
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
        title={soldOut ? t("ลูกค้าที่ฝากให้แจ้งเมื่อมีของ", "Customers who asked to be notified when it's back") : t("ของกลับมาแล้ว — อย่าลืมแจ้งลูกค้าที่รออยู่", "Back in stock — remember to notify waiting customers")}
      >
        🔔 {soldOut ? t(`มี ${n} คนรอของเข้า`, `${n} waiting for restock`) : t(`ของเข้าแล้ว — แจ้ง ${n} คนที่รอ`, `Back in stock — notify ${n} waiting`)}
      </button>
      <ERPModal open={open} onClose={() => setOpen(false)} title={t("🔔 ลูกค้ารอแจ้งของเข้า", "🔔 Customers waiting for restock")} description={t("ติดต่อลูกค้าตามช่องทางที่ฝากไว้ แล้วติ๊ก ✓ แจ้งแล้ว", "Contact customers through the channel they left, then tick ✓ Notified")} size="xl">

        {open && <RestockRequests shopId={shopId} parentId={parentId} onCounts={(c) => setN(c.pending)} />}
      </ERPModal>
    </>
  );
}
