import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { FieldValues, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { FieldEros } from "@/interfaces/shared-interfaces";
import { useState } from "react";
import {
  CaseValidationInterface,
  dynamicAtom,
  dynamicFormHasErrorsAtom,
  formHasErrors,
  validate,
} from "@/utils/validators";
import { useAtom } from "jotai";
import { newValidationErrors } from "@/utils/case-validators";
import dayjs from "dayjs";
import { FormHelperText } from "@mui/material";

export interface DynamicTimePickerProps {
  keyValue: string;
  label: string;
  required?: boolean;
  validations?: FieldEros[];
  defaultValues: any;
  registerFunction: UseFormRegister<FieldValues>;
  setValueFunction: UseFormSetValue<any>;
}

export default function DynamicTimePicker(props: DynamicTimePickerProps) {
  const [selectedValue, setSelectedValue] = useState<string | null>(
    props.defaultValues ? props.defaultValues[props.keyValue] : null
  );

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
    props.setValueFunction(props.keyValue, value);
  };
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <TimePicker
        label={props.label}
        onChange={(event: any) =>
          onChangedValue(new Date(event?.$d).toLocaleTimeString("en-CA"))
        }
        value={selectedValue ? dayjs(selectedValue, "HH:mm:ss") : null}
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
