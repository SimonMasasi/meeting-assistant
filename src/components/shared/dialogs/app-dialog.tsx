import * as React from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Slide from "@mui/material/Slide";
import Typography from "@mui/material/Typography";
import { TransitionProps } from "@mui/material/transitions";
import CloseIcon from "@mui/icons-material/Close";

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement<any> },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

type AppDialogProps = {
  open: boolean;
  onclose: (x?: boolean) => void | any;
  title?: string;
  dialogContent?: React.ReactElement;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
};

export default function AppDialog(props: AppDialogProps) {
  const handleClose = () => {
    props.onclose(false);
  };

  return (
    <Dialog
      onClose={handleClose}
      aria-labelledby="app-dialog-title"
      open={props.open}
      fullWidth
      maxWidth={props?.size ?? "md"}
      slots={{ transition: Transition }}
      slotProps={{
        paper: {
          elevation: 8,
          sx: { borderRadius: 3 },
        },
        backdrop: {
          sx: {
            backdropFilter: "blur(4px)",
            backgroundColor: "rgba(0,0,0,0.4)",
          },
        },
      }}
    >
      <DialogTitle id="app-dialog-title" sx={{ px: 3, pt: 3, pb: 1.5 }}>
        <Typography variant="h6" fontWeight={700} component="span">
          {props.title ?? "Dialog"}
        </Typography>
        <IconButton
          aria-label="Close dialog"
          onClick={handleClose}
          size="small"
          sx={(theme) => ({
            position: "absolute",
            right: 12,
            top: 12,
            color: theme.palette.grey[500],
            transition: "color 0.2s, background-color 0.2s",
            "&:hover": {
              color: theme.palette.grey[900],
              backgroundColor: theme.palette.grey[100],
            },
          })}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ px: 3, py: 2.5 }}>
        {props.dialogContent}
      </DialogContent>
    </Dialog>
  );
}

