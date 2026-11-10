import "./coffee.css";

export default function Coffee() {
  return (
    <svg viewBox="0 0 200 200" className="ls-coffee" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path className="ls-coffee-steam" d="M78 88c-10-12 10-20 0-32s10-20 0-32" pathLength="100" />
      <path className="ls-coffee-steam is-b" d="M100 88c-10-12 10-20 0-32s10-20 0-32" pathLength="100" />
      <path className="ls-coffee-steam is-c" d="M122 88c-10-12 10-20 0-32s10-20 0-32" pathLength="100" />
      <path className="ls-coffee-handle" d="M144 112h8a16 16 0 0 1 0 32h-14" />
      <path className="ls-coffee-cup" d="M56 100h88v34a30 30 0 0 1-30 30H86a30 30 0 0 1-30-30Z" />
      <ellipse className="ls-coffee-drink" cx="100" cy="100" rx="44" ry="7" />
      <path className="ls-coffee-saucer" d="M46 176h108" />
    </svg>
  );
}
