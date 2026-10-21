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

interface Resp {
  since: string;
  days: number;
  summary: WebStatsSummary;
  names: Record<string, string>;
  terms: { q: string; hits: number; lastResults: number }[];
  error?: string;
}

const RANGES = [7, 30, 90] as const;
const DEVICE_LABEL: Record<string, string> = { mobile: "📱 มือถือ", tablet: "📲 แท็บเล็ต", desktop: "💻 คอมพิวเตอร์" };
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : "–");
const n = (v: number) => v.toLocaleString("th-TH");
const thDay = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });

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
  need_more: { text: "⏳ คนยังน้อย — รอให้แต่ละกลุ่มมีคนเห็นอย่างน้อย 100 คน", cls: "bg-slate-100 text-slate-600" },
  no_diff: { text: "🤝 ยังไม่ต่างกันชัดเจน", cls: "bg-amber-50 text-amber-700" },
  A: { text: "🏆 แบบ A ขายดีกว่า (มั่นใจ 95%)", cls: "bg-emerald-50 text-emerald-700" },
  B: { text: "🏆 แบบ B ขายดีกว่า (มั่นใจ 95%)", cls: "bg-emerald-50 text-emerald-700" },
};

export function WebsiteStatsPanel({ shopId }: { shopId: string }) {
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
      .catch(() => setError("โหลดสถิติไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [shopId, days]);
  useEffect(load, [load]);

  const s = data?.summary;
  const t = s?.totals;
  const funnel = t
    ? [
        { label: "เข้าเว็บ", v: t.sessions },
        { label: "ดูสินค้า", v: t.viewed },
        { label: "ใส่ตะกร้า", v: t.carted },
        { label: "เริ่มชำระเงิน", v: t.checkout },
        { label: "สั่งซื้อ", v: t.orders },
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
              {r} วัน
            </button>
          ))}
        </div>
        <button onClick={load} className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50" disabled={loading}>
          ↻ โหลดใหม่
        </button>
        <p className="text-xs text-slate-500">นับเองจากเว็บร้าน (ไม่ต้องตั้ง Google) · นับเป็นตัวเลขรวม ไม่เก็บว่าใครเข้า · "รอบ" = เข้าเว็บ 1 ครั้ง (เงียบเกิน 30 นาที = รอบใหม่)</p>
      </div>

      {loading && !data ? (
        <LoadingState label="กำลังโหลดสถิติ…" />
      ) : error ? (
        <ErrorState title={error} onRetry={load} />
      ) : !s || !t ? null : t.sessions === 0 && t.orders === 0 ? (
        <EmptyState icon="📈" title="ยังไม่มีสถิติในช่วงนี้" hint="ตัวนับเริ่มทำงานหลังอัปเดตเว็บร้านชุดนี้ — ตัวเลขจะขึ้นเมื่อมีลูกค้าเข้าเว็บ (ไม่นับตอนเปิดพรีวิวจาก ERP)" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Kpi label="รอบเข้าเว็บ" value={n(t.sessions)} sub={`เปิดหน้า ${n(t.pageviews)}`} />
            <Kpi label="ดูสินค้า" value={n(t.viewed)} sub={`${pct(t.viewed, t.sessions)} ของรอบ`} />
            <Kpi label="ใส่ตะกร้า" value={n(t.carted)} sub={`${pct(t.carted, t.sessions)} ของรอบ`} />
            <Kpi label="ออเดอร์" value={n(t.orders)} sub="ไม่นับที่ยกเลิก" />
            <Kpi label="ยอดขาย" value={formatAmount(t.revenue)} sub={t.orders ? `เฉลี่ย ${formatAmount(Math.round(t.revenue / t.orders))}/ออเดอร์` : undefined} />
            <Kpi label="อัตราซื้อ" value={pct(t.orders, t.sessions)} sub="ออเดอร์ ÷ รอบเข้าเว็บ" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="🪜 ขั้นการซื้อ" hint="ลูกค้าหลุดตรงไหนมากที่สุด — แท่งสั้นลงมาก = ขั้นนั้นมีปัญหา">
              <div className="space-y-2">
                {funnel.map((f, i) => {
                  const prev = i ? funnel[i - 1].v : 0;
                  const w = t.sessions ? Math.max(2, (f.v / t.sessions) * 100) : 0;
                  return (
                    <div key={f.label} data-funnel-step>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-slate-700">{i + 1}. {f.label}</span>
                        <span className="tabular-nums text-slate-800 font-medium">
                          {n(f.v)} <span className="text-xs text-slate-400 font-normal">{pct(f.v, t.sessions)}</span>
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden mt-1">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, w)}%` }} />
                      </div>
                      {i > 0 && prev > 0 && f.v < prev && <div className="text-[11px] text-rose-500 mt-0.5">หลุด {pct(prev - f.v, prev)} จากขั้นก่อน</div>}
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="📅 รายวัน" hint="แท่ง = รอบเข้าเว็บ · ตัวเลขบน = ออเดอร์ (ชี้ที่แท่งดูยอด)">
              {s.daily.length ? (
                <div className="flex items-end gap-[3px] h-40 overflow-x-auto">
                  {s.daily.map((d) => (
                    <div key={d.day} className="flex-1 min-w-[10px] flex flex-col items-center justify-end h-full" title={`${thDay(d.day)} · ${n(d.sessions)} รอบ · ${n(d.orders)} ออเดอร์ · ${formatAmount(d.revenue)}`}>
                      {d.orders > 0 && <span className="text-[10px] text-emerald-600 font-semibold">{d.orders}</span>}
                      <div className="w-full rounded-t bg-blue-400/80" style={{ height: `${Math.max(2, (d.sessions / maxDay) * 100)}%` }} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">ยังไม่มีข้อมูล</p>
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
            title="🧭 ลูกค้ามาจากไหน"
            rows={s.sources}
            rowKey={(r) => r.source}
            dense
            countUnit="แหล่ง"
            columns={[
              { key: "source", header: "แหล่งที่มา", width: "1.6fr", cell: (r) => sourceLabel(r.source), sortValue: (r) => sourceLabel(r.source) },
              { key: "sessions", header: "รอบ", align: "right", width: "5rem", cell: (r) => n(r.sessions), sortValue: (r) => r.sessions },
              { key: "carted", header: "ใส่ตะกร้า", align: "right", width: "6rem", cell: (r) => n(r.carted), sortValue: (r) => r.carted },
              { key: "orders", header: "ออเดอร์", align: "right", width: "5rem", cell: (r) => n(r.orders), sortValue: (r) => r.orders },
              { key: "revenue", header: "ยอดขาย", align: "right", width: "7rem", cell: (r) => formatAmount(r.revenue), sortValue: (r) => r.revenue },
              { key: "conv", header: "อัตราซื้อ", align: "right", width: "6rem", cell: (r) => (r.sessions ? pct(r.orders, r.sessions) : "–"), sortValue: (r) => (r.sessions ? r.orders / r.sessions : -1) },
            ]}
            footnote="แหล่ง = ลิงก์ที่ลูกค้ากดมา (Google/Facebook/LINE…) หรือรหัส utm_source ในลิงก์โฆษณา · ใส่ ?utm_source=ชื่อ ท้ายลิงก์ที่แชร์ จะแยกได้ละเอียดขึ้น"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="📱 อุปกรณ์">
              <div className="space-y-2">
                {s.devices.length ? (
                  s.devices.map((d) => (
                    <div key={d.device}>
                      <div className="flex justify-between text-sm">
                        <span>{DEVICE_LABEL[d.device] ?? d.device}</span>
                        <span className="tabular-nums">
                          {n(d.sessions)} <span className="text-xs text-slate-400">{pct(d.sessions, t.sessions)}</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-1">
                        <div className="h-full bg-violet-400" style={{ width: `${(d.sessions / maxDev) * 100}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">ยังไม่มีข้อมูล</p>
                )}
              </div>
            </Section>
            <MiniTable
              title="🚪 หน้าแรกที่ลูกค้าเข้า"
              rows={s.landing}
              rowKey={(r) => r.path}
              dense
              countUnit="หน้า"
              emptyText="ยังไม่มีข้อมูล"
              columns={[
                { key: "path", header: "หน้า", width: "1fr", cell: (r) => <span className="font-mono text-xs break-all">{r.path}</span> },
                { key: "sessions", header: "รอบ", align: "right", width: "5rem", cell: (r) => n(r.sessions), sortValue: (r) => r.sessions },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MiniTable
              title="👀 สินค้าที่ถูกดู"
              rows={s.products}
              rowKey={(r) => r.code}
              dense
              countUnit="รุ่น"
              emptyText="ยังไม่มีข้อมูล"
              columns={[
                { key: "code", header: "รุ่น", width: "1.6fr", cell: (r) => <span><span className="font-mono text-xs text-slate-500">{r.code}</span> {data?.names[r.code] ?? ""}</span>, sortValue: (r) => r.code },
                { key: "views", header: "ดู", align: "right", width: "4.5rem", cell: (r) => n(r.views), sortValue: (r) => r.views },
                { key: "carts", header: "ใส่ตะกร้า", align: "right", width: "5.5rem", cell: (r) => n(r.carts), sortValue: (r) => r.carts },
                { key: "rate", header: "% ใส่", align: "right", width: "4.5rem", cell: (r) => pct(r.carts, r.views), sortValue: (r) => (r.views ? r.carts / r.views : -1) },
              ]}
              footnote="ดูเยอะแต่ใส่ตะกร้าน้อย = ลองเช็กราคา/รูป/รายละเอียดของรุ่นนั้น"
            />
            <MiniTable
              title="🔍 คำที่ลูกค้าค้น"
              rows={data?.terms ?? []}
              rowKey={(r) => r.q}
              dense
              countUnit="คำ"
              emptyText="ยังไม่มีคนค้น"
              columns={[
                { key: "q", header: "คำค้น", width: "1fr", cell: (r) => <span className={r.lastResults === 0 ? "text-rose-600" : ""}>{r.q}</span> },
                { key: "hits", header: "ครั้ง", align: "right", width: "4.5rem", cell: (r) => n(r.hits), sortValue: (r) => r.hits },
                { key: "res", header: "เจอ", align: "right", width: "4.5rem", cell: (r) => (r.lastResults === 0 ? <span className="text-rose-600">ไม่เจอ</span> : n(r.lastResults)) },
              ]}
              footnote="สีแดง = ค้นแล้วไม่เจอ → เติมคำพ้องที่ 🏪 ข้อมูลร้าน › 🔍"
            />
          </div>

          <Section title="🧪 ทดสอบ A/B" hint="ตั้งที่ Section ในหน้าแรก/หน้าเว็บ (🧪 ทดสอบ A/B) — ลูกค้าครึ่งหนึ่งเห็นแบบ A อีกครึ่งเห็นแบบ B แล้วเทียบว่าแบบไหนขายดีกว่า">
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
                          <div className="font-semibold">แบบ {v}</div>
                          <div className="text-slate-600 tabular-nums">
                            เห็น {n(x[v].seen)} · ใส่ตะกร้า {n(x[v].carts)} · ออเดอร์ {n(x[v].orders)}
                          </div>
                          <div className="text-slate-800 tabular-nums">
                            อัตราซื้อ <b>{pct(x[v].orders, x[v].seen)}</b> · {formatAmount(x[v].revenue)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">ยังไม่มีการทดสอบในช่วงนี้</p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
