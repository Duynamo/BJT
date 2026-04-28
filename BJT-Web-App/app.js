document.addEventListener('DOMContentLoaded', () => {
    // Check if BJT_DATA is defined
    if (typeof BJT_DATA === 'undefined') {
        document.getElementById('contentBody').innerHTML = `
            <div class="welcome-screen">
                <div class="glass-panel" style="border-color: var(--danger)">
                    <i class="fa-solid fa-triangle-exclamation welcome-icon" style="color: var(--danger)"></i>
                    <h2>Data Loading Error</h2>
                    <p>BJT_DATA is not defined. Please ensure data.js is generated and loaded correctly.</p>
                </div>
            </div>`;
        return;
    }

    // App State
    const state = {
        categories: Object.keys(BJT_DATA),
        albums: {}, // { category: [album1, album2] }
        currentCategory: null,
        currentAlbum: null,
        currentMainView: 'dashboard', // dashboard or learning
        currentLearningMode: 'flashcard', // flashcard or list
        words: [], // array of word objects
        currentIndex: 0,
        knownWords: new Set(), // Set of "wordKey"
        searchQuery: '',
        selectedVoice: localStorage.getItem('BJT_VOICE') || 'Microsoft Nanami',
        hotkeyVocab: localStorage.getItem('BJT_HOTKEY_VOCAB') || 'v',
        hotkeyExample: localStorage.getItem('BJT_HOTKEY_EXAMPLE') || 'p',
        wordStats: {}, // { status: 0=new, 1=review, 2=mastered, step: 0, nextDate: timestamp }
        hardcorePlans: {}, // { id: { name, categories: [], targetDays: 30, startDate: ts, lastQueueDate: ts, queue: [], doneToday: 0 } }
        activePlanId: localStorage.getItem('BJT_ACTIVE_PLAN_ID') || null,
        // New timer state
        hcTimerValue: 0,
        hcTimerInterval: null,
        hcTimerIsRunning: false,
        hcTimerMode: 'down' // up or down
    };

    // ── Apply xlsx/CSV override data if any ──
    try {
        const csvOverride = localStorage.getItem('BJT_CSV_OVERRIDE');
        if (csvOverride) {
            const overrideData = JSON.parse(csvOverride);
            // '__large_dataset__' is a flag set when data was too big for localStorage
            // In that case we just keep data.js as-is (data was applied in memory at upload time, lost on refresh)
            if (typeof overrideData === 'object' && overrideData !== null) {
                Object.keys(overrideData).forEach(cat => {
                    BJT_DATA[cat] = overrideData[cat];
                });
                // Re-sync categories list
                state.categories = Object.keys(BJT_DATA);
            }
        }
    } catch(e) { console.warn('Override load failed', e); }

    // Load progress from localStorage
    try {
        const stored = localStorage.getItem('BJT_KNOWN_WORDS');
        if (stored) {
            state.knownWords = new Set(JSON.parse(stored));
        }
        
        const storedStats = localStorage.getItem('BJT_WORD_STATS');
        if (storedStats) {
            state.wordStats = JSON.parse(storedStats);
        } else {
            state.wordStats = {};
            state.knownWords.forEach(key => {
                state.wordStats[key] = { status: 2, step: 4, nextDate: 0 };
            });
            localStorage.setItem('BJT_WORD_STATS', JSON.stringify(state.wordStats));
        }

        // Migration logic: Single plan to Multiple plans
        const storedPlans = localStorage.getItem('BJT_HARDCORE_PLANS');
        if (storedPlans) {
            state.hardcorePlans = JSON.parse(storedPlans);
        } else {
            const oldPlan = localStorage.getItem('BJT_HARDCORE_PLAN');
            if (oldPlan) {
                const planObj = JSON.parse(oldPlan);
                const planId = 'plan_' + Date.now();
                state.hardcorePlans[planId] = { ...planObj, id: planId, name: "Lộ trình mặc định" };
                state.activePlanId = planId;
                localStorage.setItem('BJT_ACTIVE_PLAN_ID', planId);
                localStorage.setItem('BJT_HARDCORE_PLANS', JSON.stringify(state.hardcorePlans));
            }
        }
    } catch (e) {
        console.warn("Could not load progress", e);
    }

    function saveStats() {
        try { localStorage.setItem('BJT_WORD_STATS', JSON.stringify(state.wordStats)); } catch (e) {}
    }

    function savePlans() {
        try {
            localStorage.setItem('BJT_HARDCORE_PLANS', JSON.stringify(state.hardcorePlans));
            if (state.activePlanId) {
                localStorage.setItem('BJT_ACTIVE_PLAN_ID', state.activePlanId);
            } else {
                localStorage.removeItem('BJT_ACTIVE_PLAN_ID');
            }
        } catch (e) {}
    }

    function saveProgress() {
        try {
            localStorage.setItem('BJT_KNOWN_WORDS', JSON.stringify(Array.from(state.knownWords)));
            saveStats(); // Sync stats too
        } catch (e) {
             console.warn("Could not save progress", e);
        }
    }

    // ── Session Restore: Save/Load current album position ──
    function saveSession() {
        try {
            if (state.currentAlbum && state.currentCategory) {
                localStorage.setItem('BJT_SESSION', JSON.stringify({
                    category: state.currentCategory,
                    album: state.currentAlbum,
                    index: state.currentIndex,
                    mode: state.currentLearningMode
                }));
            }
        } catch(e) {}
    }

    function clearSession() {
        localStorage.removeItem('BJT_SESSION');
    }

    // Yêu cầu 1 & 3: Lưu phiên học "Khô Máu" hiện tại vào key riêng biệt theo planId
    function saveCurrentHardcoreSession() {
        const planId = state.activePlanId;
        if (!planId || !state.hardcoreSession) return;

        try {
            const sessionState = {
                currentIndex: state.hardcoreIndex,
                words: state.hardcoreSession // Snapshot của từ vựng và trạng thái Nhớ/Quên
            };
            localStorage.setItem(`BJT_HARDCORE_SESSION_${planId}`, JSON.stringify(sessionState));
        } catch (e) {
            console.warn("Could not save hardcore session for plan " + planId, e);
            showToast('Lỗi: Không thể lưu tiến độ. Bộ nhớ có thể đã đầy.', 'error');
        }
    }

    // Xóa session của plan hiện tại
    function clearCurrentHardcoreSession() {
        const planId = state.activePlanId;
        if (planId) {
            localStorage.removeItem(`BJT_HARDCORE_SESSION_${planId}`);
        }
    }

    function getWordKey(cat, album, word) {
        return `${cat}_${album}_${word}`;
    }
    
    // For legacy usages:
    function getWordKeyObj(wordObj) {
        return getWordKey(state.currentCategory, wordObj._album, wordObj.tu_vung);
    }

    // Pre-process data
    state.categories.forEach(cat => {
        if (!BJT_DATA[cat]) return;
        
        // Handle PowerShell 5.1 ConvertFrom-Json wrapping arrays in .value property
        if (BJT_DATA[cat] && BJT_DATA[cat].value && Array.isArray(BJT_DATA[cat].value)) {
            BJT_DATA[cat] = BJT_DATA[cat].value;
        }
        
        const albumSet = new Set();
        if (Array.isArray(BJT_DATA[cat])) {
            BJT_DATA[cat].forEach(word => {
                if (word._album) albumSet.add(word._album);
            });
            state.albums[cat] = Array.from(albumSet);
        }
    });

    // Valid categories (non-empty)
    state.categories = state.categories.filter(cat => state.albums[cat] && state.albums[cat].length > 0);

    // Initial category
    if (state.categories.length > 0) {
        state.currentCategory = state.categories[0];
    }

    // DOM Elements
    const els = {
        navTabs: document.getElementById('navTabs'),
        searchInput: document.getElementById('searchInput'),
        albumGridView: document.getElementById('albumGridView'),
        albumGrid: document.getElementById('albumGrid'),
        gridCategoryTitle: document.getElementById('gridCategoryTitle'),
        learningView: document.getElementById('learningView'),
        learningHeader: document.getElementById('learningHeader'),
        currentAlbumTitle: document.getElementById('currentAlbumTitle'),
        btnFlashcard: document.getElementById('btnFlashcard'),
        btnList: document.getElementById('btnList'),
        btnBack: document.getElementById('btnBack')
    };

    // Initialize UI
    function init() {
        const voiceSelect = document.getElementById('voiceSelect');
        if (voiceSelect) {
            voiceSelect.value = state.selectedVoice;
            voiceSelect.addEventListener('change', (e) => {
                state.selectedVoice = e.target.value;
                localStorage.setItem('BJT_VOICE', state.selectedVoice);
            });
        }
        
        const btnSettings = document.getElementById('btnSettings');
        const settingsModal = document.getElementById('settingsModal');
        const btnCloseSettings = document.getElementById('btnCloseSettings');
        const btnSaveSettings = document.getElementById('btnSaveSettings');
        const inputKeyVocab = document.getElementById('inputKeyVocab');
        const inputKeyExample = document.getElementById('inputKeyExample');

        if (btnSettings && settingsModal) {
            btnSettings.addEventListener('click', () => {
                inputKeyVocab.value = state.hotkeyVocab;
                inputKeyExample.value = state.hotkeyExample;
                // Show xlsx status
                const xlsxStatusEl = document.getElementById('xlsxStatusText');
                if (xlsxStatusEl) {
                    const hasOverride = !!localStorage.getItem('BJT_CSV_OVERRIDE');
                    xlsxStatusEl.innerHTML = hasOverride
                        ? '<i class="fa-solid fa-circle-check" style="color:#22c55e;"></i> Đang dùng dữ liệu từ file xlsx đã upload. Bấm "Đặt lại gốc" để hoàn về data.js gốc.'
                        : '<i class="fa-regular fa-circle-dot" style="color:var(--text-secondary);"></i> Đang dùng dữ liệu gốc từ data.js.';
                }
                settingsModal.classList.add('open');
            });
            btnCloseSettings.addEventListener('click', () => {
                settingsModal.classList.remove('open');
            });
            btnSaveSettings.addEventListener('click', () => {
                state.hotkeyVocab = inputKeyVocab.value.toLowerCase() || 'v';
                state.hotkeyExample = inputKeyExample.value.toLowerCase() || 'p';
                localStorage.setItem('BJT_HOTKEY_VOCAB', state.hotkeyVocab);
                localStorage.setItem('BJT_HOTKEY_EXAMPLE', state.hotkeyExample);
                settingsModal.classList.remove('open');
            });
        }

        // xlsx update handlers
        const xlsxFileInput = document.getElementById('xlsxFileInput');
        const btnResetXlsx = document.getElementById('btnResetXlsx');

        if (xlsxFileInput) {
            xlsxFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) handleXlsxUpdate(file);
                xlsxFileInput.value = ''; // reset so same file can be re-uploaded
            });
        }

        if (btnResetXlsx) {
            btnResetXlsx.addEventListener('click', () => {
                if (!confirm('Bạn có chắc muốn xóa dữ liệu xlsx đã upload và dùng lại data.js gốc không?\nTrang sẽ được tải lại.')) return;
                localStorage.removeItem('BJT_CSV_OVERRIDE');
                localStorage.removeItem('BJT_SESSION');
                location.reload();
            });
        }
        
        renderTopNav();
        switchMainView('dashboard');
        bindEvents();
    }

    function renderTopNav() {
        els.navTabs.innerHTML = '';
        state.categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = `nav-tab ${cat === state.currentCategory ? 'active' : ''}`;
            btn.textContent = cat.replace(/_/g, ' ');
            btn.addEventListener('click', () => {
                document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.currentCategory = cat;
                els.searchQuery = '';
                if(els.searchInput) els.searchInput.value = '';
                switchMainView('dashboard');
            });
            els.navTabs.appendChild(btn);
        });
    }

    function switchMainView(view) {
        state.currentMainView = view;
        
        if (view !== 'hardcore_learning' && state.hcTimerInterval) {
            clearInterval(state.hcTimerInterval);
            state.hcTimerIsRunning = false;
        }

        els.learningHeader.style.display = 'none';
        els.learningView.style.display = 'none';
        els.albumGridView.style.display = 'none';
        
        const hcDash = document.getElementById('hardcoreDashboard');
        if (hcDash) hcDash.style.display = 'none';
        
        if (view === 'dashboard') {
            els.albumGridView.style.display = 'block';
            renderAlbumGrid();
        } else if (view === 'learning') {
            els.learningHeader.style.display = 'flex';
            els.learningView.style.display = 'block';
            renderLearningContent();
        } else if (view === 'hardcore') {
            if (hcDash) hcDash.style.display = 'block';
            renderHardcoreDashboard();
        }
    }

    function formatAlbumTitle(album) {
        if(!album) return "";
        let cleanAlbum = album;
        if(album.startsWith("ETS-")) {
            cleanAlbum = album.replace("ETS-", "").replace("-", " ");
        }
        return cleanAlbum;
    }

    function renderAlbumGrid() {
        els.gridCategoryTitle.textContent = state.currentCategory.replace(/_/g, ' ');
        els.albumGrid.innerHTML = '';
        
        let albums = state.albums[state.currentCategory] || [];
        
        if (state.searchQuery) {
            albums = albums.filter(a => a.toLowerCase().includes(state.searchQuery.toLowerCase()));
        }

        if (albums.length === 0) {
            els.albumGrid.innerHTML = `<p style="color:var(--text-secondary)">Không tìm thấy album nào.</p>`;
            return;
        }

        albums.forEach(album => {
            const wordsInAlbum = BJT_DATA[state.currentCategory].filter(w => w._album === album);
            const totalWords = wordsInAlbum.length;
            
            // Calculate known words
            let knownCount = 0;
            wordsInAlbum.forEach(w => {
                const key = `${state.currentCategory}_${album}_${w.tu_vung}`;
                if (state.knownWords.has(key)) knownCount++;
            });

            const progressPct = totalWords > 0 ? (knownCount / totalWords) * 100 : 0;

            const card = document.createElement('div');
            card.className = 'album-card';
            
            card.innerHTML = `
                <div class="album-title">${formatAlbumTitle(album)}</div>
                <div class="album-subtitle"><i class="fa-solid fa-layer-group"></i> Trích từ bộ ${state.currentCategory.replace(/_/g, ' ')}</div>
                
                <div class="album-stats">Đã nhớ <strong>${knownCount}/${totalWords}</strong> từ vựng</div>
                
                <div class="progress-bar-thin">
                    <div class="progress-fill-thin" style="width: ${progressPct}%"></div>
                </div>
                
                <button class="btn-learn-album" style="margin-top: 25px;"><i class="fa-solid fa-play"></i> Học album này</button>
            `;
            
            card.querySelector('.btn-learn-album').addEventListener('click', () => {
                loadAlbum(state.currentCategory, album);
            });
            
            els.albumGrid.appendChild(card);
        });
    }

    function loadAlbum(category, albumName, startIndex) {
        state.currentCategory = category;
        state.currentAlbum = albumName;
        state.words = BJT_DATA[category].filter(w => w._album === albumName);
        state.currentIndex = (startIndex && startIndex < state.words.length) ? startIndex : 0;
        
        els.currentAlbumTitle.textContent = `${category.replace(/_/g, ' ')} / ${formatAlbumTitle(albumName)}`;
        switchMainView('learning');
    }

    function renderLearningContent() {
        if (state.words.length === 0) return;

        if (state.currentLearningMode === 'flashcard') {
            renderFlashcard();
        } else {
            renderList();
        }
    }

    function sanitizeHTML(str) {
        if (!str) return '';
        return str; // Data already contains safe <span> tags
    }

    function wrapWithSpans(plainText) {
        if (!plainText) return '';
        let html = '';
        let currentIdx = 0;
        const tokens = plainText.split(/([ \t\n\r]+)/);
        tokens.forEach(token => {
            if (token.trim().length === 0) {
                html += token;
                currentIdx += token.length;
            } else {
                html += `<span class="word" data-cidx="${currentIdx}">${token}</span>`;
                currentIdx += token.length;
            }
        });
        return html;
    }

    function getExamplesHtml(word) {
        let examplesHtml = '';
        let enText = '';
        let viText = '';

        if (word.song_ngu && word.song_ngu.length >= 2) {
            enText = sanitizeHTML(word.song_ngu[0]);
            viText = sanitizeHTML(word.song_ngu[1]);
        } else if (word.vi_du_them && word.vi_du_them.length > 0) {
            enText = sanitizeHTML(word.vi_du_them[0].phrase);
            viText = sanitizeHTML(word.vi_du_them[0].meaning);
        } else if (Array.isArray(word.song_ngu) && word.song_ngu.length > 0) {
             enText = sanitizeHTML(word.song_ngu[0]);
        }

        if (enText) {
            const plainEnText = enText.replace(/<[^>]+>/g, '');
            const trackableEnHtml = wrapWithSpans(plainEnText);
            const ipaHtml = word.ipa_cau_vi_du ? wrapWithSpans(word.ipa_cau_vi_du) : '';

            examplesHtml = `
                <div class="examples">
                    <div class="example-en">
                        <button class="btn-play-example" data-text="${encodeURIComponent(plainEnText)}" title="Đọc ví dụ">
                            <i class="fa-solid fa-volume-low"></i>
                        </button>
                        <span style="flex-grow: 1;">${trackableEnHtml}</span>
                    </div>
                    ${ipaHtml ? `<div class="example-ipa">${ipaHtml}</div>` : ''}
                    ${viText ? `<div class="example-vi">${viText}</div>` : ''}
                </div>
            `;
        }
        return examplesHtml;
    }

    function renderFlashcard() {
        const word = state.words[state.currentIndex];
        const progress = ((state.currentIndex + 1) / state.words.length) * 100;
        const examplesHtml = getExamplesHtml(word);
        
        const wKey = getWordKeyObj(word);
        const isKnown = state.knownWords.has(wKey);

        els.learningView.innerHTML = `
            <div class="flashcard-container">
                <div class="progress-stats">
                    <span>Card ${state.currentIndex + 1} of ${state.words.length}</span>
                    <span>${Math.round(progress)}% Hoàn thành</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
                
                <div class="card" id="flashcard">
                    <div class="card-inner">
                        <div class="card-front">
                            <div class="word-main">${sanitizeHTML(word.tu_vung)}</div>
                            <button class="btn-audio play-audio-btn"><i class="fa-solid fa-volume-high"></i></button>
                            <p style="margin-top: 20px; color: var(--text-secondary); font-size: 0.9rem;">Click để lật thẻ (ngoặc bấm Phím cách)</p>
                        </div>
                        <div class="card-back">
                            <div style="display: flex; justify-content: space-between; width: 100%; align-items: flex-start; margin-bottom: 15px;">
                                <h3 style="flex-grow: 1;">${sanitizeHTML(word.tu_vung)}</h3>
                                <button class="btn-audio play-audio-btn" style="width: 40px; height: 40px; font-size: 1rem; flex-shrink: 0;"><i class="fa-solid fa-volume-high"></i></button>
                            </div>
                            <div class="word-meta">
                                <span class="badge-pos">${sanitizeHTML(word.tu_loai || 'vocab')}</span>
                                <span class="pronunciation">${sanitizeHTML(word.phien_am || '')}</span>
                            </div>
                            <div class="word-meaning">${sanitizeHTML(word.y_nghia)}</div>
                            ${examplesHtml}
                        </div>
                    </div>
                </div>
                
                <div class="controls">
                    <button class="btn-mark-known ${isKnown ? 'is-known' : ''}" id="btnMarkKnown">
                        <i class="fa-solid fa-check"></i> ${isKnown ? 'Đã thuộc' : 'Chưa thuộc'}
                    </button>
                    
                    <div class="nav-controls">
                        <button class="btn-control btn-prev" disabled>
                            <i class="fa-solid fa-arrow-left"></i>
                        </button>
                        <button class="btn-control btn-next" disabled>
                            <i class="fa-solid fa-arrow-right"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Bind logic controls after rendering
        const btnPrev = document.querySelector('.btn-prev');
        const btnNext = document.querySelector('.btn-next');
        const btnMarkKnown = document.getElementById('btnMarkKnown');
        
        if (state.currentIndex > 0) {
            btnPrev.removeAttribute('disabled');
        }
        if (state.currentIndex < state.words.length - 1) {
            btnNext.removeAttribute('disabled');
        }

        // Mark Known Toggle
        btnMarkKnown.addEventListener('click', (e) => {
            e.stopPropagation();
            if (state.knownWords.has(wKey)) {
                state.knownWords.delete(wKey);
                btnMarkKnown.classList.remove('is-known');
                btnMarkKnown.innerHTML = '<i class="fa-solid fa-check"></i> Chưa thuộc';
            } else {
                state.knownWords.add(wKey);
                btnMarkKnown.classList.add('is-known');
                btnMarkKnown.innerHTML = '<i class="fa-solid fa-check"></i> Đã thuộc';
            }
            saveProgress();
            saveSession();
        });

        // Bind events for flashcard
        const card = document.getElementById('flashcard');
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.play-audio-btn') && !e.target.closest('.btn-mark-known')) {
                card.classList.toggle('is-flipped');
            }
        });

        document.querySelectorAll('.play-audio-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const plainText = word.tu_vung.replace(/<[^>]+>/g, '');
                playAudio(plainText);
            });
        });

        document.querySelectorAll('.btn-play-example').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const textToPlay = decodeURIComponent(e.currentTarget.getAttribute('data-text'));
                const examplesContainer = e.currentTarget.closest('.examples');
                const enContainer = examplesContainer.querySelector('.example-en');
                const ipaContainer = examplesContainer.querySelector('.example-ipa');
                playAudio(textToPlay, enContainer, ipaContainer);
            });
        });

        btnPrev.addEventListener('click', () => {
            if (state.currentIndex > 0) {
                state.currentIndex--;
                saveSession();
                renderLearningContent();
            }
        });

        btnNext.addEventListener('click', () => {
             if (state.currentIndex < state.words.length - 1) {
                state.currentIndex++;
                saveSession();
                renderLearningContent();
            }
        });
    }

    function renderList() {
        let html = '<div class="list-container">';
        
        state.words.forEach((word) => {
            const examplesHtml = getExamplesHtml(word);
            const plainWord = word.tu_vung.replace(/<[^>]+>/g, '');
            const wKey = getWordKeyObj(word);
            const isKnown = state.knownWords.has(wKey);

            html += `
                <div class="list-item">
                    <div class="list-word-col">
                        <div class="list-word">${sanitizeHTML(word.tu_vung)}</div>
                        <div class="list-meta">
                            <span class="badge-pos">${sanitizeHTML(word.tu_loai || 'vocab')}</span> 
                            <br/><span style="margin-top:5px; display:inline-block;">${sanitizeHTML(word.phien_am || '')}</span>
                        </div>
                        <button class="btn-audio play-audio-btn" data-word="${plainWord}" style="width: 35px; height: 35px; font-size: 0.9rem; margin-top: 10px;">
                            <i class="fa-solid fa-volume-high"></i>
                        </button>
                    </div>
                    <div class="list-meaning-col">
                        <div class="list-meaning">${sanitizeHTML(word.y_nghia)}</div>
                        ${examplesHtml ? `<div class="list-example">${examplesHtml.replace(/class="examples"/,'')}</div>` : ''}
                    </div>
                    <div class="list-actions">
                        <button class="list-mark-known ${isKnown ? 'is-known' : ''}" data-key="${wKey}" title="Đánh dấu đã thuộc">
                            <i class="fa-solid fa-circle-check"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        els.learningView.innerHTML = html;

        document.querySelectorAll('.play-audio-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                playAudio(e.currentTarget.getAttribute('data-word'));
            });
        });

        document.querySelectorAll('.btn-play-example').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const textToPlay = decodeURIComponent(e.currentTarget.getAttribute('data-text'));
                const examplesContainer = e.currentTarget.closest('.examples');
                const enContainer = examplesContainer.querySelector('.example-en');
                const ipaContainer = examplesContainer.querySelector('.example-ipa');
                playAudio(textToPlay, enContainer, ipaContainer);
            });
        });

        document.querySelectorAll('.list-mark-known').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const wKey = e.currentTarget.getAttribute('data-key');
                if (state.knownWords.has(wKey)) {
                    state.knownWords.delete(wKey);
                    e.currentTarget.classList.remove('is-known');
                } else {
                    state.knownWords.add(wKey);
                    e.currentTarget.classList.add('is-known');
                }
                saveProgress();
            });
        })
    }

    function playAudio(text, textElement, ipaElement) {
        if (!window.speechSynthesis) return;
        
        window.speechSynthesis.cancel();
        document.querySelectorAll('.highlight-word').forEach(el => el.classList.remove('highlight-word'));
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            const voice = voices.find(v => v.name.includes(state.selectedVoice));
            if (voice) {
                utterance.voice = voice;
            }
        }
        
        if (textElement) {
            utterance.onboundary = (e) => {
                if (e.name === 'word') {
                    if (textElement) textElement.querySelectorAll('.word').forEach(w => w.classList.remove('highlight-word'));
                    if (ipaElement) ipaElement.querySelectorAll('.word').forEach(w => w.classList.remove('highlight-word'));
                    
                    const charIndex = e.charIndex;
                    const spans = Array.from(textElement.querySelectorAll('.word'));
                    let targetSpan = null;
                    let targetIdx = 0;
                    for(let i=0; i<spans.length; i++) {
                        const cidx = parseInt(spans[i].getAttribute('data-cidx'));
                        if (charIndex >= cidx) {
                            targetSpan = spans[i];
                            targetIdx = i;
                        } else {
                            break;
                        }
                    }
                    if (targetSpan) targetSpan.classList.add('highlight-word');
                    
                    if (ipaElement) {
                        const ipaSpans = ipaElement.querySelectorAll('.word');
                        if (ipaSpans[targetIdx]) ipaSpans[targetIdx].classList.add('highlight-word');
                    }
                }
            };
            
            utterance.onend = () => {
                if (textElement) textElement.querySelectorAll('.word').forEach(w => w.classList.remove('highlight-word'));
                if (ipaElement) ipaElement.querySelectorAll('.word').forEach(w => w.classList.remove('highlight-word'));
            };
        }
        
        window.speechSynthesis.speak(utterance);
    }

    // -- HARDCORE MODE LOGIC --
    function getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    function openHardcoreMode() {
        const plan = state.hardcorePlans[state.activePlanId];
        if (!plan) {
            renderPlanManager(); // Always render the vault/manager to ensure UI structure includes btnAddNewPlan
            if (Object.keys(state.hardcorePlans).length === 0) {
                populateWizardCategories();
                document.getElementById('wizardModal').classList.add('open');
            }
        } else {
            generateTodayQueue();
            switchMainView('hardcore');
        }
    }

    function populateWizardCategories() {
        const container = document.getElementById('wizardCategories');
        if (!container) return;
        container.innerHTML = '';

        state.categories.forEach(cat => {
            const albums = state.albums[cat] || [];
            if (albums.length === 0) return;

            const group = document.createElement('div');
            group.className = 'hc-category-group';

            const header = document.createElement('div');
            header.className = 'hc-category-header';
            header.innerHTML = `
                <input type="checkbox" class="cat-master-cb" data-cat="${cat}">
                <i class="fa-solid fa-folder-open"></i> ${cat.replace(/_/g, ' ')}
            `;

            const albumList = document.createElement('div');
            albumList.className = 'hc-album-list';

            albums.forEach(album => {
                const albumWords = BJT_DATA[cat].filter(w => w._album === album).length;
                const albumItem = document.createElement('label');
                albumItem.className = 'hc-album-item';
                albumItem.innerHTML = `
                    <input type="checkbox" value="${cat}|${album}" class="album-cb" data-cat="${cat}">
                    <span>${formatAlbumTitle(album)} (${albumWords} từ)</span>
                `;
                albumList.appendChild(albumItem);
            });

            group.appendChild(header);
            group.appendChild(albumList);
            container.appendChild(group);

            // Logic for Master Checkbox
            const masterCb = header.querySelector('.cat-master-cb');
            const albumCbs = albumList.querySelectorAll('.album-cb');

            masterCb.addEventListener('change', () => {
                albumCbs.forEach(cb => cb.checked = masterCb.checked);
            });

            albumCbs.forEach(cb => {
                cb.addEventListener('change', () => {
                    const allChecked = Array.from(albumCbs).every(c => c.checked);
                    const someChecked = Array.from(albumCbs).some(c => c.checked);
                    masterCb.checked = allChecked;
                    masterCb.indeterminate = someChecked && !allChecked;
                });
            });
        });
    }

    function generatePlan() {
        const selectedAlbums = Array.from(document.querySelectorAll('.album-cb:checked')).map(cb => cb.value);
        const days = parseInt(document.getElementById('inputTargetDays').value) || 30;
        const planName = document.getElementById('inputPlanName').value.trim() || `Lộ trình ${Object.keys(state.hardcorePlans).length + 1}`;

        if (selectedAlbums.length === 0) {
            alert("Vui lòng chọn ít nhất 1 album từ vựng!"); return;
        }

        let poolNew = [];
        selectedAlbums.forEach(composedKey => {
            const [cat, album] = composedKey.split('|');
            const wordsInAlbum = BJT_DATA[cat].filter(w => w._album === album);

            wordsInAlbum.forEach(w => {
                const key = getWordKey(cat, album, w.tu_vung);
                const stat = state.wordStats[key];
                if (!stat || stat.status === 0 || stat.status === undefined) {
                    poolNew.push({ wordObj: w, key: key, cat: cat, album: album, type: 'new' });
                }
            });
        });

        if (poolNew.length === 0) {
            alert("Các album bạn chọn đã được học hết rồi! Vui lòng chọn nội dung khác hoặc xóa bớt lộ trình cũ.");
            return;
        }

        // Tự động xáo trộn để học xen kẽ
        poolNew.sort(() => Math.random() - 0.5);

        // Tách rổ từ mới theo targetDays
        const chunks = [];
        let wpd = Math.ceil(poolNew.length / days);
        if (wpd === 0) wpd = 5;
        for (let i = 0; i < days; i++) {
            chunks.push(poolNew.slice(i * wpd, (i + 1) * wpd));
        }

        const planId = 'plan_' + Date.now();
        state.hardcorePlans[planId] = {
            id: planId,
            name: planName,
            selectedAlbums: selectedAlbums,
            targetDays: days,
            startDate: getTodayStr(),
            lastQueueDate: null,
            dailyChunks: chunks,
            queueReview: [],
            activeDay: 1
        };
        state.activePlanId = planId;
        savePlans();
        document.getElementById('wizardModal').classList.remove('open');
        openHardcoreMode();
    }

    window.switchToDay = function (dayNum) {
        const plan = state.hardcorePlans[state.activePlanId];
        if (!plan) return;
        if (plan.activeDay === dayNum) return;

        plan.activeDay = dayNum;
        savePlans();
        switchMainView('hardcore');
    };

    function generateTodayQueue() {
        const todayStr = getTodayStr();
        const plan = state.hardcorePlans[state.activePlanId];
        if (!plan) return;

        // migration: check if using old "categories" instead of "selectedAlbums"
        if (plan.categories && !plan.selectedAlbums) {
            console.log("Migrating old plan to new album-based system...");
            plan.selectedAlbums = plan.categories.flatMap(cat => (state.albums[cat] || []).map(alb => `${cat}|${alb}`));
            delete plan.categories;
            savePlans();
        }

        if (plan.lastQueueDate === todayStr) {
            renderHardcoreDashboard();
            return;
        }

        let poolReview = [];
        const nowTime = new Date().getTime();

        // Group selected albums by category for faster lookup
        const catMap = {};
        if (plan.selectedAlbums) {
            plan.selectedAlbums.forEach(ak => {
                const parts = ak.split('|');
                if (parts.length < 2) return;
                const [c, a] = parts;
                if (!catMap[c]) catMap[c] = new Set();
                catMap[c].add(a);
            });
        }

        Object.keys(catMap).forEach(cat => {
            if (!BJT_DATA[cat]) return;
            BJT_DATA[cat].forEach(w => {
                if (!catMap[cat].has(w._album)) return; // Only review words in selected albums

                const key = getWordKey(cat, w._album, w.tu_vung);
                const stat = state.wordStats[key];

                if (stat && stat.status === 1) {
                    if (stat.nextDate <= nowTime) {
                        poolReview.push({ wordObj: w, key: key, cat: cat, album: w._album, type: 'review' });
                    }
                }
            });
        });

        plan.queueReview = poolReview;
        plan.lastQueueDate = todayStr;

        savePlans();
        renderHardcoreDashboard();
    }

    function renderHardcoreDashboard() {
        const plan = state.hardcorePlans[state.activePlanId];
        if (!plan) return;

        const hcDash = document.getElementById('hardcoreDashboard');
        const currentChunk = plan.dailyChunks[plan.activeDay - 1] || [];

        let listHtml = '<div class="list-container hc-scroll-list" style="margin-top: 30px;">';

        const allItems = [...plan.queueReview, ...currentChunk];

        if (allItems.length === 0) {
            listHtml += '<div style="text-align:center; padding: 40px; color: var(--text-secondary);">Trống trơn! Nhấn Đổi Lộ Trình.</div>';
        } else {
            allItems.forEach((item) => {
                const word = item.wordObj;
                let statusBadge = '<span class="badge-pos" style="background:var(--glass-border); color:var(--text-secondary);"><i class="fa-solid fa-hourglass"></i> Chờ Học</span>';
                if (item.sessionResult === 'pass') {
                    statusBadge = '<span class="badge-pos" style="background:var(--success); color:white;"><i class="fa-solid fa-check"></i> Đã Thuộc</span>';
                } else if (item.sessionResult === 'fail') {
                    statusBadge = '<span class="badge-pos" style="background:var(--danger); color:white;"><i class="fa-solid fa-xmark"></i> Quên (Cần Ôn)</span>';
                }

                const typeBadge = item.type === 'new' ? '<span class="badge-pos"><i class="fa-solid fa-gem"></i> Từ Mới</span>' : '<span class="badge-pos" style="background:var(--warning); color:white;"><i class="fa-solid fa-rotate-right"></i> Ôn Lại</span>';

                const plainWord = word.tu_vung.replace(/<[^>]+>/g, '');

                listHtml += `
                    <div class="list-item">
                        <div class="list-word-col">
                            <div class="list-word">${sanitizeHTML(word.tu_vung)}</div>
                            <div class="list-meta">
                                ${typeBadge} ${statusBadge}
                                <br/><span style="margin-top:5px; display:inline-block;">${sanitizeHTML(word.phien_am || '')}</span>
                            </div>
                            <button class="btn-audio play-audio-btn hc-dash-audio" data-word="${plainWord}" style="width: 35px; height: 35px; font-size: 0.9rem; margin-top: 10px;">
                                <i class="fa-solid fa-volume-high"></i>
                            </button>
                        </div>
                        <div class="list-meaning-col">
                            <div class="list-meaning">${sanitizeHTML(word.y_nghia)}</div>
                        </div>
                    </div>
                `;
            });
        }

        listHtml += '</div>';

        const remainingNew = currentChunk.filter(i => i.sessionResult !== 'pass').length;
        const remainingReview = plan.queueReview.filter(i => i.sessionResult !== 'pass').length;
        const totalRemaining = remainingNew + remainingReview;

        let btnHtml = '';
        if (totalRemaining === 0) {
            btnHtml = `<button class="btn-hardcore-start" style="background: var(--success); cursor: default; margin-bottom:15px;">Hoàn Thành Lượt Học Hôm Nay <i class="fa-solid fa-check-double"></i></button>
                       <br/><button class="btn-primary" id="btnAdvanceSession" style="background: var(--warning); color: #000;"><i class="fa-solid fa-forward-step"></i> Học Vượt (Qua Ngày Tiếp Theo)</button>`;
        } else {
            btnHtml = `<button class="btn-hardcore-start" id="btnStartHardcoreSession">BẮT ĐẦU CHIẾN ĐẤU (${totalRemaining} Từ) <i class="fa-solid fa-rocket"></i></button>`;
        }

        let daysHtml = `<div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; justify-content: center;">`;
        for (let i = 1; i <= plan.targetDays; i++) {
            const isAct = (i === plan.activeDay);
            daysHtml += `<button class="btn-primary" onclick="window.switchToDay(${i})" style="padding: 8px 15px; font-weight: bold; background: ${isAct ? 'var(--primary)' : 'var(--glass-bg)'}; color: ${isAct ? '#fff' : 'var(--text-main)'}; border: 1px solid ${isAct ? 'var(--primary)' : 'var(--glass-border)'};"><i class="fa-solid fa-${isAct ? 'fire' : 'calendar-day'}"></i> Day ${i}</button>`;
        }
        daysHtml += `</div>`;

        hcDash.innerHTML = `
            <div class="hc-header">
                <h2>Lộ trình: ${plan.name} 🔥</h2>
                <div style="display:flex; gap:10px;">
                    <button class="btn-primary" id="btnSwitchPlan"><i class="fa-solid fa-rotate"></i> Đổi Lộ trình</button>
                    <button class="btn-primary" id="btnEditPlan" style="background:var(--danger); color:white;"><i class="fa-solid fa-trash"></i> Xóa Lộ trình</button>
                </div>
            </div>
            ${daysHtml}
            <div style="text-align: center; margin: 30px 0;">
                ${btnHtml}
            </div>
            ${listHtml}
        `;

        // Bind events for dynamically rendered buttons
        const switchBtn = hcDash.querySelector('#btnSwitchPlan');
        if (switchBtn) switchBtn.addEventListener('click', renderPlanManager);

        const deleteBtn = hcDash.querySelector('#btnEditPlan');
        if (deleteBtn) deleteBtn.addEventListener('click', () => {
            if (confirm(`Bạn có chắc chắn muốn XÓA lộ trình "${plan.name}" không?`)) {
                delete state.hardcorePlans[state.activePlanId];
                state.activePlanId = null;
                savePlans();
                openHardcoreMode();
            }
        });

        const startBtn = hcDash.querySelector('#btnStartHardcoreSession');
        if (startBtn) startBtn.addEventListener('click', checkAndStartHardcoreSession);

        const advanceBtn = hcDash.querySelector('#btnAdvanceSession');
        if (advanceBtn) advanceBtn.addEventListener('click', advanceHardcoreDay);

        // Bind audio buttons in dashboard
        hcDash.querySelectorAll('.hc-dash-audio').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                playAudio(e.currentTarget.getAttribute('data-word'));
            });
        });
    }

    function advanceHardcoreDay() {
        const plan = state.hardcorePlans[state.activePlanId];
        if (!plan) return;

        if (!confirm("Tuyệt vời! Bạn có muốn nhảy ngay sang ngày tiếp theo (Day " + (plan.activeDay + 1) + ") trong Lộ trình không?")) return;

        if (plan.activeDay >= plan.targetDays) {
            alert("Bạn đã ở ngày cuối cùng của Lộ trình rồi!");
            return;
        }

        plan.activeDay++;
        savePlans();
        renderHardcoreDashboard();
    }

    function checkAndStartHardcoreSession() {
        const plan = state.hardcorePlans[state.activePlanId];
        if (!plan) return;

        const savedSessionRaw = localStorage.getItem(`BJT_HARDCORE_SESSION_${plan.id}`);
        if (savedSessionRaw) {
            try {
                const savedSession = JSON.parse(savedSessionRaw);
                if (savedSession.words && savedSession.words.length > 0 && savedSession.currentIndex > 0 && savedSession.currentIndex < savedSession.words.length) {
                    showResumeModal(plan);
                    return;
                }
            } catch (e) {
                console.error("Error parsing saved hardcore session, starting new.", e);
            }
        }
        startNewHardcoreSession(plan.id);
    }

    function showResumeModal(plan) {
        const modal = document.getElementById('resumeHcModal');
        document.getElementById('resumePlanName').textContent = plan.name;

        // Thay mới nút để xóa event listener cũ
        const oldContinueBtn = document.getElementById('btnHcContinue');
        const newContinueBtn = oldContinueBtn.cloneNode(true);
        oldContinueBtn.parentNode.replaceChild(newContinueBtn, oldContinueBtn);

        const oldStartNewBtn = document.getElementById('btnHcStartNew');
        const newStartNewBtn = oldStartNewBtn.cloneNode(true);
        oldStartNewBtn.parentNode.replaceChild(newStartNewBtn, oldStartNewBtn);

        const oldCloseBtn = document.getElementById('btnCloseResumeHcModal');
        const newCloseBtn = oldCloseBtn.cloneNode(true);
        oldCloseBtn.parentNode.replaceChild(newCloseBtn, oldCloseBtn);

        newContinueBtn.onclick = () => {
            modal.classList.remove('open');
            resumeHardcoreSession(plan.id);
        };

        newStartNewBtn.onclick = () => {
            if (confirm('Học lại từ đầu sẽ reset vị trí thẻ hiện tại, nhưng vẫn giữ lại lịch sử Nhớ/Quên của các từ trong phiên này. Bạn có chắc chắn?')) {
                modal.classList.remove('open');
                startNewHardcoreSession(plan.id, true); 
            }
        };

        newCloseBtn.onclick = () => modal.classList.remove('open');
        modal.classList.add('open');
    }

    function resumeHardcoreSession(planId) {
        const savedSessionRaw = localStorage.getItem(`BJT_HARDCORE_SESSION_${planId}`);
        if (!savedSessionRaw) {
            startNewHardcoreSession(planId);
            return;
        }
        const savedSession = JSON.parse(savedSessionRaw);
        state.hardcoreSession = savedSession.words;
        state.hardcoreIndex = savedSession.currentIndex;
        switchToHardcoreLearningView();
    }

    function startNewHardcoreSession(planId, forceReset = false) {
        const plan = state.hardcorePlans[planId];
        if (!plan) return;

        if (forceReset) {
            if (plan.dailyChunks) plan.dailyChunks.forEach(chunk => chunk.forEach(item => delete item.sessionResult));
            if (plan.queueReview) plan.queueReview.forEach(item => delete item.sessionResult);
            savePlans();
        }

        const currentChunk = plan.dailyChunks[plan.activeDay - 1] || [];
        const remainingNew = currentChunk.filter(i => i.sessionResult !== 'pass');
        const remainingReview = plan.queueReview.filter(i => i.sessionResult !== 'pass');
        const sessionWords = [...remainingReview, ...remainingNew];

        if (sessionWords.length === 0) {
            alert('Bạn đã hoàn thành mục tiêu hôm nay! Quá xuất sắc!');
            return;
        }

        state.hardcoreSession = sessionWords;
        state.hardcoreIndex = 0;
        saveCurrentHardcoreSession();
        switchToHardcoreLearningView();
    }

    function switchToHardcoreLearningView() {
        els.learningHeader.style.display = 'flex';
        els.learningView.style.display = 'block';
        document.getElementById('hardcoreDashboard').style.display = 'none';
        els.btnList.style.display = 'none';
        els.btnFlashcard.style.display = 'none';
        state.currentMainView = 'hardcore_learning';
        renderHardcoreFlashcard();
    }

    function processSrs(key, isKnown) {
        let stat = state.wordStats[key];
        if (!stat || stat.status === 0 || stat.status === undefined) {
            stat = { status: 0, step: 0, nextDate: 0 };
        }

        const now = new Date().getTime();
        const DayMs = 24 * 60 * 60 * 1000;

        if (isKnown) {
            if (stat.status === 0) {
                stat.status = 1; // move to review
                stat.step = 1;
                stat.nextDate = now + 1 * DayMs;
            } else if (stat.status === 1) {
                stat.step++;
                if (stat.step === 2) stat.nextDate = now + 3 * DayMs;
                else if (stat.step === 3) stat.nextDate = now + 7 * DayMs;
                else if (stat.step >= 4) {
                    stat.status = 2; // Mastered
                    stat.nextDate = 0;
                }
            }
        } else {
            stat.status = 1;
            stat.step = 0;
            stat.nextDate = now + 1 * DayMs;
        }

        state.wordStats[key] = stat;
        saveStats();
    }

    function renderHardcoreFlashcard() {
        const plan = state.hardcorePlans[state.activePlanId];
        if (!plan || !state.hardcoreSession || state.hardcoreIndex >= state.hardcoreSession.length) {
            clearHardcoreSession();
            switchMainView('hardcore');
            els.btnList.style.display = 'inline-block';
            els.btnFlashcard.style.display = 'inline-block';
            els.currentAlbumTitle.textContent = "Hoàn thành";
            return;
        }

        const item = state.hardcoreSession[state.hardcoreIndex];
        const word = item.wordObj;
        const progress = (state.hardcoreIndex / state.hardcoreSession.length) * 100;
        const examplesHtml = getExamplesHtml(word);

        els.currentAlbumTitle.textContent = `🔥 Khô Máu: Task ${state.hardcoreIndex + 1}/${state.hardcoreSession.length} | ${item.type === 'new' ? '💎 Từ Mới' : '🔄 Ôn Lại'}`;

        // 1. Generate Day List HTML
        let dayListHtml = '';
        const currentDay = plan.activeDay;
        for (let i = 1; i <= plan.targetDays; i++) {
            let cls = '';
            let icon = '<i class="fa-regular fa-circle"></i>';
            if (i < currentDay) { cls = 'past'; icon = '<i class="fa-solid fa-circle-check"></i>'; }
            else if (i === currentDay) { cls = 'active'; icon = '<i class="fa-solid fa-fire"></i>'; }
            dayListHtml += `<div class="hc-day-item ${cls}" style="cursor: pointer;" onclick="window.switchToDay(${i})" title="Chuyển sang Day ${i}">${icon} Day ${i}</div>`;
        }

        // 2. Generate Map HTML 
        let mapHtml = '';
        state.hardcoreSession.forEach((sItem, idx) => {
            let cls = '';
            if (idx === state.hardcoreIndex) cls = 'current';
            else if (sItem.sessionResult === 'pass') cls = 'pass';
            else if (sItem.sessionResult === 'fail') cls = 'fail';
            mapHtml += `<div class="hc-map-dot ${cls}" title="${sItem.wordObj.tu_vung.replace(/<[^>]+>/g, '')}"></div>`;
        });

        // 3. Timer Formatter
        const formatTime = (totalSeconds) => {
            if (totalSeconds < 0) totalSeconds = 0;
            const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const s = (totalSeconds % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        };
        const playPauseIcon = state.hcTimerIsRunning ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play" style="margin-left: 3px;"></i>';
        const startValue = state.hcTimerMode === 'down' ? Math.floor(state.hcTimerValue / 60) : 10;

        els.learningView.innerHTML = `
            <div class="hc-learning-layout">
                <!-- Left Sidebar -->
                <div class="hc-sidebar-left">
                    <div class="hc-widget-title"><i class="fa-solid fa-calendar-days"></i> Lộ trình (${plan.targetDays} Ngày)</div>
                    <div class="hc-day-list">
                        ${dayListHtml}
                    </div>
                </div>

                <!-- Center Panel (Flashcard) -->
                <div class="hc-center-panel">
                    <div class="flashcard-container hardcore-theme" style="width: 100%;">
                        <div class="progress-bar">
                            <div class="progress-fill warning" style="width: ${progress}%"></div>
                        </div>
                        
                        <div class="card" id="flashcard">
                            <div class="card-inner">
                                <div class="card-front">
                                    <div class="word-main" style="color: var(--danger); font-size: 3.5rem;">${sanitizeHTML(word.tu_vung)}</div>
                                    <button class="btn-audio play-audio-btn"><i class="fa-solid fa-volume-high"></i></button>
                                    ${item.type === 'review' ? '<p style="color:var(--warning); margin-top:20px; font-weight: bold;"><i class="fa-solid fa-triangle-exclamation"></i> Kiểm tra trí nhớ Cũ</p>' : '<p style="color:var(--primary); margin-top:20px; font-weight: bold;"><i class="fa-solid fa-gem"></i> Học Từ Mới</p>'}
                                </div>
                                <div class="card-back">
                                    <div style="display: flex; justify-content: space-between; width: 100%; align-items: flex-start; margin-bottom: 15px;">
                                        <h3 style="flex-grow: 1;">${sanitizeHTML(word.tu_vung)}</h3>
                                        <button class="btn-audio play-audio-btn" style="width: 40px; height: 40px; font-size: 1rem; flex-shrink: 0;"><i class="fa-solid fa-volume-high"></i></button>
                                    </div>
                                    <div class="word-meta">
                                        <span class="badge-pos">${sanitizeHTML(word.tu_loai || 'vocab')}</span>
                                        <span class="pronunciation">${sanitizeHTML(word.phien_am || '')}</span>
                                    </div>
                                    <div class="word-meaning">${sanitizeHTML(word.y_nghia)}</div>
                                    ${examplesHtml}
                                </div>
                            </div>
                        </div>
                        
                        <div class="controls" style="justify-content: space-around; gap: 20px;">
                            <button class="btn-mark-known btn-hc-fail" id="btnHcReject" style="flex:1; background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5;">
                                <i class="fa-solid fa-xmark"></i> Quên Chữ Này
                            </button>
                            
                            <button class="btn-mark-known btn-hc-pass" id="btnHcPass" style="flex:1; background: #dcfce7; color: #22c55e; border: 1px solid #86efac;">
                                <i class="fa-solid fa-check-double"></i> Đã Nhớ Rõ
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Right Sidebar -->
                <div class="hc-sidebar-right">
                    <!-- Timer Widget -->
                    <div class="hc-widget">
                        <div class="hc-widget-title"><i class="fa-solid fa-stopwatch"></i> Bấm giờ tập trung</div>
                        <div class="hc-timer-display" id="hcTimerDisplay">${formatTime(state.hcTimerValue)}</div>
                        
                        <div class="hc-timer-controls">
                            <button class="btn-timer" id="btnTimerPlayPause" title="Play/Pause">${playPauseIcon}</button>
                            <button class="btn-timer" id="btnTimerReset" title="Làm mới"><i class="fa-solid fa-rotate-right"></i></button>
                            <!-- Yêu cầu 1.2: Thêm nút Save -->
                            <button class="btn-timer" id="btnSaveHcProgress" title="Lưu tiến độ"><i class="fa-solid fa-floppy-disk"></i></button>
                        </div>
                        
                        <div class="hc-timer-setup">
                            Đếm ngược: <input type="number" id="hcTimerInput" value="${startValue}" min="1" max="120"> phút
                        </div>
                    </div>

                    <!-- Progress Map Widget -->
                    <div class="hc-widget">
                        <div class="hc-widget-title"><i class="fa-solid fa-map-location-dot"></i> Bản đồ tiến độ</div>
                        <div class="hc-map-grid">
                            ${mapHtml}
                        </div>
                        <div style="display:flex; justify-content: space-between; margin-top: 15px; font-size: 0.8rem; color: var(--text-secondary);">
                            <span style="display:flex; align-items:center; gap:5px;"><div class="hc-map-dot pass" style="width:12px; height:12px;"></div> Nhớ</span>
                            <span style="display:flex; align-items:center; gap:5px;"><div class="hc-map-dot fail" style="width:12px; height:12px;"></div> Quên</span>
                            <span style="display:flex; align-items:center; gap:5px;"><div class="hc-map-dot" style="width:12px; height:12px;"></div> Chờ</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const card = document.getElementById('flashcard');
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.play-audio-btn') && !e.target.closest('.btn-mark-known') && !e.target.closest('.btn-play-example')) {
                card.classList.toggle('is-flipped');
            }
        });

        document.querySelectorAll('.play-audio-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                playAudio(word.tu_vung.replace(/<[^>]+>/g, ''));
            });
        });

        document.querySelectorAll('.btn-play-example').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const textToPlay = decodeURIComponent(e.currentTarget.getAttribute('data-text'));
                const examplesContainer = e.currentTarget.closest('.examples');
                const enContainer = examplesContainer ? examplesContainer.querySelector('.example-en') : null;
                const ipaContainer = examplesContainer ? examplesContainer.querySelector('.example-ipa') : null;
                playAudio(textToPlay, enContainer, ipaContainer);
            });
        });

        document.getElementById('btnHcPass').addEventListener('click', () => {
            processSrs(item.key, true);
            item.sessionResult = 'pass';
            state.hardcoreIndex++;
            saveCurrentHardcoreSession();
            renderHardcoreFlashcard();
        });

        document.getElementById('btnHcReject').addEventListener('click', () => {
            processSrs(item.key, false);
            item.sessionResult = 'fail';
            state.hardcoreIndex++;
            saveCurrentHardcoreSession();
            renderHardcoreFlashcard();
        });

        // Timer Logic
        const btnTimerPlayPause = document.getElementById('btnTimerPlayPause');
        const btnTimerReset = document.getElementById('btnTimerReset');
        const hcTimerInput = document.getElementById('hcTimerInput');
        const hcTimerDisplay = document.getElementById('hcTimerDisplay');
        const updateTimerDisplay = () => { hcTimerDisplay.innerText = formatTime(state.hcTimerValue); };

        const btnSaveHcProgress = document.getElementById('btnSaveHcProgress');
        if (btnSaveHcProgress) {
            btnSaveHcProgress.addEventListener('click', () => {
                saveCurrentHardcoreSession();
                showToast('✅ Đã lưu tiến độ!', 'success');
            });
        }

        btnTimerPlayPause.addEventListener('click', () => {
            if (state.hcTimerIsRunning) {
                clearInterval(state.hcTimerInterval);
                state.hcTimerIsRunning = false;
                btnTimerPlayPause.innerHTML = '<i class="fa-solid fa-play" style="margin-left: 3px;"></i>';
            } else {
                state.hcTimerIsRunning = true;
                btnTimerPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';

                // If it's starting fresh and is down mode, fetch from input
                if (state.hcTimerValue === 0 && hcTimerInput.value > 0 && state.hcTimerMode === 'down') {
                    state.hcTimerValue = parseInt(hcTimerInput.value) * 60;
                    updateTimerDisplay();
                }

                state.hcTimerInterval = setInterval(() => {
                    if (state.hcTimerMode === 'down') {
                        if (state.hcTimerValue > 0) state.hcTimerValue--;
                    } else {
                        state.hcTimerValue++;
                    }
                    updateTimerDisplay();
                }, 1000);
            }
        });

        btnTimerReset.addEventListener('click', () => {
            clearInterval(state.hcTimerInterval);
            state.hcTimerIsRunning = false;
            btnTimerPlayPause.innerHTML = '<i class="fa-solid fa-play" style="margin-left: 3px;"></i>';
            const inputVal = parseInt(hcTimerInput.value);
            if (!isNaN(inputVal) && inputVal > 0) {
                state.hcTimerMode = 'down';
                state.hcTimerValue = inputVal * 60;
            } else {
                state.hcTimerMode = 'up';
                state.hcTimerValue = 0;
            }
            updateTimerDisplay();
        });

        hcTimerInput.addEventListener('change', (e) => {
            if (!state.hcTimerIsRunning) {
                const inputVal = parseInt(e.target.value);
                if (!isNaN(inputVal) && inputVal > 0) {
                    state.hcTimerMode = 'down';
                    state.hcTimerValue = inputVal * 60;
                } else {
                    state.hcTimerMode = 'up';
                    state.hcTimerValue = 0;
                }
                updateTimerDisplay();
            }
        });

        // If the user hasn't started the timer yet but it's first load, initialize state
        if (!state.hcTimerIsRunning && state.hcTimerValue === 0 && parseInt(hcTimerInput.value) > 0) {
            state.hcTimerValue = parseInt(hcTimerInput.value) * 60;
            updateTimerDisplay();
        }
    }

    function ensureTodayQueueExists() {
        const todayStr = getTodayStr();
        const plan = state.hardcorePlans[state.activePlanId];
        if (!plan) return;

        // migration: check if using old "categories" instead of "selectedAlbums"
        if (plan.categories && !plan.selectedAlbums) {
            console.log("Migrating old plan to new album-based system...");
            plan.selectedAlbums = plan.categories.flatMap(cat => (state.albums[cat] || []).map(alb => `${cat}|${alb}`));
            delete plan.categories;
        }

        if (plan.lastQueueDate === todayStr) {
            return; // Queue is up to date
        }

        // It's a new day. Reset session results from the previous day.
        if (plan.dailyChunks) {
            plan.dailyChunks.forEach(chunk => {
                if (chunk) chunk.forEach(item => {
                    if (item.sessionResult) delete item.sessionResult;
                });
            });
        }
        if (plan.queueReview) {
            plan.queueReview.forEach(item => {
                if (item.sessionResult) delete item.sessionResult;
            });
        }

        let poolReview = [];
        const nowTime = new Date().getTime();

        const catMap = {};
        if (plan.selectedAlbums) {
            plan.selectedAlbums.forEach(ak => {
                const parts = ak.split('|');
                if (parts.length < 2) return;
                const [c, a] = parts;
                if (!catMap[c]) catMap[c] = new Set();
                catMap[c].add(a);
            });
        }

        Object.keys(catMap).forEach(cat => {
            if (!BJT_DATA[cat]) return;
            BJT_DATA[cat].forEach(w => {
                if (!catMap[cat].has(w._album)) return;

                const key = getWordKey(cat, w._album, w.tu_vung);
                const stat = state.wordStats[key];

                if (stat && stat.status === 1) {
                    if (stat.nextDate <= nowTime) {
                        poolReview.push({ wordObj: w, key: key, cat: cat, album: w._album, type: 'review' });
                    }
                }
            });
        });

        plan.queueReview = poolReview;
        plan.lastQueueDate = todayStr;

        savePlans();
    }

    function bindEvents() {
        // Hardcore bindings
        const btnHardcoreNav = document.getElementById('btnHardcoreNav');
        if (btnHardcoreNav) btnHardcoreNav.addEventListener('click', openHardcoreMode);

        const btnCloseWizard = document.getElementById('btnCloseWizard');
        if (btnCloseWizard) btnCloseWizard.addEventListener('click', () => document.getElementById('wizardModal').classList.remove('open'));

        const btnGeneratePlan = document.getElementById('btnGeneratePlan');
        if (btnGeneratePlan) btnGeneratePlan.addEventListener('click', generatePlan);

        els.searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            renderAlbumGrid();
        });

        els.btnFlashcard.addEventListener('click', () => {
            els.btnFlashcard.classList.add('active');
            els.btnList.classList.remove('active');
            state.currentLearningMode = 'flashcard';
            if (state.words.length > 0) renderLearningContent();
        });

        els.btnList.addEventListener('click', () => {
            els.btnList.classList.add('active');
            els.btnFlashcard.classList.remove('active');
            state.currentLearningMode = 'list';
            if (state.words.length > 0) renderLearningContent();
        });

        els.btnBack.addEventListener('click', () => {
            if (state.currentMainView === 'hardcore_learning') {
                // Không xóa session khi quay lại, để người dùng có thể học tiếp
                switchMainView('hardcore');
            } else {
                clearSession();
                switchMainView('dashboard');
            }
        });

        // Top tab scrolling
        const btnLeft = document.querySelector('.scroll-left');
        const btnRight = document.querySelector('.scroll-right');

        if (btnLeft && btnRight && els.navTabs) {
            // Simple check if overflow
            const checkScroll = () => {
                if (els.navTabs.scrollWidth > els.navTabs.clientWidth) {
                    btnLeft.style.display = 'block';
                    btnRight.style.display = 'block';
                } else {
                    btnLeft.style.display = 'none';
                    btnRight.style.display = 'none';
                }
            };
            window.addEventListener('resize', checkScroll);
            checkScroll();

            btnLeft.addEventListener('click', () => {
                els.navTabs.scrollBy({ left: -200, behavior: 'smooth' });
            });
            btnRight.addEventListener('click', () => {
                els.navTabs.scrollBy({ left: 200, behavior: 'smooth' });
            });
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            // Ignore if in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const key = e.key.toLowerCase();

            if (state.currentMainView === 'learning' || state.currentMainView === 'hardcore_learning') {
                // Audio Hotkeys
                if (key === state.hotkeyVocab) {
                    const btnAudio = els.learningView.querySelector('.play-audio-btn');
                    if (btnAudio) btnAudio.click();
                } else if (key === state.hotkeyExample) {
                    const btnExample = els.learningView.querySelector('.btn-play-example');
                    if (btnExample) btnExample.click();
                }

                // Hardcore Shortcuts
                if (state.currentMainView === 'hardcore_learning') {
                    if (e.key === 'ArrowRight' && state.hardcoreIndex < state.hardcoreSession.length - 1) {
                        state.hardcoreIndex++;
                        saveCurrentHardcoreSession(); // Auto-save
                        renderHardcoreFlashcard();
                    } else if (e.key === 'ArrowLeft' && state.hardcoreIndex > 0) {
                        state.hardcoreIndex--;
                        saveCurrentHardcoreSession(); // Auto-save
                        renderHardcoreFlashcard();
                    } else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const card = document.getElementById('flashcard');
                        if (card) card.classList.toggle('is-flipped');
                    }
                    return;
                }
            }

            if (state.currentMainView !== 'learning' || state.words.length === 0) return;
            if (state.currentLearningMode !== 'flashcard') return;

            if (e.key === 'ArrowRight' && state.currentIndex < state.words.length - 1) {
                state.currentIndex++;
                saveSession();
                renderLearningContent();
            } else if (e.key === 'ArrowLeft' && state.currentIndex > 0) {
                state.currentIndex--;
                saveSession();
                renderLearningContent();
            } else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault(); // prevent scroll
                const card = document.getElementById('flashcard');
                if (card) card.classList.toggle('is-flipped');
            }
        });
    }
    
    function generateTodayQueue() {
        ensureTodayQueueExists();
        renderHardcoreDashboard();
    }

    function renderPlanManager() {
        const hcDash = document.getElementById('hardcoreDashboard');
        if (!hcDash) return;

        switchMainView('hardcore');

        let plansHtml = `
            <div class="hc-header" style="margin-bottom: 30px;">
                <h2 style="font-size: 1.8rem;"><i class="fa-solid fa-layer-group"></i> Kho Lộ trình</h2>
                <button class="btn-hardcore-start" id="btnAddNewPlan" style="width: auto; padding: 12px 25px; font-size: 1rem; margin: 0;">
                    <i class="fa-solid fa-plus-circle"></i> Tạo Lộ trình Mới
                </button>
            </div>
            <div class="plan-list-container">
        `;

        const planIds = Object.keys(state.hardcorePlans);
        if (planIds.length === 0) {
            plansHtml += `
                <div style="grid-column: 1/-1; text-align:center; padding: 60px; background: var(--glass-bg); border-radius: 20px; border: 2px dashed var(--glass-border);">
                    <i class="fa-solid fa-clipboard-list" style="font-size: 4rem; color: var(--glass-border); margin-bottom: 20px;"></i>
                    <p style="color:var(--text-secondary); font-size: 1.1rem;">Bạn chưa có lộ trình học tập nào.<br>Hãy bắt đầu bằng cách tạo một lộ trình "Khô Máu" để chinh phục mục tiêu!</p>
                </div>`;
        } else {
            planIds.forEach(id => {
                const plan = state.hardcorePlans[id];
                const isActive = (id === state.activePlanId);

                // Calculate total progress
                let totalWords = 0;
                let doneWords = 0;
                if (plan.dailyChunks) {
                    plan.dailyChunks.forEach(chunk => {
                        totalWords += chunk.length;
                        doneWords += chunk.filter(w => w.sessionResult === 'pass').length;
                    });
                }
                const progress = totalWords > 0 ? Math.round((doneWords / totalWords) * 100) : 0;
                const albumCount = plan.selectedAlbums ? plan.selectedAlbums.length : (plan.categories ? plan.categories.length : 0);

                plansHtml += `
                    <div class="plan-item ${isActive ? 'active' : ''}">
                        <div class="plan-info">
                            <div class="plan-name">
                                ${plan.name} 
                                ${isActive ? '<span class="badge-active"><i class="fa-solid fa-play"></i> Đang học</span>' : ''}
                            </div>
                            <div class="plan-meta">
                                <span><i class="fa-solid fa-calendar-check"></i> <strong>${plan.targetDays}</strong> ngày</span> • 
                                <span><i class="fa-solid fa-book-bookmark"></i> <strong>${albumCount}</strong> album mục tiêu</span>
                            </div>
                            <div class="plan-progress-container">
                                <div class="plan-progress-bar"><div class="plan-progress-fill" style="width: ${progress}%"></div></div>
                                <span class="plan-progress-text">${progress}% Hoàn thành</span>
                            </div>
                        </div>
                        <div class="plan-actions">
                            ${isActive ?
                        `<button class="btn-plan-select disabled" disabled><i class="fa-solid fa-check"></i> Đang chọn</button>` :
                        `<button class="btn-plan-select" onclick="window.setActivePlan('${id}')"><i class="fa-solid fa-rocket"></i> Chọn học</button>`
                    }
                            <button class="btn-plan-delete" onclick="window.deletePlan('${id}')" title="Xóa lộ trình vĩnh viễn"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                `;
            });
        }

        plansHtml += `</div>`;
        hcDash.innerHTML = plansHtml;

        const btnAdd = document.getElementById('btnAddNewPlan');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => {
                populateWizardCategories();
                document.getElementById('wizardModal').classList.add('open');
            });
        }
    }

    window.setActivePlan = function (id) {
        state.activePlanId = id;
        savePlans();
        openHardcoreMode();
    };

    window.deletePlan = function (id) {
        const plan = state.hardcorePlans[id];
        if (confirm(`Bạn có chắc chắn muốn XÓA lộ trình "${plan.name}" không?`)) {
            delete state.hardcorePlans[id];
            if (state.activePlanId === id) state.activePlanId = null;
            savePlans();
            renderPlanManager();
        }
    };

    // ── xlsx Vocabulary Update Feature (using SheetJS) ──
    function applyNewData(newData) {
        // Merge into BJT_DATA
        Object.keys(newData).forEach(cat => { BJT_DATA[cat] = newData[cat]; });

        // Save override to localStorage
        try {
            localStorage.setItem('BJT_CSV_OVERRIDE', JSON.stringify(newData));
        } catch(e) {
            // Data too large for localStorage — store key list only as a flag
            localStorage.setItem('BJT_CSV_OVERRIDE', '"__large_dataset__"');
        }

        // Re-sync state
        state.categories = Object.keys(BJT_DATA);
        state.categories.forEach(cat => {
            if (!BJT_DATA[cat]) return;
            const albumSet = new Set();
            if (Array.isArray(BJT_DATA[cat])) {
                BJT_DATA[cat].forEach(w => { if (w._album) albumSet.add(w._album); });
            }
            state.albums[cat] = Array.from(albumSet);
        });
        state.categories = state.categories.filter(cat => state.albums[cat] && state.albums[cat].length > 0);

        // Refresh UI
        document.getElementById('settingsModal').classList.remove('open');
        renderTopNav();
        if (state.currentMainView === 'learning') {
            clearSession();
            switchMainView('dashboard');
        } else {
            switchMainView(state.currentMainView || 'dashboard');
        }
    }

    function handleXlsxUpdate(file) {
        if (!file) return;

        // Check SheetJS available
        if (typeof XLSX === 'undefined') {
            showToast('❌ Thư viện SheetJS chưa tải xong. Vui lòng thử lại sau vài giây.', 'error');
            return;
        }

        // Show progress UI
        const progressWrap = document.getElementById('xlsxProgressWrap');
        const progressBar  = document.getElementById('xlsxProgressBar');
        const progressLabel= document.getElementById('xlsxProgressLabel');
        const statusEl     = document.getElementById('xlsxStatusText');
        if (progressWrap) progressWrap.style.display = 'block';
        if (progressBar)  progressBar.style.width = '10%';
        if (progressLabel) progressLabel.textContent = 'Đang đọc file...';
        
        // Create a lookup map for existing phien_am to preserve it
        const phienAmMap = new Map();
        Object.values(BJT_DATA).flat().forEach(word => {
            if (word.tu_vung && word.phien_am) {
                // Use the plain text version of the word as the key
                const plainTuVung = String(word.tu_vung).replace(/<[^>]+>/g, '').trim();
                if (!phienAmMap.has(plainTuVung)) {
                    phienAmMap.set(plainTuVung, word.phien_am);
                }
            }
        });


        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (progressBar)  progressBar.style.width = '30%';
                if (progressLabel) progressLabel.textContent = 'Đang parse Excel...';

                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', codepage: 65001 });

                const TARGET_GROUPS = workbook.SheetNames.filter(name => name.toLowerCase().startsWith('group'));
                const WORDS_PER_DAY = 30;
                const newData = {};
                let totalCount = 0;
                let processed = 0;

                for (const groupName of TARGET_GROUPS) {

                    if (progressBar)  progressBar.style.width = `${30 + (processed / TARGET_GROUPS.length) * 60}%`;
                    if (progressLabel) progressLabel.textContent = `Đang xử lý ${groupName}...`;

                    const sheet = workbook.Sheets[groupName];
                    // Convert to array-of-arrays to find headers manually (column names vary)
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                    if (rows.length < 2) { processed++; continue; }

                    // First row = headers
                    const headers = rows[0].map(h => String(h).toLowerCase().trim());

                    // Find column indices (flexible: handles "Nghĩa (VN)" vs "Nghĩa(VN)" etc.)
                    const findCol = (...keywords) => {
                        for (const kw of keywords) {
                            const idx = headers.findIndex(h => h.includes(kw));
                            if (idx !== -1) return idx;
                        }
                        return -1;
                    };

                    const colWord  = findCol('từ vựng', 'tu vung', 'vocab', 'word', '言葉', '言語');
                    const colFuri  = findCol('furigana', 'phien am', 'phien_am');
                    const colMean  = findCol('nghĩa', 'y_nghia', 'nghia', 'meaning', '意味');
                    const colEx    = findCol('ví dụ', 'vi du', 'example', '例文', '使い方', '使い方');

                    if (colWord === -1) { processed++; continue; } // skip sheet with no vocab column

                    newData[groupName] = [];
                    let currentDay  = 1;
                    let dayCount    = 0;

                    for (let r = 1; r < rows.length; r++) {
                        const row   = rows[r];
                        const word  = String(row[colWord] ?? '').trim();
                        if (!word || word === '' || word.toLowerCase() === 'nan') continue;

                        const furiganaFromExcel = colFuri !== -1 ? String(row[colFuri] ?? '').trim() : '';
                        const meaning = colMean !== -1 ? String(row[colMean] ?? '').trim() : '';
                        const rawEx   = colEx   !== -1 ? String(row[colEx]   ?? '').trim() : '';

                        const phienAm = furiganaFromExcel || phienAmMap.get(word) || '';

                        // Build song_ngu pair (JP + VI)
                        let exJP = '', exVI = '';
                        if (rawEx && rawEx !== 'nan') {
                            // Excel cells sometimes have \n separating JP and VI lines
                            const parts = rawEx.split(/\n|\r\n|\r/);
                            exJP = parts[0].trim();
                            exVI = parts.length > 1 ? parts.slice(1).join(' ').trim() : '';
                            // If no VI part, use meaning as the translation
                            if (!exVI) exVI = meaning;
                        }

                        const albumName = `Day ${currentDay}`;

                        newData[groupName].push({
                            _album:    albumName,
                            tu_vung:   word,
                            phien_am:  phienAm,
                            tu_loai:   'BJT',
                            y_nghia:   meaning,
                            song_ngu:  exJP ? [exJP, exVI] : []
                        });

                        dayCount++;
                        if (dayCount >= WORDS_PER_DAY) {
                            dayCount = 0;
                            currentDay++;
                        }
                    }

                    totalCount += newData[groupName].length;
                    processed++;
                }

                if (totalCount === 0) throw new Error('Không đọc được từ nào. Hãy kiểm tra file có các sheet tên "Group X" không.');

                if (progressBar)  progressBar.style.width = '95%';
                if (progressLabel) progressLabel.textContent = 'Đang lưu dữ liệu...';

                applyNewData(newData);

                if (progressBar)  progressBar.style.width = '100%';
                if (progressWrap) setTimeout(() => { progressWrap.style.display = 'none'; }, 1500);
                if (statusEl) statusEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#22c55e;"></i> Đang dùng dữ liệu từ file xlsx đã upload (${totalCount} từ).`;

                showToast(`✅ Cập nhật thành công ${totalCount} từ vựng từ ${file.name}!`, 'success');

            } catch(err) {
                if (progressWrap) progressWrap.style.display = 'none';
                showToast(`❌ Lỗi parse xlsx: ${err.message}`, 'error');
                console.error(err);
            }
        };
        reader.onerror = () => {
            if (progressWrap) progressWrap.style.display = 'none';
            showToast('❌ Không đọc được file. Vui lòng thử lại.', 'error');
        };
        reader.readAsArrayBuffer(file);
    }

    function showToast(message, type) {
        let toast = document.getElementById('bjtToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'bjtToast';
            document.body.appendChild(toast);
        }
        toast.className = `bjt-toast ${type || ''}`;
        toast.innerHTML = message;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 4000);
    }

    // ── Restore session after init ──
    function restoreSession() {
        try {
            const saved = localStorage.getItem('BJT_SESSION');
            if (!saved) return;
            const { category, album, index, mode } = JSON.parse(saved);
            if (!category || !album) return;
            if (!BJT_DATA[category]) return;
            const wordsInAlbum = BJT_DATA[category].filter(w => w._album === album);
            if (wordsInAlbum.length === 0) return;

            // Valid session found — restore
            state.currentLearningMode = mode || 'flashcard';
            if (mode === 'list') {
                els.btnList.classList.add('active');
                els.btnFlashcard.classList.remove('active');
            } else {
                els.btnFlashcard.classList.add('active');
                els.btnList.classList.remove('active');
            }
            loadAlbum(category, album, index);
        } catch(e) { console.warn('Session restore failed', e); }
    }

    init();
    restoreSession();
});

// ── Toast CSS injected dynamically ──
(function() {
    const style = document.createElement('style');
    style.textContent = `
        .bjt-toast {
            display: none;
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: #1e293b;
            color: #f8fafc;
            padding: 14px 28px;
            border-radius: 12px;
            font-size: 0.95rem;
            font-family: 'Inter', sans-serif;
            box-shadow: 0 8px 32px rgba(0,0,0,0.35);
            z-index: 99999;
            animation: toastIn 0.3s ease;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .bjt-toast.success { border-color: #22c55e; background: #052e16; color: #4ade80; }
        .bjt-toast.error   { border-color: #ef4444; background: #2d0a0a; color: #f87171; }
        @keyframes toastIn {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    document.head.appendChild(style);
})();
