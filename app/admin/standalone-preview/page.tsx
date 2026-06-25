"use client";

/**
 * Preview แอปเดี่ยว (standalone) — ดูหน้าแอปมือถือในกรอบโทรศัพท์ + เปิดเต็มจอ/แท็บใหม่
 */
import { useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { ImageInput } from "@/components/image-input";

type AppGroup = { id: string; key: string; label: string; icon: string | null; icon_url: string | null };

// แสดงไอคอนแอป: มีรูป (icon_url) → รูป · ไม่มี → อิโมจิ (icon)
function AppIcon({ app, cls = "text-lg" }: { app: AppGroup; cls?: string }) {
  if (app.icon_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/r2-image?key=${encodeURIComponent(app.icon_url)}`} alt="" className="w-6 h-6 rounded object-contain shrink-0" />;
  }
  return <span className={`${cls} shrink-0`}>{app.icon || "🧩"}</span>;
}

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

  // ลิงก์เต็ม (origin จริง) + QR สำหรับสแกนติดตั้งบนมือถือ
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const fullUrl = url ? `${origin}${url}` : null;

  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!fullUrl) { setQr(null); return; }
    let alive = true;
    void (async () => {
      try {
        const m = await import("qrcode");
        const QR = (m.default ?? m) as { toDataURL: (text: string, opts?: { width?: number; margin?: number }) => Promise<string> };
        const d = await QR.toDataURL(fullUrl, { width: 220, margin: 1 });
        if (alive) setQr(d);
      } catch { if (alive) setQr(null); }
    })();
    return () => { alive = false; };
  }, [fullUrl]);

  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    if (!fullUrl) return;
    try { await navigator.clipboard.writeText(fullUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const selApp = apps.find((a) => a.key === sel) ?? null;
  // แก้ไอคอนแอป (อัปเดตจอทันที + บันทึก) — ต้องมีสิทธิ์ admin
  const patchApp = async (id: string, patch: Partial<AppGroup>) => {
    setApps((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    try {
      const j = await apiFetch("/api/menu/apps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
    } catch {
      // บันทึกพลาด → โหลดของจริงกลับมา
      apiFetch("/api/menu/apps").then((r) => r.json()).then((j) => setApps((j.data ?? []) as AppGroup[])).catch(() => {});
    }
  };

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
                <AppIcon app={a} />
                <span className="flex-1 truncate">{a.label}</span>
              </button>
            ))}
            {apps.length === 0 && <div className="text-xs text-slate-300">— ยังไม่มี App —</div>}

            {/* แก้ไอคอนของแอปที่เลือก */}
            {selApp && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 space-y-2">
                <div className="text-[11px] font-medium text-amber-700 flex items-center gap-1.5">🎨 ไอคอนแอป: <AppIcon app={selApp} cls="text-base" /> {selApp.label}</div>
                <div className="flex items-center gap-2">
                  <ImageInput compact value={selApp.icon_url ?? null} onChange={(key) => patchApp(selApp.id, { icon_url: key })} folder="app-icons" />
                  <div className="text-[11px] text-slate-500 leading-tight">อัปรูปไอคอน<br />(ลากวาง/วาง/เลือกจากคลัง)</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={selApp.icon ?? ""}
                    onChange={(e) => setApps((as) => as.map((a) => (a.id === selApp.id ? { ...a, icon: e.target.value } : a)))}
                    onBlur={(e) => patchApp(selApp.id, { icon: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    placeholder="🛒"
                    className="w-16 h-9 px-2 text-center text-lg border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <div className="text-[11px] text-slate-500 leading-tight">หรือใช้อิโมจิ<br />(ใช้เมื่อไม่มีรูป)</div>
                </div>
              </div>
            )}

            {url && (
              <div className="pt-2 space-y-2">
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="block w-full text-center h-9 leading-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">เปิดเต็มจอ (แท็บใหม่) →</a>

                {/* ลิงก์ติดตั้งแอป standalone — ลิงก์เต็ม + คัดลอก */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-500">📲 ลิงก์ติดตั้งแอป (เปิดบนมือถือ → “เพิ่มไปหน้าโฮม”)</div>
                  <div className="text-[11px] text-slate-600 break-all font-mono bg-white border border-slate-200 rounded px-2 py-1">{fullUrl ?? url}</div>
                  <button onClick={copyLink} className="w-full h-8 text-xs font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50">
                    {copied ? "✓ คัดลอกแล้ว" : "📋 คัดลอกลิงก์"}
                  </button>
                </div>

                {/* QR — สแกนด้วยมือถือเพื่อเปิดแอปแล้วติดตั้ง */}
                {qr && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col items-center gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="QR ลิงก์แอป" width={180} height={180} className="rounded" />
                    <div className="text-[11px] text-slate-400 text-center leading-tight">สแกนด้วยกล้องมือถือ → เปิดแอป<br/>แล้วกด “เพิ่มไปหน้าจอโฮม” เพื่อติดตั้ง</div>
                  </div>
                )}
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
