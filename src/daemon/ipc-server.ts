import net from 'net';
import { EventEmitter } from 'events';

import { logger } from '../logger.js';
import { IPCRequest, IPCResponse, IPCMethod, DaemonStatus } from '../types.js';

interface SessionStartParams {
  projectId: string;
  options?: {
    allowedTools?: string[];
    initialPrompt?: string;
  };
}

interface SessionStopParams {
  sessionId: string;
}

interface SessionResumeParams {
  projectId?: string;
}

/**
 * IPC Server for daemon communication
 * Uses Unix domain sockets for local IPC
 */
export class IPCServer extends EventEmitter {
  private server: net.Server;
  private socketPath: string;
  private requestHandlers: Map<IPCMethod, (params: unknown) => Promise<unknown>>;
  private connected: boolean;

  constructor(socketPath: string) {
    super();
    this.socketPath = socketPath;
    this.server = net.createServer();
    this.requestHandlers = new Map();
    this.connected = false;

    this.setupServer();
  }

  private setupServer(): void {
    this.server.on('connection', (socket) => {
      logger.debug('Client connected to IPC server');

      let buffer = '';

      socket.on('data', (data: Buffer) => {
        buffer += data.toString();

        // Process complete messages
        const messages = buffer.split('\n');
        buffer = messages.pop() || '';

        for (const message of messages) {
          if (message.trim()) {
            this.handleMessage(JSON.parse(message), socket);
          }
        }
      });

      socket.on('end', () => {
        logger.debug('Client disconnected from IPC server');
      });

      socket.on('error', (error) => {
        logger.error('Socket error: %s', error);
      });
    });

    this.server.on('error', (error) => {
      logger.error('IPC Server error: %s', error);
      this.emit('error', error);
    });

    this.server.on('close', () => {
      logger.info('IPC Server closed');
      this.connected = false;
      this.emit('close');
    });
  }

  private handleMessage(request: IPCRequest, socket: net.Socket): void {
    logger.debug('Received IPC request: %s', request.method);

    const handler = this.requestHandlers.get(request.method as IPCMethod);

    if (!handler) {
      this.sendResponse(socket, request.id, null, {
        code: -32601,
        message: `Method not found: ${request.method}`,
      });
      return;
    }

    Promise.resolve()
      .then(() => handler(request.params))
      .then((result) => {
        this.sendResponse(socket, request.id, result);
      })
      .catch((error) => {
        logger.error('Handler error for %s: %s', request.method, error);
        this.sendResponse(socket, request.id, null, {
          code: -32000,
          message: error.message || 'Internal error',
        });
      });
  }

  private sendResponse(
    socket: net.Socket,
    id: number | string,
    result: unknown,
    error?: { code: number; message: string; data?: unknown }
  ): void {
    const response: IPCResponse = {
      jsonrpc: '2.0',
      id,
    };

    if (error) {
      response.error = error;
    } else {
      response.result = result;
    }

    socket.write(JSON.stringify(response) + '\n');
  }

  /**
   * Start the IPC server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.socketPath, () => {
        this.connected = true;
        logger.info('IPC Server started on %s', this.socketPath);

        // Set socket permissions (readable/writable by user)
        try {
          fs.chmodSync(this.socketPath, 0o600);
        } catch (error) {
          logger.warn('Could not set socket permissions: %s', error);
        }

        resolve();
      });

      this.server.once('error', reject);
    });
  }

  /**
   * Stop the IPC server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.connected) {
        resolve();
        return;
      }

      this.server.close(() => {
        this.connected = false;
        logger.info('IPC Server stopped');
        resolve();
      });

      // Close all existing connections
      this.server.getConnections((error, count) => {
        if (!error && count > 0) {
          logger.debug('Closing %d active connections', count);
        }
      });
    });
  }

  /**
   * Register a request handler
   */
  registerHandler(method: IPCMethod, handler: (params: unknown) => Promise<unknown>): void {
    this.requestHandlers.set(method, handler);
    logger.debug('Registered handler for method: %s', method);
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.connected;
  }
}

// Need to import fs for chmod
import fs from 'fs';
