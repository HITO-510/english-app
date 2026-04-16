/**
 * HITO English - Main Application
 */
(function () {
  'use strict';

  // ---- State ----
  let github = null;
  let todayArticles = [];          // articles for today
  let articleCache = new Map();    // articleId -> article JSON
  let flashcardData = null;        // flashcards.json content
  let readingLog = null;           // reading-log.json content
  let currentTab = 'today';
  let currentArticle = null;       // article being read
  let libraryGenre = 'all';
  let libraryArticles = [];        // all loaded library articles
  let reviewCards = [];             // cards in current review session
  let reviewIndex = 0;
  let reviewFlipped = false;

  // ---- DOM refs ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    setupScreen: $('#setup-screen'),
    app: $('#app'),
    setupForm: $('#setup-form'),
    loading: $('#loading'),
    loadingText: $('#loading-text'),
    toast: $('#toast'),
    // Today
    todayStreak: $('#today-streak'),
    todayArticles: $('#today-articles'),
    todayReview: $('#today-review'),
    // Library
    libraryFilters: $('#library-filters'),
    libraryArticles: $('#library-articles'),
    // Stats
    statsCards: $('#stats-cards'),
    statsHeatmap: $('#stats-heatmap'),
    statsVocab: $('#stats-vocab'),
    statsRecentWords: $('#stats-recent-words'),
    statsReviewBtn: $('#stats-review-btn'),
    // Reader
    readerModal: $('#reader-modal'),
    readerMeta: $('#reader-meta'),
    readerTitle: $('#reader-title'),
    readerInfo: $('#reader-info'),
    readerBody: $('#reader-body'),
    readerPages: $('#reader-pages'),
    readerTitleJa: $('#reader-title-ja'),
    readerBodyJa: $('#reader-body-ja'),
    ttsBtn: $('#btn-tts'),
    // Tooltip
    annotationTooltip: $('#annotation-tooltip'),
    tooltipContent: $('#tooltip-content'),
    tooltipAddBtn: $('#tooltip-add-btn'),
    // Review
    reviewModal: $('#review-modal'),
    reviewProgress: $('#review-progress'),
    cardFrontText: $('#card-front-text'),
    cardBackMeaning: $('#card-back-meaning'),
    cardBackMeaningJa: $('#card-back-meaning-ja'),
    cardBackExample: $('#card-back-example'),
    reviewButtons: $('#review-buttons'),
    reviewTapHint: $('#review-tap-hint'),
    // Settings
    settingsModal: $('#settings-modal'),
  };

  // ---- Initialization ----

  async function init() {
    const config = loadConfig();
    if (config) {
      github = new GitHubClient(config.token, config.repo);
      showApp();
      await loadAllData();
    } else {
      showSetup();
    }
    bindEvents();
  }

  // ---- Config (localStorage) ----

  function loadConfig() {
    const raw = localStorage.getItem('hito-english-config');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function saveConfig(config) {
    localStorage.setItem('hito-english-config', JSON.stringify(config));
  }

  // ---- UI Helpers ----

  function showSetup() {
    dom.setupScreen.style.display = 'flex';
    dom.app.style.display = 'none';
  }

  function showApp() {
    dom.setupScreen.style.display = 'none';
    dom.app.style.display = 'flex';
  }

  function showLoading(text = '読み込み中...') {
    dom.loadingText.textContent = text;
    dom.loading.style.display = 'flex';
  }

  function hideLoading() {
    dom.loading.style.display = 'none';
  }

  function showToast(msg, type = '') {
    dom.toast.textContent = msg;
    dom.toast.className = 'toast' + (type ? ` ${type}` : '');
    dom.toast.style.display = 'block';
    clearTimeout(dom.toast._timer);
    dom.toast._timer = setTimeout(() => {
      dom.toast.style.display = 'none';
    }, 3000);
  }

  function switchTab(name) {
    currentTab = name;
    $$('.view').forEach(v => v.classList.remove('active'));
    $$('.tab-btn').forEach(t => t.classList.remove('active'));
    const viewEl = $(`#view-${name}`);
    if (viewEl) viewEl.classList.add('active');
    const tabEl = $(`.tab-btn[data-tab="${name}"]`);
    if (tabEl) tabEl.classList.add('active');

    if (name === 'stats') renderStats();
    if (name === 'library') renderLibrary();
  }

  // ---- Data Loading ----

  async function loadAllData() {
    showLoading('データを読み込み中...');
    try {
      // Load user data + today's articles in parallel
      const [fc, rl] = await Promise.all([
        github.fetchUserData('flashcards.json').catch(() => null),
        github.fetchUserData('reading-log.json').catch(() => null),
      ]);

      flashcardData = fc || Flashcards.createEmpty();
      readingLog = rl || createEmptyReadingLog();

      await loadTodayArticles();

      renderToday();
      hideLoading();
    } catch (err) {
      hideLoading();
      showToast(`読み込みエラー: ${err.message}`, 'error');
      console.error(err);
    }
  }

  function createEmptyReadingLog() {
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      entries: [],
      stats: {
        totalArticlesRead: 0,
        totalWordsLearned: 0,
        totalPhrasesLearned: 0,
        currentStreak: 0,
        longestStreak: 0,
        streakLastDate: '',
      },
    };
  }

  async function loadTodayArticles() {
    const today = todayStr();
    const yearMonth = today.substring(0, 7);
    try {
      const files = await github.fetchArticleIndex(yearMonth);
      // Filter to today's articles
      const todayFiles = files.filter(f => f.name.startsWith(today));
      todayArticles = [];

      for (const file of todayFiles) {
        const article = await github.fetchJSON(file.path);
        if (article) {
          articleCache.set(article.id, article);
          todayArticles.push(article);
        }
      }
    } catch (err) {
      console.error('Failed to load today articles:', err);
      todayArticles = [];
    }
  }

  // ---- Today View ----

  function renderToday() {
    renderStreak();
    renderTodayArticles();
    renderTodayReview();
  }

  function renderStreak() {
    const streak = calcStreak();
    const today = todayStr();
    const todayRead = readingLog.entries.filter(e => e.date === today).length;

    dom.todayStreak.innerHTML = `
      <div class="streak-number">${streak}</div>
      <div class="streak-label">day streak</div>
      <div class="streak-sub">Today: ${todayRead} of ${todayArticles.length} articles read</div>
    `;
  }

  function renderTodayArticles() {
    if (todayArticles.length === 0) {
      dom.todayArticles.innerHTML = `
        <div class="empty-state">
          <div class="emoji">📰</div>
          <p>今日の記事はまだありません</p>
        </div>`;
      return;
    }

    dom.todayArticles.innerHTML = todayArticles.map(a => articleCardHtml(a)).join('');
  }

  function renderTodayReview() {
    const due = Flashcards.getDueCards(flashcardData, todayStr());
    if (due.length === 0) {
      dom.todayReview.classList.add('hidden');
      return;
    }
    dom.todayReview.classList.remove('hidden');
    dom.todayReview.innerHTML = `
      <div class="review-count">📝 ${due.length} cards to review</div>
      <button class="btn-primary btn-sm" id="btn-start-review">Start Review</button>
    `;
    $('#btn-start-review').addEventListener('click', () => openReview());
  }

  function articleCardHtml(article) {
    const isRead = readingLog.entries.some(e => e.articleId === article.id);
    const genre = article.genre || 'tech';
    const readBadge = isRead ? '✅' : '';

    return `
      <div class="article-card" data-id="${escHtml(article.id)}">
        <div class="article-card-top">
          <span class="genre-badge ${genre}">${Articles.genreLabel(genre)}</span>
          <span class="article-card-read">${readBadge}</span>
        </div>
        <div class="article-card-title">${escHtml(article.title)}</div>
        <div class="article-card-meta">${escHtml(article.source?.name || '')} · ${article.wordCount || '?'} words</div>
      </div>`;
  }

  // ---- Article Reader ----

  function openArticle(articleId) {
    const article = articleCache.get(articleId);
    if (!article) return;
    currentArticle = article;

    dom.readerMeta.textContent = `${Articles.genreLabel(article.genre)} · ${article.source?.name || ''}`;
    dom.readerTitle.textContent = article.title;
    dom.readerInfo.textContent = `${article.wordCount || '?'} words · ${article.level || 'B2-C1'}`;

    // Render annotated body (English)
    dom.readerBody.innerHTML = Articles.renderAnnotatedBody(article);

    // Render Japanese translation
    dom.readerTitleJa.textContent = article.title_ja || article.title;
    if (article.body_ja && article.body_ja.length > 0) {
      dom.readerBodyJa.innerHTML = article.body_ja
        .filter(b => b.type === 'paragraph')
        .map(b => `<p>${escHtml(b.text)}</p>`)
        .join('');
    } else {
      dom.readerBodyJa.innerHTML = '<p class="no-translation">← 左にスワイプすると日本語訳が表示されます（次回以降の記事から対応）</p>';
    }

    // Add completion section if not already read
    const isRead = readingLog.entries.some(e => e.articleId === article.id);
    if (!isRead) {
      dom.readerBody.innerHTML += `
        <div class="reader-complete" id="reader-complete">
          <div class="emoji">🎉</div>
          <p>Article completed!</p>
        </div>`;
    }

    // Reset to English page and stop any playing TTS
    dom.readerPages.scrollLeft = 0;
    stopTTS();

    dom.readerModal.style.display = 'flex';
    closeTooltip();

    // Track reading after a delay (auto-complete)
    if (!isRead) {
      setTimeout(() => trackReading(article.id), 60000); // 60 seconds
    }

    // Also track on scroll to bottom
    const wrap = $('.reader-body-wrap');
    wrap.onscroll = () => {
      if (!isRead && wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 50) {
        trackReading(article.id);
        wrap.onscroll = null;
      }
    };
  }

  function closeArticle() {
    dom.readerModal.style.display = 'none';
    currentArticle = null;
    closeTooltip();
    stopTTS();
  }

  async function trackReading(articleId) {
    if (readingLog.entries.some(e => e.articleId === articleId)) return;

    const entry = {
      articleId,
      date: todayStr(),
      completedAt: new Date().toISOString(),
      wordsHighlighted: 0,
    };

    readingLog.entries.push(entry);
    updateStats();
    readingLog.lastUpdated = new Date().toISOString();

    renderToday();
    showToast('Article completed! 🎉', 'success');

    try {
      await github.saveUserData('reading-log.json', readingLog, `Read: ${articleId}`);
    } catch (err) {
      console.error('Failed to save reading log:', err);
    }
  }

  function updateStats() {
    const stats = readingLog.stats;
    stats.totalArticlesRead = readingLog.entries.length;
    stats.totalWordsLearned = flashcardData.cards.filter(c => c.type === 'word').length;
    stats.totalPhrasesLearned = flashcardData.cards.filter(c => c.type === 'phrase').length;

    // Recalculate streak
    stats.currentStreak = calcStreak();
    if (stats.currentStreak > stats.longestStreak) {
      stats.longestStreak = stats.currentStreak;
    }
    const dates = readingLog.entries.map(e => e.date).sort();
    stats.streakLastDate = dates.length ? dates[dates.length - 1] : '';
  }

  // ---- Text-to-Speech ----

  let ttsPlaying = false;

  function startTTS() {
    if (!currentArticle || !window.speechSynthesis) return;

    // Toggle: if already playing, stop
    if (ttsPlaying) {
      window.speechSynthesis.cancel();
      return; // onend will reset state
    }

    const text = (currentArticle.body || [])
      .filter(b => b.type === 'paragraph')
      .map(b => b.text)
      .join('\n\n');
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.88;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      ttsPlaying = true;
      dom.ttsBtn.textContent = '⏹';
      dom.ttsBtn.classList.add('playing');
    };
    utterance.onend = utterance.onerror = () => {
      ttsPlaying = false;
      dom.ttsBtn.textContent = '🔊';
      dom.ttsBtn.classList.remove('playing');
    };

    window.speechSynthesis.speak(utterance);
  }

  function stopTTS() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    ttsPlaying = false;
    if (dom.ttsBtn) {
      dom.ttsBtn.textContent = '🔊';
      dom.ttsBtn.classList.remove('playing');
    }
  }

  // ---- Annotation Tooltip ----

  let tooltipState = { key: '', type: '' };

  function openTooltip(key, type) {
    if (!currentArticle) return;
    const html = Articles.buildTooltipHtml(key, type, currentArticle.annotations);
    if (!html) return;

    tooltipState = { key, type };
    dom.tooltipContent.innerHTML = html;

    // Update add button state
    const alreadyAdded = Flashcards.hasCard(flashcardData, key);
    dom.tooltipAddBtn.style.display = alreadyAdded ? 'none' : 'inline-block';
    if (alreadyAdded) {
      dom.tooltipContent.innerHTML += '<div class="tooltip-added">✓ Already in cards</div>';
    }

    dom.annotationTooltip.style.display = 'block';
  }

  function closeTooltip() {
    dom.annotationTooltip.style.display = 'none';
    tooltipState = { key: '', type: '' };
    $$('.annotated.active').forEach(el => el.classList.remove('active'));
  }

  async function addToFlashcards() {
    const { key, type } = tooltipState;
    if (!key || !currentArticle) return;

    const annotation = Articles.getAnnotation(key, type, currentArticle.annotations);
    if (!annotation) return;

    const added = Flashcards.addCard(flashcardData, key, type, annotation, currentArticle.id);
    if (!added) {
      showToast('Already in your cards', '');
      return;
    }

    flashcardData.lastUpdated = new Date().toISOString();
    updateStats();
    closeTooltip();
    showToast(`Added "${key}" to cards`, 'success');

    try {
      await github.saveUserData('flashcards.json', flashcardData, `Add card: ${key}`);
    } catch (err) {
      console.error('Failed to save flashcards:', err);
    }
  }

  // ---- Library View ----

  async function renderLibrary() {
    const yearMonth = todayStr().substring(0, 7);
    showLoading('Loading articles...');

    try {
      if (libraryArticles.length === 0) {
        const files = await github.fetchArticleIndex(yearMonth);
        for (const file of files) {
          if (!articleCache.has(file.name.replace('.json', ''))) {
            const article = await github.fetchJSON(file.path);
            if (article) {
              articleCache.set(article.id, article);
            }
          }
        }
        libraryArticles = [...articleCache.values()].sort((a, b) => b.date.localeCompare(a.date));
      }

      const filtered = libraryGenre === 'all'
        ? libraryArticles
        : libraryArticles.filter(a => a.genre === libraryGenre);

      if (filtered.length === 0) {
        dom.libraryArticles.innerHTML = '<div class="empty-state"><div class="emoji">📚</div><p>No articles found</p></div>';
      } else {
        // Group by date
        let html = '';
        let lastDate = '';
        for (const article of filtered) {
          if (article.date !== lastDate) {
            lastDate = article.date;
            html += `<div class="date-header">${formatDisplayDate(article.date)}</div>`;
          }
          html += articleCardHtml(article);
        }
        dom.libraryArticles.innerHTML = html;
      }
      hideLoading();
    } catch (err) {
      hideLoading();
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  // ---- Stats View ----

  function renderStats() {
    renderStatsCards();
    renderStatsHeatmap();
    renderVocabBreakdown();
    renderRecentWords();
    renderStatsReviewBtn();
  }

  function renderStatsCards() {
    const streak = calcStreak();
    const totalWords = flashcardData.cards.filter(c => c.type === 'word').length;
    const totalPhrases = flashcardData.cards.filter(c => c.type === 'phrase').length;

    dom.statsCards.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${streak}</div>
        <div class="stat-label">streak</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalWords}</div>
        <div class="stat-label">words</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalPhrases}</div>
        <div class="stat-label">phrases</div>
      </div>
    `;
  }

  function renderStatsHeatmap() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    const readDates = new Set(readingLog.entries.map(e => e.date));

    let html = '<div class="heatmap-grid">';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${monthKey}-${String(d).padStart(2, '0')}`;
      const has = readDates.has(ds);
      const isToday = ds === todayStr();
      let cls = 'heatmap-cell';
      if (has) cls += ' filled';
      if (isToday) cls += ' today';
      html += `<div class="${cls}">${d}</div>`;
    }
    html += '</div>';

    let count = 0;
    for (const ds of readDates) {
      if (ds.startsWith(monthKey)) count++;
    }
    const todayDate = now.getDate();
    const rate = todayDate > 0 ? Math.round((count / todayDate) * 100) : 0;
    html += `<div class="heatmap-rate">${rate}% of days active</div>`;

    dom.statsHeatmap.innerHTML = html;
  }

  function renderVocabBreakdown() {
    const counts = Flashcards.countByCategory(flashcardData);
    const max = Math.max(...Object.values(counts), 1);
    const labels = {
      idiom: 'Idioms',
      'phrasal-verb': 'Phrasal Verbs',
      'advanced-vocab': 'Advanced',
      'basic-gap': 'Basic Gaps',
    };

    dom.statsVocab.innerHTML = Object.entries(labels).map(([key, label]) => {
      const count = counts[key] || 0;
      const pct = Math.round((count / max) * 100);
      return `<div class="vocab-row">
        <span class="vocab-label">${label}</span>
        <div class="vocab-bar-track"><div class="vocab-bar-fill ${key}" style="width:${pct}%"></div></div>
        <span class="vocab-count">${count}</span>
      </div>`;
    }).join('');
  }

  function renderRecentWords() {
    const recent = Flashcards.getRecentCards(flashcardData, 12);
    if (recent.length === 0) {
      dom.statsRecentWords.innerHTML = '<span class="word-chip" style="color:var(--text-dark)">No words yet</span>';
      return;
    }
    dom.statsRecentWords.innerHTML = recent.map(c =>
      `<span class="word-chip">${escHtml(c.front)}</span>`
    ).join('');
  }

  function renderStatsReviewBtn() {
    const due = Flashcards.getDueCards(flashcardData, todayStr());
    if (due.length === 0) {
      dom.statsReviewBtn.innerHTML = '';
      return;
    }
    dom.statsReviewBtn.innerHTML = `
      <button class="btn-primary" id="btn-stats-review">Review ${due.length} Cards</button>
    `;
    $('#btn-stats-review').addEventListener('click', () => openReview());
  }

  // ---- Flashcard Review ----

  function openReview() {
    reviewCards = Flashcards.getDueCards(flashcardData, todayStr());
    if (reviewCards.length === 0) {
      showToast('No cards to review!', '');
      return;
    }
    reviewIndex = 0;
    reviewFlipped = false;
    dom.reviewModal.style.display = 'flex';
    renderReviewCard();
  }

  function closeReview() {
    dom.reviewModal.style.display = 'none';
    reviewCards = [];
    reviewIndex = 0;
    renderToday();
  }

  function renderReviewCard() {
    if (reviewIndex >= reviewCards.length) {
      // Done
      closeReview();
      showToast(`Review complete! ${reviewCards.length} cards reviewed`, 'success');
      return;
    }

    const card = reviewCards[reviewIndex];
    dom.reviewProgress.textContent = `${reviewIndex + 1} / ${reviewCards.length}`;
    dom.cardFrontText.textContent = card.front;
    dom.cardBackMeaning.textContent = card.back.meaning || '';
    dom.cardBackMeaningJa.textContent = card.back.meaning_ja || '';
    dom.cardBackExample.textContent = card.back.example ? `"${card.back.example}"` : '';

    // Show front
    reviewFlipped = false;
    $('.flashcard-front').style.display = 'flex';
    $('.flashcard-back').style.display = 'none';
    dom.reviewButtons.style.display = 'none';
    dom.reviewTapHint.style.display = 'block';
  }

  function flipCard() {
    if (reviewFlipped) return;
    reviewFlipped = true;
    $('.flashcard-front').style.display = 'none';
    $('.flashcard-back').style.display = 'flex';
    dom.reviewButtons.style.display = 'flex';
    dom.reviewTapHint.style.display = 'none';
  }

  async function rateCard(quality) {
    const card = reviewCards[reviewIndex];
    Flashcards.recordReview(card, quality);
    flashcardData.lastUpdated = new Date().toISOString();

    reviewIndex++;
    renderReviewCard();

    try {
      await github.saveUserData('flashcards.json', flashcardData, 'Review update');
    } catch (err) {
      console.error('Failed to save review:', err);
    }
  }

  // ---- Streak ----

  function calcStreak() {
    const readDates = [...new Set(readingLog.entries.map(e => e.date))].sort().reverse();
    if (readDates.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let check = new Date(today);
    if (!readDates.includes(formatDateStr(check))) {
      check.setDate(check.getDate() - 1);
      if (!readDates.includes(formatDateStr(check))) return 0;
    }

    const dateSet = new Set(readDates);
    while (dateSet.has(formatDateStr(check))) {
      streak++;
      check.setDate(check.getDate() - 1);
    }
    return streak;
  }

  // ---- Event Binding ----

  function bindEvents() {
    // Setup form
    dom.setupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = $('#setup-token').value.trim();
      const repo = $('#setup-repo').value.trim();

      showLoading('接続を確認中...');
      try {
        const client = new GitHubClient(token, repo);
        await client.testConnection();
        saveConfig({ token, repo });
        github = client;
        showApp();
        await loadAllData();
      } catch (err) {
        hideLoading();
        showToast(err.message, 'error');
      }
    });

    // Tab navigation
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Article card click (today + library)
    for (const container of [dom.todayArticles, dom.libraryArticles]) {
      container.addEventListener('click', (e) => {
        const card = e.target.closest('.article-card');
        if (!card) return;
        const id = card.dataset.id;
        if (articleCache.has(id)) {
          openArticle(id);
        }
      });
    }

    // Reader
    $('#btn-reader-back').addEventListener('click', closeArticle);

    // TTS
    dom.ttsBtn.addEventListener('click', startTTS);

    // Page indicator — update dots on swipe, stop TTS on Japanese page
    dom.readerPages.addEventListener('scroll', () => {
      const page = Math.round(dom.readerPages.scrollLeft / (dom.readerPages.clientWidth || 1));
      $$('.page-dot').forEach((dot, i) => dot.classList.toggle('active', i === page));
      if (page === 1) stopTTS();
    }, { passive: true });

    // Annotation click
    dom.readerBody.addEventListener('click', (e) => {
      const el = e.target.closest('.annotated');
      if (!el) return;
      $$('.annotated.active').forEach(a => a.classList.remove('active'));
      el.classList.add('active');
      openTooltip(el.dataset.key, el.dataset.type);
    });

    // Tooltip
    $('#tooltip-close').addEventListener('click', closeTooltip);
    dom.tooltipAddBtn.addEventListener('click', addToFlashcards);

    // Flashcard review
    $('#btn-review-back').addEventListener('click', closeReview);
    $('#btn-review-skip').addEventListener('click', () => {
      reviewIndex++;
      renderReviewCard();
    });
    $('#review-card').addEventListener('click', flipCard);
    $$('.review-btn').forEach(btn => {
      btn.addEventListener('click', () => rateCard(parseInt(btn.dataset.quality)));
    });

    // Genre filters
    dom.libraryFilters.addEventListener('click', (e) => {
      const chip = e.target.closest('.genre-chip');
      if (!chip) return;
      libraryGenre = chip.dataset.genre;
      $$('.genre-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      libraryArticles = []; // force reload with new filter
      renderLibrary();
    });

    // Refresh
    $('#btn-refresh').addEventListener('click', async () => {
      articleCache.clear();
      libraryArticles = [];
      await loadAllData();
      showToast('Updated!', 'success');
    });

    // Settings
    $('#btn-settings').addEventListener('click', () => {
      const config = loadConfig() || {};
      $('#settings-token').value = config.token || '';
      $('#settings-repo').value = config.repo || '';
      dom.settingsModal.style.display = 'flex';
    });
    $('#btn-settings-back').addEventListener('click', () => {
      dom.settingsModal.style.display = 'none';
    });
    $('#settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = $('#settings-token').value.trim();
      const repo = $('#settings-repo').value.trim();

      showLoading('接続を確認中...');
      try {
        const client = new GitHubClient(token, repo);
        await client.testConnection();
        saveConfig({ token, repo });
        github = client;
        dom.settingsModal.style.display = 'none';
        articleCache.clear();
        libraryArticles = [];
        await loadAllData();
      } catch (err) {
        hideLoading();
        showToast(err.message, 'error');
      }
    });
  }

  // ---- Utilities ----

  function todayStr() {
    return formatDateStr(new Date());
  }

  function formatDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDisplayDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return `${parseInt(m)}月${parseInt(d)}日（${days[date.getDay()]}）`;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---- Start ----
  document.addEventListener('DOMContentLoaded', init);
})();
