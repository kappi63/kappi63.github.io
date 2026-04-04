// ===== Storage Helpers =====
const STORAGE_KEY = 'photobattle_photos';
const VOTERS_KEY  = 'photobattle_voters';  // [{ name, votedAt }]
const CLOSED_KEY  = 'photobattle_closed';  // 'true' when voting is closed

function loadPhotos() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function savePhotos(photos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
  } catch (e) {
    if (photos.length > 1) {
      const trimmed = [...photos].sort((a,b) => a.createdAt - b.createdAt).slice(1);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        showToast('⚠️ 容量不足のため古い写真を1枚削除しました');
      } catch (_) { showToast('⚠️ 保存に失敗しました。ブラウザの容量が足りません'); }
    } else { showToast('⚠️ 保存に失敗しました。ブラウザの容量が足りません'); }
  }
}

function loadVoters() {
  try { return JSON.parse(localStorage.getItem(VOTERS_KEY)) || []; }
  catch { return []; }
}

function saveVoters(v) { localStorage.setItem(VOTERS_KEY, JSON.stringify(v)); }

function isVotingClosed() { return localStorage.getItem(CLOSED_KEY) === 'true'; }
function closeVoting()    { localStorage.setItem(CLOSED_KEY, 'true'); }
function reopenVoting()   { localStorage.removeItem(CLOSED_KEY); }

function nameAlreadyVoted(name) {
  return voters.some(v => v.name.trim().toLowerCase() === name.trim().toLowerCase());
}

// ===== State =====
let photos      = loadPhotos();
let voters      = loadVoters();
let currentSort = 'score';
let voterName   = '';          // name typed by current user
let pendingBallot = {};        // { photoId -> points } for current session

// ===== DOM refs =====
const navBtns           = document.querySelectorAll('.nav-btn');
const views             = document.querySelectorAll('.view');
const gallery           = document.getElementById('gallery');
const galleryEmpty      = document.getElementById('gallery-empty');
const sortSelect        = document.getElementById('sort-select');
const rankingList       = document.getElementById('ranking-list');
const rankingEmpty      = document.getElementById('ranking-empty');
const votePanel         = document.getElementById('vote-panel');
const votePanelName     = document.getElementById('vote-panel-name');
const votePanelCount    = document.getElementById('vote-panel-count');
const votePanelChips    = document.getElementById('vote-panel-chips');
const voteSubmitBtn     = document.getElementById('vote-submit-btn');
const closedBanner      = document.getElementById('closed-banner');
const voteInstructions  = document.getElementById('vote-instructions');
const voterNameInput    = document.getElementById('voter-name-input');
const voterNameStatus   = document.getElementById('voter-name-status');

const uploaderName  = document.getElementById('uploader-name');
const photoTitle    = document.getElementById('photo-title');
const photoInput    = document.getElementById('photo-input');
const dropZone      = document.getElementById('drop-zone');
const dropZoneInner = document.getElementById('drop-zone-inner');
const previewImg    = document.getElementById('preview-img');
const submitBtn     = document.getElementById('submit-btn');
const uploadMsg     = document.getElementById('upload-message');
const toast         = document.getElementById('toast');

// ===== Navigation =====
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.view;
    navBtns.forEach(b => b.classList.toggle('active', b === btn));
    views.forEach(v => v.classList.toggle('active', v.id === `view-${target}`));
    if (target === 'gallery') renderGallery();
    if (target === 'ranking') renderRanking();
  });
});

// ===== Sort =====
sortSelect.addEventListener('change', () => {
  currentSort = sortSelect.value;
  renderGallery();
});

// ===== Voter Name Input =====
voterNameInput.addEventListener('input', () => {
  const raw = voterNameInput.value.trim();
  voterName = raw;
  pendingBallot = {}; // reset selection when name changes

  if (!raw) {
    voterNameStatus.textContent = '';
    voterNameStatus.className = 'voter-name-status';
  } else if (nameAlreadyVoted(raw)) {
    voterNameStatus.textContent = '✗ この名前はすでに投票済みです';
    voterNameStatus.className = 'voter-name-status status-error';
    voterName = ''; // block voting
  } else {
    voterNameStatus.textContent = '✓ 投票できます';
    voterNameStatus.className = 'voter-name-status status-ok';
  }
  renderGallery();
});

// ===== Gallery =====
function sortedPhotos() {
  const copy = [...photos];
  if (currentSort === 'score')  copy.sort((a,b) => (b.score||0) - (a.score||0));
  if (currentSort === 'newest') copy.sort((a,b) => b.createdAt - a.createdAt);
  if (currentSort === 'oldest') copy.sort((a,b) => a.createdAt - b.createdAt);
  return copy;
}

function renderGallery() {
  const closed = isVotingClosed();

  // Banners
  if (closed) {
    closedBanner.classList.remove('hidden');
    voteInstructions.classList.add('hidden');
  } else {
    closedBanner.classList.add('hidden');
    voteInstructions.classList.remove('hidden');
  }

  // Clear cards
  Array.from(gallery.children).forEach(el => {
    if (el !== galleryEmpty) el.remove();
  });

  const list = sortedPhotos();
  if (list.length === 0) { galleryEmpty.style.display = ''; return; }
  galleryEmpty.style.display = 'none';

  const canSelect = !closed && voterName !== '';

  list.forEach(photo => {
    const isSelected  = photo.id in pendingBallot;
    const assignedPts = pendingBallot[photo.id] || 0;
    const maxReached  = Object.keys(pendingBallot).length >= 5;

    const card = document.createElement('div');
    card.className = 'photo-card' + (isSelected ? ' selected' : '') + (closed ? ' voted-card' : '');
    card.dataset.id = photo.id;

    let pointSelectorHtml = '';
    if (isSelected && canSelect) {
      const btns = [1,2,3,4,5].map(p =>
        `<button class="point-btn${assignedPts === p ? ' active' : ''}" data-id="${photo.id}" data-pts="${p}">${p}</button>`
      ).join('');
      pointSelectorHtml = `
        <div class="point-selector">
          <div class="point-selector-label">得点を選ぶ：</div>
          ${btns}
        </div>`;
    }

    const scoreHtml = `<div class="score-display">⭐ ${photo.score||0}点</div>`;

    let actionHtml = '';
    if (canSelect) {
      if (isSelected) {
        actionHtml = `<button class="select-btn selected-btn" data-action="deselect" data-id="${photo.id}">✓ 選択中</button>`;
      } else {
        actionHtml = `<button class="select-btn" data-action="select" data-id="${photo.id}" ${maxReached ? 'disabled' : ''}>＋ 選ぶ</button>`;
      }
    }

    card.innerHTML = `
      <img src="${photo.dataUrl}" alt="${escHtml(photo.title)}" loading="lazy" />
      <div class="card-body">
        <div class="card-meta">
          <div class="card-title">${escHtml(photo.title)}</div>
          <div class="card-author">by ${escHtml(photo.author)}</div>
        </div>
        ${pointSelectorHtml}
        <div class="card-footer">${scoreHtml}${actionHtml}</div>
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
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      assignPoints(btn.dataset.id, parseInt(btn.dataset.pts, 10));
    });
  });

  updateVotePanel();
}

// ===== Selection =====
function selectPhoto(id) {
  if (!voterName || isVotingClosed()) return;
  if (Object.keys(pendingBallot).length >= 5) { showToast('⚠️ 最大5枚まで選べます'); return; }
  pendingBallot[id] = 0;
  renderGallery();
}

function deselectPhoto(id) {
  if (!voterName || isVotingClosed()) return;
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
  }
  updateVotePanel();
}

// ===== Vote Panel =====
function updateVotePanel() {
  if (isVotingClosed() || !voterName) { votePanel.classList.add('hidden'); return; }

  const entries = Object.entries(pendingBallot);
  if (entries.length === 0) { votePanel.classList.add('hidden'); return; }

  votePanel.classList.remove('hidden');
  votePanelName.textContent  = voterName + ' さん';
  votePanelCount.textContent = entries.length;

  const allAssigned = entries.every(([, pts]) => pts > 0);
  voteSubmitBtn.disabled = !allAssigned;

  votePanelChips.innerHTML = '';
  entries.forEach(([id, pts]) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;
    const chip = document.createElement('div');
    chip.className = 'panel-chip';
    chip.innerHTML = `
      <img class="panel-chip-thumb" src="${photo.dataUrl}" alt="" />
      <span class="panel-chip-title">${escHtml(photo.title)}</span>
      <span class="panel-chip-pts">${pts > 0 ? pts + '点' : '?点'}</span>`;
    votePanelChips.appendChild(chip);
  });
}

// ===== Submit Vote =====
voteSubmitBtn.addEventListener('click', submitVote);

function submitVote() {
  if (isVotingClosed() || !voterName) return;
  if (nameAlreadyVoted(voterName)) { showToast('⚠️ その名前はすでに投票済みです'); return; }

  const entries = Object.entries(pendingBallot);
  if (entries.length === 0) return;
  if (!entries.every(([, pts]) => pts > 0)) { showToast('⚠️ すべての写真に得点をつけてください'); return; }

  entries.forEach(([id, pts]) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;
    photo.score     = (photo.score     || 0) + pts;
    photo.voteCount = (photo.voteCount || 0) + 1;
  });

  voters.push({ name: voterName, votedAt: Date.now() });
  savePhotos(photos);
  saveVoters(voters);

  const name = voterName;
  voterName     = '';
  pendingBallot = {};
  voterNameInput.value  = '';
  voterNameStatus.textContent = '';
  voterNameStatus.className = 'voter-name-status';

  votePanel.classList.add('hidden');
  showToast(`🎉 ${name}さんの投票が完了しました！`);
  renderGallery();
}

// ===== Ranking =====
function renderRanking() {
  Array.from(rankingList.children).forEach(el => {
    if (el !== rankingEmpty) el.remove();
  });

  const closed = isVotingClosed();
  const list   = [...photos].sort((a,b) => (b.score||0) - (a.score||0));

  // Voter list + close button section
  const adminSection = document.createElement('div');
  adminSection.className = 'admin-section';

  if (!closed) {
    adminSection.innerHTML = `
      <div class="voter-list-header">
        <span>投票済み：<strong>${voters.length}人</strong></span>
        <button id="close-voting-btn" class="btn btn-close">🔒 投票を締め切る</button>
      </div>
      <div class="voter-chips">${
        voters.length === 0
          ? '<span class="no-voters">まだ誰も投票していません</span>'
          : voters.map(v => `<span class="voter-chip">${escHtml(v.name)}</span>`).join('')
      }</div>`;
  } else {
    adminSection.innerHTML = `
      <div class="voter-list-header closed-header">
        <span>🔒 投票終了　参加者：<strong>${voters.length}人</strong></span>
        <button id="reopen-voting-btn" class="btn btn-reopen">🔓 投票を再開する</button>
      </div>
      <div class="voter-chips">${
        voters.map(v => `<span class="voter-chip">${escHtml(v.name)}</span>`).join('')
      }</div>`;
  }
  rankingList.appendChild(adminSection);

  if (list.length === 0) {
    rankingEmpty.style.display = '';
  } else {
    rankingEmpty.style.display = 'none';
    list.forEach((photo, i) => {
      const rank      = i + 1;
      const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
      const medal     = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

      const item = document.createElement('div');
      item.className = `ranking-item ${rankClass}`;
      item.innerHTML = `
        <div class="rank-badge">${medal}</div>
        <img class="ranking-thumb" src="${photo.dataUrl}" alt="${escHtml(photo.title)}" />
        <div class="ranking-info">
          <div class="ranking-title">${escHtml(photo.title)}</div>
          <div class="ranking-author">by ${escHtml(photo.author)}</div>
          <div class="ranking-votes">${photo.voteCount || 0} 人が投票</div>
        </div>
        <div class="ranking-score">
          <div class="score-number">${photo.score || 0}</div>
          <div class="score-label">点</div>
        </div>`;
      rankingList.appendChild(item);
    });
  }

  document.getElementById('close-voting-btn')?.addEventListener('click', () => {
    if (confirm(`投票を締め切りますか？\n締め切ると新しい投票ができなくなります。`)) {
      closeVoting();
      showToast('🔒 投票を締め切りました');
      renderRanking();
      renderGallery();
    }
  });

  document.getElementById('reopen-voting-btn')?.addEventListener('click', () => {
    if (confirm('投票を再開しますか？')) {
      reopenVoting();
      showToast('🔓 投票を再開しました');
      renderRanking();
      renderGallery();
    }
  });
}

// ===== Upload =====
let pendingFile = null;

function checkSubmitReady() {
  submitBtn.disabled = !(pendingFile && uploaderName.value.trim() && photoTitle.value.trim());
}

uploaderName.addEventListener('input', checkSubmitReady);
photoTitle.addEventListener('input', checkSubmitReady);

dropZone.addEventListener('click', (e) => {
  if (e.target === previewImg) return;
  photoInput.click();
});

photoInput.addEventListener('change', () => {
  if (photoInput.files[0]) setPreview(photoInput.files[0]);
});

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) setPreview(file);
  else showToast('画像ファイルを選んでください');
});

// Resize & compress image. Uses createImageBitmap with imageOrientation:'from-image'
// so EXIF rotation is applied before drawing — fixes portrait photos from smartphones.
async function compressImage(file) {
  const MAX_SIDE = 1200;
  const QUALITY  = 0.82;
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

submitBtn.addEventListener('click', () => {
  if (!pendingFile) return;
  const photo = {
    id: crypto.randomUUID(), author: uploaderName.value.trim(),
    title: photoTitle.value.trim(), dataUrl: pendingFile,
    score: 0, voteCount: 0, createdAt: Date.now(),
  };
  photos.push(photo);
  savePhotos(photos);
  pendingFile = null;
  photoTitle.value = '';
  previewImg.classList.add('hidden');
  dropZoneInner.classList.remove('hidden');
  previewImg.src = '';
  photoInput.value = '';
  checkSubmitReady();
  showUploadMessage('投稿しました！ギャラリーで確認できます。', 'success');
  showToast('📸 写真を投稿しました！');
});

function showUploadMessage(text, type) {
  uploadMsg.textContent = text;
  uploadMsg.className = `upload-message ${type}`;
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
  }, 2400);
}

// ===== Helpers =====
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== Init =====
renderGallery();
