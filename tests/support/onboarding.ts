import { randomUUID } from "node:crypto";
export const onboardingInput = () => ({
  requestKey: randomUUID(),
  professional: { jobTitle: "Gérant", phone: "" },
  activity: { industry: "restaurant" as const, trade: "Restaurant", tradeDetail: "" },
  answers: { teamSize: "solo" as const, workflows: [] as string[], currentTools: "", mainChallenge: "Organiser mon activité" },
  discovery: { source: "search" as const, detail: "" },
});
