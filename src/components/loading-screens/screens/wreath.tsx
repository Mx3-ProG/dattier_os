import "./wreath.css";

export default function Wreath() {
  return (
    <div className="ls-wreath">
      <span className="ls-wreath-ring" />
      <span className="ls-wreath-bow"><i /><i /></span>
      <span className="ls-wreath-center">✦</span>
      <i className="ls-wreath-berry is-one" /><i className="ls-wreath-berry is-two" /><i className="ls-wreath-berry is-three" />
    </div>
  );
}
