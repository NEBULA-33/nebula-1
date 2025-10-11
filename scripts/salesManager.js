// GÜNCELLEMEYİ ZORLAMAK İÇİN TEST YORUMU
import { state } from './dataManager.js';
import { renderAll } from './uiManager.js';
import { supabase } from './supabaseClient.js';
import { logAction } from './logManager.js';
import { findProductByCode } from './stockManager.js';

let uiElements = {};

// Stok güncellendikten sonra arayüzü yenilemek için yardımcı fonksiyon
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

export function addToCart(product, quantity) {
    if (!product || quantity <= 0) return;
    if (product.stock < quantity) {
        alert(`Stokta yeterli ürün yok! Mevcut stok: ${product.stock}`);
        return;
    }
    
    if (!product.is_weighable) {
        const existingItem = state.currentCart.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            state.currentCart.push({ ...product, quantity, cartId: Date.now() });
        }
    } else {
        state.currentCart.push({ ...product, quantity, cartId: Date.now() });
    }
    renderAll();
}

export function removeFromCart(cartId) {
    state.currentCart = state.currentCart.filter(item => item.cartId !== cartId);
    renderAll();
}

export function clearCart() {
    state.currentCart = [];
    renderAll();
}
export function increaseCartItemQuantity(cartId) {
    const item = state.currentCart.find(i => i.cartId === cartId);
    if (!item) return;

    // Stok kontrolü yap
    const productInStock = state.products.find(p => p.id === item.id);
    // Ürünün mevcut stok miktarı, sepetteki miktarından fazla olmalı
    if (productInStock && productInStock.stock > item.quantity) {
        item.quantity += 1;
        renderAll();
    } else {
        alert('Stokta yeterli ürün yok!');
    }
}

export function decreaseCartItemQuantity(cartId) {
    const item = state.currentCart.find(i => i.cartId === cartId);
    if (!item) return;

    item.quantity -= 1;

    // Eğer miktar 0'a düşerse ürünü sepetten tamamen kaldır
    if (item.quantity <= 0) {
        removeFromCart(cartId);
    } else {
        renderAll();
    }
}

export async function completeSale() {
    if (state.currentCart.length === 0) return;

    // YENİ: Aktif dükkan ve kullanıcı ID'sini state'den alıyoruz
    const currentShopId = state.currentShop ? state.currentShop.id : null;
    const currentUserId = state.currentUser ? state.currentUser.id : null;

    if (!currentShopId || !currentUserId) {
        return alert("Aktif dükkan veya kullanıcı bilgisi bulunamadı! Lütfen tekrar giriş yapın.");
    }

    const selectedChannel = uiElements.salesChannelSelect.value || state.salesChannels[0] || 'Dükkan Satışı';
    const saleTimestamp = new Date().toISOString();

    // 1. Satılan her bir ürünü 'sales' tablosuna kaydetmek için hazırla
    const saleRecords = state.currentCart.map(cartItem => ({
        product_id: cartItem.id,
        product_name: cartItem.name,
        quantity: cartItem.quantity,
        purchase_price: cartItem.purchase_price,
        selling_price: cartItem.selling_price,
        total_revenue: cartItem.selling_price * cartItem.quantity,
        vat_rate: cartItem.vat_rate,
        channel: selectedChannel,
        sale_timestamp: saleTimestamp,
        // YENİ: Kayda aktif dükkanın ve kullanıcının ID'sini ekliyoruz
        shop_id: currentShopId,
        user_id: currentUserId 
    }));

    const { error: saleError } = await supabase.from('sales').insert(saleRecords);

    if (saleError) {
        return alert(`Satış kaydedilirken bir hata oluştu: ${saleError.message}`);
    }

    // 2. Satılan ürünlerin stoklarını güncelle
    for (const cartItem of state.currentCart) {
        const productInStock = state.products.find(p => p.id === cartItem.id);
        if (productInStock) {
            const newStock = productInStock.stock - cartItem.quantity;
            await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', cartItem.id);
        }
    }
    
    await logAction('SALE_COMPLETED', { 
        itemCount: state.currentCart.length, 
        total: saleRecords.reduce((sum, r) => sum + r.total_revenue, 0)
    });

    clearCart();
    await refreshProducts();
    
    alert(`Satış başarıyla tamamlandı ve '${selectedChannel}' kanalına kaydedildi!`);
}

// salesManager.js içindeki ESKİ handleBarcodeSell fonksiyonunu SİLİP, YERİNE BUNU YAPIŞTIRIN

function handleBarcodeSell(e) {
    e.preventDefault();
    const scannedCode = uiElements.barcodeScanInput.value.trim();
    if (!scannedCode) return;

    // Bütün akıllı arama mantığını (terazi, koli, çarpanlı PLU, standart barkod)
    // stockManager'daki merkezi fonksiyona devrediyoruz.
    const result = findProductByCode(scannedCode);

    if (result && result.product) {
        // Fonksiyondan dönen doğru ürün ve doğru miktar (çarpan uygulanmış hali) ile sepete ekle
        addToCart(result.product, result.quantity);
    } else {
        alert('Bu barkoda sahip bir ürün bulunamadı!');
    }
    
    uiElements.barcodeScanInput.value = '';
    uiElements.barcodeScanInput.focus();
}



export function initializeSalesManager(elements) {
    uiElements = elements;
    window.app = window.app || {};
    window.app.addToCart = addToCart;
    window.app.removeFromCart = removeFromCart;
    window.app.increaseCartItemQuantity = increaseCartItemQuantity;
    window.app.decreaseCartItemQuantity = decreaseCartItemQuantity;
    if (uiElements.barcodeSellForm) uiElements.barcodeSellForm.addEventListener('submit', handleBarcodeSell);
    if (uiElements.completeSaleBtn) uiElements.completeSaleBtn.addEventListener('click', completeSale);
    if (uiElements.clearCartBtn) uiElements.clearCartBtn.addEventListener('click', clearCart);

    // YENİ PARA ÜSTÜ HESAPLAMA KODU
    const amountPaidInput = document.getElementById('amount-paid');
    const changeDueDisplay = document.getElementById('change-due');
    
    if (amountPaidInput && changeDueDisplay) {
        amountPaidInput.addEventListener('input', () => {
            const grandTotalText = document.getElementById('grand-total').textContent;
            const grandTotal = parseFloat(grandTotalText) || 0;
            const amountPaid = parseFloat(amountPaidInput.value) || 0;
            
            if (amountPaid >= grandTotal) {
                const change = amountPaid - grandTotal;
                changeDueDisplay.textContent = `${change.toFixed(2)} TL`;
            } else {
                changeDueDisplay.textContent = '0.00 TL';
            }
        });
    }

    // Sepet temizlendiğinde veya satış tamamlandığında para üstü alanını da temizle
    const originalClearCart = clearCart;
    clearCart = () => {
        originalClearCart();
        if (amountPaidInput) amountPaidInput.value = '';
        if (changeDueDisplay) changeDueDisplay.textContent = '0.00 TL';
    };

    const originalCompleteSale = completeSale;
    completeSale = async () => {
        await originalCompleteSale();
        if (amountPaidInput) amountPaidInput.value = '';
        if (changeDueDisplay) changeDueDisplay.textContent = '0.00 TL';
    };
}