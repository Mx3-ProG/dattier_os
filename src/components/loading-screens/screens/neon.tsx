import "./neon.css";

export default function Neon() {
  return (
    <svg viewBox="0 0 200 200" className="ls-neon" fill="none">
      <circle className="ls-neon-halo" cx="100" cy="100" r="52" />
      <circle className="ls-neon-pulse" cx="100" cy="100" r="58" />
      <circle className="ls-neon-pulse is-b" cx="100" cy="100" r="58" />
      <circle className="ls-neon-ring" cx="100" cy="100" r="58" />
      <circle className="ls-neon-arc" cx="100" cy="100" r="58" pathLength="100" />
      <circle className="ls-neon-arc is-b" cx="100" cy="100" r="42" pathLength="100" />
      <circle className="ls-neon-core" cx="100" cy="100" r="7" />
    </svg>
  );
}
