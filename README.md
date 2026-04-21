# LangChain + LM Studio + Qwen3.5-0.8b

Konfigurasi LangChain dengan TypeScript menggunakan model AI lokal dari LM Studio.

## 🎯 Model yang Digunakan

- **Model**: Qwen3.5-0.8b (atau model lain yang tersedia di LM Studio)
- **Parameter**: 0.8B (ringan, cocok untuk laptop/PC biasa)
- **Framework**: LangChain + TypeScript

## 📋 Prerequisites

1. [Node.js](https://nodejs.org/) (v18+)
2. [LM Studio](https://lmstudio.ai/) terinstall
3. Model Qwen3.5-0.8b sudah didownload di LM Studio

## 🚀 Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup LM Studio

1. Buka LM Studio
2. Download model: **Qwen3.5-0.8b** (tab Discover → Search → Download)
3. Pergi ke tab **Developer**
4. Klik **Start Server** (default port: 1234)
5. Load model di chat tab (pilih model Qwen3.5-0.8b)

### 3. Jalankan Project

```bash
# Development mode dengan auto-reload
npm run dev

# Build untuk production
npm run build

# Run production build
npm start
```

## 📁 Struktur File

```
├── src/
│   ├── index.ts       # Contoh penggunaan dasar
│   ├── llm.ts         # Konfigurasi LLM untuk LM Studio
│   ├── agent.ts       # Contoh agent (jika tersedia)
│   └── tools/         # Tools directory
├── .env               # Environment variables
├── package.json
└── tsconfig.json
```

## ⚙️ Konfigurasi

### Environment Variables (.env)

```env
OPENAI_API_KEY=lm-studio           # Dummy API key
LMSTUDIO_BASE_URL=http://localhost:1234/v1  # LM Studio server URL
```

### LLM Configuration (src/llm.ts)

```typescript
export const llm = new ChatOpenAI({
    temperature: 0.7,              // 0-1, semakin tinggi semakin kreatif
    modelName: "qwen3.5-0.8b",     // Nama model di LM Studio
    openAIApiKey: "lm-studio",     // Dummy key untuk LM Studio
    configuration: {
        baseURL: "http://localhost:1234/v1",
    },
    maxTokens: 2048,
});
```

## 📖 Contoh Penggunaan

### Simple Chat
```typescript
import { llm } from "./llm.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const response = await llm.invoke([
    new SystemMessage("Kamu adalah asisten yang ramah."),
    new HumanMessage("Halo, apa kabar?"),
]);

console.log(response.content);
```

### Dengan Prompt Template
```typescript
import { ChatPromptTemplate } from "@langchain/core/prompts";

const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Kamu adalah ahli {bidang}."],
    ["human", "{pertanyaan}"],
]);

const chain = prompt.pipe(llm);
const result = await chain.invoke({
    bidang: "pemrograman",
    pertanyaan: "Apa itu TypeScript?",
});
```

### Streaming Response
```typescript
const stream = await llmStreaming.stream([
    new HumanMessage("Ceritakan sesuatu yang menarik"),
]);

for await (const chunk of stream) {
    process.stdout.write(chunk.content as string);
}
```

## 🔧 Troubleshooting

### Error: Connection refused

Pastikan LM Studio server sudah running:
1. Buka LM Studio → Developer tab → Start Server
2. Cek URL di `.env` sesuai dengan yang ditampilkan di LM Studio

### Model tidak ditemukan

- Pastikan model sudah di-download
- Pastikan model sudah di-load di chat tab
- Cek nama model di `modelName` sesuai dengan yang ada di LM Studio

### Response lambat

- Qwen3.5-0.8b ringan, tapi tetap tergantung hardware
- Turunkan `maxTokens` jika terlalu lambat
- Gunakan model yang lebih kecil jika perlu

## 📚 Resources

- [LangChain JS Documentation](https://js.langchain.com/)
- [LM Studio Documentation](https://lmstudio.ai/docs)
- [Qwen Model](https://github.com/QwenLM/Qwen)

## 📝 License

ISC
