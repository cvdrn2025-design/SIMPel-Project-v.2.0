// ============================================================
// SIMPeL - Application Logic
// CV. Dinamika Rekonstruksi Nusantara
// ============================================================

// ===== KONFIGURASI SUPABASE =====
const SUPABASE_URL = 'https://ufxmcjlyfounpqasqftw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmeG1jamx5Zm91bnBxYXNxZnR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3Mjc3OTcsImV4cCI6MjEwMTMwMzc5N30.jTW0UlLOAkd6umY_wWRQscl32xT6DMmGhAwFcm81_zI';

// ===== KEYS =====
const KEYS = {
    current: 'drn_current_project',
    role: 'drn_role',
    userId: 'drn_user_id',
    paket: 'drn_paket',
    addonPrint: 'drn_addon_print',
    project: 'drn_project',
    rolePersist: 'drn_role_persist',
    userIdPersist: 'drn_user_id_persist',
    projectPersist: 'drn_project_persist',
    rabUnlocked: 'drn_rab_unlocked',
    costUnlocked: 'drn_cost_unlocked'
};

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== STATE =====
let projects = [], progressLog = [], materialLog = [], timesheetLog = [];
let allocations = [], cashflowLog = [], planLog = [], rabList = [], wageRates = [], picList = [];
let currentProjectId = localStorage.getItem(KEYS.current) || null;
let pendingRabItems = [];
let fotoFile = null;
let passwordsData = {};
let staffSelectedProjectId = null;
let rabUnlocked = false;
let costUnlocked = false;

// ===== HELPER =====
const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const formatRp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const formatTgl = s => s ? s.split('-').reverse().join('/') : '-';

const getKode = nomor => {
    if (!nomor) return null;
    const m = String(nomor).match(/^(\d+)/);
    return m ? m[1].padStart(4, '0').substring(0, 4) : null;
};

const esc = s => {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
};

const generateUniqueKodeAkses = () => {
    const used = new Set(projects.map(p => p.kodeAkses).filter(Boolean));
    let code;
    do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (used.has(code));
    return code;
};

// ===== UNLOCK STATE TAB =====
function isTabUnlocked(tabName) {
    if (currentRole() !== 'staff') return true;
    if (tabName === 'rab') return rabUnlocked;
    if (tabName === 'cost') return costUnlocked;
    return true;
}

function setTabUnlocked(tabName, value) {
    if (tabName === 'rab') {
        rabUnlocked = value;
        if (value) sessionStorage.setItem(KEYS.rabUnlocked, 'true');
        else sessionStorage.removeItem(KEYS.rabUnlocked);
    }
    if (tabName === 'cost') {
        costUnlocked = value;
        if (value) sessionStorage.setItem(KEYS.costUnlocked, 'true');
        else sessionStorage.removeItem(KEYS.costUnlocked);
    }
}

function restoreUnlockState() {
    if (currentRole() !== 'staff') {
        rabUnlocked = true;
        costUnlocked = true;
        return;
    }
    rabUnlocked = sessionStorage.getItem(KEYS.rabUnlocked) === 'true';
    costUnlocked = sessionStorage.getItem(KEYS.costUnlocked) === 'true';
}

function resetUnlockState() {
    rabUnlocked = false;
    costUnlocked = false;
    sessionStorage.removeItem(KEYS.rabUnlocked);
    sessionStorage.removeItem(KEYS.costUnlocked);
}

async function verifyPin(pinInput) {
    if (Object.keys(passwordsData).length === 0) {
        await loadPasswords();
    }
    const storedPin = passwordsData['rab_cost_pin'] || '1234';
    return pinInput === storedPin;
}

// ===== GUARD VIEW-ONLY =====
function blockIfViewOnly(actionName) {
    if (currentRole() === 'direksi') {
        alert('🔒 Mode View-Only: Direksi tidak dapat ' + (actionName || 'melakukan aksi ini') + '.');
        return true;
    }
    return false;
}

// ===== AUTH =====
function currentRole() {
    const sessionRole = sessionStorage.getItem(KEYS.role);
    if (sessionRole) return sessionRole;
    const localRole = localStorage.getItem(KEYS.rolePersist);
    return localRole || null;
}

function toggleKodeProyek() {
    const role = document.getElementById('loginRole').value;
    const kodeLabel = document.getElementById('loginKodeLabel');
    const kodeInput = document.getElementById('loginKode');
    const userIdWrap = document.getElementById('loginUserIdWrap');
    const userIdInput = document.getElementById('loginUserId');

    document.getElementById('loginKodeWrap').style.display = 'block';
    kodeInput.required = true;

    if (role === 'staff') {
        kodeLabel.textContent = 'Kode Proyek';
        kodeInput.placeholder = '0001';
        userIdWrap.style.display = 'block';
        userIdInput.required = true;
    } else if (role === 'direksi') {
        kodeLabel.textContent = 'User ID Direksi';
        kodeInput.placeholder = 'DRN-XXXXXX';
        userIdWrap.style.display = 'none';
        userIdInput.required = false;
        userIdInput.value = '';
    } else {
        kodeLabel.textContent = 'User ID';
        kodeInput.placeholder = 'DRN-XXXXXX';
        userIdWrap.style.display = 'none';
        userIdInput.required = false;
        userIdInput.value = '';
    }

    // Prefill User ID dari pembayaran terakhir
    const lastUserId = localStorage.getItem('drn_last_payment_id')
        || localStorage.getItem(KEYS.userIdPersist)
        || localStorage.getItem(KEYS.userId);
    if (lastUserId && role !== 'staff') {
        kodeInput.value = lastUserId;
    }
}

// ===== LOGIN =====
async function login(e) {
    e.preventDefault();

    if (Object.keys(passwordsData).length === 0) {
        await loadPasswords();
    }

    const role = document.getElementById('loginRole').value;
    const pass = document.getElementById('loginPass').value;
    const idInput = document.getElementById('loginKode').value.trim().toUpperCase();

    // ==== MANAGEMENT ====
    if (role === 'management') {
        const storedPass = passwordsData['management_password'] || 'admin01';
        if (pass !== storedPass) { alert('Password Management salah!'); return false; }
        if (!idInput) { alert('Masukkan User ID Anda!'); return false; }

        sessionStorage.setItem(KEYS.userId, idInput);
        sessionStorage.setItem(KEYS.role, 'management');
        localStorage.setItem(KEYS.rolePersist, 'management');
        localStorage.setItem(KEYS.userIdPersist, idInput);
        localStorage.setItem('drn_last_payment_id', idInput);

        resetUnlockState();

        try {
            const { data: user, error } = await sb.from('users').select('*').eq('id', idInput).single();
            if (error || !user) {
                alert('User ID tidak ditemukan! Silakan lakukan pembayaran.');
                window.location.href = './pembayaran.html';
                return false;
            }
            if (user.status !== 'Aktif') {
                alert('Akun Anda non-aktif. Hubungi Admin!');
                return false;
            }

            sessionStorage.setItem(KEYS.paket, user.paket || 'basic');
            sessionStorage.setItem(KEYS.addonPrint, user.addon_print ? 'true' : 'false');
            localStorage.setItem(KEYS.paket, user.paket || 'basic');
            localStorage.setItem(KEYS.addonPrint, user.addon_print ? 'true' : 'false');

            document.getElementById('loginModal').style.display = 'none';
            document.querySelector('.header').style.display = 'block';
            document.querySelector('.tabs').style.display = 'flex';
            document.querySelector('.container').style.display = 'block';

            await loadAll();
            renderAll();
            applyRoleMenuRestrictions();

            alert('Login Management berhasil! Paket: ' + (user.paket || 'basic') + (user.addon_print ? ' + Add-On Print' : ''));
        } catch (err) {
            alert('Gagal terhubung ke Server: ' + err.message);
        }
        return false;
    }

    // ==== DIREKSI ====
    if (role === 'direksi') {
        const storedPass = passwordsData['direksi_password'] || 'admin00';
        if (pass !== storedPass) { alert('Password Direksi salah!'); return false; }
        if (!idInput) { alert('Masukkan User ID Direksi!'); return false; }

        try {
            const { data: user, error } = await sb.from('users').select('*').eq('id', idInput).single();
            if (error || !user) {
                alert('User ID Direksi tidak ditemukan!\n\nPastikan User ID sesuai dengan yang terdaftar di pembayaran.');
                return false;
            }
            if (user.status !== 'Aktif') {
                alert('Akun Direksi non-aktif. Hubungi Admin!');
                return false;
            }

            sessionStorage.setItem(KEYS.role, 'direksi');
            sessionStorage.setItem(KEYS.userId, idInput);
            localStorage.setItem(KEYS.rolePersist, 'direksi');
            localStorage.setItem(KEYS.userIdPersist, idInput);
            localStorage.setItem('drn_last_payment_id', idInput);

            sessionStorage.setItem(KEYS.paket, user.paket || 'basic');
            localStorage.setItem(KEYS.paket, user.paket || 'basic');
            sessionStorage.setItem(KEYS.addonPrint, user.addon_print ? 'true' : 'false');
            localStorage.setItem(KEYS.addonPrint, user.addon_print ? 'true' : 'false');

            resetUnlockState();

            document.getElementById('loginModal').style.display = 'none';
            document.querySelector('.header').style.display = 'block';
            document.querySelector('.tabs').style.display = 'flex';
            document.querySelector('.container').style.display = 'block';

            await loadAll();
            renderAll();
            applyRoleMenuRestrictions();
            switchTab('dashboard');

            alert('Login Direksi berhasil! Mode: View-Only\nPaket: ' + (user.paket || 'basic'));
        } catch (err) {
            alert('Gagal terhubung: ' + err.message);
        }
        return false;
    }

    // ==== STAFF ====
    if (role === 'staff') {
        const staffUserId = document.getElementById('loginUserId').value.trim();
        if (!staffUserId) { alert('Masukkan User ID Staff!'); return false; }
        if (!idInput) { alert('Masukkan Kode Proyek!'); return false; }

        const storedStaffPass = passwordsData['staff_password'] || 'admin02';
        if (pass !== storedStaffPass) { alert('Password Staff salah!'); return false; }

        try {
            const { data: matchingProjects, error } = await sb.from('projects').select('*').eq('kode_akses', idInput);
            if (error) throw error;

            if (!matchingProjects || matchingProjects.length === 0) {
                alert('Kode proyek tidak ditemukan. Hubungi Management Anda.');
                return false;
            }

            if (matchingProjects.length > 1) {
                staffSelectedProjectId = null;
                showStaffProjectSelection(matchingProjects, staffUserId);
                return false;
            }

            handleStaffLogin(matchingProjects[0], staffUserId);
        } catch (err) {
            alert('Gagal terhubung ke Server: ' + err.message);
        }
        return false;
    }

    return false;
}

function showStaffProjectSelection(projectsList, staffUserId) {
    const container = document.getElementById('projectListContainer');
    container.innerHTML = '';

    projectsList.forEach((p) => {
        const btn = document.createElement('button');
        btn.innerHTML = `
            <div class="project-name">${esc(p.nama)}</div>
            <div class="project-meta">${esc(p.lokasi || 'Tanpa lokasi')}</div>
            <div class="project-code">Kode: ${p.kode_akses || getKode(p.nomor_kontrak)}</div>
        `;
        btn.onclick = () => selectStaffProject(p.id, btn);
        container.appendChild(btn);
    });

    document.getElementById('projectSelectModal').dataset.projects = JSON.stringify(projectsList);
    document.getElementById('projectSelectModal').dataset.staffUserId = staffUserId;
    document.getElementById('projectSelectModal').style.display = 'flex';
}

function selectStaffProject(projectId, btn) {
    staffSelectedProjectId = projectId;
    document.querySelectorAll('#projectListContainer button').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

function confirmStaffProjectSelection() {
    if (!staffSelectedProjectId) {
        alert('Silakan pilih proyek terlebih dahulu!');
        return;
    }

    const projectsList = JSON.parse(document.getElementById('projectSelectModal').dataset.projects);
    const staffUserId = document.getElementById('projectSelectModal').dataset.staffUserId;
    const selectedProject = projectsList.find(p => p.id === staffSelectedProjectId);

    if (!selectedProject) {
        alert('Proyek tidak ditemukan!');
        return;
    }

    document.getElementById('projectSelectModal').style.display = 'none';
    handleStaffLogin(selectedProject, staffUserId);
}

function cancelStaffProjectSelection() {
    document.getElementById('projectSelectModal').style.display = 'none';
    staffSelectedProjectId = null;
}

// ===== RESTRIKSI MENU BY ROLE =====
function applyRoleMenuRestrictions() {
    const role = currentRole();

    // ==== DIREKSI: View-Only ====
    if (role === 'direksi') {
        const hideSelectors = [
            '.proj-bar button[onclick="openProjectModal()"]',
            '.proj-bar button[onclick="exportBackup()"]',
            '.proj-bar button[onclick="deleteProject()"]',
            '.proj-bar button[onclick="checkDuplicateProjects()"]',
            'button[onclick="openChangePasswordModal()"]'
        ];
        hideSelectors.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.style.display = 'none';
        });

        const banner = document.getElementById('kodeAksesBanner');
        if (banner) banner.classList.add('hide');

        document.body.classList.add('view-only');
        addViewOnlyBadge();
        hideTableActionButtons();
        hideAllForms();
        updateTabLockIndicators();
        return;
    }

    // ==== MANAGEMENT ====
    if (role === 'management') {
        document.body.classList.remove('view-only');
        removeViewOnlyBadge();
        updateTabLockIndicators();
        return;
    }

    // ==== STAFF ====
    if (role === 'staff') {
        const hideSelectors = [
            '.proj-bar button[onclick="openProjectModal()"]',
            '.proj-bar button[onclick="exportBackup()"]',
            '.proj-bar button[onclick="deleteProject()"]',
            '.proj-bar button[onclick="checkDuplicateProjects()"]',
            'button[onclick="openChangePasswordModal()"]'
        ];
        hideSelectors.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.style.display = 'none';
        });

        const banner = document.getElementById('kodeAksesBanner');
        if (banner) banner.classList.add('hide');

        updateTabLockIndicators();
        return;
    }
}

function addViewOnlyBadge() {
    let badge = document.getElementById('viewOnlyBadge');
    if (badge) return;
    badge = document.createElement('div');
    badge.id = 'viewOnlyBadge';
    badge.className = 'view-only-badge';
    badge.innerHTML = '👁️ <span>Mode Direksi — View Only. Anda hanya dapat melihat data, tidak dapat mengubah.</span>';
    const container = document.querySelector('.container');
    if (container) container.insertBefore(badge, container.firstChild);
}

function removeViewOnlyBadge() {
    const badge = document.getElementById('viewOnlyBadge');
    if (badge) badge.remove();
}

function hideTableActionButtons() {
    document.querySelectorAll('td button.btn.danger').forEach(btn => btn.style.display = 'none');
    document.querySelectorAll('button[onclick*="deleteEntry"], button[onclick*="deleteProject"], button[onclick*="togglePic"]').forEach(btn => btn.style.display = 'none');
}

function hideAllForms() {
    document.querySelectorAll('.container .card form').forEach(form => form.style.display = 'none');
}

// ===== HANDLE STAFF LOGIN =====
async function handleStaffLogin(proyek, staffUserId) {
    sessionStorage.setItem(KEYS.role, 'staff');
    sessionStorage.setItem(KEYS.userId, staffUserId);
    sessionStorage.setItem(KEYS.project, proyek.id);
    localStorage.setItem(KEYS.current, proyek.id);
    currentProjectId = proyek.id;

    localStorage.setItem(KEYS.rolePersist, 'staff');
    localStorage.setItem(KEYS.userIdPersist, staffUserId);
    localStorage.setItem(KEYS.projectPersist, proyek.id);

    resetUnlockState();

    document.getElementById('loginModal').style.display = 'none';
    document.querySelector('.header').style.display = 'block';
    document.querySelector('.tabs').style.display = 'flex';
    document.querySelector('.container').style.display = 'block';

    await loadAll();
    renderAll();
    applyRoleMenuRestrictions();

    alert('✅ Login Staff berhasil!\nUser ID: ' + staffUserId + '\nProyek: ' + proyek.nama);
}

// ===== LOGOUT =====
function logout() {
    sessionStorage.removeItem(KEYS.role);
    sessionStorage.removeItem(KEYS.userId);
    sessionStorage.removeItem(KEYS.paket);
    sessionStorage.removeItem(KEYS.addonPrint);
    sessionStorage.removeItem(KEYS.project);

    localStorage.removeItem(KEYS.rolePersist);
    localStorage.removeItem(KEYS.userIdPersist);
    localStorage.removeItem(KEYS.projectPersist);
    localStorage.removeItem(KEYS.paket);
    localStorage.removeItem(KEYS.addonPrint);

    resetUnlockState();
    const rabOverlay = document.getElementById('lockOverlay-rab');
    const costOverlay = document.getElementById('lockOverlay-cost');
    if (rabOverlay) rabOverlay.remove();
    if (costOverlay) costOverlay.remove();

    document.body.classList.remove('view-only');
    removeViewOnlyBadge();

    const banner = document.getElementById('kodeAksesBanner');
    if (banner) banner.classList.add('hide');

    document.getElementById('loginModal').style.display = 'flex';
    document.querySelector('.header').style.display = 'none';
    document.querySelector('.tabs').style.display = 'none';
    document.querySelector('.container').style.display = 'none';

    document.getElementById('loginPass').value = '';
    document.getElementById('loginKode').value = '';
    document.getElementById('loginUserId').value = '';

    alert('Anda telah keluar. Silakan login kembali.');
}

function logoutFromModal() {
    if (confirm('Yakin ingin keluar dari aplikasi SIMPeL?')) {
        sessionStorage.clear();
        localStorage.clear();
        window.location.replace('about:blank');
    }
}

// ===== GANTI PASSWORD =====
function toggleCredentialFields() {
    const isPin = document.getElementById('passRoleTarget').value === 'pin';
    const newPass = document.getElementById('newPass');
    newPass.maxLength = isPin ? 4 : 50;
    newPass.placeholder = isPin ? '4 digit angka' : 'Minimal 6 karakter';
}

function openChangePasswordModal() {
    if (currentRole() !== 'management') { alert('Khusus Management.'); return; }
    document.getElementById('passRoleTarget').value = 'management';
    document.getElementById('oldPass').value = '';
    document.getElementById('newPass').value = '';
    document.getElementById('confirmPass').value = '';
    toggleCredentialFields();
    document.getElementById('passwordModal').style.display = 'flex';
}

function closePasswordModal() {
    document.getElementById('passwordModal').style.display = 'none';
}

async function loadPasswords() {
    try {
        const { data, error } = await sb.from('admin_settings').select('*');
        if (error) throw error;
        passwordsData = {};
        (data || []).forEach(item => {
            passwordsData[item.setting_key] = item.setting_value;
        });
    } catch (err) {
        console.error('Gagal load passwords:', err);
    }
}

async function changePassword(e) {
    e.preventDefault();

    const target = document.getElementById('passRoleTarget').value;
    const config = {
        'management': { key: 'management_password', def: 'admin01', label: 'Management', isPin: false },
        'direksi': { key: 'direksi_password', def: 'admin00', label: 'Direksi', isPin: false },
        'staff': { key: 'staff_password', def: 'admin02', label: 'Staff Umum', isPin: false },
        'pin': { key: 'rab_cost_pin', def: '1234', label: 'PIN RAB/Cost', isPin: true }
    };

    const cfg = config[target];
    if (!cfg) { alert('Target role tidak valid!'); return false; }

    const oldPass = document.getElementById('oldPass').value;
    const newPass = document.getElementById('newPass').value;
    const confirmPass = document.getElementById('confirmPass').value;
    const storedPass = passwordsData[cfg.key] || cfg.def;

    if (oldPass !== storedPass) {
        alert('❌ ' + (cfg.isPin ? 'PIN lama' : 'Password lama') + ' ' + cfg.label + ' salah!');
        return false;
    }

    if (cfg.isPin) {
        if (!/^\d{4}$/.test(newPass)) { alert('❌ PIN baru harus 4 digit angka!'); return false; }
    } else if (newPass.length < 6) {
        alert('❌ Password baru minimal 6 karakter!');
        return false;
    }

    if (newPass !== confirmPass) {
        alert('❌ Konfirmasi tidak cocok!');
        return false;
    }

    try {
        const { error } = await sb.from('admin_settings').upsert({
            setting_key: cfg.key,
            setting_value: newPass
        }, { onConflict: 'setting_key' });

        if (error) throw error;
        passwordsData[cfg.key] = newPass;
        alert('✅ ' + cfg.label + ' berhasil diubah!');
        closePasswordModal();
    } catch (err) {
        alert('❌ Gagal mengubah: ' + err.message);
    }
    return false;
}

// ===== LOAD DATA =====
async function loadAll() {
    try {
        const role = currentRole();
        const userId = sessionStorage.getItem(KEYS.userId) || localStorage.getItem(KEYS.userIdPersist);
        const staffProjectId = sessionStorage.getItem(KEYS.project) || localStorage.getItem(KEYS.projectPersist);

        const tables = ['projects', 'progress_log', 'material_log', 'material_alloc', 'timesheet_log', 'cashflow_log', 'plan_progress', 'rab_items', 'wage_rates', 'pic_proyek'];
        const results = await Promise.all(tables.map(t => sb.from(t).select('*')));

        results.forEach((r, i) => {
            if (r.error) console.error('Error loading ' + tables[i] + ':', r.error);
        });

        projects = (results[0]?.data || []).map(r => ({ id: r.id, nama: r.nama, lokasi: r.lokasi, nomorKontrak: r.nomor_kontrak, kodeAkses: r.kode_akses, nilaiKontrak: r.nilai_kontrak, tanggalMulai: r.tanggal_mulai, tanggalSelesai: r.tanggal_selesai, managementId: r.management_id }));
        progressLog = (results[1]?.data || []).map(r => ({ id: r.id, projectId: r.project_id, tanggal: r.tanggal, deskripsi: r.deskripsi, persen: r.persen, foto: r.foto_url }));
        materialLog = (results[2]?.data || []).map(r => ({ id: r.id, projectId: r.project_id, tanggal: r.tanggal, tipe: r.tipe, nama: r.nama, jumlah: r.jumlah, satuan: r.satuan }));
        allocations = (results[3]?.data || []).map(r => ({ id: r.id, projectId: r.project_id, nama: r.nama, jatah: r.jatah, satuan: r.satuan }));
        timesheetLog = (results[4]?.data || []).map(r => ({ id: r.id, projectId: r.project_id, tanggal: r.tanggal, nama: r.nama, kategori: r.kategori, status: r.status, jamMasuk: r.jam_masuk, jamKeluar: r.jam_keluar }));
        cashflowLog = (results[5]?.data || []).map(r => ({ id: r.id, projectId: r.project_id, tanggal: r.tanggal, jenis: r.jenis, keterangan: r.keterangan, jumlah: r.jumlah }));
        planLog = (results[6]?.data || []).map(r => ({ id: r.id, projectId: r.project_id, tanggal: r.tanggal, persen: r.persen }));
        rabList = (results[7]?.data || []).map(r => ({ id: r.id, projectId: r.project_id, noUrut: r.no_urut, uraian: r.uraian, volume: r.volume, satuan: r.satuan, hargaSatuan: r.harga_satuan, jumlahHarga: r.jumlah_harga }));
        wageRates = (results[8]?.data || []).map(r => ({ id: r.id, projectId: r.project_id, kategori: r.kategori, upahHarian: r.upah_harian, upahLembur: r.upah_lembur_per_jam }));
        picList = (results[9]?.data || []).map(r => ({ id: r.id, projectId: r.project_id, kategori: r.kategori, jabatan: r.jabatan, nama: r.nama, wewenang: r.wewenang, ceklis: r.ceklis }));

        // FILTER MANAGEMENT
        if (role === 'management' && userId) {
            const myIds = projects.filter(p => p.managementId === userId).map(p => p.id);
            projects = projects.filter(p => p.managementId === userId);
            progressLog = progressLog.filter(x => myIds.includes(x.projectId));
            materialLog = materialLog.filter(x => myIds.includes(x.projectId));
            allocations = allocations.filter(x => myIds.includes(x.projectId));
            timesheetLog = timesheetLog.filter(x => myIds.includes(x.projectId));
            cashflowLog = cashflowLog.filter(x => myIds.includes(x.projectId));
            planLog = planLog.filter(x => myIds.includes(x.projectId));
            rabList = rabList.filter(x => myIds.includes(x.projectId));
            wageRates = wageRates.filter(x => myIds.includes(x.projectId));
            picList = picList.filter(x => myIds.includes(x.projectId));
        }

        // FILTER DIREKSI - Lihat proyek milik user sendiri (view-only)
        if (role === 'direksi' && userId) {
            const myIds = projects.filter(p => p.managementId === userId).map(p => p.id);
            projects = projects.filter(p => p.managementId === userId);
            progressLog = progressLog.filter(x => myIds.includes(x.projectId));
            materialLog = materialLog.filter(x => myIds.includes(x.projectId));
            allocations = allocations.filter(x => myIds.includes(x.projectId));
            timesheetLog = timesheetLog.filter(x => myIds.includes(x.projectId));
            cashflowLog = cashflowLog.filter(x => myIds.includes(x.projectId));
            planLog = planLog.filter(x => myIds.includes(x.projectId));
            rabList = rabList.filter(x => myIds.includes(x.projectId));
            wageRates = wageRates.filter(x => myIds.includes(x.projectId));
            picList = picList.filter(x => myIds.includes(x.projectId));
        }

        // FILTER STAFF
        if (role === 'staff') {
            const staffProjId = staffProjectId
                || localStorage.getItem(KEYS.projectPersist)
                || localStorage.getItem(KEYS.current)
                || currentProjectId;

            if (staffProjId) {
                currentProjectId = staffProjId;
                projects = projects.filter(p => p.id === staffProjId);
                progressLog = progressLog.filter(x => x.projectId === staffProjId);
                materialLog = materialLog.filter(x => x.projectId === staffProjId);
                allocations = allocations.filter(x => x.projectId === staffProjId);
                timesheetLog = timesheetLog.filter(x => x.projectId === staffProjId);
                cashflowLog = cashflowLog.filter(x => x.projectId === staffProjId);
                planLog = planLog.filter(x => x.projectId === staffProjId);
                rabList = rabList.filter(x => x.projectId === staffProjId);
                wageRates = wageRates.filter(x => x.projectId === staffProjId);
                picList = picList.filter(x => x.projectId === staffProjId);
            }
        }

        // Set currentProjectId
        const saved = localStorage.getItem(KEYS.current);
        if (saved && projects.find(p => p.id === saved)) currentProjectId = saved;
        else if (projects.length) { currentProjectId = projects[0].id; localStorage.setItem(KEYS.current, projects[0].id); }
        else currentProjectId = null;

        await loadPasswords();

    } catch (err) {
        alert('Gagal memuat data: ' + err.message);
    }
}

// ===== TIER PAKET =====
const getCurrentPaket = () => sessionStorage.getItem(KEYS.paket) || localStorage.getItem(KEYS.paket) || 'basic';
const getProjectCountForUser = (managementId) => projects.filter(p => p.managementId === managementId).length;
const isBasicPaket = () => getCurrentPaket() === 'basic';
const hasAddonPrint = () => {
    const addon = sessionStorage.getItem(KEYS.addonPrint) || localStorage.getItem(KEYS.addonPrint);
    return addon === 'true';
};

function showAddonPopup() {
    const confirmBeli = confirm(
        '🔒 Fitur Cetak Terkunci!\n\n' +
        'Paket Anda tidak termasuk fitur cetak.\n\n' +
        'Apakah Anda ingin membeli Add-On Print (Rp 100.000) untuk membuka fitur cetak?'
    );
    if (confirmBeli) window.location.href = './addon-basic.html';
}

function blockPrintForBasic() {
    if (!isBasicPaket()) return;
    if (hasAddonPrint()) return;

    document.querySelectorAll('button').forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (text.includes('cetak') || text.includes('print') || text.includes('🖨️') || text.includes('laporan') || text.includes('rekap') || text.includes('backup')) {
            if (btn.dataset.blocked === 'true') return;
            btn.dataset.blocked = 'true';
            btn.innerHTML = '🔒 ' + btn.innerHTML;
            btn.style.background = '#9E9E9E';
            btn.style.cursor = 'pointer';
            btn.style.opacity = '0.7';
            btn.title = '🔒 Fitur Cetak hanya untuk Premium/ProMax/Add-On';
            btn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                showAddonPopup();
            });
        }
    });

    document.querySelectorAll('.print-photo-check').forEach(cb => {
        cb.disabled = true;
        cb.style.opacity = '0.5';
    });
}

// ===== SWITCH TAB =====
function switchTab(name) {
    const role = currentRole();

    if (role === 'staff' && (name === 'rab' || name === 'cost')) {
        if (!isTabUnlocked(name)) {
            document.querySelectorAll('#mainTabs button').forEach(b => b.classList.remove('active'));
            document.querySelector('#mainTabs button[data-tab="' + name + '"]').classList.add('active');
            document.querySelectorAll('.container > div[id^="tab-"]').forEach(d => d.classList.add('hide'));
            document.getElementById('tab-' + name).classList.remove('hide');
            showLockOverlay(name);
            return;
        }
    }

    if (role === 'staff') {
        if (name === 'pic') {
            document.getElementById('picForm').style.display = 'none';
        } else {
            const pf = document.getElementById('picForm');
            if (pf) pf.style.display = 'grid';
        }
    }

    if (role === 'management' && name === 'pic') {
        const pf = document.getElementById('picForm');
        if (pf) pf.style.display = 'grid';
    }

    document.querySelectorAll('#mainTabs button').forEach(b => b.classList.remove('active'));
    document.querySelector('#mainTabs button[data-tab="' + name + '"]').classList.add('active');
    document.querySelectorAll('.container > div[id^="tab-"]').forEach(d => d.classList.add('hide'));
    document.getElementById('tab-' + name).classList.remove('hide');

    hideLockOverlay(name);

    // Refresh banner saat balik ke dashboard (kalau banner di dalam dashboard)
    // Tapi karena banner sekarang di header, tidak perlu.

    if (role === 'direksi') {
        hideTableActionButtons();
        hideAllForms();
    }

    blockPrintForBasic();
}

// ===== OVERLAY PIN =====
function showLockOverlay(tabName) {
    let overlay = document.getElementById('lockOverlay-' + tabName);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'lockOverlay-' + tabName;
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,27,46,0.85);display:flex;align-items:center;justify-content:center;z-index:250;padding:15px;';
        overlay.innerHTML = `
            <div style="background:var(--paper);border-radius:8px;padding:25px;max-width:380px;width:100%;border-top:4px solid var(--safety);text-align:center;">
                <div style="font-size:40px;margin-bottom:10px;">🔒</div>
                <h2 style="font-family:Oswald,sans-serif;text-transform:uppercase;color:var(--navy);font-size:16px;margin-bottom:8px;">
                    Tab ${tabName === 'rab' ? 'RAB/BoQ' : 'Cost'} Terkunci
                </h2>
                <p style="font-size:13px;color:var(--ink-soft);margin-bottom:15px;">Masukkan PIN untuk membuka akses.</p>
                <input type="password" id="pinInput-${tabName}" maxlength="4" placeholder="••••" inputmode="numeric"
                    style="width:100%;padding:12px;text-align:center;font-size:24px;letter-spacing:12px;border:2px solid var(--hairline);border-radius:6px;margin-bottom:12px;">
                <div id="pinError-${tabName}" style="color:var(--warn);font-size:12px;margin-bottom:10px;display:none;"></div>
                <button class="btn" style="width:100%;padding:12px;font-size:14px;" onclick="tryUnlockTab('${tabName}')">🔓 Buka</button>
                <button class="btn" style="width:100%;padding:10px;margin-top:8px;background:var(--paper-dim);color:var(--ink);font-size:13px;" onclick="switchTab('dashboard')">Batal</button>
            </div>
        `;
        document.body.appendChild(overlay);
        setTimeout(() => {
            const inp = document.getElementById('pinInput-' + tabName);
            if (inp) {
                inp.focus();
                inp.addEventListener('keypress', function (ev) {
                    if (ev.key === 'Enter') tryUnlockTab(tabName);
                });
            }
        }, 100);
    }
    overlay.style.display = 'flex';
    const inp = document.getElementById('pinInput-' + tabName);
    if (inp) inp.value = '';
    const err = document.getElementById('pinError-' + tabName);
    if (err) err.style.display = 'none';
}

function hideLockOverlay(tabName) {
    const overlay = document.getElementById('lockOverlay-' + tabName);
    if (overlay) overlay.style.display = 'none';
}

async function tryUnlockTab(tabName) {
    const inp = document.getElementById('pinInput-' + tabName);
    const err = document.getElementById('pinError-' + tabName);
    const pin = (inp ? inp.value : '').trim();

    if (!pin) {
        if (err) { err.textContent = 'PIN tidak boleh kosong.'; err.style.display = 'block'; }
        return;
    }

    const ok = await verifyPin(pin);
    if (!ok) {
        if (err) { err.textContent = '❌ PIN salah. Coba lagi.'; err.style.display = 'block'; }
        if (inp) inp.value = '';
        if (inp) inp.focus();
        return;
    }

    setTabUnlocked(tabName, true);
    hideLockOverlay(tabName);
    updateTabLockIndicators();

    if (tabName === 'rab') renderRab();
    if (tabName === 'cost') renderCashflow();

    switchTab(tabName);
}

function updateTabLockIndicators() {
    const role = currentRole();
    const rabBtn = document.querySelector('#mainTabs button[data-tab="rab"]');
    const costBtn = document.querySelector('#mainTabs button[data-tab="cost"]');
    if (!rabBtn || !costBtn) return;

    if (role === 'staff') {
        rabBtn.innerHTML = rabUnlocked ? 'RAB/BoQ' : '🔒 RAB/BoQ';
        costBtn.innerHTML = costUnlocked ? 'Cost' : '🔒 Cost';
        rabBtn.classList.toggle('locked', !rabUnlocked);
        costBtn.classList.toggle('locked', !costUnlocked);
    } else {
        rabBtn.innerHTML = 'RAB/BoQ';
        costBtn.innerHTML = 'Cost';
        rabBtn.classList.remove('locked');
        costBtn.classList.remove('locked');
    }
}

// ===== RENDER =====
function renderProjectSelect() {
    const sel = document.getElementById('projectSelect');
    if (!sel) return;
    sel.innerHTML = '';
    const role = currentRole();
    const lockId = sessionStorage.getItem(KEYS.project) || localStorage.getItem(KEYS.projectPersist);
    const visible = role === 'staff' && lockId ? projects.filter(p => p.id === lockId) : projects;
    visible.forEach(p => {
        const opt = document.createElement('option');
        const kode = getKode(p.nomorKontrak);
        opt.value = p.id;
        opt.textContent = kode ? '[' + kode + '] ' + p.nama : p.nama;
        if (p.id === currentProjectId) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.disabled = (role === 'staff' && !!lockId);
}

function renderAll() {
    renderProjectSelect();
    renderKodeAksesBanner();
    renderDashboard();
    renderDuplicateWarning();
    renderSCurve();
    renderPlanTable();
    renderProgress();
    renderMaterial();
    renderTimesheet();
    renderRab();
    renderCashflow();
    renderPic();
    renderWage();
    renderRoleBadge();
    renderUraianOptions();
    updateTabLockIndicators();
    blockPrintForBasic();
                  }

