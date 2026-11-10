import "./santa.css";

export default function Santa() {
  return (
    <svg className="ls-santa" viewBox="0 0 200 200" aria-hidden="true">
      <circle className="ls-santa-glow" cx="100" cy="103" r="88" />
      <g className="ls-santa-head">
        <path className="ls-santa-beard" d="M47 103c0-35 23-56 53-56s53 21 53 56c0 47-21 79-53 85-32-6-53-38-53-85Z" />
        <ellipse className="ls-santa-face" cx="100" cy="100" rx="39" ry="43" />
        <path className="ls-santa-moustache" d="M99 128c-12-11-28-10-37 0 13 15 26 15 38 5 12 10 25 10 38-5-9-10-25-11-39 0Z" />
        <ellipse className="ls-santa-nose" cx="100" cy="121" rx="10" ry="7" />
        <circle className="ls-santa-eye" cx="83" cy="96" r="3.4" />
        <circle className="ls-santa-eye" cx="117" cy="96" r="3.4" />
        <path className="ls-santa-smile" d="M90 145q10 8 20 0" />
        <g className="ls-santa-hat">
          <path className="ls-santa-cap" d="M49 83c8-43 35-70 69-70 22 0 38 14 51 29-26-7-37 16-42 41Z" />
          <path className="ls-santa-trim" d="M49 78q52-17 101 0l-3 16q-47-13-96 0Z" />
          <circle className="ls-santa-pom" cx="168" cy="44" r="14" />
        </g>
      </g>
      <path className="ls-santa-spark is-left" d="m23 54 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
      <path className="ls-santa-spark is-right" d="m174 127 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" />
    </svg>
  );
}
