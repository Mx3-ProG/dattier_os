"use client";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { FloorMap, type MapTable } from "../floor-map";

type Day = { date: string; status: string; free: number; total: number };
type Calendar = { month: string; largest: number; group: boolean; days: Day[] };
type Slot = {
  time: string;
  start: string;
  bookable: boolean;
  past: boolean;
  free: string[];
};
type Availability = {
  date: string;
  open: boolean;
  group: boolean;
  durationMinutes: number;
  tables: (MapTable & { unavailable: boolean })[];
  services: { id: string; name: string; slots: Slot[] }[];
};

const RESTAURANT = "bernay";
const todayParis = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
    new Date(),
  );
const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const longDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
const monthName = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
const dayLabels: Record<string, string> = {
  available: "Disponible",
  limited: "Dernières tables",
  full: "Complet",
  closed: "Fermé",
  past: "Indisponible",
};

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Connexion au restaurant impossible.");
  return d;
}

export function Booking() {
  const [guests, setGuests] = useState(2),
    [month, setMonth] = useState(() => todayParis().slice(0, 7)),
    [cal, setCal] = useState<Calendar | null>(null),
    [date, setDate] = useState<string | null>(null),
    [day, setDay] = useState<Availability | null>(null),
    [time, setTime] = useState<string | null>(null),
    [table, setTable] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [done, setDone] = useState<{
      id: string;
      date: string;
      time: string;
      table: number | null;
      guests: number;
    } | null>(null);

  useEffect(() => {
    let live = true;
    getJson<Calendar>(
      `/api/v1/calendar?restaurant=${RESTAURANT}&month=${month}&guests=${guests}`,
    )
      .then((c) => {
        if (!live) return;
        setCal(c);
        // Première date ouverte présélectionnée : le plan s’affiche tout de suite.
        setDate(
          (d) =>
            d ??
            c.days.find((x) => ["available", "limited"].includes(x.status))
              ?.date ??
            null,
        );
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [month, guests]);

  useEffect(() => {
    if (!date) return;
    let live = true;
    const load = () =>
      getJson<Availability>(
        `/api/v1/availability?restaurant=${RESTAURANT}&date=${date}&guests=${guests}`,
      )
        .then((d) => live && setDay(d))
        .catch((e) => live && setError(e.message));
    void load();
    // Les autres clients réservent aussi : le plan se rafraîchit seul.
    const t = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [date, guests, reload]);

  const slot = useMemo(
    () =>
      day?.date === date
        ? day.services.flatMap((s) => s.slots).find((s) => s.time === time)
        : undefined,
    [day, date, time],
  );
  // Un créneau ou une table qui n’est plus libre est désélectionné.
  useEffect(() => {
    if (!day || day.date !== date) return;
    if (time && !slot?.bookable) setTime(null);
    if (table && slot && !slot.free.includes(table)) setTable(null);
  }, [day, date, time, slot, table]);

  const chosen = day?.tables.find((t) => t.id === table);
  const firstDay = cal
    ? (new Date(`${cal.month}-01T12:00:00Z`).getUTCDay() + 6) % 7
    : 0;
  const currentMonth = todayParis().slice(0, 7);

  const stateOf = (t: MapTable & { unavailable?: boolean }) => {
    if (!slot) return "idle";
    if (t.id === table) return "selected";
    if (slot.free.includes(t.id)) return "free";
    if (t.capacity < guests) return "small";
    return "taken";
  };
  const caption = (t: MapTable) =>
    ({
      idle: "choisissez d’abord une heure",
      selected: "votre table",
      free: "libre",
      small: `trop petite pour ${guests}`,
      taken: "déjà réservée",
    })[stateOf(t)] ?? "";

  async function submit(form: HTMLFormElement) {
    if (!slot || !date || !time) return;
    const v = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant: RESTAURANT,
          name: v.name,
          contact: v.contact,
          note: v.note,
          guests,
          start: slot.start,
          table: table ?? undefined,
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setDone({
        id: result.id,
        date,
        time,
        guests,
        table: chosen?.number ?? null,
      });
    } catch (e) {
      setError((e as Error).message);
      // Rafraîchit le plan : la table a peut-être été prise entre-temps.
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <section className="public-section booking-done" aria-live="polite">
        <div className="booking-done-card" role="status">
          <CalendarCheck size={42} aria-hidden />
          <span className="eyebrow">
            DEMANDE N° {done.id.slice(0, 6).toUpperCase()}
          </span>
          <h1>
            À très vite, <em>on vous garde la place.</em>
          </h1>
          <p>
            {longDate(done.date)} à {done.time} · {done.guests}{" "}
            {done.guests > 1 ? "personnes" : "personne"}
            {done.table ? ` · table ${done.table}` : ""}
          </p>
          <p className="muted">
            Votre demande est enregistrée : la table est retenue et l’équipe
            doit encore la confirmer. Démonstration locale : aucun e-mail ni SMS
            n’a été envoyé.
          </p>
          <button
            className="btn outline"
            onClick={() => {
              setDone(null);
              setTime(null);
              setTable(null);
            }}
          >
            Faire une autre réservation
          </button>
        </div>
      </section>
    );

  return (
    <section className="public-section booking">
      <header className="booking-head">
        <span className="eyebrow">ON VOUS GARDE UNE PLACE ?</span>
        <h1>
          Choisissez votre jour, votre heure <em>et votre table.</em>
        </h1>
        <p>
          Les disponibilités sont celles de la salle en temps réel. Votre
          demande retient la table, l’équipe la confirme ensuite.
        </p>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="booking-grid">
        <div className="booking-steps">
          <fieldset className="booking-step">
            <legend>
              <span className="step-index">1</span> Combien serez-vous ?
            </legend>
            <div className="guest-picker">
              <button
                type="button"
                aria-label="Une personne de moins"
                disabled={guests <= 1}
                onClick={() => setGuests((g) => g - 1)}
              >
                <Minus size={16} />
              </button>
              <output aria-live="polite" aria-label="Nombre de personnes">
                <Users size={18} aria-hidden /> {guests}{" "}
                {guests > 1 ? "personnes" : "personne"}
              </output>
              <button
                type="button"
                aria-label="Une personne de plus"
                disabled={guests >= 20}
                onClick={() => setGuests((g) => g + 1)}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="guest-chips">
              {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                <button
                  type="button"
                  key={n}
                  aria-pressed={guests === n}
                  className={guests === n ? "active" : ""}
                  onClick={() => setGuests(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            {cal?.group && (
              <p className="booking-note">
                <Sparkles size={15} aria-hidden /> Au-delà de {cal.largest}{" "}
                personnes, l’équipe assemble les tables pour vous : choisissez
                simplement le jour et l’heure.
              </p>
            )}
          </fieldset>

          <fieldset className="booking-step">
            <legend>
              <span className="step-index">2</span> Quel jour ?
            </legend>
            <div className="cal">
              <div className="cal-head">
                <button
                  type="button"
                  aria-label="Mois précédent"
                  disabled={month <= currentMonth}
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                >
                  <ChevronLeft size={18} />
                </button>
                <b>{monthName(month)}</b>
                <button
                  type="button"
                  aria-label="Mois suivant"
                  disabled={month >= shiftMonth(currentMonth, 2)}
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div
                className="cal-grid"
                role="grid"
                aria-label={monthName(month)}
              >
                {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                  <span key={i} className="cal-dow" aria-hidden>
                    {d}
                  </span>
                ))}
                {Array.from({ length: firstDay }, (_, i) => (
                  <span key={`pad-${i}`} />
                ))}
                {cal?.days.map((d) => {
                  const pickable = ["available", "limited"].includes(d.status);
                  return (
                    <button
                      type="button"
                      key={d.date}
                      className={`cal-day ${d.status}${d.date === date ? " selected" : ""}`}
                      disabled={!pickable}
                      aria-pressed={d.date === date}
                      aria-label={`${longDate(d.date)} · ${dayLabels[d.status]}${pickable ? ` · ${d.free} horaires libres` : ""}`}
                      onClick={() => {
                        setDate(d.date);
                        setTime(null);
                        setTable(null);
                      }}
                    >
                      {Number(d.date.slice(8))}
                      <i aria-hidden />
                    </button>
                  );
                })}
              </div>
              <ul className="cal-legend">
                <li className="available">Disponible</li>
                <li className="limited">Dernières tables</li>
                <li className="full">Complet / fermé</li>
              </ul>
            </div>
          </fieldset>

          <fieldset className="booking-step" disabled={!day}>
            <legend>
              <span className="step-index">3</span> À quelle heure ?
            </legend>
            {date && <p className="booking-date">{longDate(date)}</p>}
            {day?.services.map((s) => (
              <div key={s.id} className="slot-group">
                <span className="slot-service">{s.name}</span>
                <div className="slots">
                  {s.slots.map((sl) => (
                    <button
                      type="button"
                      key={sl.time}
                      disabled={!sl.bookable}
                      aria-pressed={sl.time === time}
                      className={`slot${sl.time === time ? " active" : ""}`}
                      onClick={() => {
                        setTime(sl.time);
                        if (table && !sl.free.includes(table)) setTable(null);
                      }}
                    >
                      <b>{sl.time}</b>
                      <small>
                        {sl.past
                          ? "passé"
                          : !sl.bookable
                            ? "complet"
                            : day.group
                              ? "sur demande"
                              : `${sl.free.length} table${sl.free.length > 1 ? "s" : ""}`}
                      </small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
        </div>

        <div className="booking-plan">
          <div className="booking-step plan-step">
            <div className="plan-title">
              <span className="step-index">4</span>
              <div>
                <b>Choisissez votre table</b>
                <small>
                  {slot
                    ? `${longDate(date!)} · ${time} · ${guests} pers.`
                    : "Le plan s’anime dès que vous choisissez une heure."}
                </small>
              </div>
            </div>
            <ul className="map-legend" aria-label="Légende du plan">
              <li className="free">Libre</li>
              <li className="selected">Votre table</li>
              <li className="taken">Réservée</li>
              <li className="small">Trop petite</li>
            </ul>
            <FloorMap
              tables={day?.tables ?? []}
              stateOf={stateOf}
              caption={caption}
              disabled={(t) =>
                stateOf(t) !== "free" && stateOf(t) !== "selected"
              }
              onSelect={(t) => setTable(t.id === table ? null : t.id)}
              hint={
                !slot
                  ? "Choisissez une heure pour voir les tables libres"
                  : day?.group
                    ? "Groupe : l’équipe prépare une grande tablée pour vous"
                    : null
              }
            />
            {slot && !day?.group && (
              <div className="table-choice">
                {chosen ? (
                  <p>
                    <b>
                      Table {chosen.number}
                      {chosen.label ? ` · ${chosen.label}` : ""}
                    </b>{" "}
                    · {chosen.capacity} places · {chosen.zone}
                  </p>
                ) : (
                  <p>
                    Touchez une table verte, ou laissez l’équipe choisir la
                    meilleure pour vous.
                  </p>
                )}
                {chosen && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setTable(null)}
                  >
                    Laisser l’équipe choisir
                  </button>
                )}
              </div>
            )}
          </div>

          <form
            className="booking-step booking-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(e.currentTarget);
            }}
          >
            <div className="plan-title">
              <span className="step-index">5</span>
              <b>Vos coordonnées</b>
            </div>
            <div className="form-row">
              <label>
                Votre nom
                <input
                  name="name"
                  required
                  maxLength={300}
                  autoComplete="name"
                />
              </label>
              <label>
                Téléphone ou e-mail
                <input
                  name="contact"
                  required
                  maxLength={300}
                  autoComplete="email"
                />
              </label>
            </div>
            <label>
              Une attention particulière ?
              <input
                name="note"
                maxLength={300}
                placeholder="Anniversaire, chaise haute, allergie…"
              />
            </label>
            <button className="btn primary" disabled={!slot || busy}>
              {busy
                ? "Envoi…"
                : slot
                  ? `Réserver · ${time}${chosen ? ` · table ${chosen.number}` : ""}`
                  : "Choisissez une heure"}
            </button>
            <p className="muted">
              Démonstration locale : aucune réservation réelle auprès du
              restaurant. Utilisez des coordonnées fictives.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
