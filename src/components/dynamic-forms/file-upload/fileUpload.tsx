import { FieldEros } from "@/interfaces/SharedInterfaces";
import { useState } from "react";
import { Accept, useDropzone } from "react-dropzone";
import { FieldValues, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { useRef } from "react";
import { checkIfFileIsImage, fileToBase64 } from "@/utils/helperFunctions";
import { Close } from "@mui/icons-material";

export interface DynamicFileProps {
  keyValue: string;
  label: string;
  required?: boolean;
  validations?: FieldEros[];
  registerFunction: UseFormRegister<FieldValues>;
  setValueFunction: UseFormSetValue<any>;
  defaultValues: any;
  multiple?: boolean;
  accept?: Accept;
}

export function DynamicFileUpload(props: DynamicFileProps) {
  const hiddenInputRef = useRef(null);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async (files) => {
      if (hiddenInputRef.current) {
        await getBase64(files[0]);
      }
    },
    accept: props?.accept ?? {},
  });

  const [filesDrooped, setFilesDrooped] = useState<any[]>([]);
  const [fileNamesTracking, setFileNamesTracking] = useState<any[]>([]);

  var filesUploaded: any[] = [];

  const getBase64 = async (file: any) => {
    const base64 = await fileToBase64(file);

    if (!fileNamesTracking.includes(file.path)) {
      setFileNamesTracking([...[file.path]]);

      filesUploaded.push({
        fileName: file.path,
        dataBinary: base64?.toString().replace(/^data:[^;]+;base64,/, ""),
        originalSource: base64?.toString(),
      }); 

      if (props?.multiple) {
        setFilesDrooped([...filesUploaded, ...filesDrooped]);
        props.setValueFunction(props.keyValue, [
          ...filesUploaded,
          ...filesDrooped,
        ]);
      } else {
        setFilesDrooped([...filesUploaded]);
        props.setValueFunction(props.keyValue, [...filesUploaded]);
      }

      props.setValueFunction(props.keyValue, [
        ...filesUploaded,
        ...filesDrooped,
      ]);
    }
  };

  const removeFileFromList = (fileRemoved: any) => {
    const remainingFiles = filesDrooped.filter(
      (file) => file?.fileName !== fileRemoved?.fileName
    );
    setFilesDrooped(remainingFiles);
  };

  return (
    <section className="my-2 border-dashed border-2 border-gray-600 intro-x">
      <div className="flex justify-center h-14">
        <div className="w-full text-center">
          <div {...getRootProps({ className: "cursor-pointer w-full hover:text-blue-500" })}>
            <input
              {...props.registerFunction(props.keyValue, {})}
              type="file"
              name="file"
              style={{ opacity: 0, display: "none" }}
              ref={hiddenInputRef}
            />
            <input {...getInputProps()} />
            <p>Drag drop file(s) here, or click to select files</p>
          </div>
        </div>
      </div>

      {filesDrooped?.length > 0 && (
        <div className="m-2">
          <span>Selected file(s)</span>
          <div
            className={
              props.multiple
                ? "grid grid-cols-2 gap-1"
                : "grid grid-cols-1 gap-1"
            }
          >
            {filesDrooped.map((file, key) => (
              <ul className="flex p-2 " key={key}>
                <li className="flex w-full items-center  p-4 transition duration-500 ease-in-out transform bg-blue-50  select-none rounded-md hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex-auto w-72 mb-2">
                    <div className="flex w-full">
                      <div
                        className="flex items-center justify-content-start w-25 h-25 mr-4  rounded-md"
                        onClick={() => removeFileFromList(file)}
                      >
                        <Close className="text-red-500 cursor-pointer"></Close>
                      </div>
                      <div className="flex w-64 pl-1 ">
                        <article className="break-words overflow-hidden">
                          <p className="font-medium">{file?.fileName}</p>
                        </article>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center mx-1 text-primary hover:font-bold cursor-pointer">
                    {checkIfFileIsImage(file?.fileName) ? (
                      <img
                        src={file?.originalSource}
                        className="w-43 h-8"
                      ></img>
                    ) : (
                      <img
                        src="/src/assets/images/file.png"
                        className="w-43 h-8"
                      ></img>
                    )}
                  </div>
                </li>
              </ul>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
