
import { GoogleGenAI, Type } from "@google/genai";
import { GradingResult, Flashcard } from '../types';
import { sheetService } from './sheetService';
import { convertAudioDriveLink } from '../utils/stickerData';
import { toneToNumber } from '../utils/pinyinUtils';

// Lazy initialization of AI instance
let aiInstance: GoogleGenAI | null = null;
// ... (rest of file)

const getAI = (): GoogleGenAI => {
  if (!aiInstance) {
    // Fallback to empty string to prevent crash if key is missing during render
    const apiKey = process.env.GEMINI_API_KEY || ''; 
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

// Helper to clean JSON string from Markdown code blocks
const cleanJson = (text: string): string => {
    if (!text) return "";
    let cleaned = text.trim();
    // Remove markdown code blocks ```json ... ``` or just ``` ... ```
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(json)?/, '').replace(/```$/, '');
    }
    return cleaned.trim();
};

// Helper to handle rate limits with retry
const callWithRetry = async <T>(
    fn: () => Promise<T>, 
    retries = 3, 
    baseDelay = 2000
): Promise<T> => {
    try {
        return await fn();
    } catch (error: any) {
        const isRateLimit = error?.status === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED');
        
        if (retries > 0 && isRateLimit) {
            let waitTime = baseDelay;
            
            // Try to parse wait time from error message
            // "Please retry in 29.51807637s."
            const match = error?.message?.match(/retry in ([\d.]+)s/);
            if (match && match[1]) {
                waitTime = Math.ceil(parseFloat(match[1]) * 1000) + 500; // Add 500ms buffer
            } else {
                // Exponential backoff if no specific time given
                waitTime = baseDelay * 2;
            }
            
            console.warn(`Rate limited. Retrying in ${waitTime}ms... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return callWithRetry(fn, retries - 1, waitTime);
        }
        throw error;
    }
};

// Helper to play audio and return promise that resolves on success/fail
export const playAudioUrl = async (url: string): Promise<boolean> => {
    if (!url) return false;
    
    // For local URLs, check if they exist first to avoid browser console errors
    if (url.startsWith('/')) {
        try {
            const res = await fetch(url, { method: 'HEAD' });
            if (!res.ok) return false;
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) return false;
        } catch (e) {
            return false;
        }
    }

    return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onended = () => resolve(true);
        audio.onerror = (e) => {
            console.warn("Audio playback failed:", url, e);
            resolve(false);
        };
        // Timeout if it hangs (Increased to 5s for slower TTS)
        setTimeout(() => resolve(false), 5000);
        audio.play().catch((e) => {
            console.warn("Audio play() rejected:", url, e);
            resolve(false);
        });
    });
};

const showToast = (msg: string) => {
    if (document.getElementById('audio-toast')) return; // Prevent duplicate
    const toast = document.createElement('div');
    toast.id = 'audio-toast';
    toast.innerText = msg;
    toast.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:white;padding:8px 16px;border-radius:20px;z-index:9999;font-size:12px;font-family:sans-serif;pointer-events:none;transition:opacity 0.3s;opacity:0;box-shadow:0 4px 6px rgba(0,0,0,0.1);backdrop-filter:blur(4px);";
    document.body.appendChild(toast);
    
    // Fade in
    requestAnimationFrame(() => toast.style.opacity = '1');
    
    // Remove
    setTimeout(() => { 
        toast.style.opacity = '0'; 
        setTimeout(() => toast.remove(), 300); 
    }, 2500);
};

// Helper to generate speech using Gemini TTS (Deprecated in favor of Proxy)
export const generateSpeech = async (): Promise<string | null> => {
    // This is now a fallback or unused
    return null;
};

export const playPronunciation = async (text: string, overrideUrl?: string, pinyin?: string) => {
  const cleanText = text.trim();

  // 1. Try Override URL if provided (from Assignment Metadata)
  if (overrideUrl) {
      const url = convertAudioDriveLink(overrideUrl);
      const success = await playAudioUrl(url);
      if (success) return;
  }

  // 2. Youdao TTS (Free Public Endpoint)
  // This is the easiest way to use Youdao's high-quality Chinese voice without needing API keys.
  try {
      const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanText)}&le=zh`;
      const success = await playAudioUrl(youdaoUrl);
      if (success) return;
  } catch (e) {
      console.warn("Youdao TTS failed", e);
  }

  // 3. Direct Google Translate TTS (Client-Side Backup)
  try {
      const directUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=zh-CN&client=tw-ob`;
      const success = await playAudioUrl(directUrl);
      if (success) return;
  } catch (e) {
      console.warn("Direct Google TTS failed", e);
  }

  // 4. Google Translate TTS via Backend Proxy (Secondary Backup)
  try {
      // Use our new backend proxy endpoint
      const proxyUrl = `/api/tts?text=${encodeURIComponent(cleanText)}`;
      const success = await playAudioUrl(proxyUrl);
      if (success) return;
  } catch (e) {
      console.warn("Google Translate Proxy failed", e);
  }

  // 5. Try CDN Fallback (New: davinfifield/mp3-chinese-pinyin-sound) - Tertiary Source
  // Kept as backup because it has high-quality human recordings for single chars
  if (pinyin) {
      // Convert tone marks to numbered pinyin (e.g. "nǐ hǎo" -> "ni3 hao3")
      const numberedPinyin = toneToNumber(pinyin);
      const syllables = numberedPinyin.toLowerCase().split(/\s+/);
      
      let allSuccess = true;
      
      // Play sequentially
      for (const syllable of syllables) {
          // Clean syllable (remove punctuation, keep alphanumeric)
          let cleanSyllable = syllable.replace(/[^a-z0-9ü]/g, '');
          
          // Handle neutral tone
          if (!/[1-4]/.test(cleanSyllable)) {
             if (/^[a-z]+$/.test(cleanSyllable)) {
                 cleanSyllable += '5';
             }
          }

          if (!cleanSyllable) continue;
          
          const cdnUrl = `https://cdn.jsdelivr.net/gh/davinfifield/mp3-chinese-pinyin-sound/mp3/${cleanSyllable}.mp3`;
          const success = await playAudioUrl(cdnUrl);
          if (!success) {
              allSuccess = false;
          }
      }
      
      if (allSuccess && syllables.length > 0) return;
  }

  // 6. Fallback to Browser's built-in Speech Synthesis (Robotic)
  if (pinyin) {
      // Clean pinyin (remove spaces, lowercase)
      const cleanPinyin = pinyin.toLowerCase().replace(/\s+/g, '');
      
      // Try MP3 first
      const mp3Url = `/audio/${cleanPinyin}.mp3`;
      if (await playAudioUrl(mp3Url)) return;

      // Try M4A second (Fallback for mp4 audio containers)
      const m4aUrl = `/audio/${cleanPinyin}.m4a`;
      if (await playAudioUrl(m4aUrl)) return;

      console.warn(`Local audio ${cleanPinyin} not found, using TTS.`);
      showToast(`Audio file missing for "${cleanPinyin}". Using generated voice.`);
  }

  // 7. Fallback to Browser's built-in Speech Synthesis
  try {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'zh-CN'; 
      utterance.rate = 0.8; 
      
      // Smart Voice Selection (Prioritize Microsoft Xiaoxiao)
      let voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) {
          // Retry after delay if voices haven't loaded
          await new Promise(r => setTimeout(r, 50));
          voices = window.speechSynthesis.getVoices();
      }

      // Priority Order:
      // 1. "Xiaoxiao" (Windows/Edge Neural)
      // 2. "Microsoft" + "Chinese" (General Windows)
      // 3. Exact 'zh-CN'
      // 4. Any 'zh'
      let zhVoice = voices.find(v => v.name.includes('Xiaoxiao'));
      if (!zhVoice) zhVoice = voices.find(v => v.name.includes('Yunxi') || v.name.includes('HsiaoYu'));
      if (!zhVoice) zhVoice = voices.find(v => v.lang === 'zh-CN' && v.name.includes('Microsoft'));
      if (!zhVoice) zhVoice = voices.find(v => v.lang === 'zh-CN');
      if (!zhVoice) zhVoice = voices.find(v => v.lang.includes('zh'));

      if (zhVoice) {
          utterance.voice = zhVoice;
          // Xiaoxiao is sometimes fast, slow it down slightly more
          if (zhVoice.name.includes('Xiaoxiao')) utterance.rate = 0.75;
      }

      window.speechSynthesis.speak(utterance);
  } catch (error) {
      console.error("Browser TTS failed:", error);
  }
};
// -----------------------------

export const generateLobbyBackground = async (): Promise<string | null> => {
  try {
    const ai = getAI();
    const response = await callWithRetry(() => ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: 'A heartwarming, wide-angle illustration of a cute multicultural group of children (Asian, Black, Hispanic, White) playing together in a magical garden filled with giant floating Chinese calligraphy brushes and ink stones. 3D Pixar-style cartoon animation style. Soft pastel colors, sunny sky, joyful expressions. The center of the image should be relatively uncluttered to allow for a text overlay. High resolution, detailed textures.'
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        }
      },
    }));

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                const base64EncodeString: string = part.inlineData.data;
                return `data:image/png;base64,${base64EncodeString}`;
            }
        }
    }
    return null;
  } catch (error) {
    console.error("Error generating background:", error);
    return null;
  }
};

// --- Offline Sticker Generator ---
const EMOJI_MAP: Record<string, string[]> = {
    // Animals
    'cat': ['🐱', '🐈', '😻', '😸', '😹', '😽'], 
    'dog': ['🐶', '🐕', '🐩', '🐕‍🦺', '🦴'], 
    'tiger': ['🐯', '🐅'],
    'panda': ['🐼'], 'dragon': ['🐲', '🐉'], 'rabbit': ['🐰', '🐇'], 'monkey': ['🐵', '🐒', '🙈', '🙉', '🙊'],
    'bear': ['🐻', '🧸', '🐻‍❄️'], 'koala': ['🐨'], 'lion': ['🦁'], 'cow': ['🐮', '🐄'], 'pig': ['🐷', '🐖', '🐽'],
    'frog': ['🐸'], 'chicken': ['🐔', '🐓', '🐣', '🐤', '🐥'], 'penguin': ['🐧'], 'bird': ['🐦', '🕊️', '🦜'],
    'fish': ['🐟', '🐠', '🐡', '🦈', '🐳', '🐋'], 'octopus': ['🐙'], 'bug': ['🐛', '🦋', '🐝', '🐞', '🐌'],
    
    // Nature / Celestial
    'star': ['⭐', '🌟', '✨', '💫', '🌠'], 'moon': ['🌙', '🌚', '🌛', '🌝'], 'sun': ['🌞', '☀️', '🌤️'], 
    'rainbow': ['🌈'], 'cloud': ['☁️', '⛈️'], 'fire': ['🔥', '🌋'], 'water': ['💧', '🌊'], 'tree': ['🌲', '🌳', '🌴', '🌵'],
    'flower': ['🌸', '🌺', '🌹', '🌻', '🌼', '🌷'], 'leaf': ['🍃', '🍁', '🍀'],
    
    // Food
    'food': ['🍔', '🍕', '🥟', '🍜', '🍚', '🍙', '🍣', '🍱', '🍘', '🍥', '🍡'],
    'fruit': ['🍎', '🍓', '🍇', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍑', '🍒', '🥝'],
    'sweet': ['🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭'],
    'drink': ['🥤', '🧋', '🍵', '🥛', '🍹'],

    // Objects / Fun
    'robot': ['🤖'], 'unicorn': ['🦄'], 'alien': ['👽', '👾'], 'ghost': ['👻'], 'poop': ['💩'],
    'cool': ['😎', '🕶️'], 'happy': ['😄', '😊', '😁', '😆', '🤗'], 'silly': ['🤪', '😜', '😝'],
    'love': ['❤️', '💖', '🥰', '😍', '💝', '💘'], 'party': ['🎉', '🎈', '🎊', '🎁'],
    'music': ['🎵', '🎶', '🎹', '🎸', '🥁', '🎷', '🎺', '🎻'], 'sport': ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐'],
    'car': ['🚗', '🚕', '🚙', '🚌', '🏎️', '🚓', '🚑'], 'rocket': ['🚀', '🛸']
};

const generateFallbackSticker = (prompt: string): string => {
    // 1. Find best emoji
    const lower = prompt.toLowerCase();
    let selectedEmoji = '✨'; // Default
    
    // Simple keyword matching
    const keys = Object.keys(EMOJI_MAP);
    for (const key of keys) {
        if (lower.includes(key)) {
            const options = EMOJI_MAP[key];
            selectedEmoji = options[Math.floor(Math.random() * options.length)];
            break;
        }
    }
    
    // If no keyword match, check direct containment or use fun random
    if (selectedEmoji === '✨') {
        const funList = ['🚀', '🎈', '🎉', '🏆', '💎', '🧸', '🎨', '🧩', '🌈', '🍦', '🎮'];
        if (Math.random() > 0.3) {
             selectedEmoji = funList[Math.floor(Math.random() * funList.length)];
        }
    }

    // 2. Draw to Canvas
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
        // Clear
        ctx.clearRect(0, 0, 256, 256);
        
        // Settings
        const cx = 128;
        const cy = 148; // Slightly lower to center visually
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Try Noto Color Emoji first, then system fallback
        ctx.font = '160px "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        
        // Drop Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;

        // White Stroke (Sticker Border)
        ctx.lineWidth = 20;
        ctx.strokeStyle = 'white';
        ctx.lineJoin = 'round';
        ctx.strokeText(selectedEmoji, cx, cy);
        
        // Reset Shadow for fill to avoid double shadow blur
        ctx.shadowColor = 'transparent';
        
        // Fill Emoji
        ctx.fillText(selectedEmoji, cx, cy);
    }

    return canvas.toDataURL('image/png');
};

export const generateSticker = async (prompt: string, modelType: 'FAST' | 'QUALITY' | 'OFFLINE' = 'FAST'): Promise<string | null> => {
  // Direct Offline Mode
  if (modelType === 'OFFLINE') {
      return generateFallbackSticker(prompt);
  }

  try {
    const ai = getAI();
    
    // Choose model based on preference
    const model = modelType === 'QUALITY' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    
    const config: any = {
        imageConfig: {
          aspectRatio: "1:1",
        }
    };

    // Add imageSize only for Pro model (not supported on Flash Image)
    if (modelType === 'QUALITY') {
        config.imageConfig.imageSize = "1K";
    }

    const response = await callWithRetry(() => ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            text: `A cute, high-quality die-cut sticker design of: ${prompt}. Vector art style, white border, vibrant colors, isolated on white background. Do not include any text, letters, or Chinese characters in the image.`
          },
        ],
      },
      config: config,
    }));

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                const base64EncodeString: string = part.inlineData.data;
                return `data:image/png;base64,${base64EncodeString}`;
            }
        }
    }
    return null;
  } catch (error) {
    console.error("Error generating sticker (falling back to offline):", error);
    // AUTOMATIC FALLBACK: If API fails (Quota/Network), use offline generator
    return generateFallbackSticker(prompt);
  }
};

export const generateStoryBuilderImage = async (sentence: string): Promise<string | null> => {
  try {
    const ai = getAI();
    const response = await callWithRetry(() => ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: `A cute, colorful, kid-friendly illustration of: ${sentence}. Storybook style, vibrant colors, simple and cheerful. Do not include any text or words in the image.`
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        }
      },
    }));

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                const base64EncodeString: string = part.inlineData.data;
                return `data:image/png;base64,${base64EncodeString}`;
            }
        }
    }
    return null;
  } catch (error) {
    console.error("Error generating Story Builder image:", error);
    return null;
  }
};

export const generateDictionaryEntry = async (character: string): Promise<{
    pinyin: string;
    definition: string;
    simplified: string;
    traditional: string;
} | null> => {
  try {
    const ai = getAI();
    // Using gemini-3-flash-preview for fast dictionary lookup
    const response = await callWithRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [{
          text: `Analyze the Chinese character/word: "${character}".
          Return JSON with:
          - pinyin: Numbered pinyin (e.g. for 好 return 'hao3', for 妈妈 return 'ma1 ma'). Lowercase.
          - definition: Simple English meaning (1-5 words max).
          - simplified: The Simplified Chinese version.
          - traditional: The Traditional Chinese version.
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
            simplified: { type: Type.STRING },
            traditional: { type: Type.STRING }
          },
          required: ["pinyin", "definition", "simplified", "traditional"]
        }
      }
    }));

    const text = response.text;
    if (!text) throw new Error("No response");
    
    // Sanitize JSON before parsing
    const cleanText = cleanJson(text);
    return JSON.parse(cleanText);

  } catch (error) {
    console.error("Error generating dictionary entry:", error);
    return null;
  }
};

export const getCharacterDetails = async (character: string): Promise<{
    pinyin: string;
    definition: string;
    radical: string;
    strokeCount: number;
} | null> => {
  // 1. Try Server Proxy (Primary for Production Reliability)
  try {
      const res = await fetch(`/api/character-details?character=${encodeURIComponent(character)}`);
      if (res.ok) {
          return await res.json();
      }
  } catch (e) {
      console.warn("Server proxy for character details failed, trying client-side fallback...", e);
  }

  // 2. Fallback: Client-side AI (For Dev/Local or if Proxy fails)
  try {
    const ai = getAI();
    const response = await callWithRetry(() => ai.models.generateContent({
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
    }));

    const text = response.text;
    if (!text) throw new Error("No response");
    
    const cleanText = cleanJson(text);
    return JSON.parse(cleanText);

  } catch (error) {
    console.error("Error generating character details:", error);
    
    // 3. Final Fallback: Dictionary (Offline/Cache)
    try {
        const dict = await sheetService.getDictionary();
        const pinyin = dict[character];
        if (pinyin) {
            return {
                pinyin: pinyin,
                definition: '',
                radical: '?',
                strokeCount: 0
            };
        }
    } catch (e) {}

    return null;
  }
};

export const getSentencePinyin = async (sentence: string): Promise<string[]> => {
  try {
    const ai = getAI();
    const response = await callWithRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [{
          text: `Provide the pinyin for each character in the Chinese sentence: "${sentence}".
          Return a JSON array of strings, where each string is the pinyin with tone marks (e.g., "wǒ", "xǐ", "huān") for the corresponding character in the sentence. Ignore punctuation.
          `
        }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    }));

    const text = response.text;
    if (!text) throw new Error("No response");
    
    const cleanText = cleanJson(text);
    return JSON.parse(cleanText);

  } catch (error) {
    console.error("Error generating sentence pinyin:", error);
    return [];
  }
};

export const getSentenceMetadata = async (sentence: string): Promise<{
    pinyin: string[];
    translation: string;
} | null> => {
    try {
        const ai = getAI();
        const response = await callWithRetry(() => ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: {
                parts: [{
                    text: `Analyze this Chinese sentence: "${sentence}".
                    Return JSON with:
                    - pinyin: Array of pinyin strings for each character in the sentence (e.g. ["wǒ", "xǐ", "huān"]).
                    - translation: English translation.
                    `
                }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        pinyin: { type: Type.ARRAY, items: { type: Type.STRING } },
                        translation: { type: Type.STRING }
                    },
                    required: ["pinyin", "translation"]
                }
            }
        }));

        const text = response.text;
        if (!text) throw new Error("No response");
        
        const cleanText = cleanJson(text);
        return JSON.parse(cleanText);

    } catch (error) {
        console.error("Error generating sentence metadata:", error);
        return null;
    }
};

export const getFlashcardData = async (character: string): Promise<Flashcard> => {
  try {
    const ai = getAI();
    // Using gemini-3-flash-preview for faster response time on simple text tasks
    const response = await callWithRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [{
          text: `Generate flashcard data for the Chinese character: "${character}".
          Return JSON with:
          - pinyin: Numbered pinyin (e.g. for 好 return 'hao3', for 妈妈 return 'ma1 ma'). Lowercase.
          - definition: Simple English meaning (1-3 words max).
          - emoji: A single emoji that best represents the meaning (acts as a visual picture for the card).
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
            emoji: { type: Type.STRING }
          },
          required: ["pinyin", "definition", "emoji"]
        }
      }
    }));

    const text = response.text;
    if (!text) throw new Error("No response");
    
    // Sanitize JSON before parsing
    const cleanText = cleanJson(text);
    const data = JSON.parse(cleanText);
    return {
      character,
      ...data
    };

  } catch (error) {
    console.error("Error generating flashcard:", error);
    // Fallback
    return {
      character,
      pinyin: '?',
      definition: '...',
      emoji: '❓'
    };
  }
};

export const validatePinyinWithAI = async (character: string, userInput: string): Promise<{ isCorrect: boolean, feedback: string, standardPinyin: string }> => {
  try {
    const ai = getAI();
    // Use gemini-3-flash-preview for low latency validation
    const response = await callWithRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [{
          text: `Evaluate the pinyin input for the Chinese character(s): "${character}".
          User Input: "${userInput}"
          
          Task:
          Determine if the user's input is a correct pronunciation.
          
          Rules:
          1. Accept tone numbers (e.g. "hao3") OR tone marks (e.g. "hǎo").
          2. Case insensitive.
          3. If the character is a polyphone (多音字), accept any common valid pronunciation.
          4. Ignore spaces.
          
          Return JSON:
          {
            "isCorrect": boolean,
            "feedback": "Brief explanation (e.g. 'Correct!', 'Wrong tone, should be 3rd tone', 'Wrong initial sound')",
            "standardPinyin": "The correct standard numbered pinyin (e.g. 'hao3')"
          }`
        }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCorrect: { type: Type.BOOLEAN },
            feedback: { type: Type.STRING },
            standardPinyin: { type: Type.STRING }
          },
          required: ["isCorrect", "feedback", "standardPinyin"]
        }
      }
    }));

    if (response.text) {
        // Sanitize JSON before parsing
        const cleanText = cleanJson(response.text);
        return JSON.parse(cleanText);
    }
    throw new Error("No response from AI");
  } catch (error) {
    console.error("AI Pinyin validation error:", error);
    throw error;
  }
};

export const generateDistractors = async (answer: string, context: string): Promise<string[]> => {
    try {
        const ai = getAI();
        // Upgraded to Gemini 3 Pro for smarter distractor generation
        const response = await callWithRetry(() => ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: {
                parts: [{
                    text: `Generate 3 plausible but incorrect Chinese character/word options for filling in the blank. 
                    Context: "${context}"
                    Correct Answer: "${answer}"
                    Options should be distinct from the correct answer.
                    Return ONLY a JSON array of 3 strings.`
                }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        }));

        const text = response.text;
        if (!text) return ["一", "不", "人"];
        return JSON.parse(cleanJson(text));
    } catch (error) {
        console.error("Error generating distractors:", error);
        return ["一", "不", "人"]; // Super basic fallback
    }
};

export const gradeHandwriting = async (
  character: string, 
  imageBase64: string
): Promise<GradingResult> => {
  try {
    // Remove header if present (e.g., "data:image/png;base64,")
    const cleanBase64 = imageBase64.split(',')[1] || imageBase64;

    const ai = getAI();
    // Upgraded to Gemini 3 Pro for superior vision analysis and grading feedback
    const response = await callWithRetry(() => ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: cleanBase64
            }
          },
          {
            text: `You are a strict and expert Chinese Calligraphy teacher. 
            The student is trying to write the character: "${character}".
            Analyze the provided image of their handwriting.
            
            Evaluate based on:
            1. Stroke accuracy (are all strokes present and in correct relative position?)
            2. Proportions (is the character balanced?)
            3. Legibility.

            Provide a score from 0 to 100.
            Provide brief, constructive feedback.
            Provide 1-3 specific correction points (e.g. "The left radical is too small", "The final stroke should be longer").
            
            Be encouraging but honest. If the image is blank or unrecognizable as the character, give a low score.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER },
            feedback: { type: Type.STRING },
            corrections: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["score", "feedback", "corrections"]
        }
      }
    }));

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(cleanJson(text)) as GradingResult;

  } catch (error) {
    console.error("Error grading handwriting:", error);
    // Fallback in case of error
    return {
      score: 0,
      feedback: "Failed to grade the image. Please try again.",
      corrections: []
    };
  }
};

export const generateQuizFromSentence = async (sentence: string): Promise<{
    question: string;
    answer: string;
    options: string[];
    pinyin: string;
    translation: string;
} | null> => {
    try {
        const ai = getAI();
        const response = await callWithRetry(() => ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: {
                parts: [{
                    text: `Create a fill-in-the-blank quiz from this Chinese sentence: "${sentence}".
                    1. Identify a key word (noun or verb) to blank out.
                    2. Create the question string with "___" replacing the key word.
                    3. Provide the key word as the answer.
                    4. Generate 3 plausible but incorrect distractors (same part of speech).
                    5. Provide the full sentence pinyin.
                    6. Provide the English translation.
                    
                    Return JSON:
                    {
                        "question": "Sentence with ___",
                        "answer": "KeyWord",
                        "options": ["KeyWord", "Distractor1", "Distractor2", "Distractor3"] (shuffled),
                        "pinyin": "Full sentence pinyin",
                        "translation": "English translation"
                    }`
                }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        question: { type: Type.STRING },
                        answer: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        pinyin: { type: Type.STRING },
                        translation: { type: Type.STRING }
                    },
                    required: ["question", "answer", "options", "pinyin", "translation"]
                }
            }
        }));
        
        const text = response.text;
        if (!text) throw new Error("No response");
        return JSON.parse(cleanJson(text));
    } catch (e) {
        console.error("Error generating quiz:", e);
        return null;
    }
};


