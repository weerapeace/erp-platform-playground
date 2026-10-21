"use client";

/**
 * 👤 ประวัติลูกค้าหน้าเดียว (แผงด้านขวา · Drawer กลาง) — สมาชิก หรือแขกที่สั่งด้วยเบอร์เดียวกัน
 * สรุปยอด · ออเดอร์ทั้งหมด · ของที่ซื้อบ่อย · ที่อยู่ที่เคยส่ง · รีวิว · แต้ม/ระดับ · มาจากไหน (ออเดอร์แรก)
 * เปิดจาก: แท็บ 👥 สมาชิก (กดแถว) · แท็บ 🧾 ออเดอร์ (ปุ่ม "ประวัติลูกค้าคนนี้" ในรายละเอียดออเดอร์)
 * ข้อมูล /api/website/customer-profile · กฎ lib/website-customer-profile · อ่านอย่างเดียว (ไม่มีปุ่มแก้)
 */
import { useEffect, useState } from "react";
import { Drawer } from "@/components/modal";
import { MiniTable } from "@/components/mini-table";
import { ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { sourceLabel } from "@/lib/website-web-stats";
import type { CustomerSummary } from "@/lib/website-customer-profile";

type StatusDef = { key: string; label: string; tone: string };
interface Profile {
  member: { id: string; name: string; email: string | null; phone: string; avatarUrl: string | null; status: string; marketingOptIn: boolean; createdAt: string; lastLoginAt: string | null; providers: string[] } | null;
  phone: string;
  summary: CustomerSummary;
  orders: { id: string; orderNo: string; status: string; paymentStatus: string; total: number; createdAt: string; source: string | null; qty: number }[];
  reviews: { id: string; code: string; productName: string; rating: number; body: string; status: string; createdAt: string }[];
  points: { balance: number; spend12m: number; tier: { name: string; color: string } | null } | null;
  wishlist: number;
  statuses: StatusDef[];
  paymentStatuses: StatusDef[];
  error?: string;
}

export interface CustomerRef {
  customerId?: string | null;
  phone?: string | null;
  /** ชื่อไว้โชว์หัวแผงระหว่างโหลด */
  name?: string;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" }) : "–");
const PROVIDER: Record<string, string> = { google: "Google", line: "LINE", facebook: "Facebook", email: "อีเมล", password: "อีเมล" };
const REVIEW_STATUS: Record<string, string> = { pending: "รอตรวจ", approved: "ขึ้นเว็บ", hidden: "ซ่อน" };
const stars = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

export function WebsiteCustomerProfile({ shopSlug, who, onClose }: { shopSlug: string; who: CustomerRef | null; onClose: () => void }) {
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const key = who ? `${who.customerId ?? ""}|${who.phone ?? ""}` : "";

  useEffect(() => {
    if (!who) return;
    setLoading(true);
    setError("");
    setData(null);
    const q = new URLSearchParams({ shop: shopSlug, ...(who.customerId ? { customerId: who.customerId } : {}), ...(who.phone ? { phone: who.phone } : {}) });
    apiFetch(`/api/website/customer-profile?${q}`)
      .then((r) => r.json())
      .then((j: Profile) => (j.error ? setError(j.error) : setData(j)))
      .catch(() => setError("โหลดประวัติลูกค้าไม่สำเร็จ"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSlug, key]);

  const s = data?.summary;
  const m = data?.member;
  const tone = (list: StatusDef[], k: string) => list.find((x) => x.key === k)?.tone ?? "bg-slate-100 text-slate-600";
  const label = (list: StatusDef[], k: string) => list.find((x) => x.key === k)?.label ?? k;
  const title = m?.name || s?.names[0] || who?.name || "ลูกค้า";

  return (
    <Drawer open={!!who} onClose={onClose} title={`👤 ${title}`} description={m ? "สมาชิกเว็บร้าน" : "ลูกค้าแขก (ไม่ได้สมัครสมาชิก) — รวมออเดอร์ที่ใช้เบอร์เดียวกัน"} size="lg" storageKey="website-customer-profile">
      {loading ? (
        <LoadingState label="กำลังโหลดประวัติลูกค้า…" />
      ) : error ? (
        <ErrorState title={error} />
      ) : !data || !s ? null : (
        <div className="space-y-4 text-sm" data-customer-profile>
          {/* ตัวตน */}
          <div className="flex items-start gap-3">
            {m?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <span className="w-12 h-12 rounded-full bg-slate-200 text-slate-500 text-lg flex items-center justify-center shrink-0">{title.slice(0, 1)}</span>
            )}
            <div className="min-w-0 space-y-0.5">
              <p className="text-slate-700">
                📞 {m?.phone || data.phone || "–"}
                {m?.email && <span className="text-slate-500"> · ✉️ {m.email}</span>}
              </p>
              {m && (
                <p className="text-xs text-slate-500">
                  สมัคร {day(m.createdAt)} · เข้าล่าสุด {day(m.lastLoginAt)}
                  {m.providers.length > 0 && ` · เข้าด้วย ${m.providers.map((x) => PROVIDER[x] ?? x).join("/")}`}
                  {m.marketingOptIn && " · รับข่าวสาร ✓"}
                  {m.status === "blocked" && <span className="text-rose-600"> · ระงับอยู่</span>}
                </p>
              )}
              {s.names.length > 1 && <p className="text-xs text-slate-500">ชื่อที่เคยใช้สั่ง: {s.names.join(" · ")}</p>}
              {s.firstSource && <p className="text-xs text-slate-500">รู้จักร้านจาก: {sourceLabel(s.firstSource)} (ออเดอร์แรก)</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="ออเดอร์" value={String(s.orders)} sub={s.cancelled ? `ยกเลิก ${s.cancelled}` : undefined} />
            <Stat label="ซื้อรวม" value={formatAmount(s.spent)} sub={s.orders ? `เฉลี่ย ${formatAmount(s.avg)}` : undefined} />
            <Stat label="ซื้อล่าสุด" value={day(s.lastAt)} sub={s.firstAt ? `ครั้งแรก ${day(s.firstAt)}` : undefined} />
            {data.points ? (
              <Stat label="แต้มคงเหลือ" value={data.points.balance.toLocaleString("th-TH")} sub={data.points.tier ? `ระดับ ${data.points.tier.name}` : undefined} />
            ) : (
              <Stat label="ถูกใจไว้" value={String(data.wishlist)} sub="สินค้า" />
            )}
          </div>

          <MiniTable
            title="🧾 ออเดอร์"
            rows={data.orders}
            rowKey={(o) => o.id}
            dense
            countUnit="ใบ"
            emptyText="ยังไม่มีออเดอร์"
            columns={[
              { key: "no", header: "เลขที่", width: "7.5rem", cell: (o) => <span className="font-mono text-xs">{o.orderNo}</span>, sortValue: (o) => o.orderNo },
              { key: "at", header: "วันที่", width: "5.5rem", cell: (o) => day(o.createdAt), sortValue: (o) => o.createdAt },
              { key: "st", header: "สถานะ", width: "minmax(7.5rem, 1fr)", cell: (o) => (
                <span className="flex flex-wrap gap-1">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${tone(data.statuses, o.status)}`}>{label(data.statuses, o.status)}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${tone(data.paymentStatuses, o.paymentStatus)}`}>{label(data.paymentStatuses, o.paymentStatus)}</span>
                </span>
              ) },
              { key: "qty", header: "ชิ้น", align: "right", width: "3rem", cell: (o) => o.qty },
              { key: "total", header: "ยอด", align: "right", width: "6rem", cell: (o) => formatAmount(o.total), sortValue: (o) => o.total },
            ]}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <section className="rounded-xl border border-slate-200 p-3">
              <h4 className="text-xs font-semibold text-slate-500 mb-2">🛍 ซื้อบ่อย</h4>
              {s.topItems.length ? (
                <ul className="space-y-1">
                  {s.topItems.map((t) => (
                    <li key={t.code} className="flex justify-between gap-2">
                      <span className="truncate"><span className="font-mono text-[11px] text-slate-400">{t.code}</span> {t.name}</span>
                      <span className="tabular-nums text-slate-600 shrink-0">×{t.qty}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400">–</p>
              )}
            </section>
            <section className="rounded-xl border border-slate-200 p-3">
              <h4 className="text-xs font-semibold text-slate-500 mb-2">📍 ที่อยู่ที่เคยส่ง</h4>
              {s.addresses.length ? (
                <ul className="space-y-1.5">
                  {s.addresses.map((a) => (
                    <li key={a.text} className="text-slate-700">
                      {a.text} <span className="text-[11px] text-slate-400">({a.count} ครั้ง · ล่าสุด {day(a.lastAt)})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400">–</p>
              )}
            </section>
          </div>

          {data.reviews.length > 0 && (
            <section className="rounded-xl border border-slate-200 p-3">
              <h4 className="text-xs font-semibold text-slate-500 mb-2">⭐ รีวิว ({data.reviews.length})</h4>
              <ul className="space-y-2">
                {data.reviews.map((r) => (
                  <li key={r.id}>
                    <span className="text-amber-500">{stars(r.rating)}</span> <span className="text-slate-700">{r.productName}</span>
                    <span className="text-[11px] text-slate-400"> · {day(r.createdAt)} · {REVIEW_STATUS[r.status] ?? r.status}</span>
                    {r.body && <p className="text-slate-600 text-xs mt-0.5 line-clamp-2">{r.body}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
