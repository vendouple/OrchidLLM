import {
    getProviderDefinition,
    getProviderMaxConcurrency,
    supportsProviderEndpoint,
    normalizeProviderName
} from './aggregator.js';
import { resolveProviderCredential } from '../lib/provider-keys.js';
import {
    tryAcquireQueueTurn,
    heartbeatQueueItem
} from '../lib/queue.js';

const QUEUE_WAIT_TIMEOUT_MS = Number(process.env.QUEUE_WAIT_TIMEOUT_MS || 20000);
const QUEUE_POLL_MS = Number(process.env.QUEUE_POLL_MS || 500);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function candidateIdentity(candidate) {
    return [
        candidate.providerId,
        candidate.upstreamModel || '',
        candidate.credential?.source || '',
        candidate.credential?.keyId || '',
        candidate.credential?.keyName || ''
    ].join('|');
}

export function orderCandidatesForExecution(preferredCandidate, candidates) {
    const seen = new Set();
    const ordered = [];

    const pushUnique = candidate => {
        if (!candidate) return;
        const key = candidateIdentity(candidate);
        if (seen.has(key)) return;
        seen.add(key);
        ordered.push(candidate);
    };

    pushUnique(preferredCandidate);
    for (const candidate of candidates) {
        pushUnique(candidate);
    }

    return ordered;
}

export function filterCandidatesByKeyAccess(providerCandidates, keyInfo) {
    if (keyInfo.type === 'byop') {
        return providerCandidates.filter(candidate => candidate.providerId === 'pollinations');
    }

    if (keyInfo.bypassLimits || keyInfo.type === 'demo') {
        return providerCandidates;
    }

    if (!Array.isArray(keyInfo.providers) || keyInfo.providers.length === 0) {
        return providerCandidates;
    }

    if (keyInfo.providers.includes('*')) {
        return providerCandidates;
    }

    const allowedSet = new Set(
        keyInfo.providers
            .map(provider => normalizeProviderName(provider))
            .filter(Boolean)
    );

    if (allowedSet.size === 0) {
        return providerCandidates;
    }

    return providerCandidates.filter(candidate => allowedSet.has(candidate.providerId));
}

export async function buildRoutableCandidates({
    providerCandidates,
    keyInfo,
    allowDb = true,
    endpointKey = null
}) {
    const routable = [];

    for (const candidate of providerCandidates) {
        if (keyInfo?.type === 'byop' && candidate.providerId !== 'pollinations') {
            continue;
        }

        if (endpointKey && !supportsProviderEndpoint(candidate.providerId, endpointKey)) {
            continue;
        }

        const providerDefinition = getProviderDefinition(candidate.providerId);
        if (!providerDefinition || !providerDefinition.baseUrl) {
            continue;
        }

        const byopKey = keyInfo?.type === 'byop' && candidate.providerId === 'pollinations'
            ? keyInfo.actualKey
            : null;

        const credential = await resolveProviderCredential(candidate.providerId, {
            byopKey,
            allowDb
        });

        if (!credential || !credential.apiKey) {
            continue;
        }

        routable.push({
            ...candidate,
            providerDefinition,
            credential
        });
    }

    return routable;
}

export async function waitForQueueTurn({
    queueId,
    endpoint,
    candidates,
    waitTimeoutMs = QUEUE_WAIT_TIMEOUT_MS,
    pollMs = QUEUE_POLL_MS
}) {
    if (!queueId) {
        return candidates[0] || null;
    }

    const deadline = Date.now() + waitTimeoutMs;

    while (Date.now() < deadline) {
        for (const candidate of candidates) {
            const acquired = await tryAcquireQueueTurn({
                queueId,
                endpoint,
                providerName: candidate.providerId,
                maxConcurrent: getProviderMaxConcurrency(candidate.providerId)
            });

            if (acquired.acquired) {
                return candidate;
            }
        }

        await heartbeatQueueItem(queueId);
        await sleep(pollMs);
    }

    return null;
}

export function endpointModelLabel(candidate) {
    if (!candidate) return 'unknown';
    if (!candidate.upstreamModel) {
        return candidate.providerId;
    }
    return `${candidate.providerId}/${candidate.upstreamModel}`;
}

export default {
    orderCandidatesForExecution,
    filterCandidatesByKeyAccess,
    buildRoutableCandidates,
    waitForQueueTurn,
    endpointModelLabel
};
