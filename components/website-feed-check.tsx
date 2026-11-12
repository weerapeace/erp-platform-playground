"use client";

/**
 * ตรวจฟีดสินค้า + Checkout URL ของร้านบน Facebook / Instagram (Meta Shops)
 *
 * อ่านรายงานจากเว็บร้าน `<siteUrl>/feeds/check.json` — ตัวสร้างฟีดตัวเดียวกับฟีดจริง (storefront src/lib/product-feed.ts feedReport)
 * จึงบอกได้ตรงว่า Meta จะได้สินค้ากี่รายการ ชิ้นไหนตกหล่นเพราะอะไร · นับได้แม้เว็บยังปิด ("ถ้าเปิดเว็บจะมีกี่รายการ")
 * Checkout URL = `<siteUrl>/checkout/meta` (storefront src/app/checkout/meta) — วางใน Commerce Manager ตอนสร้างร้าน
 *
 * ใช้ที่: components/website-info-panel.tsx กลุ่ม "วัดผลและโฆษณา" ใต้ลิงก์ฟีด · คู่มือ docs/website-tracking.md
 */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { MiniTable } from "@/components/mini-table";
import { useToast } from "@/components/toast";

type SkipReason = "no_price" | "no_image" | "color_no_image";
interface FeedSkip {
  code: string;
  name: string;
  slug: string;
  reason: SkipReason;
  color?: string;
}
interface FeedCheck {
  shop: string;
  origin: string;
  closed: boolean;
  products: number;
  items: number;
  outOfStock: number;
  noDescription: number;
  skippedTotal: number;
  skipped: FeedSkip[];
  feedUrl: string;
  checkoutUrl: string;
  testCartUrl: string | null;
  checkedAt: string;
}

const REASON_LABEL: Record<SkipReason, string> = {
  no_price: "ยังไม่มีราคา (สอบถามราคา)",
  no_image: "ไม่มีรูปสินค้า",
  color_no_image: "บางสีไม่มีรูป",
};

const fmt = (n: number) => n.toLocaleString("th-TH");

export function FeedCheckCard({ siteUrl }: { siteUrl: string }) {
  const toast = useToast();
  const base = siteUrl.replace(/\/$/, "");
  const [data, setData] = useState<FeedCheck | null>(null);
  const [error, setError] = useState<"old" | "empty" | "fail" | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (fresh = false) => {
      setBusy(true);
      setError(null);
      try {
        // ตรวจใหม่ = ข้ามแคชหน้าเว็บ (รายงานแคชไว้ 1 นาที)
        const r = await fetch(`${base}/feeds/check.json${fresh ? `?t=${Date.now()}` : ""}`, { cache: "no-store" });
        if (r.status === 404) {
          setError("old");
          return;
        }
        if (r.status === 503) {
          setError("empty");
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        setData((await r.json()) as FeedCheck);
      } catch {
        setError("fail");
      } finally {
        setBusy(false);
      }
    },
    [base],
  );

  useEffect(() => {
    void run();
  }, [run]);

  const copy = (url: string, what: string) =>
    navigator.clipboard?.writeText(url).then(
      () => toast.success(`คัดลอก${what}แล้ว`),
      () => toast.error("คัดลอกไม่สำเร็จ"),
    );

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 space-y-2.5" data-feed-check>
      <div className="flex items-center gap-2">
        <Icon value="i:list-check" className="text-slate-600" />
        <p className="flex-1 text-[11px] font-semibold text-slate-700">ตรวจฟีดก่อนส่งให้ Meta (Facebook / Instagram)</p>
        <button
          type="button"
          onClick={() => void run(true)}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] hover:border-blue-500 disabled:opacity-60"
        >
          <Icon value="i:refresh" />
          {busy ? "กำลังตรวจ…" : "ตรวจใหม่"}
        </button>
      </div>

      {error === "old" && <p className="rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">เว็บร้านยังไม่รองรับการตรวจฟีด (รอเว็บร้านอัปเดตรอบถัดไป แล้วกดตรวจใหม่)</p>}
      {error === "empty" && <p className="rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">เว็บร้านโหลดรายการสินค้าไม่ได้ หรือร้านนี้ยังไม่มีสินค้าเผยแพร่ (ERP › เว็บไซต์ › สินค้า) — ลองกดตรวจใหม่อีกครั้ง</p>}
      {error === "fail" &&<p className="rounded-md bg-red-50 px-2.5 py-2 text-[11px] text-red-700">ตรวจฟีดไม่สำเร็จ — เปิดเว็บร้านไม่ได้หรือเน็ตสะดุด ลองกดตรวจใหม่</p>}
      {!data && !error && <p className="text-[11px] text-slate-400">กำลังตรวจฟีด…</p>}

      {data && (
        <>
          {data.closed ? (
            <p className="flex gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
              <Icon value="i:alert-triangle" className="mt-0.5" />
              <span>
                เว็บยังปิดอยู่ (หน้า &quot;เร็ว ๆ นี้&quot;) — ตอนนี้ Meta ดึงฟีดได้ <b>0 รายการ</b> · ถ้าเปิดเว็บจะมี <b>{fmt(data.items)} รายการ</b> จากสินค้า {fmt(data.products)} รุ่น
                <br />
                Meta ตรวจว่าเว็บซื้อของได้จริงก่อนอนุมัติร้าน ต้องเปิดเว็บก่อนส่งตรวจ (ข้อมูลร้าน › ร้านค้า › ปิดเว็บชั่วคราว)
              </span>
            </p>
          ) : data.items > 0 ? (
            <p className="flex gap-2 rounded-md bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">
              <Icon value="i:circle-check" className="mt-0.5" />
              <span>
                ฟีดพร้อม <b>{fmt(data.items)} รายการ</b> จากสินค้า {fmt(data.products)} รุ่น (1 สี = 1 รายการ)
              </span>
            </p>
          ) : (
            <p className="flex gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
              <Icon value="i:alert-triangle" className="mt-0.5" />
              <span>ฟีดยังว่าง — ยังไม่มีสินค้าที่มีทั้งราคาและรูป (เผยแพร่สินค้าที่ ERP › เว็บไซต์ › สินค้า)</span>
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "รายการในฟีด", value: data.items },
              { label: "ตกหล่น (ไม่เข้าฟีด)", value: data.skippedTotal, warn: data.skippedTotal > 0 },
              { label: "หมดสต็อก (ขึ้นว่าหมด)", value: data.outOfStock },
              { label: "ไม่มีคำอธิบาย", value: data.noDescription, warn: data.noDescription > 0 },
            ].map((s) => (
              <div key={s.label} className="rounded-md bg-slate-50 px-2.5 py-1.5">
                <p className="text-[10px] text-slate-500">{s.label}</p>
                <p className={`text-sm font-semibold ${s.warn ? "text-amber-700" : "text-slate-800"}`}>{fmt(s.value)}</p>
              </div>
            ))}
          </div>

          {data.skippedTotal > 0 && (
            <div>
              <MiniTable<FeedSkip>
                rows={data.skipped}
                rowKey={(r) => `${r.slug}|${r.reason}|${r.color ?? ""}`}
                dense
                countUnit="รายการ"
                emptyText="ไม่มีรายการตกหล่น"
                searchText={(r) => `${r.code} ${r.name} ${r.color ?? ""}`}
                groupBy={(r) => REASON_LABEL[r.reason]}
                maxHeightClass="max-h-64"
                columns={[
                  { key: "code", header: "รหัสรุ่น", width: "7rem", cell: (r) => <span className="font-mono text-[11px] text-slate-700">{r.code || "—"}</span>, sortValue: (r) => r.code },
                  { key: "name", header: "สินค้า", width: "1fr", cell: (r) => <span className="text-xs">{r.name}</span>, sortValue: (r) => r.name },
                  {
                    key: "reason",
                    header: "เหตุผล",
                    width: "10rem",
                    cell: (r) => (
                      <span className="text-[11px] text-amber-700">
                        {REASON_LABEL[r.reason]}
                        {r.color ? ` (${r.color})` : ""}
                      </span>
                    ),
                    sortValue: (r) => r.reason,
                  },
                ]}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                แก้ที่สินค้าแม่ (Parent SKU) แท็บเว็บไซต์ — ใส่ราคา/รูปให้ครบ แล้วกด &quot;ตรวจใหม่&quot;
                {data.skippedTotal > data.skipped.length ? ` · แสดง ${fmt(data.skipped.length)} จาก ${fmt(data.skippedTotal)} รายการ` : ""}
              </p>
            </div>
          )}

          <div className="rounded-md bg-slate-50 px-2.5 py-2 space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
              <Icon value="i:shopping-cart" />
              Checkout URL (ลิงก์ที่ร้านบน Facebook / Instagram ส่งลูกค้ามาจ่ายเงิน)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-[12rem] truncate rounded bg-white border border-slate-200 px-2 py-1 text-[11px] text-slate-800">{data.checkoutUrl}</code>
              <button
                type="button"
                onClick={() => copy(data.checkoutUrl, "ลิงก์ตะกร้า")}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] hover:border-blue-500"
              >
                <Icon value="i:copy" />
                คัดลอก
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              วางใน Commerce Manager ตอนสร้างร้าน (เลือกให้ลูกค้าชำระเงินบนเว็บไซต์) หรือที่ การตั้งค่า › ร้านค้า ภายหลัง แล้วกดตรวจด้วยเครื่องมือของ Meta · ลูกค้ากดซื้อในเฟซ/ไอจี = ของเข้าตะกร้าเว็บพร้อมจ่ายทันที (ชิ้นที่ต้องเลือกไซส์ ระบบให้ลูกค้าเลือกก่อน)
            </p>
            {data.testCartUrl && (
              <a href={data.testCartUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                <Icon value="i:external-link" />
                ลองเปิดตะกร้าตัวอย่าง (1 ชิ้น)
                {data.closed ? " — เว็บยังปิด จะเห็นหน้า \"เร็ว ๆ นี้\"" : ""}
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
