import { FieldEros } from "@/interfaces/shared-interfaces";
import { newValidationErrors } from "@/utils/case-validators";
import {
  CaseValidationInterface,
  dynamicAtom,
  dynamicFormHasErrorsAtom,
  formHasErrors,
  validate,
} from "@/utils/validators";
import { TextField } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useAtom } from "jotai";
import { useState } from "react";
import { FieldValues, UseFormRegister } from "react-hook-form";

export interface DynamicInput {
  keyValue: string;
  label: string;
  required?: boolean;
  validations?: FieldEros[];
  inputType?: "email" | "password" | "number" | "text";
  registerFunction: UseFormRegister<FieldValues>;
}

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

export function DynamicInput(props: DynamicInput) {
  const [{ errors, hasErrors }, setErrors] = useState<CaseValidationInterface>({
    errors: [],
    hasErrors: false,
  });

  const [formErrors, setFormErrors] = useAtom(dynamicAtom);
  const [_, setDynamicFormHasErrors] = useAtom(dynamicFormHasErrorsAtom);

  const validateInput = (inputValue: any, errors: FieldEros[] | undefined) => {
    const validationResults = validate(inputValue, errors);
    const newErrors = newValidationErrors(formErrors, props.keyValue, validationResults);
    setDynamicFormHasErrors(formHasErrors(newErrors));
    setFormErrors(newErrors);
    setErrors(validationResults);
  };

  return (
    <div className="w-full intro-x">
      <TextField
        {...props.registerFunction(props.keyValue, {
          required: props?.required ?? true,
          valueAsNumber: props?.inputType === "number",
        })}
        id={props.keyValue}
        label={props.label}
        variant="outlined"
        sx={fieldSx}
        onChange={(event) => validateInput(event, props.validations)}
        error={hasErrors}
        required={props?.required ?? true}
        type={props?.inputType ?? "text"}
      />
      {hasErrors && (
        <div className="mt-1.5 space-y-1">
          {errors.map((error, key) => (
            <div key={key} className="flex items-center gap-1.5 text-red-500">
              <ErrorOutlineIcon sx={{ fontSize: 14 }} />
              <span className="text-xs font-medium">{error}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
