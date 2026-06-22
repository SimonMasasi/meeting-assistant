import { DynamicFormMain } from "@/components/dynamic-forms/dynamic-form-main";
import {
  DynamicInterface,
  FieldType,
} from "@/interfaces/dynamic-form-interfaces";
import { FieldSize } from "@/interfaces/shared-interfaces";
import { MeetingDetail } from "../mock-data";

interface MeetingFormProps {
  /** Pass an existing meeting to edit it; omit to create a new one. */
  meeting?: MeetingDetail;
  onSubmit: (meeting: MeetingDetail) => void;
}

const OBJECTIVE_PLACEHOLDER = "No objective set yet.";

const sourceOptions = [
  { key: "online", label: "Online" },
  { key: "in-person", label: "In-person" },
];

// Minimal meeting form — a meeting only needs a title and a type to be created.
// Host, status and attachments are managed elsewhere, not on this form.
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
    key: "source",
    label: "Type",
    type: FieldType.normalSelect,
    required: true,
    size: FieldSize.medium,
    selectValues: sourceOptions,
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

export function MeetingForm({ meeting, onSubmit }: MeetingFormProps) {
  const defaultValues = {
    title: meeting?.title ?? "",
    // The Type select displays the matching option object, not the raw key.
    source:
      sourceOptions.find((o) => o.key === meeting?.source) ?? sourceOptions[0],
    objective:
      meeting && meeting.objective !== OBJECTIVE_PLACEHOLDER
        ? meeting.objective
        : "",
  };

  const handleSubmit = (data: any) => {
    // `||` (not `??`) so an empty select value falls back to a valid type.
    const source = (data.source ||
      meeting?.source ||
      "online") as MeetingDetail["source"];
    const title = data.title?.trim();
    const objective = data.objective?.trim();

    // Edit mode: merge the changed fields into the existing meeting.
    if (meeting) {
      onSubmit({
        ...meeting,
        title: title || meeting.title,
        source,
        objective: objective || OBJECTIVE_PLACEHOLDER,
      });
      return;
    }

    // Create mode: build a fresh meeting with sensible defaults.
    const id = `mtg-${Date.now()}`;
    onSubmit({
      id,
      title: title || "Untitled Meeting",
      host: "Unknown",
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
      status: "Upcoming",
      source,
      durationLabel: "0 min",
      language: "ENG",
      tags: [],
      objective: objective || OBJECTIVE_PLACEHOLDER,
      summary: "This meeting hasn't been summarized yet.",
      keyPoints: [],
      actionItems: [],
      transcript: [],
      attachments: [],
    });
  };

  return (
    <DynamicFormMain
      formFields={formFields}
      defaultValues={defaultValues}
      handleSubmit={handleSubmit}
    />
  );
}
