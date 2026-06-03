import { DataTableColumns } from "@/interfaces/shared-interfaces";

export interface SmsData {
  name: string;
  last: number;
  lastf: { name: string; value: string };
  lastd: string;
}

export const smsColumns: DataTableColumns[] = [
  { id: "name", label: "Name", minWidth: 170 },
  {
    id: "last",
    label: "Last",
    minWidth: 100,
    format: (value: number) => value.toLocaleString("en-US"),
  },
  {
    id: "lastf.name",
    label: "lastf",
    minWidth: 170,
    align: "right",
  },
  {
    id: "lastd",
    label: "Lastd",
    minWidth: 170,
    align: "right",
  },
  {
    id: "actions",
    label: "Actions",
    minWidth: 170,
    align: "right",
  },
];
