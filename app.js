let userData = JSON.parse(localStorage.getItem('spellMasterData')) || {
    xp: 0, streak: 0, lastPlayedDate: null, totalAttempts: 0, correctAttempts: 0,
    wordStats: {}, theme: 'dark'
};

let wordsData = [];
let currentWord = null;
let lastWordId = null;

let appState = 'TYPING'; 
let inputCooldown = false; // 🛡️ COOLDOWN LOCK TO PREVENT DOUBLE FIRES
let currentCombo = 0;
let gameMode = 'classic';
let practiceTarget = 'mix';
let currentCategory = 'All';

const els = {
    streak: document.getElementById('streak-count'), xp: document.getElementById('xp-count'),
    themeToggle: document.getElementById('theme-toggle'), resetBtn: document.getElementById('reset-btn'),
    statPracticed: document.getElementById('stat-practiced'), statMastered: document.getElementById('stat-mastered'),
    statWeak: document.getElementById('stat-weak'), statAccuracy: document.getElementById('stat-accuracy'),
    
    toggleOptionsBtn: document.getElementById('toggle-options-btn'),
    playOptions: document.getElementById('play-options'),
    categorySelect: document.getElementById('category-select'),
    categoryBadge: document.getElementById('word-category'), difficulty: document.getElementById('word-difficulty'),
    masteryBadge: document.getElementById('word-mastery'), hint: document.getElementById('pronunciation-hint'),
    meaning: document.getElementById('meaning-hint'), blanksHint: document.getElementById('blanks-hint'),
    
    inputArea: document.getElementById('input-area'), 
    input: document.getElementById('spelling-input'),
    keyboard: document.getElementById('custom-keyboard'),
    keys: document.querySelectorAll('.key'),
    
    feedbackArea: document.getElementById('feedback-area'), 
    feedbackTitle: document.getElementById('feedback-title'), diffOutput: document.getElementById('diff-output'),
    correctSpelling: document.getElementById('correct-spelling'),
    nextBtn: document.getElementById('next-btn'), 
    
    navItems: document.querySelectorAll('.nav-item'), tabs: document.querySelectorAll('.tab-content'),
    modeBtns: document.querySelectorAll('.mode-btn'), targetBtns: document.querySelectorAll('.target-btn')
};

async function init() {
    applyTheme(userData.theme);
    updateStreakAndDailyLimits();
    await loadWords();
    populateCategories();
    updateDashboard();
    nextWord();
}

async function loadWords() {
    try {
        const response = await fetch('./words.json');
        wordsData = await response.json();
    } catch (error) { els.hint.textContent = "Error loading JSON."; }
}

function populateCategories() {
    const categories = [...new Set(wordsData.map(w => w.category))];
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = `📌 ${cat}`;
        els.categorySelect.appendChild(option);
    });
}

// Toggles
els.toggleOptionsBtn.addEventListener('click', () => {
    els.playOptions.classList.toggle('collapsed');
    els.toggleOptionsBtn.textContent = els.playOptions.classList.contains('collapsed') ? "⚙️ Practice Settings 🔽" : "⚙️ Hide Settings 🔼";
});

// COOLDOWN FUNCTION
function triggerCooldown(ms = 400) {
    inputCooldown = true;
    setTimeout(() => { inputCooldown = false; }, ms);
}

// KEYBOARD LOGIC
els.keys.forEach(key => {
    key.addEventListener('click', (e) => {
        e.preventDefault(); 
        handleKeyInput(key.dataset.key);
    });
});

document.addEventListener('keydown', (e) => {
    if (!document.getElementById('tab-play').classList.contains('active')) return; 

    let keyVal = null;
    if (e.key === 'Backspace') keyVal = '⌫';
    else if (e.key === 'Enter') keyVal = 'ENTER';
    else if (/^[a-zA-Z]$/.test(e.key)) keyVal = e.key.toUpperCase();

    if (keyVal) {
        e.preventDefault();
        handleKeyInput(keyVal);
    }
});

function handleKeyInput(keyVal) {
    if (inputCooldown) return; // 🛡️ Freeze logic fix

    if (appState === 'RESULT') {
        if (keyVal === 'ENTER') {
            triggerCooldown();
            nextWord();
        }
        return; 
    }

    if (keyVal === 'ENTER') {
        if (els.input.value.trim().length > 0) {
            triggerCooldown();
            processAnswer();
        }
    } else if (keyVal === '⌫') {
        els.input.value = els.input.value.slice(0, -1);
    } else if (els.input.value.length < 20) {
        els.input.value += keyVal;
    }
}

// Next Button Click Listener
els.nextBtn.addEventListener('click', () => {
    if (inputCooldown) return;
    if (appState === 'RESULT') {
        triggerCooldown();
        nextWord();
    }
});

// Category/Modes Logic
els.categorySelect.addEventListener('change', (e) => { currentCategory = e.target.value; nextWord(); });

els.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
        els.navItems.forEach(nav => nav.classList.remove('active'));
        els.tabs.forEach(tab => tab.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

els.modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        els.modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gameMode = btn.dataset.mode;
        nextWord();
    });
});

els.targetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        els.targetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        practiceTarget = btn.dataset.target;
        nextWord();
    });
});

function generateBlanks(word) {
    let result = '';
    for(let i=0; i<word.length; i++) {
        if(i > 0 && i < word.length - 1 && Math.random() > 0.5) result += '_ ';
        else result += word[i].toUpperCase() + ' ';
    }
    return result.trim();
}

function nextWord() {
    appState = 'TYPING'; 
    els.input.value = ''; 
    
    // Show Typing UI, Hide Result Card
    els.inputArea.classList.remove('hidden');
    els.keyboard.classList.remove('hidden'); 
    els.feedbackArea.classList.add('hidden');
    
    els.input.classList.remove('shake');

    let basePool = currentCategory === 'All' ? wordsData : wordsData.filter(w => w.category === currentCategory);
    let pool = [];

    if (practiceTarget === 'new') pool = basePool.filter(w => !userData.wordStats[w.id]);
    else if (practiceTarget === 'weak') pool = basePool.filter(w => userData.wordStats[w.id] && userData.wordStats[w.id].mistakes > 0 && !userData.wordStats[w.id].mastered);
    else if (practiceTarget === 'revise') pool = basePool.filter(w => userData.wordStats[w.id] && userData.wordStats[w.id].mastered);
    else pool = basePool.filter(w => {
        const stat = userData.wordStats[w.id];
        if (!stat) return true; 
        if (stat.mastered) return false; 
        if (stat.answeredCorrectlyToday) return false; 
        return true;
    });

    let filteredPool = pool.filter(w => w.id !== lastWordId);
    if (filteredPool.length > 0) pool = filteredPool;

    if (pool.length === 0) {
        els.hint.textContent = "All Caught Up! 🎉";
        els.meaning.textContent = "Try changing category or practice target.";
        els.inputArea.classList.add('hidden');
        els.keyboard.classList.add('hidden');
        els.blanksHint.classList.add('hidden');
        return;
    }

    currentWord = pool[Math.floor(Math.random() * pool.length)];
    lastWordId = currentWord.id; 
    
    const wordStat = userData.wordStats[currentWord.id] || { checkpoints: 0 };
    
    els.categoryBadge.textContent = currentWord.category;
    els.difficulty.textContent = currentWord.difficulty;
    els.masteryBadge.textContent = `Lvl ${wordStat.checkpoints}/7`;
    els.hint.textContent = currentWord.pronunciation_hindi;
    els.meaning.textContent = currentWord.meaning_hindi;
    
    if(gameMode === 'blanks') {
        els.blanksHint.textContent = generateBlanks(currentWord.word);
        els.blanksHint.classList.remove('hidden');
    } else {
        els.blanksHint.classList.add('hidden');
    }
}

// 🎯 PERFECT DIFF LOGIC FIX 🎯
function generateDiff(input, correct) {
    let html = "";
    const inArr = input.toLowerCase().split('');
    const corArr = correct.toLowerCase().split('');
    const maxLen = Math.max(inArr.length, corArr.length);
    
    for (let i = 0; i < maxLen; i++) {
        const inChar = inArr[i];
        const corChar = corArr[i];

        if (inChar && corChar && inChar === corChar) {
            html += `<span class="char-correct">${inChar.toUpperCase()}</span>`;
        } else if (inChar && !corChar) {
            html += `<span class="char-wrong">${inChar.toUpperCase()}</span>`;
        } else if (!inChar && corChar) {
            html += `<span class="char-missing">_</span>`;
        } else {
            html += `<span class="char-wrong">${inChar.toUpperCase()}</span>`;
        }
    }
    return html;
}

function processAnswer() {
    const userAnswer = els.input.value.trim();
    if (!userAnswer) return;

    appState = 'RESULT'; 
    userData.totalAttempts++;
    const isCorrect = userAnswer.toLowerCase() === currentWord.word.toLowerCase();
    
    // Hide Keyboard & Show Result Card
    els.keyboard.classList.add('hidden'); 
    els.inputArea.classList.add('hidden'); 
    els.feedbackArea.classList.remove('hidden');

    if (isCorrect) {
        userData.correctAttempts++;
        currentCombo++;
        els.feedbackTitle.textContent = "🎉 Brilliant!";
        els.feedbackTitle.style.color = "var(--success-color)";
        els.diffOutput.innerHTML = `<span class="char-correct">${currentWord.word.toUpperCase()}</span>`;
        els.correctSpelling.innerHTML = `+10 XP (Combo: ${currentCombo}x) 🔥`;
        userData.xp += 10 + (currentCombo * 2);
    } else {
        currentCombo = 0;
        els.feedbackTitle.textContent = "Keep Trying!";
        els.feedbackTitle.style.color = "var(--error-color)";
        els.diffOutput.innerHTML = generateDiff(userAnswer, currentWord.word);
        els.correctSpelling.innerHTML = `Correct Word: <b style="color:var(--text-main); font-size:1.3rem;">${currentWord.word}</b>`;
        
        els.feedbackTitle.classList.add('shake');
        setTimeout(() => els.feedbackTitle.classList.remove('shake'), 400);
    }

    updateWordStats(currentWord.id, isCorrect);
    saveData();
    updateDashboard();
}

function updateWordStats(id, isCorrect) {
    if (!userData.wordStats[id]) userData.wordStats[id] = { mistakes: 0, checkpoints: 0, mastered: false, answeredCorrectlyToday: false };
    const stat = userData.wordStats[id];
    
    if (isCorrect) {
        if (!stat.answeredCorrectlyToday) {
            stat.checkpoints++;
            stat.answeredCorrectlyToday = true;
        }
        if (stat.checkpoints >= 7) stat.mastered = true;
    } else {
        stat.mistakes++;
        stat.answeredCorrectlyToday = false; 
        stat.checkpoints = Math.max(0, stat.checkpoints - 1); 
    }
}

function updateStreakAndDailyLimits() {
    const today = new Date().toDateString();
    if (userData.lastPlayedDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        userData.streak = (userData.lastPlayedDate === yesterday) ? userData.streak + 1 : 1;
        userData.lastPlayedDate = today;
        Object.values(userData.wordStats).forEach(stat => stat.answeredCorrectlyToday = false);
        saveData();
    }
}

function updateDashboard() {
    els.streak.textContent = userData.streak;
    els.xp.textContent = userData.xp;
    const stats = Object.values(userData.wordStats);
    els.statPracticed.textContent = stats.length;
    els.statMastered.textContent = stats.filter(s => s.mastered).length;
    els.statWeak.textContent = stats.filter(s => s.mistakes > 2 && !s.mastered).length;
    els.statAccuracy.textContent = userData.totalAttempts > 0 ? Math.round((userData.correctAttempts / userData.totalAttempts) * 100) + '%' : '0%';
}

els.themeToggle.addEventListener('click', () => {
    userData.theme = userData.theme === 'light' ? 'dark' : 'light';
    applyTheme(userData.theme);
    saveData();
});

els.resetBtn.addEventListener('click', () => {
    if(confirm("Are you sure? This will delete all progress!")) {
        localStorage.removeItem('spellMasterData');
        location.reload();
    }
});

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    els.themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
}
function saveData() { localStorage.setItem('spellMasterData', JSON.stringify(userData)); }

init();