import express from "express";
import https from "https";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Route: Google Translate TTS Proxy
  // This bypasses CORS by fetching the audio on the server side
  app.get("/api/tts", (req, res) => {
    const text = req.query.text as string;
    if (!text) {
      return res.status(400).send("Missing text parameter");
    }

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=zh-CN&client=tw-ob`;

    https.get(url, (externalRes) => {
      if (externalRes.statusCode !== 200) {
        return res.status(500).send("Failed to fetch audio from Google");
      }

      // Forward the content type (usually audio/mpeg)
      res.setHeader("Content-Type", externalRes.headers["content-type"] || "audio/mpeg");
      
      // Pipe the audio stream directly to the client
      externalRes.pipe(res);
    }).on('error', (e) => {
      console.error("TTS Proxy Error:", e);
      res.status(500).send("Internal Server Error");
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving (if needed, though usually handled by platform)
    app.use(express.static('dist'));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
