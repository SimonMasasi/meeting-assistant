import { useState } from "react";
import { useAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import toast from "react-hot-toast";
import DataTableMain from "@/components/shared/tables/data-table-main";
import AppDialog from "@/components/shared/dialogs/app-dialog";
import { DataTableActions, DataTableColumns } from "@/interfaces/shared-interfaces";
import { meetingsAtom } from "@/atoms/meetings-atoms";
import { MeetingDetail } from "./mock-data";
import { AddMeetingForm } from "./components/add-meeting-form";

const statusColors: Record<string, string> = {
  Completed: "bg-green-100 text-green-700",
  Ongoing: "bg-blue-100 text-blue-700",
  Upcoming: "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-red-100 text-red-700",
};

const columns: DataTableColumns[] = [
  { id: "title", label: "Meeting Title", minWidth: 200, sortable: true },
  { id: "host", label: "Host", minWidth: 140, sortable: true },
  {
    id: "date",
    label: "Date & Time",
    minWidth: 140,
    sortable: true,
    format: (_value: string) => _value,
  },
  {
    id: "source",
    label: "Type",
    minWidth: 110,
    format: (value: string) => (
      <span className="inline-flex items-center gap-1 text-sm text-slate-600">
        {value === "online" ? (
          <VideocamOutlinedIcon sx={{ fontSize: 16 }} />
        ) : (
          <GroupsOutlinedIcon sx={{ fontSize: 16 }} />
        )}
        {value === "online" ? "Online" : "In-person"}
      </span>
    ),
  },
  { id: "attendees", label: "Attendees", minWidth: 100, sortable: true },
  {
    id: "status",
    label: "Status",
    minWidth: 120,
    sortable: true,
    format: (value: string) => (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
          statusColors[value] ?? "bg-gray-100 text-gray-600"
        }`}
      >
        {value}
      </span>
    ),
  },
  { id: "actions", label: "Actions", minWidth: 90, align: "right" },
];

export function MeetingsMain() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useAtom(meetingsAtom);
  const [addOpen, setAddOpen] = useState(false);

  // Table rows derive from the meeting list — keep a row shape that sorts/searches cleanly.
  const rows = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    host: m.host,
    date: `${m.date}, ${m.time}`,
    source: m.source,
    attendees: m.attendees,
    status: m.status,
  }));

  const actions: DataTableActions[] = [
    {
      title: "Open meeting",
      icon: <VisibilityOutlinedIcon fontSize="small" />,
      calBackFunction: (row: { id: string }) =>
        navigate(`/main/meeting/${row.id}`),
    },
  ];

  const handleCreate = (meeting: MeetingDetail) => {
    setMeetings((prev) => [meeting, ...prev]);
    setAddOpen(false);
    toast.success("Meeting created");
    navigate(`/main/meeting/${meeting.id}`);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Meetings</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {meetings.length} meeting{meetings.length === 1 ? "" : "s"} · click a row to open
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <DataTableMain
          title="All Meetings"
          columns={columns}
          rows={rows}
          actions={actions}
          onAdd={() => setAddOpen(true)}
          addLabel="Add Meeting"
        />
      </div>

      <AppDialog
        open={addOpen}
        onclose={() => setAddOpen(false)}
        title="Add Meeting"
        size="md"
        dialogContent={<AddMeetingForm onCreate={handleCreate} />}
      />
    </div>
  );
}
