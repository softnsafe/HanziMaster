import express from "express";
import https from "https";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { pinyin } from "pinyin-pro";

let makemehanziDict: Record<string, any> = {};

async function loadMakeMeHanzi() {
  try {
    console.log("Loading MakeMeHanzi dictionary...");
    const res = await fetch("https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt");
    if (res.ok) {
      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.character) {
            makemehanziDict[data.character] = data;
          }
        } catch (e) {}
      }
      console.log(`Loaded ${Object.keys(makemehanziDict).length} characters from MakeMeHanzi.`);
    } else {
      console.error("Failed to load MakeMeHanzi:", res.status);
    }
  } catch (e) {
    console.error("Error loading MakeMeHanzi:", e);
  }
}

async function startServer() {
  await loadMakeMeHanzi();
  
  const app = express();
  const PORT = 3000;

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
    
    if (!character) {
      return res.status(400).json({ error: "Missing character" });
    }

    // 1. Try MakeMeHanzi
    if (makemehanziDict[character]) {
      const data = makemehanziDict[character];
      const strokeCount = data.strokes ? data.strokes.length : 0;
      
      // Only use local data if we have valid stroke count
      if (strokeCount > 0) {
        return res.json({
          pinyin: data.pinyin ? data.pinyin.join(', ') : '',
          definition: data.definition || '',
          radical: data.radical || '',
          strokeCount: strokeCount
        });
      }
    }

    // 2. Fallback to Gemini
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      console.error("API Key missing. Make sure GEMINI_API_KEY or API_KEY is set.");
      return res.status(400).json({ error: "AI not configured" });
    }

    const ai = new GoogleGenAI({ apiKey });

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

  // API Route: Example Sentences (Tatoeba + pinyin-pro)
  app.get("/api/example-sentences", async (req, res) => {
    const query = req.query.query as string;
    if (!query) return res.status(400).json({ error: "Missing query" });

    // Try Tatoeba first
    try {
      const url = `https://tatoeba.org/en/api_v0/search?from=cmn&to=eng&query=${encodeURIComponent(query)}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const results = data.results || [];
        // Take only the first sentence as requested
        if (results.length > 0) {
          const sentences = results.slice(0, 1).map((r: any) => {
            const chinese = r.text;
            const english = r.translations?.[0]?.[0]?.text || '';
            // Generate pinyin using pinyin-pro
            const pinyinText = pinyin(chinese, { toneType: 'num' });
            return { chinese, pinyin: pinyinText, english };
          });
          return res.json({ sentences });
        }
      }
    } catch (error) {
      console.error("Tatoeba Error:", error);
    }

    // Fallback to Gemini if Tatoeba fails or returns no results
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Failed to fetch examples (Tatoeba failed and no AI key)" });
    }

    const ai = new GoogleGenAI({ apiKey });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [{
            text: `Generate ONE simple HSK 2 level Chinese example sentence containing the word/character "${query}".
            Return JSON with:
            - chinese: The sentence in Simplified Chinese.
            - pinyin: The pinyin for the sentence (numbered tones, e.g. "ni3 hao3").
            - english: The English translation.
            `
          }]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              chinese: { type: Type.STRING },
              pinyin: { type: Type.STRING },
              english: { type: Type.STRING }
            },
            required: ["chinese", "pinyin", "english"]
          }
        }
      });

      const text = response.text;
      if (text) {
        const data = JSON.parse(text);
        res.json({ sentences: [data] });
      } else {
        res.status(500).json({ error: "No response from AI" });
      }
    } catch (error) {
      console.error("Example Sentences Error:", error);
      res.status(500).json({ error: "Failed to fetch examples" });
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
