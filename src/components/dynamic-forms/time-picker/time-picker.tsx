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
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

const fieldSx = {
  width: "100%",
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px",
    "&:hover fieldset": { borderColor: "#2663EB" },
    "&.Mui-focused fieldset": {
      borderColor: "#2663EB",
      boxShadow: "0 0 0 3px rgba(38,99,235,0.12)",
    },
  },
  "& .MuiInputLabel-root.Mui-focused": { color: "#2663EB" },
};

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
    const newErrors = newValidationErrors(formErrors, props.keyValue, validationResults);
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
        slotProps={{
          textField: {
            sx: fieldSx,
            error: hasErrors,
            required: props.required,
            fullWidth: true,
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
