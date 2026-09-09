export type Status = 'backlog' | 'ongoing' | 'ready_for_test' | 'closed' | 'rejected';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Org = 'prometeia' | 'bank';

export type Issue = {
  id: string;
  engagement_id: string;
  key: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  module: string | null;
  test_case_package: string | null;
  test_case_step: string | null;
  org: Org;
  reporter_id: string;
  assignee_id: string | null;
  created_at: string;
  closed_at: string | null;
};

export type IssueHistoryEntry = {
  id: string;
  issue_id: string;
  field: string;
  from_value: string | null;
  to_value: string;
  changed_by: string;
  changed_at: string;
};

export type SlaDays = Record<Priority, number>;

export const STATUSES: Status[] = ['backlog', 'ongoing', 'ready_for_test', 'closed', 'rejected'];
export const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];
