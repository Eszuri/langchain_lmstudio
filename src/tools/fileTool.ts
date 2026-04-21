import fs from "fs-extra";
import path from "path";

// ==================== WORKSPACE CONFIGURATION ====================
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.cwd();
// ================================================================

function resolvePath(filePath: string): string {
    // Jika path absolut, gunakan langsung
    if (path.isAbsolute(filePath)) {
        return filePath;
    }
    // Jika relatif, gabungkan dengan workspace
    return path.join(WORKSPACE_DIR, filePath);
}

export const tools = [
    {
        name: "read_file",
        description: "Membaca isi file dari path lokal",
        func: async ({path: filePath}: {path: string}) => {
            try {
                const resolved = resolvePath(filePath);
                const content = await fs.readFile(resolved, "utf-8");
                return content;
            } catch (error) {
                return `Error: File tidak ditemukan atau tidak bisa dibaca - ${(error as Error).message}`;
            }
        },
    },
    {
        name: "write_file",
        description: "Menulis file ke path lokal. Jika file sudah ada akan ditimpa (overwrite)",
        func: async ({path: filePath, content}: {path: string; content: string}) => {
            try {
                const resolved = resolvePath(filePath);
                await fs.ensureFile(resolved);
                await fs.writeFile(resolved, content, "utf-8");
                return `File berhasil ditulis: ${resolved}`;
            } catch (error) {
                return `Error: Gagal menulis file - ${(error as Error).message}`;
            }
        },
    },
    {
        name: "update_file",
        description: "Memperbarui isi file yang sudah ada. Jika file tidak ada, akan dibuat baru",
        func: async ({path: filePath, content}: {path: string; content: string}) => {
            try {
                const resolved = resolvePath(filePath);
                await fs.ensureFile(resolved);
                await fs.writeFile(resolved, content, "utf-8");
                return `File berhasil diperbarui: ${resolved}`;
            } catch (error) {
                return `Error: Gagal memperbarui file - ${(error as Error).message}`;
            }
        },
    },
    {
        name: "delete_file",
        description: "Menghapus file lokal",
        func: async ({path: filePath}: {path: string}) => {
            try {
                const resolved = resolvePath(filePath);
                await fs.remove(resolved);
                return `File berhasil dihapus: ${resolved}`;
            } catch (error) {
                return `Error: Gagal menghapus file - ${(error as Error).message}`;
            }
        },
    },
    {
        name: "list_folder",
        description: "Menampilkan semua isi folder (file dan subfolder). Gunakan recursive:true untuk masuk ke subfolder juga",
        func: async ({path: folderPath, recursive}: {path: string; recursive?: boolean}) => {
            try {
                const resolved = resolvePath(folderPath);

                if (!await fs.pathExists(resolved)) {
                    return `Error: Folder tidak ditemukan: ${resolved}`;
                }

                const stats = await fs.stat(resolved);
                if (!stats.isDirectory()) {
                    return `Error: Path ini adalah file, bukan folder: ${resolved}`;
                }

                if (recursive) {
                    // Recursive: baca semua file dalam folder dan subfolder
                    const items: string[] = [];

                    async function walk(dir: string, prefix: string = "") {
                        const entries = await fs.readdir(dir, {withFileTypes: true});

                        for (const entry of entries) {
                            const fullPath = path.join(dir, entry.name);
                            const relativePath = path.relative(WORKSPACE_DIR, fullPath);

                            if (entry.isDirectory()) {
                                items.push(`📁 ${prefix}${entry.name}/`);
                                await walk(fullPath, prefix + "  ");
                            } else {
                                const fileStats = await fs.stat(fullPath);
                                const size = formatSize(fileStats.size);
                                items.push(`📄 ${prefix}${entry.name} (${size})`);
                            }
                        }
                    }

                    await walk(resolved);
                    return `Isi folder (recursive) ${resolved}:\n${items.join("\n")}`;
                } else {
                    // Non-recursive: hanya 1 level
                    const entries = await fs.readdir(resolved, {withFileTypes: true});
                    const items = await Promise.all(
                        entries.map(async (entry) => {
                            const fullPath = path.join(resolved, entry.name);
                            if (entry.isDirectory()) {
                                return `📁 ${entry.name}/`;
                            } else {
                                const fileStats = await fs.stat(fullPath);
                                const size = formatSize(fileStats.size);
                                return `📄 ${entry.name} (${size})`;
                            }
                        })
                    );
                    return `Isi folder ${resolved}:\n${items.join("\n")}`;
                }
            } catch (error) {
                return `Error: Gagal membaca folder - ${(error as Error).message}`;
            }
        },
    },
    {
        name: "read_folder_contents",
        description: "Membaca SEMUA isi file dalam folder (gabungan konten semua file). Gunakan pattern untuk filter file tertentu, contoh: '*.txt' atau '*.ts'",
        func: async ({path: folderPath, pattern}: {path: string; pattern?: string}) => {
            try {
                const resolved = resolvePath(folderPath);

                if (!await fs.pathExists(resolved)) {
                    return `Error: Folder tidak ditemukan: ${resolved}`;
                }

                const stats = await fs.stat(resolved);
                if (!stats.isDirectory()) {
                    return `Error: Path ini adalah file, bukan folder: ${resolved}`;
                }

                const results: string[] = [];

                async function readAllFiles(dir: string) {
                    const entries = await fs.readdir(dir, {withFileTypes: true});

                    for (const entry of entries) {
                        const fullPath = path.join(dir, entry.name);
                        const relativePath = path.relative(WORKSPACE_DIR, fullPath);

                        if (entry.isDirectory()) {
                            await readAllFiles(fullPath);
                        } else {
                            // Filter berdasarkan pattern jika ada
                            if (pattern && !matchPattern(entry.name, pattern)) {
                                continue;
                            }

                            try {
                                const content = await fs.readFile(fullPath, "utf-8");
                                results.push(`\n=== ${relativePath} ===\n${content}`);
                            } catch {
                                results.push(`\n=== ${relativePath} ===\n[Error: Tidak bisa dibaca]`);
                            }
                        }
                    }
                }

                await readAllFiles(resolved);

                if (results.length === 0) {
                    return `Tidak ada file yang cocok dengan pattern "${pattern || "*"}\" di folder ${resolved}`;
                }

                return `Konten semua file di ${resolved}${pattern ? ` (filter: ${pattern})` : ""}:\n${results.join("\n")}`;
            } catch (error) {
                return `Error: Gagal membaca folder - ${(error as Error).message}`;
            }
        },
    },
];

// Helper: Format ukuran file
function formatSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Helper: Pattern matching sederhana
function matchPattern(filename: string, pattern: string): boolean {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
    return regex.test(filename);
}
