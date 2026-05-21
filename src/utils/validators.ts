import { DynamicInterface } from "@/interfaces/dynamicFormInterfaces";
import { caseValidation } from "./caseValidators";
import { atom } from "jotai";
import { FieldEros } from "@/interfaces/SharedInterfaces";

export interface CaseValidationInterface {
  errors: String[];
  hasErrors: boolean;
}

export function validate(
  inputValue: any,
  errors: FieldEros[] | undefined
): CaseValidationInterface {
  if (!errors) {
    return { errors: [], hasErrors: false };
  }

  let value: any;

  if (inputValue?.target) {
    value = inputValue.target.value;
  } else {
    value = inputValue;
    if (Array.isArray(value)) {
      value = value.toString();
    }
  }

  let errorsDetected: String[] = [];

  errors.forEach((error) => {
    const validation = caseValidation(error, value);

    if (validation != "") {
      errorsDetected.push(validation);
    }
  });

  return { errors: errorsDetected, hasErrors: errorsDetected.length > 0 };
}

export const setDynamicFormErrors = (
  formFields: DynamicInterface[] = [],
  defaultValues: any
) => {
  const errors: { key: string; hasErrors: boolean }[] = [];

  if (!defaultValues) {
    return errors;
  }

  for (let field of formFields) {
    if (field.validations && !defaultValues[field?.key]) {
      errors.push({
        key: field.key,
        hasErrors: true,
      });
    } else {
      errors.push({
        key: field.key,
        hasErrors: false,
      });
    }
  }
  return errors;
};

export const formHasErrors = (
  formErrors: { key: string; hasErrors: boolean }[]
) => {
  for (const error of formErrors) {
    if (error.hasErrors) {
      return true;
    }
  }
  return false;
};

export const dynamicAtom = atom(setDynamicFormErrors([], null));

export const dynamicFormHasErrorsAtom = atom(false);
