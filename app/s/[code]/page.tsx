"use client";

/**
 * หน้ากลาง "สแกนแล้วไปไหน" — /s/<รหัส>
 *
 * QR ทุกใบในระบบชี้มาที่นี่ (ห้ามชี้หน้าปลายทางตรง ๆ) เพราะป้าย/ใบที่พิมพ์ไปแล้วแก้ไม่ได้
 * → อยากเปลี่ยนปลายทางเมื่อไหร่ แก้ที่ lib/scan-code.ts + /api/scan/resolve ที่เดียว ป้ายเก่าใช้ต่อได้
 *
 * หน้านี้ตั้งใจให้เบาและเป็นหน้าเต็ม (ไม่ผูก PlaygroundShell) เพราะเปิดจากมือถือหลังสแกน
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { scanPath } from "@/lib/scan-code";
import type { ScanHit } from "@/app/api/scan/resolve/route";

type State =
  | { s: "loading" }
  | { s: "found"; hit: ScanHit }
  | { s: "login" }
  | { s: "error"; message: string };

const KIND_LABEL: Record<string, string> = {
  po: "ใบสั่งซื้อ", mo: "ใบสั่งผลิต", pr: "ใบขอซื้อ", sku: "สินค้า", unknown: "ไม่ทราบชนิด",
};

export default function ScanRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const raw = decodeURIComponent(String(params?.code ?? ""));
  const [state, setState] = useState<State>({ s: "loading" });

  useEffect(() => {
    if (!raw) { setState({ s: "error", message: "ไม่มีรหัสในลิงก์" }); return; }
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch("/api/scan/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: raw }),
        });
        const json = (await res.json()) as { data: ScanHit | null; error: string | null };
        if (cancelled) return;

        if (res.status === 401) { setState({ s: "login" }); return; }
        if (!res.ok || !json.data) { setState({ s: "error", message: json.error ?? "ไม่พบข้อมูล" }); return; }

        setState({ s: "found", hit: json.data });
        router.replace(json.data.href);
      } catch {
        if (!cancelled) setState({ s: "error", message: "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง" });
      }
    })();

    return () => { cancelled = true; };
  }, [raw, router]);

  // ยังไม่ล็อกอิน → พาไปล็อกอินแล้วกลับมาที่รหัสเดิม
  useEffect(() => {
    if (state.s === "login") {
      const back = scanPath(raw);
      router.replace(`/login?next=${encodeURIComponent(back)}`);
    }
  }, [state, raw, router]);

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-5">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
        <div className="text-4xl mb-3">📷</div>
        <div className="font-mono text-sm text-slate-500 break-all mb-4">{raw || "—"}</div>

        {state.s === "loading" && (
          <>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
              <div className="h-full w-1/3 bg-blue-500 rounded-full animate-pulse" />
            </div>
            <div className="text-slate-500 text-sm">กำลังค้นหา...</div>
          </>
        )}

        {state.s === "found" && (
          <>
            <div className="text-xs text-slate-400 mb-1">{KIND_LABEL[state.hit.kind] ?? ""}</div>
            <div className="font-semibold text-slate-800">{state.hit.title}</div>
            {state.hit.subtitle && <div className="text-sm text-slate-500 mt-1">{state.hit.subtitle}</div>}
            <div className="text-sm text-blue-600 mt-4">กำลังเปิด...</div>
          </>
        )}

        {state.s === "login" && <div className="text-slate-500 text-sm">กำลังพาไปหน้าเข้าสู่ระบบ...</div>}

        {state.s === "error" && (
          <>
            <div className="text-red-600 font-medium mb-1">⚠️ {state.message}</div>
            <div className="text-xs text-slate-500 mb-5">
              ลองตรวจว่าสแกนถูกใบไหม หรือรหัสนี้อาจถูกลบไปแล้ว
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => router.replace(scanPath(raw))}
                className="h-11 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                ลองใหม่
              </button>
              <a
                href="/apps"
                className="h-11 leading-[44px] rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
              >
                กลับหน้ารวมแอป
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
