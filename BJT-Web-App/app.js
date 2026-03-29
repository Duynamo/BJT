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
        hardcorePlan: null, // { categories: [], targetDays: 30, startDate: ts, lastQueueDate: ts, queue: [], doneToday: 0 }
        // New timer state
        hcTimerValue: 0,
        hcTimerInterval: null,
        hcTimerIsRunning: false,
        hcTimerMode: 'down' // up or down
    };

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

        const storedPlan = localStorage.getItem('BJT_HARDCORE_PLAN');
        if (storedPlan) {
            state.hardcorePlan = JSON.parse(storedPlan);
        }
    } catch (e) {
        console.warn("Could not load progress", e);
    }

    function saveStats() {
        try { localStorage.setItem('BJT_WORD_STATS', JSON.stringify(state.wordStats)); } catch (e) {}
    }

    function savePlan() {
        try { localStorage.setItem('BJT_HARDCORE_PLAN', JSON.stringify(state.hardcorePlan)); } catch (e) {}
    }

    function saveProgress() {
        try {
            localStorage.setItem('BJT_KNOWN_WORDS', JSON.stringify(Array.from(state.knownWords)));
            saveStats(); // Sync stats too
        } catch (e) {
             console.warn("Could not save progress", e);
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

    function loadAlbum(category, albumName) {
        state.currentCategory = category;
        state.currentAlbum = albumName;
        state.words = BJT_DATA[category].filter(w => w._album === albumName);
        state.currentIndex = 0;
        
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
                renderLearningContent();
            }
        });

        btnNext.addEventListener('click', () => {
             if (state.currentIndex < state.words.length - 1) {
                state.currentIndex++;
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
        return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    }

    function openHardcoreMode() {
        if (!state.hardcorePlan) {
            populateWizardCategories();
            document.getElementById('wizardModal').classList.add('open');
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
            const label = document.createElement('label');
            label.className = 'cat-cb-item';
            label.innerHTML = `<input type="checkbox" value="${cat}" checked> ${cat.replace(/_/g, ' ')} (${BJT_DATA[cat].length} từ)`;
            container.appendChild(label);
        });
    }

    function generatePlan() {
        const selected = Array.from(document.querySelectorAll('#wizardCategories input:checked')).map(cb => cb.value);
        const days = parseInt(document.getElementById('inputTargetDays').value) || 30;
        
        if (selected.length === 0) {
            alert("Vui lòng chọn ít nhất 1 bộ từ vựng!"); return;
        }

        let poolNew = [];
        selected.forEach(cat => {
            BJT_DATA[cat].forEach(w => {
                const key = getWordKey(cat, w._album, w.tu_vung);
                const stat = state.wordStats[key];
                if (!stat || stat.status === 0 || stat.status === undefined) {
                    poolNew.push({ wordObj: w, key: key, cat: cat, type: 'new' });
                }
            });
        });

        // Tách rổ từ mới theo targetDays
        const chunks = [];
        let wpd = Math.ceil(poolNew.length / days);
        if (wpd === 0) wpd = 10;
        for (let i = 0; i < days; i++) {
            chunks.push(poolNew.slice(i * wpd, (i + 1) * wpd));
        }
        
        state.hardcorePlan = {
            categories: selected,
            targetDays: days,
            startDate: getTodayStr(),
            lastQueueDate: null,
            dailyChunks: chunks,
            queueReview: [],
            activeDay: 1
        };
        savePlan();
        document.getElementById('wizardModal').classList.remove('open');
        openHardcoreMode();
    }

    window.switchToDay = function(dayNum) {
        if (!state.hardcorePlan) return;
        if (state.hardcorePlan.activeDay === dayNum) return;
        
        state.hardcorePlan.activeDay = dayNum;
        savePlan();
        switchMainView('hardcore');
    };

    function generateTodayQueue() {
        const todayStr = getTodayStr();
        const plan = state.hardcorePlan;
        
        // backward compatibility for old structural objects
        if (!plan.dailyChunks) {
            alert("Hệ thống Lộ trình vừa được Nâng Cấp lớn (Version 3.0), bài học cũ của bạn sẽ được thiết lập lại. Bạn vui lòng tạo lại Khởi động Lộ trình mới nhé!");
            state.hardcorePlan = null;
            savePlan();
            openHardcoreMode();
            return;
        }

        if (plan.lastQueueDate === todayStr) {
            renderHardcoreDashboard();
            return;
        }
        
        let poolReview = [];
        const nowTime = new Date().getTime();
        
        plan.categories.forEach(cat => {
            BJT_DATA[cat].forEach(w => {
                const key = getWordKey(cat, w._album, w.tu_vung);
                const stat = state.wordStats[key];
                
                if (stat && stat.status === 1) {
                    if (stat.nextDate <= nowTime) {
                         poolReview.push({ wordObj: w, key: key, cat: cat, type: 'review' });
                    }
                }
            });
        });
        
        plan.queueReview = poolReview;
        plan.lastQueueDate = todayStr;
        
        savePlan();
        renderHardcoreDashboard();
    }

    function renderHardcoreDashboard() {
        const plan = state.hardcorePlan;
        if (!plan) return;
        
        const hcDash = document.getElementById('hardcoreDashboard');
        const currentChunk = plan.dailyChunks[plan.activeDay - 1] || [];
        
        let listHtml = '<div class="list-container hc-scroll-list" style="margin-top: 30px;">';
        
        const allItems = [...plan.queueReview, ...currentChunk];
        
        if (allItems.length === 0) {
            listHtml += '<div style="text-align:center; padding: 40px; color: var(--text-secondary);">Trống trơn! Nhấn Đổi Kế Hoạch.</div>';
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
            btnHtml = `<button class="btn-hardcore-start" style="background: var(--success); cursor: default; margin-bottom:15px;">Hoàn Thành Lộ Trình Lần Này <i class="fa-solid fa-check-double"></i></button>
                       <br/><button class="btn-primary" id="btnAdvanceSession" style="background: var(--warning); color: #000;"><i class="fa-solid fa-forward-step"></i> Học Vượt (Qua Ngày Tiếp Theo)</button>`;
        } else {
            btnHtml = `<button class="btn-hardcore-start" id="btnStartHardcoreSession">BẮT ĐẦU CHIẾN ĐẤU (${totalRemaining} Từ) <i class="fa-solid fa-rocket"></i></button>`;
        }
        
        let daysHtml = `<div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; justify-content: center;">`;
        for(let i=1; i<=plan.targetDays; i++) {
            const isAct = (i === plan.activeDay);
            daysHtml += `<button class="btn-primary" onclick="window.switchToDay(${i})" style="padding: 8px 15px; font-weight: bold; background: ${isAct ? 'var(--primary)' : 'var(--glass-bg)'}; color: ${isAct ? '#fff' : 'var(--text-main)'}; border: 1px solid ${isAct ? 'var(--primary)' : 'var(--glass-border)'};"><i class="fa-solid fa-${isAct?'fire':'calendar-day'}"></i> Day ${i}</button>`;
        }
        daysHtml += `</div>`;
            
        hcDash.innerHTML = `
            <div class="hc-header">
                <h2>Lộ Trình 🔥 Chọn Phiên Học Nhánh Nhanh</h2>
                <button class="btn-primary" id="btnEditPlan"><i class="fa-solid fa-pen"></i> Đổi Lộ Trình</button>
            </div>
            ${daysHtml}
            <div style="text-align: center; margin: 30px 0;">
                ${btnHtml}
            </div>
            
            ${listHtml}
        `;
        
        const btnEdit = document.getElementById('btnEditPlan');
        if (btnEdit) {
            btnEdit.addEventListener('click', () => {
                populateWizardCategories();
                document.getElementById('wizardModal').classList.add('open');
            });
        }
        
        const btnStart = document.getElementById('btnStartHardcoreSession');
        if (btnStart) {
            btnStart.addEventListener('click', startHardcoreSession);
        }
        
        const btnAdvance = document.getElementById('btnAdvanceSession');
        if (btnAdvance) {
            btnAdvance.addEventListener('click', advanceToNextSession);
        }
        
        document.querySelectorAll('.hc-dash-audio').forEach(btn => {
            btn.addEventListener('click', (e) => {
                playAudio(e.currentTarget.getAttribute('data-word'));
            });
        });
    }

    function advanceToNextSession() {
        if (!confirm("Tuyệt vời! Bạn có muốn nhảy ngay sang ngày tiếp theo (Day " + (state.hardcorePlan.activeDay + 1) + ") trong Lộ trình không?")) return;
        
        if (state.hardcorePlan.activeDay >= state.hardcorePlan.targetDays) {
            alert("Bạn đã ở ngày cuối cùng của Lộ trình rồi!");
            return;
        }
        
        state.hardcorePlan.activeDay++;
        savePlan();
        renderHardcoreDashboard();
    }

    function startHardcoreSession() {
        const plan = state.hardcorePlan;
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
        if (!state.hardcoreSession || state.hardcoreIndex >= state.hardcoreSession.length) {
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
        const currentDay = state.hardcorePlan.activeDay;
        for (let i = 1; i <= state.hardcorePlan.targetDays; i++) {
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
            if(totalSeconds < 0) totalSeconds = 0;
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
                    <div class="hc-widget-title"><i class="fa-solid fa-calendar-days"></i> Lộ trình (${state.hardcorePlan.targetDays} Ngày)</div>
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
             savePlan();
             state.hardcoreIndex++;
             renderHardcoreFlashcard();
             // update dashboard background cache optionally
             renderHardcoreDashboard();
        });
        
        document.getElementById('btnHcReject').addEventListener('click', () => {
             processSrs(item.key, false);
             item.sessionResult = 'fail';
             savePlan();
             state.hardcoreIndex++;
             renderHardcoreFlashcard();
             renderHardcoreDashboard();
        });
        
        // Timer Logic
        const btnTimerPlayPause = document.getElementById('btnTimerPlayPause');
        const btnTimerReset = document.getElementById('btnTimerReset');
        const hcTimerInput = document.getElementById('hcTimerInput');
        const hcTimerDisplay = document.getElementById('hcTimerDisplay');

        const updateTimerDisplay = () => { hcTimerDisplay.innerText = formatTime(state.hcTimerValue); };

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

    function bindEvents() {
        // Hardcore bindings
        const btnHardcoreNav = document.getElementById('btnHardcoreNav');
        if (btnHardcoreNav) btnHardcoreNav.addEventListener('click', openHardcoreMode);
        
        const btnCloseWizard = document.getElementById('btnCloseWizard');
        if (btnCloseWizard) btnCloseWizard.addEventListener('click', () => document.getElementById('wizardModal').classList.remove('open'));
        
        const btnGeneratePlan = document.getElementById('btnGeneratePlan');
        if (btnGeneratePlan) btnGeneratePlan.addEventListener('click', generatePlan);
        
        const btnEditPlan = document.getElementById('btnEditPlan');
        if (btnEditPlan) btnEditPlan.addEventListener('click', () => {
            populateWizardCategories();
            document.getElementById('wizardModal').classList.add('open');
        });
        
        const btnStartHc = document.getElementById('btnStartHardcoreSession');
        if (btnStartHc) btnStartHc.addEventListener('click', startHardcoreSession);

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
            switchMainView('dashboard');
        });

        // Top tab scrolling
        const btnLeft = document.querySelector('.scroll-left');
        const btnRight = document.querySelector('.scroll-right');
        
        if (btnLeft && btnRight && els.navTabs) {
            // Simple check if overflow
            const checkScroll = () => {
                if(els.navTabs.scrollWidth > els.navTabs.clientWidth) {
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
                        renderHardcoreFlashcard();
                    } else if (e.key === 'ArrowLeft' && state.hardcoreIndex > 0) {
                        state.hardcoreIndex--;
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
                renderLearningContent();
            } else if (e.key === 'ArrowLeft' && state.currentIndex > 0) {
                state.currentIndex--;
                renderLearningContent();
            } else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault(); // prevent scroll
                const card = document.getElementById('flashcard');
                if (card) card.classList.toggle('is-flipped');
            }
        });
    }

    init();
});
