/**
 * Project Store - CRUD operations for multi-tenant project management
 */

import * as path from 'path';
import { Project, Member, CreateProjectRequest, UpdateProjectRequest } from './types';
import { JsonStorage } from '../storage/json-storage';
import { logger } from '../utils/logger';

const PROJECTS_FILE = 'projects';
const STORAGE_DIR = path.join(process.cwd(), 'data');

// Initialize storage
const storage = new JsonStorage({
  storageDir: STORAGE_DIR,
  fileExtension: '.json',
  createDir: true,
});

function loadProjects(): Project[] {
  try {
    const projects = storage.get(PROJECTS_FILE) as Project[] | null;
    return projects || [];
  } catch (e) {
    logger.error(`Failed to load projects: ${e}`);
    return [];
  }
}

function saveProjects(projects: Project[]): void {
  storage.set(PROJECTS_FILE, projects);
}

export class ProjectStore {
  /**
   * Create a new project
   */
  static create(request: CreateProjectRequest): Project {
    const projects = loadProjects();

    const project: Project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: request.name,
      apiKey: `ev_proj_${Date.now()}_${Math.random().toString(36).slice(2, 16)}`,
      sites: request.sites || [],
      members: request.members || [],
      createdAt: new Date().toISOString()
    };

    projects.push(project);
    saveProjects(projects);

    return project;
  }

  /**
   * Get all projects
   */
  static getAll(): Project[] {
    return loadProjects();
  }

  /**
   * Get project by ID
   */
  static getById(id: string): Project | null {
    const projects = loadProjects();
    return projects.find(p => p.id === id) || null;
  }

  /**
   * Find project by API key
   */
  static findByApiKey(apiKey: string): Project | null {
    const projects = loadProjects();
    return projects.find(p => p.apiKey === apiKey) || null;
  }

  /**
   * Update project
   */
  static update(id: string, updates: UpdateProjectRequest): Project | null {
    const projects = loadProjects();
    const idx = projects.findIndex(p => p.id === id);

    if (idx === -1) return null;

    if (updates.name !== undefined) {
      projects[idx].name = updates.name;
    }

    if (updates.sites !== undefined) {
      projects[idx].sites = updates.sites;
    }

    saveProjects(projects);
    return projects[idx];
  }

  /**
   * Delete project
   */
  static delete(id: string): boolean {
    const projects = loadProjects();
    const idx = projects.findIndex(p => p.id === id);

    if (idx === -1) return false;

    projects.splice(idx, 1);
    saveProjects(projects);
    return true;
  }

  /**
   * Add site to project
   */
  static addSite(projectId: string, siteName: string): Project | null {
    const projects = loadProjects();
    const idx = projects.findIndex(p => p.id === projectId);

    if (idx === -1) return null;

    if (!projects[idx].sites.includes(siteName)) {
      projects[idx].sites.push(siteName);
      saveProjects(projects);
    }

    return projects[idx];
  }

  /**
   * Remove site from project
   */
  static removeSite(projectId: string, siteName: string): Project | null {
    const projects = loadProjects();
    const idx = projects.findIndex(p => p.id === projectId);

    if (idx === -1) return null;

    const siteIdx = projects[idx].sites.indexOf(siteName);
    if (siteIdx > -1) {
      projects[idx].sites.splice(siteIdx, 1);
      saveProjects(projects);
    }

    return projects[idx];
  }

  /**
   * Add member to project
   */
  static addMember(projectId: string, userId: string, role: Member['role']): Project | null {
    const projects = loadProjects();
    const idx = projects.findIndex(p => p.id === projectId);

    if (idx === -1) return null;

    // Check if member already exists
    const existingMemberIdx = projects[idx].members.findIndex(m => m.userId === userId);
    if (existingMemberIdx > -1) {
      // Update role if member exists
      projects[idx].members[existingMemberIdx].role = role;
    } else {
      // Add new member
      projects[idx].members.push({ userId, role });
    }

    saveProjects(projects);
    return projects[idx];
  }

  /**
   * Remove member from project
   */
  static removeMember(projectId: string, userId: string): Project | null {
    const projects = loadProjects();
    const idx = projects.findIndex(p => p.id === projectId);

    if (idx === -1) return null;

    const memberIdx = projects[idx].members.findIndex(m => m.userId === userId);
    if (memberIdx > -1) {
      projects[idx].members.splice(memberIdx, 1);
      saveProjects(projects);
    }

    return projects[idx];
  }

  /**
   * Update member role
   */
  static updateMemberRole(projectId: string, userId: string, role: Member['role']): Project | null {
    const projects = loadProjects();
    const idx = projects.findIndex(p => p.id === projectId);

    if (idx === -1) return null;

    const memberIdx = projects[idx].members.findIndex(m => m.userId === userId);
    if (memberIdx === -1) return null;

    projects[idx].members[memberIdx].role = role;
    saveProjects(projects);

    return projects[idx];
  }
}
