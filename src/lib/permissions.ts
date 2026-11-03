export type OrgRole = 'owner' | 'admin' | 'organizer' | 'scanner'

export type OrgAction =
  | 'org.view'
  | 'events.manage'
  | 'orders.review'
  | 'checkin.scan'
  | 'team.manage'
  | 'org.settings'

const ROLE_ACTIONS: Record<OrgRole, OrgAction[]> = {
  owner: ['org.view', 'events.manage', 'orders.review', 'checkin.scan', 'team.manage', 'org.settings'],
  admin: ['org.view', 'events.manage', 'orders.review', 'checkin.scan', 'team.manage', 'org.settings'],
  organizer: ['org.view', 'events.manage', 'orders.review', 'checkin.scan'],
  scanner: ['org.view', 'checkin.scan'],
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  organizer: 'Organizer',
  scanner: 'Gate scanner',
}

export function can(role: OrgRole, action: OrgAction) {
  return ROLE_ACTIONS[role].includes(action)
}
