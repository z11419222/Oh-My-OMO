import { useState, useEffect } from 'react';
import * as jsoncParser from 'jsonc-parser';
import { readConfigFile, writeConfigFile, createBackup, fileExists, listPresets, savePresetFile, loadPresetContent, applyPresetToActive } from './api';
import type { OpenCodeConfig, OhMyOpenCodeConfig, AppState } from './types';

export interface ExtendedAppState extends AppState {
    presets: string[];
    providerPresets: string[];
    activePreset: string | null;
}

// 新版配置文件名（优先使用）
const OMO_CONFIG_PATH_NEW = '.config/opencode/oh-my-openagent.json';
// 旧版配置文件名（兼容回退）
const OMO_CONFIG_PATH_LEGACY = '.config/opencode/oh-my-opencode.jsonc';
const OPENCODE_CONFIG_PATH = '.config/opencode/opencode.json';

// 缓存已解析的 OMO 配置路径，避免重复检测
let _cachedOmoConfigPath: string | null = null;

/**
 * 自动检测 OMO 配置文件路径
 * 优先使用新版 oh-my-openagent.json，不存在时回退到旧版 oh-my-opencode.jsonc
 */
async function resolveOmoConfigPath(forceRefresh = false): Promise<string> {
    if (_cachedOmoConfigPath && !forceRefresh) {
        return _cachedOmoConfigPath;
    }
    // 优先检测新版文件
    if (await fileExists(OMO_CONFIG_PATH_NEW)) {
        _cachedOmoConfigPath = OMO_CONFIG_PATH_NEW;
        return OMO_CONFIG_PATH_NEW;
    }
    // 回退到旧版文件
    if (await fileExists(OMO_CONFIG_PATH_LEGACY)) {
        _cachedOmoConfigPath = OMO_CONFIG_PATH_LEGACY;
        return OMO_CONFIG_PATH_LEGACY;
    }
    // 两者都不存在时，使用新版路径（报错时显示新版路径）
    _cachedOmoConfigPath = OMO_CONFIG_PATH_NEW;
    return OMO_CONFIG_PATH_NEW;
}

/** 获取当前使用的配置文件名（用于 UI 展示） */
export function getOmoConfigFileName(): string {
    if (!_cachedOmoConfigPath) return 'oh-my-openagent.json';
    return _cachedOmoConfigPath.split('/').pop() || 'oh-my-openagent.json';
}

function isAgentMap(value: unknown): value is OhMyOpenCodeConfig['agents'] {
    if (!value || typeof value !== 'object') {
        return false;
    }

    return Object.values(value).every((entry) => {
        if (!entry || typeof entry !== 'object') {
            return false;
        }

        const model = Reflect.get(entry, 'model');
        const variant = Reflect.get(entry, 'variant');

        return typeof model === 'string' && (variant === undefined || typeof variant === 'string');
    });
}

function parseOmoConfig(raw: string): OhMyOpenCodeConfig {
    const parsed = jsoncParser.parse(raw);
    const configName = getOmoConfigFileName();

    if (!parsed || typeof parsed !== 'object') {
        throw new Error(`${configName} 不是有效的对象`);
    }

    const agents = Reflect.get(parsed, 'agents');
    const categories = Reflect.get(parsed, 'categories');
    const schema = Reflect.get(parsed, '$schema');

    if (!isAgentMap(agents)) {
        throw new Error(`${configName} 中的 agents 部分无效`);
    }

    if (!isAgentMap(categories)) {
        throw new Error(`${configName} 中的 categories 部分无效`);
    }

    if (schema !== undefined && typeof schema !== 'string') {
        throw new Error(`${configName} 中的 $schema 字段无效`);
    }

    return {
        $schema: schema,
        agents,
        categories,
    };
}

function parseOpenCodeConfig(raw: string): OpenCodeConfig {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('opencode.json 不是有效的对象');
    }

    const provider = Reflect.get(parsed, 'provider');

    if (!provider || typeof provider !== 'object') {
        throw new Error('opencode.json 缺少 provider 定义');
    }

    return parsed as OpenCodeConfig;
}

export function useConfig() {
    const [state, setState] = useState<ExtendedAppState>({
        opencodeConfig: null,
        omoConfig: null,
        omoConfigRaw: null,
        loading: true,
        error: null,
        presets: [],
        providerPresets: [],
        activePreset: null,
    });

    const loadConfig = async () => {
        setState(s => ({ ...s, loading: true, error: null }));
        try {
            // 动态解析 OMO 配置文件路径（优先新版，兼容旧版）
            const omoConfigPath = await resolveOmoConfigPath(true);
            const hasOmo = await fileExists(omoConfigPath);
            const hasOpencode = await fileExists(OPENCODE_CONFIG_PATH);

            if (!hasOmo) throw new Error(`在 ${OMO_CONFIG_PATH_NEW} 或 ${OMO_CONFIG_PATH_LEGACY} 未找到 OMO 配置`);
            if (!hasOpencode) throw new Error(`在 ${OPENCODE_CONFIG_PATH} 未找到 OpenCode 配置`);

            const omoRaw = await readConfigFile(omoConfigPath);
            const opencodeRaw = await readConfigFile(OPENCODE_CONFIG_PATH);

            const omoConfig = parseOmoConfig(omoRaw);
            const opencodeConfig = parseOpenCodeConfig(opencodeRaw);

            const presets = await listPresets('omo');
            const providerPresets = await listPresets('provider');

            setState({
                opencodeConfig,
                omoConfig,
                omoConfigRaw: omoRaw,
                loading: false,
                error: null,
                presets,
                providerPresets,
                activePreset: null,
            });
        } catch (err: unknown) {
            setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }));
        }
    };

    const refreshPresets = async () => {
        const presets = await listPresets('omo');
        const providerPresets = await listPresets('provider');
        setState(s => ({ ...s, presets, providerPresets }));
    };

    const loadPresetToUI = async (name: string) => {
        try {
            const raw = await loadPresetContent('omo', name);
            const config = parseOmoConfig(raw);
            setState(s => ({ ...s, omoConfig: config, omoConfigRaw: raw, activePreset: name }));
        } catch (err) {
            setState(s => ({ ...s, error: `加载预设失败: ${err instanceof Error ? err.message : String(err)}` }));
        }
    };

    const saveAsPreset = async (name: string) => {
        if (!state.omoConfig) return;
        try {
            // Apply current edits to raw before saving
            let rawLines = state.omoConfigRaw || JSON.stringify({ agents: {}, categories: {} }, null, 2);
            const edits = [
                ...jsoncParser.modify(rawLines, ['agents'], state.omoConfig.agents, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
                ...jsoncParser.modify(rawLines, ['categories'], state.omoConfig.categories, { formattingOptions: { insertSpaces: true, tabSize: 2 } })
            ];
            rawLines = jsoncParser.applyEdits(rawLines, edits);
            
            await savePresetFile('omo', name, rawLines);
            await refreshPresets();
            setState(s => ({ ...s, activePreset: name, omoConfigRaw: rawLines }));
        } catch (err) {
            setState(s => ({ ...s, error: `保存预设失败: ${err instanceof Error ? err.message : String(err)}` }));
        }
    };

    const applyCurrentToActive = async () => {
        if (!state.omoConfig || !state.omoConfigRaw) return;
        setState(s => ({ ...s, loading: true }));
        try {
            // 获取当前实际使用的配置路径
            const omoConfigPath = await resolveOmoConfigPath();
            // 备份后再应用
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            await createBackup(omoConfigPath, `${omoConfigPath}.${timestamp}.backup`);

            // 使用当前 UI 状态
            let newRaw = state.omoConfigRaw;
            const edits = [
                ...jsoncParser.modify(newRaw, ['agents'], state.omoConfig.agents, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
                ...jsoncParser.modify(newRaw, ['categories'], state.omoConfig.categories, { formattingOptions: { insertSpaces: true, tabSize: 2 } })
            ];
            newRaw = jsoncParser.applyEdits(newRaw, edits);

            await writeConfigFile(omoConfigPath, newRaw);
            setState(s => ({ ...s, omoConfigRaw: newRaw, loading: false }));
        } catch (err) {
            setState(s => ({ ...s, loading: false, error: `应用配置失败: ${err instanceof Error ? err.message : String(err)}` }));
        }
    };

    const switchProvider = async (name: string) => {
        setState(s => ({ ...s, loading: true }));
        try {
            await applyPresetToActive('provider', name);
            const opencodeRaw = await readConfigFile(OPENCODE_CONFIG_PATH);
            const opencodeConfig = parseOpenCodeConfig(opencodeRaw);
            setState(s => ({ ...s, opencodeConfig, loading: false }));
        } catch (err) {
            setState(s => ({ ...s, loading: false, error: `切换提供商失败: ${err instanceof Error ? err.message : String(err)}` }));
        }
    };

    const saveOmoConfig = async (newConfig: OhMyOpenCodeConfig) => {
        if (!state.omoConfigRaw) return;
        
        setState(s => ({ ...s, loading: true, error: null }));
        try {
            // 获取当前实际使用的配置路径
            const omoConfigPath = await resolveOmoConfigPath();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `${omoConfigPath}.${timestamp}.backup`;
            await createBackup(omoConfigPath, backupPath);

            let newRaw = state.omoConfigRaw;
            const edits = [
                ...jsoncParser.modify(newRaw, ['agents'], newConfig.agents, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
                ...jsoncParser.modify(newRaw, ['categories'], newConfig.categories, { formattingOptions: { insertSpaces: true, tabSize: 2 } })
            ];
            
            newRaw = jsoncParser.applyEdits(newRaw, edits);

            await writeConfigFile(omoConfigPath, newRaw);
            
            setState(s => ({
                ...s,
                omoConfig: newConfig,
                omoConfigRaw: newRaw,
                loading: false
            }));
            
            return backupPath;
        } catch (err: unknown) {
            setState(s => ({ ...s, loading: false, error: `保存失败: ${err instanceof Error ? err.message : String(err)}` }));
            throw err;
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    return { 
        ...state, 
        loadConfig, 
        saveOmoConfig, 
        loadPresetToUI, 
        saveAsPreset, 
        applyCurrentToActive, 
        switchProvider,
        setOmoConfig: (config: OhMyOpenCodeConfig) => setState(s => ({ ...s, omoConfig: config }))
    };
}
