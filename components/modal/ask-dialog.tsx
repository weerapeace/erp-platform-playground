"use client";

/**
 * askText / askConfirm (ของกลาง) — ถามผู้ใช้จาก "ฟังก์ชันธรรมดา" ได้ โดยไม่ต้องวาง <Dialog> ไว้ในหน้า
 * ใช้แทน window.prompt / window.confirm ของเบราว์เซอร์ (หน้าตาไม่ตรงระบบ · ปุ่มยกเลิกบางที่ถูกตีความผิด)
 *
 *   const reason = await askText({ title: "เหตุผลที่ไม่ผ่าน", required: true });
 *   if (reason === null) return;            // กดยกเลิก / ปิดป๊อป = null เสมอ → ต้องหยุดงานต่อ
 *
 *   if (!(await askConfirm({ title: "ปิดงานนี้?", message: "...", variant: "danger" }))) return;
 *
 * ข้างในใช้ ConfirmDialog กลาง (Esc/คลิกพื้นหลัง = ยกเลิก) · ข้อความปุ่มเป็น 2 ภาษาผ่าน tr()
 */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfirmDialog } from "./index";
import { tr } from "@/lib/lang";

type Base = { title: string; message?: React.ReactNode; confirmText?: string; cancelText?: string; variant?: "default" | "danger" };
export type AskTextOptions = Base & { placeholder?: string; required?: boolean; initial?: string; rows?: number };

/** เปิดป๊อปชั่วคราวบน root แยก (ปิดแล้วถอดทิ้ง) */
function mount<T>(render: (done: (v: T) => void) => React.ReactNode): Promise<T> {
  return new Promise<T>((resolve) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    let settled = false;
    const done = (v: T) => {
      if (settled) return;
      settled = true;
      resolve(v);
      setTimeout(() => { root.unmount(); el.remove(); }, 0);
    };
    root.render(<>{render(done)}</>);
  });
}

function AskTextDialog({ opts, done }: { opts: AskTextOptions; done: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.initial ?? "");
  const [err, setErr] = useState("");
  const submit = () => {
    const v = value.trim();
    if (opts.required && !v) { setErr(tr("กรุณากรอกข้อความก่อน", "Please enter a reason first")); return; }
    done(v);
  };
  return (
    <ConfirmDialog
      open
      onClose={() => done(null)}
      onConfirm={submit}
      title={opts.title}
      variant={opts.variant}
      confirmText={opts.confirmText}
      cancelText={opts.cancelText}
      message={
        <div className="space-y-2">
          {opts.message ? <div>{opts.message}</div> : null}
          <textarea
            autoFocus
            rows={opts.rows ?? 3}
            value={value}
            placeholder={opts.placeholder}
            onChange={(e) => { setValue(e.target.value); if (err) setErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 resize-none ${err ? "border-red-300 focus:ring-red-500" : "border-slate-200 focus:ring-blue-500"}`}
          />
          {err ? <p className="text-xs text-red-600">{err}</p> : null}
        </div>
      }
    />
  );
}

/** ถามข้อความ — คืนข้อความ (ตัดช่องว่างหัวท้ายแล้ว) หรือ null ถ้ากดยกเลิก/ปิด */
export function askText(opts: AskTextOptions): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  return mount<string | null>((done) => <AskTextDialog opts={opts} done={done} />);
}

/** ถามยืนยัน — คืน true เมื่อกดยืนยัน · false เมื่อกดยกเลิก/ปิด */
export function askConfirm(opts: Base): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return mount<boolean>((done) => (
    <ConfirmDialog open onClose={() => done(false)} onConfirm={() => done(true)} title={opts.title}
      message={opts.message ?? ""} variant={opts.variant} confirmText={opts.confirmText} cancelText={opts.cancelText} />
  ));
}
