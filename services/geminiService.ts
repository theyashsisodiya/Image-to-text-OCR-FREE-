
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // In a real app, you might want to handle this more gracefully.
  // For this environment, we assume the API key is always available.
  console.warn("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });
const model = "gemini-2.5-flash";

export const extractTextFromImage = async (base64Image: string): Promise<string> => {
  try {
    const imagePart = {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Image,
      },
    };

    const textPart = {
      text: "Perform OCR on this image. Extract all text, maintaining its original line breaks and structure as closely as possible. The image is a cropped section of a larger document, focus on accuracy.",
    };

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [imagePart, textPart] },
    });
    
    return response.text;
  } catch (error) {
    console.error("Error extracting text from image:", error);
    throw new Error("Failed to communicate with the Gemini API. Please check your connection and API key.");
  }
};
