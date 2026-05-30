# TreeMind 🌲

基于 DeepSeek API 的树状分支对话网页应用。

## 特色功能

- 🎯 **树状分支对话** — 选中 AI 回复中的任意文字，一键「追问」生成子对话，父子对话独立隔离
- 🗺️ **对话导图** — 可视化整棵对话树，点击节点一键跳转
- 🤖 **深度思索** — 切换 DeepSeek-Reasoner 模型，获得深度推理回答
- 📎 **图片上传** — 上传图片，在对话中预览（AI 暂不支持识别，待 API 升级）
- 💬 **消息交互** — 复制、重新生成、点赞/点踩、分享

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/你的用户名/treechat.git
cd treechat
```

### 2. 配置 API Key

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env，填入你的 DeepSeek API Key
# 申请地址：https://platform.deepseek.com/api_keys
```

### 3. 安装依赖

```bash
pip install flask requests python-dotenv
```

### 4. 启动

```bash
python server.py
```

浏览器打开 http://localhost:5050 即可使用。

## 技术栈

- **后端**: Python Flask + DeepSeek API (SSE 流式输出)
- **前端**: 原生 HTML/CSS/JS（无框架，开箱即用）
- **存储**: 浏览器 localStorage（数据在本地，关页不丢）

## 项目结构

```
treechat/
├── server.py              # Flask 后端
├── .env                   # 你的 API Key（不上传）
├── .env.example           # 环境变量模板
├── requirements.txt       # Python 依赖
├── templates/
│   └── index.html         # 主页面
├── static/
│   ├── css/style.css      # 样式
│   └── js/app.js          # 前端逻辑
└── README.md              # 本文件
```
