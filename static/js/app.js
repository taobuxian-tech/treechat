/**
 * TreeMind - 前端核心逻辑 (DeepSeek 风格)
 */

// ============================
// State
// ============================

const STORAGE_KEY = 'treechat_state';

let state = {
  conversations: {},
  activeConvId: null,
  isStreaming: false,
  deepThink: false,
  webSearch: false,
};

function defaultState() {
  return { conversations: {}, activeConvId: null, isStreaming: false, deepThink: false, webSearch: false };
}

// ============================
// Model
// ============================

function createConversation(title, parentId) {
  return {
    id: generateId(),
    title: title || '新对话',
    messages: [],
    pinned: false,
    parentId: parentId || null,
    expanded: true,
    createdAt: Date.now(),
  };
}

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============================
// Persistence
// ============================

function saveState() {
  try {
    const data = {
      conversations: state.conversations,
      activeConvId: state.activeConvId,
      deepThink: state.deepThink,
      webSearch: state.webSearch,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { console.warn('save failed:', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.conversations = data.conversations || {};
      state.activeConvId = data.activeConvId || null;
      state.deepThink = data.deepThink || false;
      state.webSearch = data.webSearch || false;
      if (state.activeConvId && !state.conversations[state.activeConvId]) {
        state.activeConvId = null;
      }
    }
  } catch (e) { console.warn('load failed:', e); }
}

// ============================
// DOM refs
// ============================

const els = {
  sidebar: document.getElementById('sidebar'),
  convList: document.getElementById('conversation-list'),
  btnNewConv: document.getElementById('btn-new-conv'),
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  messageList: document.getElementById('message-list'),
  welcomeScreen: document.getElementById('welcome-screen'),
  chatTitle: document.getElementById('chat-title'),
  input: document.getElementById('message-input'),
  btnSend: document.getElementById('btn-send'),
  btnAttach: document.getElementById('btn-attach'),
  btnDeepThink: document.getElementById('btn-deep-think'),
  btnWebSearch: document.getElementById('btn-web-search'),
  inputHint: document.getElementById('input-hint'),
  convMenu: document.getElementById('conv-menu'),
  selToolbar: document.getElementById('selection-toolbar'),
  treeModal: document.getElementById('tree-modal'),
  treeModalBody: document.getElementById('tree-modal-body'),
  treeModalClose: document.getElementById('tree-modal-close'),
  treeModalBackdrop: document.getElementById('tree-modal-backdrop'),
};

// ============================
// Grouping helper
// ============================

function getGroupLabel(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const d = new Date(date);

  if (d >= today) return '今天';
  if (d >= yesterday) return '昨天';
  if (d >= weekAgo) return '7天内';
  return '更早';
}

// ============================
// Rendering
// ============================

function renderSidebar() {
  const convs = Object.values(state.conversations)
    .sort((a, b) => b.createdAt - a.createdAt);

  // 分出根对话（没有parentId的）和子对话
  const rootConvs = convs.filter(c => !c.parentId);
  const childrenByParent = {};
  convs.forEach(c => {
    if (c.parentId) {
      if (!childrenByParent[c.parentId]) childrenByParent[c.parentId] = [];
      childrenByParent[c.parentId].push(c);
    }
  });

  if (rootConvs.length === 0 && Object.keys(childrenByParent).length === 0) {
    els.convList.innerHTML = '<div style="text-align:center;padding:30px 16px;color:var(--color-text-muted);font-size:13px;">暂无对话</div>';
    return;
  }

  // 按时间分组（只对根对话）
  const groups = { '置顶': [], '今天': [], '昨天': [], '7天内': [], '更早': [] };
  rootConvs.forEach(conv => {
    if (conv.pinned) {
      groups['置顶'].push(conv);
    } else {
      const label = getGroupLabel(conv.createdAt);
      if (!groups[label]) groups[label] = [];
      groups[label].push(conv);
    }
  });

  let html = '';
  const groupOrder = ['置顶', '今天', '昨天', '7天内', '更早'];

  groupOrder.forEach(label => {
    const items = groups[label];
    if (!items || items.length === 0) return;
    html += `<div class="conv-group"><div class="conv-group-title">${label}</div>`;
    items.forEach(conv => {
      html += renderConvTreeItem(conv, childrenByParent, 0);
    });
    html += '</div>';
  });

  // 如果有子对话不属于任何根对话（单独的子对话），在最下方显示
  Object.keys(childrenByParent).forEach(parentId => {
    if (!state.conversations[parentId]) {
      const orphans = childrenByParent[parentId];
      html += `<div class="conv-group"><div class="conv-group-title">其他</div>`;
      orphans.forEach(conv => {
        html += renderConvTreeItem(conv, childrenByParent, 0);
      });
      html += '</div>';
    }
  });

  els.convList.innerHTML = html;

  // 绑定事件
  els.convList.querySelectorAll('.conv-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.conv-more')) return;
      if (e.target.closest('.conv-toggle')) return;
      switchConversation(item.dataset.convId);
    });
  });

  els.convList.querySelectorAll('.conv-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const convId = btn.dataset.convId;
      const conv = state.conversations[convId];
      if (conv) {
        conv.expanded = !conv.expanded;
        saveState();
        renderSidebar();
      }
    });
  });

  els.convList.querySelectorAll('.conv-more').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showConvMenu(btn.dataset.convId, btn);
    });
  });
}

function renderConvTreeItem(conv, childrenByParent, depth) {
  const isActive = conv.id === state.activeConvId;
  const displayTitle = conv.title || '新对话';
  const children = childrenByParent[conv.id] || [];
  const hasChildren = children.length > 0;
  const isExpanded = conv.expanded !== false; // 默认展开
  const isChild = !!conv.parentId;

  let itemHtml = '';

  // 生成展开按钮
  let toggleHtml = '';
  if (hasChildren) {
    toggleHtml = `
      <button class="conv-toggle" data-conv-id="${conv.id}" title="${isExpanded ? '收起' : '展开'}追问">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="transform:${isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'};transition:transform 0.2s">
          <polygon points="6 4, 18 12, 6 20"/>
        </svg>
      </button>
    `;
  } else {
    toggleHtml = `<span class="conv-toggle-placeholder"></span>`;
  }

  // 子对话的缩进和黑边框
  const childClass = isChild ? 'conv-child' : '';

  itemHtml += `
    <div class="conv-item ${isActive ? 'active' : ''} ${childClass}" data-conv-id="${conv.id}" style="padding-left:${8 + depth * 16}px">
      ${toggleHtml}
      <span class="conv-title">${escapeHtml(isChild ? '↳ ' + displayTitle : displayTitle)}</span>
      <button class="conv-more" data-conv-id="${conv.id}" title="更多">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
      </button>
    </div>
  `;

  // 展开子对话
  if (hasChildren && isExpanded) {
    children.sort((a, b) => b.createdAt - a.createdAt);
    children.forEach(child => {
      itemHtml += renderConvTreeItem(child, childrenByParent, depth + 1);
    });
  }

  return itemHtml;
}

function renderMessages() {
  const conv = getActiveConversation();
  els.messageList.innerHTML = '';

  if (!conv || conv.messages.length === 0) {
    els.welcomeScreen.style.display = 'flex';
    return;
  }

  els.welcomeScreen.style.display = 'none';

  // 子对话顶部：上下文提示条 + 返回按钮
  if (conv.parentId) {
    const parentConv = state.conversations[conv.parentId];
    if (parentConv) {
      // 提取选中的原文
      const contextMsg = conv.messages.find(m => m._isContext);
      let quoteText = '';
      if (contextMsg) {
        const match = contextMsg.content.match(/「(.+?)」/);
        quoteText = match ? match[1] : '';
      }

      const bar = document.createElement('div');
      bar.className = 'context-bar';
      bar.innerHTML = `
        <div class="context-bar-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 004 4h12"/></svg>
          <span>追问自：<strong>${escapeHtml(parentConv.title || '父对话')}</strong></span>
          ${quoteText ? `<span class="context-bar-quote">「${escapeHtml(quoteText)}」</span>` : ''}
        </div>
        <button class="context-bar-back" data-conv-id="${conv.parentId}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          回到父对话
        </button>
      `;
      els.messageList.appendChild(bar);

      // 返回按钮事件
      bar.querySelector('.context-bar-back').addEventListener('click', () => {
        switchConversation(conv.parentId);
      });
    }
  }

  conv.messages.forEach(msg => {
    // Context messages are shown in the bar above, skip in message list
    if (msg._isContext) return;

    const div = document.createElement('div');
    div.className = `message ${msg.role}`;
    div.dataset.msgId = msg.id;

    const avatarText = msg.role === 'user' ? 'U' : 'T';
    const content = renderContent(msg.content || '');

    // 图片渲染
    let imagesHtml = '';
    if (msg.images && msg.images.length > 0) {
      imagesHtml = '<div class="msg-images">';
      msg.images.forEach(url => {
        imagesHtml += `<img src="${url}" class="msg-image" onclick="window.open('${url}')" />`;
      });
      imagesHtml += '</div>';
    }

    let buttonsHtml = '';
    if (msg.role === 'assistant' && !msg._isStreaming && !msg._isContext) {
      const liked = msg._liked ? 'active' : '';
      const disliked = msg._disliked ? 'active' : '';
      buttonsHtml = `
        <div class="msg-actions">
          <button class="msg-action-btn" title="复制" data-action="copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          <button class="msg-action-btn" title="重新生成" data-action="regenerate">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          </button>
          <button class="msg-action-btn ${liked}" title="点赞" data-action="like">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
          </button>
          <button class="msg-action-btn ${disliked}" title="点踩" data-action="dislike">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${disliked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10zM17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>
          </button>
          <button class="msg-action-btn" title="分享" data-action="share">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </button>
          <div class="msg-actions-more-wrap">
            <button class="msg-action-btn" title="更多" data-action="more">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            <div class="msg-actions-dropdown hidden">
              <div class="msg-dd-item" data-action="fork-msg">追问此消息</div>
              <div class="msg-dd-item msg-dd-danger" data-action="delete-msg">删除</div>
            </div>
          </div>
        </div>
      `;
    }

    div.innerHTML = `
      <div class="message-avatar">${avatarText}</div>
      <div class="message-content">${imagesHtml}${content}</div>
      ${buttonsHtml}
    `;

    els.messageList.appendChild(div);
  });

  // 绑定消息按钮事件
  els.messageList.querySelectorAll('.msg-actions').forEach(actionsEl => {
    const msgDiv = actionsEl.closest('.message');
    if (!msgDiv) return;

    actionsEl.querySelectorAll('.msg-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const msgId = msgDiv.dataset.msgId;
        const conv = getActiveConversation();
        if (!conv) return;
        const msg = conv.messages.find(m => m.id === msgId);
        if (!msg) return;

        switch (action) {
          case 'copy':
            navigator.clipboard.writeText(msg.content).catch(() => {});
            break;
          case 'regenerate':
            handleRegenerate(conv, msgId);
            break;
          case 'like':
            msg._liked = !msg._liked;
            if (msg._liked) msg._disliked = false;
            saveState();
            renderMessages();
            break;
          case 'dislike':
            msg._disliked = !msg._disliked;
            if (msg._disliked) msg._liked = false;
            saveState();
            renderMessages();
            break;
          case 'share':
            navigator.clipboard.writeText(msg.content).catch(() => {});
            break;
          case 'more':
            // toggle dropdown
            const dd = btn.parentElement.querySelector('.msg-actions-dropdown');
            if (dd) dd.classList.toggle('hidden');
            break;
        }
      });
    });

    // 更多下拉菜单的选项
    actionsEl.querySelectorAll('.msg-dd-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        const msgId = msgDiv.dataset.msgId;
        const conv = getActiveConversation();
        if (!conv) return;

        // 关闭下拉
        const dd = item.closest('.msg-actions-dropdown');
        if (dd) dd.classList.add('hidden');

        switch (action) {
          case 'fork-msg':
            // 选中整条消息内容，触发追问
            const msg = conv.messages.find(m => m.id === msgId);
            if (msg && msg.content) {
              // 选中所有文本
              selSourceMsgId = msgId;
              selSourceConvId = conv.id;
              selText = msg.content.slice(0, 200);
              // 直接跳转到追问流程
              forkWithText(selText, conv.id);
            }
            break;
          case 'delete-msg':
            const idx = conv.messages.findIndex(m => m.id === msgId);
            if (idx > 0 && idx < conv.messages.length) {
              conv.messages.splice(idx, 1);
              saveState();
              renderMessages();
            }
            break;
        }
      });
    });
  });

  // 点击其他地方关闭所有更多下拉菜单
  document.querySelectorAll('.msg-actions-dropdown:not(.hidden)').forEach(dd => {
    // 会由全局点击关闭
  });

  scrollToBottom();

  // 数学公式渲染
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([els.messageList]).catch(() => {});
  }
}

function handleRegenerate(conv, msgId) {
  const msgIndex = conv.messages.findIndex(m => m.id === msgId);
  if (msgIndex < 0) return;
  // 删除这条 AI 消息以及之后的用户消息
  conv.messages.splice(msgIndex);
  saveState();
  // 找到最后一条用户消息，重新发送
  const lastUserMsg = [...conv.messages].reverse().find(m => m.role === 'user');
  if (lastUserMsg) {
    els.input.value = lastUserMsg.content;
    // Remove the user message too (will be re-added by sendMessage)
    const userIdx = conv.messages.findIndex(m => m.id === lastUserMsg.id);
    if (userIdx >= 0) conv.messages.splice(userIdx);
    saveState();
    renderMessages();
    sendMessage();
  } else {
    renderMessages();
  }
}

function forkWithText(text, convId) {
  const title = '追问: ' + text.slice(0, 20) + (text.length > 20 ? '...' : '');
  const conv = createConversation(title, convId);
  conv.messages.push({
    id: generateId(),
    role: 'system',
    content: `以下是对之前对话中某段内容的追问。\n引用原文：「${text}」\n请基于这段内容回答用户的问题。`,
    _isContext: true,
  });
  state.conversations[conv.id] = conv;
  state.activeConvId = conv.id;
  saveState();
  hideSelectionToolbar();
  renderSidebar();
  renderMessages();
  updateChatTitle();
  setInputEnabled(true);
  els.input.value = '';
  updateSendButton();
  els.input.placeholder = '请针对选中的内容提问...';
  els.input.focus();
}

function renderContent(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // 先保护 \[...\] 显示公式块（可能跨多行），避免被 \n 处理破坏
  const displayMathBlocks = [];
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, (m, formula) => {
    const idx = displayMathBlocks.length;
    displayMathBlocks.push(`\\[${formula}\\]`);
    return `%%DISPLAYMATH_${idx}%%`;
  });

  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // 恢复显示公式块
  html = html.replace(/%%DISPLAYMATH_(\d+)%%/g, (m, idx) => {
    return displayMathBlocks[parseInt(idx)] || '';
  });

  return `<p>${html}</p>`;
}

function getOrCreateStreamingBubble() {
  const conv = getActiveConversation();
  if (!conv) return null;

  const lastMsg = conv.messages[conv.messages.length - 1];
  if (lastMsg && lastMsg.role === 'assistant' && lastMsg._isStreaming) {
    return els.messageList.querySelector('.message.assistant:last-child .message-content');
  }

  const msgId = generateId();
  const msg = { id: msgId, role: 'assistant', content: '', _isStreaming: true };
  conv.messages.push(msg);

  const div = document.createElement('div');
  div.className = 'message assistant';
  div.dataset.msgId = msgId;
  div.innerHTML = `
    <div class="message-avatar">T</div>
    <div class="message-content streaming"></div>
  `;
  els.messageList.appendChild(div);
  scrollToBottom();
  return div.querySelector('.message-content');
}

function updateStreamingBubble(el, text) {
  el.textContent = text;
  el.classList.add('streaming');
  scrollToBottom();
}

function finalizeStreamingBubble() {
  const conv = getActiveConversation();
  if (!conv) return;
  const last = conv.messages[conv.messages.length - 1];
  if (last && last._isStreaming) {
    delete last._isStreaming;
    saveState();
    // 重新渲染消息以显示按钮栏
    renderMessages();
  }
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    els.messageList.scrollTop = els.messageList.scrollHeight;
  });
}

function updateChatTitle() {
  const conv = getActiveConversation();
  els.chatTitle.textContent = conv ? (conv.title || '新对话') : 'TreeMind';
}

function updateSendButton() {
  const hasText = els.input.value.trim().length > 0;
  const canSend = hasText && !state.isStreaming && getActiveConversation() !== null;
  els.btnSend.disabled = !canSend;
  els.btnSend.classList.toggle('active', hasText && !state.isStreaming);
}

function setInputEnabled(enabled) {
  els.input.disabled = !enabled;
  if (enabled) els.input.focus();
}

// ============================
// Context menu
// ============================

let menuConvId = null;

function showConvMenu(convId, btn) {
  menuConvId = convId;
  const rect = btn.getBoundingClientRect();
  const menu = els.convMenu;
  menu.style.top = rect.bottom + 4 + 'px';
  menu.style.left = Math.max(4, rect.right - 150) + 'px';

  const pinItem = menu.querySelector('[data-action="pin"]');
  const conv = state.conversations[convId];
  pinItem.textContent = conv && conv.pinned ? '取消置顶' : '置顶';

  menu.classList.remove('menu-hidden');
  menu.classList.add('menu-visible');
}

function hideConvMenu() {
  els.convMenu.classList.remove('menu-visible');
  els.convMenu.classList.add('menu-hidden');
}

// ============================
// Conversation ops
// ============================

function getActiveConversation() {
  return state.activeConvId ? state.conversations[state.activeConvId] : null;
}

function switchConversation(convId) {
  if (state.isStreaming) return;
  if (!state.conversations[convId]) return;
  state.activeConvId = convId;
  saveState();
  renderSidebar();
  renderMessages();
  updateChatTitle();
  updateSendButton();
}

function newConversation() {
  if (state.isStreaming) return;
  const conv = createConversation();
  state.conversations[conv.id] = conv;
  state.activeConvId = conv.id;
  saveState();
  renderSidebar();
  renderMessages();
  updateChatTitle();
  setInputEnabled(true);
  els.input.value = '';
  updateSendButton();
  els.input.focus();
}

function deleteConversation(convId) {
  if (state.isStreaming) return;
  if (!state.conversations[convId]) return;
  if (!confirm('确定删除这个对话吗？')) return;

  // 递归删除所有子对话
  const childrenIds = Object.values(state.conversations)
    .filter(c => c.parentId === convId)
    .map(c => c.id);
  childrenIds.forEach(childId => {
    deleteConversationNoConfirm(childId);
  });

  delete state.conversations[convId];
  if (state.activeConvId === convId) {
    const remaining = Object.keys(state.conversations);
    state.activeConvId = remaining.length > 0 ? remaining[0] : null;
  }
  saveState();
  renderSidebar();
  if (state.activeConvId) {
    renderMessages();
    updateChatTitle();
    setInputEnabled(true);
  } else {
    els.messageList.innerHTML = '';
    els.welcomeScreen.style.display = 'flex';
    els.chatTitle.textContent = 'TreeMind';
    setInputEnabled(false);
  }
  updateSendButton();
  hideConvMenu();
}

function deleteConversationNoConfirm(convId) {
  // 删除子对话（不弹确认框）
  const childrenIds = Object.values(state.conversations)
    .filter(c => c.parentId === convId)
    .map(c => c.id);
  childrenIds.forEach(childId => deleteConversationNoConfirm(childId));
  delete state.conversations[convId];
}

function renameConversation(convId) {
  const conv = state.conversations[convId];
  if (!conv) return;
  const newTitle = prompt('请输入新名称：', conv.title);
  if (newTitle && newTitle.trim()) {
    conv.title = newTitle.trim();
    saveState();
    renderSidebar();
    updateChatTitle();
  }
  hideConvMenu();
}

function pinConversation(convId) {
  const conv = state.conversations[convId];
  if (!conv) return;
  conv.pinned = !conv.pinned;
  saveState();
  renderSidebar();
  hideConvMenu();
}

function shareConversation(convId) {
  const conv = state.conversations[convId];
  if (!conv) return;
  hideConvMenu();

  // 调用分享 API
  fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: conv.title || '对话',
      messages: conv.messages.filter(m => !m._isContext).map(m => ({
        role: m.role,
        content: m.content,
      })),
    }),
  })
  .then(r => r.json())
  .then(data => {
    if (data.text) {
      navigator.clipboard.writeText(data.text).then(() => {
        alert(`✅ 已复制对话「${data.title}」(${data.message_count} 条消息)到剪贴板`);
      }).catch(() => {
        alert(`📋 ${data.text}`);
      });
    }
  })
  .catch(() => {
    alert('分享失败');
  });
}

// ============================
// Tree modal
// ============================

// ============================
// Tree modal - 分支图
// ============================

function buildConvTree(convId) {
  const conv = state.conversations[convId];
  if (!conv) return null;

  const children = Object.values(state.conversations)
    .filter(c => c.parentId === convId)
    .sort((a, b) => b.createdAt - a.createdAt);

  return {
    id: conv.id,
    title: conv.title || '新对话',
    msgCount: conv.messages.filter(m => !m._isContext).length,
    isCurrent: conv.id === state.activeConvId,
    children: children.map(c => buildConvTree(c.id)).filter(Boolean),
  };
}

function renderConvTreeBranch(node) {
  if (!node) return '';

  const isCurrentClass = node.isCurrent ? ' tree-node-current' : '';
  const hasChildren = node.children && node.children.length > 0;

  let html = '<li>';
  html += `<div class="tree-node${isCurrentClass}" data-conv-id="${node.id}">`;
  html += `<div class="tree-node-title">${escapeHtml(node.title)}</div>`;
  html += `<div class="tree-node-meta">${node.msgCount} 条消息</div>`;
  html += `</div>`;

  if (hasChildren) {
    html += '<ul>';
    node.children.forEach(child => {
      html += renderConvTreeBranch(child);
    });
    html += '</ul>';
  }

  html += '</li>';
  return html;
}

function showConversationTree(rootConvId) {
  const rootConv = state.conversations[rootConvId];
  if (!rootConv) return;
  hideConvMenu();

  const tree = buildConvTree(rootConvId);
  if (!tree) return;

  function countDescendants(node) {
    let count = node.children.length;
    node.children.forEach(c => { count += countDescendants(c); });
    return count;
  }

  const totalDescendants = countDescendants(tree);

  if (totalDescendants === 0) {
    els.treeModalBody.innerHTML = '<div class="tree-empty">该对话没有追问子对话</div>';
  } else {
    const treeHtml = renderConvTreeBranch(tree);
    els.treeModalBody.innerHTML = `
      <div style="margin-bottom:12px;font-size:12px;color:var(--color-text-muted);text-align:center">
        根对话: ${escapeHtml(tree.title)} · 共 ${totalDescendants} 个子对话
      </div>
      <ul class="tree-diagram">${treeHtml}</ul>
    `;
  }

  // 绑定点击跳转
  els.treeModalBody.querySelectorAll('.tree-node').forEach(node => {
    node.addEventListener('click', () => {
      const convId = node.dataset.convId;
      if (convId && state.conversations[convId]) {
        switchConversation(convId);
        closeTreeModal();
      }
    });
  });

  els.treeModal.classList.remove('modal-hidden');
  els.treeModal.classList.add('modal-visible');
}

function closeTreeModal() {
  els.treeModal.classList.remove('modal-visible');
  els.treeModal.classList.add('modal-hidden');
}

// ============================
// Menu event binding
// ============================

els.convMenu.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', () => {
    const action = item.dataset.action;
    if (!menuConvId) return;
    switch (action) {
      case 'rename': renameConversation(menuConvId); break;
      case 'pin': pinConversation(menuConvId); break;
      case 'share': shareConversation(menuConvId); break;
      case 'export-tree': showConversationTree(menuConvId); break;
      case 'delete': deleteConversation(menuConvId); break;
    }
  });
});

// Click outside menu to close
document.addEventListener('click', (e) => {
  if (!els.convMenu.classList.contains('menu-visible')) return;
  if (!els.convMenu.contains(e.target) && !e.target.closest('.conv-more')) {
    hideConvMenu();
  }
});

// ============================
// Message sending
// ============================

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text || state.isStreaming) return;

  const conv = getActiveConversation();
  if (!conv) return;

  state.isStreaming = true;
  els.input.value = '';
  updateSendButton();
  setInputEnabled(false);

  // Auto-title
  if (conv.messages.length === 0) {
    conv.title = text.slice(0, 30) + (text.length > 30 ? '...' : '');
    updateChatTitle();
    renderSidebar();
  }

  // 收集已上传的图片
  const previewDiv = document.getElementById('input-image-preview');
  let images = [];
  let hasImages = false;
  if (previewDiv && !previewDiv.classList.contains('hidden')) {
    const imgs = previewDiv.querySelectorAll('.input-image-thumb');
    imgs.forEach(img => {
      if (img.dataset.dataUrl) images.push(img.dataset.dataUrl);
    });
    hasImages = images.length > 0;
    // 清空预览
    previewDiv.innerHTML = '';
    previewDiv.classList.add('hidden');
  }

  const userMsg = { id: generateId(), role: 'user', content: text };
  if (hasImages) userMsg.images = images;
  conv.messages.push(userMsg);
  saveState();
  renderMessages();

  // Build API messages
  let apiMessages = [];

  // 如果是子对话，先添加父对话的消息作为上下文（但不包括_isContext标记的消息）
  if (conv.parentId) {
    const parentConv = state.conversations[conv.parentId];
    if (parentConv) {
      const parentMsgs = parentConv.messages
        .filter(m => !m._isContext && m.content.trim())
        .map(m => ({ role: m.role, content: m.content }));
      apiMessages.push(...parentMsgs);
    }
  }

  // 添加当前对话的消息 - 带图片的消息转为[图片]+文字
  const currentMsgs = conv.messages
    .filter(m => !m._isStreaming)
    .map(m => {
      let content = m.content || '';
      // 如果有图片，在文字末尾加图片标记（DeepSeek API 暂不支持image_url）
      if (m.images && m.images.length > 0) {
        content = content.trim();
        if (content) content += '\n\n[用户上传了 ' + m.images.length + ' 张图片]';
        else content = '[用户上传了 ' + m.images.length + ' 张图片]';
      }
      return { role: m.role, content };
    });
  apiMessages.push(...currentMsgs);

  // 构建请求体
  const requestBody = {
    messages: apiMessages,
    model: state.deepThink ? 'deepseek-reasoner' : 'deepseek-chat',
  };

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentEl = getOrCreateStreamingBubble();
    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (data.error) {
              fullText += `\n\n[错误] ${data.error}`;
              if (contentEl) updateStreamingBubble(contentEl, fullText);
              state.isStreaming = false;
              setInputEnabled(true);
              updateSendButton();
              return;
            }
            if (data.done) break;
            // 深度思索的思考过程（reasoning_content）
            if (data.reasoning) {
              // 显示思考过程标记
              if (!fullText.includes('💭 思考中')) {
                fullText += '\n> 💭 思考中...\n\n';
              }
              if (contentEl) updateStreamingBubble(contentEl, fullText);
            }
            if (data.chunk) {
              // 如果之前有思考过程，先移除标记
              if (fullText.includes('💭 思考中')) {
                fullText = fullText.replace('\n> 💭 思考中...\n\n', '\n');
              }
              fullText += data.chunk;
              if (contentEl) updateStreamingBubble(contentEl, fullText);
            }
          } catch (e) { /* skip */ }
        }
      }
    }

    const lastMsg = conv.messages[conv.messages.length - 1];
    if (lastMsg && lastMsg._isStreaming) lastMsg.content = fullText;
    finalizeStreamingBubble();

    // 子对话自动生成更聪明的标题
    if (conv.parentId && conv.messages.filter(m => !m._isContext).length <= 2) {
      const contextMsg = conv.messages.find(m => m._isContext);
      const firstUserMsg = conv.messages.find(m => m.role === 'user');
      if (contextMsg && firstUserMsg) {
        const match = contextMsg.content.match(/「(.+?)」/);
        const quote = match ? match[1] : '';
        const question = firstUserMsg.content.slice(0, 25);
        if (quote && question) {
          // 生成有意义的标题: 「关键词」+ 问题
          const keywords = quote.length > 10 ? quote.slice(0, 10) + '…' : quote;
          conv.title = `关于「${keywords}」— ${question}`;
          if (conv.title.length > 40) {
            conv.title = conv.title.slice(0, 40) + '…';
          }
          updateChatTitle();
          renderSidebar();
          saveState();
        }
      }
    }

  } catch (err) {
    const contentEl = els.messageList.querySelector('.message.assistant:last-child .message-content');
    if (contentEl) {
      contentEl.textContent = `[发送失败] ${err.message}`;
      contentEl.classList.remove('streaming');
    }
    const conv2 = getActiveConversation();
    if (conv2 && conv2.messages.length > 0) {
      const last = conv2.messages[conv2.messages.length - 1];
      if (last && last._isStreaming) conv2.messages.pop();
    }
  } finally {
    state.isStreaming = false;
    setInputEnabled(true);
    updateSendButton();
    scrollToBottom();
  }
}

// ============================
// Utils
// ============================

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ============================
// Event binding
// ============================

els.btnNewConv.addEventListener('click', newConversation);
els.btnToggleSidebar.addEventListener('click', () => els.sidebar.classList.toggle('collapsed'));

els.btnSend.addEventListener('click', sendMessage);

els.input.addEventListener('input', () => {
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(els.input.scrollHeight, 180) + 'px';
  updateSendButton();
});

els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Deep think toggle
els.btnDeepThink.addEventListener('click', () => {
  state.deepThink = !state.deepThink;
  els.btnDeepThink.classList.toggle('active', state.deepThink);
  saveState();
});

// Web search toggle
els.btnWebSearch.addEventListener('click', () => {
  state.webSearch = !state.webSearch;
  els.btnWebSearch.classList.toggle('active', state.webSearch);
  saveState();
});

// 工具栏按钮
document.querySelectorAll('.toolbar-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const conv = getActiveConversation();
    if (!conv) return;
    const titleAttr = btn.getAttribute('title');
    if (titleAttr === '分享') {
      shareConversation(conv.id);
    } else if (titleAttr === '搜索') {
      // 聚焦输入框
      els.input.focus();
    } else if (titleAttr === '历史') {
      // 在侧边栏定位到最早的对话
      const sorted = Object.values(state.conversations).sort((a, b) => a.createdAt - b.createdAt);
      if (sorted.length > 0) switchConversation(sorted[0].id);
    }
  });
});

// Attach button - 上传图片
els.btnAttach.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    // 预览图片
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewDiv = document.getElementById('input-image-preview');
      if (previewDiv) {
        previewDiv.innerHTML = '';
        previewDiv.classList.remove('hidden');
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'input-image-thumb';
        img.dataset.dataUrl = e.target.result; // 存 base64
        const closeBtn = document.createElement('button');
        closeBtn.className = 'input-image-remove';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => {
          previewDiv.innerHTML = '';
          previewDiv.classList.add('hidden');
        };
        const wrap = document.createElement('div');
        wrap.className = 'input-image-wrap';
        wrap.appendChild(img);
        wrap.appendChild(closeBtn);
        previewDiv.appendChild(wrap);
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
});

// Tree modal events
els.treeModalClose.addEventListener('click', closeTreeModal);
els.treeModalBackdrop.addEventListener('click', closeTreeModal);

// ============================
// Selection Toolbar
// ============================

let selSourceMsgId = null;
let selSourceConvId = null;
let selText = '';

function showSelectionToolbar(range, msgId, convId, text) {
  selSourceMsgId = msgId;
  selSourceConvId = convId;
  selText = text;

  const rect = range.getBoundingClientRect();
  const toolbar = els.selToolbar;
  // 使用固定宽度避免 offsetWidth 为 0
  const tw = 230;

  let left = rect.left + (rect.width - tw) / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  let top = rect.top - 52;
  if (top < 4) top = rect.bottom + 8;

  toolbar.style.left = left + 'px';
  toolbar.style.top = top + 'px';
  toolbar.classList.remove('sel-hidden');
  toolbar.classList.add('sel-visible');
}

function hideSelectionToolbar() {
  els.selToolbar.classList.remove('sel-visible');
  els.selToolbar.classList.add('sel-hidden');
  selSourceMsgId = null;
  selSourceConvId = null;
  selText = '';
}

// Detect text selection - 完全重写，兼容所有浏览器
document.addEventListener('mouseup', (e) => {
  // 如果点在工具条/菜单/输入区上，不处理
  const target = e.target;
  if (target.closest('#selection-toolbar') ||
      target.closest('#conv-menu') ||
      target.closest('.conv-more') ||
      target.closest('#input-area') ||
      target.closest('.context-card')) {
    return;
  }

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) {
    // 延迟隐藏，让工具条点击有时间触发
    setTimeout(() => {
      if (els.selToolbar && !els.selToolbar.matches(':hover')) {
        hideSelectionToolbar();
      }
    }, 200);
    return;
  }

  // 找到选中文本所在的 DOM 元素
  let msgContentEl = null;
  try {
    // anchorNode 可能是文本节点，从它往上找到最近的 .message-content
    let node = sel.anchorNode;
    if (!node) { hideSelectionToolbar(); return; }

    // 从文本节点向上找包含它的元素
    let el = node.nodeType === 3 ? node.parentNode : node;

    // 循环向上找 .message-content
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('message-content')) {
        msgContentEl = el;
        break;
      }
      el = el.parentNode || el.parentElement;
    }
  } catch (err) {
    hideSelectionToolbar();
    return;
  }

  if (!msgContentEl) { hideSelectionToolbar(); return; }

  // 从 .message-content 找到 .message 容器
  const msgDiv = msgContentEl.closest ? msgContentEl.closest('.message') : msgContentEl.parentNode.closest ? msgContentEl.parentNode.closest('.message') : null;
  if (!msgDiv || !msgDiv.dataset || !msgDiv.dataset.msgId) { hideSelectionToolbar(); return; }

  const conv = getActiveConversation();
  if (!conv) { hideSelectionToolbar(); return; }

  const text = sel.toString().trim();
  if (text.length < 2) { hideSelectionToolbar(); return; }

  try {
    showSelectionToolbar(sel.getRangeAt(0), msgDiv.dataset.msgId, conv.id, text);
  } catch (err) {
    hideSelectionToolbar();
  }
});

// Selection toolbar button actions
els.selToolbar.querySelectorAll('.sel-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const text = selText;

    switch (action) {
      case 'copy':
        navigator.clipboard.writeText(text).catch(() => {});
        hideSelectionToolbar();
        break;

      case 'followup':
        // 创建子对话，parentId 指向当前对话
        const title = '追问: ' + text.slice(0, 20) + (text.length > 20 ? '...' : '');
        const conv = createConversation(title, selSourceConvId);
        // 添加选中文本作为系统上下文
        conv.messages.push({
          id: generateId(),
          role: 'system',
          content: `以下是对之前对话中某段内容的追问。\n引用原文：「${text}」\n请基于这段内容回答用户的问题。`,
          _isContext: true,
        });
        state.conversations[conv.id] = conv;
        state.activeConvId = conv.id;
        saveState();
        hideSelectionToolbar();
        renderSidebar();
        renderMessages();
        updateChatTitle();
        setInputEnabled(true);
        els.input.value = '';
        updateSendButton();
        els.input.placeholder = '请针对选中的内容提问...';
        els.input.focus();
        break;

      case 'explain':
        // Quick explain: auto-send a "解释一下这段内容" request
        const conv2 = getActiveConversation();
        if (!conv2) break;
        const explainMsg = {
          id: generateId(),
          role: 'user',
          content: `请解释这段内容：「${text}」`,
        };
        conv2.messages.push(explainMsg);
        saveState();
        hideSelectionToolbar();
        renderMessages();
        // Auto-trigger send
        els.input.value = explainMsg.content;
        sendMessage();
        break;
    }
  });
});

// ============================
// Init
// ============================

function init() {
  loadState();

  // Restore toggle states
  if (state.deepThink) els.btnDeepThink.classList.add('active');
  if (state.webSearch) els.btnWebSearch.classList.add('active');

  const convs = Object.keys(state.conversations);

  if (convs.length === 0) {
    renderSidebar();
    els.welcomeScreen.style.display = 'flex';
    els.chatTitle.textContent = 'TreeMind';
    updateSendButton();
  } else {
    if (!state.activeConvId || !state.conversations[state.activeConvId]) {
      state.activeConvId = convs[0];
    }
    renderSidebar();
    renderMessages();
    updateChatTitle();
    setInputEnabled(true);
    updateSendButton();
  }
}

document.addEventListener('DOMContentLoaded', init);
