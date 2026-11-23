"use client";

// ============================================================
// CompanyQrView — สแกน QR ไลน์บริษัท (เปิดผ่าน LIFF /a?cq=<รหัส>) · กติกา lib/line-company-qr · API /api/line-company-qr
//   พนักงาน  : กรอกรหัสพนักงาน + เบอร์ → ผูก (ผิดเกิน 5 ครั้ง/วัน = ล็อก) → รอ HR ยืนยันก่อนเห็นเงินเดือน/ใบเตือน
//   ลูกค้า   : พิมพ์ชื่อร้าน → ส่งคำขอ → พนักงานยืนยันในห้องแชต
//   รายร้าน  : เห็นชื่อร้าน → กดยืนยัน → ผูกทันที
//   ทุกแบบ: ยังไม่เป็นเพื่อนไลน์บริษัท = ขั้นที่ 1 "เพิ่มเพื่อน" ก่อน (กรอกยังไม่ได้) → เป็นเพื่อนแล้วค่อยยืนยัน (เจ้าของเลือก 2026-11-23)
//     เช็กเพื่อนด้วย liff.getFriendship (ต้องผูก LINE Login กับบัญชีไลน์บริษัทแล้ว) · เช็กได้ว่าเป็นเพื่อนแล้ว = ข้ามขั้น 1
//     เช็กไม่ได้ = ยังโชว์ขั้น 1 แต่กด "เพิ่มเพื่อนแล้ว ไปต่อ" ผ่านได้ (เชื่อคนกด) · เช็กได้ว่ายังไม่เป็นเพื่อน = ไปต่อไม่ได้
//   แอดมิน   : ล็อกอินบัญชี ERP → ผูกไลน์กับบัญชี (/api/account/line-link) → มีสิทธิ์แอดมิน = เมนูแอดมินขึ้นเอง
// ============================================================
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { initLiffIdToken, type LiffProfile, type LiffSdk } from "@/lib/liff-client";

type Info = { kind: "staff" | "customer" | "admin" | "shop"; shop_name: string | null; oa_add_url: string | null; oa_name: string | null };

const TITLE: Record<Info["kind"], string> = {
  staff: "ผูกไลน์พนักงาน",
  customer: "ผูกไลน์กับร้านของคุณ",
  shop: "ผูกไลน์กับร้าน",
  admin: "ผูกไลน์แอดมิน",
};

const input = "h-12 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-emerald-500";

export function CompanyQrView({ code }: { code: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [liff, setLiff] = useState<LiffSdk | null>(null);
  const [idToken, setIdToken] = useState("");
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [liffErr, setLiffErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ title: string; text: string; warn?: string } | null>(null);
  const [isFriend, setIsFriend] = useState<boolean | null>(null);
  const [erpLogin, setErpLogin] = useState<"checking" | "need" | "ok" | "linked">("checking");
  const [f, setF] = useState({ employee_code: "", phone: "", shop_name: "", contact_name: "" });

  useEffect(() => {
    fetch(`/api/line-company-qr?c=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) setLoadErr(j.error); else setInfo(j.data); })
      .catch(() => setLoadErr("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"));
  }, [code]);

  useEffect(() => {
    let alive = true;
    initLiffIdToken()
      .then(async (r) => {
        if (!r || !alive) return;
        setLiff(r.liff); setIdToken(r.idToken);
        const [p, fs] = await Promise.all([r.liff.getProfile().catch(() => null), r.liff.getFriendship?.().catch(() => null)]);
        if (!alive) return;
        setProfile(p); setIsFriend(fs ? fs.friendFlag : null);
      })
      .catch((e: Error) => { if (alive) setLiffErr(e.message); });
    return () => { alive = false; };
  }, []);

  // แอดมิน: ล็อกอิน ERP อยู่ไหม / ผูกไลน์ไว้แล้วหรือยัง
  useEffect(() => {
    if (info?.kind !== "admin") return;
    apiFetch("/api/account/line-link").then(async (r) => {
      if (r.status === 401) { setErpLogin("need"); return; }
      const j = await r.json().catch(() => ({}));
      setErpLogin((j as { linked?: boolean }).linked ? "linked" : "ok");
    }).catch(() => setErpLogin("need"));
  }, [info?.kind]);

  // กลับมาจากหน้าเพิ่มเพื่อน → เช็กใหม่เอง (และมีปุ่ม "เพิ่มแล้ว" ให้กดเช็กเอง)
  const [checking, setChecking] = useState(false);
  const [friendPassed, setFriendPassed] = useState(false);   // เช็กเพื่อนไม่ได้ แล้วคนกดยืนยันว่าเพิ่มแล้ว
  const [friendMsg, setFriendMsg] = useState("");
  /** manual = คนกดปุ่ม "เพิ่มเพื่อนแล้ว ไปต่อ" */
  const recheckFriend = async (manual = false) => {
    let flag: boolean | null = null;
    if (liff?.getFriendship) {
      setChecking(true);
      try { flag = (await liff.getFriendship()).friendFlag; } catch { flag = null; }
      finally { setChecking(false); }
    }
    setIsFriend(flag);
    if (!manual) return;
    if (flag === null) setFriendPassed(true);   // เช็กไม่ได้ = เชื่อคนกด
    else if (!flag) setFriendMsg("ยังไม่ได้เพิ่มเพื่อน — กดปุ่มเพิ่มเพื่อนด้านบนก่อน แล้วกลับมาหน้านี้");
  };
  useEffect(() => {
    if (isFriend === true || friendPassed) return;
    const on = () => { if (document.visibilityState === "visible") void recheckFriend(); };
    document.addEventListener("visibilitychange", on); window.addEventListener("focus", on);
    return () => { document.removeEventListener("visibilitychange", on); window.removeEventListener("focus", on); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFriend, liff, friendPassed]);

  const submit = async () => {
    if (!idToken) { setErr(liffErr || "กำลังเชื่อมต่อ LINE..."); return; }
    if (!info) return;
    if (info.kind === "staff" && (!f.employee_code.trim() || !f.phone.trim())) { setErr("กรอกรหัสพนักงานและเบอร์โทรให้ครบ"); return; }
    if (info.kind === "customer" && !f.shop_name.trim()) { setErr("พิมพ์ชื่อร้านของคุณ"); return; }
    setBusy(true); setErr("");
    try {
      if (info.kind === "admin") {
        const r = await apiFetch("/api/account/line-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_token: idToken }) });
        const j = await r.json();
        if (!r.ok || j.error) { setErr(j.error || "ผูกไม่สำเร็จ"); return; }
        setDone({ title: "ผูกไลน์กับบัญชี ERP แล้ว", text: "ถ้าบัญชีนี้มีสิทธิ์แอดมิน เมนูแอดมิน (มีแท็บสลับดูแบบพนักงาน/ลูกค้า) จะขึ้นในแชตไลน์บริษัทเอง" });
        return;
      }
      const r = await fetch("/api/line-company-qr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ c: code, id_token: idToken, ...f }) });
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.error || "ทำรายการไม่สำเร็จ"); return; }
      const d = j.data as { kind: string; status: string; hr_confirmed?: boolean; name?: string; shop_name?: string | null };
      if (d.kind === "staff") {
        setDone({
          title: `ผูกไลน์เรียบร้อย${d.name ? ` คุณ${d.name}` : ""}`,
          text: "เมนูพนักงานจะขึ้นในแชตไลน์บริษัท",
          warn: d.hr_confirmed ? undefined : "ปุ่มเงินเดือนและใบเตือนจะเปิดให้ดูหลังฝ่ายบุคคลยืนยันตัวตนของคุณ (แจ้ง HR ได้เลยว่าผูกไลน์แล้ว)",
        });
      } else if (d.status === "pending") {
        setDone({ title: "ส่งคำขอแล้ว", text: `พนักงานจะยืนยันร้าน "${d.shop_name}" ให้ ระหว่างนี้พิมพ์ถามในแชตไลน์บริษัทได้เลย` });
      } else {
        setDone({ title: d.status === "already" ? "ไลน์นี้ผูกร้านไว้แล้ว" : "ผูกไลน์กับร้านเรียบร้อย", text: `ร้าน ${d.shop_name ?? ""} · เมนูลูกค้าจะขึ้นในแชตไลน์บริษัท (ดูสถานะงานและตารางส่งงานได้)` });
      }
    } catch { setErr("ทำรายการไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  };

  const wrap = (children: ReactNode) => (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center px-3 py-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-5">{children}</div>
    </div>
  );
  const friendBox = isFriend !== true && info?.oa_add_url ? (
    <a href={info.oa_add_url} className="mt-4 block rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
      <Icon name="add" /> เพิ่มเพื่อนไลน์บริษัท (จำเป็น — ไม่งั้นจะไม่เห็นเมนู)
    </a>
  ) : null;

  if (loadErr) return wrap(
    <div className="py-8 text-center">
      <Icon name="warning" size={36} className="mx-auto text-amber-500" />
      <p className="mt-3 text-slate-700">{loadErr}</p>
    </div>
  );
  if (!info) return wrap(<p className="py-10 text-center text-slate-400">กำลังโหลด...</p>);

  if (done) return wrap(
    <div className="py-6 text-center">
      <Icon name="done" size={44} className="mx-auto text-emerald-600" />
      <p className="mt-3 text-lg font-bold text-slate-900">{done.title}</p>
      <p className="mt-1 text-sm text-slate-600">{done.text}</p>
      {done.warn && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-800">{done.warn}</p>}
      {friendBox}
      {liff?.closeWindow && (
        <button onClick={() => liff.closeWindow?.()} className="mt-5 h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">ปิดหน้านี้</button>
      )}
    </div>
  );

  // ขั้นที่ 1: ต้องเป็นเพื่อนไลน์บริษัทก่อน
  if (isFriend !== true && !friendPassed && info.oa_add_url && (liff || liffErr)) return wrap(
    <div className="space-y-4 text-center">
      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="rounded-full bg-emerald-600 px-2.5 py-1 font-semibold text-white">1 เพิ่มเพื่อน</span>
        <span className="text-slate-300">→</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">2 {info.kind === "staff" ? "ยืนยันตัวตน" : info.kind === "admin" ? "เข้าสู่ระบบ" : "ยืนยันร้าน"}</span>
      </div>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Icon name="chat" size={30} /></div>
      <div>
        <p className="text-lg font-bold text-slate-900">เพิ่มเพื่อน {info.oa_name || "ไลน์บริษัท"} ก่อน</p>
        <p className="mt-1 text-sm text-slate-600">เพิ่มเพื่อนแล้วกลับมาหน้านี้ เพื่อ{TITLE[info.kind].replace(/^ผูกไลน์/, "ผูกไลน์")} · เมนูของคุณจะขึ้นในแชตนี้</p>
      </div>
      <a href={info.oa_add_url} className="block h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold leading-[3rem] text-white">เพิ่มเพื่อน</a>
      <button type="button" onClick={() => void recheckFriend(true)} disabled={checking}
        className="h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-50">{checking ? "กำลังเช็ก..." : "เพิ่มเพื่อนแล้ว ไปต่อ"}</button>
      {friendMsg && <p className="text-sm text-amber-700">{friendMsg}</p>}
    </div>
  );

  const lineBox = (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
      {profile?.pictureUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={profile.pictureUrl} alt="" className="h-10 w-10 rounded-full border border-slate-200 object-cover" />
        : <span className="h-10 w-10 rounded-full bg-emerald-50" />}
      <div className="min-w-0">
        <p className="text-xs text-slate-500">จะผูกกับบัญชี LINE นี้</p>
        <p className="truncate font-semibold text-slate-800">{profile?.displayName || (liffErr ? "-" : "กำลังเชื่อมต่อ LINE...")}</p>
      </div>
    </div>
  );

  const loginNext = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/a";

  return wrap(
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900 leading-snug">{TITLE[info.kind]}</h1>

      {info.kind === "staff" && (
        <>
          <p className="text-sm text-slate-600">กรอกรหัสพนักงานและเบอร์โทรที่ให้ไว้กับฝ่ายบุคคล</p>
          <input className={input} inputMode="text" autoCapitalize="characters" placeholder="รหัสพนักงาน เช่น E0123" value={f.employee_code} onChange={(e) => setF({ ...f, employee_code: e.target.value })} />
          <input className={input} inputMode="tel" placeholder="เบอร์โทร" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <p className="text-xs text-slate-400">กรอกผิดได้ 5 ครั้งต่อวัน · ไม่ใช่คุณ อย่าผูกแทนคนอื่น</p>
        </>
      )}
      {info.kind === "customer" && (
        <>
          <p className="text-sm text-slate-600">พิมพ์ชื่อร้าน พนักงานจะยืนยันให้ แล้วคุณจะดูสถานะงานและตารางส่งงานในไลน์ได้</p>
          <input className={input} placeholder="ชื่อร้าน" value={f.shop_name} onChange={(e) => setF({ ...f, shop_name: e.target.value })} />
          <input className={input} placeholder="ชื่อผู้ติดต่อ (ไม่ใส่ก็ได้)" value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} />
        </>
      )}
      {info.kind === "shop" && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">QR นี้เป็นของร้าน</p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">{info.shop_name}</p>
          <p className="mt-1 text-xs text-red-600">ถ้าไม่ใช่ร้านของคุณ อย่ากดยืนยัน</p>
        </div>
      )}
      {info.kind === "admin" && (
        <p className="text-sm text-slate-600">ใช้บัญชี ERP ของคุณ · เมนูแอดมินขึ้นเฉพาะบัญชีที่มีสิทธิ์แอดมิน และถอนสิทธิ์ใน ERP แล้วเมนูจะหายเอง</p>
      )}

      {lineBox}
      {liffErr && <p className="text-sm text-red-600">{liffErr}</p>}

      {info.kind === "admin" && erpLogin === "need" ? (
        <a href={`/login?next=${encodeURIComponent(loginNext)}`} className="block h-12 w-full rounded-xl bg-slate-900 text-center text-base font-semibold leading-[3rem] text-white">เข้าสู่ระบบ ERP ก่อน</a>
      ) : info.kind === "admin" && erpLogin === "checking" ? (
        <p className="text-center text-sm text-slate-400">กำลังตรวจการเข้าสู่ระบบ...</p>
      ) : (
        <button onClick={() => void submit()} disabled={busy || !idToken}
          className="h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white disabled:opacity-50">
          {busy ? "กำลังทำรายการ..." : info.kind === "customer" ? "ส่งคำขอ" : info.kind === "admin" && erpLogin === "linked" ? "ผูกไลน์นี้แทนไลน์เดิม" : "ยืนยัน ผูกไลน์นี้"}
        </button>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {friendBox}
    </div>
  );
}
