export interface ProviderModel {
    name?: string;
}

export interface Provider {
    models: Record<string, ProviderModel>;
    name?: string;
    npm?: string;
    options?: Record<string, unknown>;
}

export interface OpenCodeConfig {
    provider: Record<string, Provider>;
    plugin?: string[];
    disabled_providers?: string[];
    $schema?: string;
}

export interface AgentConfig {
    model: string;
    variant?: string;
}

export interface OhMyOpenCodeConfig {
    $schema?: string;
    agents: {
        [agentName: string]: AgentConfig;
    };
    categories: {
        [categoryName: string]: AgentConfig;
    };
}

export interface AppState {
    opencodeConfig: OpenCodeConfig | null;
    omoConfig: OhMyOpenCodeConfig | null;
    omoConfigRaw: string | null;
    loading: boolean;
    error: string | null;
}
