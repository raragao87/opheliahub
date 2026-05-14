import { Users, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ScopeBadgeProps {
  scope: "SHARED" | "PERSONAL";
  className?: string;
}

export function ScopeBadge({ scope, className }: ScopeBadgeProps) {
  if (scope === "SHARED") {
    return (
      <Badge variant="shared" className={className}>
        <Users className="h-3 w-3 mr-1" />
        Shared
      </Badge>
    );
  }

  return (
    <Badge variant="personal" className={className}>
      <Lock className="h-3 w-3 mr-1" />
      Personal
    </Badge>
  );
}
