import { state } from './dataManager.js';
import { supabase } from './supabaseClient.js';

let uiElements = {};
let currentUserRole = null;

// Orijinal şifre hash'i - artık kullanılmıyor ama dosyanın bütünlüğü için burada bırakıldı
// const MANAGER_PASSWORD_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

// Orijinal hash fonksiyonu - artık kullanılmıyor
/*
async function hashText(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
*/

export function applyRolePermissions() {
    const role = getCurrentRole();
    if (!role) return;

    // YÖNETİCİ KONTROLÜ
    // Rolün 'manager' veya 'yönetici' olması durumunu kontrol ediyoruz.
    const isManager = role.toLowerCase() === 'manager' || role.toLowerCase() === 'yönetici';

    // Önce tüm yönetici elementlerini görünür yapalım
    document.querySelectorAll('.manager-only').forEach(el => {
        el.style.display = 'block';
    });
    
    // Eğer rol kasiyer ise, yönetici elementlerini gizle
    if (!isManager) {
        document.querySelectorAll('.manager-only').forEach(el => {
            el.style.display = 'none';
        });

       const wastageForm = document.getElementById('wastage-form');
        if (wastageForm) {
            wastageForm.style.display = 'none';
            // Formun başlığını da gizleyebiliriz
            const wastageHeader = wastageForm.previousElementSibling;
            if (wastageHeader && wastageHeader.tagName === 'H3') {
                wastageHeader.style.display = 'none';
            }
        }

        // 2. "Yeni Veresiye Kaydı" formunu gizle.
        const debtForm = document.getElementById('debt-form');
        if (debtForm) {
            debtForm.style.display = 'none';
            const debtHeader = debtForm.previousElementSibling;
            if (debtHeader && debtHeader.tagName === 'H3') {
                debtHeader.style.display = 'none';
            }
        }
    }
}

async function logAccess(role, status) {
    if (!state.accessLog) state.accessLog = [];
    state.accessLog.unshift({ role, status, timestamp: new Date().toISOString() });
    if (state.accessLog.length > 50) state.accessLog.pop();
    // saveData() çağrısı kaldırıldı
}

async function login(user, onLoginSuccess) {
    // YENİ MANTIK: Kullanıcının rolünü profilden alıyoruz
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (error || !profile) {
        const errorMessageElement = document.getElementById('login-error-message');
        if (errorMessageElement) {
            errorMessageElement.textContent = 'Giriş başarılı ancak profil/rol ataması bulunamadı!';
            errorMessageElement.style.display = 'block';
        }
        supabase.auth.signOut();
        return;
    }

    const role = profile.role;
    currentUserRole = role;
    sessionStorage.setItem('currentUserRole', role);

    const loginOverlay = document.getElementById('login-overlay');
    const mainContainer = document.querySelector('.main-container');
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'flex';
    
    await logAccess(role, 'başarılı');
    onLoginSuccess();
}

// YENİ TEK GİRİŞ FONKSİYONU
async function handleLoginAttempt(e, onLoginSuccess) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMessageElement = document.getElementById('login-error-message');
    if (errorMessageElement) errorMessageElement.style.display = 'none';

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        if (errorMessageElement) {
            errorMessageElement.textContent = 'Hatalı e-posta veya şifre!';
            errorMessageElement.style.display = 'block';
        }
    } else if (data.user) {
        await login(data.user, onLoginSuccess);
    }
}

async function logout() {
    sessionStorage.removeItem('currentUserRole');
    
    // signOut işleminin bitmesini bekle
    const { error } = await supabase.auth.signOut();
    
    if (error) {
        console.error("Çıkış yapılırken hata oluştu:", error);
    }
    
    // Çıkış işlemi bittikten SONRA sayfayı yenile
    location.reload();
}
export function getCurrentRole() {
    return currentUserRole;
}

export function initializeAuthManager(elements, onLogin) {
    uiElements = elements;
    
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (loginForm) loginForm.addEventListener('submit', (e) => handleLoginAttempt(e, onLogin));
    
    // ESKİ OTURUM KONTROLÜNÜ KALDIRDIK.
    // Artık sayfa her yenilendiğinde bu blok çalışacak:
    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) {
        loginOverlay.style.display = 'flex';
    }
}