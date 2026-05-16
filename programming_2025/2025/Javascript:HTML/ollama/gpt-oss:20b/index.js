const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const { TextDecoder } = require("util");

// If you don't have global fetch (old Node), node-fetch is used.
let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = (...args) => require("node-fetch")(...args);
  } catch (e) {
    console.warn(
      "No global fetch and node-fetch not installed. Install node-fetch or use Node 18+."
    );
    throw e;
  }
}
const fetch = fetchFn;

// Express app
const app = express();
app.use(express.static("public")); // serve static files from public/

// Ports
const HTTP_PORT = 3000;
const HTTPS_PORT = 3443;

// SSL certs (create with mkcert or openssl)
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, "certs", "key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "cert.pem")),
};

// Create HTTPS server
const httpsServer = https.createServer(sslOptions, app);

// Socket.io over HTTPS
const io = new Server(httpsServer, {
  maxHttpBufferSize: 1e6,
});

// Config
const UA = "Mozilla/5.0 (Node.js streaming-search-demo)";
const SHOW_REASONING = process.env.SHOW_REASONING === "1";

// Start HTTPS
httpsServer.listen(HTTPS_PORT, () => {
  console.log("HTTPS hosting on:");
  printAddresses("https", HTTPS_PORT);
});

// HTTP redirect to HTTPS
const redirectApp = express();
redirectApp.enable("trust proxy");
redirectApp.use((req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  return res.redirect(301, `https://${host}:${HTTPS_PORT}${req.url}`);
});
http.createServer(redirectApp).listen(HTTP_PORT, () => {
  console.log(`HTTP on :${HTTP_PORT} (redirecting -> HTTPS :${HTTPS_PORT})`);
  printAddresses("http", HTTP_PORT);
});

function printAddresses(proto, port) {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4") {
        console.log(`${proto}://${net.address}:${port}`);
      }
    }
  }
  console.log(`${proto}://localhost:${port}`);
}

// --------------------------------------------------------------------
// Web context helper
async function fetchWebContext(query) {
  const sources = [];

  // DuckDuckGo Instant Answer
  try {
    const ddUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      query
    )}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    const ddResp = await fetch(ddUrl, { headers: { "User-Agent": UA } });
    const ddJson = await ddResp.json();

    if (ddJson.AbstractText?.trim()) {
      sources.push({
        title: ddJson.Heading || "DuckDuckGo Abstract",
        snippet: ddJson.AbstractText.trim(),
        url:
          ddJson.AbstractURL ||
          ddJson.AbstractSource ||
          "https://duckduckgo.com",
      });
    }
    if (Array.isArray(ddJson.RelatedTopics)) {
      for (const rt of ddJson.RelatedTopics) {
        if (rt.Text && rt.FirstURL) {
          sources.push({
            title: rt.Text.split(" - ")[0].slice(0, 120),
            snippet: rt.Text,
            url: rt.FirstURL,
          });
        } else if (Array.isArray(rt.Topics)) {
          for (const t of rt.Topics.slice(0, 3)) {
            if (t.Text && t.FirstURL) {
              sources.push({
                title: t.Text.split(" - ")[0].slice(0, 120),
                snippet: t.Text,
                url: t.FirstURL,
              });
            }
          }
        }
        if (sources.length >= 5) break;
      }
    }
  } catch (e) {
    console.warn("DuckDuckGo fetch failed:", e.message);
  }

  // Wikipedia fallback if no useful context
  if (sources.length < 2) {
    try {
      const sUrl = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(
        query
      )}&limit=3`;
      const sResp = await fetch(sUrl, { headers: { "User-Agent": UA } });
      const sJson = await sResp.json();
      const pages = (sJson?.pages || sJson?.results || []).slice(0, 2);

      for (const p of pages) {
        const title = p.title || p.key || p.name;
        if (!title) continue;
        const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          title
        )}`;
        const sumResp = await fetch(sumUrl, { headers: { "User-Agent": UA } });
        const sum = await sumResp.json();
        if (sum?.extract) {
          sources.push({
            title: sum.title || title,
            snippet: sum.extract,
            url:
              sum.content_urls?.desktop?.page ||
              `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
          });
        }
      }
    } catch (e) {
      console.warn("Wikipedia fetch failed:", e.message);
    }
  }

  const webSummary = sources.length
    ? sources
        .map(
          (s, i) =>
            `[${i + 1}] ${s.title}\n${s.snippet}\nSource: ${s.url}`
        )
        .join("\n\n")
    : "(no context found)";

  return { webSummary, sources };
}

// --------------------------------------------------------------------
// Socket handlers
io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  socket.on("search_and_generate", async ({ query, systemPrompt }) => {
    if (!query || typeof query !== "string") {
      socket.emit("server_error", "Missing query string");
      return;
    }

    socket.emit("info", "Searching the web for context...");
    try {
      const { webSummary } = await fetchWebContext(query);

      const prompt = `
${systemPrompt || "You are a helpful assistant. Use the provided web snippets to answer succinctly and cite sources."}

Web search snippets:
${webSummary}

User query:
${query}

Answer using the snippets above. If insufficient, say "NEEDS_MORE_INFO".
      `.trim();

      socket.emit("info", "Querying model (streaming)...");

      // Call Ollama
      const ollamaRes = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-oss:20b",
          prompt,
          stream: true,
        }),
      });

      if (!ollamaRes.ok || !ollamaRes.body) {
        const text = await ollamaRes.text();
        throw new Error(`Ollama error: ${ollamaRes.status} ${text}`);
      }

      // Stream tokens
      const reader = ollamaRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);

          if (!line) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.error) socket.emit("server_error", obj.error);

            const piece = obj.response ?? obj.message?.content;
            if (piece) socket.emit("token", piece);

            const think = obj.thinking ?? obj.thought ?? obj.reasoning;
            if (think && SHOW_REASONING) socket.emit("reason", think);
          } catch {
            socket.emit("token", line);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const obj = JSON.parse(buffer);
          const piece = obj.response ?? obj.message?.content;
          if (piece) socket.emit("token", piece);
          const think = obj.thinking ?? obj.thought ?? obj.reasoning;
          if (think && SHOW_REASONING) socket.emit("reason", think);
        } catch {
          socket.emit("token", buffer);
        }
      }

      socket.emit("done");
    } catch (err) {
      console.error("search_and_generate error:", err);
      socket.emit("server_error", err?.message || String(err));
    }
  });

  socket.on("disconnect", () => {
    console.log("socket disconnected:", socket.id);
  });
});