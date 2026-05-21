module.exports = {
  credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET,
  flowFile: "flows.json",
  uiPort: process.env.PORT || 1880,
  functionGlobalContext: {},
  editorTheme: {
    projects: {
      enabled: false
    }
  },
  httpNodeMiddleware: function(req, res, next) {
    if (!req.url.startsWith("/api/")) {
      return next();
    }

    const origin = process.env.API_CORS_ORIGIN || "http://localhost:5173";
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const expected = process.env.API_BEARER_TOKEN;
    if (!expected) {
      corsHeaders["Content-Type"] = "application/json";
      res.writeHead(503, corsHeaders);
      res.end(JSON.stringify({ error: "misconfigured", message: "API_BEARER_TOKEN is not set on the server" }));
      return;
    }

    const authHeader = req.headers.authorization || "";
    const parts = authHeader.split(" ");
    const token = parts.length === 2 && parts[0] === "Bearer" ? parts[1] : "";

    if (!token || token !== expected) {
      corsHeaders["Content-Type"] = "application/json";
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: "unauthorized", message: "Missing or invalid bearer token" }));
      return;
    }

    next();
  }
};
