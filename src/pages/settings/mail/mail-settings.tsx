import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import toast from "react-hot-toast";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import { loadingAtom } from "@/atoms/shared-atoms";
import { DynamicFormMain } from "@/components/dynamic-forms/dynamic-form-main";
import {
  DynamicInterface,
  FieldType,
} from "@/interfaces/dynamic-form-interfaces";
import { FieldSize } from "@/interfaces/shared-interfaces";
import {
  getMailSettings,
  setMailSettings,
  MailSettings as MailSettingsModel,
} from "@/services/mail";

const formFields: DynamicInterface[] = [
  {
    key: "sender_name",
    label: "Sender Name",
    type: FieldType.input,
    inputType: "text",
    required: false,
    size: FieldSize.medium,
  },
  {
    key: "sender_email",
    label: "From Email",
    type: FieldType.input,
    inputType: "email",
    required: true,
    size: FieldSize.medium,
    validations: [{ name: "required", message: "From email is required" }],
  },
  {
    key: "smtp_host",
    label: "SMTP Host",
    type: FieldType.input,
    inputType: "text",
    required: true,
    size: FieldSize.medium,
    validations: [{ name: "required", message: "SMTP host is required" }],
  },
  {
    key: "smtp_port",
    label: "SMTP Port",
    type: FieldType.input,
    inputType: "number",
    required: true,
    size: FieldSize.medium,
    validations: [{ name: "required", message: "SMTP port is required" }],
  },
  {
    key: "username",
    label: "Username",
    type: FieldType.input,
    inputType: "text",
    required: true,
    size: FieldSize.medium,
    validations: [{ name: "required", message: "Username is required" }],
  },
  {
    key: "password",
    label: "Password",
    type: FieldType.input,
    inputType: "password",
    required: true,
    size: FieldSize.medium,
    validations: [{ name: "required", message: "Password is required" }],
  },
  {
    key: "encryption",
    label: "Encryption",
    type: FieldType.normalSelect,
    required: true,
    size: FieldSize.medium,
    selectValues: [
      { key: "ssl", label: "SSL" },
      { key: "tls", label: "TLS" },
      { key: "starttls", label: "STARTTLS" },
      { key: "none", label: "None" },
    ],
    selectKeyValue: "key",
    selectLabel: "label",
  },
  {
    key: "reply_to",
    label: "Reply-To",
    type: FieldType.input,
    inputType: "email",
    required: false,
    size: FieldSize.large,
  },
];

const emptySettings: MailSettingsModel = {
  sender_name: "",
  sender_email: "",
  smtp_host: "",
  smtp_port: 587,
  username: "",
  password: "",
  encryption: "tls",
  reply_to: "",
};

export function MailSettings() {
  const [settings, setSettings] = useState<MailSettingsModel | null>(null);
  const [_, setLoading] = useAtom(loadingAtom);

  async function refresh() {
    try {
      const saved = await getMailSettings();
      // The backend returns zeroed defaults when nothing is configured yet.
      setSettings({
        ...saved,
        smtp_port: saved.smtp_port || 587,
        encryption: saved.encryption || "tls",
      });
    } catch (err) {
      console.error("Failed to read mail settings", err);
      setSettings(emptySettings);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const isConfigured = !!settings?.sender_email && !!settings?.smtp_host;

  async function handleSubmit(data: any) {
    // The dynamic select may hand back the option object, its key, or "" when
    // left untouched — normalize to the key, falling back to the loaded value.
    const enc = data.encryption;
    const encryption = ((typeof enc === "object" && enc ? enc.key : enc) ||
      settings?.encryption ||
      "tls") as MailSettingsModel["encryption"];

    const payload: MailSettingsModel = {
      sender_name: data.sender_name?.trim() ?? "",
      sender_email: data.sender_email?.trim() ?? "",
      smtp_host: data.smtp_host?.trim() ?? "",
      smtp_port: Number(data.smtp_port) || 0,
      username: data.username?.trim() ?? "",
      password: data.password ?? "",
      encryption,
      reply_to: data.reply_to?.trim() ?? "",
    };

    try {
      setLoading(true);
      await setMailSettings(payload);
      setSettings(payload);
      toast.success("Mail settings saved");
    } catch (err) {
      console.error("Failed to save mail settings", err);
      toast.error("Could not save mail settings");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-2">
      <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Mail Settings</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Configure the outgoing mail server used to send meeting emails and
        invites. Credentials are stored locally on this device.
      </p>

      {/* Summary card */}
      <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
          <MailOutlinedIcon sx={{ color: "#3b82f6" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Outgoing mail
          </p>
          {isConfigured ? (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
              {settings?.sender_email}{" "}
              <span className="text-slate-400 dark:text-slate-500">·</span> {settings?.smtp_host}
              {settings?.smtp_port ? `:${settings.smtp_port}` : ""}
            </p>
          ) : (
            <p className="text-sm font-medium text-slate-400 dark:text-slate-500">
              Not configured yet
            </p>
          )}
        </div>
        {isConfigured && (
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
            Active
          </span>
        )}
      </div>

      {/* Settings form */}
      <div className="mt-5 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
          SMTP Configuration
        </h3>
        {settings ? (
          <DynamicFormMain
            formFields={formFields}
            defaultValues={settings}
            handleSubmit={handleSubmit}
          />
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
        )}
      </div>
    </div>
  );
}
