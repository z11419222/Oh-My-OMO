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
            // 同时兼容新版 oh-my-openagent.json 和旧版 oh-my-opencode.jsonc 的备份文件
            .filter(entry => entry.name && (
                (entry.name.startsWith('oh-my-openagent.json.') || entry.name.startsWith('oh-my-opencode.jsonc.'))
                && entry.name.endsWith('.backup')
            ))
            .map(entry => entry.name as string)
            .sort()
            .reverse();
    } catch {
        return [];
    }
}

export async function restoreBackup(backupName: string): Promise<void> {
    const backupPath = `.config/opencode/${backupName}`;
    // 根据备份名自动判断目标路径：新版或旧版
    const isLegacy = backupName.startsWith('oh-my-opencode.jsonc.');
    const targetPath = isLegacy
        ? '.config/opencode/oh-my-opencode.jsonc'
        : '.config/opencode/oh-my-openagent.json';
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
        const prefix = type === 'omo' ? 'oh-my-openagent.preset-' : 'opencode.provider-';
        const suffix = type === 'omo' ? '.json' : '.json';
        // 旧版预设前缀，兼容检测
        const legacyPrefix = type === 'omo' ? 'oh-my-opencode.preset-' : null;
        const legacySuffix = type === 'omo' ? '.jsonc' : null;
        
        return entries
            .filter(entry => {
                if (!entry.name) return false;
                // 匹配新版前缀
                if (entry.name.startsWith(prefix) && entry.name.endsWith(suffix)) return true;
                // 兼容匹配旧版前缀
                if (legacyPrefix && legacySuffix && entry.name.startsWith(legacyPrefix) && entry.name.endsWith(legacySuffix)) return true;
                return false;
            })
            .map(entry => {
                const name = entry.name!;
                // 优先使用新版前缀解析
                if (name.startsWith(prefix)) return name.replace(prefix, '').replace(suffix, '');
                // 旧版前缀解析
                if (legacyPrefix && legacySuffix) return name.replace(legacyPrefix, '').replace(legacySuffix, '');
                return name;
            })
            .filter((name, index, arr) => arr.indexOf(name) === index) // 去重
            .sort();
    } catch {
        return [];
    }
}

export async function savePresetFile(type: 'omo' | 'provider', name: string, content: string): Promise<void> {
    // 新版预设使用新命名
    const prefix = type === 'omo' ? 'oh-my-openagent.preset-' : 'opencode.provider-';
    const suffix = '.json';
    const path = `.config/opencode/${prefix}${name}${suffix}`;
    await writeConfigFile(path, content);
}

export async function loadPresetContent(type: 'omo' | 'provider', name: string): Promise<string> {
    // 优先加载新版预设，不存在则尝试旧版
    const newPrefix = type === 'omo' ? 'oh-my-openagent.preset-' : 'opencode.provider-';
    const newSuffix = '.json';
    const newPath = `.config/opencode/${newPrefix}${name}${newSuffix}`;
    
    if (await exists(newPath, { baseDir: BaseDirectory.Home })) {
        return await readConfigFile(newPath);
    }
    
    // 回退到旧版预设路径
    if (type === 'omo') {
        const legacyPath = `.config/opencode/oh-my-opencode.preset-${name}.jsonc`;
        if (await exists(legacyPath, { baseDir: BaseDirectory.Home })) {
            return await readConfigFile(legacyPath);
        }
    }
    
    // 都不存在则使用新路径（让错误自然抛出）
    return await readConfigFile(newPath);
}

export async function applyPresetToActive(type: 'omo' | 'provider', name: string): Promise<void> {
    const content = await loadPresetContent(type, name);
    // OMO 配置需要根据实际存在的文件决定写入目标
    let targetPath: string;
    if (type === 'omo') {
        // 优先写入新版路径
        const newExists = await exists('.config/opencode/oh-my-openagent.json', { baseDir: BaseDirectory.Home });
        targetPath = newExists ? '.config/opencode/oh-my-openagent.json' : '.config/opencode/oh-my-opencode.jsonc';
    } else {
        targetPath = '.config/opencode/opencode.json';
    }
    await writeConfigFile(targetPath, content);
}
