// scripts/settingsManager.js
import { state } from './dataManager.js';
import { renderAll } from './uiManager.js';
import { supabase } from './supabaseClient.js';

let uiElements;

// Ayarları (kanallar ve nedenler) veritabanından tazeleyen yardımcı fonksiyon
async function refreshSettings() {
    const { data: channels, error: channelsError } = await supabase.from('sales_channels').select('*');
    if(channelsError) console.error("Satış kanalları çekilemedi:", channelsError);
    else state.salesChannels = channels.map(c => c.name) || [];

    const { data: reasons, error: reasonsError } = await supabase.from('wastage_reasons').select('*');
    if(reasonsError) console.error("Fire nedenleri çekilemedi:", reasonsError);
    else state.wastageReasons = reasons.map(r => r.name) || [];

    renderAll();
}

async function handleReasonSubmit(e) {
    e.preventDefault();
    const newReason = uiElements.newReasonInput.value.trim();
    if (newReason && !state.wastageReasons.includes(newReason)) {
        // State'i değiştirmek yerine Supabase'e ekliyoruz
        const { error } = await supabase.from('wastage_reasons').insert([{ name: newReason }]);
        if(error) return alert(`Neden eklenemedi: ${error.message}`);
        await refreshSettings(); // Verileri tazeleyip arayüzü güncelliyoruz
        uiElements.newReasonInput.value = '';
    } else {
        alert("Bu neden zaten mevcut veya geçersiz bir giriş yaptınız.");
    }
}

async function deleteReason(index) {
    const reasonToDelete = state.wastageReasons[index];
    if (reasonToDelete && confirm(`'${reasonToDelete}' adlı nedeni silmek istediğinizden emin misiniz?`)) {
        const { error } = await supabase.from('wastage_reasons').delete().eq('name', reasonToDelete);
        if(error) return alert(`Neden silinemedi: ${error.message}`);
        await refreshSettings();
    }
}

async function handleChannelSubmit(e) {
    e.preventDefault();
    const newChannel = uiElements.newChannelInput.value.trim();
    if (newChannel && !state.salesChannels.includes(newChannel)) {
        const { error } = await supabase.from('sales_channels').insert([{ name: newChannel }]);
        if(error) return alert(`Kanal eklenemedi: ${error.message}`);
        await refreshSettings();
        uiElements.newChannelInput.value = '';
    } else {
        alert("Bu kanal zaten mevcut veya geçersiz bir giriş yaptınız.");
    }
}

async function deleteChannel(index) {
    if (index === 0) {
        return alert("Ana 'Dükkan Satışı' kanalı silinemez.");
    }
    const channelToDelete = state.salesChannels[index];
    if (channelToDelete && confirm(`'${channelToDelete}' adlı kanalı silmek istediğinizden emin misiniz?`)) {
        const { error } = await supabase.from('sales_channels').delete().eq('name', channelToDelete);
        if(error) return alert(`Kanal silinemedi: ${error.message}`);
        await refreshSettings();
    }
}

export function initializeSettingsManager(elements) {
    uiElements = elements;
    window.app = window.app || {};
    window.app.deleteReason = deleteReason;
    window.app.deleteChannel = deleteChannel;

    if (uiElements.reasonManagementForm) {
        uiElements.reasonManagementForm.addEventListener('submit', handleReasonSubmit);
    }
    if (uiElements.channelManagementForm) {
        uiElements.channelManagementForm.addEventListener('submit', handleChannelSubmit);
    }
}