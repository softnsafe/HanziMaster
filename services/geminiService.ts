
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { GradingResult, Flashcard } from '../types';

// Lazy initialization of AI instance
let aiInstance: GoogleGenAI | null = null;

const getAI = (): GoogleGenAI => {
  if (!aiInstance) {
    // Fallback to empty string to prevent crash if key is missing during render
    const apiKey = process.env.API_KEY || ''; 
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

// --- Audio Decoding Helpers ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

let audioContext: AudioContext | null = null;

export const playPronunciation = async (text: string) => {
  try {
      if (!audioContext) {
          audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
      }
      
      if (audioContext.state === 'suspended') {
          await audioContext.resume();
      }

      const ai = getAI();
      const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: text }] }],
          config: {
              responseModalities: [Modality.AUDIO], 
              speechConfig: {
                  voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: 'Kore' }
                  }
              }
          }
      });
      
      const part = response.candidates?.[0]?.content?.parts?.[0];
      
      if (!part || !part.inlineData || !part.inlineData.data) {
          // Check if we got text back instead (error description or refusal)
          if (part && part.text) {
             console.warn("Gemini TTS returned text:", part.text);
          }
          throw new Error("No audio data returned in response");
      }

      const base64Audio = part.inlineData.data;

      const audioBuffer = await decodeAudioData(
          decode(base64Audio),
          audioContext,
          24000,
          1
      );
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();

  } catch (error) {
      console.error("Gemini TTS Error:", error);
      // Fallback to browser TTS
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      window.speechSynthesis.speak(utterance);
  }
};
// -----------------------------

export const generateLobbyBackground = async (): Promise<string | null> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
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
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
        for (const part of parts) {
            if (part.inlineData) {
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

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            text: `A cute, high-quality die-cut sticker design of: ${prompt}. Vector art style, white border, vibrant colors, isolated on white background. Do not include any text, letters, or Chinese characters in the image.`
          },
        ],
      },
      config: config,
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
        for (const part of parts) {
            if (part.inlineData) {
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

export const getFlashcardData = async (character: string): Promise<Flashcard> => {
  try {
    const ai = getAI();
    // Upgraded to Gemini 3 Pro for better definitions and pinyin accuracy
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [{
          text: `Generate flashcard data for the Chinese character: "${character}".
          Return JSON with:
          - pinyin: Numbered pinyin (e.g. for 好 return 'hao3', for 妈妈 return 'ma1 ma'). Lowercase.
          - definition: Simple English meaning (1-3 words max).
          - emoji: A single emoji that best represents the meaning (acts as a picture).
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
    });

    const text = response.text;
    if (!text) throw new Error("No response");
    
    const data = JSON.parse(text);
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

export const generateDistractors = async (answer: string, context: string): Promise<string[]> => {
    try {
        const ai = getAI();
        // Upgraded to Gemini 3 Pro for smarter distractor generation
        const response = await ai.models.generateContent({
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
        });

        const text = response.text;
        if (!text) return ["一", "不", "人"];
        return JSON.parse(text);
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
    const response = await ai.models.generateContent({
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
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text) as GradingResult;

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
