import { GoogleGenAI, Type } from "@google/genai";
import { GradingResult } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const gradeHandwriting = async (
  character: string, 
  imageBase64: string
): Promise<GradingResult> => {
  try {
    // Remove header if present (e.g., "data:image/png;base64,")
    const cleanBase64 = imageBase64.split(',')[1] || imageBase64;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
            Provide 1-3 specific correction points (e.g., "The left radical is too small", "The final stroke should be longer").
            
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