import {llm} from "./llm.js";
import {tools} from "./tools/fileTool.js";
import {HumanMessage, SystemMessage, AIMessage} from "@langchain/core/messages";
import readline from "readline";
import "dotenv/config";

const LMSTUDIO_URL = process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1";
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.cwd();
const LMSTUDIO_MODEL_NAME = process.env.LMSTUDIO_MODEL_NAME;

// ==================== MEMORY ====================
const MAX_HISTORY_PAIRS = 5;
const chatHistory: (HumanMessage | AIMessage)[] = [];

function addToHistory(userText: string, aiText: string) {
    chatHistory.push(new HumanMessage(userText));
    chatHistory.push(new AIMessage(aiText));
    const maxMessages = MAX_HISTORY_PAIRS * 2;
    while (chatHistory.length > maxMessages) {
        chatHistory.shift();
    }
}
// ================================================

const toolMap: Record<string, any> = Object.fromEntries(
    tools.map((t) => [t.name, t.func])
);

function parseToolCalls(text: string): Array<{name: string; params: any}> {
    const toolCalls: Array<{name: string; params: any}> = [];
    const toolPattern = /TOOL:(\w+)\s*(\{[\s\S]*?\})/g;
    let match;

    while ((match = toolPattern.exec(text)) !== null) {
        try {
            const name = match[1];
            const params = JSON.parse(match[2]);
            toolCalls.push({name, params});
        } catch {
            // Skip invalid JSON
        }
    }

    return toolCalls;
}

async function executeTools(toolCalls: Array<{name: string; params: any}>): Promise<string> {
    const results: string[] = [];

    for (const call of toolCalls) {
        const tool = toolMap[call.name];
        if (!tool) {
            results.push(`❌ Tool "${call.name}" tidak ditemukan`);
            continue;
        }

        try {
            const result = await tool(call.params);
            results.push(`✅ ${call.name}: ${result}`);
        } catch (error) {
            results.push(`❌ ${call.name}: ${(error as Error).message}`);
        }
    }

    return results.join("\n");
}

function showLoading(message: string): NodeJS.Timeout {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;
    process.stdout.write(`\n${message} `);
    return setInterval(() => {
        process.stdout.write(`\r${message} \x1b[36m${frames[i]}\x1b[0m `);
        i = (i + 1) % frames.length;
    }, 80);
}

function stopLoading(interval: NodeJS.Timeout, message: string, success: boolean) {
    clearInterval(interval);
    const icon = success ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`\r${message} ${icon}`);
}

async function checkServerStatus(): Promise<boolean> {
    const loading = showLoading("🔍 Mengecek koneksi ke LM Studio...");
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${LMSTUDIO_URL}/models`, {
            method: "GET",
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok) {
            stopLoading(loading, "🔍 Mengecek koneksi ke LM Studio...", true);
            return true;
        }
        stopLoading(loading, "🔍 Mengecek koneksi ke LM Studio...", false);
        return false;
    } catch {
        stopLoading(loading, "🔍 Mengecek koneksi ke LM Studio...", false);
        return false;
    }
}

function showServerDownMessage() {
    console.log("\n" + "═".repeat(50));
    console.log("\x1b[31m❌ LM Studio Server Tidak Ditemukan!\x1b[0m");
    console.log("═".repeat(50));
    console.log("\n📋 Langkah-langkah untuk memperbaiki:\n");
    console.log("1️⃣  Buka aplikasi \x1b[33mLM Studio\x1b[0m");
    console.log("2️⃣  Download model \x1b[33mqwen3.5-0.8b\x1b[0m (jika belum)");
    console.log("3️⃣  Pergi ke tab \x1b[33mDeveloper\x1b[0m → \x1b[33mStart Server\x1b[0m");
    console.log("4️⃣  Pastikan server berjalan di \x1b[33mhttp://localhost:1234\x1b[0m");
    console.log("5️⃣  Run aplikasi ini lagi\n");
    console.log("═".repeat(50) + "\n");
}

function showServerUpMessage() {
    console.log("\n" + "═".repeat(50));
    console.log("\x1b[32m✅ LM Studio Server Terhubung!\x1b[0m");
    console.log("═".repeat(50));
    console.log("\n🤖 \x1b[36mModel:\x1b[0m " + LMSTUDIO_MODEL_NAME);
    console.log("🔗 \x1b[36mServer:\x1b[0m " + LMSTUDIO_URL);
    console.log("📂 \x1b[36mWorkspace:\x1b[0m " + WORKSPACE_DIR);
    console.log("💾 \x1b[36mMemory:\x1b[0m Aktif (" + MAX_HISTORY_PAIRS + " putaran)");
    console.log("📁 \x1b[36mTools:\x1b[0m read, write, update, delete, list, read-all");
    console.log("\n📌 \x1b[33mKetik pesanmu dan tekan Enter\x1b[0m");
    console.log("📌 \x1b[33mKetik 'exit' atau 'quit' untuk keluar\x1b[0m\n");
    console.log("═".repeat(50) + "\n");
}

async function startChat() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const askQuestion = () => {
        rl.question("\n\x1b[32m👤 You:\x1b[0m ", async (input) => {
            const userInput = input.trim();

            if (!userInput) {
                askQuestion();
                return;
            }

            if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
                console.log("\n\x1b[36m👋 Sampai jumpa!\x1b[0m\n");
                rl.close();
                process.exit(0);
            }

            const loading = showLoading("🤖 AI sedang berpikir");

            try {
                const systemPrompt = `
Kamu adalah asisten AI yang ramah dan bisa mengakses file system.
Jawab pertanyaan user dengan jelas dan mudah dipahami.
Jika user bertanya dalam Bahasa Indonesia, jawab dalam Bahasa Indonesia.
Jika user bertanya dalam Bahasa Inggris, jawab dalam Bahasa Inggris.

Konteks: Ini adalah percakapan berkelanjutan. Perhatikan riwayat pesan sebelumnya.

📂 WORKSPACE SAAT INI: ${WORKSPACE_DIR}
Path relatif akan di-resolve ke workspace ini.

FORMAT TOOL (gunakan jika user minta operasi file/folder):
TOOL:nama_tool{"param1": "value1", "param2": "value2"}

Tool yang tersedia:
1. read_file - Membaca file
   Format: TOOL:read_file{"path": "file.txt"}

2. write_file - Membuat/menulis file
   Format: TOOL:write_file{"path": "file.txt", "content": "isi"}

3. update_file - Memperbarui file
   Format: TOOL:update_file{"path": "file.txt", "content": "isi baru"}

4. delete_file - Menghapus file
   Format: TOOL:delete_file{"path": "file.txt"}

5. list_folder - Melihat isi folder
   Format: TOOL:list_folder{"path": "folder", "recursive": false}
   - recursive: true = masuk ke subfolder juga

6. read_folder_contents - Membaca SEMUA konten file dalam folder
   Format: TOOL:read_folder_contents{"path": "folder", "pattern": "*.ts"}
   - pattern: opsional, filter file (contoh: "*.ts", "*.md")
   - Tanpa pattern = baca semua file

ATURAN:
- Gunakan tool sesuai kebutuhan user
- Path relatif akan di-resolve ke WORKSPACE_DIR
- Path absolut bisa langsung digunakan
- Setelah tool dieksekusi, hasilnya akan otomatis ditampilkan
`;

                // Langkah 1: AI merencanakan
                const messages = [
                    new SystemMessage(systemPrompt),
                    ...chatHistory,
                    new HumanMessage(userInput),
                ];

                const response = await llm.invoke(messages);
                let text = response.content as string;

                // Langkah 2: Eksekusi tool jika ada
                const toolCalls = parseToolCalls(text);

                if (toolCalls.length > 0) {
                    console.log(`\n\x1b[33m🔧 Menjalankan ${toolCalls.length} tool...\x1b[0m`);
                    const toolResults = await executeTools(toolCalls);

                    // Langkah 3: AI menjelaskan hasil
                    const followUpMessages = [
                        new SystemMessage(systemPrompt),
                        ...chatHistory,
                        new HumanMessage(userInput),
                        new AIMessage(text),
                        new HumanMessage(`Berikut hasil eksekusi tool:\n${toolResults}\nJelaskan hasilnya ke user dalam bahasa yang sama.`),
                    ];

                    const finalResponse = await llm.invoke(followUpMessages);
                    text = finalResponse.content as string;
                }

                // Simpan ke memory
                addToHistory(userInput, text);

                stopLoading(loading, "", true);
                console.log(`\x1b[36m🤖 AI:\x1b[0m ${text}`);
            } catch (error) {
                stopLoading(loading, "", false);
                console.log("\n\x1b[31m❌ Error: Gagal mendapatkan response\x1b[0m");
                if (error instanceof Error) {
                    console.log(`   \x1b[90mDetail: ${error.message}\x1b[0m`);
                }
                console.log("\n\x1b[33m💡 Coba restart LM Studio server\x1b[0m");
            }

            askQuestion();
        });
    };

    askQuestion();
}

async function main() {
    console.clear();
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║  🤖 Chat AI dengan" + LMSTUDIO_MODEL_NAME + "                   ║");
    console.log("║  Powered by LM Studio + LangChain                ║");
    console.log("║  💾 Memory: Aktif (5 putaran)                   ║");
    console.log("║  📂 Workspace: Folder Environment               ║");
    console.log("╚══════════════════════════════════════════════════╝");

    const isServerRunning = await checkServerStatus();

    if (!isServerRunning) {
        showServerDownMessage();
        process.exit(1);
    }

    showServerUpMessage();
    await startChat();
}

main().catch((error) => {
    console.error("\n❌ Unexpected error:", error);
    process.exit(1);
});
