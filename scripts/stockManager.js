import { state } from './dataManager.js';
import { renderAll } from './uiManager.js';
import { showMessage } from './utils.js';
import { logAction } from './logManager.js';
import { supabase } from './supabaseClient.js';

let uiElements;
let currentStockInScans = [];

// Verileri tazelemek için yardımcı fonksiyon
async function refreshProducts() {
    const currentShopId = state.currentShop.id;
    if (!currentShopId) return;
    const { data, error } = await supabase.from('products').select('*').eq('shop_id', currentShopId);
    if (error) {
        console.error('Ürünler yenilenemedi:', error);
    } else {
        state.products = data || [];
        renderAll();
    }
}

function findProductByCode(code) {
    if (code.startsWith('28') && code.length >= 12) {
        const pluCode = code.substring(2, 7);
        const weightInGrams = parseInt(code.substring(7, 12));
        const product = state.products.find(p => p.is_weighable && p.plu_codes && p.plu_codes.includes(pluCode));
        if (product) {
            return { product, quantity: weightInGrams / 1000.0 };
        }
    } else {
        const product = state.products.find(p => !p.is_weighable && p.barcode === code);
        if (product) {
            return { product, quantity: 1 };
        }
    }
    return null;
}

function addScanToStockInList(product, quantity) {
    currentStockInScans.push({ id: product.id, name: product.name, quantity: quantity, timestamp: new Date().toISOString() });
    renderAll();
    showMessage(uiElements.stockInMessage, `Listeye eklendi: ${product.name}`, 'success');
}

function handleStockInScan(e) {
    e.preventDefault();
    const code = uiElements.stockInBarcodeScanInput.value.trim();
    if (!code) return;
    const result = findProductByCode(code);
    if (result) {
        addScanToStockInList(result.product, result.quantity);
    } else {
        showMessage(uiElements.stockInMessage, 'Bu koda sahip ürün bulunamadı!', 'error');
    }
    uiElements.stockInForm.reset();
    uiElements.stockInBarcodeScanInput.focus();
}

async function confirmStockIn() {
    if (currentStockInScans.length === 0) return;
    if (!confirm('Giriş listesindeki tüm ürünleri stoklara eklemek istediğinizden emin misiniz?')) return;

    const currentShopId = state.currentShop.id;
    const currentUserId = state.currentUser.id;
    if (!currentShopId || !currentUserId) return alert("Aktif dükkan/kullanıcı bulunamadı.");

    // 1. Stok girişlerini geçmiş tablosuna kaydet
    const historyRecords = currentStockInScans.map(scan => {
        const product = state.products.find(p => p.id === scan.id);
        return {
            product_id: scan.id,
            product_name: scan.name,
            quantity: scan.quantity,
            purchase_price: product ? product.purchase_price : 0,
            shop_id: currentShopId, // YENİ
            user_id: currentUserId  // YENİ
        };
    });
    const { error: historyError } = await supabase.from('stock_in_history').insert(historyRecords);
    if (historyError) return alert(`Stok geçmişi kaydedilirken hata oluştu: ${historyError.message}`);

    // 2. Ürünlerin stoklarını güncelle
    for (const scan of currentStockInScans) {
        const productInStock = state.products.find(p => p.id === scan.id);
        if (productInStock) {
            const newStock = (productInStock.stock || 0) + scan.quantity;
            await supabase.from('products').update({ stock: newStock }).eq('id', scan.id);
        }
    }
    
    await logAction('STOCK_IN', { itemCount: currentStockInScans.length });
    currentStockInScans = [];
    await refreshProducts();
    alert('Stok girişi başarıyla tamamlandı!');
}

async function handleWastageSubmit(e) {
    e.preventDefault();
    const productId = parseInt(uiElements.wastageProductSelect.value);
    const quantity = parseFloat(uiElements.wastageQuantityInput.value);
    const reason = uiElements.wastageReasonSelect.value;
    
    const currentShopId = state.currentShop.id;
    const currentUserId = state.currentUser.id;
    if (!currentShopId || !currentUserId) return alert("Aktif dükkan/kullanıcı bulunamadı.");

    if (!productId || !quantity || quantity <= 0 || !reason) {
        return showMessage(uiElements.wastageMessage, 'Lütfen tüm alanları doldurun.', 'error');
    }
    const product = state.products.find(p => p.id === productId);
    if (!product || (product.stock || 0) < quantity) {
        return showMessage(uiElements.wastageMessage, 'Geçersiz ürün veya yetersiz stok!', 'error');
    }

    const newStock = product.stock - quantity;
    
    // 1. Ürün stoğunu güncelle
    const { error: updateError } = await supabase.from('products').update({ stock: newStock }).eq('id', productId);
    if(updateError) return alert(`Stok güncellenirken hata: ${updateError.message}`);

    // 2. Fire geçmişini kaydet
    const wastageRecord = {
        product_id: product.id,
        product_name: product.name,
        quantity: quantity,
        reason: reason,
        cost: (product.purchase_price || 0) * quantity,
        shop_id: currentShopId, // YENİ
        user_id: currentUserId  // YENİ
    };
    const { error: historyError } = await supabase.from('wastage_history').insert([wastageRecord]);
    if(historyError) return alert(`Fire geçmişi kaydedilirken hata: ${historyError.message}`);

    await logAction('WASTAGE', { productName: product.name, quantity, reason });
    await refreshProducts();
    e.target.reset();
    showMessage(uiElements.wastageMessage, 'Ürün stoktan düşüldü.', 'success');
}

async function handleReturnSubmit(e) {
    e.preventDefault();
    const productId = parseInt(uiElements.returnProductSelect.value);
    const quantity = parseFloat(uiElements.returnQuantityInput.value);
    const reason = uiElements.returnReasonSelect.value;

    const currentShopId = state.currentShop.id;
    const currentUserId = state.currentUser.id;
    if (!currentShopId || !currentUserId) return alert("Aktif dükkan/kullanıcı bulunamadı.");
    
    if (!productId || !quantity || quantity <= 0 || !reason) {
        return showMessage(uiElements.returnMessage, 'Lütfen ürün seçin, miktar ve neden girin.', 'error');
    }
    const product = state.products.find(p => p.id == productId);
    if (!product) return;

    // 1. Adım: Ürün stoğunu güncelle (Bu adım zaten çalışıyor)
    const newStock = (product.stock || 0) + quantity;
    const { error: updateError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', productId);

    if(updateError) {
        return alert(`Stok güncellenirken hata: ${updateError.message}`);
    }

    // 2. Adım: İade geçmişini kaydet
    const returnRecord = {
        product_id: product.id,
        product_name: product.name,
        quantity: quantity,
        reason: reason,
        value: (product.selling_price || 0) * quantity,
        shop_id: currentShopId,
        user_id: currentUserId
    };
    const { error: historyError } = await supabase.from('return_history').insert([returnRecord]);
    if(historyError) return alert(`İade geçmişi kaydedilirken hata: ${historyError.message}`);
    
    // 3. Adım: Finansal raporlar için negatif satış kaydı oluştur (Hatanın olduğu yer)
    const saleRecord = {
        product_id: product.id,
        product_name: product.name,
        quantity: -quantity,
        selling_price: product.selling_price,
        total_revenue: -(product.selling_price * quantity),
        vat_rate: product.vat_rate,
        shop_id: currentShopId,
        user_id: currentUserId,
        sale_timestamp: new Date().toISOString() // EKLENMESİ GEREKEN KRİTİK SATIR
    };
    const { error: saleError } = await supabase.from('sales').insert([saleRecord]);
    
    // Hata kontrolünü buraya alalım
    if(saleError) return alert(`İade, satış geçmişine kaydedilirken hata: ${saleError.message}`);

    
    await logAction('RETURN', { productName: product.name, quantity, reason });
    await refreshProducts();
    e.target.reset();
    showMessage(uiElements.returnMessage, 'İade işlemi başarılı.', 'success');
}

export function getCurrentStockInScans() {
    return currentStockInScans;
}

export function initializeStockManager(elements) {
    uiElements = elements;
    if (uiElements.stockInForm) uiElements.stockInForm.addEventListener('submit', handleStockInScan);
    if (uiElements.confirmStockInBtn) uiElements.confirmStockInBtn.addEventListener('click', confirmStockIn);
    if (uiElements.wastageForm) uiElements.wastageForm.addEventListener('submit', handleWastageSubmit);
    if (uiElements.returnForm) uiElements.returnForm.addEventListener('submit', handleReturnSubmit);
}