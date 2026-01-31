import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';

const GATEWAY_ID = 'github-copilot-gateway';

function getPort(): number {
    const config = vscode.workspace.getConfiguration('ghcgtw');
    return config.get<number>('port', 3000);
}

function getDefaultModel(): string {
    const config = vscode.workspace.getConfiguration('ghcgtw');
    return config.get<string>('defaultModel', 'gpt-5-mini');
}

function getSecondaryBindAddress(): string {
    const config = vscode.workspace.getConfiguration('ghcgtw');
    return config.get<string>('secondaryBindAddress', '');
}

import * as os from 'os';

/**
 * Check if an IP address is private/local (RFC 1918 + link-local).
 * Returns true for: 127.x.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x
 */
function isPrivateIP(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        return false; // Invalid IP format
    }
    const [a, b] = parts;
    
    // Localhost: 127.x.x.x
    if (a === 127) return true;
    
    // Private Class A: 10.x.x.x
    if (a === 10) return true;
    
    // Private Class B: 172.16.0.0 - 172.31.255.255
    if (a === 172 && b >= 16 && b <= 31) return true;
    
    // Private Class C: 192.168.x.x
    if (a === 192 && b === 168) return true;
    
    // Link-local: 169.254.x.x
    if (a === 169 && b === 254) return true;
    
    return false;
}

/**
 * Check if an IP exists on any network interface on this machine.
 */
function isLocalIP(ip: string): boolean {
    const interfaces = os.networkInterfaces();
    for (const addrs of Object.values(interfaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
            if (addr.address === ip) return true;
        }
    }
    return false;
}

/**
 * Validate if an IP is safe to bind to.
 * - Must be a private IP (RFC 1918)
 * - Must exist on this machine
 * - Warns that non-localhost IPs may be accessible from local network
 */
function validateBindAddress(ip: string): { safe: boolean; warning?: string; reason?: string } {
    // Check if it's a valid private IP
    if (!isPrivateIP(ip)) {
        return { 
            safe: false, 
            reason: `Public IP addresses are not allowed. Only private IPs (10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x) are permitted.`
        };
    }
    
    // Check if this IP exists on the machine
    if (!isLocalIP(ip)) {
        return { 
            safe: false, 
            reason: `IP address ${ip} was not found on any network interface on this machine.`
        };
    }
    
    // It's valid, but warn if not localhost
    if (!ip.startsWith('127.')) {
        return {
            safe: true,
            warning: `Binding to ${ip} - this may be accessible from your local network or VPN. ` +
                     `Ensure your firewall is configured appropriately.`
        };
    }
    
    return { safe: true };
}

let server: http.Server | undefined;
let secondaryServer: http.Server | undefined;
let secondaryServerAddress: string | undefined; // Set when secondary binds successfully
let statusBarItem: vscode.StatusBarItem;
let requestCount = 0;
let startTime: number | undefined;
let apiKey: string | undefined;

// Telemetry
const modelStats: Map<string, number> = new Map();
const recentLogs: Array<{ time: Date; level: 'info' | 'warn' | 'error'; message: string }> = [];
const MAX_LOGS = 20;

function logEvent(level: 'info' | 'warn' | 'error', message: string) {
    recentLogs.unshift({ time: new Date(), level, message });
    if (recentLogs.length > MAX_LOGS) recentLogs.pop();
}

function trackModelRequest(modelId: string) {
    modelStats.set(modelId, (modelStats.get(modelId) || 0) + 1);
}

export async function activate(context: vscode.ExtensionContext) {
    // Initialize or retrieve API key from encrypted storage
    apiKey = await context.secrets.get('ghcgtw.apiKey');
    if (!apiKey) {
        apiKey = crypto.randomUUID();
        await context.secrets.store('ghcgtw.apiKey', apiKey);
    }

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'github-copilot-gateway.showInfo';
    context.subscriptions.push(statusBarItem);

    // Internal command for status bar click only (not in command palette)
    context.subscriptions.push(
        vscode.commands.registerCommand('github-copilot-gateway.showInfo', () => showInfo(context))
    );

    // Auto-failover: try to start server when window gains focus
    context.subscriptions.push(
        vscode.window.onDidChangeWindowState(async (state) => {
            if (state.focused && !server) {
                const existingGateway = await checkExistingGateway();
                if (!existingGateway) {
                    startServer();
                }
            }
        })
    );

    // Watch for configuration changes and restart server
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('ghcgtw')) {
                logEvent('info', 'Configuration changed, restarting server...');
                vscode.window.showInformationMessage('AI Gateway: Configuration changed, restarting...');
                
                // Stop existing servers
                if (server) {
                    server.close();
                    server = undefined;
                }
                if (secondaryServer) {
                    secondaryServer.close();
                    secondaryServer = undefined;
                    secondaryServerAddress = undefined;
                }
                
                // Restart
                startServer();
            }
        })
    );

    // Auto-start server on activation
    startServer();
}

export function deactivate() {
    if (server) {
        server.close();
        server = undefined;
    }
    if (secondaryServer) {
        secondaryServer.close();
        secondaryServer = undefined;
        secondaryServerAddress = undefined;
    }
}

async function requestModelAccess(): Promise<vscode.LanguageModelChat[]> {
    try {
        return await vscode.lm.selectChatModels();
    } catch (err) {
        if (err instanceof vscode.LanguageModelError && err.code === 'NoPermissions') {
            const choice = await vscode.window.showWarningMessage(
                'GitHub Copilot Gateway needs access to language models to function.',
                'Grant Access'
            );
            if (choice === 'Grant Access') {
                return await vscode.lm.selectChatModels();
            }
        }
        throw err;
    }
}

function startServer() {
    if (server) {
        vscode.window.showInformationMessage('AI Gateway is already running');
        return;
    }

    server = http.createServer(async (req, res) => {
        // Security: Validate API key (except /health endpoint)
        // Accepts: Authorization: Bearer <key> OR X-Api-Key: <key>
        if (req.url !== '/health') {
            const authHeader = req.headers['authorization'];
            const xApiKey = req.headers['x-api-key'];
            
            const providedKey = authHeader?.startsWith('Bearer ') 
                ? authHeader.slice(7) 
                : xApiKey;
            
            if (!providedKey || providedKey !== apiKey) {
                logEvent('warn', `Unauthorized request to ${req.url}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized. Use Authorization: Bearer <API_KEY> or X-Api-Key: <API_KEY>' }));
                return;
            }
        }

        // Security: Block browser requests (prevents quota exfiltration via malicious websites)
        if (req.headers['origin'] || req.headers['referer']) {
            logEvent('warn', 'Browser request blocked');
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Browser requests blocked for security.' }));
            return;
        }

        // Handle endpoints
        // Support both standard paths and Azure Foundry paths (/anthropic/v1/...)
        // Strip query parameters for route matching
        const fullUrl = req.url || '';
        const url = fullUrl.split('?')[0];
        
        if ((url === '/v1/chat/completions' || url === '/anthropic/v1/chat/completions') && req.method === 'POST') {
            // OpenAI format (for OpenCode, aider, etc.)
            requestCount++;
            await handleChatCompletion(req, res);
        } else if ((url === '/v1/messages' || url === '/anthropic/v1/messages') && req.method === 'POST') {
            // Anthropic Messages format (for Claude Code)
            requestCount++;
            await handleAnthropicMessages(req, res);
        } else if ((url === '/v1/models' || url === '/anthropic/v1/models') && req.method === 'GET') {
            await handleModels(req, res);
        } else if ((url === '/v1/tokens' || url === '/anthropic/v1/tokens') && req.method === 'POST') {
            await handleTokenCount(req, res);
        } else if ((url === '/v1/messages/count_tokens' || url === '/anthropic/v1/messages/count_tokens') && req.method === 'POST') {
            // Claude Code uses this endpoint for token counting
            await handleTokenCount(req, res);
        } else if (url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', port: getPort(), app: GATEWAY_ID }));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    });

    const port = getPort();
    const secondaryAddr = getSecondaryBindAddress();
    
    server.listen(port, '127.0.0.1', () => {
        startTime = Date.now();
        requestCount = 0;
        modelStats.clear();
        recentLogs.length = 0;
        const model = getDefaultModel();
        
        // Start secondary server on configured address if specified
        if (secondaryAddr) {
            // Security: Validate the address is safe (private + exists on machine)
            const validation = validateBindAddress(secondaryAddr);
            if (!validation.safe) {
                logEvent('error', `Refused to bind to ${secondaryAddr}: ${validation.reason}`);
                vscode.window.showErrorMessage(`AI Gateway: ${validation.reason}`);
            } else {
                // Show warning for non-localhost addresses
                if (validation.warning) {
                    logEvent('warn', validation.warning);
                    vscode.window.showWarningMessage(`AI Gateway: ${validation.warning}`);
                }
                
                const requestHandler = server!.listeners('request')[0] as http.RequestListener;
                secondaryServer = http.createServer(requestHandler);
                secondaryServer.listen(port, secondaryAddr, () => {
                    secondaryServerAddress = secondaryAddr; // Mark as successfully bound
                    logEvent('info', `Secondary server started on ${secondaryAddr}:${port}`);
                });
                secondaryServer.on('error', (err: any) => {
                    secondaryServerAddress = undefined; // Clear on error
                    logEvent('error', `Failed to bind to ${secondaryAddr}:${port}: ${err.message}`);
                    vscode.window.showWarningMessage(`AI Gateway: Could not bind to ${secondaryAddr}:${port} - ${err.message}`);
                });
            }
        }
        
        const bindInfo = secondaryAddr 
            ? `localhost + ${secondaryAddr}`
            : 'localhost';
        statusBarItem.text = `$(circle-filled) AI Gateway :${port} [${model}]`;
        statusBarItem.tooltip = `AI Gateway Server on ${bindInfo} (click for details)`;
        statusBarItem.show();
        logEvent('info', `Server started on port ${port}`);
        
        const addrsMsg = secondaryAddr 
            ? ` (also on ${secondaryAddr})`
            : '';
        vscode.window.showInformationMessage(`AI Gateway started on http://localhost:${port}${addrsMsg}`);
    });

    server.on('error', async (err: any) => {
        if (err.code === 'EADDRINUSE') {
            const port = getPort();
            const isGateway = await checkExistingGateway();
            if (isGateway) {
                statusBarItem.text = `$(circle-outline) AI Gateway :${port}`;
                statusBarItem.tooltip = 'Gateway is hosted by another VS Code window';
                statusBarItem.show();
            } else {
                statusBarItem.text = `$(warning) AI Gateway (port ${port} in use)`;
                statusBarItem.tooltip = `Port ${port} is already in use. Another service may be running. Click for options.`;
                statusBarItem.show();
            }
        } else {
            vscode.window.showErrorMessage(`Server error: ${err.message}`);
        }
        server = undefined;
    });
}

async function checkExistingGateway(): Promise<boolean> {
    return new Promise((resolve) => {
        const port = getPort();
        const req = http.get({
            hostname: 'localhost',
            port: port,
            path: '/health',
            timeout: 1000
        }, (res) => {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                resolve(false);
                return;
            }

            let body = '';
            res.on('data', chunk => body += chunk.toString());
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body || '{}');
                    resolve(parsed.status === 'ok' && parsed.app === GATEWAY_ID);
                } catch (err) {
                    console.error('Health check parse error:', err);
                    resolve(false);
                }
            });
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function showInfo(context: vscode.ExtensionContext) {
    const port = getPort();
    
    if (!server) {
        const connected = await checkExistingGateway();
        if (connected) {
            statusBarItem.text = `$(circle-outline) AI Gateway :${port}`;
            statusBarItem.tooltip = 'Gateway is hosted by another VS Code window';
            statusBarItem.show();
            
            const choice = await vscode.window.showInformationMessage(
                `Gateway is hosted by another VS Code window on port ${port}.`,
                'Copy API Key', 'Regenerate Key', 'Settings'
            );
            await handleInfoChoice(choice, context);
            return;
        }
        // Try to start if not running anywhere
        startServer();
        return;
    }

    const models = await requestModelAccess();
    const uptime = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m ${uptime % 60}s`;

    // Build model stats string
    const statsLines: string[] = [];
    if (modelStats.size > 0) {
        const sorted = [...modelStats.entries()].sort((a, b) => b[1] - a[1]);
        for (const [model, count] of sorted.slice(0, 5)) {
            statsLines.push(`  ${model}: ${count}`);
        }
    }

    // Only show errors/warnings
    const issues = recentLogs.filter(l => l.level !== 'info').slice(0, 5);
    const issueLines = issues.map(l => {
        const time = l.time.toLocaleTimeString();
        const icon = l.level === 'error' ? '❌' : '⚠️';
        return `  ${icon} [${time}] ${l.message}`;
    });

    // Build URLs section
    const urls = [`http://localhost:${port}`];
    if (secondaryServerAddress) {
        urls.push(`http://${secondaryServerAddress}:${port}`);
    }

    const info = [
        `🟢 Running on port ${port}`,
        `⏱️ Uptime: ${uptimeStr} | 📊 Requests: ${requestCount}`,
        `🤖 Models: ${models.length} available`,
        ...(statsLines.length ? ['', '📈 By model:', ...statsLines] : []),
        ...(issueLines.length ? ['', '⚠️ Issues:', ...issueLines] : []),
        ``,
        ...urls
    ].join('\n');

    const choice = await vscode.window.showInformationMessage(info, { modal: true }, 'Copy API Key', 'Regenerate Key', 'Settings');
    await handleInfoChoice(choice, context);
}

async function handleInfoChoice(choice: string | undefined, context: vscode.ExtensionContext) {
    if (choice === 'Copy API Key') {
        vscode.env.clipboard.writeText(apiKey!);
        vscode.window.showInformationMessage('API key copied to clipboard');
    } else if (choice === 'Regenerate Key') {
        await regenerateApiKey(context);
    } else if (choice === 'Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'ghcgtw');
    }
}

async function regenerateApiKey(context: vscode.ExtensionContext) {
    const choice = await vscode.window.showWarningMessage(
        'Regenerate API key? All clients will need the new key.',
        { modal: true },
        'Regenerate'
    );
    if (choice === 'Regenerate') {
        apiKey = crypto.randomUUID();
        await context.secrets.store('ghcgtw.apiKey', apiKey);
        vscode.window.showInformationMessage('New API key generated. Click status bar to copy.');
    }
}

function updateStatusBar() {
    const port = getPort();
    const model = getDefaultModel();
    if (server) {
        statusBarItem.text = `$(circle-filled) AI Gateway :${port} [${model}]`;
        statusBarItem.tooltip = 'AI Gateway running (click for options)';
    } else {
        statusBarItem.text = `$(circle-outline) AI Gateway :${port}`;
        statusBarItem.tooltip = 'Gateway hosted elsewhere (click for options)';
    }
    statusBarItem.show();
}

async function selectModel() {
    try {
        const models = await requestModelAccess();
        
        if (models.length === 0) {
            vscode.window.showWarningMessage('No models available. Make sure GitHub Copilot is active.');
            return;
        }

        // Create a map of unique model families
        const familyMap = new Map<string, vscode.LanguageModelChat>();
        models.forEach(model => {
            if (!familyMap.has(model.family)) {
                familyMap.set(model.family, model);
            }
        });

        const currentModel = getDefaultModel();
        const items = Array.from(familyMap.entries()).map(([family, model]) => ({
            label: family === currentModel ? `$(check) ${family}` : family,
            description: `${model.vendor} - ${model.name}`,
            detail: family === currentModel ? 'Currently selected' : '',
            family: family
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select default AI model',
            title: 'AI Gateway - Model Selection'
        });

        if (selected) {
            const config = vscode.workspace.getConfiguration('ghcgtw');
            await config.update('defaultModel', selected.family, vscode.ConfigurationTarget.Global);
            updateStatusBar();
            vscode.window.showInformationMessage(`Default model changed to: ${selected.family}`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to select model: ${error}`);
    }
}

async function handleModels(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
        const models = await requestModelAccess();
        
        const modelList = models.map(model => ({
            id: model.id,
            object: 'model',
            created: Date.now(),
            owned_by: model.vendor,
            permission: [],
            root: model.family,
            parent: null
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            object: 'list',
            data: modelList
        }));
    } catch (error) {
        handleError(res, error);
    }
}

async function handleTokenCount(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
        const body = await parseBody(req);
        const { text, messages, model } = body;

        const selectedModel = await selectModelByName(model);
        if (!selectedModel) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No models available. Check GitHub Copilot is active.' }));
            return;
        }

        let tokenCount = 0;

        if (text) {
            // Count tokens for simple text
            tokenCount = await selectedModel.countTokens(text);
        } else if (messages && Array.isArray(messages)) {
            // Count tokens for each message
            for (const msg of messages) {
                const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                const msgTokens = await selectedModel.countTokens(content);
                tokenCount += msgTokens;
            }
        } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Either "text" or "messages" is required' }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            tokens: tokenCount,
            model: selectedModel.id
        }));
    } catch (error) {
        handleError(res, error);
    }
}

// Anthropic Messages API handler (for Claude Code)
async function handleAnthropicMessages(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
        const body = await parseBody(req);
        const { messages, model, stream = false, max_tokens, system } = body;

        if (!messages || !Array.isArray(messages)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'messages is required' } }));
            return;
        }

        // Select model using shared function
        const selectedModel = await selectModelByName(model);
        if (!selectedModel) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: model ? `Model "${model}" not found` : 'No models available. Check GitHub Copilot is active.' } }));
            return;
        }

        // Convert Anthropic messages to VS Code format
        const vsCodeMessages: vscode.LanguageModelChatMessage[] = [];
        
        // Add system message if present
        if (system) {
            const systemText = typeof system === 'string' ? system : system.map((s: any) => s.text).join('\n');
            vsCodeMessages.push(vscode.LanguageModelChatMessage.User(`[System]: ${systemText}`));
        }

        // Convert messages
        for (const msg of messages) {
            const content = Array.isArray(msg.content) 
                ? msg.content.map((c: any) => c.type === 'text' ? c.text : '').join('')
                : msg.content;
            
            if (msg.role === 'user') {
                vsCodeMessages.push(vscode.LanguageModelChatMessage.User(content));
            } else if (msg.role === 'assistant') {
                vsCodeMessages.push(vscode.LanguageModelChatMessage.Assistant(content));
            }
        }

        const response = await selectedModel.sendRequest(vsCodeMessages, {});

        if (stream) {
            // Anthropic SSE streaming format
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            const messageId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
            
            // Send message_start event
            res.write(`event: message_start\ndata: ${JSON.stringify({
                type: 'message_start',
                message: {
                    id: messageId,
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model: selectedModel.id,
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 0, output_tokens: 0 }
                }
            })}\n\n`);

            // Send content_block_start
            res.write(`event: content_block_start\ndata: ${JSON.stringify({
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' }
            })}\n\n`);

            let outputTokens = 0;
            for await (const part of response.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    outputTokens += part.value.length / 4; // rough estimate
                    res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                        type: 'content_block_delta',
                        index: 0,
                        delta: { type: 'text_delta', text: part.value }
                    })}\n\n`);
                }
            }

            // Send content_block_stop
            res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);

            // Send message_delta with stop_reason
            res.write(`event: message_delta\ndata: ${JSON.stringify({
                type: 'message_delta',
                delta: { stop_reason: 'end_turn', stop_sequence: null },
                usage: { output_tokens: Math.floor(outputTokens) }
            })}\n\n`);

            // Send message_stop
            res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
            res.end();
        } else {
            // Non-streaming response
            let fullText = '';
            for await (const part of response.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    fullText += part.value;
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                id: `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: fullText }],
                model: selectedModel.id,
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: Math.floor(fullText.length / 4) }
            }));
        }
    } catch (error) {
        handleError(res, error);
    }
}

// Helper to select model by name
// Behavior:
//   1. If no modelName provided → use gateway default
//   2. If modelName provided AND exists → use it
//   3. If modelName provided but NOT found → return undefined (error)
async function selectModelByName(modelName?: string): Promise<vscode.LanguageModelChat | undefined> {
    const models = await requestModelAccess();
    const defaultFamily = getDefaultModel();
    
    if (!modelName) {
        // No model specified → use default
        const defaultModel = models.find(m => m.id === defaultFamily || m.family === defaultFamily)
            || (await vscode.lm.selectChatModels({ family: defaultFamily }))[0];
        if (defaultModel) trackModelRequest(defaultModel.id);
        return defaultModel;
    }
    
    // Try to find requested model by ID or family
    let selected = models.find(m => m.id === modelName || m.family === modelName);
    if (!selected) {
        const familyModels = await vscode.lm.selectChatModels({ family: modelName });
        selected = familyModels[0];
    }
    
    if (selected) {
        trackModelRequest(selected.id);
        return selected;
    }
    
    // Requested model not found → return undefined to trigger error
    logEvent('error', `Model "${modelName}" not found`);
    return undefined;
}

// OpenAI Chat Completions API handler (for OpenCode, aider, etc.)
async function handleChatCompletion(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
        const body = await parseBody(req);
        const { messages, model, stream = false, tools } = body;

        if (!messages || !Array.isArray(messages)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Messages array is required' }));
            return;
        }

        // Select model using shared function
        const selectedModel = await selectModelByName(model);
        if (!selectedModel) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: model ? `Model "${model}" not found` : 'No models available. Check GitHub Copilot is active.' }));
            return;
        }

        // Convert OpenAI messages to VS Code format
        const vsCodeMessages = messages.map((msg: any) => {
            // Extract text content (handle both string and array formats)
            const text = Array.isArray(msg.content)
                ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
                : msg.content;
            
            if (msg.role === 'assistant') {
                return vscode.LanguageModelChatMessage.Assistant(text);
            }
            return vscode.LanguageModelChatMessage.User(text);
        });

        const response = await selectedModel.sendRequest(vsCodeMessages, {});

        if (stream) {
            // Streaming response (SSE format) with tool call support
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            for await (const part of response.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    const chunk = {
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: selectedModel.id,
                        choices: [{
                            index: 0,
                            delta: { content: part.value },
                            finish_reason: null
                        }]
                    };
                    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                } else if (part instanceof vscode.LanguageModelToolCallPart) {
                    // Tool call in streaming format
                    const chunk = {
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: selectedModel.id,
                        choices: [{
                            index: 0,
                            delta: {
                                tool_calls: [{
                                    index: 0,
                                    id: part.callId,
                                    type: 'function',
                                    function: {
                                        name: part.name,
                                        arguments: JSON.stringify(part.input)
                                    }
                                }]
                            },
                            finish_reason: null
                        }]
                    };
                    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                }
            }

            // Send final chunk
            const finalChunk = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: selectedModel.id,
                choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: 'stop'
                }]
            };
            res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            // Non-streaming response
            let fullText = '';
            for await (const part of response.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    fullText += part.value;
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: selectedModel.id,
                choices: [{
                    index: 0,
                    message: { role: 'assistant', content: fullText },
                    finish_reason: 'stop'
                }],
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            }));
        }
    } catch (error) {
        handleError(res, error);
    }
}

function parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

function handleError(res: http.ServerResponse, error: any) {
    console.error('Gateway error:', error);
    
    let statusCode = 500;
    let message = 'Internal server error';

    if (error instanceof vscode.LanguageModelError) {
        statusCode = 400;
        message = error.message;
    }

    logEvent('error', message);
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
}
