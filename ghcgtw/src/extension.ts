import * as vscode from 'vscode';
import * as http from 'http';

const PORT = 3000;
const GATEWAY_ID = 'github-copilot-gateway';
let server: http.Server | undefined;
let statusBarItem: vscode.StatusBarItem;
let requestCount = 0;
let startTime: number | undefined;

export function activate(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'github-copilot-gateway.showInfo';
    context.subscriptions.push(statusBarItem);

    context.subscriptions.push(
        vscode.commands.registerCommand('github-copilot-gateway.start', () => startServer()),
        vscode.commands.registerCommand('github-copilot-gateway.stop', () => stopServer()),
        vscode.commands.registerCommand('github-copilot-gateway.showInfo', () => showInfo())
    );

    // Auto-start server on activation
    startServer();
}

export function deactivate() {
    stopServer();
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
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // Handle chat completions endpoint
        if (req.url === '/v1/chat/completions' && req.method === 'POST') {
            requestCount++;
            await handleChatCompletion(req, res);
        } else if (req.url === '/v1/models' && req.method === 'GET') {
            await handleModels(req, res);
        } else if (req.url === '/v1/tokens' && req.method === 'POST') {
            await handleTokenCount(req, res);
        } else if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', port: PORT, app: GATEWAY_ID }));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    });

    server.listen(PORT, () => {
        startTime = Date.now();
        requestCount = 0;
        statusBarItem.text = `$(circle-filled) AI Gateway :${PORT} (hosting)`;
        statusBarItem.tooltip = 'This window is hosting the AI Gateway server (click for details)';
        statusBarItem.show();
        vscode.window.showInformationMessage(`AI Gateway started on http://localhost:${PORT}`);
    });

    server.on('error', async (err: any) => {
        if (err.code === 'EADDRINUSE') {
            const isGateway = await checkExistingGateway();
            if (isGateway) {
                statusBarItem.text = `$(circle-outline) AI Gateway :${PORT}`;
                statusBarItem.tooltip = 'Gateway is hosted by another VS Code window';
                statusBarItem.show();
            } else {
                statusBarItem.text = `$(warning) AI Gateway (port ${PORT} in use)`;
                statusBarItem.tooltip = `Port ${PORT} is already in use. Another service may be running. Click for options.`;
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
        const req = http.get({
            hostname: 'localhost',
            port: PORT,
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

function stopServer() {
    if (server) {
        server.close(() => {
            server = undefined;
            updateStatusBar();
            vscode.window.showInformationMessage('AI Gateway stopped');
        });
    } else {
        updateStatusBar();
    }
}

async function showInfo() {
    if (!server) {
        const connected = await checkExistingGateway();
        if (connected) {
            statusBarItem.text = `$(circle-outline) AI Gateway :${PORT}`;
            statusBarItem.tooltip = 'Gateway is hosted by another VS Code window';
            statusBarItem.show();
            vscode.window.showInformationMessage(`Gateway is hosted by another VS Code window.`);
            return;
        }

        const choice = await vscode.window.showInformationMessage(
            'AI Gateway is not running',
            'Start Server'
        );
        if (choice === 'Start Server') {
            startServer();
        }
        return;
    }

    const models = await requestModelAccess();
    const uptime = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m ${uptime % 60}s`;

    const info = [
        `**AI Gateway Status**`,
        ``,
        `🟢 Server: Running on port ${PORT}`,
        `⏱️  Uptime: ${uptimeStr}`,
        `📊 Requests: ${requestCount}`,
        `🤖 Models: ${models.length} available`,
        ``,
        `**Available Models:**`,
        ...models.map(m => `  • ${m.id} (${m.family})`),
        ``,
        `**Endpoint:** http://localhost:${PORT}`
    ].join('\n');

    vscode.window.showInformationMessage(info, { modal: true });
}

function updateStatusBar() {
    if (server) {
        statusBarItem.text = `$(check) AI Gateway :${PORT}`;
        statusBarItem.tooltip = 'GitHub Copilot AI Gateway is running (click for details)';
        statusBarItem.show();
    } else {
        statusBarItem.text = `$(x) AI Gateway`;
        statusBarItem.tooltip = 'AI Gateway is stopped (click to start)';
        statusBarItem.show();
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

        // Select model (same logic as chat completion)
        let selectedModel: vscode.LanguageModelChat | undefined;
        if (model) {
            const models = await requestModelAccess();
            selectedModel = models.find(m => m.id === model || m.family === model);
            if (!selectedModel) {
                const familyModels = await vscode.lm.selectChatModels({ family: model });
                selectedModel = familyModels[0];
            }
        } else {
            const miniModels = await vscode.lm.selectChatModels({ family: 'gpt-4o-mini' });
            selectedModel = miniModels.length > 0 ? miniModels[0] : (await requestModelAccess())[0];
        }

        if (!selectedModel) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Model not available' }));
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

async function handleChatCompletion(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
        const body = await parseBody(req);
        const { messages, model, stream = false, max_tokens, temperature, tools } = body;

        if (!messages || !Array.isArray(messages)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Messages array is required' }));
            return;
        }

        // Select model
        let selectedModel: vscode.LanguageModelChat | undefined;
        
        if (model) {
            // Try to find specific model by ID or family
            const models = await requestModelAccess();
            selectedModel = models.find(m => m.id === model || m.family === model);
            
            if (!selectedModel) {
                // Fallback: try to select by family name
                const familyModels = await vscode.lm.selectChatModels({ family: model });
                selectedModel = familyModels[0];
            }
        } else {
            // Default: use gpt-4o-mini
            const miniModels = await vscode.lm.selectChatModels({ family: 'gpt-4o-mini' });
            if (miniModels.length > 0) {
                selectedModel = miniModels[0];
            } else {
                // Fallback: any Copilot model
                const models = await requestModelAccess();
                selectedModel = models[0];
            }
        }

        if (!selectedModel) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Model "${model}" not available` }));
            return;
        }

        // Convert OpenAI messages to VS Code format (supports images)
        const vsCodeMessages = messages.map((msg: any) => {
            const content = msg.content;
            
            // Handle multimodal content (text + images)
            if (Array.isArray(content)) {
                // OpenAI format: [{ type: "text", text: "..." }, { type: "image_url", image_url: { url: "data:..." } }]
                const textParts = content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
                const imageParts = content.filter((c: any) => c.type === 'image_url');
                
                // VS Code expects base64 data URIs for images
                if (imageParts.length > 0 && selectedModel) {
                    // For now, concatenate text (images will be in future VS Code API updates)
                    const imageNote = imageParts.length > 0 ? `[${imageParts.length} image(s) attached]` : '';
                    const fullText = [textParts, imageNote].filter(Boolean).join('\n');
                    
                    if (msg.role === 'user' || msg.role === 'system') {
                        return vscode.LanguageModelChatMessage.User(fullText);
                    } else {
                        return vscode.LanguageModelChatMessage.Assistant(fullText);
                    }
                }
                
                return vscode.LanguageModelChatMessage.User(textParts);
            }
            
            // Simple string content
            if (msg.role === 'system' || msg.role === 'user') {
                return vscode.LanguageModelChatMessage.User(content);
            } else if (msg.role === 'assistant') {
                return vscode.LanguageModelChatMessage.Assistant(content);
            }
            return vscode.LanguageModelChatMessage.User(content);
        });

        // Send request to VS Code AI with tool support
        const options: vscode.LanguageModelChatRequestOptions = {};
        if (max_tokens) options.justification = `max_tokens: ${max_tokens}`;
        
        // Map OpenAI tools to VS Code tools
        if (tools && Array.isArray(tools)) {
            const vsCodeTools = tools.map((tool: any) => {
                return vscode.lm.tools.find(t => t.name === tool.function?.name);
            }).filter(Boolean) as vscode.LanguageModelChatTool[];
            
            if (vsCodeTools.length > 0) {
                options.tools = vsCodeTools;
            }
        }

        const response = await selectedModel.sendRequest(vsCodeMessages, options);

        if (stream) {
            // Streaming response (SSE format) with tool call support
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            let index = 0;
            for await (const part of response.stream) {
                // Handle different part types
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
                index++;
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
            // Non-streaming response with tool call support
            let fullText = '';
            const toolCalls: any[] = [];
            
            for await (const part of response.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    fullText += part.value;
                } else if (part instanceof vscode.LanguageModelToolCallPart) {
                    toolCalls.push({
                        id: part.callId,
                        type: 'function',
                        function: {
                            name: part.name,
                            arguments: JSON.stringify(part.input)
                        }
                    });
                }
            }

            const completion: any = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: selectedModel.id,
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: fullText || null
                    },
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                }
            };
            
            // Add tool calls if present
            if (toolCalls.length > 0) {
                completion.choices[0].message.tool_calls = toolCalls;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(completion));
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

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
}
