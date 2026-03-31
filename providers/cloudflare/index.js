import { createOpenAiProvider } from '../shared/create-openai-provider.js';

function resolveCloudflareBaseUrl() {
    if (process.env.CLOUDFLARE_OPENAI_BASE_URL) {
        return String(process.env.CLOUDFLARE_OPENAI_BASE_URL).trim();
    }

    if (process.env.CLOUDFLARE_ACCOUNT_ID) {
        return `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`;
    }

    return null;
}

const cloudflareProvider = createOpenAiProvider({
    id: 'cloudflare',
    displayName: 'Cloudflare Workers AI',
    aliases: ['workersai'],
    resolveBaseUrl: resolveCloudflareBaseUrl,
    envKeyCandidates: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY'],
    usageCounterType: 'tokens',
    endpoints: {
        'chat.completions': '/chat/completions'
    }
});

export default cloudflareProvider;
