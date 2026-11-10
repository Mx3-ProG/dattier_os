import { FORK_PATH, KNIFE_PATH } from "@/components/brand/paths";
import "./kitchen.css";

export default function Kitchen() {
  return (
    <svg
      viewBox="-12 -12 72 72"
      className="ls-kitchen"
      fill="none"
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path className="ls-kitchen-spark" d="M24-4v5M10 0l3 4M38 0l-3 4" />
      <path className="ls-kitchen-fork" d={FORK_PATH} />
      <path className="ls-kitchen-knife" d={KNIFE_PATH} />
      <ellipse className="ls-kitchen-shadow" cx="24" cy="54" rx="15" ry="1.8" />
    </svg>
  );
}
