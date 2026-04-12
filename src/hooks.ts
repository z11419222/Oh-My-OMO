import { useState, useEffect } from 'react';
import * as jsoncParser from 'jsonc-parser';
import { readConfigFile, writeConfigFile, createBackup, fileExists, listPresets, savePresetFile, loadPresetContent, applyPresetToActive } from './api';
import type { OpenCodeConfig, OhMyOpenCodeConfig, AppState } from './types';

export interface ExtendedAppState extends AppState {
    presets: string[];
    providerPresets: string[];
    activePreset: string | null;
}

const OMO_CONFIG_PATH = '.config/opencode/oh-my-opencode.jsonc';
const OPENCODE_CONFIG_PATH = '.config/opencode/opencode.json';

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

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('oh-my-opencode.jsonc 不是有效的对象');
    }

    const agents = Reflect.get(parsed, 'agents');
    const categories = Reflect.get(parsed, 'categories');
    const schema = Reflect.get(parsed, '$schema');

    if (!isAgentMap(agents)) {
        throw new Error('oh-my-opencode.jsonc 中的 agents 部分无效');
    }

    if (!isAgentMap(categories)) {
        throw new Error('oh-my-opencode.jsonc 中的 categories 部分无效');
    }

    if (schema !== undefined && typeof schema !== 'string') {
        throw new Error('oh-my-opencode.jsonc 中的 $schema 字段无效');
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
            const hasOmo = await fileExists(OMO_CONFIG_PATH);
            const hasOpencode = await fileExists(OPENCODE_CONFIG_PATH);

            if (!hasOmo) throw new Error(`在 ${OMO_CONFIG_PATH} 未找到 OMO 配置`);
            if (!hasOpencode) throw new Error(`在 ${OPENCODE_CONFIG_PATH} 未找到 OpenCode 配置`);

            const omoRaw = await readConfigFile(OMO_CONFIG_PATH);
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
            // Backup before applying
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            await createBackup(OMO_CONFIG_PATH, `${OMO_CONFIG_PATH}.${timestamp}.backup`);

            // Use current UI state
            let newRaw = state.omoConfigRaw;
            const edits = [
                ...jsoncParser.modify(newRaw, ['agents'], state.omoConfig.agents, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
                ...jsoncParser.modify(newRaw, ['categories'], state.omoConfig.categories, { formattingOptions: { insertSpaces: true, tabSize: 2 } })
            ];
            newRaw = jsoncParser.applyEdits(newRaw, edits);

            await writeConfigFile(OMO_CONFIG_PATH, newRaw);
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
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `${OMO_CONFIG_PATH}.${timestamp}.backup`;
            await createBackup(OMO_CONFIG_PATH, backupPath);

            let newRaw = state.omoConfigRaw;
            const edits = [
                ...jsoncParser.modify(newRaw, ['agents'], newConfig.agents, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
                ...jsoncParser.modify(newRaw, ['categories'], newConfig.categories, { formattingOptions: { insertSpaces: true, tabSize: 2 } })
            ];
            
            newRaw = jsoncParser.applyEdits(newRaw, edits);

            await writeConfigFile(OMO_CONFIG_PATH, newRaw);
            
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
