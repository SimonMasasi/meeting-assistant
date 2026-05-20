import DataTable from "@/components/shared/tables/DataTableMain";
import { getOfflineUsers } from "./offlineUsersHooks";
import { offlineUsersColumns } from "./offlineUsersTypes";
import { useAtom } from "jotai";
import { offlineUsersAtom } from "@/atoms/UserAtoms";
import { useEffect } from "react";
import { tableLoadingAtom } from "@/atoms/sharedAtoms";

export function OfflineUsers() {
  const [offlineUsers, setOfflineUsers] = useAtom(offlineUsersAtom);
  const [_, setLoading] = useAtom(tableLoadingAtom);

  useEffect(() => {
    const getUsers = async () => {
      setLoading(true);
      const results = await getOfflineUsers();
      setLoading(false);
      setOfflineUsers(results);
    };

    getUsers();
  }, []);

  return (
    <div>
      <DataTable rows={offlineUsers} columns={offlineUsersColumns} />
    </div>
  );
}
