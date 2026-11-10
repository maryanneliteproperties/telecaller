import { useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

type WorkspacePaginationProps = {
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function WorkspacePagination({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: WorkspacePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  useEffect(() => {
    if (page > totalPages) onPageChange(totalPages);
  }, [page, totalPages, onPageChange]);

  if (totalItems === 0) return null;

  const buttonClass = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border bg-background px-2 text-sm font-medium shadow-sm transition hover:bg-muted disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-xl border bg-card px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>Showing <strong className="font-semibold text-foreground">{startItem}–{endItem}</strong> of <strong className="font-semibold text-foreground">{totalItems}</strong></span>
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap">Rows per page</span>
          <select
            aria-label="Items per page"
            className="h-9 rounded-lg border bg-background px-2 text-sm font-medium text-foreground outline-none transition focus:ring-2 focus:ring-primary/20"
            value={pageSize}
            onChange={event => onPageSizeChange(Number(event.target.value))}
          >
            {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span className="mr-1 whitespace-nowrap text-sm text-muted-foreground">Page {safePage} of {totalPages}</span>
        <div className="flex items-center gap-1">
          <button type="button" className={buttonClass} aria-label="First page" title="First page" disabled={safePage <= 1} onClick={() => onPageChange(1)}><ChevronsLeft className="h-4 w-4" /></button>
          <button type="button" className={buttonClass} aria-label="Previous page" title="Previous page" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className={buttonClass} aria-label="Next page" title="Next page" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)}><ChevronRight className="h-4 w-4" /></button>
          <button type="button" className={buttonClass} aria-label="Last page" title="Last page" disabled={safePage >= totalPages} onClick={() => onPageChange(totalPages)}><ChevronsRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
