import { FieldEros } from "@/interfaces/SharedInterfaces";
import { newValidationErrors } from "@/utils/caseValidators";
import {
  CaseValidationInterface,
  dynamicAtom,
  dynamicFormHasErrorsAtom,
  formHasErrors,
  validate,
} from "@/utils/validators";
import { FormHelperText, TextField } from "@mui/material";
import { useAtom } from "jotai";
import { useState } from "react";
import { FieldValues, UseFormRegister } from "react-hook-form";

export interface DynamicInput {
  keyValue: string;
  label: string;
  required?: boolean;
  validations?: FieldEros[];
  inputType?:"email" | "password" | "number" | "text";
  registerFunction: UseFormRegister<FieldValues>;
}

export function DynamicInput(props: DynamicInput) {
  const [{ errors, hasErrors }, setErrors] = useState<CaseValidationInterface>({
    errors: [],
    hasErrors: false,
  });

  const [formErrors, setFormErrors] = useAtom(dynamicAtom);
  const [_, setDynamicFormHasErrors] = useAtom(dynamicFormHasErrorsAtom);


  const validateInput = (inputValue: any, errors: FieldEros[] | undefined) => {
    const validationResults = validate(inputValue, errors);


    const newErrors = newValidationErrors(
      formErrors,
      props.keyValue,
      validationResults
    );
    setDynamicFormHasErrors(formHasErrors(newErrors));
    setFormErrors(newErrors);
    setErrors(validationResults);
  };

  return (
    <div className="w-full intro-x">
      <TextField
        {...props.registerFunction(props.keyValue, {
          required: props?.required ?? true,
          valueAsNumber:props?.inputType=="number",
        })}
        id={props.keyValue}
        fullWidth={true}
        label={props.label}
        variant="outlined"
        sx={{ width: "100%" }}
        onChange={(event) => validateInput(event, props.validations)}
        error={hasErrors}
        required={props?.required ?? true}
        type={props?.inputType ?? "text" }
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
    </div>
  );
}
