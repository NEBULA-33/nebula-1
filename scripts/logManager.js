// scripts/logManager.js

import { state } from './dataManager.js';
import { supabase } from './supabaseClient.js';

export async function logAction(type, details) {
    // Bu 'state.auditLog' kısmı, eski yapıdan kalma bir alışkanlık.
    // Artık tüm loglar Supabase'e gittiği için kritik değil, ama hata vermemesi için bırakıyoruz.
    if (!state.auditLog) {
        state.auditLog = [];
    }

    const logEntry = {
        action_type: type,
        details: details,
        // Hangi dükkanda ve kim tarafından yapıldığını da ekliyoruz
        shop_id: state.currentShop ? state.currentShop.id : null,
        user_id: state.currentUser ? state.currentUser.id : null
    };
    
    // Log kaydını Supabase'deki audit_log tablosuna gönderiyoruz
    const { error } = await supabase.from('audit_log').insert([logEntry]);
    
    if (error) {
        console.error("Log kaydı Supabase'e gönderilemedi:", error);
    }
}