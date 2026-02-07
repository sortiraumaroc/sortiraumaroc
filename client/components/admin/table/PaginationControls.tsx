import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

export function PaginationControls(props: {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}) {
  const { currentPage, pageSize, totalItems, onPageChange, onPageSizeChange } = props;
  const sizes = props.pageSizeOptions ?? DEFAULT_PAGE_SIZES;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const canPrev = currentPage > 0;
  const canNext = currentPage < pageCount - 1;

  return (
    <div className="p-3 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 whitespace-nowrap">Afficher</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            onPageSizeChange(Number(v));
            onPageChange(0);
          }}
        >
          <SelectTrigger className="h-8 w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sizes.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-600 whitespace-nowrap">
          sur {totalItems}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 whitespace-nowrap">
          Page {currentPage + 1} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canPrev}
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canNext}
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
