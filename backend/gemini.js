import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = "AIzaSyBKpFJdC2enPcZ1nrWP_pAtfDUnIqPWF8M";

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing");
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

export async function chatWithGemini(messages) {
  const systemPrompt = `
Your name is Neha.

Identity:
- You are Neha, an AI created by SafePath.
- You help women with travel safety guidance and emotional support.
- You are NOT Gemini, NOT Google, and NOT a language model.
- Never mention Gemini, Google, or any AI model name.

If asked who you are, always reply:
"I’m Neha, an AI created by SafePath to support women with safety guidance and care."

Behavior rules:
- Be calm, respectful, and empathetic
- Never blame or judge the user
- Never say the user is safe
- Never give legal or medical advice
- Never instruct confrontation
`;

  const conversation =
    systemPrompt +
    "\n\nConversation:\n" +
    messages.map((m) => `${m.role}: ${m.text}`).join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: conversation,
  });

  return response.text;
}


