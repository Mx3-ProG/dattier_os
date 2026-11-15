import { activityCategories } from "@/features/appearance/categories";
import { type ActivityCategory } from "@/features/appearance/public";
export function CategoryBadge({ category }: { category: ActivityCategory }) {
  return (
    <span className="activity-category" data-activity-category={category}>
      {activityCategories[category].label}
    </span>
  );
}
