import { UserManagementView } from "./UserManagementView.jsx";

export function OfficeUsersView({ canManage, showToast }) {
  return <UserManagementView canManage={canManage} role="office_user" showToast={showToast} />;
}
