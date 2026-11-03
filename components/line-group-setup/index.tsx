"use client";

/**
 * ของกลาง — แถบตั้ง "กลุ่มไลน์รับเข้า" (แอดมินเท่านั้น) ใช้ร่วมทุกงานที่ให้คนส่งของเข้าระบบทางกลุ่มไลน์
 *   - คำสั่งซื้อจากไลน์ (slot purchase_capture · /purchasing/line-orders)
 *   - งานออกแบบจากไลน์ (slot design_intake · กล่อง "จากไลน์" บน Design Dashboard)
 *
 * - โชว์กลุ่มที่บอทอยู่แล้วทั้งหมด (ชื่อจริงจากไลน์ · จำนวนคน · ตอนนี้ใช้ทำอะไร) → กด "ใช้กลุ่มนี้" ได้ทันที
 * - กลุ่มที่คุยเรื่องอื่นเยอะติดป้ายเตือน (ข้อความ/รูปในกลุ่มจะหลุดเข้าระบบ)
 * - กลุ่มใหม่ที่ยังไม่อยู่ในรายการ: เชิญบอท → พิมพ์ในกลุ่ม 1 ครั้ง → 🔄 แล้วจะโผล่เป็น "กลุ่มล่าสุดที่บอทเห็น"
 * ข้อมูลกลุ่มมาจาก setupUrl (server: lib/line-intake loadLineGroupSetup) · บันทึกผ่าน API ศูนย์จัดการ LINE กลาง (/api/admin/line-console)
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { KnownLineGroup } from "@/lib/line-intake";

type LineSetup = {
  has_token: boolean; has_secret: boolean;
  current: string; current_name: string | null;
  captured: string; captured_at: string | null;
  groups: KnownLineGroup[];
};

export type LineGroupSetupText = {
  /** ใช้ทำอะไร เช่น "ส่งรูปคำสั่งซื้อ" / "ส่งงานออกแบบ" */
  purpose: string;
  /** ต่อท้ายตอนตั้งแล้ว เช่น "ส่งรูปคำสั่งซื้อในกลุ่มนี้ได้เลย บอทจะตอบกลับให้" */
  readyNote: string;
  /** คำอธิบายตอนเลือกกลุ่ม */
  pickHint: string;
  /** ป้ายเตือนกลุ่มที่คุยเรื่องอื่นเยอะ */
  busyWarn: string;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function LineGroupSetup({ slot, setupUrl, text, reloadKey, onOpenConsole, onChanged }: {
  slot: string; setupUrl: string; text: LineGroupSetupText;
  reloadKey: number; onOpenConsole: () => void; onChanged?: () => void;
}) {
  const toast = useToast();
  const [setup, setSetup] = useState<LineSetup | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(setupUrl);
      const j = await r.json();
      if (r.ok && !j.error) setSetup(j as LineSetup);
    } catch { /* แถบตั้งค่าไม่ขึ้นก็ใช้หน้าได้ */ }
  }, [setupUrl]);
  useEffect(() => { void load(); }, [load, reloadKey]);

  const choose = async (g: KnownLineGroup) => {
    setBusy(g.id);
    try {
      const r = await apiFetch("/api/admin/line-console", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, group_id: g.id }),
      });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "ตั้งกลุ่มไม่สำเร็จ");
      toast.success(`ตั้งกลุ่ม "${g.name ?? "ที่เลือก"}" แล้ว — ${text.purpose}ในกลุ่มนี้ได้เลย`);
      setPicking(false);
      await load();
      onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ตั้งกลุ่มไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  if (!setup) return null;
  const showPicker = !setup.current || picking;

  return (
    <div className={`rounded-xl border px-4 py-3 space-y-2 text-sm ${setup.current && !picking ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
      {setup.current && !picking ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-emerald-800">
          <span>✅ กลุ่มไลน์{text.purpose}: <b>{setup.current_name ?? "ตั้งแล้ว"}</b> — {text.readyNote}</span>
          <button onClick={() => setPicking(true)} className="h-7 px-2.5 rounded-lg border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100">เปลี่ยนกลุ่ม</button>
          {!setup.has_secret && <span className="text-amber-700">🔐 ยังไม่ได้ใส่รหัสลับบอท (แนะนำ) — <button onClick={onOpenConsole} className="underline">ใส่ที่ ⚙️ ตั้งค่าไลน์</button></span>}
        </div>
      ) : (
        <div className="font-semibold text-amber-900">{setup.current ? `เลือกกลุ่มใหม่สำหรับ${text.purpose}` : `เลือกกลุ่มไลน์สำหรับ${text.purpose}`}</div>
      )}

      {showPicker && (
        <>
          {!setup.has_token && <div className="text-xs text-rose-600">ยังไม่มีโทเคนบอท — ตั้งที่ <button onClick={onOpenConsole} className="underline">⚙️ ตั้งค่าไลน์</button> ก่อน</div>}
          <div className="text-[13px] text-amber-900/90">{text.pickHint}</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {setup.groups.filter((g) => g.reachable || g.is_current).map((g) => (
              <div key={g.id} className={`rounded-lg border bg-white px-3 py-2 flex items-start justify-between gap-2 ${g.is_current ? "border-emerald-400" : "border-slate-200"}`}>
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">
                    {g.name ?? "(ไม่รู้ชื่อกลุ่ม)"}{g.members ? <span className="text-xs font-normal text-slate-400"> · {g.members} คน</span> : null}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {g.uses.length ? `ตอนนี้ใช้: ${g.uses.join(", ")}` : g.is_captured ? `กลุ่มล่าสุดที่บอทเห็น${setup.captured_at ? ` · ${when(setup.captured_at)}` : ""}` : "ยังไม่ได้ใช้กับระบบไหน"}
                  </div>
                  {g.busy_images && !g.is_current && <div className="text-[11px] text-amber-700">⚠ {text.busyWarn}</div>}
                  {!g.reachable && <div className="text-[11px] text-rose-600">บอทไม่ได้อยู่ในกลุ่มนี้แล้ว</div>}
                </div>
                {g.is_current
                  ? <span className="text-xs text-emerald-700 shrink-0 mt-1">✓ ใช้อยู่</span>
                  : (
                    <button onClick={() => void choose(g)} disabled={!!busy || !g.reachable}
                      className="h-8 px-3 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50 shrink-0">
                      {busy === g.id ? "กำลังตั้ง…" : "ใช้กลุ่มนี้"}
                    </button>
                  )}
              </div>
            ))}
          </div>
          <div className="text-[12px] text-slate-600">
            กลุ่มใหม่ไม่อยู่ในรายการ? เชิญบอท &quot;พนักงานลงบิลจีนลูก้า&quot; เข้ากลุ่ม → พิมพ์อะไรก็ได้ในกลุ่ม 1 ครั้ง →
            <button onClick={() => void load()} className="ml-1 h-7 px-2.5 rounded-lg border border-amber-300 bg-white text-xs text-amber-800 hover:bg-amber-100">🔄 รีเฟรช</button>
            {picking && <button onClick={() => setPicking(false)} className="ml-2 underline text-slate-500">ยกเลิก</button>}
          </div>
          <div className="text-[12px] text-slate-500">อย่าลืม: ใน LINE Official Account Manager ปิด &quot;ข้อความตอบกลับอัตโนมัติ&quot; (ไม่งั้นไลน์ตอบข้อความสำเร็จรูปซ้อน)</div>
        </>
      )}
    </div>
  );
}
