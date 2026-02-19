# Lexical + Yjs Collaboration Guide

This guide explains how the collaborative text editor works. The architecture is based on [Facebook's Lexical React Collab Example](https://github.com/facebook/lexical/tree/main/examples/react-rich-collab).

## Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│                    Browser/React App                      │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Editor.tsx (React Component)                       │  │
│  │  ├─ LexicalCollaboration (Context Provider)         │  │
│  │  │  ├─ LexicalComposer (Initialize Editor)          │  │
│  │  │  │  ├─ RichTextPlugin (Display & Input)          │  │
│  │  │  │  ├─ CollaborationPlugin (Sync with Yjs)       │  │
│  │  │  │  ├─ ListPlugin, TabIndentationPlugin, etc.    │  │
│  │  │  │  └─ createWebsocketProvider (Connect to WS)   │  │
│  │  │  └─ EditorContent (UI Layout)                    │  │
│  │  │     └─ ContentEditable (Visual Editor)           │  │
│  │  └─ Y.Doc (Yjs Shared Data Structure)               │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│           WebSocket Connection (ws://localhost:3000)      │
└──────────────────────┬────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│            Express Server (Node.js Backend)                 │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  server.ts                                         │    │
│  │  ├─ Yjs Document Map (stores all documents)      │    │
│  │  │  ├─ doc1: Y.Doc                               │    │
│  │  │  ├─ doc2: Y.Doc                               │    │
│  │  │  └─ doc3: Y.Doc                               │    │
│  │  │                                                │    │
│  │  ├─ WebSocket Endpoint (/collaboration/:docName) │    │
│  │  │  ├─ Receives sync protocol from clients      │    │
│  │  │  ├─ Updates Y.Doc                            │    │
│  │  │  └─ Broadcasts changes to other clients      │    │
│  │  │                                                │    │
│  │  └─ API Routes                                   │    │
│  │     ├─ GET /api/status (server health)           │    │
│  │     └─ GET /api/documents (list active docs)     │    │
│  └────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. **createWebsocketProvider()**

Located in `Editor.tsx` (lines 46-80)

**Purpose**: Factory function that creates a WebSocket connection to the backend

**What it does**:

- Creates/retrieves a Yjs `Y.Doc` from the document map
- Establishes WebSocket connection to `ws://localhost:3000/collaboration`
- Logs connection status (connected/disconnected)
- Returns a `Provider` object that handles sync protocol

**Console Logs**:

```
📡 Creating WebSocket provider for document: "doc-name"
📝 Creating new Yjs document: "doc-name"
✅ Connected to WebSocket server for document: "doc-name"
```

### 2. **LexicalCollaboration**

Lexical's context provider that enables collaboration features

**What it does**:

- Provides `useCollaborationContext()` hook to child components
- Tracks active collaboration state
- Maintains document map for multiple documents

### 3. **CollaborationPlugin**

Built-in Lexical plugin that syncs editor state with Yjs

**What it does**:

- Calls `providerFactory()` to establish WebSocket connection
- Creates bindings between Lexical editor and Yjs document
- Automatically syncs changes in both directions
- Does NOT use HistoryPlugin (replaced by Yjs undo/redo)

### 4. **Y.Doc (Yjs Document)**

Shared data structure that holds the actual content

**What it stores**:

- Text content of the collaborative document
- Metadata (user awareness, cursors)
- Operation history

## Data Flow (Step by Step)

### Scenario 1: User A Types "Hello"

```
User A's Browser                Network              Server
┌─────────────┐                                ┌────────────┐
│ User types  │                                │ Express    │
│ "Hello"     │                                │ Server     │
└──────┬──────┘                                └────────────┘
       │
       ▼
┌─────────────────────────────┐
│ Lexical Editor detects      │
│ text change                 │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ CollaborationPlugin         │
│ syncs to Yjs Y.Doc          │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ Y.Doc creates operation:    │
│ INSERT "Hello" at pos 0     │
└──────┬──────────────────────┘
       │
       │ 📤 WebSocket Message
       │ (Yjs Sync Protocol)
       ▼
                            ┌──────────────────────┐
                            │ Server receives msg  │
                            │ from WebSocket       │
                            └──────┬───────────────┘
                                   │
                                   ▼
                            ┌──────────────────────┐
                            │ Apply update to      │
                            │ Server's Y.Doc       │
                            └──────┬───────────────┘
                                   │
                                   ▼
                            ┌──────────────────────┐
                            │ Broadcast to other   │
                            │ connected clients    │
                            └──────────────────────┘
                                   │
                                   │ 📥 WebSocket Message
                                   ▼
                            User B's Browser
                            ┌──────────────────────┐
                            │ Y.Doc receives       │
                            │ update "Hello"       │
                            └──────┬───────────────┘
                                   │
                                   ▼
                            ┌──────────────────────┐
                            │ CollaborationPlugin  │
                            │ syncs to Lexical     │
                            └──────┬───────────────┘
                                   │
                                   ▼
                            ┌──────────────────────┐
                            │ User B sees "Hello"  │
                            │ appear in real-time  │
                            └──────────────────────┘
```

## Console Logs Explained

When you open the editor and start typing, you'll see:

```javascript
🚀 Initializing Editor - Document: "default-doc", User: "Anonymous User"
📡 Creating WebSocket provider for document: "default-doc"
📝 Creating new Yjs document: "default-doc"
✅ Connected to WebSocket server for document: "default-doc"
🎨 Editor initialized with collaboration context - Active: true
```

### When typing:

The editor silently syncs to server (no logs) - changes are sent via WebSocket.

### When another browser connects:

```javascript
🚀 Initializing Editor - Document: "default-doc", User: "Anonymous User"
📡 Creating WebSocket provider for document: "default-doc"
✅ Using existing Yjs document: "default-doc"
✅ Connected to WebSocket server for document: "default-doc"
```

The new client gets existing document state and starts syncing.

## Testing Collaboration

1. **Start Backend Server**:

   ```bash
   cd apps/server
   pnpm dev
   ```

2. **Start Frontend**:

   ```bash
   cd apps/web
   pnpm dev
   ```

3. **Open Multiple Tabs**:
   - Open `http://localhost:5173` in two browser tabs
   - Type in one tab
   - See changes appear in the other tab in real-time

4. **Try Different Document Names**:

   ```jsx
   // In App.tsx
   <Editor docName="my-custom-doc" />
   ```

   - Each document name creates a separate collaborative session
   - Users on same `docName` see each other's changes

## Important Concepts

### Why `editorState: null`?

This tells Lexical NOT to create default content. Instead, CollaborationPlugin loads content from the Yjs document. This is critical for collaboration to work correctly.

### Why No HistoryPlugin?

With collaboration, undo/redo is managed by Yjs, not Lexical's HistoryPlugin. Yjs maintains operation history and can replay changes.

### Y.Doc Persistence

The current server implementation stores Y.Docs in memory. For production:

- Implement database persistence (save Y.Doc state to DB)
- Allow server restarts without losing data
- Users reconnect and pull state from DB

### Awareness

While not fully implemented in this minimal setup, Yjs has "awareness" for:

- Showing which users are connected
- Displaying remote user cursors
- Real-time user presence

## Next Steps to Enhance

1. **Add Cursor Tracking**: Show where other users are typing
2. **Add User Presence**: Display connected users' names/colors
3. **Add Undo/Redo**: Leverage Yjs's built-in history
4. **Persist Data**: Save Y.Doc updates to database
5. **Add Formatters**: Bold, italic, links (extend theme)
6. **Add Comments**: Enable threaded comments on blocks

## Debugging Tips

**Check Server Logs**:

```bash
# In server terminal, you'll see:
Client connected to document: default-doc, Total clients: 1
Client connected to document: default-doc, Total clients: 2
```

**Check Browser Console**:

- Look for `✅` (success) and `📡` (network) logs
- Watch for `❌` (errors)

**Test API Endpoints**:

```bash
# Server status
curl http://localhost:3000/api/status

# List active documents
curl http://localhost:3000/api/documents
```

**Network Tab in DevTools**:

- Look for `WS` connection to `ws://localhost:3000/collaboration/...`
- Watch for messages being sent/received in real-time
