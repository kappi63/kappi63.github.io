// ===== Firebase Setup =====
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, collection, doc, onSnapshot, query, where, getDocs,
  addDoc, setDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyCR72wRb29htbno5lI8mVHjxlBHbg-UYAc',
  authDomain:        'photo-battle-a84f7.firebaseapp.com',
  projectId:         'photo-battle-a84f7',
  storageBucket:     'photo-battle-a84f7.firebasestorage.app',
  messagingSenderId: '578938385960',
  appId:             '1:578938385960:web:65fe356879f91e6118a71d',
};

const fbApp     = initializeApp(firebaseConfig);
const db        = getFirestore(fbApp);
const photosCol = collection(db, 'photos');
const votersCol = collection(db, 'voters');
const stateRef  = doc(db, 'meta', 'state');

// ===== State =====
let photos        = [];
let voters        = [];
let votingClosed  = false;
let currentRound  = null;   // 表示・投票中のラウンド番号
let maxRound      = 1;      // これまでに作られた最大のラウンド番号
let roundInfo     = {};     // { [n]: { startedAt } }
let currentSort   = 'score';
let currentView   = 'gallery';
let voterName     = '';
let pendingBallot = {};

// ===== DOM refs =====
const navBtns          = document.querySelectorAll('.nav-btn');
const views            = document.querySelectorAll('.view');
const gallery          = document.getElementById('gallery');
const galleryEmpty     = document.getElementById('gallery-empty');
const galleryLoading   = document.getElementById('gallery-loading');
const sortSelect       = document.getElementById('sort-select');
const galleryRound     = document.getElementById('gallery-round');
const rankingList      = document.getElementById('ranking-list');
const rankingEmpty     = document.getElementById('ranking-empty');
const votePanel        = document.getElementById('vote-panel');
const votePanelName    = document.getElementById('vote-panel-name');
const votePanelCount   = document.getElementById('vote-panel-count');
const votePanelChips   = document.getElementById('vote-panel-chips');
const voteSubmitBtn    = document.getElementById('vote-submit-btn');
const closedBanner     = document.getElementById('closed-banner');
const voteInstructions = document.getElementById('vote-instructions');
const voterNameInput   = document.getElementById('voter-name-input');
const voterNameStatus  = document.getElementById('voter-name-status');
const uploaderName     = document.getElementById('uploader-name');
const photoTitle       = document.getElementById('photo-title');
const photoInput       = document.getElementById('photo-input');
const dropZone         = document.getElementById('drop-zone');
const dropZoneInner    = document.getElementById('drop-zone-inner');
const previewImg       = document.getElementById('preview-img');
const submitBtn        = document.getElementById('submit-btn');
const uploadMsg        = document.getElementById('upload-message');
const toast            = document.getElementById('toast');

// ===== Firestore Listeners =====
const loaded = { photos: false, voters: false, state: false };

function onAllLoaded() {
  galleryLoading.classList.add('hidden');
  renderGallery();
}

function checkAllLoaded() {
  if (loaded.photos && loaded.voters && loaded.state) onAllLoaded();
}

// 写真と投票者は「ラウンド番号」付きで保存し、削除しない。
// 表示するのは currentRound のものだけ。過去のラウンドはいつでも呼び戻せる。
let unsubPhotos = null;
let unsubVoters = null;
let subscribedRound = null;

function subscribeRound(n) {
  if (subscribedRound === n) return;
  subscribedRound = n;
  unsubPhotos?.();
  unsubVoters?.();
  loaded.photos = false;
  loaded.voters = false;

  unsubPhotos = onSnapshot(query(photosCol, where('round', '==', n)), snap => {
    photos = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
    assignNumbers(photos);
    loaded.photos = true;
    checkAllLoaded();
    if (currentView === 'gallery') renderGallery();
    if (currentView === 'ranking') renderRanking();
  });

  unsubVoters = onSnapshot(query(votersCol, where('round', '==', n)), snap => {
    voters = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    loaded.voters = true;
    checkAllLoaded();
    updateVoterNameStatus();
    if (currentView === 'ranking') renderRanking();
  });
}

// 旧バージョンのデータ（ラウンド番号なし）を第1回として登録する（初回のみ）
let migrating = false;
async function migrateLegacyData() {
  if (migrating) return;
  migrating = true;
  const [pSnap, vSnap] = await Promise.all([getDocs(photosCol), getDocs(votersCol)]);
  const batch = writeBatch(db);
  pSnap.docs.forEach(d => { if (d.data().round == null) batch.update(d.ref, { round: 1 }); });
  vSnap.docs.forEach(d => {
    if (d.data().round == null) batch.update(d.ref, { round: 1, voterId: d.id });
  });
  // 第1回の日付 = 一番古い写真の投稿日（写真がなければ今日）
  const oldest = pSnap.docs
    .map(d => d.data().createdAt)
    .filter(t => t?.toMillis)
    .sort((a, b) => a.toMillis() - b.toMillis())[0];
  batch.set(stateRef, {
    currentRound: 1,
    maxRound:     1,
    roundInfo:    { 1: { startedAt: oldest || serverTimestamp() } },
  }, { merge: true });
  await batch.commit();
}

onSnapshot(stateRef, snap => {
  // 'estimate': 新ラウンド直後（サーバー時刻の確定前）でも日付を表示できるように
  const data = snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : {};
  votingClosed = data.votingClosed || false;
  if (data.currentRound == null) {
    migrateLegacyData().catch(() => showToast('⚠️ データの準備に失敗しました。再読み込みしてください'));
    return;
  }
  const prevRound = currentRound;
  currentRound = data.currentRound;
  maxRound     = data.maxRound || currentRound;
  roundInfo    = data.roundInfo || {};
  if (prevRound !== null && prevRound !== currentRound) {
    clearLocalSession();
    showToast(`🔄 ${roundLabel(currentRound)}を表示しています`);
  }
  subscribeRound(currentRound);
  loaded.state = true;
  checkAllLoaded();
  if (currentView === 'gallery') renderGallery();
  if (currentView === 'ranking') renderRanking();
});

// ===== Navigation =====
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    currentView = btn.dataset.view;
    navBtns.forEach(b => b.classList.toggle('active', b === btn));
    views.forEach(v => v.classList.toggle('active', v.id === `view-${currentView}`));
    if (currentView === 'gallery') renderGallery();
    if (currentView === 'ranking') renderRanking();
    window.scrollTo(0, 0);   // タブを切り替えたときだけ先頭へ
  });
});

// ===== Sort =====
sortSelect.addEventListener('change', () => {
  currentSort = sortSelect.value;
  renderGallery();
});

// ===== Voter Name =====
function nameAlreadyVoted(name) {
  const id = normalizeVoterId(name);
  return voters.some(v => (v.voterId || v.id) === id);
}

function normalizeVoterId(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

function updateVoterNameStatus() {
  const raw = voterNameInput.value.trim();
  if (!raw) {
    voterNameStatus.textContent = '';
    voterNameStatus.className   = 'voter-name-status';
    voterName = '';
  } else if (nameAlreadyVoted(raw)) {
    voterNameStatus.textContent = '✗ この名前はすでに投票済みです';
    voterNameStatus.className   = 'voter-name-status status-error';
    voterName = '';
  } else {
    voterNameStatus.textContent = '✓ 投票できます';
    voterNameStatus.className   = 'voter-name-status status-ok';
    voterName = raw;
  }
}

voterNameInput.addEventListener('input', () => {
  pendingBallot = {};
  updateVoterNameStatus();
  renderGallery();
});

// ===== Photo numbers =====
// ラウンド内の投稿順に No.1, No.2 … を付ける（写真は削除されないので番号は変わらない）
function assignNumbers(list) {
  [...list]
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? Infinity) - (b.createdAt?.toMillis?.() ?? Infinity)
                    || a.id.localeCompare(b.id))
    .forEach((p, i) => { p.no = i + 1; });
  return list;
}

function displayTitle(photo) {
  const t = (photo.title || '').trim();
  return t ? `No.${photo.no} ${t}` : `No.${photo.no}`;
}

// ===== Gallery =====
function sortedPhotos() {
  const copy = [...photos];
  if (currentSort === 'score')  copy.sort((a,b) => (b.score||0) - (a.score||0));
  if (currentSort === 'newest') copy.sort((a,b) => (b.createdAt?.toMillis?.()??0) - (a.createdAt?.toMillis?.()??0));
  if (currentSort === 'oldest') copy.sort((a,b) => (a.createdAt?.toMillis?.()??0) - (b.createdAt?.toMillis?.()??0));
  return copy;
}

// 描き直しの間にページが一瞬短くなってスクロールが先頭に飛ぶのを防ぐ
function keepScroll(container, render) {
  const y = window.scrollY;
  container.style.minHeight = container.offsetHeight + 'px';
  try { render(); } finally {
    container.style.minHeight = '';
    if (window.scrollY !== y) window.scrollTo(0, y);
  }
}

function renderGallery() {
  keepScroll(gallery, renderGalleryContent);
}

function renderGalleryContent() {
  galleryRound.textContent = currentRound == null ? '' : roundLabel(currentRound);
  closedBanner.classList.toggle('hidden', !votingClosed);
  voteInstructions.classList.toggle('hidden', votingClosed);

  Array.from(gallery.children).forEach(el => {
    if (el !== galleryEmpty && el !== galleryLoading) el.remove();
  });

  const list = sortedPhotos();
  if (list.length === 0) { galleryEmpty.style.display = ''; return; }
  galleryEmpty.style.display = 'none';

  const canSelect = !votingClosed && voterName !== '';

  list.forEach(photo => {
    const isSelected  = photo.id in pendingBallot;
    const assignedPts = pendingBallot[photo.id] || 0;
    const maxReached  = Object.keys(pendingBallot).length >= 5;

    let pointSelectorHtml = '';
    if (isSelected && canSelect) {
      const needsPoints = assignedPts === 0;
      const btns = [1,2,3,4,5].map(p =>
        `<button class="point-btn${assignedPts === p ? ' active' : ''}" data-id="${photo.id}" data-pts="${p}">${p}</button>`
      ).join('');
      pointSelectorHtml = `
        <div class="point-selector${needsPoints ? ' needs-points' : ''}">
          <div class="point-selector-label">${needsPoints ? '⚠️ 得点を選んでください（同じ点数は1回まで）：' : '得点を選ぶ（同じ点数は1回まで）：'}</div>
          ${btns}
        </div>`;
    }

    let actionHtml = '';
    if (canSelect) {
      actionHtml = isSelected
        ? `<button class="select-btn selected-btn" data-action="deselect" data-id="${photo.id}">✓ 選択中</button>`
        : `<button class="select-btn" data-action="select" data-id="${photo.id}" ${maxReached ? 'disabled' : ''}>＋ 選ぶ</button>`;
    }

    const card = document.createElement('div');
    card.className = 'photo-card' + (isSelected ? ' selected' : '') + (votingClosed ? ' voted-card' : '');
    card.dataset.id = photo.id;
    card.innerHTML = `
      <img src="${photo.dataUrl}" alt="${escHtml(displayTitle(photo))}" loading="lazy" />
      <div class="card-body">
        <div class="card-meta">
          <div class="card-title">${escHtml(displayTitle(photo))}</div>
          <div class="card-author">by ${escHtml(photo.author)}</div>
        </div>
        ${pointSelectorHtml}
        <div class="card-footer">
          <div class="score-display">⭐ ${photo.score||0}点</div>
          ${actionHtml}
        </div>
      </div>`;
    gallery.appendChild(card);
  });

  gallery.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'select')   selectPhoto(btn.dataset.id);
      if (btn.dataset.action === 'deselect') deselectPhoto(btn.dataset.id);
    });
  });

  gallery.querySelectorAll('.point-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      assignPoints(btn.dataset.id, parseInt(btn.dataset.pts, 10));
    });
  });

  markUsedPoints();
  updateVotePanel();
}

// ===== Selection =====
function selectPhoto(id) {
  if (!voterName || votingClosed) return;
  if (Object.keys(pendingBallot).length >= 5) { showToast('⚠️ 最大5枚まで選べます'); return; }
  pendingBallot[id] = 0;
  renderGallery();
}

function deselectPhoto(id) {
  if (!voterName || votingClosed) return;
  delete pendingBallot[id];
  renderGallery();
}

// 同じ点数を別の写真にすでに付けているか（付けていればその写真のIDを返す）
function photoWithPoints(pts, exceptId) {
  return Object.keys(pendingBallot).find(pid => pid !== exceptId && pendingBallot[pid] === pts);
}

// 他の写真で使用済みの点数ボタンを薄く表示する
function markUsedPoints() {
  gallery.querySelectorAll('.point-btn').forEach(b => {
    const used = !!photoWithPoints(parseInt(b.dataset.pts, 10), b.dataset.id);
    b.classList.toggle('used', used);
    b.title = used ? 'この点数は他の写真で使用済みです' : '';
  });
}

function assignPoints(id, pts) {
  if (!(id in pendingBallot)) return;
  const otherId = photoWithPoints(pts, id);
  if (otherId) {
    const other = photos.find(p => p.id === otherId);
    alert(`${pts}点はすでに「${other ? displayTitle(other) : '別の写真'}」に付けています。\n\n同じ点数は1回しか使えません。\n別の点数を選んでください。`);
    return;
  }
  pendingBallot[id] = pts;
  const card = gallery.querySelector(`.photo-card[data-id="${id}"]`);
  if (card) {
    card.querySelectorAll('.point-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.pts, 10) === pts)
    );
    const sel = card.querySelector('.point-selector');
    if (sel) {
      sel.classList.toggle('needs-points', pts === 0);
      sel.querySelector('.point-selector-label').textContent =
        pts === 0 ? '⚠️ 得点を選んでください（同じ点数は1回まで）：' : '得点を選ぶ（同じ点数は1回まで）：';
    }
  }
  markUsedPoints();
  updateVotePanel();
}

// ===== Vote Panel =====
function updateVotePanel() {
  if (votingClosed || !voterName) { votePanel.classList.add('hidden'); return; }

  const entries = Object.entries(pendingBallot);
  if (entries.length === 0) { votePanel.classList.add('hidden'); return; }

  votePanel.classList.remove('hidden');
  votePanelName.textContent  = voterName + ' さん';
  votePanelCount.textContent = entries.length;

  const allAssigned = entries.every(([, pts]) => pts > 0);
  voteSubmitBtn.disabled = !allAssigned;

  let hint = votePanel.querySelector('.vote-panel-hint');
  if (!allAssigned) {
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'vote-panel-hint';
      votePanel.querySelector('.vote-panel-inner').insertBefore(hint, voteSubmitBtn);
    }
    const remaining = entries.filter(([, pts]) => pts === 0).length;
    hint.textContent = `⚠️ あと${remaining}枚の写真に得点（1〜5点）をつけてください`;
  } else if (hint) {
    hint.remove();
  }

  votePanelChips.innerHTML = '';
  entries.forEach(([id, pts]) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;
    const chip = document.createElement('div');
    chip.className = 'panel-chip' + (pts === 0 ? ' chip-unset' : '');
    chip.innerHTML = `
      <img class="panel-chip-thumb" src="${photo.dataUrl}" alt="" />
      <span class="panel-chip-title">${escHtml(displayTitle(photo))}</span>
      <span class="panel-chip-pts">${pts > 0 ? pts + '点' : '得点未設定'}</span>`;
    votePanelChips.appendChild(chip);
  });
}

// ===== Submit Vote =====
voteSubmitBtn.addEventListener('click', submitVote);

async function submitVote() {
  if (votingClosed || !voterName) return;

  const entries = Object.entries(pendingBallot);
  if (entries.length === 0) return;
  if (!entries.every(([, pts]) => pts > 0)) {
    showToast('⚠️ すべての写真に得点をつけてください');
    return;
  }
  const ptsList = entries.map(([, pts]) => pts);
  if (new Set(ptsList).size !== ptsList.length) {
    alert('同じ点数が複数の写真に付いています。\n点数はそれぞれ違う値にしてください。');
    return;
  }
  if (nameAlreadyVoted(voterName)) {
    showToast('⚠️ その名前はすでに投票済みです');
    return;
  }

  voteSubmitBtn.disabled = true;
  try {
    const batch = writeBatch(db);
    const voterId = normalizeVoterId(voterName);
    batch.set(doc(db, 'voters', `r${currentRound}_${voterId}`), {
      name:    voterName.trim(),
      voterId,
      round:   currentRound,
      votedAt: serverTimestamp(),
    });
    entries.forEach(([id, pts]) => {
      batch.update(doc(db, 'photos', id), {
        score:     increment(pts),
        voteCount: increment(1),
      });
    });
    await batch.commit();

    const name = voterName;
    voterName     = '';
    pendingBallot = {};
    voterNameInput.value        = '';
    voterNameStatus.textContent = '';
    voterNameStatus.className   = 'voter-name-status';
    votePanel.classList.add('hidden');
    showToast(`🎉 ${name}さんの投票が完了しました！`);
  } catch {
    showToast('⚠️ 投票に失敗しました。再度お試しください');
    voteSubmitBtn.disabled = false;
  }
}

// ===== Ranking =====
function renderRanking() {
  keepScroll(rankingList, renderRankingContent);
}

function renderRankingContent() {
  Array.from(rankingList.children).forEach(el => {
    if (el !== rankingEmpty) el.remove();
  });

  const list = [...photos].sort((a,b) => (b.score||0) - (a.score||0));

  const adminSection = document.createElement('div');
  adminSection.className = 'admin-section';
  adminSection.innerHTML = `
    <div class="voter-list-header ${votingClosed ? 'closed-header' : ''}">
      <span><span class="round-badge">${currentRound == null ? '-' : escHtml(roundLabel(currentRound))}</span>${votingClosed ? '🔒 投票終了　' : ''}投票済み：<strong>${voters.length}人</strong></span>
      <div class="admin-btns">
        ${!votingClosed
          ? `<button id="close-voting-btn" class="btn btn-close">🔒 投票を締め切る</button>`
          : `<button id="reopen-voting-btn" class="btn btn-reopen">🔓 投票を再開する</button>`
        }
      </div>
    </div>
    <details class="admin-menu" ${adminMenuOpen ? 'open' : ''}>
      <summary>⚙️ 幹事メニュー（リセット・新ラウンド）</summary>
      <div class="admin-menu-body">
        <div class="admin-btns">
          <button id="reset-btn" class="btn btn-reset">🗑️ 集計をリセット</button>
          <button id="new-round-btn" class="btn btn-new-round">🔄 新ラウンド開始</button>
        </div>
        <p class="admin-note">新ラウンドを始めても、今回の写真と結果は「過去のラウンド」に保存され、いつでも戻せます。</p>
      </div>
    </details>
    <div class="voter-chips">${
      voters.length === 0
        ? '<span class="no-voters">まだ誰も投票していません</span>'
        : voters.map(v => `<span class="voter-chip">${escHtml(v.name || v.id)}</span>`).join('')
    }</div>`;
  rankingList.appendChild(adminSection);

  if (list.length === 0) {
    rankingEmpty.style.display = '';
  } else {
    rankingEmpty.style.display = 'none';
    list.forEach((photo, i) => {
      const rank      = i + 1;
      const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
      const medal     = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
      const item      = document.createElement('div');
      item.className  = `ranking-item ${rankClass}`;
      item.innerHTML  = `
        <div class="rank-badge">${medal}</div>
        <img class="ranking-thumb" src="${photo.dataUrl}" alt="${escHtml(displayTitle(photo))}" />
        <div class="ranking-info">
          <div class="ranking-title">${escHtml(displayTitle(photo))}</div>
          <div class="ranking-author">by ${escHtml(photo.author)}</div>
          <div class="ranking-votes">${photo.voteCount||0} 人が投票</div>
        </div>
        <div class="ranking-score">
          <div class="score-number">${photo.score||0}</div>
          <div class="score-label">点</div>
        </div>`;
      rankingList.appendChild(item);
    });
  }

  rankingList.appendChild(buildHistorySection());

  adminSection.querySelector('.admin-menu').addEventListener('toggle', e => {
    adminMenuOpen = e.target.open;
  });

  document.getElementById('close-voting-btn')?.addEventListener('click', async () => {
    if (confirm('投票を締め切りますか？')) {
      await setDoc(stateRef, { votingClosed: true }, { merge: true });
      showToast('🔒 投票を締め切りました');
    }
  });

  document.getElementById('reopen-voting-btn')?.addEventListener('click', async () => {
    if (confirm('投票を再開しますか？')) {
      await setDoc(stateRef, { votingClosed: false }, { merge: true });
      showToast('🔓 投票を再開しました');
    }
  });

  document.getElementById('reset-btn')?.addEventListener('click', async () => {
    if (confirm('投票データと得点をリセットしますか？\n\n・全員の投票記録が削除されます\n・各写真の得点が0に戻ります\n・写真は残ります\n\nこの操作は取り消せません。')) {
      await resetVotes();
    }
  });

  document.getElementById('new-round-btn')?.addEventListener('click', async () => {
    if (confirm(`新ラウンドを開始しますか？\n\n・${roundLabel(currentRound)}の写真と結果は「過去のラウンド」に保存されます\n・ランキング下部の「過去のラウンド」からいつでも戻せます`)) {
      await startNewRound();
    }
  });

  rankingList.querySelectorAll('[data-history-toggle]').forEach(btn => {
    btn.addEventListener('click', () => toggleHistory(parseInt(btn.dataset.historyToggle, 10)));
  });

  rankingList.querySelectorAll('[data-history-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const n = parseInt(btn.dataset.historyRestore, 10);
      if (confirm(`${roundLabel(n)}に戻しますか？\n\n・ギャラリーとランキングが${roundLabel(n)}の内容に切り替わります\n・現在の${roundLabel(currentRound)}も「過去のラウンド」に保存されます`)) {
        await switchRound(n);
      }
    });
  });
}

// ===== Rounds / History =====
let adminMenuOpen  = false;
const expandedRounds = new Set();
const historyCache   = new Map();   // round -> { photos, voterCount } | 'loading' | 'error'

function formatDate(ts) {
  const d = ts?.toDate?.();
  if (!d) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// 内部の通し番号 n とは別に、表示上の回数は年ごとに1回から数え直す
function roundYear(n) {
  return roundInfo[n]?.startedAt?.toDate?.()?.getFullYear() ?? null;
}

function displayRoundNumber(n) {
  const year = roundYear(n);
  if (year == null) return n;
  let count = 0;
  for (let i = 1; i <= n; i++) if (roundYear(i) === year) count++;
  return count;
}

function roundLabel(n) {
  const date = formatDate(roundInfo[n]?.startedAt);
  const num  = displayRoundNumber(n);
  return date ? `第${num}回（${date}）` : `第${num}回`;
}

function buildHistorySection() {
  const section = document.createElement('div');
  section.className = 'history-section';
  const past = [];
  for (let n = maxRound; n >= 1; n--) if (n !== currentRound) past.push(n);

  if (past.length === 0) {
    section.innerHTML = `
      <h3 class="history-title">📚 過去のラウンド</h3>
      <p class="no-voters">まだ過去のラウンドはありません。</p>`;
    return section;
  }

  section.innerHTML = `
    <h3 class="history-title">📚 過去のラウンド</h3>
    ${past.map(n => {
      const open = expandedRounds.has(n);
      return `
        <div class="history-item">
          <div class="history-head">
            <span class="history-name">${escHtml(roundLabel(n))}</span>
            <div class="admin-btns">
              <button class="btn btn-reset" data-history-toggle="${n}">${open ? '▲ 閉じる' : '▼ 結果を見る'}</button>
              <button class="btn btn-reopen" data-history-restore="${n}">↩️ このラウンドに戻す</button>
            </div>
          </div>
          ${open ? `<div class="history-body">${historyBodyHtml(n)}</div>` : ''}
        </div>`;
    }).join('')}`;
  return section;
}

function historyBodyHtml(n) {
  const data = historyCache.get(n);
  if (!data || data === 'loading') return '<p class="no-voters">読み込み中...</p>';
  if (data === 'error') return '<p class="no-voters">読み込みに失敗しました</p>';
  if (data.photos.length === 0) return '<p class="no-voters">写真はありません</p>';
  return `
    <p class="history-summary">写真 ${data.photos.length}枚・投票 ${data.voterCount}人</p>
    ${data.photos.map((p, i) => `
      <div class="history-row">
        <span class="history-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
        <img class="history-thumb" src="${p.dataUrl}" alt="" loading="lazy" />
        <span class="history-photo-title">${escHtml(displayTitle(p))}<small> by ${escHtml(p.author)}</small></span>
        <span class="history-score">${p.score || 0}点</span>
      </div>`).join('')}`;
}

async function toggleHistory(n) {
  if (expandedRounds.has(n)) {
    expandedRounds.delete(n);
    renderRanking();
    return;
  }
  expandedRounds.add(n);
  historyCache.set(n, 'loading');
  renderRanking();
  try {
    const [pSnap, vSnap] = await Promise.all([
      getDocs(query(photosCol, where('round', '==', n))),
      getDocs(query(votersCol, where('round', '==', n))),
    ]);
    const list = assignNumbers(pSnap.docs.map(d => ({ id: d.id, ...d.data() }))).sort((a, b) => (b.score || 0) - (a.score || 0));
    historyCache.set(n, { photos: list, voterCount: vSnap.size });
  } catch {
    historyCache.set(n, 'error');
  }
  if (currentView === 'ranking') renderRanking();
}

async function switchRound(n) {
  expandedRounds.clear();
  historyCache.clear();
  await setDoc(stateRef, {
    currentRound: n,
    votingClosed: roundInfo[n]?.closed ?? false,
    roundInfo: { [currentRound]: { closed: votingClosed } },
  }, { merge: true });
}

async function resetVotes() {
  const batch = writeBatch(db);
  photos.forEach(p => batch.update(doc(db, 'photos', p.id), { score: 0, voteCount: 0 }));
  voters.forEach(v => batch.delete(doc(db, 'voters', v.id)));
  batch.set(stateRef, { votingClosed: false }, { merge: true });
  await batch.commit();
  clearLocalSession();
  showToast('🗑️ 投票データをリセットしました');
}

// 写真は削除せず、ラウンド番号を進めるだけ（過去のラウンドとして残る）
async function startNewRound() {
  const next = maxRound + 1;
  expandedRounds.clear();
  historyCache.clear();
  await setDoc(stateRef, {
    currentRound: next,
    maxRound:     next,
    votingClosed: false,
    roundInfo: {
      [currentRound]: { closed: votingClosed },
      [next]:         { startedAt: serverTimestamp() },
    },
  }, { merge: true });
  clearLocalSession();
  showToast(`🔄 ${roundLabel(next)}を開始しました！写真を投稿してください`);
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === 'upload'));
  views.forEach(v => v.classList.toggle('active', v.id === 'view-upload'));
  currentView = 'upload';
}

function clearLocalSession() {
  voterName     = '';
  pendingBallot = {};
  voterNameInput.value        = '';
  voterNameStatus.textContent = '';
  voterNameStatus.className   = 'voter-name-status';
  votePanel.classList.add('hidden');
}

// ===== Upload =====
let pendingFile = null;

function checkSubmitReady() {
  submitBtn.disabled = !(pendingFile && uploaderName.value.trim());   // タイトルは任意
}

uploaderName.addEventListener('input', checkSubmitReady);
photoTitle.addEventListener('input', checkSubmitReady);

dropZone.addEventListener('click', e => {
  if (e.target === previewImg) return;
  photoInput.click();
});

photoInput.addEventListener('change', () => {
  if (photoInput.files[0]) setPreview(photoInput.files[0]);
});

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file?.type.startsWith('image/')) setPreview(file);
  else showToast('画像ファイルを選んでください');
});

// Compress to max 800px / quality 0.75 to fit within Firestore's 1MB document limit.
// createImageBitmap with imageOrientation:'from-image' corrects EXIF rotation (portrait photos).
async function compressImage(file) {
  const MAX_SIDE = 800;
  const QUALITY  = 0.75;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  let w = bitmap.width, h = bitmap.height;
  if (w > MAX_SIDE || h > MAX_SIDE) {
    const ratio = Math.min(MAX_SIDE / w, MAX_SIDE / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', QUALITY);
}

async function setPreview(file) {
  dropZoneInner.querySelector('p').textContent = '読み込み中...';
  const dataUrl = await compressImage(file);
  pendingFile = dataUrl;
  previewImg.src = dataUrl;
  previewImg.classList.remove('hidden');
  dropZoneInner.classList.add('hidden');
  dropZoneInner.querySelector('p').textContent = 'クリックまたはドラッグ&ドロップ';
  checkSubmitReady();
}

submitBtn.addEventListener('click', async () => {
  if (!pendingFile || currentRound == null) return;
  submitBtn.disabled = true;
  try {
    await addDoc(photosCol, {
      author:    uploaderName.value.trim(),
      title:     photoTitle.value.trim(),
      dataUrl:   pendingFile,
      score:     0,
      voteCount: 0,
      round:     currentRound,
      createdAt: serverTimestamp(),
    });
    pendingFile = null;
    photoTitle.value = '';
    previewImg.classList.add('hidden');
    dropZoneInner.classList.remove('hidden');
    previewImg.src = '';
    photoInput.value = '';
    showUploadMessage('投稿しました！ギャラリーで確認できます。', 'success');
    showToast('📸 写真を投稿しました！');
  } catch {
    showUploadMessage('投稿に失敗しました。再度お試しください。', 'error');
  } finally {
    checkSubmitReady();
  }
});

function showUploadMessage(text, type) {
  uploadMsg.textContent = text;
  uploadMsg.className   = `upload-message ${type}`;
  uploadMsg.classList.remove('hidden');
  setTimeout(() => uploadMsg.classList.add('hidden'), 4000);
}

// ===== Toast =====
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 320);
  }, 2800);
}

// ===== Helpers =====
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
