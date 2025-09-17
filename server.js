const express = require("express");
const WebSocket = require("ws");
const { WebSocketServer } = require("ws");
const crypto = require("crypto");

function buildApp() {
  const app = express();

  // Middleware: Set JSON:API Content-Type for all responses
  app.use((req, res, next) => {
    res.setHeader("Content-Type", "application/vnd.api+json");
    next();
  });

  // Parse JSON bodies
  app.use(express.json({ type: ["application/json", "application/vnd.api+json"] }));

  // Global data store (renamed from "data" to "store" to avoid conflicts)
  const store = {
    conversations: [
      {
        id: "d259d0be-a4cd-41f8-a19b-e333eab1fe21",
        name: "Conversation #1",
        author: "c89ee220-37fc-4781-ae07-24fcaf91281a",
        messages: [
          {
            id: "12f22418-4b56-44ad-9404-cf9231aad3d4",
            text: "Hello, World!",
            author: "c89ee220-37fc-4781-ae07-24fcaf91281a"
          }
        ]
      },
      {
        id: "c6b3b2c2-2f7f-4d3e-8b0e-1b5d0b7b3f8d",
        name: "Conversation #2",
        author: "f5a2d4e7-3b8f-4c7d-8e7e-3f1b4f7e8f7d",
        messages: [
          {
            id: "d0d8f7e8-7b3f-4b0e-8d3e-2c2f7f6b3b2c",
            text: "Hi, there!",
            author: "AI",
          }
        ]
      }
    ],
    users: [
      {
        id: "c89ee220-37fc-4781-ae07-24fcaf91281a",
        username: "user1",
        password: "password1",
        email: "user1@example.com"
      },
      {
        id: "f5a2d4e7-3b8f-4c7d-8e7e-3f1b4f7e8f7d",
        username: "user2",
        password: "password2",
        email: "user2@example.com"
      }
    ]
  };

  const firstMessage = {
    id: "12f22418-4b56-44ad-9404-cf9231aad3d4",
    text: "Hello, how can I help you?",
    author: "AI",
  };

  // WebSocket subscription store: conversationId -> Set<WebSocket>
  const conversationIdToClients = new Map();

  function addClientToConversation(conversationId, socket) {
    if (!conversationIdToClients.has(conversationId)) {
      conversationIdToClients.set(conversationId, new Set());
    }
    conversationIdToClients.get(conversationId).add(socket);
  }

  function removeClientFromConversation(conversationId, socket) {
    const clients = conversationIdToClients.get(conversationId);
    if (!clients) return;
    clients.delete(socket);
    if (clients.size === 0) {
      conversationIdToClients.delete(conversationId);
    }
  }

  function formatConversation(conversation) {
    return {
      type: "conversations",
      id: conversation.id,
      attributes: {
        name: conversation.name,
        author: conversation.author,
        messages: conversation.messages
      }
    };
  }

  function formatMessage(message) {
    return {
      type: "messages",
      id: message.id,
      attributes: {
        text: message.text,
        author: message.author
      }
    };
  }

  function broadcastMessage(conversationId, message) {
    const clients = conversationIdToClients.get(conversationId);
    if (!clients || clients.size === 0) return;
    const payload = JSON.stringify({ event: "message.created", data: formatMessage(message) });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(payload); } catch (_) {}
      }
    }
  }

  function validateRequest(req, res) {
    if (String(req.headers["content-type"]) !== "application/vnd.api+json") {
      return res.status(415).json({
        errors: [{
          status: "415",
          title: "Unsupported Content-Type",
          detail: `Unsupported Content-Type header: ${req.headers["content-type"]}`
        }]
      });
    }
    if (!req.accepts("application/vnd.api+json")) {
      return res.status(415).json({
        errors: [{
          status: "415",
          title: "Unsupported Accept header",
          detail: `Unsupported Accept header: ${req.headers["accept"]}`
        }]
      });
    }
  }

  function authorize(req, res) {
    const { authorization } = req.headers;
    const token = String(authorization);
    if (!token) {
      res.status(401).json({
        errors: [{
          status: "401",
          title: "Unauthorized",
          detail: "No token provided"
        }]
      });
      return null;
    }
    const user = store.users.find(user => user.id === token);
    if (!user) {
      res.status(401).json({
        errors: [{
          status: "401",
          title: "Unauthorized",
          detail: "Invalid token"
        }]
      });
      return null;
    }
    return user;
  }

  // Authenticate endpoint (expects payload per JSON:API)
  app.post("/authenticate", (req, res) => {
    try {
      validateRequest(req, res);
      const { data } = req.body;
      const { username, password } = data.attributes;
      const user = store.users.find(u => u.username === username && u.password === password);
      if (!user) {
        return res.status(401).json({
          errors: [{
            status: "401",
            title: "Unauthorized",
            detail: "Invalid username or password"
          }]
        });
      }
      res.status(200).json({
        meta: { token: user.id }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        errors: [{
          status: "500",
          title: "Internal Server Error",
          detail: "An unexpected error occurred"
        }]
      });
    }
  });

  // Get all conversations for the authenticated user
  app.get("/conversations", (req, res) => {
    try {
      validateRequest(req, res);
      const user = authorize(req, res);
      if (!user) return;
      const userConversations = store.conversations.filter(conversation => conversation.author === user.id);
      res.status(200).json({
        data: userConversations.map(formatConversation)
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        errors: [{
          status: "500",
          title: "Internal Server Error",
          detail: "An unexpected error occurred"
        }]
      });
    }
  });

  // Get a single conversation by ID (if the user is authorized)
  app.get("/conversations/:id", (req, res) => {
    try {
      validateRequest(req, res);
      const user = authorize(req, res);
      if (!user) return;
      const conversation = store.conversations.find(c => c.id === req.params.id);
      if (!conversation) {
        return res.status(404).json({
          errors: [{
            status: "404",
            title: "Not Found",
            detail: "Conversation not found"
          }]
        });
      }
      if (conversation.author !== user.id) {
        return res.status(403).json({
          errors: [{
            status: "403",
            title: "Forbidden",
            detail: "You do not have access to this conversation"
          }]
        });
      }
      res.status(200).json({
        data: formatConversation(conversation)
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        errors: [{
          status: "500",
          title: "Internal Server Error",
          detail: "An unexpected error occurred"
        }]
      });
    }
  });

  // Create a new conversation (expects JSON:API formatted payload)
  app.post("/conversations", (req, res) => {
    try {
      validateRequest(req, res);
      const author = authorize(req, res);
      if (!author) return;
      const { data } = req.body;
      const { name } = data.attributes;
      const conversation = {
        id: crypto.randomUUID(),
        name,
        author: author.id,
        messages: [firstMessage],
      };
      store.conversations.push(conversation);
      res.status(201).json({
        data: formatConversation(conversation)
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        errors: [{
          status: "500",
          title: "Internal Server Error",
          detail: "An unexpected error occurred"
        }]
      });
    }
  });

  // Add a new message to a conversation (expects JSON:API payload)
  app.post("/conversations/:id", (req, res) => {
    try {
      validateRequest(req, res);
      const author = authorize(req, res);
      if (!author) return;
      const conversation = store.conversations.find(c => c.id === req.params.id);
      if (!conversation) {
        return res.status(404).json({
          errors: [{
            status: "404",
            title: "Not Found",
            detail: "Conversation not found"
          }]
        });
      }
      if (conversation.author !== author.id) {
        return res.status(403).json({
          errors: [{
            status: "403",
            title: "Forbidden",
            detail: "You do not have access to this conversation"
          }]
        });
      }
      const { data } = req.body;
      const { text } = data.attributes;
      const message = {
        id: crypto.randomUUID(),
        text,
        author: author.id,
      };
      conversation.messages.push(message);
      res.status(201).json({
        data: formatMessage(message)
      });
      // Broadcast to subscribers
      broadcastMessage(conversation.id, message);
      // Generate AI response after a delay if needed
      const generateAIResponse = (conv) => {
        const lastMessage = conv.messages[conv.messages.length - 1];
        if (lastMessage.author === "AI") return;
        const aiMessage = {
          id: crypto.randomUUID(),
          text: "AI: I'm sorry, I don't understand. Can you please rephrase that?",
          author: "AI",
        };
        conv.messages.push(aiMessage);
        broadcastMessage(conv.id, aiMessage);
      };
      delay(2500).then(() => generateAIResponse(conversation));
    } catch (error) {
      console.error(error);
      res.status(500).json({
        errors: [{
          status: "500",
          title: "Internal Server Error",
          detail: "An unexpected error occurred"
        }]
      });
    }
  });

  // Serve openapi.json file
  app.get("/openapi.json", (req, res) => {
    res.sendFile(__dirname + "/openapi.json");
  });

  // Serve doc.html file
  app.get("/docs", (req, res) => {
    res.sendFile(__dirname + "/doc.html");
  });

  return { app, store, conversationIdToClients };
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function attachWebSocket(server, store, conversationIdToClients) {
  const wss = new WebSocketServer({ server, path: "/cable" });

  function removeClientFromConversation(conversationId, socket) {
    const clients = conversationIdToClients.get(conversationId);
    if (!clients) return;
    clients.delete(socket);
    if (clients.size === 0) {
      conversationIdToClients.delete(conversationId);
    }
  }

  wss.on("connection", (socket, req) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const conversationId = url.searchParams.get("conversationId");
      const token = url.searchParams.get("token");

      if (!conversationId || !token) {
        socket.close(1008, "Missing conversationId or token");
        return;
      }

      const user = store.users.find(u => u.id === token);
      const conversation = store.conversations.find(c => c.id === conversationId);
      if (!user || !conversation || conversation.author !== user.id) {
        socket.close(1008, "Unauthorized or invalid conversation");
        return;
      }

      if (!conversationIdToClients.has(conversationId)) {
        conversationIdToClients.set(conversationId, new Set());
      }
      conversationIdToClients.get(conversationId).add(socket);

      socket.on("close", () => {
        removeClientFromConversation(conversationId, socket);
      });
    } catch (_) {
      try { socket.close(1011, "Unexpected error"); } catch (_) {}
    }
  });

  return { wss };
}

if (require.main === module) {
  const port = process.env.PORT || 9293;
  const { app, store, conversationIdToClients } = buildApp();
  const server = app.listen(port, () => {
    console.log(`API is running on port ${port}`);
  });
  attachWebSocket(server, store, conversationIdToClients);
}

module.exports = { buildApp, attachWebSocket };
