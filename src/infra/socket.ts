import { Server } from 'socket.io';
import { Server as HTTPServer } from 'http';

let ioInstance: Server | null = null;

export function initializeSocket(httpServer: HTTPServer): Server {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  return ioInstance;
}

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return ioInstance;
}

