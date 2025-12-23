import * as vscode from 'vscode';
import * as http from 'http';

let currentPanel: vscode.WebviewPanel | undefined = undefined;

async function handleChatMessage(prompt: string, model: string, apiKey: string): Promise<{content: string, model: string, error?: string}> {
    return new Promise((resolve) => {
        const port = vscode.workspace.getConfiguration('github-copilot-gateway').get<number>('port', 3000);
        const requestData = JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            model: model || undefined,
            stream: false
        });

        const options = {
            hostname: 'localhost',
            port: port,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestData),
                'Authorization': `Bearer ${apiKey}`
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        resolve({ content: '', model: '', error: parsed.error });
                    } else {
                        resolve({ 
                            content: parsed.choices[0].message.content, 
                            model: parsed.model 
                        });
                    }
                } catch (err) {
                    resolve({ content: '', model: '', error: 'Failed to parse response' });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ content: '', model: '', error: `Connection error: ${err.message}. Make sure the server is running.` });
        });

        req.write(requestData);
        req.end();
    });
}

export function createOrShowWebview(
    context: vscode.ExtensionContext,
    serverRunning: boolean,
    port: number,
    model: string,
    apiKey: string,
    uptime: number,
    requestCount: number,
    models: Array<{ id: string; family: string; vendor: string }>
) {
    const column = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : undefined;

    // If we already have a panel, show it
    if (currentPanel) {
        currentPanel.reveal(column);
        updateWebviewContent(currentPanel, serverRunning, port, model, apiKey, uptime, requestCount, models);
        return;
    }

    // Otherwise, create a new panel
    currentPanel = vscode.window.createWebviewPanel(
        'aiGatewayPanel',
        'AI Gateway Dashboard',
        column || vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    currentPanel.iconPath = vscode.Uri.parse('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzAwNzhkNCIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgMThjLTQuNDEgMC04LTMuNTktOC04czMuNTktOCA4LTggOCAzLjU5IDggOC0zLjU5IDgtOCA4em0tMS01aC0ydi02aDJ2NnptMC04aC0yVjVoMnYyeiIvPjwvc3ZnPg==');

    updateWebviewContent(currentPanel, serverRunning, port, model, apiKey, uptime, requestCount, models);

    // Handle messages from the webview
    currentPanel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case 'start':
                    vscode.commands.executeCommand('github-copilot-gateway.start');
                    break;
                case 'stop':
                    vscode.commands.executeCommand('github-copilot-gateway.stop');
                    break;
                case 'selectModel':
                    vscode.commands.executeCommand('github-copilot-gateway.selectModel');
                    break;
                case 'copyApiKey':
                    vscode.env.clipboard.writeText(apiKey);
                    vscode.window.showInformationMessage('API key copied to clipboard');
                    break;
                case 'regenerateKey':
                    vscode.commands.executeCommand('github-copilot-gateway.regenerateApiKey');
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'github-copilot-gateway');
                    break;
                case 'chat':
                    // Handle chat message
                    const response = await handleChatMessage(message.prompt, message.model, apiKey);
                    if (currentPanel) {
                        currentPanel.webview.postMessage({ 
                            command: 'chatResponse', 
                            content: response.content,
                            model: response.model,
                            error: response.error
                        });
                    }
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    // Reset when the panel is closed
    currentPanel.onDidDispose(
        () => {
            currentPanel = undefined;
        },
        null,
        context.subscriptions
    );
}

function updateWebviewContent(
    panel: vscode.WebviewPanel,
    serverRunning: boolean,
    port: number,
    model: string,
    apiKey: string,
    uptime: number,
    requestCount: number,
    models: Array<{ id: string; family: string; vendor: string }>
) {
    panel.webview.html = getWebviewContent(serverRunning, port, model, apiKey, uptime, requestCount, models);
}

function getWebviewContent(
    serverRunning: boolean,
    port: number,
    model: string,
    apiKey: string,
    uptime: number,
    requestCount: number,
    models: Array<{ id: string; family: string; vendor: string }>
): string {
    const statusColor = serverRunning ? '#28a745' : '#6c757d';
    const statusText = serverRunning ? 'Running' : 'Stopped';
    const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m ${uptime % 60}s`;
    const modelsJson = JSON.stringify(models).replace(/"/g, '&quot;');
    const defaultModel = model;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Gateway</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
            overflow: hidden;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .tabs {
            display: flex;
            background-color: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 0 20px;
        }
        .tab {
            padding: 12px 24px;
            cursor: pointer;
            border: none;
            background: none;
            color: var(--vscode-foreground);
            opacity: 0.6;
            font-size: 13px;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }
        .tab:hover { opacity: 0.8; }
        .tab.active {
            opacity: 1;
            border-bottom-color: var(--vscode-button-background);
        }
        .tab-content {
            display: none;
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }
        .tab-content.active { display: block; }
        .container { max-width: 900px; margin: 0 auto; }
        h1 { font-size: 24px; margin-bottom: 20px; }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            background-color: ${statusColor};
            color: white;
            margin-left: 10px;
        }
        .card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .card h2 { font-size: 18px; margin-bottom: 15px; }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 15px;
        }
        .info-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }
        .info-value {
            font-size: 16px;
            font-weight: 600;
        }
        .button-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 15px;
        }
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            transition: background-color 0.2s;
        }
        button:hover { background-color: var(--vscode-button-hoverBackground); }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .api-key-container { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
        .api-key-input {
            flex: 1;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
        }
        .models-list { list-style: none; margin-top: 10px; }
        .models-list li {
            padding: 8px 12px;
            margin-bottom: 6px;
            background-color: var(--vscode-input-background);
            border-radius: 4px;
            display: flex;
            justify-content: space-between;
        }
        .current-model {
            background-color: var(--vscode-button-secondaryBackground);
            border-left: 3px solid var(--vscode-button-background);
        }
        .endpoint-box {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            margin-top: 10px;
        }
        
        /* Chat Styles */
        .chat-container {
            display: flex;
            flex-direction: column;
            height: calc(100vh - 120px);
            max-width: 900px;
            margin: 0 auto;
        }
        .chat-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .model-select {
            padding: 6px 12px;
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
        }
        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin-bottom: 15px;
        }
        .message {
            margin-bottom: 20px;
            animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .message-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .message-role { font-weight: 600; text-transform: uppercase; }
        .message-content {
            padding: 12px 16px;
            border-radius: 6px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .user-message .message-content {
            background-color: var(--vscode-input-background);
            border-left: 3px solid var(--vscode-button-background);
        }
        .assistant-message .message-content {
            background-color: var(--vscode-textCodeBlock-background);
            border-left: 3px solid #28a745;
        }
        .error-message .message-content {
            background-color: var(--vscode-inputValidation-errorBackground);
            border-left: 3px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-errorForeground);
        }
        .chat-input-container {
            display: flex;
            gap: 10px;
            align-items: flex-end;
        }
        .chat-input {
            flex: 1;
            padding: 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            resize: vertical;
            min-height: 44px;
            max-height: 200px;
        }
        .chat-input:focus { outline: 1px solid var(--vscode-focusBorder); }
        .send-button {
            padding: 12px 24px;
            min-width: 80px;
        }
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            text-align: center;
        }
        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }
        .typing-indicator {
            display: inline-block;
            padding: 12px 16px;
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 6px;
            border-left: 3px solid #28a745;
        }
        .typing-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--vscode-foreground);
            margin: 0 2px;
            animation: typing 1.4s infinite;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typing {
            0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
            30% { opacity: 1; transform: translateY(-10px); }
        }
        .clear-chat-btn {
            padding: 6px 12px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="tabs">
        <button class="tab active" onclick="switchTab('dashboard')">📊 Dashboard</button>
        <button class="tab" onclick="switchTab('chat')">💬 Chat</button>
    </div>

    <!-- Dashboard Tab -->
    <div id="dashboard-tab" class="tab-content active">
        <div class="container">
            <h1>🤖 AI Gateway Dashboard<span class="status-badge">${statusText}</span></h1>

            <div class="card">
                <h2>📊 Server Status</h2>
                <div class="info-grid">
                    <div><div class="info-label">Port</div><div class="info-value">${port}</div></div>
                    <div><div class="info-label">Default Model</div><div class="info-value">${model}</div></div>
                    <div><div class="info-label">Uptime</div><div class="info-value">${serverRunning ? uptimeStr : 'N/A'}</div></div>
                    <div><div class="info-label">Requests</div><div class="info-value">${requestCount}</div></div>
                </div>
                <div class="button-group">
                    <button onclick="handleStart()" ${serverRunning ? 'disabled' : ''}>▶️ Start Server</button>
                    <button onclick="handleStop()" ${!serverRunning ? 'disabled' : ''}>⏸️ Stop Server</button>
                    <button class="secondary" onclick="handleSelectModel()">🔄 Change Model</button>
                    <button class="secondary" onclick="handleOpenSettings()">⚙️ Settings</button>
                </div>
            </div>

            <div class="card">
                <h2>🔑 API Key</h2>
                <p style="color: var(--vscode-descriptionForeground); margin-bottom: 10px;">
                    Use this key in the <code>Authorization: Bearer &lt;key&gt;</code> header.
                </p>
                <div class="api-key-container">
                    <input type="text" class="api-key-input" value="${apiKey}" readonly>
                    <button onclick="handleCopyKey()">📋 Copy</button>
                    <button class="secondary" onclick="handleRegenerateKey()">🔄 Regenerate</button>
                </div>
            </div>

            <div class="card">
                <h2>🌐 API Endpoint</h2>
                <div class="endpoint-box">http://localhost:${port}/v1/chat/completions</div>
                <p style="color: var(--vscode-descriptionForeground); margin-top: 10px; font-size: 12px;">
                    Also available: <code>/v1/models</code>, <code>/v1/tokens</code>, <code>/health</code>
                </p>
            </div>

            <div class="card">
                <h2>🤖 Available Models (${models.length})</h2>
                <ul class="models-list">
                    ${models.map(m => `
                        <li class="${m.family === model ? 'current-model' : ''}">
                            <span><strong>${m.id}</strong> ${m.family === model ? '(Current)' : ''}</span>
                            <span style="font-size: 12px; color: var(--vscode-descriptionForeground);">${m.vendor}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        </div>
    </div>

    <!-- Chat Tab -->
    <div id="chat-tab" class="tab-content">
        <div class="chat-container">
            <div class="chat-header">
                <h1>💬 Chat</h1>
                <div>
                    <label for="model-select" style="margin-right: 8px; font-size: 12px; color: var(--vscode-descriptionForeground);">Model:</label>
                    <select id="model-select" class="model-select">
                        <option value="">Default (${defaultModel})</option>
                        ${models.map(m => `<option value="${m.family}">${m.id}</option>`).join('')}
                    </select>
                    <button class="secondary clear-chat-btn" onclick="clearChat()" style="margin-left: 10px;">🗑️ Clear</button>
                </div>
            </div>
            
            <div id="chat-messages" class="chat-messages">
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <h2>Start a conversation</h2>
                    <p style="margin-top: 8px;">Ask me anything! I'm powered by your GitHub Copilot subscription.</p>
                </div>
            </div>
            
            <div class="chat-input-container">
                <textarea id="chat-input" class="chat-input" placeholder="Type your message... (Shift+Enter for new line, Enter to send)" rows="1"></textarea>
                <button id="send-button" class="send-button" onclick="sendMessage()">Send</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let isWaitingForResponse = false;

        // Tab switching
        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            
            if (tabName === 'dashboard') {
                document.querySelectorAll('.tab')[0].classList.add('active');
                document.getElementById('dashboard-tab').classList.add('active');
            } else {
                document.querySelectorAll('.tab')[1].classList.add('active');
                document.getElementById('chat-tab').classList.add('active');
            }
        }

        // Dashboard functions
        function handleStart() { vscode.postMessage({ command: 'start' }); }
        function handleStop() { vscode.postMessage({ command: 'stop' }); }
        function handleSelectModel() { vscode.postMessage({ command: 'selectModel' }); }
        function handleCopyKey() { vscode.postMessage({ command: 'copyApiKey' }); }
        function handleRegenerateKey() { vscode.postMessage({ command: 'regenerateKey' }); }
        function handleOpenSettings() { vscode.postMessage({ command: 'openSettings' }); }

        // Chat functions
        function clearChat() {
            const messagesDiv = document.getElementById('chat-messages');
            messagesDiv.innerHTML = \`
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <h2>Start a conversation</h2>
                    <p style="margin-top: 8px;">Ask me anything! I'm powered by your GitHub Copilot subscription.</p>
                </div>
            \`;
        }

        function addMessage(role, content, model) {
            const messagesDiv = document.getElementById('chat-messages');
            const emptyState = messagesDiv.querySelector('.empty-state');
            if (emptyState) {
                messagesDiv.innerHTML = '';
            }

            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${role}-message\`;
            
            const roleEmoji = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : '⚠️';
            const modelText = model && role === 'assistant' ? \` • \${model}\` : '';
            
            messageDiv.innerHTML = \`
                <div class="message-header">
                    <span>\${roleEmoji}</span>
                    <span class="message-role">\${role}\</span>
                    <span>\${modelText}</span>
                </div>
                <div class="message-content">\${content}</div>
            \`;
            
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function addTypingIndicator() {
            const messagesDiv = document.getElementById('chat-messages');
            const indicator = document.createElement('div');
            indicator.id = 'typing-indicator';
            indicator.className = 'message';
            indicator.innerHTML = \`
                <div class="typing-indicator">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            \`;
            messagesDiv.appendChild(indicator);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function removeTypingIndicator() {
            const indicator = document.getElementById('typing-indicator');
            if (indicator) {
                indicator.remove();
            }
        }

        function sendMessage() {
            if (isWaitingForResponse) return;

            const input = document.getElementById('chat-input');
            const modelSelect = document.getElementById('model-select');
            const prompt = input.value.trim();
            
            if (!prompt) return;

            const selectedModel = modelSelect.value;
            
            addMessage('user', prompt, '');
            input.value = '';
            input.style.height = '44px';
            
            addTypingIndicator();
            isWaitingForResponse = true;
            document.getElementById('send-button').disabled = true;
            
            vscode.postMessage({
                command: 'chat',
                prompt: prompt,
                model: selectedModel
            });
        }

        // Handle Enter key
        document.addEventListener('DOMContentLoaded', () => {
            const input = document.getElementById('chat-input');
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            // Auto-resize textarea
            input.addEventListener('input', function() {
                this.style.height = '44px';
                this.style.height = Math.min(this.scrollHeight, 200) + 'px';
            });
        });

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.command === 'chatResponse') {
                removeTypingIndicator();
                isWaitingForResponse = false;
                document.getElementById('send-button').disabled = false;
                
                if (message.error) {
                    addMessage('error', message.error, '');
                } else {
                    addMessage('assistant', message.content, message.model);
                }
            }
        });
    </script>
</body>
</html>`;
}

export function updateWebview(
    serverRunning: boolean,
    port: number,
    model: string,
    apiKey: string,
    uptime: number,
    requestCount: number,
    models: Array<{ id: string; family: string; vendor: string }>
) {
    if (currentPanel) {
        updateWebviewContent(currentPanel, serverRunning, port, model, apiKey, uptime, requestCount, models);
    }
}
