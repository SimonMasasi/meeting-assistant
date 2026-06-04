import { DataTableColumns } from "@/interfaces/shared-interfaces";
import DataTableMain from "@/components/shared/tables/data-table-main";

interface RecentMeeting {
  id: number;
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
        Completed: "bg-green-100 text-green-700",
        Ongoing: "bg-blue-100 text-blue-700",
        Upcoming: "bg-yellow-100 text-yellow-700",
        Cancelled: "bg-red-100 text-red-700",
      };
      const cls = colorMap[value] ?? "bg-gray-100 text-gray-600";
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

const mockMeetings: RecentMeeting[] = [
  { id: 1, title: "Q2 Product Review", host: "Alice Johnson", date: "2026-06-04 09:00", duration: "1h 30m", attendees: 12, status: "Completed" },
  { id: 2, title: "Engineering Standup", host: "Bob Smith", date: "2026-06-04 10:00", duration: "30m", attendees: 8, status: "Completed" },
  { id: 3, title: "Client Demo — Acme Corp", host: "Carol White", date: "2026-06-04 13:00", duration: "1h", attendees: 5, status: "Ongoing" },
  { id: 4, title: "Design Sync", host: "David Lee", date: "2026-06-04 14:30", duration: "45m", attendees: 4, status: "Upcoming" },
  { id: 5, title: "Marketing Strategy", host: "Eva Brown", date: "2026-06-03 11:00", duration: "2h", attendees: 9, status: "Completed" },
  { id: 6, title: "HR Town Hall", host: "Frank Greer", date: "2026-06-03 15:00", duration: "1h 15m", attendees: 35, status: "Completed" },
  { id: 7, title: "Sprint Planning", host: "Grace Kim", date: "2026-06-02 09:30", duration: "2h", attendees: 7, status: "Completed" },
  { id: 8, title: "Investor Update", host: "Henry Park", date: "2026-06-02 16:00", duration: "1h", attendees: 6, status: "Cancelled" },
  { id: 9, title: "Sales Pipeline Review", host: "Isla Turner", date: "2026-06-01 10:00", duration: "1h", attendees: 10, status: "Completed" },
  { id: 10, title: "Roadmap Planning", host: "Jake Morris", date: "2026-06-05 09:00", duration: "3h", attendees: 15, status: "Upcoming" },
];

export function RecentMeetingsTable() {
  return (
    <DataTableMain
      title="Recent Meetings"
      columns={columns}
      rows={mockMeetings}
    />
  );
}
