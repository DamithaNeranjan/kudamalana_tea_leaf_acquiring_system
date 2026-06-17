import { UserManagementView } from "./UserManagementView.jsx";

export function DirectorsView({ canManage, showToast }) {
  return <UserManagementView canManage={canManage} role="director" showToast={showToast} />;
}
