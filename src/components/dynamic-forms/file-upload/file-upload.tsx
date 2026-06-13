import { FieldEros } from "@/interfaces/shared-interfaces";
import { useState } from "react";
import { Accept, useDropzone } from "react-dropzone";
import { FieldValues, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { useRef } from "react";
import { checkIfFileIsImage, fileToBase64 } from "@/utils/helper-functions";
import CloseIcon from "@mui/icons-material/Close";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";

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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
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
    <section className="my-2 intro-x">
      <div
        {...getRootProps()}
        className={`flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer group ${
          isDragActive
            ? "border-primary-500 bg-primary-50 scale-[1.01]"
            : "border-primary-300 bg-primary-50/30 hover:bg-primary-50 hover:border-primary-400"
        }`}
      >
        <input
          {...props.registerFunction(props.keyValue, {})}
          type="file"
          name="file"
          style={{ opacity: 0, display: "none" }}
          ref={hiddenInputRef}
        />
        <input {...getInputProps()} />
        <CloudUploadOutlinedIcon
          sx={{ fontSize: 44, color: isDragActive ? "#3b82f6" : "#3b82f6" }}
          className="transition-transform duration-200 group-hover:scale-110"
        />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            <span className="text-primary-400 font-semibold">Click to upload</span>{" "}
            or drag and drop
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {props.label}
            {props.required ? " *" : ""}
          </p>
        </div>
      </div>

      {filesDrooped?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Selected Files
          </p>
          <div
            className={`grid gap-2 ${
              props.multiple ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {filesDrooped.map((file, key) => (
              <div
                key={key}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center overflow-hidden">
                  {checkIfFileIsImage(file?.fileName) ? (
                    <img
                      src={file?.originalSource}
                      className="w-full h-full object-cover"
                      alt={file?.fileName}
                    />
                  ) : (
                    <InsertDriveFileOutlinedIcon
                      sx={{ fontSize: 20, color: "#3b82f6" }}
                    />
                  )}
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">
                  {file?.fileName}
                </p>
                <button
                  type="button"
                  onClick={() => removeFileFromList(file)}
                  className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}


