export type WorkItem = { key: string; kind: "inquiry" | "task" | "proposal"; title: string; detail: string; dueAt: string | null; overdue: boolean; actionId: string | null };

export function crmWorkQueue(input: {
  inquiries: { id: string; subject: string; status: string }[];
  activities: { id: string; opportunity_id: string; title: string; due_at: string | null; done_at: string | null }[];
  opportunities: { id: string; title: string; stage: string; proposal_status: string; follow_up_at: string | null }[];
}, now = new Date()): WorkItem[] {
  const current = now.getTime();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const openOpportunities = new Map(input.opportunities.filter((item) => !["won", "lost"].includes(item.stage)).map((item) => [item.id, item]));
  const items: WorkItem[] = [
    ...input.inquiries.filter((item) => item.status === "new").map((item) => ({ key: `inquiry:${item.id}`, kind: "inquiry" as const, title: item.subject, detail: "Nouvelle demande", dueAt: null, overdue: false, actionId: item.id })),
    ...input.activities.filter((item) => !item.done_at && item.due_at && openOpportunities.has(item.opportunity_id) && new Date(item.due_at).getTime() < endOfDay).map((item) => ({ key: `task:${item.id}`, kind: "task" as const, title: item.title, detail: openOpportunities.get(item.opportunity_id)!.title, dueAt: item.due_at, overdue: new Date(item.due_at!).getTime() < current, actionId: item.id })),
    ...input.opportunities.filter((item) => !["won", "lost"].includes(item.stage) && !["accepted", "declined"].includes(item.proposal_status) && item.follow_up_at && new Date(item.follow_up_at).getTime() < endOfDay).map((item) => ({ key: `proposal:${item.id}`, kind: "proposal" as const, title: item.title, detail: "Proposition à relancer", dueAt: item.follow_up_at, overdue: new Date(item.follow_up_at!).getTime() < current, actionId: null })),
  ];
  return items.sort((a, b) => (a.kind === "inquiry" ? -1 : b.kind === "inquiry" ? 1 : (a.dueAt ?? "").localeCompare(b.dueAt ?? "")));
}
