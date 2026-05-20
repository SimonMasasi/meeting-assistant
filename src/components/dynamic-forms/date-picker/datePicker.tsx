import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { FieldEros } from "@/interfaces/SharedInterfaces";
import { FieldValues, UseFormRegister, UseFormSetValue } from "react-hook-form";
import dayjs from "dayjs";
import { useState } from "react";
import {
  CaseValidationInterface,
  dynamicAtom,
  dynamicFormHasErrorsAtom,
  formHasErrors,
  validate,
} from "@/utils/validators";
import { useAtom } from "jotai";
import { newValidationErrors } from "@/utils/caseValidators";
import { FormHelperText } from "@mui/material";

export interface DynamicDatePickerProps {
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

export default function DynamicDatePicker(props: DynamicDatePickerProps) {
  const [selectedValue, setSelectedValue] = useState<string | null>(props.defaultValues ? props.defaultValues[props.keyValue] : null);

  const [{ errors, hasErrors }, setErrors] = useState<CaseValidationInterface>({
    errors: [],
    hasErrors: false,
  });

  const [formErrors, setFormErrors] = useAtom(dynamicAtom);
  const [_, setDynamicFormHasErrors] = useAtom(dynamicFormHasErrorsAtom);

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
    setSelectedValue(value);
    props.setValueFunction(props.keyValue , value)
  };


  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DatePicker
        className="intro-x"
        label={props.label}
        {...props.registerFunction(props.keyValue,{
        })}
        name={props.keyValue}
        onChange={(event: any) =>
          onChangedValue(new Date(event?.$d).toLocaleDateString("en-CA"))
        }
        value={selectedValue ? dayjs(selectedValue) : null}
        minDate={props.minDate ? dayjs(props.minDate) : null}
        maxDate={props.maxDate ? dayjs(props.maxDate) : null}
        slotProps={{
          field: {
            readOnly: true,
            value:selectedValue ? dayjs(selectedValue) : null,
          },
          textField: {
            name: props.keyValue,
            error: hasErrors,
            id: props.keyValue,
            required:props.required,
            value:selectedValue ? dayjs(selectedValue) : null,
          },
        }}
      />
      {hasErrors && (
        <div>
          {errors.map((error, key) => {
            return (
              <FormHelperText id={props.keyValue} key={key}>
                <span className="text-red-600"> {error}</span>
              </FormHelperText>
            );
          })}
        </div>
      )}
    </LocalizationProvider>
  );
}
