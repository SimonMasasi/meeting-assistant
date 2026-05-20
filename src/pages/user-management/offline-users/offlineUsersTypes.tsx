import { DataTableColumns } from "@/interfaces/SharedInterfaces";

export interface OfflineUser {
  uniqueId: string;
  id: number;
  createdOn: string;
  userId: number;
  userFingerId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  institution: Institution | null;
}

export interface Institution {
  uniqueId: string;
  id: number;
  createdOn: string;
  institutionName: string;
  institutionId: string;
  institutionAddress: string;
  institutionThreshHoldTime: string;
  institutionExtraHoursStarts: string;
}

export const offlineUsersColumns: DataTableColumns[] = [
  {
    id: "firstName",
    label: "First Name",
    minWidth: 170,
  },
  {
    id: "lastName",
    label: "Last Name",
    minWidth: 100,
  },
  {
    id: "email",
    label: "Email",
    minWidth: 100,
  },
];
