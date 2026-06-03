import { Button } from "@mui/material";
import { DynamicInterface } from "@/interfaces/dynamic-form-interfaces";
import { DynamicFields } from "./dynamic-field";
import { useForm } from "react-hook-form";
import { useAtom } from "jotai";
import {
  dynamicAtom,
  dynamicFormHasErrorsAtom,
  formHasErrors,
  setDynamicFormErrors,
} from "@/utils/validators";
import { useEffect } from "react";

export interface DynamicFormMainProps {
  formFields: DynamicInterface[];
  defaultValues: any;
  handleSubmit: (data?: any) => any;
}

export function DynamicFormMain(props: DynamicFormMainProps) {
  const { register, setValue , handleSubmit } = useForm({
    defaultValues: props?.defaultValues,
  });

  const [dynamicFormHasErrors, setDynamicFormHasErrors] = useAtom(
    dynamicFormHasErrorsAtom
  );

  const [_, setFormErrors] = useAtom(dynamicAtom);

  useEffect(() => {
    const errors = setDynamicFormErrors(props.formFields, props?.defaultValues);
    setFormErrors(errors);
    setDynamicFormHasErrors(formHasErrors(errors));
  }, []);

  return (
    <>
      <form onSubmit={handleSubmit(props.handleSubmit)}>
        <div className="flex flex-wrap gap-x-4 gap-y-5 justify-start">
          {props.formFields.map((formField, key) => {
            return (
              <DynamicFields
                field={formField}
                key={key}
                registerFunction={register}
                defaultValues={props?.defaultValues}
                setValueFunction={setValue}
              />
            );
          })}
        </div>

        <div className="flex justify-end my-4 mx-4 intro-x">
          <Button
            variant="contained"
            type="submit"
            disabled={dynamicFormHasErrors}
            sx={{
              background: "linear-gradient(135deg, #3b82f6 0%, #1255e7 100%)",
              borderRadius: "10px",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.9rem",
              padding: "10px 32px",
              boxShadow: "0 4px 14px rgba(78, 103, 174, 0.35)",
              "&:hover": {
                background: "linear-gradient(135deg, #4e7ad6 0%, #2663EB 100%)",
                boxShadow: "0 6px 20px rgba(87, 122, 196, 0.45)",
              },
              "&.Mui-disabled": {
                background: "#e2e8f0",
                color: "#94a3b8",
                boxShadow: "none",
              },
            }}
          >
            Submit
          </Button>
        </div>
      </form>
    </>
  );
}
