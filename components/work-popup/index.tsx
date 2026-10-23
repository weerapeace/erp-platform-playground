"use client";
/**
 * 🔔 ป๊อปเตือนงานตอนเข้า ERP (ของกลาง) — WorkPopupHost mount ครั้งเดียวใน app/layout
 *   ถามเซิร์ฟเวอร์ครั้งเดียวต่อแท็บ (หลังหน้าโหลด ~2.5 วิ) + ถามใหม่เมื่อกลับมาที่แท็บเกิน 30 นาที
 *   ใคร/เมื่อไหร่/รับทราบแล้ว ตัดสินที่เซิร์ฟเวอร์ (lib/email-report/popup) · ตั้งค่าที่ หน้าส่งอีเมลรายงาน → 🔔 เด้งป๊อปตอนเข้า ERP
 *   "งานของคุณ" ขึ้นก่อนเสมอ ติ๊กเสร็จในป๊อปได้ (PATCH /api/record-tasks/[id] — ผู้รับผิดชอบติ๊กข้อตัวเองได้)
 *   ปุ่ม: รับทราบ (วันละครั้ง = ไม่เด้งอีกวันนี้) · ไว้ทีหลัง (ปิด + ใส่กระดิ่งให้กดกลับมาเปิด) · เปิดใบงาน = ไว้ทีหลัง
 *   กระดิ่งลิงก์ ?popup=<id> → เปิดป๊อปนั้นทันทีไม่ว่าหน้าไหน
 * WorkPopupBody = เนื้อในป๊อป (หน้าตั้งค่าใช้แสดงตัวอย่าง)
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ERPModal } from "@/components/modal";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { WorkPopupFlag, WorkPopupPayload } from "@/lib/email-report/popup";

// หน้าที่ไม่ใช่การทำงานใน ERP (ล็อกอิน / พิมพ์ / ลิงก์สาธารณะ) → ไม่เด้ง
const SKIP_PREFIX = ["/login", "/auth", "/print/", "/a/", "/s/", "/offer/", "/employee-line"];
const RECHECK_MS = 30 * 60_000;
const UUID = /^[0-9a-f-]{36}$/i;

const thDate = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const seenKey = (uid: string) => `work-popup-seen:${uid}:${thDate()}`;
function readSeen(uid: string): string[] {
  try { const v = JSON.parse(sessionStorage.getItem(seenKey(uid)) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function markSeen(uid: string, id: string) {
  try { sessionStorage.setItem(seenKey(uid), JSON.stringify([...new Set([...readSeen(uid), id])])); } catch { /* ignore */ }
}

const TONE: Record<WorkPopupFlag["tone"], string> = { danger: "text-rose-600", warn: "text-amber-600", muted: "text-slate-500", good: "text-emerald-600" };

function Thumb({ src }: { src: string | null }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-md border border-slate-200 object-cover" />
    : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-300">🎨</div>;
}

/** เนื้อในป๊อป (ไม่มีกรอบ) — ใช้ทั้งป๊อปจริงและตัวอย่างในหน้าตั้งค่า */
export function WorkPopupBody({ data, onOpen, onTick, done, preview }: {
  data: WorkPopupPayload;
  onOpen?: (path: string) => void;
  onTick?: (taskId: string, done: boolean) => void;
  done?: Set<string>;
  preview?: boolean;
}) {
  const s = data.stats;
  const link = (path: string, children: React.ReactNode, cls = "") => (
    <button type="button" disabled={!onOpen} onClick={() => onOpen?.(path)} className={`min-w-0 text-left hover:underline disabled:hover:no-underline ${cls}`}>{children}</button>
  );
  const mineOpen = data.mine.reduce((n, m) => n + m.tasks.filter((t) => !done?.has(t.id)).length, 0);
  return (
    <div className="space-y-4">
      {data.audience === "all" && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {s.overdue > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">เกินกำหนด {s.overdue}</span>}
          {s.due_soon > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">ใกล้กำหนด {s.due_soon}</span>}
          {s.waiting > 0 && <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">⏳ มีของรอ {s.waiting} ใบ</span>}
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">ค้างทั้งหมด {s.total}</span>
        </div>
      )}

      {/* 👤 งานของคุณ — ขึ้นก่อนเสมอ */}
      {data.mine.length > 0 && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
          <h3 className="mb-2 text-sm font-semibold text-indigo-900">👤 งานของคุณ <span className="font-normal text-indigo-700">({mineOpen > 0 ? `เหลือ ${mineOpen} ข้อ` : "ครบแล้ว 🎉"})</span></h3>
          <div className="space-y-2">
            {data.mine.map((m) => (
              <div key={m.id} className="flex gap-2.5 rounded-lg bg-white p-2 shadow-sm">
                <Thumb src={m.imageUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    {link(m.path, <span className="text-sm font-medium text-slate-800">{m.code && <span className="mr-1 text-slate-400">{m.code}</span>}{m.title}</span>)}
                    <span className={`shrink-0 text-xs ${TONE[m.flag.tone]}`}>{m.flag.text}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {m.tasks.map((t) => {
                      const ok = !!done?.has(t.id);
                      return (
                        <li key={t.id}>
                          <label className={`inline-flex items-center gap-2 text-sm ${onTick ? "cursor-pointer" : ""} ${ok ? "text-slate-400 line-through" : "text-slate-700"}`}>
                            <input type="checkbox" checked={ok} disabled={!onTick} onChange={(e) => onTick?.(t.id, e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                            {t.title}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-indigo-700/80">ติ๊กเมื่อทำเสร็จ — ทีมเห็นในใบงานทันที</p>
        </section>
      )}

      {/* 🔥 ต้องตามวันนี้ (หรือทุกงานเรียงด่วนก่อน — urgent_label) */}
      {data.audience === "all" && data.urgent.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-800">{data.urgent_label}</h3>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {data.urgent.map((u) => (
              <div key={u.id} className="flex gap-2.5 p-2">
                <Thumb src={u.imageUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    {link(u.path, <span className="text-sm text-slate-800">{u.code && <span className="mr-1 text-slate-400">{u.code}</span>}{u.title}</span>)}
                    <span className={`shrink-0 text-xs ${TONE[u.flag.tone]}`}>{u.flag.text}</span>
                  </div>
                  {u.waiting.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {u.waiting.slice(0, 3).map((w, i) => <span key={i} className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">⏳ {w}</span>)}
                      {u.waiting.length > 3 && <span className="text-[11px] text-slate-400">+{u.waiting.length - 3}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {data.more > 0 && <p className="mt-1.5 text-xs text-slate-500">และอีก {data.more} งาน — กด "ดูทั้งหมด"</p>}
        </section>
      )}

      {data.mine.length === 0 && (data.audience === "mine" || data.urgent.length === 0) && (
        <p className="rounded-xl bg-emerald-50 p-4 text-center text-sm text-emerald-700">ไม่มีงานที่ต้องตามตอนนี้ เยี่ยมมาก 🎉</p>
      )}
      {data.audience === "mine" && data.mine.length > 0 && !preview && (
        <p className="text-[11px] text-slate-400">คุณเห็นป๊อปนี้เพราะมีข้อในเช็กลิสต์ "รออะไรอยู่" ที่ใส่ชื่อคุณไว้</p>
      )}
    </div>
  );
}

/** อ่าน ?popup=<id> (ลิงก์จากกระดิ่ง) — แยกเป็นตัวลูกใน Suspense ตามกฎ useSearchParams ของ Next */
function PopupParam({ onParam }: { onParam: (id: string) => void }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const id = sp?.get("popup") ?? "";
  useEffect(() => {
    if (!UUID.test(id)) return;
    onParam(id);
    const next = new URLSearchParams(sp?.toString() ?? "");
    next.delete("popup");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return null;
}

export function WorkPopupHost() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [queue, setQueue] = useState<WorkPopupPayload[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const lastCheck = useRef(0);
  const uid = user?.id ?? null;
  // หน้าที่ฝังในกรอบ (เช่น แท็บตั้งค่าแอป ?embed=1) ไม่เด้ง — ให้หน้าหลักเด้งที่เดียว ไม่ซ้อน 2 ป๊อป
  const inFrame = typeof window !== "undefined" && window.self !== window.top;
  const skip = inFrame || SKIP_PREFIX.some((p) => pathname.startsWith(p));

  const check = useCallback(async (reportId?: string) => {
    if (!uid) return;
    lastCheck.current = Date.now();
    try {
      const r = await apiFetch(`/api/popups/active${reportId ? `?report=${reportId}` : ""}`);
      if (!r.ok) return;
      const j = (await r.json()) as { data?: WorkPopupPayload[] };
      const seen = reportId ? [] : readSeen(uid);
      const list = (j.data ?? []).filter((p) => !seen.includes(p.report_id));
      if (list.length) setQueue((q) => [...q.filter((x) => !list.some((y) => y.report_id === x.report_id)), ...list]);
    } catch { /* เงียบ — ป๊อปไม่ขึ้นไม่ทำให้หน้าพัง */ }
  }, [uid]);

  // ถามครั้งแรกหลังหน้าโหลด (ไม่แย่งโหลดเนื้อหาหลัก)
  useEffect(() => {
    if (!uid || skip || lastCheck.current) return;
    const t = setTimeout(() => void check(), 2500);
    return () => clearTimeout(t);
  }, [uid, skip, check]);
  // เปิดแท็บค้างไว้ทั้งวัน → กลับมาที่แท็บเกิน 30 นาที ถามใหม่ (เผื่อเพิ่งเข้าช่วงเวลาเด้ง)
  useEffect(() => {
    if (!uid) return;
    const onVis = () => { if (document.visibilityState === "visible" && lastCheck.current && Date.now() - lastCheck.current > RECHECK_MS && !skip) void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [uid, skip, check]);

  const cur = queue[0] ?? null;
  const finish = (p: WorkPopupPayload, action: "ack" | "later") => {
    if (uid) markSeen(uid, p.report_id);
    setQueue((q) => q.filter((x) => x.report_id !== p.report_id));
    void apiFetch("/api/popups/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report_id: p.report_id, action }) }).catch(() => {});
  };
  const open = (p: WorkPopupPayload, path: string, action: "ack" | "later") => { finish(p, action); router.push(path); };
  const tick = async (taskId: string, isDone: boolean) => {
    setDone((s) => { const n = new Set(s); if (isDone) n.add(taskId); else n.delete(taskId); return n; });
    try {
      const r = await apiFetch(`/api/record-tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: isDone ? "resolved" : "open", actor: user?.name }) });
      if (!r.ok) throw new Error();
    } catch {
      setDone((s) => { const n = new Set(s); if (isDone) n.delete(taskId); else n.add(taskId); return n; });
      toast.error("ติ๊กไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  };

  return (
    <>
      <Suspense fallback={null}>{uid && <PopupParam onParam={(id) => void check(id)} />}</Suspense>
      {cur && !skip && (
        <ERPModal open onClose={() => finish(cur, "later")} size="lg" defaultExpanded={false} storageKey="work-popup" zIndex={300}
          closeOnBackdrop={!cur.require_ack}
          title={`🔔 ${cur.audience === "mine" ? "งานที่รอคุณอยู่" : cur.heading}`}
          description={`${new Date(`${cur.date}T00:00:00Z`).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}${queue.length > 1 ? ` · ป๊อปที่ 1 จาก ${queue.length}` : ""}`}
          footer={
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              {cur.view_all && cur.audience === "all" && (
                <button onClick={() => open(cur, cur.view_all!, "ack")} className="mr-auto h-9 rounded-lg px-3 text-sm font-medium text-blue-700 hover:bg-blue-50">ดูทั้งหมด →</button>
              )}
              <button onClick={() => finish(cur, "later")} className="h-9 rounded-lg border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50">ไว้ทีหลัง</button>
              <button onClick={() => finish(cur, "ack")} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">✓ รับทราบ</button>
            </div>
          }>
          <WorkPopupBody data={cur} done={done} onTick={(id, d) => void tick(id, d)} onOpen={(path) => open(cur, path, "later")} />
        </ERPModal>
      )}
    </>
  );
}
