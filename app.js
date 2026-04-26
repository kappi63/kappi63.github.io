// ===== Firebase Setup =====
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, collection, doc, onSnapshot,
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

onSnapshot(photosCol, snap => {
  photos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  loaded.photos = true;
  checkAllLoaded();
  if (currentView === 'gallery') renderGallery();
  if (currentView === 'ranking') renderRanking();
});

onSnapshot(votersCol, snap => {
  voters = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  loaded.voters = true;
  checkAllLoaded();
  updateVoterNameStatus();
  if (currentView === 'ranking') renderRanking();
});

onSnapshot(stateRef, snap => {
  votingClosed = snap.exists() ? (snap.data().votingClosed || false) : false;
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
  return voters.some(v => v.id === id);
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

// ===== Gallery =====
function sortedPhotos() {
  const copy = [...photos];
  if (currentSort === 'score')  copy.sort((a,b) => (b.score||0) - (a.score||0));
  if (currentSort === 'newest') copy.sort((a,b) => (b.createdAt?.toMillis?.()??0) - (a.createdAt?.toMillis?.()??0));
  if (currentSort === 'oldest') copy.sort((a,b) => (a.createdAt?.toMillis?.()??0) - (b.createdAt?.toMillis?.()??0));
  return copy;
}

function renderGallery() {
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
          <div class="point-selector-label">${needsPoints ? '⚠️ 得点を選んでください：' : '得点を選ぶ：'}</div>
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
      <img src="${photo.dataUrl}" alt="${escHtml(photo.title)}" loading="lazy" />
      <div class="card-body">
        <div class="card-meta">
          <div class="card-title">${escHtml(photo.title)}</div>
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

function assignPoints(id, pts) {
  if (!(id in pendingBallot)) return;
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
        pts === 0 ? '⚠️ 得点を選んでください：' : '得点を選ぶ：';
    }
  }
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
      <span class="panel-chip-title">${escHtml(photo.title)}</span>
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
  if (nameAlreadyVoted(voterName)) {
    showToast('⚠️ その名前はすでに投票済みです');
    return;
  }

  voteSubmitBtn.disabled = true;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'voters', normalizeVoterId(voterName)), {
      name: voterName.trim(),
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
  Array.from(rankingList.children).forEach(el => {
    if (el !== rankingEmpty) el.remove();
  });

  const list = [...photos].sort((a,b) => (b.score||0) - (a.score||0));

  const adminSection = document.createElement('div');
  adminSection.className = 'admin-section';
  adminSection.innerHTML = `
    <div class="voter-list-header ${votingClosed ? 'closed-header' : ''}">
      <span>${votingClosed ? '🔒 投票終了　' : ''}投票済み：<strong>${voters.length}人</strong></span>
      <div class="admin-btns">
        ${!votingClosed
          ? `<button id="close-voting-btn" class="btn btn-close">🔒 投票を締め切る</button>`
          : `<button id="reopen-voting-btn" class="btn btn-reopen">🔓 投票を再開する</button>`
        }
        <button id="reset-btn" class="btn btn-reset">🗑️ 集計をリセット</button>
        <button id="new-round-btn" class="btn btn-new-round">🔄 新ラウンド開始</button>
      </div>
    </div>
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
        <img class="ranking-thumb" src="${photo.dataUrl}" alt="${escHtml(photo.title)}" />
        <div class="ranking-info">
          <div class="ranking-title">${escHtml(photo.title)}</div>
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
    if (confirm('新ラウンドを開始しますか？\n\n・写真・投票記録・得点がすべて削除されます\n\nこの操作は取り消せません。')) {
      await startNewRound();
    }
  });
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

async function startNewRound() {
  const batch = writeBatch(db);
  photos.forEach(p => batch.delete(doc(db, 'photos', p.id)));
  voters.forEach(v => batch.delete(doc(db, 'voters', v.id)));
  batch.set(stateRef, { votingClosed: false }, { merge: true });
  await batch.commit();
  clearLocalSession();
  showToast('🔄 新ラウンドを開始しました！写真を投稿してください');
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
  submitBtn.disabled = !(pendingFile && uploaderName.value.trim() && photoTitle.value.trim());
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
  if (!pendingFile) return;
  submitBtn.disabled = true;
  try {
    await addDoc(photosCol, {
      author:    uploaderName.value.trim(),
      title:     photoTitle.value.trim(),
      dataUrl:   pendingFile,
      score:     0,
      voteCount: 0,
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
