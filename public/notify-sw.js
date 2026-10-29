/*
 * 📲 Service worker ของแอป "แจ้งเตือน ERP" (/notify) — รับ push แล้วเด้งแจ้งเตือนบนเครื่อง
 * scope = /notify (ไม่มี fetch handler → ไม่ยุ่งกับการโหลดหน้าใด ๆ ของ ERP)
 * ข้อความจาก lib/push-server: { id, title, body, url, priority, unread }
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch { d = { title: "แจ้งเตือนใหม่", body: event.data ? event.data.text() : "" }; }

  const title = d.title || "แจ้งเตือนใหม่";
  const options = {
    body: d.body || "",
    icon: "/api/app-icon/notify?s=192",   // ไอคอนแอปที่ตั้งไว้ (ของกลาง lib/app-branding)
    badge: "/notify-badge-96.png",
    tag: d.id || "erp-summary",
    renotify: true,
    requireInteraction: d.priority === "high",
    data: { id: d.id || null, url: d.url || null, direct: !!d.direct },
  };

  const jobs = [self.registration.showNotification(title, options)];
  // ตัวเลขบนไอคอนแอป (เครื่องที่รองรับ)
  if (typeof d.unread === "number" && self.navigator && "setAppBadge" in self.navigator) {
    jobs.push((d.unread > 0 ? self.navigator.setAppBadge(d.unread) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  // บอกหน้าแอปที่เปิดอยู่ให้โหลดรายการใหม่
  jobs.push(self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then((list) => list.forEach((c) => c.postMessage({ type: "notify:push", id: d.id || null }))));
  event.waitUntil(Promise.all(jobs));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const id = data.id || null;
  // ป๊อปเตือนงาน (direct) → เปิดหน้า ERP พร้อมป๊อปเลย ไม่ผ่านแอปแจ้งเตือน
  if (data.direct && data.url) {
    event.waitUntil(self.clients.openWindow(data.url));
    return;
  }
  const target = "/notify" + (id ? "?open=" + encodeURIComponent(id) : "");
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).pathname.startsWith("/notify")) {
        await c.focus();
        c.postMessage({ type: "notify:open", id });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
