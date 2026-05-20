import { FieldEros } from "@/interfaces/SharedInterfaces";
import { FieldValues, UseFormRegister, UseFormSetValue } from "react-hook-form";
import * as React from 'react';
import dayjs, { Dayjs } from 'dayjs';
import Stack from '@mui/material/Stack';
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
import { newValidationErrors } from "@/utils/caseValidators";
import { FormHelperText } from "@mui/material";


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
      console.log(value)
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
      <Stack spacing={2} sx={{ minWidth: 305 }}>
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
        />

      </Stack>
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