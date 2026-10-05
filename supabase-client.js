/* ============================================================
   Supabase Client Configuration
============================================================ */

const SUPABASE_URL = 'https://nvrnekpaaqerdycmajnh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52cm5la3BhYXFlcmR5Y21ham5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExODAwNzgsImV4cCI6MjEwNjc1NjA3OH0.iJSAlzhE9h3eaDsEAXe07kbfkZNu52lUo8ju5KFArR0';

// Loaded via CDN in HTML
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   AUTH
============================================================ */
const Auth = {
  async signUp(email, password, metadata) {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: metadata }
    });
    if (error) throw error;
    return data; // { user, session }
  },

  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    await sb.auth.signOut();
    localStorage.removeItem('petcard_profile');
  },

  async getSession() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },

  /**
   * Get the current FurParent profile.
   * If missing (e.g. sign-up with email confirmation ON),
   * it auto-creates one so the user never loops back to login.
   */
  async getCurrentProfile(forceRefresh = false) {
    const session = await this.getSession();
    if (!session) return null;

    // Try cache first
    if (!forceRefresh) {
      const cached = localStorage.getItem('petcard_profile');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.auth_id === session.user.id && parsed.id) return parsed;
        } catch {}
      }
    }

    // Fetch from DB
    const { data, error } = await sb
      .from('furparents')
      .select('*')
      .eq('auth_id', session.user.id)
      .maybeSingle();

    if (data) {
      localStorage.setItem('petcard_profile', JSON.stringify(data));
      return data;
    }

    if (error && error.code !== 'PGRST116') {
      console.warn('[PetCard] Profile fetch error:', error);
    }

    // ============ PROFILE MISSING → CREATE IT ============
    const furparentId = 'FP-' +
      Math.floor(1000 + Math.random() * 9000) + '-' +
      Math.floor(1000 + Math.random() * 9000);

    const fallbackName = (session.user.email || '').split('@')[0] || 'FurParent';

    const newProfile = {
      auth_id: session.user.id,
      email: session.user.email,
      full_name: session.user.user_metadata?.full_name || fallbackName,
      furparent_id: furparentId,
      role: 'furparent',
      status: 'active'
    };

    const { data: created, error: createErr } = await sb
      .from('furparents')
      .insert(newProfile)
      .select()
      .single();   // 👈 .single() so we get the inserted row WITH id

    if (createErr) {
      console.error('[PetCard] Auto-create profile FAILED:', createErr);
      // Throw so caller can show error instead of silently looping
      throw new Error(
        'Could not create FurParent profile: ' + createErr.message +
        '. Please check Supabase RLS policies.'
      );
    }

    localStorage.setItem('petcard_profile', JSON.stringify(created));
    return created;   // 👈 has `id` now
  },

  cacheProfile(profile) {
    localStorage.setItem('petcard_profile', JSON.stringify(profile));
  }
};

/* ============================================================
   PROFILE
============================================================ */
const ProfileAPI = {
  async create(profile) {
    const { data, error } = await sb.from('furparents').insert(profile).select().maybeSingle();
    if (error) throw error;
    if (data) Auth.cacheProfile(data);
    return data;
  },

  async update(id, updates) {
    const { data, error } = await sb.from('furparents').update(updates).eq('id', id).select().maybeSingle();
    if (error) throw error;
    if (data) Auth.cacheProfile(data);
    return data;
  },

  async uploadAvatar(file, userId) {
    const ext = file.name.split('.').pop();
    const path = `avatars/${userId}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('petcard-media').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = sb.storage.from('petcard-media').getPublicUrl(path);
    return data.publicUrl;
  },

  async listAll() {
    const { data, error } = await sb
      .from('furparents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async setStatus(id, status) {
    const { error } = await sb.from('furparents').update({ status }).eq('id', id);
    if (error) throw error;
  }
};

/* ============================================================
   PETS
============================================================ */
const PetAPI = {
  generatePetId() {
    const a = Math.floor(1000 + Math.random() * 9000);
    const b = Math.floor(1000 + Math.random() * 9000);
    return `NPID-${a}-${b}`;
  },

  async list(furparentId) {
    const { data, error } = await sb
      .from('pets')
      .select('*')
      .eq('furparent_id', furparentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async get(id) {
    const { data, error } = await sb.from('pets').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(pet) {
    const { data, error } = await sb.from('pets').insert(pet).select().maybeSingle();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await sb.from('pets').update(updates).eq('id', id).select().maybeSingle();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await sb.from('pets').delete().eq('id', id);
    if (error) throw error;
  },

  async uploadPhoto(file, petId) {
    const ext = file.name.split('.').pop();
    const path = `pets/${petId}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('petcard-media').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = sb.storage.from('petcard-media').getPublicUrl(path);
    return data.publicUrl;
  }
};

/* ============================================================
   DIARY (per pet)
============================================================ */
const DiaryAPI = {
  async list(petId) {
    const { data, error } = await sb
      .from('diary')
      .select('*')
      .eq('pet_id', petId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async add(entry) {
    const { data, error } = await sb.from('diary').insert(entry).select().maybeSingle();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await sb.from('diary').delete().eq('id', id);
    if (error) throw error;
  }
};

/* ============================================================
   EVENTS (per pet, with date)
============================================================ */
const EventAPI = {
  async list(petId) {
    const { data, error } = await sb
      .from('events')
      .select('*')
      .eq('pet_id', petId)
      .order('event_date', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async listByDate(furparentId, date) {
    const { data, error } = await sb
      .from('events')
      .select('*, pets(name)')
      .eq('furparent_id', furparentId)
      .eq('event_date', date);
    if (error) throw error;
    return data || [];
  },

  async listUpcoming(furparentId) {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await sb
      .from('events')
      .select('*, pets(name)')
      .eq('furparent_id', furparentId)
      .gte('event_date', today)
      .order('event_date', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async add(event) {
    const { data, error } = await sb.from('events').insert(event).select().maybeSingle();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await sb.from('events').delete().eq('id', id);
    if (error) throw error;
  }
};

/* ============================================================
   VET RECORDS
============================================================ */
const VetAPI = {
  async list(petId) {
    const { data, error } = await sb
      .from('vet_records')
      .select('*')
      .eq('pet_id', petId)
      .order('given_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async add(record) {
    const { data, error } = await sb.from('vet_records').insert(record).select().maybeSingle();
    if (error) throw error;
    return data;
  }
};