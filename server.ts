import express from "express";
import https from "https";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Gemini AI
  // Try both variable names to be safe
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

  // Middleware to parse JSON bodies
  app.use(express.json());

  // API Route: Google Translate TTS Proxy
  app.get("/api/tts", (req, res) => {
    const text = req.query.text as string;
    if (!text) {
      return res.status(400).send("Missing text parameter");
    }

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=zh-CN&client=tw-ob`;

    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    };

    https.get(url, options, (externalRes) => {
      if (externalRes.statusCode !== 200) {
        console.error(`Google TTS Error: ${externalRes.statusCode}`);
        return res.status(500).send("Failed to fetch audio from Google");
      }
      res.setHeader("Content-Type", externalRes.headers["content-type"] || "audio/mpeg");
      externalRes.pipe(res);
    }).on('error', (e) => {
      console.error("TTS Proxy Error:", e);
      res.status(500).send("Internal Server Error");
    });
  });

  // API Route: Character Details
  app.get("/api/character-details", async (req, res) => {
    const character = req.query.character as string;
    if (!character || !ai) {
      return res.status(400).json({ error: "Missing character or AI not configured" });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [{
            text: `Analyze the Chinese character: "${character}".
            Return JSON with:
            - pinyin: Numbered pinyin (e.g. for 好 return 'hao3'). Lowercase.
            - definition: Simple English meaning (1-5 words max).
            - radical: The Chinese radical for this character (just the character itself, e.g., '女').
            - strokeCount: Total number of strokes as an integer.
            `
          }]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              pinyin: { type: Type.STRING },
              definition: { type: Type.STRING },
              radical: { type: Type.STRING },
              strokeCount: { type: Type.INTEGER }
            },
            required: ["pinyin", "definition", "radical", "strokeCount"]
          }
        }
      });

      const text = response.text;
      if (text) {
        res.json(JSON.parse(text));
      } else {
        res.status(500).json({ error: "No response from AI" });
      }
    } catch (error) {
      console.error("Character Details Error:", error);
      res.status(500).json({ error: "Failed to fetch details" });
    }
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
    // Production static file serving
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));

    // SPA Fallback
    app.get("*", (_req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("App not built (index.html missing)");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
