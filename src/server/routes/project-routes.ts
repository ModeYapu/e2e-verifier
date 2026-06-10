/**
 * Project Routes
 * Handles all project management endpoints
 */

import { Router, Request, Response } from 'express';
import { ProjectService } from '../services/project-service';

export function createProjectRoutes(projectService: ProjectService): Router {
  const router = Router();

  /**
   * Extract string parameter from request params
   */
  function extractParam(params: any, key: string): string {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  }

  /**
   * POST /api/admin/projects - Create a new project
   */
  router.post('/admin/projects', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body;

      if (!body.name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }

      const project = projectService.createProject(body);

      res.status(201).json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal server error' });
    }
  });

  /**
   * GET /api/admin/projects - List all projects
   */
  router.get('/admin/projects', async (req: Request, res: Response): Promise<void> => {
    try {
      const projects = projectService.getAllProjects();

      res.json({
        success: true,
        data: projects,
        count: projects.length
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/admin/projects/:id - Get project by ID
   */
  router.get('/admin/projects/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = extractParam(req.params, 'id');

      const project = projectService.getProject(id);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * PUT /api/admin/projects/:id - Update project
   */
  router.put('/admin/projects/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = extractParam(req.params, 'id');
      const body = req.body;

      const project = projectService.updateProject(id, body);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * DELETE /api/admin/projects/:id - Delete project
   */
  router.delete('/admin/projects/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = extractParam(req.params, 'id');

      const deleted = projectService.deleteProject(id);

      if (!deleted) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        message: 'Project deleted successfully'
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * POST /api/admin/projects/:id/sites - Add site to project
   */
  router.post('/admin/projects/:id/sites', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = extractParam(req.params, 'id');
      const { siteName } = req.body;

      if (!siteName) {
        res.status(400).json({ error: 'siteName is required' });
        return;
      }

      const project = projectService.addSite(id, siteName);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * DELETE /api/admin/projects/:id/sites/:siteName - Remove site from project
   */
  router.delete('/admin/projects/:id/sites/:siteName', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = extractParam(req.params, 'id');
      const siteName = extractParam(req.params, 'siteName');

      const project = projectService.removeSite(id, siteName);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * POST /api/admin/projects/:id/members - Add member to project
   */
  router.post('/admin/projects/:id/members', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = extractParam(req.params, 'id');
      const { userId, role } = req.body;

      if (!userId || !role) {
        res.status(400).json({ error: 'userId and role are required' });
        return;
      }

      if (!['owner', 'developer', 'viewer'].includes(role)) {
        res.status(400).json({ error: 'role must be owner, developer, or viewer' });
        return;
      }

      const project = projectService.addMember(id, userId, role);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * DELETE /api/admin/projects/:id/members/:userId - Remove member from project
   */
  router.delete('/admin/projects/:id/members/:userId', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = extractParam(req.params, 'id');
      const userId = extractParam(req.params, 'userId');

      const project = projectService.removeMember(id, userId);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * PATCH /api/admin/projects/:id/members/:userId - Update member role
   */
  router.patch('/admin/projects/:id/members/:userId', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = extractParam(req.params, 'id');
      const userId = extractParam(req.params, 'userId');
      const { role } = req.body;

      if (!role) {
        res.status(400).json({ error: 'role is required' });
        return;
      }

      if (!['owner', 'developer', 'viewer'].includes(role)) {
        res.status(400).json({ error: 'role must be owner, developer, or viewer' });
        return;
      }

      const project = projectService.updateMemberRole(id, userId, role);

      if (!project) {
        res.status(404).json({ error: 'Project or member not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
