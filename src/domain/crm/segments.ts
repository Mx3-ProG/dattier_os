export type CustomerSegment = "new" | "active" | "loyal" | "dormant";
export type CustomerActivity = {
  paidOrders: number;
  lastPaidAt: string | null;
  marketingConsent: boolean;
  emailAvailable: boolean;
};

/** Segments calculés sur les achats en ligne payés connus du commerce. */
export function classifyCustomer(activity: CustomerActivity, now = Date.now()) {
  const ageDays = activity.lastPaidAt ? (now - Date.parse(activity.lastPaidAt)) / 86_400_000 : Infinity;
  const segment: CustomerSegment = activity.paidOrders === 0 ? "new"
    : ageDays > 90 ? "dormant"
    : activity.paidOrders >= 3 ? "loyal"
    : "active";
  return { segment, emailEligible: activity.marketingConsent && activity.emailAvailable };
}

export const customerSegmentLabels: Record<CustomerSegment, string> = {
  new: "Sans achat en ligne",
  active: "Actifs",
  loyal: "Fidèles",
  dormant: "À réactiver",
};
