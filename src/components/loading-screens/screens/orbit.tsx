"use client";
import { useId } from "react";
import "./orbit.css";

const ORBITS = [
  { rx: 92, ry: 28, duration: 5, count: 3 },
  { rx: 70, ry: 20, duration: 3.4, count: 2 },
];
export default function Orbit() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 200 200" className="ls-orbit" fill="none">
      <defs>
        <radialGradient id={`${id}p`} cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="var(--ls-secondary)" />
          <stop offset="0.55" stopColor="var(--ls-primary)" />
          <stop offset="1" stopColor="#05061a" />
        </radialGradient>
      </defs>
      <g transform="rotate(-18 100 100)">
        {ORBITS.map((orbit) => (
          <ellipse key={orbit.rx} className="ls-orbit-ring" cx="100" cy="100" rx={orbit.rx} ry={orbit.ry} />
        ))}
        {ORBITS.map((orbit, ring) =>
          Array.from({ length: orbit.count }, (_, index) => (
            <circle
              key={`${ring}-${index}`}
              className={ring ? "ls-orbit-dot is-alt" : "ls-orbit-dot"}
              r={ring ? 3 : 4}
              style={
                {
                  offsetPath: `path("M${100 - orbit.rx} 100a${orbit.rx} ${orbit.ry} 0 1 0 ${orbit.rx * 2} 0a${orbit.rx} ${orbit.ry} 0 1 0 ${-orbit.rx * 2} 0")`,
                  "--d": `${orbit.duration}s`,
                  "--o": `${(index / orbit.count) * 100}%`,
                } as React.CSSProperties
              }
            />
          )),
        )}
      </g>
      <circle className="ls-orbit-glow" cx="100" cy="100" r="42" />
      <circle cx="100" cy="100" r="34" fill={`url(#${id}p)`} />
      <g transform="rotate(-18 100 100)">
        <path className="ls-orbit-ring is-front" d="M8 100a92 28 0 0 0 184 0" />
      </g>
    </svg>
  );
}
