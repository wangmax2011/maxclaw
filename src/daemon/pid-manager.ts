import fs from 'fs';
import path from 'path';
import os from 'os';

import { logger } from '../logger.js';

const PID_FILE = path.join(os.homedir(), '.maxclaw', 'daemon.pid');

/**
 * Check if a daemon is already running
 */
export function checkExistingDaemon(): { running: boolean; pid?: number } {
  if (!fs.existsSync(PID_FILE)) {
    return { running: false };
  }

  try {
    const content = fs.readFileSync(PID_FILE, 'utf-8').trim();
    const pid = parseInt(content, 10);

    if (isNaN(pid)) {
      logger.warn('Invalid PID in pid file: %s', content);
      fs.unlinkSync(PID_FILE);
      return { running: false };
    }

    // Check if process is actually running
    try {
      process.kill(pid, 0); // Signal 0 checks if process exists
      return { running: true, pid };
    } catch {
      // Process not running, clean up stale pid file
      logger.warn('Stale PID file found (process %d not running)', pid);
      fs.unlinkSync(PID_FILE);
      return { running: false };
    }
  } catch (error) {
    logger.error('Error reading PID file: %s', error);
    return { running: false };
  }
}

/**
 * Write the daemon PID file
 */
export function writePidFile(pid: number): void {
  const dir = path.dirname(PID_FILE);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(PID_FILE, pid.toString(), 'utf-8');
  logger.info('PID file written: %s (PID: %d)', PID_FILE, pid);
}

/**
 * Read the daemon PID from the PID file
 */
export function readPidFile(): number | null {
  if (!fs.existsSync(PID_FILE)) {
    return null;
  }

  try {
    const content = fs.readFileSync(PID_FILE, 'utf-8').trim();
    const pid = parseInt(content, 10);

    if (isNaN(pid)) {
      logger.warn('Invalid PID in pid file: %s', content);
      return null;
    }

    return pid;
  } catch (error) {
    logger.error('Error reading PID file: %s', error);
    return null;
  }
}

/**
 * Remove the daemon PID file
 */
export function removePidFile(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
      logger.info('PID file removed: %s', PID_FILE);
    }
  } catch (error) {
    logger.error('Error removing PID file: %s', error);
  }
}

/**
 * Get the daemon PID
 */
export function getDaemonPid(): number | null {
  return readPidFile();
}
