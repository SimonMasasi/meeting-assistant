import { useEffect, useState } from "react";
import { DataTableColumns } from "@/interfaces/shared-interfaces";
import DataTableMain from "@/components/shared/tables/data-table-main";
import { listMeetings } from "@/services/meetings";

interface RecentMeeting {
  id: string;
  title: string;
  host: string;
  date: string;
  duration: string;
  attendees: number;
  status: string;
}

const columns: DataTableColumns[] = [
  { id: "title", label: "Meeting Title", minWidth: 180, sortable: true },
  { id: "host", label: "Host", minWidth: 130, sortable: true },
  { id: "date", label: "Date & Time", minWidth: 150, sortable: true },
  { id: "duration", label: "Duration", minWidth: 100 },
  { id: "attendees", label: "Attendees", minWidth: 100, sortable: true },
  {
    id: "status",
    label: "Status",
    minWidth: 110,
    format: (value: string) => {
      const colorMap: Record<string, string> = {
        Completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
        Ongoing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
        Upcoming: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
        Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
      };
      const cls = colorMap[value] ?? "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300";
      return (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}
        >
          {value}
        </span>
      );
    },
  },
];

export function RecentMeetingsTable() {
  const [rows, setRows] = useState<RecentMeeting[]>([]);

  useEffect(() => {
    listMeetings()
      .then((meetings) =>
        setRows(
          // Backend returns newest-first; show the ten most recent.
          meetings.slice(0, 10).map((m) => ({
            id: m.id,
            title: m.title,
            host: m.host,
            date: `${m.date}, ${m.time}`,
            duration: m.durationLabel,
            attendees: m.attendees,
            status: m.status,
          })),
        ),
      )
      .catch((err) => console.error("Failed to load recent meetings", err));
  }, []);

  return <DataTableMain title="Recent Meetings" columns={columns} rows={rows} />;
}
