/**
 * HITO English - Flashcard Module
 * SM-2 spaced repetition algorithm and card management.
 */
const Flashcards = {
  /**
   * Create empty flashcard data structure.
   */
  createEmpty() {
    return { version: 1, lastUpdated: new Date().toISOString(), cards: [] };
  },

  /**
   * Add a new card from an annotation.
   * Returns true if added, false if duplicate.
   */
  addCard(data, key, type, annotation, articleId) {
    // Check duplicate
    if (this.hasCard(data, key)) return false;

    const now = new Date().toISOString();
    const id = `${type === 'phrase' ? 'p' : 'w'}_${key.replace(/\s+/g, '-')}_${Date.now()}`;

    let category = 'advanced-vocab';
    if (type === 'phrase') {
      category = annotation.type === 'idiom' ? 'idiom' : 'phrasal-verb';
    } else if (annotation.level === 'basic-gap') {
      category = 'basic-gap';
    }

    const card = {
      id,
      type: type === 'phrase' ? 'phrase' : 'word',
      front: key,
      back: {
        meaning: annotation.meaning || '',
        meaning_ja: annotation.meaning_ja || '',
        pos: annotation.pos || '',
        example: annotation.example || '',
      },
      sourceArticleId: articleId || '',
      category,
      createdAt: now,
      reviews: [],
      nextReview: now.split('T')[0] + 'T00:00:00Z',
      interval: 0,
      easeFactor: 2.5,
    };

    data.cards.push(card);
    data.lastUpdated = now;
    return true;
  },

  /**
   * Check if a card with this front text already exists.
   */
  hasCard(data, front) {
    const key = front.toLowerCase();
    return data.cards.some(c => c.front.toLowerCase() === key);
  },

  /**
   * Get cards due for review (nextReview <= today).
   */
  getDueCards(data, dateStr) {
    if (!dateStr) {
      const now = new Date();
      dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    const threshold = dateStr + 'T23:59:59Z';
    return data.cards.filter(c => c.nextReview <= threshold);
  },

  /**
   * SM-2 algorithm: calculate next review after rating.
   * quality: 0 (again), 3 (hard), 4 (good), 5 (easy)
   */
  recordReview(card, quality) {
    const now = new Date();
    const review = {
      date: now.toISOString(),
      result: ['again', '', '', 'hard', 'good', 'easy'][quality] || 'good',
    };

    // Keep last 10 reviews
    card.reviews.push(review);
    if (card.reviews.length > 10) card.reviews.shift();

    if (quality < 3) {
      // Failed: reset
      card.interval = 0;
      card.nextReview = this._addDays(now, 0); // review again today
    } else {
      // SM-2 formula
      let ef = card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (ef < 1.3) ef = 1.3;
      card.easeFactor = Math.round(ef * 100) / 100;

      let interval;
      if (card.interval === 0) {
        interval = 1;
      } else if (card.interval === 1) {
        interval = 6;
      } else {
        interval = Math.round(card.interval * card.easeFactor);
      }
      card.interval = interval;
      card.nextReview = this._addDays(now, interval);
    }

    return card;
  },

  /**
   * Count cards by category.
   */
  countByCategory(data) {
    const counts = { idiom: 0, 'phrasal-verb': 0, 'advanced-vocab': 0, 'basic-gap': 0 };
    for (const card of data.cards) {
      if (counts[card.category] !== undefined) {
        counts[card.category]++;
      }
    }
    return counts;
  },

  /**
   * Get most recently added cards.
   */
  getRecentCards(data, n = 10) {
    return [...data.cards]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, n);
  },

  // ---- Helpers ----

  _addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0] + 'T00:00:00Z';
  },
};
