import "./studio-s.css";

const LAYERS = 9;
export default function StudioS() {
  return (
    <div className="ls-studio">
      <span className="ls-studio-glow" />
      <div className="ls-studio-letter">
        {Array.from({ length: LAYERS }, (_, index) => (
          <span
            key={index}
            className={index === LAYERS - 1 ? "is-front" : index === 0 ? "is-back" : undefined}
            style={{ transform: `translateZ(${(index - (LAYERS - 1) / 2) * 2}px)` }}
          >
            S
          </span>
        ))}
      </div>
    </div>
  );
}
