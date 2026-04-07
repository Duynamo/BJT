    function getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    function openHardcoreMode() {
        const plan = state.hardcorePlans[state.activePlanId];
        if (!plan) {
            if (Object.keys(state.hardcorePlans).length > 0) {
                renderPlanManager();
            } else {
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
        const planName = document.getElementById('inputPlanName').value.trim() || `LềEtrình ${Object.keys(state.hardcorePlans).length + 1}`;

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
            alert("Các album bạn chọn đã được học hết rồi! Vui lòng chọn nội dung khác.");
            return;
        }

        // Tự động xáo trộn đềEhọc xen kẽ
        poolNew.sort(() => Math.random() - 0.5);

        // Tách rềEtừ mới theo targetDays
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
        if (!plan) {
            openHardcoreMode();
            return;
        }

        const hcDash = document.getElementById('hardcoreDashboard');
        const currentChunk = plan.dailyChunks[plan.activeDay - 1] || [];

        let listHtml = '<div class="list-container hc-scroll-list" style="margin-top: 30px;">';

        const allItems = [...plan.queueReview, ...currentChunk];

        if (allItems.length === 0) {
            listHtml += '<div style="text-align:center; padding: 40px; color: var(--text-secondary);">Trống trơn! Nhấn Đổi LềETrình.</div>';
        } else {
            allItems.forEach((item) => {
                const word = item.wordObj;
                let statusBadge = '<span class="badge-pos" style="background:var(--glass-border); color:var(--text-secondary);"><i class="fa-solid fa-hourglass"></i> ChềEHọc</span>';
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
            btnHtml = `<button class="btn-hardcore-start" style="background: var(--success); cursor: default; margin-bottom:15px;">Hoàn Thành LềETrình Lần Này <i class="fa-solid fa-check-double"></i></button>
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
                <h2>LềETrình: ${plan.name} 🔥</h2>
                <div style="display:flex; gap:10px;">
                    <button class="btn-primary" id="btnSwitchPlan"><i class="fa-solid fa-rotate"></i> Đổi LềETrình</button>
                    <button class="btn-primary" id="btnEditPlan" style="background:var(--danger); color:white;"><i class="fa-solid fa-trash"></i> Xóa LềETrình</button>
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
            if (confirm(`Bạn có chắc chắn muốn XÓA lềEtrình "${plan.name}" không?`)) {
                delete state.hardcorePlans[state.activePlanId];
                state.activePlanId = null;
                savePlans();
                openHardcoreMode();
            }
        });

        const startBtn = hcDash.querySelector('#btnStartHardcoreSession');
        if (startBtn) startBtn.addEventListener('click', startHardcoreSession);

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

        if (!confirm("Tuyệt vời! Bạn có muốn nhảy ngay sang ngày tiếp theo (Day " + (plan.activeDay + 1) + ") trong LềEtrình không?")) return;

        if (plan.activeDay >= plan.targetDays) {
            alert("Bạn đã ềEngày cuối cùng của LềEtrình rồi!");
            return;
        }

        plan.activeDay++;
        savePlans();
        renderHardcoreDashboard();
    }

    function startHardcoreSession() {
        const plan = state.hardcorePlans[state.activePlanId];
        if (!plan) return;

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
        const plan = state.hardcorePlans[state.activePlanId];
        if (!plan || !state.hardcoreSession || state.hardcoreIndex >= state.hardcoreSession.length) {
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
                    <div class="hc-widget-title"><i class="fa-solid fa-calendar-days"></i> LềEtrình (${plan.targetDays} Ngày)</div>
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
                                    ${item.type === 'review' ? '<p style="color:var(--warning); margin-top:20px; font-weight: bold;"><i class="fa-solid fa-triangle-exclamation"></i> Kiểm tra trí nhềECũ</p>' : '<p style="color:var(--primary); margin-top:20px; font-weight: bold;"><i class="fa-solid fa-gem"></i> Học Từ Mới</p>'}
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
                                <i class="fa-solid fa-check-double"></i> Đã NhềERõ
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Right Sidebar -->
                <div class="hc-sidebar-right">
                    <!-- Timer Widget -->
                    <div class="hc-widget">
                        <div class="hc-widget-title"><i class="fa-solid fa-stopwatch"></i> Bấm giềEtập trung</div>
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
                        <div class="hc-widget-title"><i class="fa-solid fa-map-location-dot"></i> Bản đềEtiến đềE/div>
                        <div class="hc-map-grid">
                            ${mapHtml}
                        </div>
                        <div style="display:flex; justify-content: space-between; margin-top: 15px; font-size: 0.8rem; color: var(--text-secondary);">
                            <span style="display:flex; align-items:center; gap:5px;"><div class="hc-map-dot pass" style="width:12px; height:12px;"></div> NhềE/span>
                            <span style="display:flex; align-items:center; gap:5px;"><div class="hc-map-dot fail" style="width:12px; height:12px;"></div> Quên</span>
                            <span style="display:flex; align-items:center; gap:5px;"><div class="hc-map-dot" style="width:12px; height:12px;"></div> ChềE/span>
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
            savePlans();
            state.hardcoreIndex++;
            renderHardcoreFlashcard();
            // update dashboard background cache optionally
            renderHardcoreDashboard();
        });

        document.getElementById('btnHcReject').addEventListener('click', () => {
            processSrs(item.key, false);
            item.sessionResult = 'fail';
            savePlans();
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

    function renderPlanManager() {
        const hcDash = document.getElementById('hardcoreDashboard');
        if (!hcDash) return;

        switchMainView('hardcore');

        let plansHtml = `
            <div class="hc-header" style="margin-bottom: 30px;">
                <h2 style="font-size: 1.8rem;"><i class="fa-solid fa-layer-group"></i> Kho LềETrình</h2>
                <button class="btn-hardcore-start" id="btnAddNewPlan" style="width: auto; padding: 12px 25px; font-size: 1rem; margin: 0;">
                    <i class="fa-solid fa-plus-circle"></i> Tạo LềETrình Mới
                </button>
            </div>
            <div class="plan-list-container">
        `;

        const planIds = Object.keys(state.hardcorePlans);
        if (planIds.length === 0) {
            plansHtml += `
                <div style="grid-column: 1/-1; text-align:center; padding: 60px; background: var(--glass-bg); border-radius: 20px; border: 2px dashed var(--glass-border);">
                    <i class="fa-solid fa-clipboard-list" style="font-size: 4rem; color: var(--glass-border); margin-bottom: 20px;"></i>
                    <p style="color:var(--text-secondary); font-size: 1.1rem;">Bạn chưa có lềEtrình học tập nào.<br>Hãy bắt đầu bằng cách tạo một lềEtrình "Khô Máu" đềEchinh phục mục tiêu!</p>
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
                            <button class="btn-plan-delete" onclick="window.deletePlan('${id}')" title="Xóa lềEtrình vĩnh viềE"><i class="fa-solid fa-trash-can"></i></button>
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
        if (confirm(`Bạn có chắc chắn muốn XÓA lềEtrình "${plan.name}" không?`)) {
            delete state.hardcorePlans[id];
            if (state.activePlanId === id) state.activePlanId = null;
            savePlans();
            renderPlanManager();
        }
    };

    init();
});
