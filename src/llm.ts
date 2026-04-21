import {ChatOpenAI} from "@langchain/openai";

export const llm = new ChatOpenAI({
    temperature: 0.7,           // 0 = deterministic, 1 = kreatif
    modelName: process.env.LMSTUDIO_MODEL_NAME,  // Sesuaikan dengan nama model di LM Studio
    apiKey: process.env.OPENAI_API_KEY || "lm-studio", // API key dummy untuk LM Studio
    configuration: {
        baseURL: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
    },
    maxTokens: 2048,            // Maksimum token output
    streaming: false,           // Set true untuk streaming response
});

// Alternative: Streaming enabled version
export const llmStreaming = new ChatOpenAI({
    temperature: 0.7,
    modelName: process.env.LMSTUDIO_MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY || "lm-studio",
    configuration: {
        baseURL: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
    },
    maxTokens: 2048,
    streaming: true,
});

// Model untuk task yang membutuhkan presisi tinggi
export const llmPrecise = new ChatOpenAI({
    temperature: 0.1,
    modelName: process.env.LMSTUDIO_MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY || "lm-studio",
    configuration: {
        baseURL: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
    },
    maxTokens: 1024,
    streaming: false,
});
