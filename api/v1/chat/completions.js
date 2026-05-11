/**
 * /api/v1/chat/completions — OpenAI-compatible Chat Completions (v1 namespace)
 * Mirrors /api/chat/completions but under the versioned v1 path.
 */
import handler from '../../chat/completions.js';
export default handler;
