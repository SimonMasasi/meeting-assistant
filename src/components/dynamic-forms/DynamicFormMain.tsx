import { Button } from "@mui/material";
import { DynamicInterface } from "@/interfaces/dynamicFormInterfaces";
import { DynamicFields } from "./DynamicField";
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
        <div className="flex flex-wrap gap-4 justify-star">
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

        <div className="flex justify-end my-2 mx-4 intro-x">
          <Button
            variant="contained"
            type="submit"
            disabled={dynamicFormHasErrors}
          >
            Submit
          </Button>
        </div>
      </form>
    </>
  );
}
