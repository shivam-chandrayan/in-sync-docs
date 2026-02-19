import express, { Request, Response } from "express";
import expressWebsocket from "express-ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync.js";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

// WebSocket server setup
const { app } = expressWebsocket(express());
const PORT = 3000;

// Middleware
app.use(express.json());

// Store documents and connections
const docs = new Map<string, Y.Doc>();
const docConnections = new Map<string, Set<any>>();
const docAwareness = new Map<string, awarenessProtocol.Awareness>();

// Helper function to get or create a document
function getDoc(name: string): Y.Doc {
  let doc = docs.get(name);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(name, doc);
    docConnections.set(name, new Set());
    docAwareness.set(name, new awarenessProtocol.Awareness(doc));
  }
  return doc;
}

// Routes
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Welcome to the Yjs WebSocket server!" });
});

app.get("/api/status", (req: Request, res: Response) => {
  res.json({
    status: "WebSocket server running",
    active_documents: docs.size,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/documents", (req: Request, res: Response) => {
  const documentList = Array.from(docs.entries()).map(([name, doc]) => ({
    name,
    clients: docConnections.get(name)?.size || 0,
  }));
  res.json({ documents: documentList });
});

// WebSocket endpoint for Yjs sync
app.ws("/collaboration/:docName", (ws, req) => {
  const docName = req.params.docName as string;
  const doc = getDoc(docName);
  const connections = docConnections.get(docName)!;
  const awareness = docAwareness.get(docName)!;

  let closed = false;

  console.log(
    `✅ Client connected to document: ${docName}, Total clients: ${connections.size + 1}`,
  );

  // Send sync step 1 (initial state) to new client
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0); // Message type: sync
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder));

  // Handle incoming messages from client
  ws.on("message", (message) => {
    if (closed) return;

    try {
      const decoder = decoding.createDecoder(
        new Uint8Array(message as ArrayBuffer),
      );
      const messageType = decoding.readVarUint(decoder);

      if (messageType === 0) {
        // Sync message
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0); // Message type: sync

        // Read and process sync message
        syncProtocol.readSyncMessage(decoder, encoder, doc, ws as any);

        // Send response if needed
        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder));
        }

        // Broadcast update to other clients
        const updateEncoder = encoding.createEncoder();
        encoding.writeVarUint(updateEncoder, 0); // Message type: sync
        syncProtocol.writeUpdate(updateEncoder, Y.encodeStateAsUpdate(doc));
        const update = encoding.toUint8Array(updateEncoder);

        connections.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(update);
          }
        });

        console.log(`📨 Applied update from client to document: ${docName}`);
      } else if (messageType === 1) {
        // Awareness message - just ignore for now (simplified)
        console.log(`👀 Received awareness update for document: ${docName}`);
      }
    } catch (error) {
      console.error(
        `❌ Error processing message for document ${docName}:`,
        error,
      );
    }
  });

  // Handle client disconnect
  ws.on("close", () => {
    closed = true;
    connections.delete(ws);
    console.log(
      `👋 Client disconnected from document: ${docName}, Remaining clients: ${connections.size}`,
    );
  });

  ws.on("error", (error) => {
    console.error(`❌ WebSocket error for document ${docName}:`, error);
  });

  // Add connection to tracking set
  connections.add(ws);
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Yjs WebSocket server is running at http://localhost:${PORT}`);
  console.log(
    `📡 WebSocket endpoint: ws://localhost:${PORT}/collaboration/:docName`,
  );
});
