"use client";

/**
 * สถานีสแกน — /scan
 * เปิดกล้องค้างไว้ ยิงได้ต่อเนื่อง · รองรับเครื่องยิง USB และพิมพ์รหัสมือ
 * สแกนเจอ → เด้งไปหน้าที่ถูกต้องทันที (ปลายทางกำหนดที่ /api/scan/resolve ที่เดียว)
 *
 * ⚠️ ต้องเป็นหน้าเต็ม ไม่ผูก PlaygroundShell — กล้องในกรอบซ้อน (iframe) ถูก iOS บล็อก
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ScanInput } from "@/components/scan-input";
import type { ScanHit } from "@/app/api/scan/resolve/route";

const RECENT_KEY = "scan_recent";
const MAX_RECENT = 8;

const KIND_ICON: Record<string, string> = { po: "🧾", mo: "🏭", pr: "📝", sku: "📦" };

type Recent = { code: string; title: string; subtitle: string; href: string; kind: string };
type Status = { s: "idle" } | { s: "busy"; code: string } | { s: "miss"; code: string; message: string };

export default function ScanStationPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ s: "idle" });
  const [recent, setRecent] = useState<Recent[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw) as Recent[]);
    } catch { /* ไม่มีก็ไม่เป็นไร */ }
  }, []);

  const pushRecent = useCallback((hit: ScanHit) => {
    setRecent((prev) => {
      const item: Recent = { code: hit.code, title: hit.title, subtitle: hit.subtitle, href: hit.href, kind: hit.kind };
      const next = [item, ...prev.filter((r) => r.code !== item.code)].slice(0, MAX_RECENT);
      try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* โควตาเต็ม = ข้าม */ }
      return next;
    });
  }, []);

  const handleScan = useCallback(async (code: string) => {
    setStatus({ s: "busy", code });
    try {
      const res = await apiFetch("/api/scan/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json()) as { data: ScanHit | null; error: string | null };

      if (res.status === 401) { router.replace(`/login?next=${encodeURIComponent("/scan")}`); return; }
      if (!res.ok || !json.data) {
        setStatus({ s: "miss", code, message: json.error ?? "ไม่พบข้อมูล" });
        return;
      }
      pushRecent(json.data);
      setStatus({ s: "idle" });
      router.push(json.data.href);
    } catch {
      setStatus({ s: "miss", code, message: "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง" });
    }
  }, [router, pushRecent]);

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <div className="mx-auto max-w-lg p-4 pb-10 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-800">📷 สถานีสแกน</h1>
          <a href="/apps" className="text-sm text-slate-500 hover:text-slate-700">ออก</a>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <ScanInput onScan={(c) => void handleScan(c)} paused={status.s === "busy"} />
        </div>

        {status.s === "busy" && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
            กำลังค้นหา <span className="font-mono">{status.code}</span>...
          </div>
        )}

        {status.s === "miss" && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <div className="text-sm text-red-700 font-medium">⚠️ {status.message}</div>
            <div className="text-xs text-red-500 mt-1 font-mono break-all">{status.code}</div>
            <div className="text-xs text-slate-500 mt-2">
              ลองสแกนใหม่ให้ตรงกลางกรอบ · หรือพิมพ์รหัสในช่องด้านบน
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-medium text-slate-400 px-1 mb-2">ล่าสุดที่สแกน</div>
          {recent.length === 0 ? (
            <div className="text-sm text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl px-4 py-6 text-center">
              ยังไม่มี — ส่อง QR บนใบสั่งซื้อ ใบสั่งงาน หรือป้ายสินค้าได้เลย
            </div>
          ) : (
            <ul className="space-y-2">
              {recent.map((r) => (
                <li key={r.code}>
                  <button
                    onClick={() => router.push(r.href)}
                    className="w-full text-left bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:bg-blue-50/40"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg leading-none mt-0.5">{KIND_ICON[r.kind] ?? "🔖"}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{r.title}</div>
                        {r.subtitle && <div className="text-xs text-slate-500 truncate">{r.subtitle}</div>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
