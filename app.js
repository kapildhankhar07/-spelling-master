let userData = JSON.parse(localStorage.getItem('spellMasterData')) || {
    xp: 0, streak: 0, lastPlayedDate: null, totalAttempts: 0, correctAttempts: 0,
    wordStats: {}, theme: 'light'
};

let wordsData = [];
let currentWord = null;
let lastWordId = null; // Prevents back-to-back same word
let isAnswering = false; 
let currentCombo = 0;
let wordStartTime = 0;
let gameMode = 'classic';
let practiceTarget = 'mix';
let currentCategory = 'All';

// DOM Elements
const els = {
    streak: document.getElementById('streak-count'), xp: document.getElementById('xp-count'),
    themeToggle: document.getElementById('theme-toggle'), resetBtn: document.getElementById('reset-btn'),
    statPracticed: document.getElementById('stat-practiced'), statMastered: document.getElementById('stat-mastered'),
    statWeak: document.getElementById('stat-weak'), statAccuracy: document.getElementById('stat-accuracy'),
    categorySelect: document.getElementById('category-select'),
    categoryBadge: document.getElementById('word-category'), difficulty: document.getElementById('word-difficulty'),
    masteryBadge: document.getElementById('word-mastery'), hint: document.getElementById('pronunciation-hint'),
    meaning: document.getElementById('meaning-hint'), blanksHint: document.getElementById('blanks-hint'),
    input: document.getElementById('spelling-input'), checkBtn: document.getElementById('check-btn'),
    nextBtn: document.getElementById('next-btn'), feedbackArea: document.getElementById('feedback-area'),
    feedbackTitle: document.getElementById('feedback-title'), diffOutput: document.getElementById('diff-output'),
    correctSpelling: document.getElementById('correct-spelling'), motivationMsg: document.getElementById('motivation-msg'),
    navItems: document.querySelectorAll('.nav-item'), tabs: document.querySelectorAll('.tab-content'),
    modeBtns: document.querySelectorAll('.mode-btn'), targetBtns: document.querySelectorAll('.target-btn')
};

async function init() {
    applyTheme(userData.theme);
    updateStreakAndDailyLimits(); // Check daily resets
    await loadWords();
    populateCategories();
    updateDashboard();
    nextWord();
}

async function loadWords() {
    try {
        const response = await fetch('./words.json');
        wordsData = await response.json();
    } catch (error) { els.hint.textContent = "Error loading JSON. Use Live Server."; }
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

// Event Listeners
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
        else result += word[i] + ' ';
    }
    return result.trim();
}

// --- UPGRADED SMART WORD SELECTION ---
function nextWord() {
    isAnswering = false;
    els.input.value = '';
    els.input.style.display = 'block';
    els.checkBtn.style.display = 'block';
    els.input.disabled = false;
    els.input.classList.remove('shake');
    els.feedbackArea.classList.add('hidden');
    els.nextBtn.classList.add('hidden');
    els.checkBtn.classList.remove('hidden');

    let basePool = currentCategory === 'All' ? wordsData : wordsData.filter(w => w.category === currentCategory);
    let pool = [];

    if (practiceTarget === 'new') {
        pool = basePool.filter(w => !userData.wordStats[w.id]);
    } else if (practiceTarget === 'weak') {
        // High mistake count prioritization
        pool = basePool.filter(w => userData.wordStats[w.id] && userData.wordStats[w.id].mistakes > 0 && !userData.wordStats[w.id].mastered);
    } else if (practiceTarget === 'revise') {
        pool = basePool.filter(w => userData.wordStats[w.id] && userData.wordStats[w.id].mastered);
    } else {
        // MIX MODE: Exclude mastered AND words already answered correctly today
        pool = basePool.filter(w => {
            const stat = userData.wordStats[w.id];
            if (!stat) return true; // Include new words
            if (stat.mastered) return false; // Exclude mastered
            if (stat.answeredCorrectlyToday) return false; // TRUE SPACED REPETITION - don't show today again
            return true;
        });
    }

    // Prevent immediate back-to-back word repetition
    let filteredPool = pool.filter(w => w.id !== lastWordId);
    if (filteredPool.length > 0) pool = filteredPool;

    if (pool.length === 0) {
        els.hint.textContent = "All Caught Up! 🎉";
        els.meaning.textContent = "You've practiced everything for this mode today.";
        els.input.style.display = 'none';
        els.checkBtn.style.display = 'none';
        els.blanksHint.classList.add('hidden');
        return;
    }

    // Randomize from the smart pool
    currentWord = pool[Math.floor(Math.random() * pool.length)];
    lastWordId = currentWord.id; // Store for next turn
    
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

    wordStartTime = Date.now();
    els.input.focus();
}

els.checkBtn.addEventListener('click', processAnswer);
els.input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !isAnswering && !els.checkBtn.classList.contains('hidden')) processAnswer();
});

function processAnswer() {
    if (isAnswering) return; 
    const userAnswer = els.input.value.trim();
    if (!userAnswer) return;

    isAnswering = true;
    userData.totalAttempts++;
    const isCorrect = userAnswer.toLowerCase() === currentWord.word.toLowerCase();
    
    els.input.disabled = true;
    els.checkBtn.classList.add('hidden');
    els.feedbackArea.classList.remove('hidden');
    els.nextBtn.classList.remove('hidden');

    if (isCorrect) {
        userData.correctAttempts++;
        currentCombo++;
        els.feedbackTitle.textContent = "🎉 Correct!";
        els.feedbackTitle.style.color = "var(--success-color)";
        els.correctSpelling.innerHTML = `+10 XP (Combo: ${currentCombo}x)`;
        userData.xp += 10 + (currentCombo * 2);
    } else {
        currentCombo = 0;
        els.input.classList.add('shake');
        els.feedbackTitle.textContent = "Keep Trying!";
        els.feedbackTitle.style.color = "var(--error-color)";
        els.correctSpelling.textContent = `Correct: ${currentWord.word}`;
    }

    updateWordStats(currentWord.id, isCorrect);
    saveData();
    updateDashboard();
}

els.nextBtn.addEventListener('click', nextWord);

// --- UPGRADED MASTERY TRACKER ---
function updateWordStats(id, isCorrect) {
    if (!userData.wordStats[id]) userData.wordStats[id] = { mistakes: 0, checkpoints: 0, mastered: false, answeredCorrectlyToday: false };
    const stat = userData.wordStats[id];
    
    if (isCorrect) {
        // Only give checkpoint if not already given today
        if (!stat.answeredCorrectlyToday) {
            stat.checkpoints++;
            stat.answeredCorrectlyToday = true;
        }
        if (stat.checkpoints >= 7) stat.mastered = true;
    } else {
        stat.mistakes++;
        stat.answeredCorrectlyToday = false; // Allow them to try fixing it today
        stat.checkpoints = Math.max(0, stat.checkpoints - 1); // Penalty
    }
}

function updateStreakAndDailyLimits() {
    const today = new Date().toDateString();
    if (userData.lastPlayedDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        userData.streak = (userData.lastPlayedDate === yesterday) ? userData.streak + 1 : 1;
        userData.lastPlayedDate = today;
        
        // Reset daily locks for all words on a new day
        Object.values(userData.wordStats).forEach(stat => {
            stat.answeredCorrectlyToday = false;
        });
        
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