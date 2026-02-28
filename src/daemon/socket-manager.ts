import fs from 'fs';
import path from 'path';
import os from 'os';

import { logger } from '../logger.js';

const SOCKET_DIR = path.join(os.homedir(), '.maxclaw');
const SOCKET_NAME = 'daemon.sock';
const SOCKET_PATH = path.join(SOCKET_DIR, SOCKET_NAME);

/**
 * Get the Unix socket path for the daemon
 */
export function getSocketPath(): string {
  return SOCKET_PATH;
}

/**
 * Check if the socket file exists
 */
export function checkSocketExists(): boolean {
  return fs.existsSync(SOCKET_PATH);
}

/**
 * Clean up a stale socket file
 * Note: This doesn't check if the socket is actually in use
 * - the caller should verify the daemon is not running first
 */
export function cleanupSocket(): void {
  try {
    if (fs.existsSync(SOCKET_PATH)) {
      fs.unlinkSync(SOCKET_PATH);
      logger.info('Socket file cleaned up: %s', SOCKET_PATH);
    }
  } catch (error) {
    logger.error('Error cleaning up socket: %s', error);
    throw new Error(`Failed to cleanup socket: ${error}`);
  }
}

/**
 * Validate that the socket is usable
 */
export function validateSocket(): { valid: boolean; error?: string } {
  // Check if directory exists
  if (!fs.existsSync(SOCKET_DIR)) {
    try {
      fs.mkdirSync(SOCKET_DIR, { recursive: true });
      logger.debug('Socket directory created: %s', SOCKET_DIR);
    } catch (error) {
      return { valid: false, error: `Failed to create socket directory: ${error}` };
    }
  }

  // Check socket path length (Unix sockets have a length limit)
  if (SOCKET_PATH.length > 107) {
    return {
      valid: false,
      error: `Socket path too long (${SOCKET_PATH.length} > 107): ${SOCKET_PATH}`,
    };
  }

  return { valid: true };
}

/**
 * Ensure socket directory exists
 */
export function ensureSocketDir(): void {
  if (!fs.existsSync(SOCKET_DIR)) {
    fs.mkdirSync(SOCKET_DIR, { recursive: true });
    logger.debug('Socket directory ensured: %s', SOCKET_DIR);
  }
}
