// ===== Storage Helpers =====
const STORAGE_KEY  = 'photobattle_photos';
const VOTED_KEY    = 'photobattle_voted'; // boolean: has this browser submitted a ballot?

function loadPhotos() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function savePhotos(photos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
  } catch (e) {
    // localStorage quota exceeded — remove oldest photo and retry once
    if (photos.length > 1) {
      const sorted = [...photos].sort((a, b) => a.createdAt - b.createdAt);
      const trimmed = photos.filter(p => p.id !== sorted[0].id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        showToast('⚠️ 容量不足のため古い写真を1枚削除しました');
      } catch (_) {
        showToast('⚠️ 保存に失敗しました。ブラウザの容量が足りません');
      }
    } else {
      showToast('⚠️ 保存に失敗しました。ブラウザの容量が足りません');
    }
  }
}

function hasVoted() {
  return localStorage.getItem(VOTED_KEY) === 'true';
}

function markVoted() {
  localStorage.setItem(VOTED_KEY, 'true');
}

// ===== State =====
let photos      = loadPhotos();
let currentSort = 'score';

// pendingBallot: { photoId -> points (1-5) }
// Max 5 entries. Only used before voting.
let pendingBallot = {};

// ===== DOM refs =====
const navBtns      = document.querySelectorAll('.nav-btn');
const views        = document.querySelectorAll('.view');
const gallery      = document.getElementById('gallery');
const galleryEmpty = document.getElementById('gallery-empty');
const sortSelect   = document.getElementById('sort-select');
const rankingList  = document.getElementById('ranking-list');
const rankingEmpty = document.getElementById('ranking-empty');
const votePanel    = document.getElementById('vote-panel');
const votePanelCount = document.getElementById('vote-panel-count');
const votePanelChips = document.getElementById('vote-panel-chips');
const voteSubmitBtn  = document.getElementById('vote-submit-btn');
const votedBanner    = document.getElementById('voted-banner');
const voteInstructions = document.getElementById('vote-instructions');

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

// ===== Gallery =====
function sortedPhotos() {
  const copy = [...photos];
  if (currentSort === 'score')  copy.sort((a,b) => b.score - a.score);
  if (currentSort === 'newest') copy.sort((a,b) => b.createdAt - a.createdAt);
  if (currentSort === 'oldest') copy.sort((a,b) => a.createdAt - b.createdAt);
  return copy;
}

function renderGallery() {
  const alreadyVoted = hasVoted();

  // Show/hide top banners
  if (alreadyVoted) {
    votedBanner.classList.remove('hidden');
    voteInstructions.classList.add('hidden');
  } else {
    votedBanner.classList.add('hidden');
    voteInstructions.classList.remove('hidden');
  }

  // Clear cards (keep empty state)
  Array.from(gallery.children).forEach(el => {
    if (el !== galleryEmpty) el.remove();
  });

  const list = sortedPhotos();

  if (list.length === 0) {
    galleryEmpty.style.display = '';
    return;
  }
  galleryEmpty.style.display = 'none';

  list.forEach(photo => {
    const isSelected  = photo.id in pendingBallot;  // fix: 0 is falsy so use `in`
    const assignedPts = pendingBallot[photo.id] || 0;
    const maxReached  = Object.keys(pendingBallot).length >= 5;

    const card = document.createElement('div');
    card.className = 'photo-card' +
      (isSelected ? ' selected' : '') +
      (alreadyVoted ? ' voted-card' : '');
    card.dataset.id = photo.id;

    // Build point selector HTML (only when selected and not yet voted)
    let pointSelectorHtml = '';
    if (isSelected && !alreadyVoted) {
      const btns = [1,2,3,4,5].map(p =>
        `<button class="point-btn${assignedPts === p ? ' active' : ''}" data-id="${photo.id}" data-pts="${p}">${p}</button>`
      ).join('');
      pointSelectorHtml = `
        <div class="point-selector" data-id="${photo.id}">
          <div class="point-selector-label">得点を選ぶ：</div>
          ${btns}
        </div>
      `;
    }

    // Score/vote info
    const scoreHtml = alreadyVoted
      ? `<div class="score-display">⭐ ${photo.score}点 / ${photo.voteCount}票</div>`
      : `<div class="score-display">⭐ ${photo.score}点</div>`;

    // Select / deselect button
    let actionHtml = '';
    if (!alreadyVoted) {
      if (isSelected) {
        actionHtml = `<button class="select-btn selected-btn" data-action="deselect" data-id="${photo.id}">✓ 選択中</button>`;
      } else {
        const disabled = maxReached ? 'disabled' : '';
        actionHtml = `<button class="select-btn" data-action="select" data-id="${photo.id}" ${disabled}>＋ 選ぶ</button>`;
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
        <div class="card-footer">
          ${scoreHtml}
          ${actionHtml}
        </div>
      </div>
    `;
    gallery.appendChild(card);
  });

  // Bind select/deselect buttons
  gallery.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id     = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'select')   selectPhoto(id);
      if (action === 'deselect') deselectPhoto(id);
    });
  });

  // Bind point buttons
  gallery.querySelectorAll('.point-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id  = btn.dataset.id;
      const pts = parseInt(btn.dataset.pts, 10);
      assignPoints(id, pts);
    });
  });

  updateVotePanel();
}

// ===== Selection =====
function selectPhoto(id) {
  if (hasVoted()) return;
  if (Object.keys(pendingBallot).length >= 5) {
    showToast('⚠️ 最大5枚まで選べます');
    return;
  }
  pendingBallot[id] = 0; // no points yet
  renderGallery();
}

function deselectPhoto(id) {
  if (hasVoted()) return;
  delete pendingBallot[id];
  renderGallery();
}

function assignPoints(id, pts) {
  if (!pendingBallot.hasOwnProperty(id)) return;
  pendingBallot[id] = pts;
  // Re-render just the point buttons for this card to avoid full redraw flicker
  const card = gallery.querySelector(`.photo-card[data-id="${id}"]`);
  if (card) {
    card.querySelectorAll('.point-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.pts, 10) === pts);
    });
  }
  updateVotePanel();
}

// ===== Vote Panel =====
function updateVotePanel() {
  if (hasVoted()) {
    votePanel.classList.add('hidden');
    return;
  }

  const entries = Object.entries(pendingBallot); // [ [id, pts], ... ]

  if (entries.length === 0) {
    votePanel.classList.add('hidden');
    return;
  }

  votePanel.classList.remove('hidden');
  votePanelCount.textContent = entries.length;

  // Check all selected photos have points assigned
  const allAssigned = entries.every(([, pts]) => pts > 0);
  voteSubmitBtn.disabled = !allAssigned;

  // Render chips
  votePanelChips.innerHTML = '';
  entries.forEach(([id, pts]) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;
    const chip = document.createElement('div');
    chip.className = 'panel-chip';
    chip.innerHTML = `
      <img class="panel-chip-thumb" src="${photo.dataUrl}" alt="" />
      <span class="panel-chip-title">${escHtml(photo.title)}</span>
      <span class="panel-chip-pts">${pts > 0 ? pts + '点' : '?点'}</span>
    `;
    votePanelChips.appendChild(chip);
  });
}

// ===== Submit Vote =====
voteSubmitBtn.addEventListener('click', submitVote);

function submitVote() {
  if (hasVoted()) return;

  const entries = Object.entries(pendingBallot);
  if (entries.length === 0) return;
  if (!entries.every(([, pts]) => pts > 0)) {
    showToast('⚠️ すべての写真に得点をつけてください');
    return;
  }

  // Apply scores to photos
  entries.forEach(([id, pts]) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;
    photo.score      = (photo.score || 0) + pts;
    photo.voteCount  = (photo.voteCount || 0) + 1;
  });

  savePhotos(photos);
  markVoted();
  pendingBallot = {};

  votePanel.classList.add('hidden');
  showToast('🎉 投票が完了しました！');
  renderGallery();
}

// ===== Ranking =====
function renderRanking() {
  Array.from(rankingList.children).forEach(el => {
    if (el !== rankingEmpty) el.remove();
  });

  const list = [...photos].sort((a,b) => (b.score||0) - (a.score||0));

  if (list.length === 0) {
    rankingEmpty.style.display = '';
    return;
  }
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
      </div>
    `;
    rankingList.appendChild(item);
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
  if (photoInput.files[0]) setPreview(photoInput.files[0]);  // async, intentionally not awaited
});

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) setPreview(file);  // async, intentionally not awaited
  else showToast('画像ファイルを選んでください');
});

// Resize & compress image to keep localStorage usage low (max 1200px wide, JPEG 0.82)
function compressImage(file) {
  return new Promise((resolve) => {
    const MAX_W = 1200;
    const QUALITY = 0.82;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // fallback: read as-is
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    };
    img.src = url;
  });
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
    id:         crypto.randomUUID(),
    author:     uploaderName.value.trim(),
    title:      photoTitle.value.trim(),
    dataUrl:    pendingFile,
    score:      0,
    voteCount:  0,
    createdAt:  Date.now(),
  };

  photos.push(photo);
  savePhotos(photos);

  // Reset form
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
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== Init =====
renderGallery();
