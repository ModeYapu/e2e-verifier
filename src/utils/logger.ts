export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

export interface LoggerConfig {
  level?: LogLevel;
  prefix?: string;
  colorize?: boolean;
}

const ANSI_COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private colorize: boolean;

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? LogLevel.INFO;
    this.prefix = config.prefix ?? '';
    this.colorize = config.colorize ?? true;
  }

  private color(text: string, color: keyof typeof ANSI_COLORS): string {
    if (!this.colorize) return text;
    return `${ANSI_COLORS[color]}${text}${ANSI_COLORS.reset}`;
  }

  private format(level: string, message: string): string {
    const timestamp = new Date().toISOString().substring(11, 19);
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    return `${this.color(timestamp, 'dim')} ${prefix}${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(this.format('DEBUG', message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.format('INFO', message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.format('WARN', this.color(message, 'yellow')), ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.format('ERROR', this.color(message, 'red')), ...args);
    }
  }

  success(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.format('SUCCESS', this.color(message, 'green')), ...args);
    }
  }

  static fromEnv(): Logger {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    const level = envLevel !== undefined ? (LogLevel[envLevel as keyof typeof LogLevel] ?? LogLevel.INFO) : LogLevel.INFO;
    return new Logger({ level });
  }
}

// Default global logger instance
export const logger = new Logger();
