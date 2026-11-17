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
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

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
  get no_price() { return tr("ยังไม่มีราคา (สอบถามราคา)", "No price yet (ask for price)"); },
  get no_image() { return tr("ไม่มีรูปสินค้า", "No product image"); },
  get color_no_image() { return tr("บางสีไม่มีรูป", "Some colors have no image"); },
};

const fmt = (n: number) => n.toLocaleString("th-TH");

export function FeedCheckCard({ siteUrl }: { siteUrl: string }) {
  const toast = useToast();
  const t = useT();
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
      () => toast.success(t(`คัดลอก${what}แล้ว`, `Copied ${what}`)),
      () => toast.error(t("คัดลอกไม่สำเร็จ", "Copy failed")),
    );

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 space-y-2.5" data-feed-check>
      <div className="flex items-center gap-2">
        <Icon value="i:list-check" className="text-slate-600" />
        <p className="flex-1 text-[11px] font-semibold text-slate-700">{t("ตรวจฟีดก่อนส่งให้ Meta (Facebook / Instagram)", "Check the feed before sending to Meta (Facebook / Instagram)")}</p>
        <button
          type="button"
          onClick={() => void run(true)}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] hover:border-blue-500 disabled:opacity-60"
        >
          <Icon value="i:refresh" />
          {busy ? t("กำลังตรวจ…", "Checking…") : t("ตรวจใหม่", "Check again")}
        </button>
      </div>

      {error === "old" && <p className="rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">{t("เว็บร้านยังไม่รองรับการตรวจฟีด (รอเว็บร้านอัปเดตรอบถัดไป แล้วกดตรวจใหม่)", "The shop site doesn't support feed checks yet (wait for the next site update, then check again)")}</p>}
      {error === "empty" && <p className="rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">{t("เว็บร้านโหลดรายการสินค้าไม่ได้ หรือร้านนี้ยังไม่มีสินค้าเผยแพร่ (ERP › เว็บไซต์ › สินค้า) — ลองกดตรวจใหม่อีกครั้ง", "The shop site couldn't load products, or this shop has no published products yet (ERP › Website › Products) — try checking again")}</p>}
      {error === "fail" &&<p className="rounded-md bg-red-50 px-2.5 py-2 text-[11px] text-red-700">{t("ตรวจฟีดไม่สำเร็จ — เปิดเว็บร้านไม่ได้หรือเน็ตสะดุด ลองกดตรวจใหม่", "Feed check failed — couldn't open the shop site or the network dropped. Try again")}</p>}
      {!data && !error && <p className="text-[11px] text-slate-400">{t("กำลังตรวจฟีด…", "Checking feed…")}</p>}

      {data && (
        <>
          {data.closed ? (
            <p className="flex gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
              <Icon value="i:alert-triangle" className="mt-0.5" />
              <span>
                {t("เว็บยังปิดอยู่ (หน้า \"เร็ว ๆ นี้\") — ตอนนี้ Meta ดึงฟีดได้", "The site is still closed (\"Coming soon\" page) — Meta can fetch")} <b>{t("0 รายการ", "0 items")}</b> · {t("ถ้าเปิดเว็บจะมี", "if opened there would be")} <b>{t(`${fmt(data.items)} รายการ`, `${fmt(data.items)} items`)}</b> {t(`จากสินค้า ${fmt(data.products)} รุ่น`, `from ${fmt(data.products)} models`)}
                <br />
                {t("Meta ตรวจว่าเว็บซื้อของได้จริงก่อนอนุมัติร้าน ต้องเปิดเว็บก่อนส่งตรวจ (ข้อมูลร้าน › ร้านค้า › ปิดเว็บชั่วคราว)", "Meta checks that the site can really take orders before approving the shop — open the site before submitting (Shop info › Shop › Close site temporarily)")}
              </span>
            </p>
          ) : data.items > 0 ? (
            <p className="flex gap-2 rounded-md bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">
              <Icon value="i:circle-check" className="mt-0.5" />
              <span>
                {t("ฟีดพร้อม", "Feed ready:")} <b>{t(`${fmt(data.items)} รายการ`, `${fmt(data.items)} items`)}</b> {t(`จากสินค้า ${fmt(data.products)} รุ่น (1 สี = 1 รายการ)`, `from ${fmt(data.products)} models (1 color = 1 item)`)}
              </span>
            </p>
          ) : (
            <p className="flex gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
              <Icon value="i:alert-triangle" className="mt-0.5" />
              <span>{t("ฟีดยังว่าง — ยังไม่มีสินค้าที่มีทั้งราคาและรูป (เผยแพร่สินค้าที่ ERP › เว็บไซต์ › สินค้า)", "Feed is empty — no products have both a price and an image yet (publish products at ERP › Website › Products)")}</span>
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: t("รายการในฟีด", "Items in feed"), value: data.items },
              { label: t("ตกหล่น (ไม่เข้าฟีด)", "Skipped (not in feed)"), value: data.skippedTotal, warn: data.skippedTotal > 0 },
              { label: t("หมดสต็อก (ขึ้นว่าหมด)", "Out of stock (shown as sold out)"), value: data.outOfStock },
              { label: t("ไม่มีคำอธิบาย", "No description"), value: data.noDescription, warn: data.noDescription > 0 },
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
                countUnit={t("รายการ", "items")}
                emptyText={t("ไม่มีรายการตกหล่น", "No skipped items")}
                searchText={(r) => `${r.code} ${r.name} ${r.color ?? ""}`}
                groupBy={(r) => REASON_LABEL[r.reason]}
                maxHeightClass="max-h-64"
                columns={[
                  { key: "code", header: t("รหัสรุ่น", "Model code"), width: "7rem", cell: (r) => <span className="font-mono text-[11px] text-slate-700">{r.code || "—"}</span>, sortValue: (r) => r.code },
                  { key: "name", header: t("สินค้า", "Product"), width: "1fr", cell: (r) => <span className="text-xs">{r.name}</span>, sortValue: (r) => r.name },
                  {
                    key: "reason",
                    header: t("เหตุผล", "Reason"),
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
                {t("แก้ที่สินค้าแม่ (Parent SKU) แท็บเว็บไซต์ — ใส่ราคา/รูปให้ครบ แล้วกด \"ตรวจใหม่\"", "Fix it on the Parent SKU, Website tab — fill in price/images, then click \"Check again\"")}
                {data.skippedTotal > data.skipped.length ? t(` · แสดง ${fmt(data.skipped.length)} จาก ${fmt(data.skippedTotal)} รายการ`, ` · Showing ${fmt(data.skipped.length)} of ${fmt(data.skippedTotal)} items`) : ""}
              </p>
            </div>
          )}

          <div className="rounded-md bg-slate-50 px-2.5 py-2 space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
              <Icon value="i:shopping-cart" />
              {t("Checkout URL (ลิงก์ที่ร้านบน Facebook / Instagram ส่งลูกค้ามาจ่ายเงิน)", "Checkout URL (the link your Facebook / Instagram shop sends customers to pay)")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-[12rem] truncate rounded bg-white border border-slate-200 px-2 py-1 text-[11px] text-slate-800">{data.checkoutUrl}</code>
              <button
                type="button"
                onClick={() => copy(data.checkoutUrl, t("ลิงก์ตะกร้า", "cart link"))}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] hover:border-blue-500"
              >
                <Icon value="i:copy" />
                {t("คัดลอก", "Copy")}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              {t("วางใน Commerce Manager ตอนสร้างร้าน (เลือกให้ลูกค้าชำระเงินบนเว็บไซต์) หรือที่ การตั้งค่า › ร้านค้า ภายหลัง แล้วกดตรวจด้วยเครื่องมือของ Meta · ลูกค้ากดซื้อในเฟซ/ไอจี = ของเข้าตะกร้าเว็บพร้อมจ่ายทันที (ชิ้นที่ต้องเลือกไซส์ ระบบให้ลูกค้าเลือกก่อน)", "Paste it in Commerce Manager when creating the shop (choose checkout on website), or later at Settings › Shop, then verify with Meta's tool · When customers buy on FB/IG, items go straight into the web cart ready to pay (items that need a size ask the customer to pick first)")}
            </p>
            {data.testCartUrl && (
              <a href={data.testCartUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                <Icon value="i:external-link" />
                {t("ลองเปิดตะกร้าตัวอย่าง (1 ชิ้น)", "Try a sample cart (1 item)")}
                {data.closed ? t(" — เว็บยังปิด จะเห็นหน้า \"เร็ว ๆ นี้\"", " — the site is closed, you'll see the \"Coming soon\" page") : ""}
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
