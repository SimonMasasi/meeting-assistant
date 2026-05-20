import {
  DynamicInterface,
  FieldType,
} from "@/interfaces/dynamicFormInterfaces";
import { FieldSize } from "@/interfaces/SharedInterfaces";

export const smsFields: DynamicInterface[] = [
  {
    key: "name",
    label: "chose Date",
    type: FieldType.timePicker,
    size: FieldSize.large,
    validations: [
      {
        name: "required",
        message: "this field is required",
      },
    ],
  },
  {
    key: "lastf",
    label: "what is Youre lastf",
    type: FieldType.checkbox,
    size: FieldSize.medium,
    required: true,
    validations: [
      {
        name: "required",
        message: "this field is required",
      },
    ],
  },
  {
    key: "lastd",
    label: "what is Youre lastd",
    type: FieldType.input,
    size: FieldSize.medium,
    validations: [
      {
        name: "required",
        message: "this field is required",
      },
      {
        name: "minLength",
        message: "min Length of 6  Not reached",
        minLength: 6,
      },
    ],
  },
  {
    key: "last",
    label: "what is Youre last",
    type: FieldType.file,
    size: FieldSize.medium,
    multiple:false,
  },
];
