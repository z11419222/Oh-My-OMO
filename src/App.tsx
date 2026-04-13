import { useState, useEffect } from 'react';
import { message, ask } from '@tauri-apps/plugin-dialog';
import { useConfig, getOmoConfigFileName } from './hooks';
import type { AgentConfig, OpenCodeConfig } from './types';
import {
    Settings,
    Save,
    RefreshCw,
    AlertCircle,
    LayoutDashboard,
    Sliders,
    Database,
    Plus,
    Play,
    ChevronRight
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
    // Agents
    'sisyphus': '主指挥官，负责制定计划、分配任务给专家团队，并以激进的并行策略推动任务完成。',
    'hephaestus': '自主深度工作者，自动探索代码库模式，从头到尾独立执行任务。',
    'prometheus': '战略规划师，在动手之前先通过提问确定范围并构建详尽的执行计划。',
    'oracle': '架构咨询与深度调试专家（只读）。',
    'librarian': '外部文档与知识搜索馆长。',
    'explore': '快速 codebase 扫描与检索专家。',
    'multimodal-looker': 'PDF、图像及截图视觉分析专家。',
    'metis': '预规划差距分析专家。',
    'momus': '计划审查与逻辑验证专家',
    'atlas': '待办事项编排器，负责系统化推进计划执行。',
    'sisyphus-junior': '特定任务衍生执行器。',

    // Categories
    'visual-engineering': '前端、UI/UX 与设计相关任务。',
    'ultrabrain': '复杂硬核逻辑、架构决策。',
    'deep': '深度自主调研与执行。',
    'quick': '单文件修改、修错字。',
    'artistry': '专门的创意、视觉或艺术类任务。',
    'writing': '文档编写、提交信息或文本生成。',
    'manager': '流程管理与协调任务。',
    'code': '通用程序编写与实现。',
    'review': '代码质量与逻辑审查。',
    'doc': '技术文档与注释维护。',
    'test': '自动化测试与方案验证。',
};

const PRIMARY_AGENT_TAGS: Record<string, string> = {
    'sisyphus': 'Ultraworker',
    'hephaestus': 'Deep Agent',
    'prometheus': 'Plan Builder'
};

const PRIMARY_AGENTS = ['sisyphus', 'hephaestus', 'prometheus'];

function getAvailableModels(config: OpenCodeConfig | null): string[] {
    if (!config) return [];

    const models: string[] = [];
    for (const [providerId, provider] of Object.entries(config.provider)) {
        if (!provider.models) continue;
        for (const modelId of Object.keys(provider.models)) {
            models.push(`${providerId}/${modelId}`);
        }
    }
    return models;
}

function EditorPanel({
    title,
    items,
    availableModels,
    onUpdate
}: {
    title: string;
    items: Record<string, AgentConfig>;
    availableModels: string[];
    onUpdate: (key: string, value: AgentConfig) => void;
}) {
    if (Object.keys(items).length === 0) return null;
    return (
        <div className="space-y-3">
            {title && <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h2>}
            <div className="grid gap-2">
                {Object.entries(items).map(([key, config]) => (
                    <div key={key} className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5 mb-1.5">
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-tight">{key}</h3>
                            {PRIMARY_AGENT_TAGS[key.toLowerCase()] && (
                                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0 rounded border border-blue-100 dark:border-blue-800/50">
                                    {PRIMARY_AGENT_TAGS[key.toLowerCase()]}
                                </span>
                            )}
                            {ROLE_DESCRIPTIONS[key.toLowerCase()] && (
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                                    {ROLE_DESCRIPTIONS[key.toLowerCase()]}
                                </span>
                            )}
                        </div>
                        <div className="grid gap-1.5">
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 w-11 shrink-0 tracking-wider">Model</label>
                                <select
                                    value={config.model}
                                    onChange={(e) => onUpdate(key, { ...config, model: e.target.value })}
                                    className="flex-1 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-[11px] h-6"
                                >
                                    <option value={config.model}>{config.model}</option>
                                    <option disabled>──────────</option>
                                    {availableModels.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 w-11 shrink-0 tracking-wider">Variant</label>
                                <input
                                    type="text"
                                    value={config.variant || ''}
                                    onChange={(e) => onUpdate(key, { ...config, variant: e.target.value || undefined })}
                                    placeholder="默认"
                                    className="flex-1 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-[11px] h-6"
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function InputModal({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title, 
    placeholder 
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    onConfirm: (val: string) => void;
    title: string;
    placeholder: string;
}) {
    const [value, setValue] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 space-y-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
                    <input
                        autoFocus
                        type="text"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && value.trim()) {
                                onConfirm(value.trim());
                                setValue('');
                            } else if (e.key === 'Escape') {
                                onClose();
                                setValue('');
                            }
                        }}
                        placeholder={placeholder}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                    />
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={() => {
                                onClose();
                                setValue('');
                            }}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={() => {
                                if (value.trim()) {
                                    onConfirm(value.trim());
                                    setValue('');
                                }
                            }}
                            className="flex-1 px-4 py-2.5 bg-blue-600 rounded-xl text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-colors"
                        >
                            确定
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ProviderPanel({
    opencodeConfig,
    providerPresets,
    onSwitch,
    loading
}: {
    opencodeConfig: OpenCodeConfig | null;
    providerPresets: string[];
    onSwitch: (name: string) => Promise<void>;
    loading: boolean;
}) {
    if (!opencodeConfig) return null;

    return (
        <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                        <Database className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">当前提供商配置</h2>
                        <p className="text-[12px] text-slate-400">正在使用的 OpenCode 模型源设置</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {Object.entries(opencodeConfig.provider).map(([key, value]) => (
                        <div key={key} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block tracking-wider">{key}</label>
                            <p className="text-sm font-medium truncate font-mono text-blue-300">
                                {value.name || key}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest pl-1">快速切换</h3>
                <div className="grid grid-cols-2 gap-3">
                    {providerPresets.map((preset) => (
                        <button
                            key={preset}
                            onClick={() => onSwitch(preset)}
                            disabled={loading}
                            className="group p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-blue-500 dark:hover:border-blue-500 transition-all text-left flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-lg group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-colors">
                                    <Database className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                                </div>
                                <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{preset}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-all group-hover:translate-x-0.5" />
                        </button>
                    ))}
                    {providerPresets.length === 0 && (
                        <div className="col-span-2 p-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center">
                            <p className="text-sm text-slate-400">未找到提供商预设。在 .config/opencode 目录下创建 opencode.provider-[NAME].json 文件以快速切换。</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

type AppTab = 'overview' | 'config' | 'backups';

const tabs: Array<{ id: AppTab; icon: typeof Settings; label: string }> = [
    { id: 'overview', icon: LayoutDashboard, label: '总览' },
    { id: 'config', icon: Sliders, label: '配置' },
    { id: 'backups', icon: Database, label: '提供商' },
];

export default function App() {
    const {
        omoConfig,
        opencodeConfig,
        loading,
        error,
        presets,
        providerPresets,
        activePreset,
        loadConfig,
        loadPresetToUI,
        saveAsPreset,
        applyCurrentToActive,
        switchProvider,
        setOmoConfig
    } = useConfig();

    const [activeTab, setActiveTab] = useState<AppTab>('overview');
    const [selectedPreset, setSelectedPreset] = useState<string>('');
    const [isInputModalOpen, setIsInputModalOpen] = useState(false);

    useEffect(() => {
        if (activePreset) setSelectedPreset(activePreset);
    }, [activePreset]);

    const availableModels = getAvailableModels(opencodeConfig);

    const handleNewPreset = () => {
        setIsInputModalOpen(true);
    };

    const handleConfirmNewPreset = async (name: string) => {
        setIsInputModalOpen(false);
        await saveAsPreset(name);
    };

    const handleSaveCurrentPreset = async () => {
        if (!selectedPreset) {
            handleNewPreset();
            return;
        }
        await saveAsPreset(selectedPreset);
    };

    const handleApplyConfig = async () => {
        await applyCurrentToActive();
        await message('配置已成功应用到活动 OMO 路由！', { title: 'Oh My OMO', kind: 'info' });
    };

    const handleSwitchProvider = async (name: string) => {
        const confirmed = await ask(`确定要切换到提供商预设 "${name}" 吗？\n当前的 opencode.json 将会被备份并覆盖。`, {
            title: '切换提供商',
            kind: 'warning',
        });
        if (confirmed) {
            await switchProvider(name);
            await message(`已成功切换到提供商: ${name}`, { title: 'Oh My OMO', kind: 'info' });
        }
    };

    if (loading && !omoConfig) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center p-6 bg-slate-50 dark:bg-slate-900">
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-lg max-w-lg w-full flex items-start gap-4 shadow-sm border border-red-100 dark:border-red-900/30">
                    <AlertCircle className="w-6 h-6 shrink-0 mt-1" />
                    <div>
                        <h2 className="font-semibold text-lg mb-2">配置错误</h2>
                        <p className="text-sm whitespace-pre-wrap break-words">{error}</p>
                        <button
                            onClick={loadConfig}
                            className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded text-sm font-medium transition-colors"
                        >
                            重试
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!omoConfig) return null;

    return (
        <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
            <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center px-6 shrink-0 shadow-sm z-10">
                <div className="flex-1 flex items-center gap-2">
                    <div className="bg-blue-600 p-1.5 rounded-lg">
                        <Settings className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                        Oh My OMO
                    </h1>
                </div>

                <nav className="flex items-center bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-full border border-slate-200 dark:border-slate-700">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200",
                                activeTab === tab.id
                                    ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600"
                                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            )}
                        >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                        </button>
                    ))}
                </nav>

                <div className="flex-1 flex items-center justify-end gap-3">
                    {/* Header Actions Placeholder */}
                </div>
            </header>

            <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/20 p-6">
                <div className="max-w-[1400px] mx-auto h-full">
                    {activeTab === 'overview' && (
                        <div className="space-y-4 max-w-4xl mx-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                                    <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Agents</h3>
                                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{Object.keys(omoConfig.agents).length}</p>
                                </div>
                                <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                                    <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Categories</h3>
                                    <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{Object.keys(omoConfig.categories).length}</p>
                                </div>
                            </div>
                            <div className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                                <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                                    <LayoutDashboard className="w-4 h-4 text-slate-400" />
                                    配置摘要
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
                                    此编辑器用于管理您的 {getOmoConfigFileName()} 路由表。
                                    它会保留您的 JSONC 注释，并在每次保存前自动创建带时间戳的备份。
                                </p>
                                <div className="text-[11px] font-mono bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800 overflow-auto text-slate-600 dark:text-slate-400">
                                    在 opencode.json 中检测到 {Object.keys(opencodeConfig?.provider || {}).length} 个 Provider
                                    <br />
                                    共有 {availableModels.length} 个可用 Model
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'config' && omoConfig && (
                        <div className="space-y-6">
                            {/* Preset Bar */}
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 shadow-xl flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 flex-1 pl-1">
                                    <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
                                        <Settings className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">当前预设</span>
                                        <select
                                            value={selectedPreset}
                                            onChange={(e) => {
                                                setSelectedPreset(e.target.value);
                                                loadPresetToUI(e.target.value);
                                            }}
                                            className="bg-transparent border-none text-sm font-bold text-slate-900 dark:text-white focus:outline-none min-w-[150px] cursor-pointer"
                                        >
                                            <option value="" disabled>选择预设...</option>
                                            {presets.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    {selectedPreset && (
                                        <div className="h-8 w-px bg-slate-100 dark:bg-slate-800 mx-2" />
                                    )}
                                    {selectedPreset && (
                                        <span className={cn(
                                            "text-[10px] px-2 py-0.5 rounded-full font-bold",
                                            activePreset === selectedPreset
                                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                                                : "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400"
                                        )}>
                                            {activePreset === selectedPreset ? '已同步' : '未同步'}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleNewPreset}
                                        className="px-3 py-1.5 text-[12px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        新建预设
                                    </button>
                                    <button
                                        onClick={handleSaveCurrentPreset}
                                        className="px-3 py-1.5 text-[12px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                                    >
                                        <Save className="w-3.5 h-3.5" />
                                        保存预设
                                    </button>
                                    <button
                                        onClick={handleApplyConfig}
                                        className="px-5 py-1.5 bg-blue-600 text-white rounded-lg text-[12px] font-bold shadow-lg shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 ml-2"
                                    >
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        应用配置
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-4">
                                    {Object.entries(omoConfig.agents)
                                        .filter(([k]) => PRIMARY_AGENTS.includes(k.toLowerCase()))
                                        .map(([key, config]) => (
                                            <EditorPanel
                                                key={key}
                                                title=""
                                                items={{ [key]: config }}
                                                availableModels={availableModels}
                                                onUpdate={(k, val) => setOmoConfig({ ...omoConfig, agents: { ...omoConfig.agents, [k]: val } })}
                                            />
                                        ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 items-start">
                                <div className="space-y-3">
                                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                        <div className="w-1.5 h-4 bg-slate-400 rounded-full" />
                                        子智能体 (Sub-agents)
                                    </h2>
                                    <EditorPanel
                                        title=""
                                        items={Object.fromEntries(Object.entries(omoConfig.agents).filter(([k]) => !PRIMARY_AGENTS.includes(k.toLowerCase())))}
                                        availableModels={availableModels}
                                        onUpdate={(key, val) => setOmoConfig({ ...omoConfig, agents: { ...omoConfig.agents, [key]: val } })}
                                    />
                                </div>
                                <div className="space-y-3">
                                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                        <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                                        分类配置 (Categories)
                                    </h2>
                                    <EditorPanel
                                        title=""
                                        items={omoConfig.categories}
                                        availableModels={availableModels}
                                        onUpdate={(key, val) => setOmoConfig({ ...omoConfig, categories: { ...omoConfig.categories, [key]: val } })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'backups' && (
                        <ProviderPanel
                            opencodeConfig={opencodeConfig}
                            providerPresets={providerPresets}
                            onSwitch={handleSwitchProvider}
                            loading={loading}
                        />
                    )}
                </div>
            </main>

            <InputModal
                isOpen={isInputModalOpen}
                onClose={() => setIsInputModalOpen(false)}
                onConfirm={handleConfirmNewPreset}
                title="新建配置预设"
                placeholder="请输入预设名称 (例如: coding-mode)"
            />
        </div>
    );
}
