"use client";

// 📡 สถานะการดึงออเดอร์ทุกร้าน — เจ้าของขอ 2026-11-20 "อยากได้หน้าสถานะมี Animation ให้ดูด้วย ที่หน้าจะได้รู้ว่าอะไรมีปัญหา"
//   เลือกแบบจาก widget: วางเป็นปุ่มในศูนย์ออเดอร์ (A) + ข้อเสนอ 1-5 (ตัวดึง Lazada · กระดิ่ง · ดึงตอนนี้ · LINE SHOPPING · ออเดอร์เว็บ)
//   ภาพเคลื่อนไหว: จุดวิ่งจากร้าน → ระบบ = ออเดอร์ไหลเข้า · วิ่งช้า = ทางสำรอง/ข้อมูลไม่ครบ · แถบสั่น = หยุดดึง/ล้ม · นาฬิกาทรายพลิก = กุญแจใกล้หมด
//   ผู้ใช้ที่ตั้ง "ลดการเคลื่อนไหว" ในเครื่อง = ภาพนิ่ง
// ข้อมูล: GET /api/platform-orders/pull-status (โหลดใหม่ทุก 60 วิ) · ปุ่มดึงตอนนี้: POST /api/platform-orders/pull
// กติกาสถานะ: lib/order-pull-health · ของกลาง: PlatformIcon · Icon · LoadingState/ErrorState · useToast · useAuth.can

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { formatDateTime } from "@/lib/date";
import { PULL_STATE_META, PULL_STATE_RANK, agoText, countPullStates, type PullRun, type PullState } from "@/lib/order-pull-health";

type Shop = {
  platform: "shopee" | "tiktok" | "lazada" | "line_shopping" | "website"; brand_id: string | null; brand_name: string | null; shop_name: string | null; label: string;
  mode: "api" | "email" | "direct" | "none"; state: PullState; headline: string; fix: string | null; token_days_left: number | null; token_expires_at: number | null;
  run: PullRun | null; last_order_at: string | null; last_insert_at: string | null; orders_7d: number; orders_total: number;
};
type Board = { ok: boolean; error?: string; now: string; shops: Shop[]; email: { enabled: boolean; last_at: string | null }; round: { last_at: string | null; ok: boolean | null; summary: string | null; next_at: string | null } };

const PLATFORM_NAME: Record<Shop["platform"], string> = { shopee: "Shopee", tiktok: "TikTok", lazada: "Lazada", line_shopping: "LINE SHOPPING", website: "เว็บไซต์" };
const MODE_TEXT: Record<Shop["mode"], string> = { api: "ดึงเองทุก 15 นาที", email: "เข้าทางเมล", direct: "ส่งต่อเข้าศูนย์ทุก 15 นาที", none: "ยังไม่มีทางดึง" };
const TONE: Record<string, { text: string; dot: string; chip: string; border: string; bar: string }> = {
  success: { text: "text-emerald-700", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", border: "border-slate-200", bar: "bg-emerald-500" },
  warning: { text: "text-amber-700", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800", border: "border-amber-200", bar: "bg-amber-500" },
  danger: { text: "text-rose-700", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700", border: "border-rose-300", bar: "bg-rose-500" },
  muted: { text: "text-slate-500", dot: "bg-slate-300", chip: "bg-slate-100 text-slate-600", border: "border-slate-200", bar: "bg-slate-300" },
};

// ภาพเคลื่อนไหวของหน้านี้ (CSS ล้วน · ไม่โหลดไลบรารีเพิ่ม)
const ANIM_CSS = `
@keyframes ops-flow{from{left:-12px}to{left:100%}}
@keyframes ops-ring{from{opacity:.7;transform:scale(.6)}to{opacity:0;transform:scale(1.9)}}
@keyframes ops-shake{0%,86%,100%{transform:translateX(0)}89%{transform:translateX(-3px)}92%{transform:translateX(3px)}95%{transform:translateX(-2px)}}
@keyframes ops-flip{0%,40%{transform:rotate(0)}60%,100%{transform:rotate(180deg)}}
@keyframes ops-spin{to{transform:rotate(360deg)}}
.ops-flow i{position:absolute;top:0;width:10px;height:6px;border-radius:3px;animation:ops-flow 1.6s linear infinite}
.ops-flow i:nth-child(2){animation-delay:.53s}.ops-flow i:nth-child(3){animation-delay:1.06s}
.ops-slow i{animation-duration:4.5s}
.ops-ring{position:absolute;inset:-4px;border-radius:9999px;border:2px solid currentColor;animation:ops-ring 1.4s ease-out infinite}
.ops-shake{animation:ops-shake 2.4s ease-in-out infinite}
.ops-flip{display:inline-flex;animation:ops-flip 2s ease-in-out infinite}
.ops-spin{display:inline-flex;animation:ops-spin 1s linear infinite}
@media (prefers-reduced-motion: reduce){.ops-flow i,.ops-ring,.ops-shake,.ops-flip,.ops-spin{animation:none}}
`;

function FlowBar({ state, mode, pulling }: { state: PullState; mode: Shop["mode"]; pulling: boolean }) {
  const tone = TONE[PULL_STATE_META[state].tone];
  if (state === "off") return <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" />;
  if (state === "error" || state === "stale") return <div className="ops-shake relative h-1.5 flex-1 overflow-hidden rounded-full bg-rose-100" />;
  const slow = (state === "slow" || mode === "email") && !pulling;
  return (
    <div className={`ops-flow relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 ${slow ? "ops-slow" : ""}`} aria-hidden>
      <i className={tone.bar} /><i className={tone.bar} /><i className={tone.bar} />
    </div>
  );
}

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!target) return null;
  const s = Math.max(0, Math.round((Date.parse(target) - now) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function PullStatusPage() {
  const { can, permsReady } = useAuth();
  const toast = useToast();
  const canView = can("platform_orders.view") || can("platform_orders.manage");
  const canManage = can("platform_orders.manage");
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/platform-orders/pull-status", { cache: "no-store" });
      const j = (await r.json()) as Board;
      if (!r.ok || !j.ok) throw new Error(j.error || "โหลดสถานะไม่สำเร็จ");
      setBoard(j); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดสถานะไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (!permsReady || !canView) return;
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => clearInterval(t);
  }, [permsReady, canView, load]);

  const pullNow = useCallback(async (s: Shop) => {
    const key = `${s.platform}:${s.brand_id ?? "all"}`;
    setPulling((p) => ({ ...p, [key]: true }));
    try {
      const r = await apiFetch("/api/platform-orders/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: s.platform, brand_id: s.brand_id }) });
      const j = (await r.json()) as { ok?: boolean; created?: number; updated?: number; error?: string | null };
      if (j.ok) toast.success(`${s.label}: ใหม่ ${j.created ?? 0} · อัปเดต ${j.updated ?? 0}`);
      else toast.error(`${s.label}: ${j.error || "ดึงไม่สำเร็จ"}`);
    } catch { toast.error(`${s.label}: เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง`); }
    finally { setPulling((p) => ({ ...p, [key]: false })); void load(); }
  }, [load, toast]);

  const shops = useMemo(() => [...(board?.shops ?? [])].sort((a, b) => PULL_STATE_RANK[a.state] - PULL_STATE_RANK[b.state]), [board]);
  const counts = useMemo(() => countPullStates(shops), [shops]);
  const countdown = useCountdown(board?.round.next_at ?? null);

  if (permsReady && !canView) return <div className="p-6"><ErrorState title="คุณไม่มีสิทธิ์ดูสถานะการดึงออเดอร์" hint="ขอสิทธิ์ ดูศูนย์ออเดอร์ จากผู้ดูแลระบบ" /></div>;

  const chip = (state: PullState, n: number) => n > 0 && (
    <span key={state} className={`rounded-md px-2 py-0.5 text-xs ${TONE[PULL_STATE_META[state].tone].chip}`}>{PULL_STATE_META[state].label} {n}</span>
  );

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <style>{ANIM_CSS}</style>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/master/platform-orders" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><Icon value="i:arrow-left" />ศูนย์ออเดอร์</Link>
          <h1 className="text-xl font-semibold text-slate-900"><Icon value="i:route" className="mr-1.5" />สถานะการดึงออเดอร์</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {board?.round.last_at
              ? <>ดึงอัตโนมัติทุก 15 นาที · รอบล่าสุด {agoText(Math.round((Date.now() - Date.parse(board.round.last_at)) / 60000))}{countdown ? <> · รอบถัดไปใน <span className="tabular-nums font-medium text-slate-700">{countdown}</span></> : null}</>
              : "ดึงอัตโนมัติทุก 15 นาที"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["error", "stale", "token", "slow", "ok", "off"] as PullState[]).map((s) => chip(s, counts[s]))}
          <button type="button" onClick={() => { setLoading(true); void load(); }} className="ml-1 inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50" title="โหลดสถานะใหม่">
            <span className={loading ? "ops-spin" : ""}><Icon value="i:refresh" /></span>โหลดใหม่
          </button>
        </div>
      </div>

      {err && !board ? <ErrorState title="โหลดสถานะการดึงออเดอร์ไม่สำเร็จ" hint={err} onRetry={() => { setLoading(true); void load(); }} />
        : !board ? <LoadingState variant="cards" rows={4} />
        : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {shops.map((s) => {
                const key = `${s.platform}:${s.brand_id ?? "all"}`;
                const meta = PULL_STATE_META[s.state];
                const tone = TONE[meta.tone];
                const busy = !!pulling[key];
                const needsReconnect = s.state === "off" || s.state === "token" || (s.token_days_left != null && s.token_days_left < 0);
                return (
                  <div key={key} className={`rounded-xl border bg-white p-3.5 ${tone.border}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <PlatformIcon code={s.platform} size={22} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{PLATFORM_NAME[s.platform]}</div>
                          <div className="truncate text-xs text-slate-500">{s.brand_name ?? s.shop_name ?? "-"}{s.shop_name && s.brand_name && s.shop_name !== s.brand_name ? ` · ${s.shop_name}` : ""}</div>
                        </div>
                      </div>
                      <span className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${tone.text}`}>
                        <span className={`relative inline-block h-2.5 w-2.5 rounded-full ${tone.dot}`}>{(s.state === "ok" || s.state === "error" || s.state === "stale" || busy) && <span className={`ops-ring ${tone.text}`} />}</span>
                        {busy ? "กำลังดึง…" : meta.label}
                      </span>
                    </div>

                    <div className="my-3 flex items-center gap-2 text-slate-400">
                      <Icon value="i:building-store" />
                      <FlowBar state={busy ? "ok" : s.state} mode={s.mode} pulling={busy} />
                      <Icon value="i:database" />
                    </div>

                    <div className="space-y-0.5 text-xs leading-relaxed text-slate-600">
                      <div className={s.state === "error" || s.state === "stale" ? "text-rose-700" : ""}>{s.headline}</div>
                      <div className="text-slate-500">
                        {MODE_TEXT[s.mode]} · ออเดอร์ล่าสุด {s.last_order_at ? formatDateTime(s.last_order_at) : "—"} · 7 วัน {s.orders_7d.toLocaleString()} ใบ
                      </div>
                      {s.token_days_left != null && (
                        <div className={s.token_days_left <= 7 ? "text-amber-700" : "text-slate-500"}>
                          {s.token_days_left <= 7 && <span className="ops-flip mr-1 align-[-2px]"><Icon value="i:hourglass" /></span>}
                          กุญแจร้าน{s.token_days_left < 0 ? "หมดอายุแล้ว" : `ใช้ได้อีก ${s.token_days_left} วัน`}{s.token_expires_at ? ` (ถึง ${formatDateTime(new Date(s.token_expires_at).toISOString())})` : ""}
                        </div>
                      )}
                      {s.fix && s.state !== "ok" && <div className="text-slate-500"><Icon value="i:bulb" className="mr-1" />{s.fix}</div>}
                    </div>

                    {(canManage && (s.mode === "api" || s.mode === "direct")) || needsReconnect ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canManage && (s.mode === "api" || s.mode === "direct") && (
                          <button type="button" disabled={busy} onClick={() => void pullNow(s)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                            <span className={busy ? "ops-spin" : ""}><Icon value="i:refresh" /></span>{busy ? "กำลังดึง…" : "ดึงตอนนี้"}
                          </button>
                        )}
                        {needsReconnect && s.platform !== "website" && (
                          <Link href="/admin/platform-accounts" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50">
                            <Icon value="i:plug" />{s.state === "off" ? "ต่อร้าน" : "ต่อร้านใหม่"}
                          </Link>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {/* FB / IG — ไม่มีช่องทางให้ระบบดึงออเดอร์ (ขายผ่านแชต) */}
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3.5">
                <div className="flex items-center gap-2">
                  <PlatformIcon code="facebook" size={20} /><PlatformIcon code="instagram" size={20} />
                  <div className="text-sm font-semibold text-slate-700">Facebook · Instagram</div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">ไม่มีช่องทางให้ระบบดึงออเดอร์ (ขายผ่านแชต) — สร้างออเดอร์เองในศูนย์ออเดอร์ ปุ่ม &quot;สร้างออเดอร์&quot; แล้วเลือกช่องทาง Facebook / Instagram</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>จุดวิ่ง = ออเดอร์ไหลเข้าปกติ</span>
              <span>วิ่งช้า = เข้าทางสำรอง/ข้อมูลไม่ครบ</span>
              <span>แถบสั่น = หยุดดึงหรือดึงไม่สำเร็จ</span>
              <span><Icon value="i:hourglass" className="mr-0.5" />= กุญแจร้านเหลือ ≤ 7 วัน</span>
              <span>เมลสำรอง (Lazada/Shopee): {board.email.enabled ? `รับล่าสุด ${board.email.last_at ? formatDateTime(board.email.last_at) : "—"}` : "ปิดอยู่"}</span>
              <span>ร้านมีปัญหา → เด้งกระดิ่ง (เรื่องเดิมวันละครั้ง)</span>
            </div>
          </>
        )}
    </div>
  );
}
