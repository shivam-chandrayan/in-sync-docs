import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import "./Editor.css";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Provider } from "@lexical/yjs";
import {
  LexicalCollaboration,
  useCollaborationContext,
} from "@lexical/react/LexicalCollaborationContext";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";

// Theme configuration for editor styling
const theme = {
  root: "editor-root",
  paragraph: "editor-paragraph",
  heading: {
    h1: "editor-heading-h1",
    h2: "editor-heading-h2",
    h3: "editor-heading-h3",
  },
  list: {
    nested: {
      listitem: "editor-nested-listitem",
    },
    ol: "editor-list-ol",
    ul: "editor-list-ul",
    listitem: "editor-listitem",
  },
  quote: "editor-quote",
};

// Error handler for editor errors
function onError(error: Error): void {
  console.error("❌ Lexical Editor Error:", error.message);
}

// ============================================
// PROVIDER FACTORY
// ============================================
// This function creates a WebSocket provider for Yjs collaboration
// It's called by CollaborationPlugin to establish connection to backend
function createWebsocketProvider(
  id: string,
  yjsDocMap: Map<string, Y.Doc>
): Provider {
  console.log(`📡 Creating WebSocket provider for document: "${id}"`);

  // Get or create Yjs document from map
  let doc = yjsDocMap.get(id);
  if (!doc) {
    console.log(`📝 Creating new Yjs document: "${id}"`);
    doc = new Y.Doc();
    yjsDocMap.set(id, doc);
  } else {
    console.log(`✅ Using existing Yjs document: "${id}"`);
    doc.load();
  }

  // Create WebSocket connection to our y-websocket server
  const provider = new WebsocketProvider(
    "ws://localhost:3000/collaboration",
    id,
    doc,
    { connect: true },
  );

  // Log connection events
  provider.on("status", (event: { status: string }) => {
    if (event.status === "connected") {
      console.log(`✅ Connected to WebSocket server for document: "${id}"`);
    } else if (event.status === "disconnected") {
      console.log(
        `❌ Disconnected from WebSocket server for document: "${id}"`,
      );
    }
  });

  // Cast to Provider type for compatibility with CollaborationPlugin
  // WebsocketProvider is structurally compatible but has slightly different awareness types
  return provider as unknown as Provider;
}

// ============================================
// EDITOR COMPONENT
// ============================================
interface EditorProps {
  docName?: string;
  userName?: string;
  userColor?: string;
}

function EditorContent({ docName }: { docName: string }) {
  const collabContext = useCollaborationContext();
  console.log(
    `🎨 Editor initialized with collaboration context - Active: ${collabContext.isCollabActive}`,
  );

  return (
    <div className="editor-container">
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            aria-placeholder="Enter some text..."
            placeholder={
              <div className="editor-placeholder">Enter some text...</div>
            }
            className="editor-input"
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      {/* CollaborationPlugin handles Yjs sync automatically */}
      <CollaborationPlugin
        id={docName}
        providerFactory={createWebsocketProvider}
        shouldBootstrap={false}
      />
      <AutoFocusPlugin />
      <ListPlugin />
      <TabIndentationPlugin />
    </div>
  );
}

export default function Editor({
  docName = "default-doc",
  userName = "Anonymous User",
}: EditorProps) {
  console.log(
    `🚀 Initializing Editor - Document: "${docName}", User: "${userName}"`,
  );

  // Initial editor configuration
  const initialConfig = {
    namespace: "CollaborativeEditor",
    theme,
    onError,
    // CRITICAL: Set editorState to null for collaboration
    // This tells Lexical to NOT initialize with default state
    // and let CollaborationPlugin handle initial state from Yjs
    editorState: null,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
  };

  return (
    <LexicalCollaboration>
      <LexicalComposer initialConfig={initialConfig}>
        <EditorContent docName={docName} />
      </LexicalComposer>
    </LexicalCollaboration>
  );
}
