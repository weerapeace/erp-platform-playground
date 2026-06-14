-- ก้อน 2: ผู้รับผิดชอบ creative → user จริง (user_profiles) แทน employees
-- ข้อมูลว่าง (0 คนถูกมอบหมาย) → เคลียร์ค่าเก่าแล้วเปลี่ยน FK
update erp_creative_tasks set assignee_id=null, reviewer_id=null, approver_id=null
  where assignee_id is not null or reviewer_id is not null or approver_id is not null;
update erp_creative_subtasks set assignee_id=null where assignee_id is not null;
update erp_creative_campaigns set owner_id=null where owner_id is not null;
update erp_creative_recurring set assignee_id=null where assignee_id is not null;
delete from erp_creative_subtask_assignees;

alter table erp_creative_tasks
  drop constraint erp_creative_tasks_assignee_id_fkey,
  drop constraint erp_creative_tasks_reviewer_id_fkey,
  drop constraint erp_creative_tasks_approver_id_fkey,
  add constraint erp_creative_tasks_assignee_fk foreign key (assignee_id) references user_profiles(id),
  add constraint erp_creative_tasks_reviewer_fk foreign key (reviewer_id) references user_profiles(id),
  add constraint erp_creative_tasks_approver_fk foreign key (approver_id) references user_profiles(id);

alter table erp_creative_subtasks
  drop constraint erp_creative_subtasks_assignee_id_fkey,
  add constraint erp_creative_subtasks_assignee_fk foreign key (assignee_id) references user_profiles(id);

alter table erp_creative_subtask_assignees rename column employee_id to user_id;
alter table erp_creative_subtask_assignees
  drop constraint erp_creative_subtask_assignees_employee_id_fkey,
  add constraint erp_creative_subtask_assignees_user_fk foreign key (user_id) references user_profiles(id) on delete cascade;

alter table erp_creative_campaigns
  drop constraint erp_creative_campaigns_owner_id_fkey,
  add constraint erp_creative_campaigns_owner_fk foreign key (owner_id) references user_profiles(id);

alter table erp_creative_recurring
  drop constraint erp_creative_recurring_assignee_id_fkey,
  add constraint erp_creative_recurring_assignee_fk foreign key (assignee_id) references user_profiles(id);
