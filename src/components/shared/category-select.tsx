"use client";

import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { Select } from "@/components/ui/select";

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  visibility?: "SHARED" | "PERSONAL";
  categoryType?: "INCOME" | "EXPENSE" | "INVESTMENT";
}

export function CategorySelect({ value, onChange, id, className, visibility, categoryType }: CategorySelectProps) {
  const trpc = useTRPC();
  const queryInput = (visibility || categoryType)
    ? { ...(visibility && { visibility }), ...(categoryType && { type: categoryType }) }
    : undefined;
  const treeQuery = useQuery(
    trpc.category.tree.queryOptions(queryInput)
  );
  const groups = treeQuery.data ?? [];

  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">Uncategorized</option>
      {groups.map((group) => {
        if (group.children.length === 0) {
          // Leaf group (like "Uncategorized") — render as a direct option
          return (
            <option key={group.id} value={group.id}>
              {group.icon} {group.name}
            </option>
          );
        }
        return (
          <optgroup key={group.id} label={`${group.icon} ${group.name}`}>
            {group.children.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
}
