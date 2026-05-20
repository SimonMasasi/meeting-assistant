import {
  DynamicInterface,
  FieldType,
} from "@/interfaces/dynamicFormInterfaces";
import { FormControl } from "@mui/material";
import { DynamicInput } from "./input/input";
import { FieldValues, UseFormRegister, UseFormSetValue } from "react-hook-form";
import DynamicNormaSelect from "./normal-select/normalSelect";
import DynamicDatePicker from "./date-picker/datePicker";
import { DynamicFileUpload } from "./file-upload/fileUpload";
import { DynamicDateTimePicker } from "./date-time-picker/dateTimePicker";
import DynamicCheckBox from "./check-box/checkBox";
import DynamicTimePicker from "./time-picker/timePicker";
import DynamicPaginatedSelect from "./paginated-select/paginatedSelect";

export interface DynamicFieldsProps {
  field: DynamicInterface;
  defaultValues?: any;
  registerFunction: UseFormRegister<FieldValues>;
  setValueFunction: UseFormSetValue<any>;
}
export function DynamicFields(props: DynamicFieldsProps) {
  if (props.field.type === FieldType.input) {
    return (
      <FormControl className={props.field?.size ?? "w-[100%]"}>
        <DynamicInput
          keyValue={props.field?.key}
          label={props.field?.label}
          required={props.field?.required}
          registerFunction={props.registerFunction}
          validations={props.field.validations}
          inputType={props.field.inputType}
        />
      </FormControl>
    );
  } else if (props.field.type == FieldType.normalSelect) {
    return (
      <FormControl className={props.field?.size ?? "w-[100%]"}>
        <DynamicNormaSelect
          keyValue={props.field?.key}
          label={props.field?.label}
          required={props.field?.required}
          registerFunction={props.registerFunction}
          validations={props.field.validations}
          selectValues={props.field.selectValues ?? []}
          selectLabel={props.field?.selectLabel}
          selectKeyValue={props.field?.selectKeyValue}
          multiple={props.field?.multiple ?? false}
          defaultValues={props?.defaultValues}
        />
      </FormControl>
    );
  } else if (props.field.type == FieldType.datePiker) {
    return (
      <FormControl className={props.field?.size ?? "w-[100%]"}>
        <DynamicDatePicker
          keyValue={props.field?.key}
          label={props.field?.label}
          required={props.field?.required}
          registerFunction={props.registerFunction}
          validations={props.field.validations}
          maxDate={props.field.maxDate}
          minDate={props.field.minDate}
          setValueFunction={props.setValueFunction}
          defaultValues={props.defaultValues}
        />
      </FormControl>
    );
  } else if (props.field.type == FieldType.file) {
    return (
      <FormControl className={"w-[98%]"}>
        <DynamicFileUpload
          keyValue={props.field?.key}
          label={props.field?.label}
          required={props.field?.required}
          registerFunction={props.registerFunction}
          validations={props.field.validations}
          setValueFunction={props.setValueFunction}
          defaultValues={props.defaultValues}
          multiple={props.field?.multiple ?? false}
          accept={props.field?.accept ?? {}}
        />
      </FormControl>
    );
  } else if (props.field.type == FieldType.dateTimePicker) {
    return (
      <FormControl className={props.field?.size ?? "w-[100%]"}>
        <DynamicDateTimePicker
          keyValue={props.field?.key}
          label={props.field?.label}
          required={props.field?.required}
          registerFunction={props.registerFunction}
          validations={props.field.validations}
          maxDate={props.field.maxDate}
          minDate={props.field.minDate}
          setValueFunction={props.setValueFunction}
          defaultValues={props.defaultValues}
        />
      </FormControl>
    );
  } else if (props.field.type == FieldType.checkbox) {
    return (
      <FormControl className={props.field?.size ?? "w-[100%]"}>
        <DynamicCheckBox
          keyValue={props.field?.key}
          label={props.field?.label}
          required={props.field?.required}
          registerFunction={props.registerFunction}
          validations={props.field.validations}
          defaultValues={props.defaultValues}
          setValueFunction={props.setValueFunction}
        />
      </FormControl>
    );
  } else if (props.field.type == FieldType.timePicker) {
    return (
      <FormControl className={props.field?.size ?? "w-[100%]"}>
        <DynamicTimePicker
          keyValue={props.field?.key}
          label={props.field?.label}
          required={props.field?.required}
          registerFunction={props.registerFunction}
          validations={props.field.validations}
          defaultValues={props.defaultValues}
          setValueFunction={props.setValueFunction}
        />
      </FormControl>
    );
  } else if (props.field.type == FieldType.paginatedSelect) {
    return (
      <FormControl className={props.field?.size ?? "w-[100%]"}>
        <DynamicPaginatedSelect
          keyValue={props.field?.key}
          label={props.field?.label}
          required={props.field?.required}
          registerFunction={props.registerFunction}
          validations={props.field.validations}
          selectValues={props.field.selectValues ?? []}
          selectLabel={props.field?.selectLabel}
          selectKeyValue={props.field?.selectKeyValue}
          multiple={props.field?.multiple ?? false}
          defaultValues={props?.defaultValues}
          query={props.field.query}
          mapFunction={props.field.mapFunction}
          searchFields={props.field.searchFields}
        />
      </FormControl>
    );
  } 
}
