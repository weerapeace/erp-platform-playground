"use client";

/**
 * Preview แอปเดี่ยว (standalone) — ดูหน้าแอปมือถือในกรอบโทรศัพท์ + เปิดเต็มจอ/แท็บใหม่
 */
import { useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";

type AppGroup = { key: string; label: string; icon: string | null };

// china-pay มีหน้า custom; ที่เหลือใช้เชลล์กลาง /app/<key>
const linkFor = (key: string) => `/app/${key}`;

export default function StandalonePreviewPage() {
  const [apps, setApps] = useState<AppGroup[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [device, setDevice] = useState<"iphone" | "ipad">("iphone");

  useEffect(() => {
    apiFetch("/api/menu/apps").then((r) => r.json()).then((j) => {
      const a = (j.data ?? []) as AppGroup[];
      setApps(a);
      setSel((prev) => prev ?? a[0]?.key ?? null);
    }).catch(() => {});
  }, []);

  const size = device === "iphone" ? { w: 390, h: 740 } : { w: 768, h: 1000 };
  const url = sel ? linkFor(sel) : null;

  return (
    <PlaygroundShell>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <h1 className="text-2xl font-semibold text-slate-800">📱 Preview แอปมือถือ</h1>
        <p className="text-sm text-slate-500 mt-0.5 mb-4">ดูแอปเดี่ยว (standalone) ของแต่ละโมดูลในกรอบโทรศัพท์ — หรือเปิดเต็มจอ/ติดตั้งบนมือถือ</p>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* รายการแอป */}
          <div className="lg:w-64 flex-shrink-0 space-y-2">
            <div className="text-xs font-medium text-slate-500 mb-1">เลือกแอป</div>
            {apps.map((a) => (
              <button key={a.key} onClick={() => setSel(a.key)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${sel === a.key ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 hover:bg-slate-50"}`}>
                <span className="text-lg">{a.icon ?? "🧩"}</span>
                <span className="flex-1 truncate">{a.label}</span>
              </button>
            ))}
            {apps.length === 0 && <div className="text-xs text-slate-300">— ยังไม่มี App —</div>}

            {url && (
              <div className="pt-2 space-y-2">
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="block w-full text-center h-9 leading-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">เปิดเต็มจอ (แท็บใหม่) →</a>
                <div className="text-[11px] text-slate-400 break-all">ลิงก์: <code>{url}</code></div>
              </div>
            )}
          </div>

          {/* กรอบมือถือ */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              {(["iphone", "ipad"] as const).map((d) => (
                <button key={d} onClick={() => setDevice(d)}
                  className={`h-8 px-3 text-xs rounded-lg border ${device === d ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {d === "iphone" ? "📱 iPhone" : "📋 iPad"}
                </button>
              ))}
            </div>
            {url ? (
              <div className="mx-auto bg-slate-900 rounded-[2rem] p-3 shadow-xl" style={{ width: size.w + 24 }}>
                <iframe key={`${url}-${device}`} src={url} title="preview"
                  className="bg-white rounded-[1.5rem] w-full" style={{ height: size.h }} />
              </div>
            ) : (
              <div className="text-center text-slate-300 py-20">เลือกแอปด้านซ้าย</div>
            )}
          </div>
        </div>
      </div>
    </PlaygroundShell>
  );
}
