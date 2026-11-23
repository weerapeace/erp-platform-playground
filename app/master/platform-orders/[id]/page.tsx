"use client";

// 📄 หน้ารายละเอียดออเดอร์เต็มหน้า (แบบ Zort) — เจ้าของเลือก widget 2026-11-23 แบบ A + ข้อ 1-4
//   ซ้าย: ข้อมูล · ลูกค้า · สินค้า · การจัดส่ง · การชำระเงิน (รายได้จริงจากร้าน) · เอกสาร · ประวัติ
//   ขวา: แผง "จัดการออเดอร์" = ปุ่มสถานะ/ผู้รับ/ขนส่ง/ใบกำกับ ชุดเดียวกับแผงข้างเดิม (OrderDrawer variant="panel" — ไม่เขียนซ้ำ)
// ข้อมูล: GET /api/platform-orders?id= (+ชื่อแบรนด์/ร้าน · เอกสารที่พิมพ์ · คนแพ็ก · ประวัติ) · รายได้: GET /api/platform-orders/income?id= (Shopee · อ่านอย่างเดียว)
// ไม่เก็บ/ไม่โชว์ที่อยู่ลูกค้าของออเดอร์ร้านค้า (ข้อมูลส่วนตัว · เจ้าของยังไม่อนุญาต) — ออเดอร์ช่องทางของเราแก้ที่อยู่ได้ในแผงขวา

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { PlatformBadge } from "@/components/platform-icon";
import { HoverImage } from "@/components/hover-image";
import { ErrorState, LoadingState } from "@/components/state-views";
import { r2ImageUrl } from "@/lib/r2-image";
import { formatDateTime } from "@/lib/date";
import {
  PAYMENT_STATE_META, SHIP_DUE_LABEL, isUrgentCarrier, paymentState, platformStatusLabel, platformStatusWarning, shipDue,
  type PlatformOrderItemRow,
} from "@/lib/platform-order-status";
import { manualChannelLabel } from "@/lib/order-shipping";
import { StatusChip } from "../status-chip";
import { OrderDrawer } from "../order-drawer";
import { InvoiceModal } from "../invoice-modal";
import { ShipModal } from "../ship-modal";

type Order = Record<string, unknown> & {
  id: string; status: string; source: string | null; platform_code: string | null; platform_name: string | null; brand_name: string | null;
  docs?: { pick: string | null; pack: string | null; label: string | null };
  packed_by_name?: string | null;
  history?: { at: string; action: string; by: string | null; status: string | null; note: string | null }[];
};
type Item = PlatformOrderItemRow & { raw?: { variant?: string | null } | null };
type Income = { buyer_paid: number | null; escrow: number | null; lines: { key: string; label: string; amount: number }[]; at?: string };

const THB = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 }));
const PAY_TONE: Record<string, string> = { success: "bg-emerald-50 text-emerald-700", warning: "bg-amber-50 text-amber-800", info: "bg-sky-50 text-sky-700", muted: "bg-slate-100 text-slate-500" };

function Box({ icon, title, right, children }: { icon: string; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Icon value={icon} className="text-slate-400" />{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-slate-400">{k}</dt><dd className="min-w-0 break-words text-slate-800">{v ?? "—"}</dd></div>)}
    </dl>
  );
}

export default function PlatformOrderDetailPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = decodeURIComponent(String(rawId ?? ""));
  const router = useRouter();
  const toast = useToast();
  const { can } = useAuth();
  const canManage = can("platform_orders.manage");
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [income, setIncome] = useState<{ loading: boolean; data?: Income; reason?: string; error?: string }>({ loading: false });
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/platform-orders?id=${encodeURIComponent(id)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setOrder(j.order as Order); setItems((j.items ?? []) as Item[]); setErr(null);
    } catch (e) { setErr((e as Error).message || "โหลดออเดอร์ไม่สำเร็จ"); }
  }, [id]);
  useEffect(() => { void load(); }, [load, reloadKey]);

  const loadIncome = useCallback(async (fresh = false) => {
    setIncome((p) => ({ ...p, loading: true }));
    try {
      const j = await apiFetch(`/api/platform-orders/income?id=${encodeURIComponent(id)}${fresh ? "&fresh=1" : ""}`).then((r) => r.json());
      setIncome({ loading: false, data: j.income as Income | undefined, reason: j.supported === false ? j.reason : undefined, error: j.error ?? undefined });
    } catch { setIncome({ loading: false, error: "โหลดรายได้ไม่สำเร็จ" }); }
  }, [id]);
  useEffect(() => { if (order && !String(order.id).startsWith("demo-")) void loadIncome(); }, [order?.id, loadIncome]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => setReloadKey((k) => k + 1);
  const orderNo = String(order?.order_no ?? order?.external_order_id ?? "");
  const raw = (order?.raw ?? {}) as { shopee?: { payment_method?: string; pay_time?: number; message_to_seller?: string | null; packages?: { package_number?: string }[] }; channel?: string };
  const itemsSum = useMemo(() => items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 0), 0), [items]);
  const qtySum = items.reduce((a, it) => a + (Number(it.qty) || 0), 0);
  const total = order?.total == null ? null : Number(order.total);
  const discount = total != null && itemsSum > total + 0.5 ? itemsSum - total : 0;

  if (err) return <div className="mx-auto max-w-6xl p-6"><ErrorState title={err} onRetry={() => void load()} /></div>;
  if (!order) return <div className="mx-auto max-w-6xl p-6"><LoadingState variant="cards" rows={4} /></div>;

  const pStatus = (order.platform_status as string | null) ?? null;
  const warn = platformStatusWarning(pStatus);
  const due = shipDue({ status: order.status, ship_by_at: (order.ship_by_at as string | null) ?? null });
  const carrier = (order.carrier as string | null) ?? null;
  const pay = PAYMENT_STATE_META[paymentState({ status: order.status, platform_status: pStatus, cod_amount: Number(order.cod_amount) || 0 })];
  const printUrl = (kind: string) => `/print/platform-orders?kind=${kind}&ids=${encodeURIComponent(order.id)}`;
  const channel = order.platform_code
    ? <PlatformBadge code={order.platform_code} name={order.platform_name ?? order.platform_code} size="xs" />
    : <span>{manualChannelLabel(raw.channel) || "สร้างเอง"}</span>;
  const vatBase = total != null ? total / 1.07 : null;

  // ประวัติ: เวลาจากออเดอร์ + การพิมพ์ + ประวัติการแก้ (audit)
  const timeline: { at: string; text: string }[] = [
    order.ordered_at ? { at: String(order.ordered_at), text: "สั่งซื้อ" } : null,
    raw.shopee?.pay_time ? { at: new Date(raw.shopee.pay_time * 1000).toISOString(), text: `ชำระเงิน${raw.shopee.payment_method ? ` (${raw.shopee.payment_method})` : ""}` } : null,
    order.docs?.pick ? { at: order.docs.pick, text: "พิมพ์ใบหยิบ" } : null,
    order.docs?.pack ? { at: order.docs.pack, text: "พิมพ์ใบแพ็ก" } : null,
    order.packed_at ? { at: String(order.packed_at), text: `แพ็กเสร็จ${order.packed_by_name ? ` · ${order.packed_by_name}` : ""} (สถานีแพ็ค)` } : null,
    order.docs?.label ? { at: order.docs.label, text: "พิมพ์ใบปะหน้า" } : null,
    ...(order.history ?? []).map((h) => ({ at: h.at, text: `${h.status ? `เปลี่ยนสถานะเป็น ${h.status}` : h.action === "import" ? "ดึงออเดอร์" : h.action === "create" ? "สร้างออเดอร์" : `แก้ไข (${h.action})`}${h.by ? ` · ${h.by}` : ""}` })),
  ].filter((x): x is { at: string; text: string } => !!x).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      {/* หัว */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/master/platform-orders" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><Icon value="i:arrow-left" />ศูนย์ออเดอร์</Link>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-slate-900">
            <span className="font-mono">{orderNo || "ออเดอร์"}</span>
            <button type="button" title="คัดลอกเลขออเดอร์" onClick={() => void navigator.clipboard?.writeText(orderNo).then(() => toast.success("คัดลอกแล้ว"), () => toast.error("คัดลอกไม่ได้"))} className="text-slate-400 hover:text-slate-600"><Icon value="i:copy" /></button>
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <StatusChip s={order.status} />
            {pStatus && <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">บนร้าน: {platformStatusLabel(pStatus)}</span>}
            {isUrgentCarrier(carrier) && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700"><Icon value="i:bolt" className="mr-0.5" />{carrier}</span>}
            {due !== "none" && due !== "later" && <span className={`rounded-full px-2 py-0.5 ${due === "late" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{SHIP_DUE_LABEL[due]}</span>}
            <span className={`rounded-full px-2 py-0.5 ${PAY_TONE[pay.tone]}`}>{pay.label}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["pick", "pack", "label"] as const).map((k) => (
            <a key={k} href={printUrl(k)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
              <Icon value={k === "pick" ? "i:list-check" : k === "pack" ? "i:package" : "i:printer"} />{k === "pick" ? "ใบหยิบ" : k === "pack" ? "ใบแพ็ก" : "ใบปะหน้า"}
            </a>
          ))}
        </div>
      </div>
      {warn && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon name="warning" className="mr-1" />{warn}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Box icon="i:file-text" title="ข้อมูล">
              <KV rows={[
                ["รายการ", <span key="n" className="font-mono">{orderNo}</span>],
                ["วันที่สั่ง", formatDateTime(order.ordered_at ?? order.created_at) || "—"],
                ["ช่องทาง", <span key="c" className="flex flex-wrap items-center gap-1.5">{channel}{order.brand_name && <span className="text-xs text-slate-500">{order.brand_name}</span>}</span>],
                ["ชำระเงิน", raw.shopee?.payment_method ? `${raw.shopee.payment_method}${raw.shopee.pay_time ? ` · ${formatDateTime(new Date(raw.shopee.pay_time * 1000).toISOString())}` : ""}` : pay.label],
              ]} />
            </Box>
            <Box icon="i:user" title="ลูกค้า">
              <KV rows={[
                ["ชื่อผู้ซื้อ", String(order.customer_name ?? "—")],
                ["ข้อความถึงร้าน", raw.shopee?.message_to_seller ? <span key="m" className="text-amber-800">{raw.shopee.message_to_seller}</span> : "—"],
                ["ใบกำกับภาษี", order.invoice_so_id ? "ออกแล้ว" : order.tax_invoice_request != null ? "ผู้ซื้อขอใบกำกับ" : "—"],
              ]} />
            </Box>
          </div>

          <Box icon="i:package" title={`สินค้า (${items.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-2 py-1.5 font-medium">#</th><th className="px-2 py-1.5 font-medium">รหัส</th><th className="px-2 py-1.5 font-medium">ชื่อสินค้า</th>
                  <th className="px-2 py-1.5 text-right font-medium">จำนวน</th><th className="px-2 py-1.5 text-right font-medium">ต่อหน่วย</th><th className="px-2 py-1.5 text-right font-medium">รวม</th>
                </tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.id} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-2 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-2 py-2 font-mono text-xs text-sky-700">{it.sku_code || "—"}{!it.matched_sku_id && !it.matched_parent_sku_id && <div className="font-sans text-[10px] text-rose-500">ยังไม่จับคู่สินค้า</div>}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <HoverImage url={r2ImageUrl(it.image_key ?? null, 600)} size={40} previewSize={300} rounded="rounded-md" fallback="" />
                          <div className="min-w-0 text-xs text-slate-800">{it.name || "—"}{(it.raw?.variant || it.color) && <div className="text-slate-400">{[it.raw?.variant, it.color].filter(Boolean).join(" · ")}</div>}</div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{it.qty}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{THB(it.price)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{it.price != null ? THB(Number(it.price) * Number(it.qty)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end">
              <dl className="grid min-w-[240px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
                <dt className="text-slate-500">จำนวนทั้งหมด</dt><dd className="text-right tabular-nums">{qtySum}</dd>
                {itemsSum > 0 && <><dt className="text-slate-500">รวมค่าสินค้า</dt><dd className="text-right tabular-nums">{THB(itemsSum)}</dd></>}
                {discount > 0 && <><dt className="text-slate-500">ส่วนลด</dt><dd className="text-right tabular-nums">−{THB(discount)}</dd></>}
                <dt className="rounded-l bg-slate-100 px-2 py-1 font-semibold text-slate-800">มูลค่ารวม (ผู้ซื้อจ่าย)</dt><dd className="rounded-r bg-slate-100 px-2 py-1 text-right text-base font-semibold tabular-nums">{THB(total)}</dd>
              </dl>
            </div>
          </Box>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Box icon="i:truck" title="การจัดส่ง">
              <KV rows={[
                ["ต้องส่งภายใน", order.ship_by_at ? formatDateTime(order.ship_by_at) : "—"],
                ["ขนส่ง", carrier ?? "—"],
                ["Tracking No.", order.tracking_no ? <span key="t" className="font-mono">{String(order.tracking_no)}</span> : "—"],
                ["เลขพัสดุร้าน", raw.shopee?.packages?.[0]?.package_number ?? (order.package_no ? String(order.package_no) : "—")],
                ["แพ็กเสร็จ", order.packed_at ? `${formatDateTime(order.packed_at)}${order.packed_by_name ? ` · ${order.packed_by_name}` : ""}` : "—"],
                ["เก็บปลายทาง", Number(order.cod_amount) > 0 ? `฿${THB(Number(order.cod_amount))}` : "—"],
              ]} />
            </Box>
            <Box icon="i:coin" title="การชำระเงิน" right={income.data?.at ? <button type="button" onClick={() => void loadIncome(true)} className="text-xs text-sky-700 hover:underline" title={`ดึงล่าสุด ${formatDateTime(income.data.at)}`}>{income.loading ? "กำลังดึง…" : "ดึงใหม่"}</button> : null}>
              {income.loading && !income.data ? <p className="text-xs text-slate-400">กำลังดึงรายได้จากร้าน…</p> : (
                <div className="space-y-2">
                  {income.data && (
                    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                      {income.data.buyer_paid != null && <><dt className="text-slate-500">ผู้ซื้อจ่าย</dt><dd className="text-right tabular-nums">{THB(income.data.buyer_paid)}</dd></>}
                      {income.data.lines.map((l) => <div key={l.key} className="contents"><dt className="text-slate-500">{l.label}</dt><dd className={`text-right tabular-nums ${l.amount < 0 ? "text-rose-600" : ""}`}>{l.amount < 0 ? "−" : ""}{THB(Math.abs(l.amount))}</dd></div>)}
                      {income.data.escrow != null && <><dt className="font-semibold text-slate-800">รายได้จากร้าน (เงินเข้า)</dt><dd className="text-right font-semibold tabular-nums text-emerald-700">{THB(income.data.escrow)}</dd></>}
                    </dl>
                  )}
                  {income.reason && <p className="text-xs text-slate-500">{income.reason}</p>}
                  {income.error && <p className="text-xs text-amber-700">ดึงรายได้จากร้านไม่ได้: {income.error}</p>}
                  {vatBase != null && (
                    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                      <dt>มูลค่าก่อนภาษี</dt><dd className="text-right tabular-nums">{THB(vatBase)}</dd>
                      <dt>ภาษีมูลค่าเพิ่ม (7%)</dt><dd className="text-right tabular-nums">{THB((total ?? 0) - vatBase)}</dd>
                    </dl>
                  )}
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${PAY_TONE[pay.tone]}`}>{pay.label}</span>
                </div>
              )}
            </Box>
          </div>

          <Box icon="i:history" title="ประวัติ">
            {timeline.length ? (
              <ol className="space-y-1.5 text-sm">
                {timeline.map((t, i) => <li key={i} className="flex gap-3"><span className="w-32 shrink-0 text-xs text-slate-400">{formatDateTime(t.at)}</span><span className="text-slate-700">{t.text}</span></li>)}
              </ol>
            ) : <p className="text-xs text-slate-400">ยังไม่มีประวัติ</p>}
          </Box>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">จัดการออเดอร์</h2>
          <OrderDrawer id={order.id} variant="panel" reloadKey={reloadKey} canManage={canManage} onClose={() => router.push("/master/platform-orders")}
            onChanged={refresh} onInvoice={() => setInvoiceOpen(true)} onShip={() => setShipOpen(true)} />
        </div>
      </div>

      {invoiceOpen && <InvoiceModal orderId={order.id} canManage={canManage} onClose={() => setInvoiceOpen(false)} onIssued={refresh} />}
      {shipOpen && <ShipModal ids={[order.id]} onClose={() => setShipOpen(false)} onBooked={() => { setShipOpen(false); refresh(); }} onOpenSettings={() => { setShipOpen(false); router.push("/master/platform-orders"); }} />}
    </div>
  );
}
