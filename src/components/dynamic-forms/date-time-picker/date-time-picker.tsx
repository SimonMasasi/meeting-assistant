import { FieldEros } from "@/interfaces/shared-interfaces";
import { FieldValues, UseFormRegister, UseFormSetValue } from "react-hook-form";
import * as React from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import {
  CaseValidationInterface,
  dynamicAtom,
  dynamicFormHasErrorsAtom,
  formHasErrors,
  validate,
} from "@/utils/validators";
import { useAtom } from "jotai";
import { newValidationErrors } from "@/utils/case-validators";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

const fieldSx = {
  width: "100%",
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px",
    "&:hover fieldset": { borderColor: "#2663EB" },
    "&.Mui-focused fieldset": {
      borderColor: "#3b82f6",
      boxShadow: "0 0 0 3px rgba(59,130,246,0.12)",
    },
  },
  "& .MuiInputLabel-root.Mui-focused": { color: "#3b82f6" },
};

export interface DynamicDateTimePickerProps {
    keyValue: string;
    label: string;
    required?: boolean;
    validations?: FieldEros[];
    minDate?: string;
    maxDate?: string;
    defaultValues: any;
    registerFunction: UseFormRegister<FieldValues>;
    setValueFunction:UseFormSetValue<any>
}

export function DynamicDateTimePicker(props:DynamicDateTimePickerProps){

    const [value, setValue] = React.useState<Dayjs | null>(props.defaultValues ? dayjs(props.defaultValues[props.keyValue]) : null);

    const [formErrors, setFormErrors] = useAtom(dynamicAtom);

    const [_, setDynamicFormHasErrors] = useAtom(dynamicFormHasErrorsAtom);

    const [{ errors, hasErrors }, setErrors] = React.useState<CaseValidationInterface>({
      errors: [],
      hasErrors: false,
    });


    const onChangedValue = (value: any) => {
      const validationResults = validate(value, props.validations);
  
      const newErrors = newValidationErrors(
        formErrors,
        props.keyValue,
        validationResults
      );
      setDynamicFormHasErrors(formHasErrors(newErrors));
      setFormErrors(newErrors);
      setErrors(validationResults);
      setValue(dayjs(value));
      props.setValueFunction(props.keyValue , value)
    };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DateTimePicker
        className="intro-x"
        label={props?.label ?? "Pick Time"}
        value={value}
        name={props.keyValue}
        minDate={props.minDate ? dayjs(props.minDate) : undefined}
        maxDate={props.maxDate ? dayjs(props.maxDate) : undefined}
        onChange={(event: any) =>
          onChangedValue(new Date(event?.$d).toISOString())
        }
        slotProps={{
          textField: {
            sx: fieldSx,
            error: hasErrors,
            required: props.required,
          },
        }}
      />
      {hasErrors && (
        <div className="mt-1.5 space-y-1">
          {errors.map((error, key) => (
            <div key={key} className="flex items-center gap-1.5 text-danger-500">
              <ErrorOutlineIcon sx={{ fontSize: 14 }} />
              <span className="text-xs font-medium">{error}</span>
            </div>
          ))}
        </div>
      )}
    </LocalizationProvider>
  );


}
