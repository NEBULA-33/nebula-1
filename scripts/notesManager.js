// scripts/notesManager.js

import { state } from './dataManager.js';
import { renderAll } from './uiManager.js';
import { logAction } from './logManager.js';
import { supabase } from './supabaseClient.js';

let uiElements = {};

// Sadece aktif dükkanın notlarını tazeleyen yardımcı fonksiyon
async function refreshNotes() {
    const currentShopId = state.currentShop?.id;
    if (!currentShopId) return;

    const { data, error } = await supabase
        .from('personal_notes')
        .select('*')
        .eq('shop_id', currentShopId)
        .order('created_at', { ascending: false });

    if(error) {
        console.error("Notlar çekilemedi:", error);
    } else {
        state.personalNotes = data || [];
        renderAll();
    }
}

async function handleNoteSubmit(e) {
    e.preventDefault();
    const content = uiElements.noteContent.value.trim();
    if (!content) return;

    const currentShopId = state.currentShop?.id;
    const currentUserId = state.currentUser?.id;
    if (!currentShopId || !currentUserId) return alert("Aktif dükkan veya kullanıcı bilgisi bulunamadı!");

    const newNote = { 
        content: content,
        shop_id: currentShopId, // YENİ
        user_id: currentUserId  // YENİ
    };

    const { error } = await supabase.from('personal_notes').insert([newNote]);
    
    if (error) {
        alert(`Not kaydedilemedi: ${error.message}`);
    } else {
        await logAction('NOTE_CREATE', { noteContent: content.substring(0, 20) });
        await refreshNotes();
        e.target.reset();
    }
}

async function deleteNote(id) {
    if (confirm("Bu notu silmek istediğinizden emin misiniz?")) {
        const { error } = await supabase.from('personal_notes').delete().eq('id', id);
        if (error) {
            alert(`Not silinemedi: ${error.message}`);
        } else {
            await logAction('NOTE_DELETE', { noteId: id });
            await refreshNotes();
        }
    }
}

export function initializeNotesManager(elements) {
    uiElements = elements;
    window.app = window.app || {};
    window.app.deleteNote = deleteNote;

    if (uiElements.noteForm) {
        uiElements.noteForm.addEventListener('submit', handleNoteSubmit);
    }
}