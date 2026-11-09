import "./crystal.css";

export default function Crystal() {
  return (
    <div className="ls-crystal">
      <span className="ls-crystal-glow" />
      <div className="ls-crystal-body">
        <span className="ls-crystal-layer is-a" />
        <span className="ls-crystal-layer is-b" />
        <span className="ls-crystal-layer is-c" />
        <span className="ls-crystal-sheen" />
      </div>
    </div>
  );
}
