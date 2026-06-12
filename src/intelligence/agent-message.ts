/**
 * Agent Communication - Message passing between multi-agent system
 *
 * Supports:
 * - Message passing between agents
 * - Shared workspace for discoveries and results
 * - Message types for different communications
 */

/**
 * Simple UUID generator
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Message types for agent communication
 */
export type MessageType =
  | 'FEATURE_DISCOVERED'
  | 'TEST_COMPLETED'
  | 'ISSUE_FOUND'
  | 'REPAIR_SUGGESTED'
  | 'AGENT_READY'
  | 'AGENT_DONE'
  | 'AGENT_ERROR'
  | 'WORKSPACE_UPDATE';

/**
 * Agent message structure
 */
export interface AgentMessage {
  id: string;
  type: MessageType;
  fromRole: string;
  toRole?: string; // If undefined, broadcast to all
  timestamp: string;
  payload: unknown;
  correlationId?: string; // For message threading
  replyTo?: string; // For message threading
}

/**
 * Workspace entry for shared data
 */
export interface WorkspaceEntry {
  id: string;
  type: 'discovery' | 'result' | 'issue' | 'repair' | 'status';
  agentRole: string;
  data: unknown;
  timestamp: string;
  expiresAt?: string;
}

/**
 * Shared workspace for agents
 */
export class AgentWorkspace {
  private entries: Map<string, WorkspaceEntry> = new Map();
  private subscriptions: Map<MessageType, Set<string>> = new Map();

  /**
   * Add entry to workspace
   */
  addEntry(entry: Omit<WorkspaceEntry, 'id' | 'timestamp'>): string {
    const id = generateUUID();
    const workspaceEntry: WorkspaceEntry = {
      id,
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.entries.set(id, workspaceEntry);

    // Cleanup expired entries
    this.cleanupExpired();

    return id;
  }

  /**
   * Get entry by ID
   */
  getEntry(id: string): WorkspaceEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Get entries by type
   */
  getEntriesByType(type: WorkspaceEntry['type']): WorkspaceEntry[] {
    return Array.from(this.entries.values())
      .filter(entry => entry.type === type);
  }

  /**
   * Get entries by agent role
   */
  getEntriesByRole(agentRole: string): WorkspaceEntry[] {
    return Array.from(this.entries.values())
      .filter(entry => entry.agentRole === agentRole);
  }

  /**
   * Get recent entries
   */
  getRecentEntries(limit: number = 10): WorkspaceEntry[] {
    const entries = Array.from(this.entries.values())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return entries.slice(0, limit);
  }

  /**
   * Get all entries
   */
  getAllEntries(): WorkspaceEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Remove entry
   */
  removeEntry(id: string): boolean {
    return this.entries.delete(id);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Subscribe to message types
   */
  subscribe(roleId: string, messageType: MessageType): void {
    if (!this.subscriptions.has(messageType)) {
      this.subscriptions.set(messageType, new Set());
    }
    this.subscriptions.get(messageType)!.add(roleId);
  }

  /**
   * Unsubscribe from message types
   */
  unsubscribe(roleId: string, messageType: MessageType): void {
    const subscribers = this.subscriptions.get(messageType);
    if (subscribers) {
      subscribers.delete(roleId);
    }
  }

  /**
   * Get subscribers for message type
   */
  getSubscribers(messageType: MessageType): string[] {
    const subscribers = this.subscriptions.get(messageType);
    return subscribers ? Array.from(subscribers) : [];
  }

  /**
   * Cleanup expired entries
   */
  private cleanupExpired(): void {
    const now = new Date().toISOString();

    for (const [id, entry] of this.entries.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.entries.delete(id);
      }
    }
  }

  /**
   * Get workspace statistics
   */
  getStats(): {
    totalEntries: number;
    entriesByType: Record<string, number>;
    subscriptions: number;
  } {
    const entriesByType: Record<string, number> = {};

    for (const entry of this.entries.values()) {
      entriesByType[entry.type] = (entriesByType[entry.type] || 0) + 1;
    }

    return {
      totalEntries: this.entries.size,
      entriesByType,
      subscriptions: Array.from(this.subscriptions.values())
        .reduce((sum, set) => sum + set.size, 0),
    };
  }
}

/**
 * Message broker for agent communication
 */
export class MessageBroker {
  private workspace: AgentWorkspace;
  private messageHandlers: Map<string, (message: AgentMessage) => void> = new Map();
  private messageHistory: AgentMessage[] = [];

  constructor(workspace?: AgentWorkspace) {
    this.workspace = workspace || new AgentWorkspace();
  }

  /**
   * Send message from one agent to another
   */
  sendMessage(message: Omit<AgentMessage, 'id' | 'timestamp'>): string {
    const agentMessage: AgentMessage = {
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      ...message,
    };

    // Add to history
    this.messageHistory.push(agentMessage);

    // Add to workspace if it's a significant event
    if (this.isWorkspaceEvent(agentMessage.type)) {
      this.workspace.addEntry({
        type: this.getWorkspaceType(agentMessage.type),
        agentRole: agentMessage.fromRole,
        data: agentMessage.payload,
      });
    }

    // Route message
    this.routeMessage(agentMessage);

    return agentMessage.id;
  }

  /**
   * Register message handler for an agent
   */
  registerHandler(roleId: string, handler: (message: AgentMessage) => void): void {
    this.messageHandlers.set(roleId, handler);
  }

  /**
   * Unregister message handler
   */
  unregisterHandler(roleId: string): void {
    this.messageHandlers.delete(roleId);
  }

  /**
   * Get message history
   */
  getMessageHistory(limit?: number): AgentMessage[] {
    if (limit) {
      return this.messageHistory.slice(-limit);
    }
    return [...this.messageHistory];
  }

  /**
   * Get messages by type
   */
  getMessagesByType(type: MessageType): AgentMessage[] {
    return this.messageHistory.filter(msg => msg.type === type);
  }

  /**
   * Get conversation thread
   */
  getConversationThread(correlationId: string): AgentMessage[] {
    return this.messageHistory.filter(msg =>
      msg.correlationId === correlationId ||
      msg.id === correlationId ||
      msg.replyTo === correlationId
    );
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messageHistory = [];
  }

  /**
   * Get workspace
   */
  getWorkspace(): AgentWorkspace {
    return this.workspace;
  }

  /**
   * Route message to recipients
   */
  private routeMessage(message: AgentMessage): void {
    let recipients: string[] = [];

    if (message.toRole) {
      // Direct message to specific role
      recipients = [message.toRole];
    } else {
      // Broadcast to subscribers
      recipients = this.workspace.getSubscribers(message.type);
    }

    // Deliver to registered handlers
    for (const recipient of recipients) {
      const handler = this.messageHandlers.get(recipient);
      if (handler) {
        handler(message);
      }
    }
  }

  /**
   * Check if message type should be in workspace
   */
  private isWorkspaceEvent(type: MessageType): boolean {
    return ['FEATURE_DISCOVERED', 'TEST_COMPLETED', 'ISSUE_FOUND', 'REPAIR_SUGGESTED'].includes(type);
  }

  /**
   * Map message type to workspace type
   */
  private getWorkspaceType(messageType: MessageType): WorkspaceEntry['type'] {
    switch (messageType) {
      case 'FEATURE_DISCOVERED':
        return 'discovery';
      case 'TEST_COMPLETED':
        return 'result';
      case 'ISSUE_FOUND':
        return 'issue';
      case 'REPAIR_SUGGESTED':
        return 'repair';
      default:
        return 'status';
    }
  }

  /**
   * Get message statistics
   */
  getStats(): {
    totalMessages: number;
    messagesByType: Record<string, number>;
    registeredHandlers: number;
  } {
    const messagesByType: Record<string, number> = {};

    for (const msg of this.messageHistory) {
      messagesByType[msg.type] = (messagesByType[msg.type] || 0) + 1;
    }

    return {
      totalMessages: this.messageHistory.length,
      messagesByType,
      registeredHandlers: this.messageHandlers.size,
    };
  }
}

/**
 * Helper functions for creating common messages
 */
export class MessageFactory {
  /**
   * Create feature discovered message
   */
  static featureDiscovered(fromRole: string, features: unknown[], toRole?: string): AgentMessage {
    return {
      id: generateUUID(),
      type: 'FEATURE_DISCOVERED',
      fromRole,
      toRole,
      timestamp: new Date().toISOString(),
      payload: { features, count: features.length },
    };
  }

  /**
   * Create test completed message
   */
  static testCompleted(fromRole: string, result: unknown, toRole?: string): AgentMessage {
    return {
      id: generateUUID(),
      type: 'TEST_COMPLETED',
      fromRole,
      toRole,
      timestamp: new Date().toISOString(),
      payload: { result },
    };
  }

  /**
   * Create issue found message
   */
  static issueFound(fromRole: string, issue: unknown, toRole?: string): AgentMessage {
    return {
      id: generateUUID(),
      type: 'ISSUE_FOUND',
      fromRole,
      toRole,
      timestamp: new Date().toISOString(),
      payload: { issue },
    };
  }

  /**
   * Create repair suggested message
   */
  static repairSuggested(fromRole: string, repair: unknown, toRole?: string): AgentMessage {
    return {
      id: generateUUID(),
      type: 'REPAIR_SUGGESTED',
      fromRole,
      toRole,
      timestamp: new Date().toISOString(),
      payload: { repair },
    };
  }

  /**
   * Create agent ready message
   */
  static agentReady(fromRole: string, toRole?: string): AgentMessage {
    return {
      id: generateUUID(),
      type: 'AGENT_READY',
      fromRole,
      toRole,
      timestamp: new Date().toISOString(),
      payload: { status: 'ready' },
    };
  }

  /**
   * Create agent done message
   */
  static agentDone(fromRole: string, result?: unknown, toRole?: string): AgentMessage {
    return {
      id: generateUUID(),
      type: 'AGENT_DONE',
      fromRole,
      toRole,
      timestamp: new Date().toISOString(),
      payload: { result },
    };
  }

  /**
   * Create agent error message
   */
  static agentError(fromRole: string, error: Error, toRole?: string): AgentMessage {
    return {
      id: generateUUID(),
      type: 'AGENT_ERROR',
      fromRole,
      toRole,
      timestamp: new Date().toISOString(),
      payload: { error: error.message, stack: error.stack },
    };
  }
}