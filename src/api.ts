import { BaseDirectory, readTextFile, writeTextFile, exists, copyFile, readDir, remove } from '@tauri-apps/plugin-fs';

export async function readConfigFile(path: string): Promise<string> {
    return await readTextFile(path, { baseDir: BaseDirectory.Home });
}

export async function writeConfigFile(path: string, contents: string): Promise<void> {
    return await writeTextFile(path, contents, { baseDir: BaseDirectory.Home });
}

export async function createBackup(originalPath: string, backupPath: string): Promise<void> {
    await copyFile(originalPath, backupPath, { fromPathBaseDir: BaseDirectory.Home, toPathBaseDir: BaseDirectory.Home });
}

export async function fileExists(path: string): Promise<boolean> {
    return await exists(path, { baseDir: BaseDirectory.Home });
}

export async function listBackups(): Promise<string[]> {
    try {
        const entries = await readDir('.config/opencode', { baseDir: BaseDirectory.Home });
        return entries
            .filter(entry => entry.name && entry.name.startsWith('oh-my-opencode.jsonc.') && entry.name.endsWith('.backup'))
            .map(entry => entry.name as string)
            .sort()
            .reverse();
    } catch {
        return [];
    }
}

export async function restoreBackup(backupName: string): Promise<void> {
    const backupPath = `.config/opencode/${backupName}`;
    const targetPath = `.config/opencode/oh-my-opencode.jsonc`;
    const contents = await readConfigFile(backupPath);
    await writeConfigFile(targetPath, contents);
}

export async function deleteBackup(backupName: string): Promise<void> {
    const backupPath = `.config/opencode/${backupName}`;
    await remove(backupPath, { baseDir: BaseDirectory.Home });
}

// Preset and Provider Management
export async function listPresets(type: 'omo' | 'provider'): Promise<string[]> {
    try {
        const entries = await readDir('.config/opencode', { baseDir: BaseDirectory.Home });
        const prefix = type === 'omo' ? 'oh-my-opencode.preset-' : 'opencode.provider-';
        const suffix = type === 'omo' ? '.jsonc' : '.json';
        
        return entries
            .filter(entry => entry.name && entry.name.startsWith(prefix) && entry.name.endsWith(suffix))
            .map(entry => entry.name!.replace(prefix, '').replace(suffix, ''))
            .sort();
    } catch {
        return [];
    }
}

export async function savePresetFile(type: 'omo' | 'provider', name: string, content: string): Promise<void> {
    const prefix = type === 'omo' ? 'oh-my-opencode.preset-' : 'opencode.provider-';
    const suffix = type === 'omo' ? '.jsonc' : '.json';
    const path = `.config/opencode/${prefix}${name}${suffix}`;
    await writeConfigFile(path, content);
}

export async function loadPresetContent(type: 'omo' | 'provider', name: string): Promise<string> {
    const prefix = type === 'omo' ? 'oh-my-opencode.preset-' : 'opencode.provider-';
    const suffix = type === 'omo' ? '.jsonc' : '.json';
    const path = `.config/opencode/${prefix}${name}${suffix}`;
    return await readConfigFile(path);
}

export async function applyPresetToActive(type: 'omo' | 'provider', name: string): Promise<void> {
    const content = await loadPresetContent(type, name);
    const targetPath = type === 'omo' ? '.config/opencode/oh-my-opencode.jsonc' : '.config/opencode/opencode.json';
    await writeConfigFile(targetPath, content);
}
