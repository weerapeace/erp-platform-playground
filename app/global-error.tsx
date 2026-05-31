"use client";

import { useEffect } from "react";

/**
 * Root error boundary — ทำงานเมื่อ error เกิดใน root layout
 * ต้องมี <html> + <body> ของตัวเอง (ไม่ใช้ layout.tsx)
 */
export default function GlobalError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error("[app/global-error]", error); }, [error]);

  return (
    <html lang="th">
      <body style={{ margin: 0, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#f8fafc", padding: 16,
        }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 12, opacity: 0.4 }}>💥</div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "#1e293b", marginBottom: 8 }}>
              ระบบล่มชั่วคราว
            </h1>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>
              เกิดข้อผิดพลาดร้ายแรงในระบบ ลองรีโหลดดู
            </p>
            <button onClick={reset} style={{
              height: 40, padding: "0 20px", fontSize: 14, fontWeight: 500,
              background: "#3b82f6", color: "white", border: 0, borderRadius: 8, cursor: "pointer",
            }}>
              🔄 ลองใหม่
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
