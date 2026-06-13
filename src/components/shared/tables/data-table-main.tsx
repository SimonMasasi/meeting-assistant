import * as React from "react";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import {
  DataTableActions,
  DataTableColumns,
} from "@/interfaces/shared-interfaces";
import TableActions from "./table-actions";
import { accessObject } from "@/utils/helper-functions";
import { useAtom } from "jotai";
import { tableLoadingAtom } from "@/atoms/shared-atoms";
import CircularProgress from "@mui/joy/CircularProgress";
import DataTableSearch from "./table-input-search";
import DownloadIcon from "@mui/icons-material/Download";
import InboxIcon from "@mui/icons-material/Inbox";
import AddIcon from "@mui/icons-material/Add";

export interface DataTablePropsInterface {
  columns: DataTableColumns[];
  rows: any[];
  actions?: DataTableActions[];
  title?: string;
  onAdd?: () => void;
  addLabel?: string;
}

type SortDirection = "asc" | "desc";

function getCellValue(row: any, columnId: string): any {
  const parts = columnId.split(".");
  if (
    parts.length > 1 &&
    typeof row[parts[0]] === "object" &&
    row[parts[0]] !== null
  ) {
    return accessObject(row[parts[0]], parts.slice(1).join("."));
  }
  return row[columnId];
}

function compareValues(a: any, b: any, direction: SortDirection): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return direction === "asc" ? aNum - bNum : bNum - aNum;
  }
  const aStr = String(a).toLowerCase();
  const bStr = String(b).toLowerCase();
  return direction === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
}

export default function DataTable(props: DataTablePropsInterface) {
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [tableDataLoading] = useAtom(tableLoadingAtom);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sortColumn, setSortColumn] = React.useState<string | null>(null);
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");

  const dataColumns = React.useMemo(
    () => props.columns.filter((c) => c.id !== "actions"),
    [props.columns]
  );

  const filtered = React.useMemo(() => {
    if (!searchTerm.trim()) return props.rows;
    const term = searchTerm.toLowerCase();
    return props.rows.filter((row) =>
      dataColumns.some((col) => {
        const val = getCellValue(row, col.id);
        return val != null && String(val).toLowerCase().includes(term);
      })
    );
  }, [props.rows, searchTerm, dataColumns]);

  const sorted = React.useMemo(() => {
    if (!sortColumn) return filtered;
    return [...filtered].sort((a, b) =>
      compareValues(
        getCellValue(a, sortColumn),
        getCellValue(b, sortColumn),
        sortDirection
      )
    );
  }, [filtered, sortColumn, sortDirection]);

  const paginated = sorted.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleChangePage = (_: unknown, newPage: number) => setPage(newPage);

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(+event.target.value);
    setPage(0);
  };

  const handleSearch = (val: string) => {
    setSearchTerm(val);
    setPage(0);
  };

  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnId);
      setSortDirection("asc");
    }
    setPage(0);
  };

  const handleExportCsv = () => {
    const headers = dataColumns.map((c) => `"${c.label}"`).join(",");
    const csvRows = sorted.map((row) =>
      dataColumns
        .map((col) => {
          const val = getCellValue(row, col.id);
          const formatted = col.format ? col.format(val) : val;
          const str = formatted == null ? "" : String(formatted);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const csv = [headers, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${props.title ?? "export"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Paper
        elevation={2}
        sx={{ width: "100%", overflow: "hidden", borderRadius: 2 }}
      >
        {/* Toolbar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {props.title && (
              <Typography variant="h6" fontWeight={600} color="text.primary">
                {props.title}
              </Typography>
            )}
            {props.onAdd && (
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={props.onAdd}
                sx={{
                  borderRadius: 2,
                  textTransform: "none",
                  fontWeight: 600,
                  px: 2,
                  background: "linear-gradient(135deg, #226299 0%, #3b82f6 100%)",
                  boxShadow: "0 2px 8px rgba(59,130,246,0.35)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #3061ab 0%, #1d70e4 100%)",
                    boxShadow: "0 4px 12px rgba(59,130,246,0.45)",
                  },
                  whiteSpace: "nowrap",
                }}
              >
                {props.addLabel ?? "Add"}
              </Button>
            )}
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              ml: "auto",
              flexWrap: "wrap",
            }}
          >
            <DataTableSearch value={searchTerm} onChange={handleSearch} />
            <Tooltip title="Export visible data as CSV">
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleExportCsv}
                sx={{ borderRadius: 2, textTransform: "none", whiteSpace: "nowrap" }}
              >
                Export CSV
              </Button>
            </Tooltip>
          </Box>
        </Box>

        {!tableDataLoading ? (
          <div>
            <TableContainer>
              <Table stickyHeader aria-label="data table">
                <TableHead>
                  <TableRow>
                    {props.columns.map((column) => (
                      <TableCell
                        key={column.id}
                        align={column.align ?? "left"}
                        style={{ minWidth: column.minWidth ?? 100 }}
                        sx={(theme) => ({
                          backgroundColor: theme.palette.primary.main,
                          color: theme.palette.primary.contrastText,
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          "& .MuiTableSortLabel-root": { color: theme.palette.primary.contrastText },
                          "& .MuiTableSortLabel-root:hover": { color: theme.palette.primary.light },
                          "& .MuiTableSortLabel-root.Mui-active": { color: theme.palette.primary.contrastText },
                          "& .MuiTableSortLabel-icon": { color: `${theme.palette.primary.contrastText} !important` },
                        })}
                      >
                        {column.sortable && column.id !== "actions" ? (
                          <TableSortLabel
                            active={sortColumn === column.id}
                            direction={
                              sortColumn === column.id ? sortDirection : "asc"
                            }
                            onClick={() => handleSort(column.id)}
                          >
                            {column.label}
                          </TableSortLabel>
                        ) : (
                          column.label
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>

                {paginated.length > 0 ? (
                  <TableBody className="intro-x">
                    {paginated.map((row, rowIndex) => (
                      <TableRow
                        hover
                        role="checkbox"
                        tabIndex={-1}
                        key={rowIndex}
                        sx={(theme) => ({
                          backgroundColor:
                            rowIndex % 2 !== 0
                              ? theme.palette.action.hover
                              : theme.palette.background.paper,
                          "&:hover": {
                            backgroundColor: `${theme.palette.action.selected} !important`,
                          },
                          transition: "background-color 0.15s ease",
                        })}
                      >
                        {props.columns.map((column) => {
                          const value =
                            column.id !== "actions"
                              ? getCellValue(row, column.id)
                              : null;

                          return (
                            <TableCell
                              key={column.id}
                              align={column.align}
                              sx={{ fontSize: "0.875rem", py: 1.25 }}
                            >
                              {column.id !== "actions" ? (
                                column.format ? column.format(value) : value
                              ) : (
                                <TableActions
                                  actions={props.actions ?? []}
                                  data={row}
                                />
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                ) : (
                  <TableBody>
                    <TableRow>
                      <TableCell
                        colSpan={props.columns.length}
                        align="center"
                        sx={{ py: 6, border: 0 }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <InboxIcon sx={(theme) => ({ fontSize: 52, color: theme.palette.action.disabled })} />
                          <Typography
                            variant="subtitle1"
                            fontWeight={600}
                            color="text.secondary"
                          >
                            No records found
                          </Typography>
                          {searchTerm && (
                            <Typography variant="body2" color="text.disabled">
                              Try adjusting your search term
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                )}
              </Table>
            </TableContainer>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 2,
                borderTop: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {searchTerm
                  ? `${sorted.length} of ${props.rows.length} records`
                  : `${props.rows.length} total records`}
              </Typography>
              <TablePagination
                rowsPerPageOptions={[10, 25, 100]}
                component="div"
                count={sorted.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
              />
            </Box>
          </div>
        ) : (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: 200,
            }}
          >
            <CircularProgress size="lg" variant="soft">
              Loading
            </CircularProgress>
          </Box>
        )}
      </Paper>
    </div>
  );
}
