/* ============================================================
   PetCard · FurParent Suite — main.js
   Depends on: supabase-client.js
============================================================ */

// ============ HELPERS ============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${type === 'error' ? '#b91c1c' : '#0e3554'};color:#fff;
    padding:12px 20px;border-radius:8px;font-size:0.85rem;
    box-shadow:0 8px 20px rgba(0,0,0,0.15);max-width:320px;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/**
 * Require a valid profile with `id`.
 * Redirects to login if missing. Returns the profile or null.
 */
async function requireProfile() {
  let profile;
  try {
    profile = await Auth.getCurrentProfile();
  } catch (err) {
    console.error('[PetCard] getCurrentProfile failed:', err);
    toast(err.message || 'Session error', 'error');
    await Auth.signOut();
    location.href = 'login.html';
    return null;
  }

  if (!profile || !profile.id) {
    console.warn('[PetCard] Invalid profile, redirecting:', profile);
    toast('Session expired. Please sign in again.', 'error');
    await Auth.signOut();
    location.href = 'login.html';
    return null;
  }
  return profile;
}

// ============ SIDEBAR ============
function initSidebar(activePage) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const toggle = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');

  if (toggle) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  // Highlight active link
  $$('.sidebar-nav a').forEach(a => {
    if (a.getAttribute('href') === activePage) a.classList.add('active');
  });

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await Auth.signOut();
      location.href = 'login.html';
    });
  }
}

async function renderSidebarUser() {
  const profile = await Auth.getCurrentProfile();
  if (!profile) return;

  const nameEl = document.getElementById('sidebarUserName');
  const idEl = document.getElementById('sidebarUserId');
  const avatarEl = document.getElementById('sidebarUserAvatar');

  if (nameEl) nameEl.textContent = profile.full_name || 'FurParent';
  if (idEl) idEl.textContent = profile.furparent_id || '';
  if (avatarEl) {
    if (profile.avatar_url) {
      avatarEl.innerHTML = `<img src="${profile.avatar_url}" alt="">`;
    } else {
      avatarEl.innerHTML = `<i class="fa-solid fa-user"></i>`;
    }
  }
}

// ============ LANDING ============
async function initLanding() {
  const session = await Auth.getSession();
  const ctaContainer = document.getElementById('landingCta');
  if (!ctaContainer) return;

  if (session) {
    ctaContainer.innerHTML = `
      <a href="dashboard.html" class="btn btn-primary">Go to Dashboard</a>
      <a href="#" id="landingLogout" class="btn btn-outline">Logout</a>
    `;
    document.getElementById('landingLogout').addEventListener('click', async (e) => {
      e.preventDefault();
      await Auth.signOut();
      location.reload();
    });
  }
}

// ============ LOGIN ============
function initLoginPage() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  if (!loginForm) return;

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  // LOGIN
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = loginForm.querySelector('button[type=submit]');
    btn.disabled = true;

    try {
      await Auth.signIn(email, password);

      // Force fresh fetch
      const profile = await Auth.getCurrentProfile(true);

      if (!profile || !profile.id) {
        throw new Error('Profile not found. Please contact support.');
      }
      if (profile.status === 'suspended') {
        await Auth.signOut();
        throw new Error('Your account has been suspended.');
      }

      if (profile.role === 'admin') {
        location.href = 'admin-dashboard.html';
      } else {
        location.href = 'dashboard.html';
      }
    } catch (err) {
      console.error('[Login]', err);
      toast(err.message || 'Login failed', 'error');
      btn.disabled = false;
    }
  });

  // REGISTER
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const btn = registerForm.querySelector('button[type=submit]');
    btn.disabled = true;

    try {
      const { user, session } = await Auth.signUp(email, password, { full_name: name });

      if (!user) throw new Error('Sign-up failed');

      // If email confirmation is ON, session will be null
      if (!session) {
        toast('Check your email to verify your account, then sign in.');
        setTimeout(() => location.href = 'login.html', 2500);
        return;
      }

      // Create profile immediately
      const furparentId = 'FP-' +
        Math.floor(1000 + Math.random() * 9000) + '-' +
        Math.floor(1000 + Math.random() * 9000);

      try {
        await ProfileAPI.create({
          auth_id: user.id,
          email,
          full_name: name,
          furparent_id: furparentId,
          role: 'furparent',
          status: 'active'
        });
      } catch (createErr) {
        console.warn('[Register] Profile create failed, will auto-create on login:', createErr);
      }

      toast('Account created successfully');
      location.href = 'profile.html';
    } catch (err) {
      console.error('[Register]', err);
      toast(err.message || 'Registration failed', 'error');
      btn.disabled = false;
    }
  });
}

// ============ PROFILE ============
async function initProfilePage() {
  const form = document.getElementById('profileForm');
  if (!form) return;

  initSidebar('profile.html');
  renderSidebarUser();

  const profile = await requireProfile();
  if (!profile) return;

  // Populate
  document.getElementById('pName').value = profile.full_name || '';
  document.getElementById('pEmail').value = profile.email || '';
  document.getElementById('pPhone').value = profile.phone || '';
  document.getElementById('pCity').value = profile.city || '';
  document.getElementById('pAddress').value = profile.address || '';
  document.getElementById('displayFurparentId').textContent = profile.furparent_id;

  // Avatar
  const avatarBox = document.getElementById('profileAvatarBox');
  if (profile.avatar_url) {
    avatarBox.innerHTML = `<img src="${profile.avatar_url}" alt="">`;
  }

  // Upload avatar
  const avatarInput = document.getElementById('avatarInput');
  const avatarBtn = document.getElementById('avatarBtn');
  if (avatarBtn && avatarInput) {
    avatarBtn.addEventListener('click', () => avatarInput.click());

    avatarInput.addEventListener('change', async () => {
      const file = avatarInput.files[0];
      if (!file) return;
      try {
        const url = await ProfileAPI.uploadAvatar(file, profile.auth_id);
        avatarBox.innerHTML = `<img src="${url}" alt="">`;
        await ProfileAPI.update(profile.id, { avatar_url: url });
        toast('Photo updated');
        renderSidebarUser();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // Save
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;

    try {
      await ProfileAPI.update(profile.id, {
        full_name: document.getElementById('pName').value.trim(),
        phone: document.getElementById('pPhone').value.trim(),
        city: document.getElementById('pCity').value.trim(),
        address: document.getElementById('pAddress').value.trim()
      });
      toast('Profile saved');
      renderSidebarUser();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ============ DASHBOARD ============
async function initDashboard() {
  const petList = document.getElementById('petList');
  if (!petList) return;

  initSidebar('dashboard.html');
  renderSidebarUser();

  const profile = await requireProfile();
  if (!profile) return;

  document.getElementById('welcomeName').textContent = profile.full_name || 'FurParent';

  // ---------- Load pets ----------
  async function loadPets() {
    let pets = [];
    try {
      pets = await PetAPI.list(profile.id);
    } catch (err) {
      console.error('[Dashboard] loadPets', err);
    }

    petList.innerHTML = '';

    if (!pets.length) {
      petList.innerHTML = `
        <div class="empty">
          <i class="fa-solid fa-paw"></i>
          <p>No pets yet. Add your first pet to get started.</p>
        </div>`;
    } else {
      pets.forEach(pet => {
        const icon = pet.species === 'Cat' ? 'fa-cat' :
                     pet.species === 'Bird' ? 'fa-dove' :
                     pet.species === 'Rabbit' ? 'fa-rabbit' :
                     pet.species === 'Dog' ? 'fa-dog' : 'fa-paw';

        const card = document.createElement('div');
        card.className = 'pet-card';
        card.innerHTML = `
          <div class="pet-card-avatar">
            ${pet.photo_url ? `<img src="${pet.photo_url}" alt="">` : `<i class="fa-solid ${icon}"></i>`}
          </div>
          <div class="pet-card-info">
            <h4>${escapeHtml(pet.name)}</h4>
            <p>${escapeHtml(pet.species || '')} · ${escapeHtml(pet.breed || 'Unknown breed')} · ${pet.age || '?'} yrs</p>
            <span class="pet-id-badge">${escapeHtml(pet.pet_id)}</span>
          </div>
          <i class="fa-solid fa-chevron-right" style="color:#cbd5e1;"></i>
        `;
        card.addEventListener('click', () => {
          location.href = `pet-detail.html?id=${pet.id}`;
        });
        petList.appendChild(card);
      });
    }

    const statEl = document.getElementById('statPets');
    if (statEl) statEl.textContent = pets.length;
    return pets;
  }

  // ---------- Load upcoming events ----------
  async function loadUpcoming() {
    let events = [];
    try {
      events = await EventAPI.listUpcoming(profile.id);
    } catch (err) {
      console.error('[Dashboard] loadUpcoming', err);
    }

    const list = document.getElementById('upcomingList');
    list.innerHTML = '';

    if (!events.length) {
      list.innerHTML = `<div class="empty"><i class="fa-regular fa-calendar"></i><p>No upcoming events</p></div>`;
    } else {
      events.slice(0, 6).forEach(ev => {
        const icons = {
          checkup: 'fa-stethoscope',
          birthday: 'fa-cake-candles',
          died: 'fa-dove',
          groom: 'fa-scissors',
          daily: 'fa-sun'
        };
        const item = document.createElement('div');
        item.className = 'pet-card';
        item.style.cursor = 'default';
        item.innerHTML = `
          <div class="pet-card-avatar" style="font-size:1rem;">
            <i class="fa-solid ${icons[ev.event_type] || 'fa-calendar'}"></i>
          </div>
          <div class="pet-card-info">
            <h4>${escapeHtml(ev.title)}</h4>
            <p>${escapeHtml(ev.pets?.name || '')} · ${formatDate(ev.event_date)}</p>
          </div>
        `;
        list.appendChild(item);
      });
    }

    const statEl = document.getElementById('statEvents');
    if (statEl) statEl.textContent = events.length;
  }

  // ---------- Calendar ----------
  const calendarState = { year: 0, month: 0, selected: null };

  function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('calendarLabel');
    if (!grid) return;

    const y = calendarState.year;
    const m = calendarState.month;
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev = new Date(y, m, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const selectedStr = calendarState.selected;

    label.textContent = new Date(y, m).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let html = '';
    dayNames.forEach(d => html += `<div class="calendar-day-name">${d}</div>`);

    // Prev month fill
    for (let i = firstDay - 1; i >= 0; i--) {
      html += `<div class="calendar-day other-month">${daysInPrev - i}</div>`;
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const cls = ['calendar-day'];
      if (dateStr === todayStr) cls.push('today');
      if (dateStr === selectedStr) cls.push('selected');
      html += `<div class="${cls.join(' ')}" data-date="${dateStr}">${d}</div>`;
    }

    // Next month fill
    const total = firstDay + daysInMonth;
    const remaining = (7 - (total % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      html += `<div class="calendar-day other-month">${i}</div>`;
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.calendar-day[data-date]').forEach(el => {
      el.addEventListener('click', () => {
        calendarState.selected = el.dataset.date;
        renderCalendar();
        showDayEvents(el.dataset.date);
      });
    });
  }

  async function showDayEvents(dateStr) {
    const list = document.getElementById('dayEventsList');
    if (!list) return;
    list.innerHTML = '<p class="text-muted">Loading...</p>';

    try {
      const events = await EventAPI.listByDate(profile.id, dateStr);
      list.innerHTML = '';

      if (!events.length) {
        list.innerHTML = `<p class="text-muted" style="font-size:0.85rem;">No events on ${formatDate(dateStr)}</p>`;
        return;
      }

      events.forEach(ev => {
        const icons = {
          checkup: 'fa-stethoscope',
          birthday: 'fa-cake-candles',
          died: 'fa-dove',
          groom: 'fa-scissors',
          daily: 'fa-sun'
        };
        const item = document.createElement('div');
        item.className = 'pet-card';
        item.style.cursor = 'default';
        item.style.padding = '12px';
        item.innerHTML = `
          <div class="pet-card-avatar" style="width:36px;height:36px;font-size:0.9rem;">
            <i class="fa-solid ${icons[ev.event_type] || 'fa-calendar'}"></i>
          </div>
          <div class="pet-card-info">
            <h4 style="font-size:0.85rem;">${escapeHtml(ev.title)}</h4>
            <p style="font-size:0.72rem;">${escapeHtml(ev.pets?.name || '')}</p>
          </div>
        `;
        list.appendChild(item);
      });
    } catch (err) {
      list.innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
    }
  }

  // Calendar nav
  const today = new Date();
  calendarState.year = today.getFullYear();
  calendarState.month = today.getMonth();

  const calPrev = document.getElementById('calPrev');
  const calNext = document.getElementById('calNext');
  if (calPrev) {
    calPrev.addEventListener('click', () => {
      calendarState.month--;
      if (calendarState.month < 0) { calendarState.month = 11; calendarState.year--; }
      renderCalendar();
    });
  }
  if (calNext) {
    calNext.addEventListener('click', () => {
      calendarState.month++;
      if (calendarState.month > 11) { calendarState.month = 0; calendarState.year++; }
      renderCalendar();
    });
  }

  // Init
  renderCalendar();
  await loadPets();
  await loadUpcoming();

  // Diary count — uses events for now (per-pet diary is on pet-detail page)
  const statDiaryEl = document.getElementById('statDiary');
  if (statDiaryEl) statDiaryEl.textContent = '—';
}

// ============ ADD PET ============
async function initAddPetPage() {
  const form = document.getElementById('addPetForm');
  if (!form) return;

  initSidebar('add-pet.html');
  renderSidebarUser();

  const profile = await requireProfile();
  if (!profile) return;

  document.getElementById('previewPetId').textContent = PetAPI.generatePetId();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;

    try {
      const pet = await PetAPI.create({
        furparent_id: profile.id,                 // ✅ now a real uuid
        pet_id: PetAPI.generatePetId(),
        name: document.getElementById('petName').value.trim(),
        species: document.getElementById('petSpecies').value,
        breed: document.getElementById('petBreed').value.trim(),
        age: parseInt(document.getElementById('petAge').value) || null,
        gender: document.getElementById('petGender').value,
        color: document.getElementById('petColor').value.trim(),
        notes: document.getElementById('petNotes').value.trim(),
        microchip: Math.floor(900000000000000 + Math.random() * 99999999999999).toString()
      });

      // Optional photo
      const photoInput = document.getElementById('petPhoto');
      if (photoInput && photoInput.files[0]) {
        try {
          const url = await PetAPI.uploadPhoto(photoInput.files[0], pet.id);
          await PetAPI.update(pet.id, { photo_url: url });
        } catch (photoErr) {
          console.warn('[AddPet] Photo upload failed:', photoErr);
        }
      }

      toast('Pet added successfully');
      location.href = 'dashboard.html';
    } catch (err) {
      console.error('[AddPet]', err);
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ============ PET DETAIL ============
async function initPetDetailPage() {
  const wrap = document.getElementById('petDetailWrap');
  if (!wrap) return;

  initSidebar('');
  renderSidebarUser();

  const profile = await requireProfile();
  if (!profile) return;

  const petId = new URLSearchParams(location.search).get('id');
  if (!petId) { location.href = 'dashboard.html'; return; }

  let pet;
  try {
    pet = await PetAPI.get(petId);
  } catch (err) {
    console.error('[PetDetail]', err);
    toast('Pet not found', 'error');
    location.href = 'dashboard.html';
    return;
  }
  if (!pet) {
    toast('Pet not found', 'error');
    location.href = 'dashboard.html';
    return;
  }

  // Header
  document.getElementById('petNameHeader').textContent = pet.name;
  document.getElementById('petIdHeader').textContent = pet.pet_id;

  // Avatar
  const avatarBox = document.getElementById('petAvatarBox');
  if (pet.photo_url) {
    avatarBox.innerHTML = `<img src="${pet.photo_url}" alt="">`;
  } else {
    const icon = pet.species === 'Cat' ? 'fa-cat' :
                 pet.species === 'Bird' ? 'fa-dove' :
                 pet.species === 'Rabbit' ? 'fa-rabbit' :
                 pet.species === 'Dog' ? 'fa-dog' : 'fa-paw';
    avatarBox.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  }

  // Photo upload
  const petPhotoInput = document.getElementById('petPhotoInput');
  const petPhotoBtn = document.getElementById('petPhotoBtn');
  if (petPhotoBtn && petPhotoInput) {
    petPhotoBtn.addEventListener('click', () => petPhotoInput.click());

    petPhotoInput.addEventListener('change', async () => {
      const file = petPhotoInput.files[0];
      if (!file) return;
      try {
        const url = await PetAPI.uploadPhoto(file, pet.id);
        await PetAPI.update(pet.id, { photo_url: url });
        avatarBox.innerHTML = `<img src="${url}" alt="">`;
        toast('Photo updated');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // Edit form
  const editForm = document.getElementById('editPetForm');
  document.getElementById('ePetName').value = pet.name || '';
  document.getElementById('ePetSpecies').value = pet.species || 'Dog';
  document.getElementById('ePetBreed').value = pet.breed || '';
  document.getElementById('ePetAge').value = pet.age || '';
  document.getElementById('ePetGender').value = pet.gender || 'Male';
  document.getElementById('ePetColor').value = pet.color || '';
  document.getElementById('ePetNotes').value = pet.notes || '';

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = editForm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await PetAPI.update(pet.id, {
        name: document.getElementById('ePetName').value.trim(),
        species: document.getElementById('ePetSpecies').value,
        breed: document.getElementById('ePetBreed').value.trim(),
        age: parseInt(document.getElementById('ePetAge').value) || null,
        gender: document.getElementById('ePetGender').value,
        color: document.getElementById('ePetColor').value.trim(),
        notes: document.getElementById('ePetNotes').value.trim()
      });
      toast('Pet updated');
      document.getElementById('petNameHeader').textContent = document.getElementById('ePetName').value.trim();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // Delete pet
  const deletePetBtn = document.getElementById('deletePetBtn');
  if (deletePetBtn) {
    deletePetBtn.addEventListener('click', async () => {
      if (!confirm('Delete this pet and all its records?')) return;
      try {
        await PetAPI.remove(pet.id);
        toast('Pet deleted');
        location.href = 'dashboard.html';
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // View card
  const viewCardBtn = document.getElementById('viewCardBtn');
  if (viewCardBtn) {
    viewCardBtn.addEventListener('click', () => {
      location.href = `pet-card.html?id=${pet.id}`;
    });
  }

  // ---------- Diary ----------
  const diaryList = document.getElementById('diaryList');

  async function loadDiary() {
    let entries = [];
    try {
      entries = await DiaryAPI.list(pet.id);
    } catch (err) {
      console.error('[Diary]', err);
    }

    diaryList.innerHTML = '';
    if (!entries.length) {
      diaryList.innerHTML = `<div class="empty"><i class="fa-regular fa-note-sticky"></i><p>No diary entries</p></div>`;
      return;
    }

    entries.forEach(en => {
      const item = document.createElement('div');
      item.className = 'pet-card';
      item.style.cursor = 'default';
      item.style.padding = '12px 14px';
      item.innerHTML = `
        <div class="pet-card-info" style="min-width:0;">
          <p style="font-size:0.85rem;color:var(--text);white-space:normal;">${escapeHtml(en.entry)}</p>
          <p style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">${formatDate(en.created_at)}</p>
        </div>
        <button class="btn btn-danger btn-sm" data-del="${en.id}"><i class="fa-solid fa-trash"></i></button>
      `;
      item.querySelector('[data-del]').addEventListener('click', async () => {
        try {
          await DiaryAPI.remove(en.id);
          loadDiary();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
      diaryList.appendChild(item);
    });
  }

  const addDiaryBtn = document.getElementById('addDiaryBtn');
  if (addDiaryBtn) {
    addDiaryBtn.addEventListener('click', async () => {
      const input = document.getElementById('diaryInput');
      const entry = input.value.trim();
      if (!entry) return;
      try {
        await DiaryAPI.add({
          pet_id: pet.id,
          furparent_id: profile.id,
          entry
        });
        input.value = '';
        loadDiary();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ---------- Events / Calendar per pet ----------
  const eventList = document.getElementById('eventList');

  async function loadEvents() {
    let events = [];
    try {
      events = await EventAPI.list(pet.id);
    } catch (err) {
      console.error('[Events]', err);
    }

    eventList.innerHTML = '';
    if (!events.length) {
      eventList.innerHTML = `<div class="empty"><i class="fa-regular fa-calendar"></i><p>No events</p></div>`;
      return;
    }

    events.forEach(ev => {
      const icons = {
        checkup: 'fa-stethoscope',
        birthday: 'fa-cake-candles',
        died: 'fa-dove',
        groom: 'fa-scissors',
        daily: 'fa-sun'
      };
      const item = document.createElement('div');
      item.className = 'pet-card';
      item.style.cursor = 'default';
      item.style.padding = '12px 14px';
      item.innerHTML = `
        <div class="pet-card-avatar" style="width:34px;height:34px;font-size:0.85rem;">
          <i class="fa-solid ${icons[ev.event_type] || 'fa-calendar'}"></i>
        </div>
        <div class="pet-card-info">
          <h4 style="font-size:0.85rem;">${escapeHtml(ev.title)}</h4>
          <p style="font-size:0.72rem;">${formatDate(ev.event_date)}</p>
        </div>
        <button class="btn btn-danger btn-sm" data-del="${ev.id}"><i class="fa-solid fa-trash"></i></button>
      `;
      item.querySelector('[data-del]').addEventListener('click', async () => {
        try {
          await EventAPI.remove(ev.id);
          loadEvents();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
      eventList.appendChild(item);
    });
  }

  const addEventBtn = document.getElementById('addEventBtn');
  if (addEventBtn) {
    addEventBtn.addEventListener('click', async () => {
      const type = document.getElementById('eventType').value;
      const title = document.getElementById('eventTitle').value.trim();
      const date = document.getElementById('eventDate').value;
      const desc = document.getElementById('eventDesc').value.trim();

      if (!title || !date) { toast('Title and date required', 'error'); return; }

      try {
        await EventAPI.add({
          pet_id: pet.id,
          furparent_id: profile.id,
          event_type: type,
          title,
          description: desc,
          event_date: date
        });
        document.getElementById('eventTitle').value = '';
        document.getElementById('eventDate').value = '';
        document.getElementById('eventDesc').value = '';
        loadEvents();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // Init
  await loadDiary();
  await loadEvents();
}

// ============ PET CARD (flip) ============
async function initPetCardPage() {
  const flipCard = document.getElementById('petFlipCard');
  if (!flipCard) return;

  initSidebar('');
  renderSidebarUser();

  const profile = await requireProfile();
  if (!profile) return;

  const petId = new URLSearchParams(location.search).get('id');
  let pet;
  if (petId) {
    try { pet = await PetAPI.get(petId); } catch { pet = null; }
  }
  if (!pet) {
    const pets = await PetAPI.list(profile.id);
    pet = pets[0];
  }

  if (!pet) {
    toast('No pet found', 'error');
    location.href = 'dashboard.html';
    return;
  }

  // Fill
  document.getElementById('cardPetName').textContent = pet.name;
  document.getElementById('cardPetId').textContent = pet.pet_id;
  document.getElementById('cardPetSpecies').textContent = pet.species || '—';
  document.getElementById('cardPetBreed').textContent = pet.breed || '—';
  document.getElementById('cardOwnerName').textContent = profile.full_name || '—';
  document.getElementById('cardDate').textContent = formatDate(pet.created_at);
  document.getElementById('cardMicrochip').textContent = pet.microchip || '—';

  const photoBox = document.getElementById('cardPetPhoto');
  if (pet.photo_url) {
    photoBox.innerHTML = `<img src="${pet.photo_url}" alt="">`;
  } else {
    const icon = pet.species === 'Cat' ? 'fa-cat' :
                 pet.species === 'Bird' ? 'fa-dove' :
                 pet.species === 'Rabbit' ? 'fa-rabbit' :
                 pet.species === 'Dog' ? 'fa-dog' : 'fa-paw';
    photoBox.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  }

  flipCard.addEventListener('click', () => flipCard.classList.toggle('flipped'));
}

// ============ FURPARENT CARD (flip) ============
async function initFurparentCardPage() {
  const flipCard = document.getElementById('furparentFlipCard');
  if (!flipCard) return;

  initSidebar('furparent-card.html');
  renderSidebarUser();

  const profile = await requireProfile();
  if (!profile) return;

  let pets = [];
  try {
    pets = await PetAPI.list(profile.id);
  } catch (err) {
    console.error('[FurparentCard] pets', err);
  }

  document.getElementById('fpCardName').textContent = profile.full_name || '—';
  document.getElementById('fpCardId').textContent = profile.furparent_id;
  document.getElementById('fpCardEmail').textContent = profile.email;
  document.getElementById('fpCardCity').textContent = profile.city || '—';
  document.getElementById('fpCardPetCount').textContent = pets.length;
  document.getElementById('fpSince').textContent = new Date(profile.created_at).getFullYear();
  document.getElementById('fpPhone').textContent = profile.phone || '—';
  document.getElementById('fpAddress').textContent = profile.address || '—';

  const photoBox = document.getElementById('fpCardPhoto');
  if (profile.avatar_url) {
    photoBox.innerHTML = `<img src="${profile.avatar_url}" alt="">`;
  }

  flipCard.addEventListener('click', () => flipCard.classList.toggle('flipped'));
}

// ============ ADMIN ============
async function initAdminDashboard() {
  const table = document.getElementById('adminTable');
  if (!table) return;

  const profile = await Auth.getCurrentProfile();
  if (!profile || profile.role !== 'admin') {
    toast('Admin access required', 'error');
    location.href = 'login.html';
    return;
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await Auth.signOut();
      location.href = 'login.html';
    });
  }

  async function load() {
    const users = await ProfileAPI.listAll();
    table.innerHTML = '';

    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="pet-card-avatar" style="width:34px;height:34px;font-size:0.9rem;">
              ${u.avatar_url ? `<img src="${u.avatar_url}" alt="">` : `<i class="fa-solid fa-user"></i>`}
            </div>
            <div>
              <div style="font-weight:600;color:var(--navy);">${escapeHtml(u.full_name || '—')}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(u.email)}</div>
            </div>
          </div>
        </td>
        <td><span style="font-family:monospace;font-size:0.8rem;">${escapeHtml(u.furparent_id)}</span></td>
        <td>${escapeHtml(u.city || '—')}</td>
        <td><span class="badge badge-${u.status || 'active'}">${u.status || 'active'}</span></td>
        <td>${escapeHtml((u.role || 'furparent'))}</td>
        <td>${formatDate(u.created_at)}</td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-outline btn-sm" data-role="${u.id}" data-current="${u.role}">
              <i class="fa-solid fa-user-shield"></i>
            </button>
            <button class="btn btn-outline btn-sm" data-status="${u.id}" data-current="${u.status}">
              <i class="fa-solid fa-toggle-on"></i>
            </button>
          </div>
        </td>
      `;
      table.appendChild(tr);
    });

    // Role toggle
    table.querySelectorAll('[data-role]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.role;
        const current = btn.dataset.current;
        const next = current === 'admin' ? 'furparent' : 'admin';
        await sb.from('furparents').update({ role: next }).eq('id', id);
        load();
      });
    });

    // Status toggle
    table.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.status;
        const current = btn.dataset.current;
        const next = current === 'active' ? 'suspended' : 'active';
        await ProfileAPI.setStatus(id, next);
        load();
      });
    });

    document.getElementById('adminTotal').textContent = users.length;
    document.getElementById('adminActive').textContent = users.filter(u => u.status === 'active').length;
    document.getElementById('adminSuspended').textContent = users.filter(u => u.status === 'suspended').length;
  }

  await load();
}

// ============ BOOTSTRAP ============
document.addEventListener('DOMContentLoaded', () => {
  const path = location.pathname.split('/').pop() || 'index.html';

  const routes = {
    'index.html': initLanding,
    '': initLanding,
    'login.html': initLoginPage,
    'profile.html': initProfilePage,
    'dashboard.html': initDashboard,
    'add-pet.html': initAddPetPage,
    'pet-detail.html': initPetDetailPage,
    'pet-card.html': initPetCardPage,
    'furparent-card.html': initFurparentCardPage,
    'admin-dashboard.html': initAdminDashboard
    // 'admin-login.html' has its own inline script, so no route needed
  };

  const init = routes[path];
  if (typeof init === 'function') {
    Promise.resolve(init()).catch(err => console.error('[PetCard]', err));
  }
});