import {llm} from "./llm.js";
import {tools} from "./tools/fileTool.js";
import {HumanMessage, SystemMessage, AIMessage} from "@langchain/core/messages";
import readline from "readline";
import "dotenv/config";

const LMSTUDIO_URL = process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1";
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.cwd();
const LMSTUDIO_MODEL_NAME = process.env.LMSTUDIO_MODEL_NAME;
const SLASH_AUTOCOMPLETE_ITEMS = [
    "/help",
    "/tools",
    "/clear",
    "/exit",
    "/quit",
    "/read_file",
    "/write_file",
    "/update_file",
    "/delete_file",
    "/list_folder",
    "/read_folder_contents",
];

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
    const toolStartPattern = /TOOL:(\w+)\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = toolStartPattern.exec(text)) !== null) {
        const name = match[1];
        const jsonStart = text.indexOf("{", match.index);
        if (jsonStart === -1) continue;

        const jsonText = extractBalancedJsonObject(text, jsonStart);
        if (!jsonText) continue;

        try {
            const params = JSON.parse(jsonText);
            toolCalls.push({name, params});
        } catch {
            // Skip invalid JSON
        }
    }

    return toolCalls;
}

function extractBalancedJsonObject(text: string, startIndex: number): string | null {
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let i = startIndex; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            if (isEscaped) {
                isEscaped = false;
                continue;
            }
            if (char === "\\") {
                isEscaped = true;
                continue;
            }
            if (char === "\"") {
                inString = false;
            }
            continue;
        }

        if (char === "\"") {
            inString = true;
            continue;
        }

        if (char === "{") {
            depth++;
        } else if (char === "}") {
            depth--;
            if (depth === 0) {
                return text.slice(startIndex, i + 1);
            }
        }
    }

    return null;
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
    console.log("📌 \x1b[33mAutocomplete command: tekan '/' lalu TAB\x1b[0m\n");
    console.log("═".repeat(50) + "\n");
}

async function startChat() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: (line: string) => {
            const trimmed = line.trim();
            if (!trimmed.startsWith("/")) {
                return [[], line];
            }

            const hits = SLASH_AUTOCOMPLETE_ITEMS.filter((item) => item.startsWith(trimmed));
            return [hits.length ? hits : SLASH_AUTOCOMPLETE_ITEMS, line];
        },
    });

    readline.emitKeypressEvents(process.stdin, rl);
    process.stdin.on("keypress", (str) => {
        if (str !== "/") return;
        if (rl.line.trim().length > 0) return;

        console.log("\n\x1b[35m⚡ Autocomplete aktif:\x1b[0m ketik command lalu tekan TAB");
        console.log("\x1b[90mContoh: /read_file, /write_file, /list_folder, /exit\x1b[0m");
        rl.prompt(true);
    });

    const askQuestion = () => {
        rl.question("\n\x1b[32m👤 You:\x1b[0m ", async (input) => {
            const userInput = input.trim();

            if (userInput === "/help") {
                console.log("\n📘 Command autocomplete:");
                console.log("  /help  - Tampilkan bantuan command");
                console.log("  /tools - Tampilkan daftar tool");
                console.log("  /clear - Bersihkan layar");
                console.log("  /exit  - Keluar dari aplikasi");
                console.log("  /quit  - Keluar dari aplikasi");
                askQuestion();
                return;
            }

            if (userInput === "/tools") {
                console.log("\n🧰 Tool yang tersedia:");
                console.log("  /read_file, /write_file, /update_file, /delete_file");
                console.log("  /list_folder, /read_folder_contents");
                askQuestion();
                return;
            }

            if (userInput === "/clear") {
                console.clear();
                askQuestion();
                return;
            }

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

═══════════════════════════════════════════════════
🚨 ATURAN PENTING — PATUHI SECARA KETAT:
═══════════════════════════════════════════════════

1. HANYA gunakan tool jika user meminta operasi file/folder secara eksplisit.
2. JANGAN PERNAH gunakan path contoh dari daftar di bawah ini sebagai path nyata.
3. Jika user meminta membuat/menulis file, gunakan nama file yang SPESIFIK sesuai permintaan user.
4. Jika user meminta mengupdate file yang sudah ada, gunakan nama file yang sama persis.
5. Jika tidak ada permintaan operasi file, jawab langsung tanpa tool.
6. Jangan memanggil tool hanya untuk mendemonstrasikan cara kerja — hanya eksekusi jika ada tugas nyata dari user.

═══════════════════════════════════════════════════
📋 FORMAT TOOL (HANYA gunakan jika user minta operasi file/folder):
═══════════════════════════════════════════════════

TOOL:nama_tool{"param1": "value1", "param2": "value2"}

Tool yang tersedia:

1. read_file — Membaca file
   Contoh format: TOOL:read_file{"path": "<NAMA_FILE_USER>"}

2. write_file — Membuat/menulis file baru
   Contoh format: TOOL:write_file{"path": "<NAMA_FILE_USER>", "content": "<ISI_FILE>"}

3. update_file — Memperbarui file yang sudah ada
   Contoh format: TOOL:update_file{"path": "<NAMA_FILE_USER>", "content": "<ISI_BARU>"}

4. delete_file — Menghapus file
   Contoh format: TOOL:delete_file{"path": "<NAMA_FILE_USER>"}

5. list_folder — Melihat isi folder
   Contoh format: TOOL:list_folder{"path": "<NAMA_FOLDER_USER>", "recursive": false}
   - recursive: true = masuk ke subfolder juga

6. read_folder_contents — Membaca SEMUA konten file dalam folder
   Contoh format: TOOL:read_folder_contents{"path": "<NAMA_FOLDER_USER>", "pattern": "*.ts"}
   - pattern: opsional, filter file (contoh: "*.ts", "*.md")
   - Tanpa pattern = baca semua file

Catatan teknis:
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
    console.log("║  🤖 Chat AI dengan " + LMSTUDIO_MODEL_NAME + "              ║");
    console.log("║  Powered by LM Studio + LangChain                ║");
    console.log("║  💾 Memory: Aktif (5 putaran)                    ║");
    console.log("║  📂 Workspace: Folder Environment                ║");
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
