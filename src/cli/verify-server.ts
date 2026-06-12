/**
 * CLI entry point for starting the VerifyServer
 * Usage: npx ts-node src/cli/verify-server.ts [--port 3001] [--host 0.0.0.0] [--headless true]
 */

import { VerifyServer } from '../server/verify-server';
import { Logger } from '../utils/logger';

const logger = new Logger({ prefix: 'VerifyServer' });

interface CLIArgs {
  port: number;
  host: string;
  headless: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {
    port: parseInt(process.env.E2E_VERIFIER_PORT ?? '3001', 10),
    host: '0.0.0.0',
    headless: true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[++i];

    switch (arg) {
      case '--port':
      case '-p':
        if (value) {
          const portNum = parseInt(value, 10);
          if (!isNaN(portNum)) {
            result.port = portNum;
          }
        }
        break;
      case '--host':
      case '-H':
        if (value) {
          result.host = value;
        }
        break;
      case '--headless':
        if (value && (value === 'false' || value === '0')) {
          result.headless = false;
        }
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return result;
}

function printHelp(): void {
  logger.info(`
e2e-verifier HTTP API Server

Usage:
  npx ts-node src/cli/verify-server.ts [options]

Options:
  --port, -p <number>      Port to listen on (default: 3001, env: E2E_VERIFIER_PORT)
  --host <string>          Host to bind to (default: 0.0.0.0)
  --headless <boolean>     Browser headless mode (default: true)
  --help, -h               Show this help message

Environment Variables:
  E2E_VERIFIER_PORT        Default port if --port not provided
  OPENAI_API_KEY           API key for OpenAI models
  ANTHROPIC_API_KEY        API key for Anthropic models
  GLM_API_KEY              API key for GLM models
  LLM_API_KEY              Generic API key
  LLM_MODEL                Default model to use (default: gpt-4o)

API Endpoints:
  POST   /api/verify              Fast verification (synchronous)
  POST   /api/verify/deep         Deep verification (asynchronous)
  POST   /api/verify/orchestrated Orchestrated verification (asynchronous)
  GET    /api/jobs/:jobId         Poll job status
  GET    /api/jobs                List all jobs
  DELETE /api/jobs/:jobId         Cancel a job
  GET    /api/health              Health check
  GET    /api/stats               Server statistics

Examples:
  # Start server on default port 3001
  npm run verify:server

  # Start server on custom port
  npm run verify:server -- --port 8080

  # Start server with visible browser (for debugging)
  npm run verify:server -- --headless false

  # Start server using environment variable for port
  E2E_VERIFIER_PORT=4000 npm run verify:server
`);
}

async function main() {
  const args = parseArgs();

  logger.info('='.repeat(60));
  logger.info('e2e-verifier HTTP API Server');
  logger.info('='.repeat(60));
  logger.info(`Configuration:`);
  logger.info(`  Port: ${args.port}`);
  logger.info(`  Host: ${args.host}`);
  logger.info(`  Headless: ${args.headless}`);
  logger.info('='.repeat(60));

  const server = new VerifyServer(args.port, args.host, args.headless);

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`\n${signal} received, shutting down gracefully...`);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await server.start();
  } catch (error) {
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
}

main();
