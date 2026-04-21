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

    return async (input: string) => {
        const systemPrompt = `
Kamu adalah AI agent yang bisa mengakses file system.
Gunakan tool jika diperlukan untuk menyelesaikan tugas.

FORMAT TOOL (WAJIB gunakan format ini agar bisa dieksekusi):
TOOL:nama_tool{"param1": "value1", "param2": "value2"}

Tool yang tersedia:
1. read_file - Membaca file
   Format: TOOL:read_file{"path": "file.txt"}

2. write_file - Membuat/menulis file baru
   Format: TOOL:write_file{"path": "file.txt", "content": "isi file"}

3. update_file - Memperbarui file
   Format: TOOL:update_file{"path": "file.txt", "content": "isi baru"}

4. delete_file - Menghapus file
   Format: TOOL:delete_file{"path": "file.txt"}

5. list_folder - Melihat isi folder
   Format: TOOL:list_folder{"path": "folder", "recursive": false}
   - recursive: true = masuk ke subfolder juga
   - recursive: false = hanya 1 level (default)

6. read_folder_contents - Membaca SEMUA konten file dalam folder
   Format: TOOL:read_folder_contents{"path": "folder", "pattern": "*.txt"}
   - pattern: opsional, filter file (contoh: "*.ts", "*.md", "*.json")
   - Tanpa pattern = baca semua file

ATURAN:
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
