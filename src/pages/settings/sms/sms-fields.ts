import {
  DynamicInterface,
  FieldType,
} from "@/interfaces/dynamic-form-interfaces";
import { FieldSize } from "@/interfaces/shared-interfaces";

export const smsFields: DynamicInterface[] = [
  {
    key: "name",
    label: "chose Date",
    type: FieldType.dateTimePicker,
    size: FieldSize.large,
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
    key:"chosen",
    label:"chose Fruits",
    type: FieldType.normalSelect,
    size: FieldSize.large,
    multiple:true,
    selectValues:[
      {name:"Apple" , value:"apple"},
      {name:"Banana" , value:"banana"},
      {name:"Orange" , value:"orange"},
    ],
    selectLabel:"name",
    selectKeyValue:"value",
     validations: [
      {
        name: "required",
        message: "this field is required",
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
