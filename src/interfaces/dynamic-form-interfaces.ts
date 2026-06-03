import { Accept } from "react-dropzone";
import { BaseDynamicInterface } from "./shared-interfaces";
import { DocumentNode } from "graphql";

export interface DynamicFieldInput extends BaseDynamicInterface {
  inputType?: "email" | "password" | "number" | "text";
  type: FieldType.input;
}

export interface DynamicNormalSelect extends BaseDynamicInterface {
  selectValues: any[];
  type: FieldType.normalSelect;
  selectKeyValue?: string;
  selectLabel?: string;
  multiple?: boolean;
}

export interface DynamicDatePickerInput extends BaseDynamicInterface {
  type: FieldType.datePiker;
  minDate?: string;
  maxDate?: string;
}

export interface DynamicFileInput extends BaseDynamicInterface {
  type: FieldType.file;
  multiple?: boolean;
  accept?: Accept;
}

export interface DynamicTextarea extends BaseDynamicInterface {
  type: FieldType.textarea;
}

export interface DynamicDateTimePickerInput extends BaseDynamicInterface {
  type: FieldType.dateTimePicker;
  minDate?: string;
  maxDate?: string;
}

export interface DynamicCheckBox extends BaseDynamicInterface {
  type: FieldType.checkbox;
}

export interface DynamicTimePicker extends BaseDynamicInterface {
  type: FieldType.timePicker;
}

export interface DynamicPaginatedSelect extends BaseDynamicInterface {
  selectValues: any[];
  type: FieldType.paginatedSelect;
  selectKeyValue?: string;
  selectLabel?: string;
  multiple?: boolean;
  query: DocumentNode;
  mapFunction?: (x?: any) => void | any[];
  searchFields:string[]
}

export enum FieldType {
  input = "input",
  inputChip = "inputChip",

  timePicker = "timePicker",

  textarea = "textarea",

  radioButton = "radioButton",

  normalSelect = "normalSelect",

  datePiker = "datePiker",

  dateTimePicker = "dateTimePicker",

  button = "button",

  paginatedSelect = "paginatedSelect",

  checkbox = "checkbox",

  file = "file",
}

export type DynamicInterface =
  | DynamicFieldInput
  | DynamicNormalSelect
  | DynamicDatePickerInput
  | DynamicFileInput
  | DynamicTextarea
  | DynamicDateTimePickerInput
  | DynamicCheckBox
  | DynamicTimePicker
  | DynamicPaginatedSelect;
