import { Badge } from "@/components/ui/badge";
import {
  mediaDeliverableStatusBadgeClass,
  mediaDeliverableStatusLabel,
  mediaJobStatusBadgeClass,
  mediaJobStatusLabel,
} from "./mediaFactoryStatus";

export function MediaJobStatusBadge(props: {
  status: string | null | undefined;
}) {
  return (
    <Badge
      variant="outline"
      className={`whitespace-nowrap ${mediaJobStatusBadgeClass(props.status)}`}
    >
      {mediaJobStatusLabel(props.status)}
    </Badge>
  );
}

export function MediaDeliverableStatusBadge(props: {
  status: string | null | undefined;
}) {
  return (
    <Badge
      variant="outline"
      className={`whitespace-nowrap ${mediaDeliverableStatusBadgeClass(props.status)}`}
    >
      {mediaDeliverableStatusLabel(props.status)}
    </Badge>
  );
}
