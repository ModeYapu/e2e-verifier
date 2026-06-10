/**
 * Project Service
 * Handles project CRUD operations using ProjectStore
 */

import { ProjectStore } from '../../projects/project-store';
import { Project, CreateProjectRequest, UpdateProjectRequest } from '../../projects/types';

export class ProjectService {
  /**
   * Create a new project
   */
  createProject(request: CreateProjectRequest): Project {
    if (!request.name) {
      throw new Error('name is required');
    }
    return ProjectStore.create(request);
  }

  /**
   * Get all projects
   */
  getAllProjects(): Project[] {
    return ProjectStore.getAll();
  }

  /**
   * Get project by ID
   */
  getProject(id: string): Project | undefined {
    return ProjectStore.getById(id);
  }

  /**
   * Update project
   */
  updateProject(id: string, request: UpdateProjectRequest): Project | undefined {
    return ProjectStore.update(id, request);
  }

  /**
   * Delete project
   */
  deleteProject(id: string): boolean {
    return ProjectStore.delete(id);
  }

  /**
   * Add site to project
   */
  addSite(id: string, siteName: string): Project | undefined {
    if (!siteName) {
      throw new Error('siteName is required');
    }
    return ProjectStore.addSite(id, siteName);
  }

  /**
   * Remove site from project
   */
  removeSite(id: string, siteName: string): Project | undefined {
    return ProjectStore.removeSite(id, siteName);
  }

  /**
   * Add member to project
   */
  addMember(id: string, userId: string, role: string): Project | undefined {
    if (!userId || !role) {
      throw new Error('userId and role are required');
    }

    if (!['owner', 'developer', 'viewer'].includes(role)) {
      throw new Error('role must be owner, developer, or viewer');
    }

    return ProjectStore.addMember(id, userId, role as 'owner' | 'developer' | 'viewer');
  }

  /**
   * Remove member from project
   */
  removeMember(id: string, userId: string): Project | undefined {
    return ProjectStore.removeMember(id, userId);
  }

  /**
   * Update member role
   */
  updateMemberRole(id: string, userId: string, role: string): Project | undefined {
    if (!role) {
      throw new Error('role is required');
    }

    if (!['owner', 'developer', 'viewer'].includes(role)) {
      throw new Error('role must be owner, developer, or viewer');
    }

    return ProjectStore.updateMemberRole(id, userId, role as 'owner' | 'developer' | 'viewer');
  }

  /**
   * Get all projects (static method)
   */
  static getAll(): Project[] {
    return ProjectStore.getAll();
  }
}
