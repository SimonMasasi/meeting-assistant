import {
  FieldEros,
  ValidationResultsInterface,
} from "@/interfaces/shared-interfaces";
import { CaseValidationInterface } from "./validators";

export function caseValidation(error: FieldEros, value: any) {
  switch (error.name) {
    case "maxLength":
      const length = error?.maxLength ?? 5;
      return String(value).length > length ? error?.message : "";

    case "email":
      const validEmailRegex = RegExp(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
      return validEmailRegex.test(String(value)) ? "" : error?.message;

    case "minLength":
      const minLength = error?.minLength ?? 5;
      return String(value).length < minLength ? error?.message : "";

    case "required":
      if (value == "" || !value) {
        return error?.message;
      }
      return "";

    default:
      return "";
  }
}

export const newValidationErrors = (
  formErrors: ValidationResultsInterface[],
  keyValue: String,
  validationResults: CaseValidationInterface
): ValidationResultsInterface[] => {
  return formErrors.map((field) => {
    if (field.key === keyValue) {
      return {
        key: field.key,
        hasErrors: validationResults.hasErrors,
      };
    }
    return {
      ...field,
    };
  });
};
