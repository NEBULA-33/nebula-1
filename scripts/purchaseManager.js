// scripts/purchaseManager.js

import { state } from './dataManager.js';
import { renderAll } from './uiManager.js';
import { supabase } from './supabaseClient.js';
import { logAction } from './logManager.js';
import { showMessage } from './utils.js';
import { findProductByCode } from './stockManager.js';

let uiElements;
let currentPurchaseCart = [];
let currentSuppliers = [];

// Bu modüle özel verileri (tedarikçiler) çeken fonksiyon
async function loadPurchaseData() {
    const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('shop_id', state.currentShop.id);

    if (error) {
        console.error("Tedarikçiler yüklenemedi:", error);
        currentSuppliers = [];
    } else {
        currentSuppliers = data || [];
    }
    renderAll();
}

// YENİ VE GÜVENLİ FONKSİYON
async function getLastPurchasePrice(productId) {
    // .single() kaldırıldı, bu sayede kayıt bulunamayınca hata vermeyecek, boş bir liste döndürecek.
    const { data, error } = await supabase
        .from('purchase_invoice_items')
        .select('purchase_price')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(1); // .single() komutu buradan kaldırıldı

    // Hata varsa VEYA dönen liste (data) boşsa VEYA listenin ilk elemanı yoksa...
    if (error || !data || data.length === 0) {
        // ...ürünün kendi tablosundaki genel alış fiyatını öner.
        const product = state.products.find(p => p.id === productId);
        return product ? product.purchase_price : 0;
    }
    
    // Eğer kayıt bulunduysa, data artık bir liste olduğu için ilk elemanının fiyatını alıyoruz.
    return data[0].purchase_price;
}

// Fatura sepetine ürün ekleme fonksiyonu
export async function addProductToPurchaseCart(productId, quantity = 1) {
    if (!productId) return;

    const product = state.products.find(p => p.id == productId);
    if (!product) return;

    const existingItem = currentPurchaseCart.find(item => item.id === product.id);
    if (existingItem) {
        existingItem.quantity += quantity; // Gelen miktarı ekle
    } else {
        const suggestedPrice = await getLastPurchasePrice(product.id);
        currentPurchaseCart.push({
            ...product,
            quantity: quantity, // Gelen miktarla başlat
            purchase_price: suggestedPrice
        });
    }
    renderAll();
}

// Formdan tedarikçi ekleme
async function handleSupplierSubmit(e) {
    e.preventDefault();
    const supplierName = uiElements.supplierNameInput.value.trim();
    if (!supplierName) return;

    const newSupplier = {
        name: supplierName,
        contact_person: uiElements.supplierContactInput.value.trim(),
        phone: uiElements.supplierPhoneInput.value.trim(),
        shop_id: state.currentShop.id
    };

    const { error } = await supabase.from('suppliers').insert([newSupplier]);
    if (error) {
        alert(`Tedarikçi eklenemedi: ${error.message}`);
    } else {
        showMessage(uiElements.supplierMessage, "Tedarikçi başarıyla eklendi.", "success");
        e.target.reset();
        await loadPurchaseData(); // Listeyi yenile
    }
}
async function handlePurchaseBarcodeScan(e) {
    e.preventDefault();
    const code = uiElements.purchaseBarcodeScanInput.value.trim();
    if (!code) return;

    const result = findProductByCode(code); // stockManager'daki mantığı kullan

    if (result && result.product) {
        // Ürün bulunduysa, ilgili miktarla fatura sepetine ekle
        await addProductToPurchaseCart(result.product.id, result.quantity);
        showMessage(uiElements.supplierMessage, `${result.product.name} listeye eklendi.`, 'success');
    } else {
        showMessage(uiElements.supplierMessage, 'Bu barkoda sahip ürün bulunamadı!', 'error');
    }

    uiElements.purchaseBarcodeScanInput.value = '';
    uiElements.purchaseBarcodeScanInput.focus();
}
// Faturayı ve stok girişini onayla
async function confirmPurchaseInvoice() {
    const supplierId = uiElements.invoiceSupplierSelect.value;
    const invoiceDate = uiElements.invoiceDateInput.value;

    if (!supplierId || !invoiceDate || currentPurchaseCart.length === 0) {
        return alert("Lütfen tedarikçi, fatura tarihi seçin ve faturaya ürün ekleyin.");
    }

    try {
        // 1. Ana Fatura Kaydını Oluştur
        const totalAmount = currentPurchaseCart.reduce((sum, item) => sum + (item.quantity * item.purchase_price), 0);
        const invoiceData = {
            supplier_id: supplierId,
            invoice_date: invoiceDate,
            total_amount: totalAmount,
            status: 'Ödendi', // Varsayılan
            shop_id: state.currentShop.id,
            user_id: state.currentUser.id
        };
        
        const { data: savedInvoice, error: invoiceError } = await supabase
            .from('purchase_invoices')
            .insert([invoiceData])
            .select()
            .single();

        if (invoiceError) throw new Error(`Fatura kaydedilemedi: ${invoiceError.message}`);

        // 2. Fatura Kalemlerini Kaydet
        const invoiceItems = currentPurchaseCart.map(item => ({
            invoice_id: savedInvoice.id,
            product_id: item.id,
            quantity: item.quantity,
            purchase_price: item.purchase_price
        }));

        const { error: itemsError } = await supabase.from('purchase_invoice_items').insert(invoiceItems);
        if (itemsError) throw new Error(`Fatura kalemleri kaydedilemedi: ${itemsError.message}`);

        // 3. Stokları Güncelle
        for (const item of currentPurchaseCart) {
            const newStock = (item.stock || 0) + item.quantity;
            await supabase.from('products').update({ stock: newStock }).eq('id', item.id);
        }
        
        await logAction('PURCHASE_INVOICE_CREATE', { supplierId, totalAmount });

        alert("Alım faturası başarıyla kaydedildi ve stoklar güncellendi!");
        currentPurchaseCart = [];
        uiElements.purchaseInvoiceForm.reset();
        await loadPurchaseData(); // Arayüzü temizle ve yenile
        
    } catch (error) {
        alert(error.message);
    }
}

// Dışarıdan erişim için fonksiyonları ve verileri tanımla
export function getPurchaseCart() { return currentPurchaseCart; }
export function getSuppliers() { return currentSuppliers; }
export function updatePurchaseCartItem(productId, field, value) {
    const item = currentPurchaseCart.find(p => p.id == productId);
    if (item) {
        item[field] = value;
        renderAll();
    }
}
export function removePurchaseCartItem(productId) {
    currentPurchaseCart = currentPurchaseCart.filter(p => p.id != productId);
    renderAll();
}


export function initializePurchaseManager(elements) {
    uiElements = elements;

    // Fonksiyonları global window objesine ekle
    window.app = window.app || {};
    window.app.addProductToPurchaseCart = addProductToPurchaseCart;
    window.app.updatePurchaseCartItem = updatePurchaseCartItem;
    window.app.removePurchaseCartItem = removePurchaseCartItem;
    
    // Event Listener'lar
    if (uiElements.supplierForm) {
        uiElements.supplierForm.addEventListener('submit', handleSupplierSubmit);
    }
    if (uiElements.confirmPurchaseBtn) {
        uiElements.confirmPurchaseBtn.addEventListener('click', confirmPurchaseInvoice);
    }
    if (uiElements.purchaseBarcodeForm) {
        uiElements.purchaseBarcodeForm.addEventListener('submit', handlePurchaseBarcodeScan);
    }

    // Bu sekmeye her tıklandığında tedarikçi listesini yeniden yükle
    const purchaseTabButton = document.querySelector('button[data-tab="purchases"]');
    if(purchaseTabButton) {
        purchaseTabButton.addEventListener('click', loadPurchaseData);
    }
}