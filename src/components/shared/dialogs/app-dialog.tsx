import * as React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

type AppDialogProps = {
  open: boolean;
  onclose: (x?: boolean) => void | any;
  title?: string;
  dialogContent?: React.ReactElement;
  size?:"xs" | "sm" | "md" | "lg" | "xl"
};

export default function AppDialog(props: AppDialogProps) {
  const handleClose = () => {
    props.onclose(false);
  };

  return (
    <React.Fragment>
      <Dialog
        onClose={handleClose}
        aria-labelledby="customized-dialog-title"
        open={props.open}
        className="w-full"
        fullWidth={true}
        maxWidth={props?.size ?? "md"}
      >
        <DialogTitle sx={{ m: 0, p: 2 }} id="customized-dialog-title">
          {props.title ?? "Title"}
        </DialogTitle>
        <IconButton
          aria-label="close"
          onClick={handleClose}
          sx={(theme) => ({
            position: "absolute",
            right: 8,
            top: 8,
            color: theme.palette.grey[500],
          })}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent>{props.dialogContent}</DialogContent>
      </Dialog>
    </React.Fragment>
  );
}
