/**
 * Experience Store API Routes
 *
 * API endpoints for accessing experience store functionality
 */

import express, { Request, Response } from 'express';
import { IntelligentOrchestrator } from '../../intelligence/orchestrator';

const router = express.Router();

/**
 * GET /api/experiences
 * Query experiences from the experience store
 * Query params:
 * - signature: Problem signature to filter
 * - siteName: Site name to filter
 * - outcome: Outcome to filter (success/failure/partial)
 * - minReward: Minimum reward
 * - limit: Maximum number of results
 * - strategy: Strategy to filter
 */
router.get('/experiences', (req: Request, res: Response) => {
  try {
    const orchestrator = req.app.get('orchestrator') as IntelligentOrchestrator;

    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not initialized' });
    }

    const experiences = orchestrator.queryExperiences({
      signature: req.query.signature as string,
      siteName: req.query.siteName as string,
      outcome: req.query.outcome as any,
      minReward: req.query.minReward ? parseFloat(req.query.minReward as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      strategy: req.query.strategy as string,
    });

    res.json({
      experiences,
      count: experiences.length,
    });
  } catch (error) {
    console.error('Error querying experiences:', error);
    res.status(500).json({ error: 'Failed to query experiences' });
  }
});

/**
 * GET /api/experiences/stats
 * Get experience statistics
 * Query params:
 * - site: Site name to filter (optional)
 */
router.get('/experiences/stats', (req: Request, res: Response) => {
  try {
    const orchestrator = req.app.get('orchestrator') as IntelligentOrchestrator;

    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not initialized' });
    }

    const siteName = req.query.site as string | undefined;
    const stats = orchestrator.getExperienceStatistics(siteName);

    if (!stats) {
      return res.status(500).json({ error: 'Experience store not enabled' });
    }

    res.json(stats);
  } catch (error) {
    console.error('Error getting experience statistics:', error);
    res.status(500).json({ error: 'Failed to get experience statistics' });
  }
});

/**
 * GET /api/experiences/similar
 * Query similar experiences by URL
 * Query params:
 * - url: URL to find similar experiences for
 * - topK: Number of similar experiences to return (default: 5)
 */
router.get('/experiences/similar', (req: Request, res: Response) => {
  try {
    const orchestrator = req.app.get('orchestrator') as IntelligentOrchestrator;

    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not initialized' });
    }

    const experienceStore = orchestrator.getExperienceStore();

    if (!experienceStore) {
      return res.status(500).json({ error: 'Experience store not enabled' });
    }

    const url = req.query.url as string;
    const topK = req.query.topK ? parseInt(req.query.topK as string) : 5;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Generate signature from URL
    const signature = experienceStore.generateSignature({ url });
    const similarExperiences = experienceStore.querySimilar(signature, topK);

    res.json({
      url,
      signature,
      similarExperiences,
      count: similarExperiences.length,
    });
  } catch (error) {
    console.error('Error querying similar experiences:', error);
    res.status(500).json({ error: 'Failed to query similar experiences' });
  }
});

/**
 * GET /api/experiences/suggestions
 * Get improvement suggestions
 * Query params:
 * - site: Site name to get suggestions for (optional)
 */
router.get('/experiences/suggestions', async (req: Request, res: Response) => {
  try {
    const orchestrator = req.app.get('orchestrator') as IntelligentOrchestrator;

    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not initialized' });
    }

    const siteName = req.query.site as string | undefined;
    const suggestions = await orchestrator.getImprovementSuggestions(siteName);

    if (!suggestions) {
      return res.status(500).json({ error: 'Self-evaluation engine not enabled' });
    }

    res.json(suggestions);
  } catch (error) {
    console.error('Error getting improvement suggestions:', error);
    res.status(500).json({ error: 'Failed to get improvement suggestions' });
  }
});

/**
 * GET /api/experiences/strategies
 * Get strategy effectiveness and weights
 */
router.get('/experiences/strategies', (req: Request, res: Response) => {
  try {
    const orchestrator = req.app.get('orchestrator') as IntelligentOrchestrator;

    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not initialized' });
    }

    const selfEvalEngine = orchestrator.getSelfEvalEngine();

    if (!selfEvalEngine) {
      return res.status(500).json({ error: 'Self-evaluation engine not enabled' });
    }

    const strategyWeights = selfEvalEngine.getStrategyWeights();
    const experienceStore = orchestrator.getExperienceStore();

    if (!experienceStore) {
      return res.status(500).json({ error: 'Experience store not enabled' });
    }

    const stats = experienceStore.getStats();
    const strategies = Array.from(strategyWeights.values()).map(weight => ({
      ...weight,
      effectiveness: stats.byStrategy[weight.strategy] || null,
    }));

    res.json({
      strategies,
      count: strategies.length,
    });
  } catch (error) {
    console.error('Error getting strategy information:', error);
    res.status(500).json({ error: 'Failed to get strategy information' });
  }
});

/**
 * DELETE /api/experiences
 * Clear all experiences (use with caution)
 */
router.delete('/experiences', (req: Request, res: Response) => {
  try {
    const orchestrator = req.app.get('orchestrator') as IntelligentOrchestrator;

    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not initialized' });
    }

    const experienceStore = orchestrator.getExperienceStore();

    if (!experienceStore) {
      return res.status(500).json({ error: 'Experience store not enabled' });
    }

    experienceStore.clear();

    res.json({
      message: 'All experiences cleared',
      count: experienceStore.getCount(),
    });
  } catch (error) {
    console.error('Error clearing experiences:', error);
    res.status(500).json({ error: 'Failed to clear experiences' });
  }
});

export default router;