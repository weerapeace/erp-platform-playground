"use client";

/**
 * 📈 แท็บสถิติเว็บร้าน (/website/<shop>?tab=stats) — นับเองจากเว็บร้าน ไม่ต้องตั้ง Google Analytics · ไม่เก็บว่าใครเข้า
 *
 * ตัวเลขสรุป · ขั้นการซื้อ (เข้าเว็บ → ดูสินค้า → ใส่ตะกร้า → เริ่มชำระ → สั่งซื้อ) · รายวัน · แหล่งที่มา · อุปกรณ์ · หน้าแรกที่เข้า
 * สินค้าที่ถูกดู · คำค้น · 🧪 ผลทดสอบ A/B — ตาราง = MiniTable กลาง · ว่าง/โหลด/พัง = state-views กลาง
 * ข้อมูล /api/website/web-stats · กฎ lib/website-web-stats · เว็บร้านยิงตัวนับที่ src/lib/site-stats.ts
 */
import { useCallback, useEffect, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { sourceLabel, type AbResult, type WebStatsSummary } from "@/lib/website-web-stats";
import { useT } from "@/components/i18n";
import { getLang, tr } from "@/lib/lang";

interface Resp {
  since: string;
  days: number;
  summary: WebStatsSummary;
  names: Record<string, string>;
  terms: { q: string; hits: number; lastResults: number }[];
  error?: string;
}

const RANGES = [7, 30, 90] as const;
const DEVICE_LABEL: Record<string, string> = {
  get mobile() { return tr("📱 มือถือ", "📱 Mobile"); },
  get tablet() { return tr("📲 แท็บเล็ต", "📲 Tablet"); },
  get desktop() { return tr("💻 คอมพิวเตอร์", "💻 Desktop"); },
};
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : "–");
const n = (v: number) => v.toLocaleString("th-TH");
const thDay = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString(getLang() === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-800 tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const VERDICT: Record<AbResult["verdict"], { text: string; cls: string }> = {
  need_more: { get text() { return tr("⏳ คนยังน้อย — รอให้แต่ละกลุ่มมีคนเห็นอย่างน้อย 100 คน", "⏳ Not enough visitors — wait until each group has at least 100 viewers"); }, cls: "bg-slate-100 text-slate-600" },
  no_diff: { get text() { return tr("🤝 ยังไม่ต่างกันชัดเจน", "🤝 No clear difference yet"); }, cls: "bg-amber-50 text-amber-700" },
  A: { get text() { return tr("🏆 แบบ A ขายดีกว่า (มั่นใจ 95%)", "🏆 Version A sells better (95% confidence)"); }, cls: "bg-emerald-50 text-emerald-700" },
  B: { get text() { return tr("🏆 แบบ B ขายดีกว่า (มั่นใจ 95%)", "🏆 Version B sells better (95% confidence)"); }, cls: "bg-emerald-50 text-emerald-700" },
};

export function WebsiteStatsPanel({ shopId }: { shopId: string }) {
  const t = useT();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch(`/api/website/web-stats?shopId=${encodeURIComponent(shopId)}&days=${days}`)
      .then((r) => r.json())
      .then((j: Resp) => {
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch(() => setError(tr("โหลดสถิติไม่สำเร็จ", "Couldn't load stats")))
      .finally(() => setLoading(false));
  }, [shopId, days]);
  useEffect(load, [load]);

  const s = data?.summary;
  const tot = s?.totals;
  const funnel = tot
    ? [
        { label: t("เข้าเว็บ", "Visit site"), v: tot.sessions },
        { label: t("ดูสินค้า", "Viewed product"), v: tot.viewed },
        { label: t("ใส่ตะกร้า", "Added to cart"), v: tot.carted },
        { label: t("เริ่มชำระเงิน", "Started checkout"), v: tot.checkout },
        { label: t("สั่งซื้อ", "Ordered"), v: tot.orders },
      ]
    : [];
  const maxDay = Math.max(1, ...(s?.daily ?? []).map((d) => d.sessions));
  const maxDev = Math.max(1, ...(s?.devices ?? []).map((d) => d.sessions));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setDays(r)} className={`px-3 py-1.5 text-sm rounded-md ${days === r ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {t(`${r} วัน`, `${r} days`)}
            </button>
          ))}
        </div>
        <button onClick={load} className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50" disabled={loading}>
          {t("↻ โหลดใหม่", "↻ Reload")}
        </button>
        <p className="text-xs text-slate-500">{t("นับเองจากเว็บร้าน (ไม่ต้องตั้ง Google) · นับเป็นตัวเลขรวม ไม่เก็บว่าใครเข้า · \"รอบ\" = เข้าเว็บ 1 ครั้ง (เงียบเกิน 30 นาที = รอบใหม่)", "Counted by the shop site itself (no Google setup) · totals only, doesn't record who visited · \"session\" = 1 visit (over 30 minutes idle = new session)")}</p>
      </div>

      {loading && !data ? (
        <LoadingState label={t("กำลังโหลดสถิติ…", "Loading stats…")} />
      ) : error ? (
        <ErrorState title={error} onRetry={load} />
      ) : !s || !tot ? null : tot.sessions === 0 && tot.orders === 0 ? (
        <EmptyState icon="📈" title={t("ยังไม่มีสถิติในช่วงนี้", "No stats for this period yet")} hint={t("ตัวนับเริ่มทำงานหลังอัปเดตเว็บร้านชุดนี้ — ตัวเลขจะขึ้นเมื่อมีลูกค้าเข้าเว็บ (ไม่นับตอนเปิดพรีวิวจาก ERP)", "The counter starts after this shop site update — numbers appear when customers visit (ERP previews aren't counted)")} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Kpi label={t("รอบเข้าเว็บ", "Sessions")} value={n(tot.sessions)} sub={t(`เปิดหน้า ${n(tot.pageviews)}`, `${n(tot.pageviews)} page views`)} />
            <Kpi label={t("ดูสินค้า", "Viewed product")} value={n(tot.viewed)} sub={t(`${pct(tot.viewed, tot.sessions)} ของรอบ`, `${pct(tot.viewed, tot.sessions)} of sessions`)} />
            <Kpi label={t("ใส่ตะกร้า", "Added to cart")} value={n(tot.carted)} sub={t(`${pct(tot.carted, tot.sessions)} ของรอบ`, `${pct(tot.carted, tot.sessions)} of sessions`)} />
            <Kpi label={t("ออเดอร์", "Orders")} value={n(tot.orders)} sub={t("ไม่นับที่ยกเลิก", "Excl. cancelled")} />
            <Kpi label={t("ยอดขาย", "Sales")} value={formatAmount(tot.revenue)} sub={tot.orders ? t(`เฉลี่ย ${formatAmount(Math.round(tot.revenue / tot.orders))}/ออเดอร์`, `Avg ${formatAmount(Math.round(tot.revenue / tot.orders))}/order`) : undefined} />
            <Kpi label={t("อัตราซื้อ", "Conversion")} value={pct(tot.orders, tot.sessions)} sub={t("ออเดอร์ ÷ รอบเข้าเว็บ", "Orders ÷ sessions")} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title={t("🪜 ขั้นการซื้อ", "🪜 Purchase funnel")} hint={t("ลูกค้าหลุดตรงไหนมากที่สุด — แท่งสั้นลงมาก = ขั้นนั้นมีปัญหา", "Where customers drop off most — a big drop in bar length = a problem at that step")}>
              <div className="space-y-2">
                {funnel.map((f, i) => {
                  const prev = i ? funnel[i - 1].v : 0;
                  const w = tot.sessions ? Math.max(2, (f.v / tot.sessions) * 100) : 0;
                  return (
                    <div key={f.label} data-funnel-step>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-slate-700">{i + 1}. {f.label}</span>
                        <span className="tabular-nums text-slate-800 font-medium">
                          {n(f.v)} <span className="text-xs text-slate-400 font-normal">{pct(f.v, tot.sessions)}</span>
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden mt-1">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, w)}%` }} />
                      </div>
                      {i > 0 && prev > 0 && f.v < prev && <div className="text-[11px] text-rose-500 mt-0.5">{t(`หลุด ${pct(prev - f.v, prev)} จากขั้นก่อน`, `${pct(prev - f.v, prev)} dropped from previous step`)}</div>}
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title={t("📅 รายวัน", "📅 Daily")} hint={t("แท่ง = รอบเข้าเว็บ · ตัวเลขบน = ออเดอร์ (ชี้ที่แท่งดูยอด)", "Bar = sessions · number on top = orders (hover a bar for sales)")}>
              {s.daily.length ? (
                <div className="flex items-end gap-[3px] h-40 overflow-x-auto">
                  {s.daily.map((d) => (
                    <div key={d.day} className="flex-1 min-w-[10px] flex flex-col items-center justify-end h-full" title={t(`${thDay(d.day)} · ${n(d.sessions)} รอบ · ${n(d.orders)} ออเดอร์ · ${formatAmount(d.revenue)}`, `${thDay(d.day)} · ${n(d.sessions)} sessions · ${n(d.orders)} orders · ${formatAmount(d.revenue)}`)}>
                      {d.orders > 0 && <span className="text-[10px] text-emerald-600 font-semibold">{d.orders}</span>}
                      <div className="w-full rounded-t bg-blue-400/80" style={{ height: `${Math.max(2, (d.sessions / maxDay) * 100)}%` }} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">{t("ยังไม่มีข้อมูล", "No data yet")}</p>
              )}
              {s.daily.length > 0 && (
                <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                  <span>{thDay(s.daily[0].day)}</span>
                  <span>{thDay(s.daily[s.daily.length - 1].day)}</span>
                </div>
              )}
            </Section>
          </div>

          <MiniTable
            title={t("🧭 ลูกค้ามาจากไหน", "🧭 Traffic sources")}
            rows={s.sources}
            rowKey={(r) => r.source}
            dense
            countUnit={t("แหล่ง", "sources")}
            columns={[
              { key: "source", header: t("แหล่งที่มา", "Source"), width: "1.6fr", cell: (r) => sourceLabel(r.source), sortValue: (r) => sourceLabel(r.source) },
              { key: "sessions", header: t("รอบ", "Sessions"), align: "right", width: "5rem", cell: (r) => n(r.sessions), sortValue: (r) => r.sessions },
              { key: "carted", header: t("ใส่ตะกร้า", "Added to cart"), align: "right", width: "6rem", cell: (r) => n(r.carted), sortValue: (r) => r.carted },
              { key: "orders", header: t("ออเดอร์", "Orders"), align: "right", width: "5rem", cell: (r) => n(r.orders), sortValue: (r) => r.orders },
              { key: "revenue", header: t("ยอดขาย", "Sales"), align: "right", width: "7rem", cell: (r) => formatAmount(r.revenue), sortValue: (r) => r.revenue },
              { key: "conv", header: t("อัตราซื้อ", "Conversion"), align: "right", width: "6rem", cell: (r) => (r.sessions ? pct(r.orders, r.sessions) : "–"), sortValue: (r) => (r.sessions ? r.orders / r.sessions : -1) },
            ]}
            footnote={t("แหล่ง = ลิงก์ที่ลูกค้ากดมา (Google/Facebook/LINE…) หรือรหัส utm_source ในลิงก์โฆษณา · ใส่ ?utm_source=ชื่อ ท้ายลิงก์ที่แชร์ จะแยกได้ละเอียดขึ้น", "Source = the link customers came from (Google/Facebook/LINE…) or the utm_source code in ad links · add ?utm_source=name to shared links for finer breakdown")}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title={t("📱 อุปกรณ์", "📱 Devices")}>
              <div className="space-y-2">
                {s.devices.length ? (
                  s.devices.map((d) => (
                    <div key={d.device}>
                      <div className="flex justify-between text-sm">
                        <span>{DEVICE_LABEL[d.device] ?? d.device}</span>
                        <span className="tabular-nums">
                          {n(d.sessions)} <span className="text-xs text-slate-400">{pct(d.sessions, tot.sessions)}</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-1">
                        <div className="h-full bg-violet-400" style={{ width: `${(d.sessions / maxDev) * 100}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">{t("ยังไม่มีข้อมูล", "No data yet")}</p>
                )}
              </div>
            </Section>
            <MiniTable
              title={t("🚪 หน้าแรกที่ลูกค้าเข้า", "🚪 Landing pages")}
              rows={s.landing}
              rowKey={(r) => r.path}
              dense
              countUnit={t("หน้า", "pages")}
              emptyText={t("ยังไม่มีข้อมูล", "No data yet")}
              columns={[
                { key: "path", header: t("หน้า", "Page"), width: "1fr", cell: (r) => <span className="font-mono text-xs break-all">{r.path}</span> },
                { key: "sessions", header: t("รอบ", "Sessions"), align: "right", width: "5rem", cell: (r) => n(r.sessions), sortValue: (r) => r.sessions },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MiniTable
              title={t("👀 สินค้าที่ถูกดู", "👀 Viewed products")}
              rows={s.products}
              rowKey={(r) => r.code}
              dense
              countUnit={t("รุ่น", "models")}
              emptyText={t("ยังไม่มีข้อมูล", "No data yet")}
              columns={[
                { key: "code", header: t("รุ่น", "Model"), width: "1.6fr", cell: (r) => <span><span className="font-mono text-xs text-slate-500">{r.code}</span> {data?.names[r.code] ?? ""}</span>, sortValue: (r) => r.code },
                { key: "views", header: t("ดู", "Views"), align: "right", width: "4.5rem", cell: (r) => n(r.views), sortValue: (r) => r.views },
                { key: "carts", header: t("ใส่ตะกร้า", "Added to cart"), align: "right", width: "5.5rem", cell: (r) => n(r.carts), sortValue: (r) => r.carts },
                { key: "rate", header: t("% ใส่", "% added"), align: "right", width: "4.5rem", cell: (r) => pct(r.carts, r.views), sortValue: (r) => (r.views ? r.carts / r.views : -1) },
              ]}
              footnote={t("ดูเยอะแต่ใส่ตะกร้าน้อย = ลองเช็กราคา/รูป/รายละเอียดของรุ่นนั้น", "Many views but few add-to-carts = check that model's price/photos/details")}
            />
            <MiniTable
              title={t("🔍 คำที่ลูกค้าค้น", "🔍 Customer searches")}
              rows={data?.terms ?? []}
              rowKey={(r) => r.q}
              dense
              countUnit={t("คำ", "terms")}
              emptyText={t("ยังไม่มีคนค้น", "No searches yet")}
              columns={[
                { key: "q", header: t("คำค้น", "Search term"), width: "1fr", cell: (r) => <span className={r.lastResults === 0 ? "text-rose-600" : ""}>{r.q}</span> },
                { key: "hits", header: t("ครั้ง", "Times"), align: "right", width: "4.5rem", cell: (r) => n(r.hits), sortValue: (r) => r.hits },
                { key: "res", header: t("เจอ", "Results"), align: "right", width: "4.5rem", cell: (r) => (r.lastResults === 0 ? <span className="text-rose-600">{t("ไม่เจอ", "None found")}</span> : n(r.lastResults)) },
              ]}
              footnote={t("สีแดง = ค้นแล้วไม่เจอ → เติมคำพ้องที่ 🏪 ข้อมูลร้าน › 🔍", "Red = no results → add synonyms in 🏪 Shop info › 🔍")}
            />
          </div>

          <Section title={t("🧪 ทดสอบ A/B", "🧪 A/B tests")} hint={t("ตั้งที่ Section ในหน้าแรก/หน้าเว็บ (🧪 ทดสอบ A/B) — ลูกค้าครึ่งหนึ่งเห็นแบบ A อีกครึ่งเห็นแบบ B แล้วเทียบว่าแบบไหนขายดีกว่า", "Set up in a Section on the home page/web pages (🧪 A/B test) — half of customers see version A, the other half version B, then compare which sells better")}>
            {s.ab.length ? (
              <div className="space-y-3">
                {s.ab.map((x) => (
                  <div key={x.exp} className="border border-slate-200 rounded-lg p-3" data-ab-result={x.exp}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">{x.exp}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${VERDICT[x.verdict].cls}`}>{VERDICT[x.verdict].text}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                      {(["A", "B"] as const).map((v) => (
                        <div key={v} className={`rounded-lg p-2 ${x.verdict === v ? "bg-emerald-50" : "bg-slate-50"}`}>
                          <div className="font-semibold">{t(`แบบ ${v}`, `Version ${v}`)}</div>
                          <div className="text-slate-600 tabular-nums">
                            {t(`เห็น ${n(x[v].seen)} · ใส่ตะกร้า ${n(x[v].carts)} · ออเดอร์ ${n(x[v].orders)}`, `Seen ${n(x[v].seen)} · added to cart ${n(x[v].carts)} · orders ${n(x[v].orders)}`)}
                          </div>
                          <div className="text-slate-800 tabular-nums">
                            {t("อัตราซื้อ", "Conversion")} <b>{pct(x[v].orders, x[v].seen)}</b> · {formatAmount(x[v].revenue)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">{t("ยังไม่มีการทดสอบในช่วงนี้", "No tests in this period")}</p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
