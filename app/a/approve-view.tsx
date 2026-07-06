"use client";

// ============================================================
// ApproveView — เนื้อหาหน้าอนุมัติเล็ก (ใช้ร่วม /a?token=... และ /a/[token])
// token มาได้ 2 ทาง: prop (path) หรืออ่านจาก query (?token=) / liff.state (เวลามาจาก LIFF endpoint /a)
// ============================================================
import { useCallback, useEffect, useState, type ReactNode } from "react";

type LiffSdk = { init: (o: { liffId: string }) => Promise<void>; isLoggedIn: () => boolean; login: (o?: { redirectUri?: string }) => void; getIDToken: () => string | null };
const getLiff = () => (typeof window !== "undefined" ? (window as unknown as { liff?: LiffSdk }).liff : undefined);
const LIFF_SCRIPT = "https://static.line-scdn.net/liff/edge/2/sdk.js";
const liffId = () => process.env.NEXT_PUBLIC_LINE_LIFF_ID || process.env.NEXT_PUBLIC_LIFF_ID || "2010621559-NELkN0OU";

type Preview = { id: string; title: string; subtask_type: string | null; status: string | null; task_no: string | null; task_title: string | null; images: string[]; groups?: { code: string; images: string[] }[]; links: { label: string | null; key: string | null }[] };

function loadLiff() {
  return new Promise<void>((resolve, reject) => {
    if (getLiff()) return resolve();
    const s = document.createElement("script"); s.src = LIFF_SCRIPT; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error("โหลด LINE LIFF ไม่สำเร็จ"));
    document.head.appendChild(s);
  });
}

// หา token จาก query (?token=) หรือ liff.state (LINE ห่อ query ไว้ตอนมาจาก endpoint)
function tokenFromLocation(): string {
  try {
    const sp = new URLSearchParams(window.location.search);
    const direct = sp.get("token"); if (direct) return direct;
    const st = sp.get("liff.state"); // เช่น "?token=xxx" หรือ "/xxx"
    if (st) { const q = new URLSearchParams(st.startsWith("?") ? st.slice(1) : st.split("?")[1] ?? ""); const t = q.get("token"); if (t) return t; }
  } catch { /* noop */ }
  return "";
}

export function ApproveView({ tokenProp }: { tokenProp?: string }) {
  const [token, setToken] = useState(tokenProp ?? "");
  const [data, setData] = useState<Preview | null>(null);
  const [err, setErr] = useState("");
  const [idToken, setIdToken] = useState("");
  const [liffReady, setLiffReady] = useState(false);
  const [liffMsg, setLiffMsg] = useState("");
  const [busy, setBusy] = useState<"" | "approve" | "revise">("");
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [lb, setLb] = useState(-1);
  const [done, setDone] = useState<{ action: string; by?: string | null } | null>(null);

  // resolve token (prop → query/liff.state)
  useEffect(() => { setToken(tokenProp || tokenFromLocation()); }, [tokenProp]);

  // โหลดข้อมูลงานย่อย (พรีวิว)
  useEffect(() => {
    if (!token) return;
    fetch(`/api/approve?token=${encodeURIComponent(token)}`).then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); else setData(j.data); }).catch(() => setErr("โหลดข้อมูลไม่สำเร็จ"));
  }, [token]);

  // LIFF init → id_token
  const initLiff = useCallback(async () => {
    const id = liffId();
    if (!id) { setLiffMsg("ยังไม่ได้ตั้งค่า LIFF (NEXT_PUBLIC_LINE_LIFF_ID) — แจ้งแอดมิน"); return; }
    try {
      await loadLiff();
      const lf = getLiff();
      if (!lf) throw new Error("ไม่พบ LINE LIFF SDK");
      await lf.init({ liffId: id });
      if (!lf.isLoggedIn()) { lf.login(); return; }
      const tk = lf.getIDToken();
      if (!tk) throw new Error("อ่าน LINE ID token ไม่ได้ — เปิดผ่านแอป LINE");
      setIdToken(tk); setLiffReady(true);
    } catch (e) { setLiffMsg((e as Error).message); }
  }, []);
  useEffect(() => { void initLiff(); }, [initLiff]);

  const act = async (action: "approve" | "revise") => {
    if (!idToken) { setLiffMsg("ยังยืนยัน LINE ไม่สำเร็จ — เปิดลิงก์นี้ในแอป LINE"); return; }
    if (action === "revise" && !reason.trim()) { setReviseOpen(true); return; }
    setBusy(action);
    try {
      const r = await fetch("/api/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, id_token: idToken, action, reason: reason.trim() }) });
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.error || "ทำรายการไม่สำเร็จ"); setBusy(""); return; }
      setDone({ action, by: j.by });
    } catch { setErr("ทำรายการไม่สำเร็จ"); } finally { setBusy(""); }
  };

  const wrap = (children: ReactNode) => (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center px-3 py-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-4">{children}</div>
    </div>
  );

  if (err && !data) return wrap(<div className="py-10 text-center"><div className="text-3xl mb-2">⚠️</div><p className="text-slate-600">{err}</p></div>);
  if (!token) return wrap(<div className="py-10 text-center text-slate-400">ไม่พบโทเคน — เปิดลิงก์จาก LINE อีกครั้ง</div>);
  if (!data) return wrap(<div className="py-10 text-center text-slate-400">กำลังโหลด...</div>);

  if (done) return wrap(
    <div className="py-8 text-center">
      <div className="text-4xl mb-2">{done.action === "approve" ? "✅" : "↩️"}</div>
      <p className="text-lg font-bold text-slate-800">{done.action === "approve" ? "อนุมัติแล้ว" : "ตีกลับให้แก้แล้ว"}</p>
      {done.by && <p className="text-sm text-slate-500 mt-1">โดย {done.by}</p>}
      <p className="text-xs text-slate-400 mt-3">ปิดหน้านี้ได้เลย</p>
    </div>
  );

  const groups = data.groups ?? [];
  const allImgs = [...groups.flatMap((g) => g.images), ...data.images];   // รวมทุกรูปไว้ดูเต็มจอ (กลุ่มก่อน แล้วรูปแนบงาน)
  return wrap(
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-mono text-slate-400">{data.task_no}</p>
        <h1 className="text-lg font-bold text-slate-900 leading-snug">{data.task_title}</h1>
        <p className="text-sm text-violet-700 font-medium">{data.title}</p>
      </div>

      {allImgs.length === 0 ? <p className="text-sm text-slate-400 italic">งานย่อยนี้ไม่ได้แนบรูป</p> : (() => {
        let run = 0;   // ดัชนีรวมสำหรับเปิดดูเต็มจอ
        return (
          <div className="space-y-2.5">
            {/* รูปเข้าสินค้า — จัดกลุ่มตาม Parent/SKU + รหัสกำกับ + เลขกำกับในกลุ่ม */}
            {groups.map((g, gi) => (
              <div key={gi}>
                <p className="text-[10px] font-mono text-slate-600 bg-slate-100 inline-block px-1.5 py-0.5 rounded mb-1">📦 {g.code} <span className="text-slate-400">({g.images.length})</span></p>
                <div className="grid grid-cols-3 gap-1.5">
                  {g.images.map((src, j) => { const i = run++; return (
                    <div key={j} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" onClick={() => setLb(i)} className="w-full h-24 object-cover rounded-lg border border-slate-200 cursor-zoom-in" />
                      <span className="absolute -top-1 -left-1 bg-slate-700 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center shadow">{j + 1}</span>
                    </div>
                  ); })}
                </div>
              </div>
            ))}
            {/* รูปแนบงานทั่วไป (ถ้ามี) */}
            {data.images.length > 0 && (
              <div>
                {groups.length > 0 && <p className="text-[11px] text-slate-400 mb-1">🖼 รูปแนบงาน</p>}
                <div className="grid grid-cols-3 gap-1.5">
                  {data.images.map((src, j) => { const i = run++; return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={j} src={src} alt="" onClick={() => setLb(i)} className="w-full h-24 object-cover rounded-lg border border-slate-200 cursor-zoom-in" />
                  ); })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {data.links.length > 0 && (
        <div className="space-y-1">{data.links.map((l, i) => l.key ? <a key={i} href={`/api/r2-image?key=${encodeURIComponent(l.key)}`} target="_blank" rel="noreferrer" className="block text-xs text-violet-700 truncate">🔗 {l.label || l.key}</a> : null)}</div>
      )}

      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      {liffMsg && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{liffMsg}</p>}

      {data.status === "approved" ? (
        <p className="text-center text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-2">✅ งานนี้อนุมัติแล้ว</p>
      ) : reviseOpen ? (
        <div className="space-y-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="เหตุผลที่ตีกลับ (บอกให้แก้อะไร)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-300" />
          <div className="flex gap-2">
            <button onClick={() => setReviseOpen(false)} className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">ยกเลิก</button>
            <button onClick={() => act("revise")} disabled={busy !== "" || !reason.trim() || !liffReady} className="flex-1 h-11 rounded-xl bg-orange-500 text-white text-sm font-bold disabled:opacity-50">{busy === "revise" ? "..." : "↩ ยืนยันตีกลับ"}</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 pt-1">
          <button onClick={() => setReviseOpen(true)} disabled={busy !== "" || !liffReady} className="flex-1 h-12 rounded-xl border border-orange-200 text-orange-700 text-sm font-bold disabled:opacity-50">↩ ตีกลับขอแก้</button>
          <button onClick={() => act("approve")} disabled={busy !== "" || !liffReady} className="flex-1 h-12 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">{busy === "approve" ? "..." : "✓ อนุมัติ"}</button>
        </div>
      )}
      {!liffReady && !liffMsg && <p className="text-center text-[11px] text-slate-400">กำลังยืนยันบัญชี LINE...</p>}

      {lb >= 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLb(-1)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={allImgs[lb]} alt="" className="max-h-[90vh] max-w-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
