import { themedVisuals, type ThemedVisualId } from "@/features/cms/themed-visuals";
import "./themed.css";

/** Un seul lot léger partagé par les 24 animations espace et nature. */
export default function ThemedScreen({ id }: { id: ThemedVisualId }) {
  const visual = themedVisuals[id];
  const theme = id.startsWith("space-") ? "space" : "nature";
  return (
    <div className={`ls-themed is-${id} is-${theme} is-${visual.tier}`}>
      <span className="ls-themed-ring" />
      <span className="ls-themed-ring is-second" />
      <span className="ls-themed-symbol">{visual.icon}</span>
      <i className="ls-themed-spark is-one" /><i className="ls-themed-spark is-two" /><i className="ls-themed-spark is-three" />
    </div>
  );
}
