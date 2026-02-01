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

export function AdminDataTable<TData>(props: {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  isLoading?: boolean;
  searchPlaceholder?: string;
  initialSearch?: string;
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
        <Table className="min-w-[960px] lg:min-w-[1280px]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const sort = h.column.getIsSorted();

                  return (
                    <TableHead key={h.id} className={canSort ? "cursor-pointer select-none" : undefined}>
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
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
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

      <div className="p-3 border-t border-slate-200 flex items-center justify-between">
        <div className="text-xs text-slate-600">
          Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
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
