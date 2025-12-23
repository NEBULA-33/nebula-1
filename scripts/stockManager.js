import { state } from './dataManager.js';
import { renderAll } from './uiManager.js';
import { showMessage } from './utils.js';
import { logAction } from './logManager.js';
import { supabase } from './supabaseClient.js';

let uiElements;
// NOT: currentStockInScans artık state objesinden yönetilecek
// let currentStockInScans = [];

// Verileri tazelemek için yardımcı fonksiyon
async function refreshData() {
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

// stockManager.js içindeki findProductByCode fonksiyonunun İLK if bloğunu bununla DEĞİŞTİR

export function findProductByCode(code) {
    // 1. Durum: Terazi Barkodu (27, 28, 29 ile başlayan)
    if ((code.startsWith('27') || code.startsWith('28') || code.startsWith('29')) && code.length >= 12) { 
        const pluCode = code.substring(2, 7); 
        const weightPart = code.substring(7, 12); 
        const weightInGrams = parseInt(weightPart);

        const product = state.products.find(p => {
            if (!p.is_weighable || !p.plu_codes) return false;
            
            // HEM String ("101") HEM Obje ({plu: "101"}) kontrolü
            return p.plu_codes.some(c => {
                const dbCode = (typeof c === 'string') ? c : c.plu;
                return dbCode === pluCode;
            });
        });

        if (product && !isNaN(weightInGrams)) {
            return { product, quantity: weightInGrams / 1000.0, isWeighable: true };
        }
    } 
    
    // 2. Durum: Diğer Barkodlar
    else {
        // Çarpanlı PLU kontrolü
        for (const product of state.products) {
            if (product.is_weighable && product.plu_codes) {
                const codeObj = product.plu_codes.find(c => typeof c === 'object' && c.plu === code);
                if (codeObj && codeObj.multiplier) {
                    return { product, quantity: codeObj.multiplier, isWeighable: true };
                }
                // Düz eşleşme (Çarpansız manuel giriş)
                 const simpleMatch = product.plu_codes.some(c => {
                    const dbCode = (typeof c === 'string') ? c : c.plu;
                    return dbCode === code;
                });
                if(simpleMatch) {
                     return { product, quantity: 1, isWeighable: true };
                }
            }
        }
        
        // Standart barkod
        const singleProduct = state.products.find(p => p.barcode === code);
        if (singleProduct) {
            return { product: singleProduct, quantity: 1, isWeighable: false };
        }
        
        // Koli barkodu
        for (const product of state.products) {
             if (product.packaging_options && Array.isArray(product.packaging_options)) {
                const packagingOption = product.packaging_options.find(opt => opt.barcode === code);
                if (packagingOption) {
                    return { product: product, quantity: packagingOption.quantity, isWeighable: false };
                }
            }
        }
    }

    return null;
}

function addScanToStockInList(product, quantity, isWeighable) {
    // Her bir eklemeye benzersiz bir kimlik (timestamp) atayalım
    state.currentStockInScans.push({ 
        id: product.id, 
        name: product.name, 
        quantity: quantity, 
        isWeighable: isWeighable, // Tartılabilir mi bilgisini ekleyelim
        timestamp: Date.now() // Benzersiz kimlik için anlık zaman damgası
    });
    renderAll();
    showMessage(uiElements.stockInMessage, `Listeye eklendi: ${product.name}`, 'success');
}

function handleStockInScan(e) {
    e.preventDefault();
    const code = uiElements.stockInBarcodeScanInput.value.trim();
    if (!code) return;
    const result = findProductByCode(code);
    if (result) {
        addScanToStockInList(result.product, result.quantity, result.isWeighable);
    } else {
        showMessage(uiElements.stockInMessage, 'Bu koda sahip ürün bulunamadı!', 'error');
    }
    uiElements.stockInForm.reset();
    uiElements.stockInBarcodeScanInput.focus();
}



// Listeden bir ürünü tamamen silme
function removeFromStockInList(timestamp) {
    state.currentStockInScans = state.currentStockInScans.filter(item => item.timestamp !== timestamp);
    renderAll();
}

// Listeye eklenmiş bir ürünün miktarını 1 azaltma
function decreaseStockInQuantity(timestamp) {
    const item = state.currentStockInScans.find(item => item.timestamp === timestamp);
    if (item && !item.isWeighable) { // Sadece tartılamayan ürünlerin miktarı azaltılabilir
        item.quantity -= 1;
        if (item.quantity <= 0) {
            // Miktar 0'a düşerse listeden tamamen kaldır
            removeFromStockInList(timestamp);
        } else {
            renderAll();
        }
    }
}
function increaseStockInQuantity(timestamp) {
    const item = state.currentStockInScans.find(item => item.timestamp === timestamp);
    // Sadece tartılabilir olmayan ürünlerin miktarı artırılabilir
    if (item && !item.isWeighable) {
        item.quantity += 1;
    }
    renderAll();
}
function toggleStockInGroup(productId) {
    const index = state.expandedStockInGroups.indexOf(productId);
    if (index > -1) {
        // Eğer ürün ID'si listede varsa (yani grup zaten açıksa), listeden çıkar (kapat).
        state.expandedStockInGroups.splice(index, 1);
    } else {
        // Eğer ürün ID'si listede yoksa (yani grup kapalıysa), listeye ekle (aç).
        state.expandedStockInGroups.push(productId);
    }
    renderAll(); // Arayüzü güncellemek için renderAll'ı çağır
}

// --- CONFIRMSTOCKIN GÜNCELLEMESİ ---

async function confirmStockIn() {
    const scans = state.currentStockInScans;
    if (scans.length === 0) return;
    if (!confirm('Giriş listesindeki tüm ürünleri stoklara eklemek istediğinizden emin misiniz?')) return;

    // 1. ADIM: Her bir üründen toplam ne kadar ekleneceğini hesaplayalım
    const totalQuantities = scans.reduce((map, scan) => {
        map[scan.id] = (map[scan.id] || 0) + scan.quantity;
        return map;
    }, {});

    const currentShopId = state.currentShop.id;
    const currentUserId = state.currentUser.id;
    if (!currentShopId || !currentUserId) return alert("Aktif dükkan/kullanıcı bulunamadı.");

    try {
        // 2. ADIM: Stok girişlerini geçmiş tablosuna tek seferde kaydet
        const historyRecords = scans.map(scan => {
            const product = state.products.find(p => p.id === scan.id);
            return {
                product_id: scan.id,
                product_name: scan.name,
                quantity: scan.quantity,
                purchase_price: product ? product.purchase_price : 0,
                shop_id: currentShopId,
                user_id: currentUserId
            };
        });
        const { error: historyError } = await supabase.from('stock_in_history').insert(historyRecords);
        if (historyError) throw new Error(`Stok geçmişi kaydedilemedi: ${historyError.message}`);

        // 3. ADIM: Her bir ürünün stoğunu toplu miktarla güncelle
        for (const productId in totalQuantities) {
            const quantityToAdd = totalQuantities[productId];
            const productInStock = state.products.find(p => p.id == productId);
            if (productInStock) {
                const newStock = (productInStock.stock || 0) + quantityToAdd;
                const { error: updateError } = await supabase.from('products').update({ stock: newStock }).eq('id', productId);
                if (updateError) throw new Error(`'${productInStock.name}' stoğu güncellenemedi: ${updateError.message}`);
            }
        }
        
        await logAction('STOCK_IN', { itemCount: scans.length, totalItems: Object.keys(totalQuantities).length });
        
        // İşlem başarılı, listeyi temizle ve arayüzü yenile
        state.currentStockInScans = [];
         state.expandedStockInGroups = [];
        await refreshData();
        alert('Stok girişi başarıyla tamamlandı!');

    } catch (error) {
        alert(error.message);
    }
}


// handleWastageSubmit ve handleReturnSubmit fonksiyonları aynı kalabilir...
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
    
    const { error: updateError } = await supabase.from('products').update({ stock: newStock }).eq('id', productId);
    if(updateError) return alert(`Stok güncellenirken hata: ${updateError.message}`);

    const wastageRecord = {
        product_id: product.id,
        product_name: product.name,
        quantity: quantity,
        reason: reason,
        cost: (product.purchase_price || 0) * quantity,
        shop_id: currentShopId,
        user_id: currentUserId
    };
    const { error: historyError } = await supabase.from('wastage_history').insert([wastageRecord]);
    if(historyError) return alert(`Fire geçmişi kaydedilirken hata: ${historyError.message}`);

    await logAction('WASTAGE', { productName: product.name, quantity, reason });
    await refreshData();
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

    const newStock = (product.stock || 0) + quantity;
    const { error: updateError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', productId);

    if(updateError) {
        return alert(`Stok güncellenirken hata: ${updateError.message}`);
    }

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
    
    const saleRecord = {
        product_id: product.id,
        product_name: product.name,
        quantity: -quantity,
        selling_price: product.selling_price,
        total_revenue: -(product.selling_price * quantity),
        vat_rate: product.vat_rate,
        shop_id: currentShopId,
        user_id: currentUserId,
        sale_timestamp: new Date().toISOString()
    };
    const { error: saleError } = await supabase.from('sales').insert([saleRecord]);
    
    if(saleError) return alert(`İade, satış geçmişine kaydedilirken hata: ${saleError.message}`);

    
    await logAction('RETURN', { productName: product.name, quantity, reason });
    await refreshData();
    e.target.reset();
    showMessage(uiElements.returnMessage, 'İade işlemi başarılı.', 'success');
}


export function initializeStockManager(elements) {
    uiElements = elements;

    // YENİ FONKSİYONLARI HTML'den erişilebilir yapalım
    window.app = window.app || {};
    window.app.removeFromStockInList = removeFromStockInList;
    window.app.decreaseStockInQuantity = decreaseStockInQuantity;
    window.app.increaseStockInQuantity = increaseStockInQuantity;  
    window.app.toggleStockInGroup = toggleStockInGroup;
        
    
    if (uiElements.stockInForm) uiElements.stockInForm.addEventListener('submit', handleStockInScan);
    if (uiElements.confirmStockInBtn) uiElements.confirmStockInBtn.addEventListener('click', confirmStockIn);
    if (uiElements.wastageForm) uiElements.wastageForm.addEventListener('submit', handleWastageSubmit);
    if (uiElements.returnForm) uiElements.returnForm.addEventListener('submit', handleReturnSubmit);
}