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
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

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

  const onChangedValue = (value: boolean) => {
    const validationResults = validate(String(value), props.validations);
    const newErrors = newValidationErrors(formErrors, props.keyValue, validationResults);
    setDynamicFormHasErrors(formHasErrors(newErrors));
    setFormErrors(newErrors);
    setErrors(validationResults);
    setSelectedValue(value);
    props.setValueFunction(props.keyValue, value);
  };

  return (
    <div className="intro-x w-full">
      <div
        onClick={() => onChangedValue(!selectedValue)}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer select-none transition-all duration-200 ${
          selectedValue
            ? "border-primary-500 bg-primary-50 shadow-sm"
            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-primary-300 hover:bg-primary-50/40"
        }`}
      >
        <Checkbox
          checked={!!selectedValue}
          sx={{
            padding: 0,
            color: "#94a3b8",
            "&.Mui-checked": { color: "#3b82f6" },
          }}
        />
        <span
          className={`text-sm font-medium ${
            selectedValue ? "text-primary-700" : "text-slate-600 dark:text-slate-300"
          }`}
        >
          {props.label}
        </span>
        {props.required && (
          <span className="ml-auto text-xs text-red-400 font-medium">Required</span>
        )}
      </div>
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
