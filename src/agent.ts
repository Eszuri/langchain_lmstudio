import {llm} from "./llm.js";
import {tools} from "./tools/fileTool.js";
import {HumanMessage, SystemMessage, AIMessage} from "@langchain/core/messages";

type ToolMap = Record<string, any>;

export const createAgent = () => {
    const toolMap: ToolMap = Object.fromEntries(
        tools.map((t) => [t.name, t.func])
    );

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

    return async (input: string) => {
        const systemPrompt = `
Kamu adalah AI agent yang bisa mengakses file system.
Gunakan tool jika diperlukan untuk menyelesaikan tugas.

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
📋 FORMAT TOOL (WAJIB gunakan format ini agar bisa dieksekusi):
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
   - recursive: false = hanya 1 level (default)

6. read_folder_contents — Membaca SEMUA konten file dalam folder
   Contoh format: TOOL:read_folder_contents{"path": "<NAMA_FOLDER_USER>", "pattern": "*.txt"}
   - pattern: opsional, filter file (contoh: "*.ts", "*.md", "*.json")
   - Tanpa pattern = baca semua file

Catatan teknis:
- Path relatif akan di-resolve ke WORKSPACE_DIR
- Path absolut bisa langsung digunakan
- Gunakan tool sesuai kebutuhan user
- Perhatikan riwayat percakapan sebelumnya
`;

        const messages = [
            new SystemMessage(systemPrompt),
            ...chatHistory,
            new HumanMessage(input),
        ];

        const response = await llm.invoke(messages);
        let text = response.content as string;

        const toolCalls = parseToolCalls(text);

        if (toolCalls.length > 0) {
            const toolResults = await executeTools(toolCalls);

            const followUpMessages = [
                new SystemMessage(systemPrompt),
                ...chatHistory,
                new HumanMessage(input),
                new AIMessage(text),
                new HumanMessage(`Berikut hasil eksekusi tool:\n${toolResults}\nJelaskan hasilnya ke user.`),
            ];

            const finalResponse = await llm.invoke(followUpMessages);
            text = finalResponse.content as string;
        }

        addToHistory(input, text);
        return text;
    };
};
