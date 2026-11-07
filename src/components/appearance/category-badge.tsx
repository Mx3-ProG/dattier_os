import {
  activityCategories,
  type ActivityCategory,
} from "@/features/appearance/categories";
export function CategoryBadge({ category }: { category: ActivityCategory }) {
  return (
    <span className="activity-category" data-activity-category={category}>
      {activityCategories[category].label}
    </span>
  );
}
