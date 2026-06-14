"use client";

import { MasterCRUDPage } from "@/components/master-crud";
import { ADMIN_DEPARTMENT_MASTER_CONFIG } from "@/lib/admin-department-master-config";

export default function AdminDepartmentsPage() {
  return <MasterCRUDPage config={ADMIN_DEPARTMENT_MASTER_CONFIG} />;
}
