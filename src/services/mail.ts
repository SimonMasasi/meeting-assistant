import { invoke } from "@tauri-apps/api/core";

export type MailEncryption = "ssl" | "tls" | "starttls" | "none";

export interface MailSettings {
  sender_name: string;
  sender_email: string;
  smtp_host: string;
  smtp_port: number;
  username: string;
  password: string;
  encryption: MailEncryption;
  reply_to: string;
}

/** The saved outgoing mail settings (empty defaults when never configured). */
export const getMailSettings = () => invoke<MailSettings>("get_mail_settings");

/** Persist the user's outgoing mail settings. */
export const setMailSettings = (settings: MailSettings) =>
  invoke<void>("set_mail_settings", { settings });
