/**
 * HITO English - Article Module
 * Handles annotation matching and rendering.
 */
const Articles = {
  /**
   * Render article body with annotated spans.
   * Phrases are matched first (longest match), then individual words.
   */
  renderAnnotatedBody(article) {
    if (!article || !article.body) return '';
    const { words = {}, phrases = {} } = article.annotations || {};

    return article.body.map(block => {
      if (block.type === 'paragraph') {
        const html = this.annotateText(block.text, words, phrases);
        return `<p>${html}</p>`;
      }
      if (block.type === 'heading') {
        return `<h3>${this.escHtml(block.text)}</h3>`;
      }
      return `<p>${this.escHtml(block.text)}</p>`;
    }).join('');
  },

  /**
   * Annotate a text string with clickable spans.
   */
  annotateText(text, words, phrases) {
    // Build a list of all matchable terms
    const phraseKeys = Object.keys(phrases).sort((a, b) => b.length - a.length);
    const wordKeys = Object.keys(words);

    // Track which character positions are already annotated
    const chars = text.split('');
    const tagged = new Array(chars.length).fill(false);
    const result = new Array(chars.length).fill(null);

    // First pass: match phrases (longest first)
    const textLower = text.toLowerCase();
    for (const phrase of phraseKeys) {
      const phraseLower = phrase.toLowerCase();
      let idx = 0;
      while ((idx = textLower.indexOf(phraseLower, idx)) !== -1) {
        // Check no overlap
        let overlap = false;
        for (let i = idx; i < idx + phrase.length; i++) {
          if (tagged[i]) { overlap = true; break; }
        }
        if (!overlap) {
          const original = text.substring(idx, idx + phrase.length);
          const key = this.toKey(phrase);
          result[idx] = `<span class="annotated annotated-phrase" data-type="phrase" data-key="${this.escAttr(phrase)}">${this.escHtml(original)}</span>`;
          for (let i = idx; i < idx + phrase.length; i++) {
            tagged[i] = true;
            if (i > idx) result[i] = ''; // clear subsequent chars
          }
        }
        idx += phrase.length;
      }
    }

    // Second pass: match individual words
    const wordBoundary = /\b/;
    for (const word of wordKeys) {
      const wordLower = word.toLowerCase();
      const regex = new RegExp(`\\b${this.escRegex(wordLower)}\\b`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        const idx = match.index;
        let overlap = false;
        for (let i = idx; i < idx + match[0].length; i++) {
          if (tagged[i]) { overlap = true; break; }
        }
        if (!overlap) {
          const original = text.substring(idx, idx + match[0].length);
          result[idx] = `<span class="annotated" data-type="word" data-key="${this.escAttr(word)}">${this.escHtml(original)}</span>`;
          for (let i = idx; i < idx + match[0].length; i++) {
            tagged[i] = true;
            if (i > idx) result[i] = '';
          }
        }
      }
    }

    // Build final HTML
    let html = '';
    for (let i = 0; i < chars.length; i++) {
      if (result[i] !== null) {
        html += result[i];
      } else if (!tagged[i]) {
        html += this.escHtml(chars[i]);
      }
    }
    return html;
  },

  /**
   * Build tooltip HTML for an annotation.
   */
  buildTooltipHtml(key, type, annotations) {
    const source = type === 'phrase'
      ? (annotations.phrases || {})[key]
      : (annotations.words || {})[key];
    if (!source) return '';

    let html = `<div class="tooltip-word">${this.escHtml(key)}</div>`;
    if (source.pos) {
      html += `<div class="tooltip-pos">${this.escHtml(source.pos)}</div>`;
    }
    if (source.type) {
      html += `<div class="tooltip-pos">${this.escHtml(source.type)}</div>`;
    }
    html += `<div class="tooltip-meaning">${this.escHtml(source.meaning || '')}</div>`;
    if (source.meaning_ja) {
      html += `<div class="tooltip-meaning-ja">${this.escHtml(source.meaning_ja)}</div>`;
    }
    if (source.example) {
      html += `<div class="tooltip-example">"${this.escHtml(source.example)}"</div>`;
    }
    return html;
  },

  /**
   * Get annotation data for a key.
   */
  getAnnotation(key, type, annotations) {
    if (type === 'phrase') return (annotations.phrases || {})[key] || null;
    return (annotations.words || {})[key] || null;
  },

  /**
   * Genre display helpers.
   */
  genreLabel(genre) {
    const labels = { tech: 'Tech', business: 'Business', finance: 'Finance', health: 'Health' };
    return labels[genre] || genre;
  },

  /**
   * Parse article ID from filename.
   * "2026-04-16_tech_ai-regulation.json" -> { date, genre, slug }
   */
  parseFilename(filename) {
    const name = filename.replace('.json', '');
    const parts = name.split('_');
    if (parts.length < 3) return null;
    return {
      date: parts[0],
      genre: parts[1],
      slug: parts.slice(2).join('_'),
    };
  },

  // ---- Helpers ----

  toKey(str) {
    return str.toLowerCase().replace(/\s+/g, '-');
  },

  escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  escAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  escRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },
};
