import "./infinity.css";

const PATH = "M100 100C80 68 56 60 40 60a40 40 0 0 0 0 80c16 0 40-8 60-40s44-40 60-40a40 40 0 0 1 0 80c-16 0-40-8-60-40Z";
export default function InfinityLoop() {
  return (
    <svg viewBox="-10 0 220 200" className="ls-infinity" fill="none" strokeLinecap="round">
      <path className="ls-infinity-track" d={PATH} />
      <path className="ls-infinity-trail" d={PATH} pathLength="100" />
      <path className="ls-infinity-line" d={PATH} pathLength="100" />
    </svg>
  );
}
