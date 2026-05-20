import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import { FieldEros } from "@/interfaces/SharedInterfaces";
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
import { newValidationErrors } from "@/utils/caseValidators";
import { FormHelperText } from "@mui/material";

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
}

export default function DynamicNormaSelect(props: DynamicNormalSelect) {
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

    const newErrors = newValidationErrors(
      formErrors,
      props.keyValue,
      validationResults
    );
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
            if (!selectedValue) {
              return "";
            }
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
        renderInput={(params) => (
          <TextField
            {...params}
            label={props.label}
            name={props.keyValue}
            error={hasErrors}
            required={props.required}
          />
        )}
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
    </>
  );
}
