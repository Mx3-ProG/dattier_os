import "./magic.css";

const STAR = "M0-9C1-3 3-1 9 0 3 1 1 3 0 9-1 3-3 1-9 0-3-1-1-3 0-9Z";
export default function Magic() {
  return (
    <svg viewBox="0 0 200 200" className="ls-magic">
      <circle className="ls-magic-glow" cx="100" cy="100" r="34" />
      <circle className="ls-magic-core" cx="100" cy="100" r="5" />
      {[0, 1].map((ring) => (
        <g key={ring} className={ring ? "ls-magic-ring is-inner" : "ls-magic-ring"}>
          {Array.from({ length: ring ? 6 : 10 }, (_, index) => {
            const angle = (index / (ring ? 6 : 10)) * Math.PI * 2;
            const radius = ring ? 44 : 74;
            return (
              <path
                key={index}
                className={index % 2 ? "ls-magic-star is-alt" : "ls-magic-star"}
                d={STAR}
                style={{ translate: `${(100 + Math.cos(angle) * radius).toFixed(2)}px ${(100 + Math.sin(angle) * radius).toFixed(2)}px`, "--i": index } as React.CSSProperties}
              />
            );
          })}
        </g>
      ))}
    </svg>
  );
}
