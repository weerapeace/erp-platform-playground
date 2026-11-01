/**
 * ออกจาก "กรอบซ้อน" (iframe) ไปทั้งหน้าต่าง — ของกลาง
 *
 * หน้าแอปแยก /app/<key> (และป๊อปอัปที่ฝังหน้า ?embed=1) เปิดหน้าจริงใน iframe
 * → หน้าเว็บนอกที่ห้ามเปิดในกรอบ เช่น หน้าล็อกอิน/ยินยอมของ Google (OAuth) ต้องพาทั้งหน้าต่างไป
 *   ไม่งั้น Google ขึ้นหน้า error 400/403 (รูปหุ่นยนต์) ในกรอบ
 * ใช้คู่กัน: returnPathForTop() ตอนบอกเว็บนอกว่า "เสร็จแล้วส่งกลับมาที่ไหน" + navigateTop() ตอนพาไป
 */

/** หน้าต่างบนสุดที่เป็นเว็บเราเอง (อ่าน location ได้) · ไม่ได้อยู่ในกรอบ/อ่านไม่ได้ = หน้าต่างตัวเอง */
function topWindow(): Window {
  try {
    if (window.top && window.top !== window) { void window.top.location.pathname; return window.top; }
  } catch { /* กรอบของเว็บอื่น — อ่านไม่ได้ */ }
  return window;
}

/** พาทั้งหน้าต่างไป url (หลุดจากกรอบซ้อน) */
export function navigateTop(url: string): void {
  topWindow().location.href = url;
}

/**
 * path ที่จะให้เว็บนอกส่งกลับมา — ถ้าตอนนี้อยู่ในแอปแยก /app/<key> → กลับเข้าแอปเดิมผ่าน ?go=<path>
 * (เชลล์แอปเปิด path นั้นในกรอบให้) · ไม่ได้อยู่ในแอปแยก → คืน path เดิม
 */
export function returnPathForTop(path: string): string {
  const top = topWindow();
  if (top === window) return path;
  const app = top.location.pathname.match(/^\/app\/[^/?#]+/);
  return app ? `${app[0]}?go=${encodeURIComponent(path)}` : path;
}
