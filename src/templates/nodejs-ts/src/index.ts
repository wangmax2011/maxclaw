// {{project_name}} - {{description}}

import { logger } from './logger.js';

async function main(): Promise<void> {
  logger.info('{{project_name}} starting...');
  console.log(`Hello from {{project_name}}!`);
  logger.info('{{project_name}} initialized successfully');
}

main().catch((error) => {
  logger.error('Application error:', error);
  process.exit(1);
});
