/**
 * Project and Member type definitions for multi-tenant project isolation
 */

export interface Member {
  userId: string;
  role: 'owner' | 'developer' | 'viewer';
}

export interface Project {
  id: string;
  name: string;
  apiKey: string;
  sites: string[];
  members: Member[];
  createdAt: string;
}

export interface CreateProjectRequest {
  name: string;
  sites?: string[];
  members?: Member[];
}

export interface UpdateProjectRequest {
  name?: string;
  sites?: string[];
}

export interface AddMemberRequest {
  userId: string;
  role: 'owner' | 'developer' | 'viewer';
}

export interface UpdateMemberRoleRequest {
  role: 'owner' | 'developer' | 'viewer';
}
