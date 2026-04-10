/**
 * Markdown → HTML 转换
 * Demo 使用简约正则实现，无第三方依赖
 * 生产请使用 marked + DOMPurify
 */

const MARKDOWN_RULES: Array<[RegExp, string | ((match: string, group: string) => string)]> = [
  // 代码块 ```...```
  [/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="code-block">${escapeHtml(code.trim())}</code></pre>`],

  // 行内代码 `code`
  [/`([^`]+)`/g, (_, code) => `<code class="inline-code">${escapeHtml(code)}</code>`],

  // 标题 ## 或 ###
  [/^### (.+)$/gm, '<h3>$1</h3>'],
  [/^## (.+)$/gm, '<h2>$1</h2>'],
  [/^# (.+)$/gm, '<h1>$1</h1>'],

  // 加粗 **text**
  [/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'],

  // 斜体 *text*
  [/\*([^*]+)\*/g, '<em>$1</em>'],

  // 删除线 ~~text~~
  [/~~([^~]+)~~/g, '<del>$1</del>'],

  // 无序列表 - item
  [/^- (.+)$/gm, '<li>$1</li>'],

  // 有序列表 1. item
  [/^\d+\. (.+)$/gm, '<li>$1</li>'],

  // 引用 > text
  [/^> (.+)$/gm, '<blockquote>$1</blockquote>'],

  // 水平线 ---
  [/^---$/gm, '<hr/>'],

  // 链接 [text](url)
  [/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>'],

  // 换行（两个空格 + 换行）
  [/  \n/g, '<br/>\n'],
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  let html = markdown;

  for (const [pattern, replacement] of MARKDOWN_RULES) {
    if (typeof replacement === 'function') {
      html = html.replace(pattern, replacement as any);
    } else {
      html = html.replace(pattern, replacement);
    }
  }

  // 包裹连续 <li> 为 <ul>
  html = html.replace(/(<li>.*?<\/li>\n?)+/g, match => `<ul>${match}</ul>`);

  // 包裹连续 <blockquote> 为 <blockquote>
  html = html.replace(/(<blockquote>.*?<\/blockquote>\n?)+/g, match => `<blockquote>${match}</blockquote>`);

  // 段落：未被包裹的行转 <p>
  const lines = html.split('\n');
  const processed = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (/^<(h[1-6]|ul|ol|li|blockquote|pre|hr|div)/.test(trimmed)) return trimmed;
    return `<p>${trimmed}</p>`;
  });

  return processed.join('\n');
}
