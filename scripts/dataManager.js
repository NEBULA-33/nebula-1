// scripts/dataManager.js

import { supabase } from './supabaseClient.js';

export const state = {
    products: [],
    sales: [],
    debts: [],
    personalNotes: [], 
    butcheringRecipes: [],
    accessLog: [],
    auditLog: [],
    currentCart: [],
    currentStockInScans: [],
    butcheringHistory: [],
    returnHistory: [],
    wastageHistory: [],
    stockInHistory: [],
    productUpdateHistory: [],
    wastageReasons: [],
    salesChannels: [],

    // Çoklu dükkan yapısı için yeni state'ler
    currentUser: null,
    currentShop: null,
    userProfile: null
};

export async function loadInitialData() {
    console.log("Veriler Supabase'den yükleniyor...");
    try {
        // 1. Adım: O an giriş yapmış kullanıcıyı al
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.log("Kullanıcı girişi yapılmamış.");
            return;
        }
        state.currentUser = user;

        // 2. Adım: Kullanıcının profilini ve dükkan bilgilerini çek
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select(`
                *,
                shops ( * ) 
            `)
            .eq('id', user.id)
            .single();

        if (profileError) throw profileError;
        if (!profileData) {
            alert("Kullanıcı profili bulunamadı! Lütfen yönetici ile görüşün.");
            return;
        }

        state.userProfile = profileData;
        state.currentShop = profileData.shops;
        const currentShopId = state.currentShop.id;
        console.log(`Aktif Dükkan: ${state.currentShop.name} (ID: ${currentShopId})`);

        // 3. Adım: Sadece o dükkana ait verileri ve genel ayarları çek
        const [
            { data: productsData },
            { data: recipesData },
            { data: debtsData },
            { data: notesData },
            { data: channelsData },
            { data: reasonsData }
        ] = await Promise.all([
            supabase.from('products').select('*').eq('shop_id', currentShopId),
            supabase.from('butchering_recipes').select('*').eq('shop_id', currentShopId),
            supabase.from('debt_persons').select('*, debt_transactions!inner(*)').eq('shop_id', currentShopId),
            supabase.from('personal_notes').select('*').eq('shop_id', currentShopId),
            supabase.from('sales_channels').select('*'), // Genel ayar
            supabase.from('wastage_reasons').select('*')  // Genel ayar
        ]);

        // 4. Adım: Gelen verileri state objemize aktar
        state.products = productsData || [];
        state.butcheringRecipes = recipesData || [];
        state.debts = debtsData || [];
        state.personalNotes = notesData || [];
        state.salesChannels = channelsData.map(c => c.name) || [];
        state.wastageReasons = reasonsData.map(r => r.name) || [];

        console.log("Aktif dükkana ait veriler başarıyla yüklendi.");

    } catch (error) {
        console.error("Veri yüklenirken kritik bir hata oluştu:", error);
        alert("Veriler sunucudan yüklenemedi! İnternet bağlantınızı kontrol edin veya profil/dükkan atamanızı kontrol edin.");
    }
}

// Supabase tabanlı yedekleme fonksiyonu
export async function exportData() {
    alert("Yedekleme işlemi başlıyor. Bu işlem veritabanı boyutuna göre biraz zaman alabilir.");
    try {
        const tablesToExport = [
            'products', 'sales', 'debt_persons', 'debt_transactions', 
            'butchering_recipes', 'personal_notes', 'audit_log',
            'stock_in_history', 'wastage_history', 'return_history',
            'sales_channels', 'wastage_reasons', 'shops', 'profiles'
        ];
        
        const backupData = {};

        for (const table of tablesToExport) {
            const { data, error } = await supabase.from(table).select('*');
            if (error) throw error;
            backupData[table] = data;
        }

        const dataStr = JSON.stringify(backupData, null, 2);
        const dataBlob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        const date = new Date();
        const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        link.download = `supabase_yedek_${dateStr}.json`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        alert('Tüm verileriniz başarıyla yedeklendi!');

    } catch (error) {
        console.error("Yedekleme hatası:", error);
        alert(`Yedekleme sırasında bir hata oluştu: ${error.message}`);
    }
}

// Supabase tabanlı yedekten geri yükleme fonksiyonu
export function importData(event, onImportSuccess) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('UYARI: Bu işlem Supabase veritabanınızdaki MEVCUT TÜM VERİLERİ SİLECEK ve yedek dosyasındaki verilerle değiştirecektir. Bu işlem geri alınamaz. Emin misiniz?')) {
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            alert("Geri yükleme başlıyor. Lütfen işlem bitene kadar bekleyin.");

            // Tabloları doğru sırada işlemek için (ilişkilerden dolayı)
            const tableOrder = [
                'shops', 'products', 'sales_channels', 'wastage_reasons',
                'butchering_recipes', 'debt_persons', 'personal_notes', 
                'sales', 'debt_transactions', 'audit_log', 'stock_in_history', 
                'wastage_history', 'return_history', 'profiles'
            ];

            for (const tableName of tableOrder) {
                if (importedData[tableName]) {
                     // Önce tablodaki mevcut tüm verileri sil
                    const { error: deleteError } = await supabase.from(tableName).delete().neq('id', 'a-random-non-existent-id');
                    if (deleteError) throw new Error(`${tableName} tablosu temizlenemedi: ${deleteError.message}`);

                    // Yedekten gelen verileri ekle
                    if (importedData[tableName].length > 0) {
                        const { error: insertError } = await supabase.from(tableName).insert(importedData[tableName]);
                        if (insertError) throw new Error(`${tableName} tablosuna veri eklenemedi: ${insertError.message}`);
                    }
                }
            }
            
            alert('Veriler başarıyla geri yüklendi! Uygulama yeniden başlatılıyor...');
            location.reload();

        } catch (error) {
            alert(`Hata: Dosya yüklenirken bir sorun oluştu. ${error.message}`);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}