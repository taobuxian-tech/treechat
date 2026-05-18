import os
import json
import sys
import base64
from flask import Flask, render_template, request, Response, stream_with_context
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY', '')
DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

if not DEEPSEEK_API_KEY or DEEPSEEK_API_KEY == 'sk-你的key在这里':
    print('⚠️  请先在 .env 文件中填入你的 DeepSeek API Key')
    print('   申请地址：https://platform.deepseek.com/api_keys')
    print()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    if not data or 'messages' not in data:
        return {'error': '缺少 messages 参数'}, 400

    messages = data['messages']
    model = data.get('model', 'deepseek-chat')

    if not DEEPSEEK_API_KEY or DEEPSEEK_API_KEY == 'sk-你的key在这里':
        def generate_no_key():
            yield f"data: {json.dumps({'error': '请先在 .env 文件中配置 DEEPSEEK_API_KEY'})}\n\n"
            yield "data: {\"done\": true}\n\n"
        return Response(generate_no_key(), mimetype='text/event-stream')

    def generate():
        try:
            # 构建请求体 - 支持多模态
            payload = {
                'model': model,
                'messages': messages,
                'stream': True,
            }

            # deepseek-reasoner 不支持 stream 为 true（或需要特殊处理）
            if model == 'deepseek-reasoner':
                payload['stream'] = True

            resp = requests.post(
                f'{DEEPSEEK_BASE_URL}/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {DEEPSEEK_API_KEY}',
                    'Content-Type': 'application/json',
                },
                json=payload,
                stream=True,
                timeout=120,
            )

            if resp.status_code != 200:
                error_body = resp.text
                yield f"data: {json.dumps({'error': f'API 请求失败 (HTTP {resp.status_code}): {error_body}'})}\n\n"
                yield "data: {\"done\": true}\n\n"
                return

            for line in resp.iter_lines():
                if line:
                    line = line.decode('utf-8')
                    if line.startswith('data: '):
                        data_str = line[6:]
                        if data_str.strip() == '[DONE]':
                            break
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get('choices', [{}])
                            if not choices:
                                continue
                            delta = choices[0].get('delta', {})

                            # 深度思索：reasoning_content 和 content 都要处理
                            reasoning = delta.get('reasoning_content', '')
                            content = delta.get('content', '')

                            if reasoning:
                                yield f"data: {json.dumps({'reasoning': reasoning})}\n\n"
                            if content:
                                yield f"data: {json.dumps({'chunk': content})}\n\n"
                        except json.JSONDecodeError:
                            continue

            yield "data: {\"done\": true}\n\n"

        except requests.exceptions.Timeout:
            yield f"data: {json.dumps({'error': '请求超时，请检查网络或稍后重试'})}\n\n"
            yield "data: {\"done\": true}\n\n"
        except requests.exceptions.ConnectionError:
            yield f"data: {json.dumps({'error': '无法连接到 DeepSeek API，请检查网络'})}\n\n"
            yield "data: {\"done\": true}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': f'未知错误: {str(e)}'})}\n\n"
            yield "data: {\"done\": true}\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')


@app.route('/api/upload', methods=['POST'])
def upload():
    """接收图片上传，返回 base64 data URL"""
    if 'file' not in request.files:
        return {'error': '没有文件'}, 400
    file = request.files['file']
    if file.filename == '':
        return {'error': '没有选择文件'}, 400

    # 只接受图片
    if not file.content_type or not file.content_type.startswith('image/'):
        return {'error': '只支持图片文件'}, 400

    try:
        data = file.read()
        b64 = base64.b64encode(data).decode('utf-8')
        data_url = f"data:{file.content_type};base64,{b64}"
        return {'data_url': data_url, 'filename': file.filename}
    except Exception as e:
        return {'error': str(e)}, 500


@app.route('/api/share', methods=['POST'])
def share():
    """生成分享内容"""
    data = request.get_json()
    if not data or 'title' not in data or 'messages' not in data:
        return {'error': '参数不完整'}, 400

    # 构建分享文本
    lines = [f'【{data["title"]}】\n']
    for msg in data['messages']:
        role = '我' if msg['role'] == 'user' else 'AI'
        content = msg['content']
        if len(content) > 500:
            content = content[:500] + '...'
        lines.append(f'{role}: {content}\n')

    share_text = '\n'.join(lines)
    share_text += '\n—— 来自 TreeChat'

    return {
        'text': share_text,
        'title': data['title'],
        'message_count': len(data['messages']),
    }


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
