#!/usr/bin/env python3
"""
Simple CLI client for GitHub Copilot AI Gateway.
Usage: python qchat.py "Your question here" [--model gpt-4o]
"""

import sys
import argparse
import json
import warnings

# Suppress urllib3 OpenSSL warnings
warnings.filterwarnings('ignore', message='.*OpenSSL.*')

try:
    import requests
except ImportError:
    print("Error: requests library not found. Install with: pip install requests")
    sys.exit(1)

GATEWAY_URL = "http://localhost:3000"

def list_models():
    """List available AI models from the gateway."""
    try:
        response = requests.get(f"{GATEWAY_URL}/v1/models")
        response.raise_for_status()
        data = response.json()
        
        print("Available models:")
        for model in data.get('data', []):
            print(f"  - {model['id']} (family: {model['root']})")
        return True
    except requests.exceptions.ConnectionError:
        print(f"Error: Cannot connect to AI Gateway at {GATEWAY_URL}")
        print("Make sure the VS Code extension is running.")
        return False
    except Exception as e:
        print(f"Error listing models: {e}")
        return False

def chat(prompt, model=None, stream=True):
    """Send a chat request to the gateway."""
    try:
        payload = {
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "stream": stream
        }
        
        if model:
            payload["model"] = model
        
        if stream:
            # Streaming response
            response = requests.post(
                f"{GATEWAY_URL}/v1/chat/completions",
                json=payload,
                stream=True,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            
            print("Assistant: ", end="", flush=True)
            used_model = None
            for line in response.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    if line_str.startswith('data: '):
                        data_str = line_str[6:]
                        if data_str == '[DONE]':
                            break
                        try:
                            chunk = json.loads(data_str)
                            if used_model is None:
                                used_model = chunk.get('model')
                            content = chunk['choices'][0]['delta'].get('content', '')
                            if content:
                                print(content, end="", flush=True)
                        except json.JSONDecodeError:
                            pass
            print()  # New line at the end
            if used_model and not model:
                print(f"[using {used_model}]", file=sys.stderr)
        else:
            # Non-streaming response
            response = requests.post(
                f"{GATEWAY_URL}/v1/chat/completions",
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            
            data = response.json()
            message = data['choices'][0]['message']['content']
            used_model = data.get('model')
            print(f"Assistant: {message}")
            if used_model and not model:
                print(f"[using {used_model}]", file=sys.stderr)
        
        return True
        
    except requests.exceptions.ConnectionError:
        print(f"Error: Cannot connect to AI Gateway at {GATEWAY_URL}")
        print("Make sure the VS Code extension is running.")
        return False
    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error: {e}")
        if e.response is not None:
            try:
                error_data = e.response.json()
                print(f"Details: {error_data.get('error', 'Unknown error')}")
            except:
                pass
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(
        description="Chat with GitHub Copilot AI through VS Code Gateway"
    )
    parser.add_argument(
        'prompt',
        nargs='?',
        help='Your chat prompt'
    )
    parser.add_argument(
        '--model', '-m',
        help='AI model to use (e.g., gpt-4o, claude-3.5-sonnet)'
    )
    parser.add_argument(
        '--list-models',
        action='store_true',
        help='List available models and exit'
    )
    parser.add_argument(
        '--no-stream',
        action='store_true',
        help='Disable streaming (wait for complete response)'
    )
    
    args = parser.parse_args()
    
    if args.list_models:
        sys.exit(0 if list_models() else 1)
    
    if not args.prompt:
        parser.print_help()
        print("\nExamples:")
        print("  python qchat.py \"Explain Python decorators\"")
        print("  python qchat.py \"Write a haiku about coding\" --model gpt-4o")
        print("  python qchat.py --list-models")
        sys.exit(1)
    
    success = chat(args.prompt, model=args.model, stream=not args.no_stream)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
