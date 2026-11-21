/** Calcul déterministe en centimes : prix horaire et déplacement figés à la réservation. */
export function visitPrice(hourlyCents: number, minutes: number, travelCents: number) {
  if (![hourlyCents, minutes, travelCents].every(Number.isSafeInteger) || hourlyCents < 0 || minutes < 0 || travelCents < 0)
    throw new Error("Tarif ou durée invalide.");
  return Math.round(hourlyCents * minutes / 60) + travelCents;
}

function localParts(epoch: number, zone: string) {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(epoch);
  return Object.fromEntries(parts.map(p=>[p.type,Number(p.value)]));
}
function shiftLocal(epoch:number,days:number,zone:string) {
  const p=localParts(epoch,zone);
  const desired=Date.UTC(p.year,p.month-1,p.day+days,p.hour,p.minute,p.second);
  let result=epoch+days*86_400_000;
  for(let i=0;i<3;i++) {
    const got=localParts(result,zone);
    result+=desired-Date.UTC(got.year,got.month-1,got.day,got.hour,got.minute,got.second);
  }
  return result;
}
export function recurringDates(start: string, end: string, frequency: "weekly" | "daily", occurrences: number, zone="Europe/Madrid") {
  if (!Number.isInteger(occurrences) || occurrences < 1 || occurrences > 52) throw new Error("Nombre de visites invalide.");
  const first = Date.parse(start), last = Date.parse(end);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first || last - first > 24 * 60 * 60_000)
    throw new Error("Créneau invalide.");
  const days = frequency === "weekly" ? 7 : 1;
  return Array.from({ length: occurrences }, (_, index) => ({ startsAt: new Date(shiftLocal(first,days*index,zone)).toISOString(), endsAt: new Date(shiftLocal(last,days*index,zone)).toISOString() }));
}
