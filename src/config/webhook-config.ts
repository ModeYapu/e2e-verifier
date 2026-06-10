/**
 * Webhook configuration management
 * Handles loading, saving, and managing webhook configurations
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Webhook configuration interface
 */
export interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: ('job.completed' | 'job.failed' | 'job.started')[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Webhook configuration manager
 */
export class WebhookConfigManager {
  private configs: Map<string, WebhookConfig> = new Map();
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), 'data', 'webhooks.json');
    this.load();
  }

  /**
   * Load webhook configurations from file
   */
  load(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const configs = JSON.parse(data) as WebhookConfig[];

        this.configs.clear();
        for (const config of configs) {
          // Convert date strings back to Date objects
          config.createdAt = new Date(config.createdAt);
          config.updatedAt = new Date(config.updatedAt);
          this.configs.set(config.id, config);
        }

        console.log(`[WebhookConfig] Loaded ${this.configs.size} webhook configs`);
      } else {
        // Initialize with empty array
        this.save();
        console.log('[WebhookConfig] Initialized empty webhook config file');
      }
    } catch (error) {
      console.error('[WebhookConfig] Error loading webhook configs:', error);
      this.configs.clear();
    }
  }

  /**
   * Save webhook configurations to file
   */
  save(): void {
    try {
      const configs = Array.from(this.configs.values());
      fs.writeFileSync(this.configPath, JSON.stringify(configs, null, 2));
      console.log(`[WebhookConfig] Saved ${configs.length} webhook configs`);
    } catch (error) {
      console.error('[WebhookConfig] Error saving webhook configs:', error);
      throw error;
    }
  }

  /**
   * Get all webhook configurations
   */
  getAll(): WebhookConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Get webhook configuration by ID
   */
  get(id: string): WebhookConfig | undefined {
    return this.configs.get(id);
  }

  /**
   * Create a new webhook configuration
   */
  create(url: string, secret: string, events: ('job.completed' | 'job.failed' | 'job.started')[], enabled: boolean = true): WebhookConfig {
    const id = crypto.randomUUID();
    const now = new Date();

    const config: WebhookConfig = {
      id,
      url,
      secret,
      events,
      enabled,
      createdAt: now,
      updatedAt: now
    };

    this.configs.set(id, config);
    this.save();

    console.log(`[WebhookConfig] Created webhook config: ${id}`);
    return config;
  }

  /**
   * Update an existing webhook configuration
   */
  update(id: string, updates: Partial<Omit<WebhookConfig, 'id' | 'createdAt'>>): WebhookConfig | null {
    const config = this.configs.get(id);
    if (!config) {
      return null;
    }

    const updatedConfig: WebhookConfig = {
      ...config,
      ...updates,
      id,
      createdAt: config.createdAt,
      updatedAt: new Date()
    };

    this.configs.set(id, updatedConfig);
    this.save();

    console.log(`[WebhookConfig] Updated webhook config: ${id}`);
    return updatedConfig;
  }

  /**
   * Delete a webhook configuration
   */
  delete(id: string): boolean {
    const deleted = this.configs.delete(id);
    if (deleted) {
      this.save();
      console.log(`[WebhookConfig] Deleted webhook config: ${id}`);
    }
    return deleted;
  }

  /**
   * Get enabled webhook configurations for a specific event
   */
  getEnabledForEvent(event: 'job.completed' | 'job.failed' | 'job.started'): WebhookConfig[] {
    return this.getAll().filter(
      config => config.enabled && config.events.includes(event)
    );
  }

  /**
   * Validate webhook configuration
   */
  static validate(config: Partial<WebhookConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.url || typeof config.url !== 'string') {
      errors.push('URL is required and must be a string');
    } else {
      try {
        new URL(config.url);
      } catch {
        errors.push('URL must be a valid URL');
      }
    }

    if (!config.secret || typeof config.secret !== 'string') {
      errors.push('Secret is required and must be a string');
    } else if (config.secret.length < 8) {
      errors.push('Secret must be at least 8 characters long');
    }

    if (!config.events || !Array.isArray(config.events)) {
      errors.push('Events must be an array');
    } else {
      const validEvents = ['job.completed', 'job.failed', 'job.started'];
      const invalidEvents = config.events.filter(event => !validEvents.includes(event));
      if (invalidEvents.length > 0) {
        errors.push(`Invalid events: ${invalidEvents.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}