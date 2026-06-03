import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import { FieldEros } from "@/interfaces/shared-interfaces";
import { FieldValues, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { newValidationErrors } from "@/utils/case-validators";
import { useAtom } from "jotai";
import {
  CaseValidationInterface,
  dynamicAtom,
  dynamicFormHasErrorsAtom,
  formHasErrors,
  validate,
} from "@/utils/validators";
import { useState } from "react";
import { FormHelperText } from "@mui/material";

export interface DynamicCheckBox {
  keyValue: string;
  label: string;
  required?: boolean;
  validations?: FieldEros[];
  defaultValues: any;
  registerFunction: UseFormRegister<FieldValues>;
  setValueFunction: UseFormSetValue<any>;
}

export default function DynamicCheckBox(props: DynamicCheckBox) {
  const [selectedValue, setSelectedValue] = useState<boolean | null>(
    props.defaultValues ? props.defaultValues[props.keyValue] : false
  );

  const [{ errors, hasErrors }, setErrors] = useState<CaseValidationInterface>({
    errors: [],
    hasErrors: false,
  });

  const [formErrors, setFormErrors] = useAtom(dynamicAtom);
  const [_, setDynamicFormHasErrors] = useAtom(dynamicFormHasErrorsAtom);

  const onChangedValue = (value: any) => {
    const validationResults = validate(String(value), props.validations);

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
    <div className="intro-x">
      <FormControlLabel
        required={props.required}
        control={<Checkbox />}
        label={props.label}
        onChange={(_: any, checked: boolean) => onChangedValue(checked)}
        value={selectedValue}
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
