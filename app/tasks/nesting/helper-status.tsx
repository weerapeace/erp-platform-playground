"use client";

/**
 * ป้ายสถานะ "ตัวช่วยจัดเรียงในเครื่องนี้" + วิธีติดตั้ง (ใช้ทั้งหน้ารายการงานและหน้าจัดเรียง)
 * ตรวจซ้ำเองทุก 8 วินาทีตอนยังไม่พร้อม + ตอนกลับมาที่แท็บนี้ (ติดตั้งเสร็จแล้วป้ายเปลี่ยนเองไม่ต้องรีเฟรช)
 */
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/components/i18n";
import { CopyPathButton } from "@/components/copy-path-button";
import { HELPER_INSTALL_PATH, HELPER_MIN_VERSION, checkHelper, type HelperState } from "@/lib/nesting-helper";

export function useHelperStatus() {
  const [status, setStatus] = useState<HelperState>({ state: "checking" });
  const recheck = useCallback(async () => setStatus(await checkHelper()), []);
  useEffect(() => { void recheck(); }, [recheck]);
  useEffect(() => {
    if (status.state === "ready" || status.state === "checking") return;
    const timer = setInterval(() => { void recheck(); }, 8000);
    const onFocus = () => { void recheck(); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [status.state, recheck]);
  return { status, recheck };
}

/** ป้ายเล็ก (หัวหน้า) */
export function HelperChip({ status }: { status: HelperState }) {
  const t = useT();
  if (status.state === "checking")
    return <span className="text-xs text-slate-400">{t("กำลังตรวจตัวช่วยในเครื่องนี้…", "Checking the helper on this computer…")}</span>;
  if (status.state === "ready")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        ● {t("ตัวช่วยในเครื่องนี้พร้อม", "Helper on this computer is ready")} · v{status.version}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
      ● {status.state === "outdated"
        ? t(`ตัวช่วยเวอร์ชันเก่า (v${status.version})`, `Helper is outdated (v${status.version})`)
        : t("เครื่องนี้ยังไม่มีตัวช่วย", "No helper on this computer")}
    </span>
  );
}

/** การ์ดวิธีติดตั้ง (โชว์เมื่อยังใช้ไม่ได้) */
export function HelperSetupCard({ status, onRecheck }: { status: HelperState; onRecheck: () => void }) {
  const t = useT();
  if (status.state === "ready" || status.state === "checking") return null;
  const outdated = status.state === "outdated";
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-5">
      <div className="text-base font-semibold text-slate-900">
        {outdated
          ? t(`ตัวช่วยในเครื่องนี้ยังเป็นเวอร์ชันเก่า (v${status.version}) — ต้องเป็น v${HELPER_MIN_VERSION} ขึ้นไป`,
            `The helper on this computer is outdated (v${status.version}) — v${HELPER_MIN_VERSION} or newer is needed`)
          : t("เครื่องนี้ยังไม่ได้ลงตัวช่วยคำนวณ (หรือตัวช่วยปิดอยู่)", "This computer has no nesting helper yet (or it is not running)")}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {t("การจัดเรียงคำนวณด้วยแรงของเครื่องนี้เอง — ลงครั้งเดียว ใช้ได้ตลอด และอัปเดตตัวเอง",
          "Nesting runs on this computer's own power — install once, it updates itself")}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-medium text-violet-600">{t("ขั้นที่ 1", "Step 1")}</div>
          <div className="mt-1 text-sm font-medium text-slate-800">{t("เปิดโฟลเดอร์ตัวติดตั้ง", "Open the installer folder")}</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="truncate text-[11px] text-slate-500" title={HELPER_INSTALL_PATH}>{HELPER_INSTALL_PATH}</code>
            <CopyPathButton paths={[{ path: HELPER_INSTALL_PATH, label: t("โฟลเดอร์ตัวติดตั้ง", "Installer folder") }]} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-medium text-violet-600">{t("ขั้นที่ 2", "Step 2")}</div>
          <div className="mt-1 text-sm font-medium text-slate-800">{t("ดับเบิลคลิก NestingHelper-Setup", "Double-click NestingHelper-Setup")}</div>
          <div className="mt-1 text-xs text-slate-500">
            {t("ถ้าขึ้น “Windows protected your PC” ให้กด More info → Run anyway",
              "If you see “Windows protected your PC”, click More info → Run anyway")}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-medium text-violet-600">{t("ขั้นที่ 3", "Step 3")}</div>
          <div className="mt-1 text-sm font-medium text-slate-800">{t("กลับมากดตรวจ", "Come back and check")}</div>
          <button type="button" onClick={onRecheck}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            ↻ {t("ตรวจอีกครั้ง", "Check again")}
          </button>
        </div>
      </div>
      <ul className="mt-4 space-y-1 text-xs text-slate-500">
        <li>• {t("ลงไว้แล้ว: ดูว่ามีไอคอนกรรไกรสีน้ำเงินข้างนาฬิกาไหม — ไม่มี = ดับเบิลคลิกทางลัด “จัดเรียงงานพิมพ์ (Nesting)” บนเดสก์ท็อป",
          "Already installed: look for the blue scissors icon next to the clock — if missing, double-click the “จัดเรียงงานพิมพ์ (Nesting)” desktop shortcut")}</li>
        <li>• {t("เวอร์ชันเก่า: คลิกขวาไอคอนข้างนาฬิกา → ตรวจหาเวอร์ชันใหม่", "Outdated: right-click the icon next to the clock → Check for updates")}</li>
        <li>• {t("ถ้าเบราว์เซอร์ถามว่าให้เว็บนี้เข้าถึงอุปกรณ์ในเครื่อง/ในเครือข่ายไหม ให้กดอนุญาต",
          "If the browser asks whether this site may access devices on your computer/network, click Allow")}</li>
        <li>• {t("มือถือ: ดูงานที่บันทึกไว้ได้ แต่สั่งจัดเรียงต้องใช้คอมที่ลงตัวช่วย",
          "Phones: you can view saved jobs, but nesting needs a computer with the helper")}</li>
      </ul>
    </div>
  );
}
