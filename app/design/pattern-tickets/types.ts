import type { ChecklistItem, PatternAction, TemplateItem, TicketLink } from "@/lib/pattern-tickets";

export type TicketType = {
  key: string; label_th: string; label_en: string; icon: string; color: string;
  checklist: TemplateItem[]; deliverables: string[]; sort_order: number; is_active: boolean;
};

export type Me = { id: string | null; name: string | null; role_label: string | null; can_work: boolean; can_manage: boolean; can_create: boolean };

export type TicketRow = {
  id: string; ticket_no: string | null; type_key: string; title: string; title_en: string; sku_code: string | null;
  status: string; priority: string; due_date: string | null;
  requester_id: string | null; requester_name: string | null; requester_dept: string | null;
  assignee_id: string | null; assignee_name: string | null;
  checklist: ChecklistItem[]; drive_folder_url: string | null;
  created_at: string; updated_at: string; done_at: string | null;
};

export type Ticket = TicketRow & {
  description_th: string; description_en: string; en_edited: boolean;
  links: TicketLink[]; drive_folder_id: string | null; last_note: string | null;
  started_at: string | null; submitted_at: string | null;
};

export type TicketDetail = { data: Ticket; actions: PatternAction[]; can_edit: boolean; can_work: boolean; can_assign: boolean };
