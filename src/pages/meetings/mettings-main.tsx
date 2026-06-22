import { useState } from "react";
import { useAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import toast from "react-hot-toast";
import DataTableMain from "@/components/shared/tables/data-table-main";
import AppDialog from "@/components/shared/dialogs/app-dialog";
import { DataTableActions, DataTableColumns } from "@/interfaces/shared-interfaces";
import { meetingsAtom } from "@/atoms/meetings-atoms";
import { MeetingDetail } from "./mock-data";
import { MeetingForm } from "./components/meeting-form";

const columns: DataTableColumns[] = [
  { id: "title", label: "Meeting Title", minWidth: 200, sortable: true },
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
      <span className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
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
  { id: "actions", label: "Actions", minWidth: 90, align: "right" },
];

export function MeetingsMain() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useAtom(meetingsAtom);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<MeetingDetail | null>(null);

  // Table rows derive from the meeting list — keep a row shape that sorts/searches cleanly.
  const rows = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    date: `${m.date}, ${m.time}`,
    source: m.source,
    attendees: m.attendees,
  }));

  const actions: DataTableActions[] = [
    {
      title: "Open meeting",
      icon: <VisibilityOutlinedIcon fontSize="small" />,
      calBackFunction: (row: { id: string }) =>
        navigate(`/main/meeting/${row.id}`),
    },
    {
      title: "Edit meeting",
      icon: <EditOutlinedIcon fontSize="small" />,
      calBackFunction: (row: { id: string }) => {
        const target = meetings.find((m) => m.id === row.id);
        if (target) setEditing(target);
      },
    },
  ];

  const handleCreate = (meeting: MeetingDetail) => {
    setMeetings((prev) => [meeting, ...prev]);
    setAddOpen(false);
    toast.success("Meeting created");
    navigate(`/main/meeting/${meeting.id}`);
  };

  const handleUpdate = (meeting: MeetingDetail) => {
    setMeetings((prev) => prev.map((m) => (m.id === meeting.id ? meeting : m)));
    setEditing(null);
    toast.success("Meeting updated");
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Meetings</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
          {meetings.length} meeting{meetings.length === 1 ? "" : "s"} · click a row to open
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">
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
        dialogContent={<MeetingForm onSubmit={handleCreate} />}
      />

      <AppDialog
        open={Boolean(editing)}
        onclose={() => setEditing(null)}
        title="Edit Meeting"
        size="md"
        dialogContent={
          editing ? (
            <MeetingForm meeting={editing} onSubmit={handleUpdate} />
          ) : undefined
        }
      />
    </div>
  );
}
