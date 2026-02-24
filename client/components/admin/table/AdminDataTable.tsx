import { useEffect, useMemo, useState } from "react";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Download, FileText, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function AdminDataTable<TData>(props: {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  isLoading?: boolean;
  searchPlaceholder?: string;
  initialSearch?: string;
  defaultPageSize?: number;
  onExportCsv?: (rows: TData[]) => void;
  onExportPdf?: (rows: TData[]) => void;
  onRowClick?: (row: TData) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState(() => props.initialSearch ?? "");

  useEffect(() => {
    if (props.initialSearch === undefined) return;
    setGlobalFilter(props.initialSearch);
  }, [props.initialSearch]);

  const columns = useMemo(() => props.columns, [props.columns]);

  const table = useReactTable({
    data: props.data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    initialState: {
      pagination: { pageSize: props.defaultPageSize ?? 25 },
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="p-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2">
          <Search className="h-4 w-4 text-slate-400" />
          <Input
            className="h-9 w-full sm:w-[260px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={props.searchPlaceholder ?? "Rechercher…"}
            aria-label="Rechercher"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          <div className="text-xs text-slate-600">
            {props.isLoading ? "Chargement…" : `${table.getFilteredRowModel().rows.length} résultat(s)`}
          </div>

          {props.onExportCsv || props.onExportPdf ? (
            <div className="flex items-center gap-2">
              {props.onExportCsv ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    const rows = table.getFilteredRowModel().rows.map((r) => r.original);
                    props.onExportCsv?.(rows);
                  }}
                >
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
              ) : null}
              {props.onExportPdf ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    const rows = table.getFilteredRowModel().rows.map((r) => r.original);
                    props.onExportPdf?.(rows);
                  }}
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="w-full min-w-[960px] lg:min-w-[1280px]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const sort = h.column.getIsSorted();

                  const colMeta = h.column.columnDef.meta as { className?: string; style?: React.CSSProperties } | undefined;

                  return (
                    <TableHead key={h.id} className={[canSort ? "cursor-pointer select-none" : undefined, colMeta?.className].filter(Boolean).join(" ") || undefined} style={colMeta?.style}>
                      <div
                        className="flex items-center gap-2"
                        onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                      >
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                        {sort === "asc" ? <span className="text-slate-400">▲</span> : null}
                        {sort === "desc" ? <span className="text-slate-400">▼</span> : null}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const clickable = typeof props.onRowClick === "function";
                return (
                  <TableRow
                    key={row.id}
                    className={clickable ? "cursor-pointer" : undefined}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={
                      clickable
                        ? () => {
                            props.onRowClick?.(row.original);
                          }
                        : undefined
                    }
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") props.onRowClick?.(row.original);
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => {
                      const cellMeta = cell.column.columnDef.meta as { className?: string; style?: React.CSSProperties } | undefined;
                      return (
                        <TableCell key={cell.id} className={cellMeta?.className} style={cellMeta?.style}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={table.getAllColumns().length} className="text-center text-sm text-slate-600 py-10">
                  Aucun résultat.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="p-3 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 whitespace-nowrap">Afficher</span>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(v) => {
              table.setPageSize(Number(v));
              table.setPageIndex(0);
            }}
          >
            <SelectTrigger className="h-8 w-[70px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-600 whitespace-nowrap">
            sur {table.getFilteredRowModel().rows.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 whitespace-nowrap">
            Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Page suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
