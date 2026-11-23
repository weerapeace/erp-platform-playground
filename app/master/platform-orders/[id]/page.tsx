"use client";

// 📄 หน้ารายละเอียดออเดอร์เต็มหน้า /master/platform-orders/[id] — เนื้อหาอยู่ที่ ../order-detail-view (ชิ้นเดียวกับแผงข้างในศูนย์ออเดอร์)
import { useParams } from "next/navigation";
import { OrderDetailView } from "../order-detail-view";

export default function PlatformOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <OrderDetailView id={decodeURIComponent(String(id ?? ""))} layout="page" />;
}
