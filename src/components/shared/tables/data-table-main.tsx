import * as React from "react";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
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

export interface DataTablePropsInterface {
  columns: DataTableColumns[];
  rows: any[];
  actions?: DataTableActions[];
}

export default function DataTable(props: DataTablePropsInterface) {
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [tableDataLoading, _] = useAtom(tableLoadingAtom);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
    console.log(event);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(+event.target.value);
    setPage(0);
  };

  return (
    <div>
      <Paper sx={{ width: "100%", overflow: "hidden" }} >
        <DataTableSearch />
        {!tableDataLoading ? (
          <div className="intro-x m-4 rounded-md  ">
            <TableContainer sx={{ height: "100%" }}>
              <Table stickyHeader aria-label="sticky table">
                <TableHead>
                  <TableRow>
                    {props.columns.map((column) => (
                      <TableCell
                        key={column.id}
                        align={column.align ?? "left"}
                        style={{ minWidth: column.minWidth ?? 100 }}
                      >
                        {column.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>

                {props.rows?.length > 0 ? (
                  <TableBody>
                    {props.rows
                      .slice(
                        page * rowsPerPage,
                        page * rowsPerPage + rowsPerPage
                      )
                      .map((row, key) => {
                        return (
                          <TableRow
                            hover
                            role="checkbox"
                            tabIndex={-1}
                            key={key}
                          >
                            {props.columns.map((column) => {
                              let value: any;
                              if (
                                typeof row[column.id.split(".")[0]] ===
                                  "object" &&
                                row[column.id.split(".")[0]] !== null
                              ) {
                                value = accessObject(
                                  row[column.id.split(".")[0]],
                                  column.id.split(".").slice(1).join(".")
                                );
                              } else {
                                value = row[column.id];
                              }

                              return (
                                <TableCell key={column.id} align={column.align}>
                                  {column?.id != "actions" ? (
                                    column.format ? (
                                      column.format(value)
                                    ) : (
                                      value
                                    )
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
                        );
                      })}
                  </TableBody>
                ) : (
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={props.columns.length} align="center">
                        No data available
                      </TableCell>
                    </TableRow>
                  </TableBody>
                )}
              </Table>
            </TableContainer>
            <div className="">
              <TablePagination
                rowsPerPageOptions={[10, 25, 100]}
                component="div"
                count={props.rows.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
              />
            </div>
          </div>
        ) : (
          <div className="flex justify-center h-16 m-4">
            <div>
              <CircularProgress size="lg" variant="soft">
                {" "}
                Loading{" "}
              </CircularProgress>
            </div>
          </div>
        )}
      </Paper>
    </div>
  );
}
