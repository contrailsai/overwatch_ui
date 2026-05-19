/** Roles that can add, edit, and remove project team members on the admin dashboard. */
export const TEAM_MANAGER_ROLES = ['client-admin', 'reviewer']

export function canManageTeamMembers(permission) {
  return TEAM_MANAGER_ROLES.includes(permission)
}
