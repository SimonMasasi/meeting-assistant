import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import { FieldEros } from "@/interfaces/shared-interfaces";
import { FieldValues, UseFormRegister } from "react-hook-form";
import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import {
  CaseValidationInterface,
  dynamicAtom,
  dynamicFormHasErrorsAtom,
  formHasErrors,
  validate,
} from "@/utils/validators";
import { newValidationErrors } from "@/utils/case-validators";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { DocumentNode } from "graphql";

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

export interface DynamicNormalSelect {
  keyValue: string;
  label: string;
  required?: boolean;
  validations?: FieldEros[];
  selectValues: any[];
  selectKeyValue?: string;
  selectLabel?: String;
  multiple: boolean;
  defaultValues: any;
  registerFunction: UseFormRegister<FieldValues>;
  query: DocumentNode;
  mapFunction?: (x?: any) => void | any[];
  searchFields:string[]
}

export default function DynamicPaginatedSelect(props: DynamicNormalSelect) {
  const [selectedValue, setSelectedValue] = useState<any>(
    !props.defaultValues ? [] : props.defaultValues[props.keyValue]
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
  };

  useEffect(() => {
    setSelectedValue(
      !props.defaultValues ? [] : props.defaultValues[props.keyValue]
    );
  }, []);

  return (
    <>
      <Autocomplete
        className="intro-x"
        {...props.registerFunction(props.keyValue, {
          setValueAs(_) {
            if (!selectedValue) return "";
            if (Array.isArray(selectedValue)) {
              return selectedValue.map(
                (value) => value[props?.selectKeyValue ?? "value"] ?? []
              );
            } else {
              return selectedValue[props?.selectKeyValue ?? "value"] ?? "";
            }
          },
        })}
        multiple={props?.multiple}
        options={props.selectValues}
        value={selectedValue ?? null}
        defaultValue={selectedValue ?? null}
        onChange={(_, value) => onChangedValue(value)}
        getOptionLabel={(option) =>
          props?.selectLabel ?? option?.name ?? "name"
        }
        getOptionKey={(option) =>
          props?.selectKeyValue ?? option?.value ?? "value"
        }
        sx={{ width: "100%" }}
        slotProps={{
          chip: {
            sx: {
              borderRadius: "8px",
              backgroundColor: "#ede9fe",
              color: "#2663EB",
              fontWeight: 500,
              fontSize: "0.75rem",
            },
          },
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={props.label}
            name={props.keyValue}
            error={hasErrors}
            required={props.required}
            sx={fieldSx}
          />
        )}
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
    </>
  );
}


