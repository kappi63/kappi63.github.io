// ===== Storage Helpers =====
const STORAGE_KEY = 'photobattle_photos';
const VOTES_KEY   = 'photobattle_votes';

function loadPhotos() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function savePhotos(photos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
}

function loadVotes() {
  try { return JSON.parse(localStorage.getItem(VOTES_KEY)) || {}; }
  catch { return {}; }
}

function saveVotes(votes) {
  localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
}

// ===== State =====
let photos = loadPhotos();
let votes  = loadVotes(); // { photoId: true } — IDs this browser has voted for
let currentSort = 'votes';

// ===== DOM refs =====
const navBtns     = document.querySelectorAll('.nav-btn');
const views       = document.querySelectorAll('.view');
const gallery     = document.getElementById('gallery');
const galleryEmpty = document.getElementById('gallery-empty');
const sortSelect  = document.getElementById('sort-select');
const rankingList = document.getElementById('ranking-list');
const rankingEmpty = document.getElementById('ranking-empty');

const uploaderName = document.getElementById('uploader-name');
const photoTitle   = document.getElementById('photo-title');
const photoInput   = document.getElementById('photo-input');
const dropZone     = document.getElementById('drop-zone');
const dropZoneInner = document.getElementById('drop-zone-inner');
const previewImg   = document.getElementById('preview-img');
const submitBtn    = document.getElementById('submit-btn');
const uploadMsg    = document.getElementById('upload-message');
const toast        = document.getElementById('toast');

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
  if (currentSort === 'votes')  copy.sort((a,b) => b.votes - a.votes);
  if (currentSort === 'newest') copy.sort((a,b) => b.createdAt - a.createdAt);
  if (currentSort === 'oldest') copy.sort((a,b) => a.createdAt - b.createdAt);
  return copy;
}

function renderGallery() {
  // Remove old cards (keep empty state element)
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
    const hasVoted = !!votes[photo.id];
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.dataset.id = photo.id;
    card.innerHTML = `
      <img src="${photo.dataUrl}" alt="${escHtml(photo.title)}" loading="lazy" />
      <div class="card-body">
        <div class="card-meta">
          <div class="card-title">${escHtml(photo.title)}</div>
          <div class="card-author">by ${escHtml(photo.author)}</div>
        </div>
        <div class="card-footer">
          <div class="vote-count">❤️ ${photo.votes} 票</div>
          <button class="vote-btn ${hasVoted ? 'voted' : ''}" data-id="${photo.id}" ${hasVoted ? 'disabled' : ''}>
            ${hasVoted ? '✓ 投票済み' : '❤️ いいね'}
          </button>
        </div>
      </div>
    `;
    gallery.appendChild(card);
  });

  // Vote buttons
  gallery.querySelectorAll('.vote-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => handleVote(btn.dataset.id));
  });
}

// ===== Voting =====
function handleVote(id) {
  if (votes[id]) return;

  const photo = photos.find(p => p.id === id);
  if (!photo) return;

  photo.votes += 1;
  votes[id] = true;
  savePhotos(photos);
  saveVotes(votes);

  showToast('❤️ いいねしました！');
  renderGallery();
}

// ===== Ranking =====
function renderRanking() {
  Array.from(rankingList.children).forEach(el => {
    if (el !== rankingEmpty) el.remove();
  });

  const list = [...photos].sort((a,b) => b.votes - a.votes);

  if (list.length === 0) {
    rankingEmpty.style.display = '';
    return;
  }
  rankingEmpty.style.display = 'none';

  list.forEach((photo, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

    const item = document.createElement('div');
    item.className = `ranking-item ${rankClass}`;
    item.innerHTML = `
      <div class="rank-badge">${medal}</div>
      <img class="ranking-thumb" src="${photo.dataUrl}" alt="${escHtml(photo.title)}" />
      <div class="ranking-info">
        <div class="ranking-title">${escHtml(photo.title)}</div>
        <div class="ranking-author">by ${escHtml(photo.author)}</div>
      </div>
      <div class="ranking-score">
        <div class="score-number">${photo.votes}</div>
        <div class="score-label">票</div>
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

// Click to open file picker
dropZone.addEventListener('click', (e) => {
  if (e.target === previewImg) return;
  photoInput.click();
});

photoInput.addEventListener('change', () => {
  if (photoInput.files[0]) setPreview(photoInput.files[0]);
});

// Drag & Drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) setPreview(file);
  else showToast('画像ファイルを選んでください');
});

function setPreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingFile = e.target.result;
    previewImg.src = pendingFile;
    previewImg.classList.remove('hidden');
    dropZoneInner.classList.add('hidden');
    checkSubmitReady();
  };
  reader.readAsDataURL(file);
}

submitBtn.addEventListener('click', () => {
  if (!pendingFile) return;

  const photo = {
    id:        crypto.randomUUID(),
    author:    uploaderName.value.trim(),
    title:     photoTitle.value.trim(),
    dataUrl:   pendingFile,
    votes:     0,
    createdAt: Date.now(),
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
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== Init =====
renderGallery();
