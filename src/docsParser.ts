import { IdeaItem, IdeaType } from './types';

export const GOOGLE_DOC_MARKDOWN_TEMPLATE = `### ★ I-001 Title of Idea
- Status: pot
- One-liner: A crisp single sentence describing the concept.
- Category: Content
- Problem: Why this matters and what pain point it eliminates.
- Further Read: https://example.com
`.trim();

export function extractDocIdFromUrl(urlOrId: string): string {
  const trimmed = (urlOrId || '').trim();
  if (!trimmed) return '';
  const urlMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  const rawMatch = trimmed.match(/^[a-zA-Z0-9_-]{10,}$/);
  if (rawMatch) return trimmed;
  return trimmed;
}

/**
 * Parses markdown content exported from Google Docs into IdeaItem objects.
 * Uses IdeaSwipe's `### ★ I-xxx Title` schema with bulleted metadata.
 */
export function parseIdeasFromDoc(content: string): IdeaItem[] {
  if (!content || typeof content !== 'string') return [];

  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/(?=^\s*###\s*)/m);
  const ideas: IdeaItem[] = [];
  let fallbackCounter = 1;
  const now = Date.now();

  for (const block of blocks) {
    const lines = block.split('\n');
    const headerIndex = lines.findIndex((line) => /^\s*###/.test(line));
    if (headerIndex === -1) continue;

    const headerClean = lines[headerIndex]
      .replace(/^\s*###\s*/, '')
      .replace(/^[★*]\s*/, '')
      .trim();

    if (!headerClean) continue;

    let code = '';
    let rawTitle = '';

    const codeMatch = headerClean.match(/^([A-Za-z0-9]+-\d+)(?:\s*:\s*|\s+)(.*)$/);
    if (codeMatch) {
      code = codeMatch[1].trim();
      rawTitle = codeMatch[2].trim();
    } else {
      code = `I-${String(fallbackCounter).padStart(3, '0')}`;
      rawTitle = headerClean;
    }
    fallbackCounter++;

    let rawStatus = 'pot';
    let oneLiner = '';
    let problem = '';
    let furtherRead = '';
    let category = 'Content';
    let currentKey: string | null = null;

    for (const line of lines.slice(headerIndex + 1)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const bulletMatch = trimmed.match(/^[-*•]\s*([^:]+):\s*(.*)$/);
      if (bulletMatch) {
        const key = bulletMatch[1].trim().toLowerCase();
        const val = bulletMatch[2].trim();
        currentKey = key;

        if (key === 'status') {
          rawStatus = val.toLowerCase();
        } else if (
          ['idea', 'one-liner', 'one liner', 'summary', 'description'].includes(key)
        ) {
          oneLiner = val;
        } else if (['why it matters', 'problem', 'problem statement', 'full description'].includes(key)) {
          problem = val;
        } else if (['further read', 'further read/listen', 'link', 'url', 'reference'].includes(key)) {
          furtherRead = val;
        } else if (key === 'category' || key === 'type') {
          category = val || 'Content';
        }
      } else if (currentKey) {
        if (['idea', 'one-liner', 'one liner', 'summary', 'description'].includes(currentKey)) {
          oneLiner = oneLiner ? `${oneLiner} ${trimmed}` : trimmed;
        } else if (['why it matters', 'problem', 'problem statement', 'full description'].includes(currentKey)) {
          problem = problem ? `${problem} ${trimmed}` : trimmed;
        }
      }
    }

    const inPot = !['dropped', 'archived', 'archive', 'no', 'false', 'out'].includes(rawStatus);
    const ideaType: IdeaType = category.toLowerCase().includes('product') ? 'Product' : 'Content';

    ideas.push({
      id: `doc_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      no: code,
      type: ideaType,
      format: category,
      title: rawTitle || oneLiner || code,
      hook: [oneLiner, problem].filter(Boolean).join(' — ') || rawTitle || code,
      furtherRead: furtherRead || undefined,
      inPot,
      cantWaitCount: 0,
      passCount: 0,
      status: 'queued',
      createdAt: now - fallbackCounter * 1000,
    });
  }

  return ideas;
}

export async function fetchDocIdeas(
  urlOrId: string,
  directContent?: string
): Promise<{ docId: string; ideas: IdeaItem[] }> {
  const docId = extractDocIdFromUrl(urlOrId) || 'manual-doc';
  let markdownText = directContent?.trim() || '';

  if (!markdownText) {
    if (!urlOrId.trim()) {
      throw new Error('Please provide a Google Doc URL or paste markdown directly.');
    }
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Google Doc (${response.status}). Ensure sharing is set to "Anyone with the link can view" or use manual paste.`
      );
    }
    markdownText = await response.text();
  }

  const ideas = parseIdeasFromDoc(markdownText);
  if (ideas.length === 0) {
    throw new Error('No ideas found. Make sure headings start with "### ★ I-001 Title".');
  }

  return { docId, ideas };
}
