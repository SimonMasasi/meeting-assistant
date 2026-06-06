import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import toast from "react-hot-toast";
import { Button } from "@mui/material";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { loadingAtom } from "@/atoms/shared-atoms";
import {
  getStorageDir,
  pickStorageDir,
  setStorageDir,
} from "@/services/storage";

export function StorageSettings() {
  const [currentDir, setCurrentDir] = useState<string>("");
  const [_, setLoading] = useAtom(loadingAtom);

  async function refresh() {
    try {
      const dir = await getStorageDir();
      setCurrentDir(dir);
    } catch (err) {
      console.error("Failed to read storage folder", err);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function changeFolder() {
    try {
      const picked = await pickStorageDir(currentDir || undefined);
      if (!picked) return; // user cancelled
      setLoading(true);
      await setStorageDir(picked);
      setCurrentDir(picked);
      toast.success("Storage folder updated");
    } catch (err) {
      console.error("Failed to update storage folder", err);
      toast.error("Could not update storage folder");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-2">
      <h2 className="text-lg font-semibold text-slate-700">Storage Settings</h2>
      <p className="text-sm text-slate-500 mt-1">
        Choose where meeting attachments are saved. Files are stored under a{" "}
        <span className="font-medium">meeting-assistant</span> folder, organized
        per meeting. Defaults to your Downloads folder.
      </p>

      <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
        <FolderOutlinedIcon sx={{ color: "#3b82f6" }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Current folder
          </p>
          <p className="text-sm font-medium text-slate-700 truncate">
            {currentDir || "Loading…"}
          </p>
        </div>
        <Button
          variant="contained"
          onClick={changeFolder}
          sx={{
            background: "linear-gradient(135deg, #3b82f6 0%, #1255e7 100%)",
            borderRadius: "10px",
            textTransform: "none",
            fontWeight: 600,
            whiteSpace: "nowrap",
            "&:hover": {
              background: "linear-gradient(135deg, #4e7ad6 0%, #2663EB 100%)",
            },
          }}
        >
          Change folder
        </Button>
      </div>
    </div>
  );
}
