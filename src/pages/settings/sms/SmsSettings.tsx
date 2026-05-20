import DataTable from "@/components/shared/tables/DataTableMain";
import { smsColumns, SmsData } from "./SmsTypes";
import { DataTableActions } from "@/interfaces/SharedInterfaces";
import { Add, Delete, Edit } from "@mui/icons-material";
import { Button } from "@mui/material";
import AppDialog from "@/components/shared/dialogs/appDialog";
import { useState } from "react";
import { smsFields } from "./smsFields";
import { DynamicFormMain } from "@/components/dynamic-forms/DynamicFormMain";
import toast from "react-hot-toast";
import { useAtom } from "jotai";
import { loadingAtom } from "@/atoms/sharedAtoms";

const rows: SmsData[] = [
  {
    name: "2024-09-28",
    last: 123233434,
    lastf: {
      name: "masasi",
      value: "valuemasa",
    },
    lastd: "fhdbhvbcjh",
  },
  {
    name: "2024-09-28",
    last: 123233434,
    lastf: {
      name: "masasi",
      value: "valuemasa",
    },
    lastd: "fhdbhvbcjh",
  },
];

export function SmsSettings() {
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [defaultValues, setDefaultValues] = useState({});
  const [_, setLoading] = useAtom(loadingAtom);

  const actions: DataTableActions[] = [
    {
      title: "Edit",
      icon: <Edit className="text-blue-400" />,
      calBackFunction: (data) => editItemAdd(data),
    },
    {
      title: "Delete",
      icon: <Delete className="text-red-400" />,
      calBackFunction: (data) => editItemAdd(data),
    },
  ];

  const handleClose = () => {
    setDialogOpen(false);
  };

  const editItemAdd = (data: any) => {
    setDefaultValues(data);
    setDialogOpen(true);
  };

  async function submitData(data: any) {
    setLoading(true);

    await new Promise((resolveOuter) => {
      resolveOuter(
        new Promise((resolveInner) => {
          setTimeout(resolveInner, 1000);
        })
      );
    });

    setLoading(false);
    console.log(data);

    toast.success("success");
  }

  return (
    <div>
      <AppDialog
        open={dialogOpen}
        onclose={handleClose}
        title={
          Object.keys(defaultValues)?.length > 0 ? "Edit item" : "Create Item"
        }
        dialogContent={
          <DynamicFormMain
            formFields={smsFields}
            handleSubmit={submitData}
            defaultValues={defaultValues}
          />
        }
      />
      <div className="flex justify-end my-2">
        <Button variant="contained" onClick={() => editItemAdd({})}>
          <Add className="mx-2" /> Add{" "}
        </Button>
      </div>

      <DataTable rows={rows} columns={smsColumns} actions={actions} />
    </div>
  );
}
