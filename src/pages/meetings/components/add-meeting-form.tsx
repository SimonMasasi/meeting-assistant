import { DynamicFormMain } from "@/components/dynamic-forms/dynamic-form-main";
import {
  DynamicInterface,
  FieldType,
} from "@/interfaces/dynamic-form-interfaces";
import { FieldSize } from "@/interfaces/shared-interfaces";
import { MeetingDetail } from "../mock-data";

interface AddMeetingFormProps {
  onCreate: (meeting: MeetingDetail) => void;
}

const formFields: DynamicInterface[] = [
  {
    key: "title",
    label: "Meeting Title",
    type: FieldType.input,
    inputType: "text",
    required: true,
    size: FieldSize.medium,
    validations: [{ name: "required", message: "Title is required" }],
  },
  {
    key: "host",
    label: "Host",
    type: FieldType.input,
    inputType: "text",
    required: true,
    size: FieldSize.medium,
    validations: [{ name: "required", message: "Host is required" }],
  },
  {
    key: "source",
    label: "Type",
    type: FieldType.normalSelect,
    required: true,
    size: FieldSize.medium,
    selectValues: [
      { key: "online", label: "Online" },
      { key: "in-person", label: "In-person" },
    ],
    selectKeyValue: "key",
    selectLabel: "label",
  },
  {
    key: "status",
    label: "Status",
    type: FieldType.normalSelect,
    required: true,
    size: FieldSize.medium,
    selectValues: [
      { key: "Upcoming", label: "Upcoming" },
      { key: "Ongoing", label: "Ongoing" },
      { key: "Completed", label: "Completed" },
      { key: "Cancelled", label: "Cancelled" },
    ],
    selectKeyValue: "key",
    selectLabel: "label",
  },
  {
    key: "objective",
    label: "Objective",
    type: FieldType.input,
    inputType: "text",
    required: false,
    size: FieldSize.large,
  },
];

const defaultValues = {
  title: "",
  host: "",
  source: "online",
  status: "Upcoming",
  objective: "",
};

export function AddMeetingForm({ onCreate }: AddMeetingFormProps) {
  const handleSubmit = (data: any) => {
    const meeting: MeetingDetail = {
      id: `mtg-${Date.now()}`,
      title: data.title?.trim() || "Untitled Meeting",
      host: data.host?.trim() || "Unknown",
      date: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
      }),
      time: new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      views: 0,
      attendees: 1,
      status: (data.status ?? "Upcoming") as MeetingDetail["status"],
      source: (data.source ?? "online") as MeetingDetail["source"],
      durationLabel: "0 min",
      language: "ENG",
      tags: [],
      objective: data.objective?.trim() || "No objective set yet.",
      summary: "This meeting hasn't been summarized yet.",
      keyPoints: [],
      actionItems: [],
      transcript: [],
    };
    onCreate(meeting);
  };

  return (
    <DynamicFormMain
      formFields={formFields}
      defaultValues={defaultValues}
      handleSubmit={handleSubmit}
    />
  );
}
