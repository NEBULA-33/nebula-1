import { state } from './dataManager.js';
import { renderAll } from './uiManager.js';
import { showMessage } from './utils.js';
import { logAction } from './logManager.js';
import { supabase } from './supabaseClient.js';

let uiElements;
let creditSaleCart = [];

// Veresiye ve ürün verilerini tazelemek için yardımcı fonksiyon
async function refreshData() {
    const currentShopId = state.currentShop.id;
    if (!currentShopId) return;

    const { data: debtsData, error: debtsError } = await supabase
        .from('debt_persons')
        .select('*, debt_transactions(*)')
        .eq('shop_id', currentShopId);

    const { data: productsData, error: productsError } = await supabase.from('products').select('*').eq('shop_id', currentShopId);

    if (debtsError) console.error('Veresiye verileri yenilenemedi:', debtsError);
    else state.debts = debtsData || [];

    if (productsError) console.error('Ürün verileri yenilenemedi:', productsError);
    else state.products = productsData || [];
    
    renderAll();
}

// Barkod okuma fonksiyonu state'den çalıştığı için aynı kalabilir
async function handleDebtSaleScan(e) {
    e.preventDefault();
    const scannedCode = uiElements.debtSaleBarcodeScan.value.trim();
    if (!scannedCode) return;

    let productToSell = null;
    let quantity = 1;

    if (scannedCode.startsWith('28') && scannedCode.length >= 12) {
        const pluCode = scannedCode.substring(2, 7);
        const weightInGrams = parseInt(scannedCode.substring(7, 12));
        if (!isNaN(weightInGrams)) {
            productToSell = state.products.find(p => p.is_weighable && p.plu_codes && p.plu_codes.includes(pluCode));
            if(productToSell) quantity = weightInGrams / 1000.0;
        }
    } else {
        productToSell = state.products.find(p => !p.is_weighable && p.barcode === scannedCode);
    }

    if (productToSell) {
        if (productToSell.stock < quantity) {
            showMessage(uiElements.debtSaleMessage, `Stok yetersiz! Mevcut: ${productToSell.stock.toFixed(3)}`, 'error');
        } else {
            const existingItem = creditSaleCart.find(item => item.id === productToSell.id);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                creditSaleCart.push({ ...productToSell, quantity });
            }
            showMessage(uiElements.debtSaleMessage, `${productToSell.name} sepete eklendi.`, 'success');
        }
    } else {
        showMessage(uiElements.debtSaleMessage, 'Bu barkoda sahip ürün bulunamadı!', 'error');
    }
    
    uiElements.debtSaleForm.reset();
    renderAll();
}

function clearDebtSaleCart() {
    creditSaleCart = [];
    renderAll();
}

async function confirmDebtSale() {
    const personId = parseInt(uiElements.debtSalePersonSelect.value);
    if (!personId) {
        return showMessage(uiElements.debtSaleMessage, 'Lütfen borç eklenecek bir müşteri seçin.', 'error');
    }
    if (creditSaleCart.length === 0) {
        return showMessage(uiElements.debtSaleMessage, 'Sepet boş.', 'error');
    }

    // YENİ: Aktif dükkan ve kullanıcı ID'sini al
    const currentShopId = state.currentShop.id;
    const currentUserId = state.currentUser.id;
    if (!currentShopId || !currentUserId) return alert("Aktif dükkan/kullanıcı bulunamadı.");

    const person = state.debts.find(p => p.id === personId);
    if (!person) {
        return showMessage(uiElements.debtSaleMessage, 'Müşteri bulunamadı.', 'error');
    }

    // 1. Veresiye satış işlemini kaydet
    const totalAmount = creditSaleCart.reduce((sum, item) => sum + (item.selling_price * item.quantity), 0);
    const productNames = creditSaleCart.map(item => item.name).join(', ');
    const transactionRecord = {
        person_id: personId,
        amount: totalAmount,
        description: `Alışveriş: ${productNames}`,
        shop_id: currentShopId, // YENİ
        user_id: currentUserId  // YENİ
    };
    const { error: transactionError } = await supabase.from('debt_transactions').insert([transactionRecord]);
    if (transactionError) return alert(`Veresiye işlemi kaydedilemedi: ${transactionError.message}`);

    // 2. Stokları güncelle
    for (const cartItem of creditSaleCart) {
        const productInStock = state.products.find(p => p.id === cartItem.id);
        if (productInStock) {
            const newStock = productInStock.stock - cartItem.quantity;
            await supabase.from('products').update({ stock: newStock }).eq('id', cartItem.id);
        }
    }

    await logAction('DEBT_SALE', { personName: person.person_name, amount: totalAmount });
    clearDebtSaleCart();
    showMessage(uiElements.debtSaleMessage, `${person.person_name} adlı kişinin borcuna ${totalAmount.toFixed(2)} TL eklendi.`, 'success');
    await refreshData();
}

function resetDebtForm() {
    if (uiElements.debtForm) uiElements.debtForm.reset();
    if (uiElements.debtPersonId) uiElements.debtPersonId.value = '';
    if (uiElements.debtPersonName) uiElements.debtPersonName.readOnly = false;
    if (uiElements.debtSubmitButton) uiElements.debtSubmitButton.textContent = 'Kaydet';
}

async function handleDebtFormSubmit(e) {
    e.preventDefault();
    
    // YENİ: Aktif dükkan ve kullanıcı ID'sini al
    // YENİ KOD
    const currentShopId = state.currentShop?.id;
    const currentUserId = state.currentUser?.id;
    if (!currentShopId || !currentUserId) return alert("Aktif dükkan/kullanıcı bulunamadı.");

    const personId = uiElements.debtPersonId.value ? parseInt(uiElements.debtPersonId.value) : null;
    const personName = uiElements.debtPersonName.value.trim();
    const phone = uiElements.debtPersonPhone.value.trim();
    const address = uiElements.debtPersonAddress.value.trim();
    const amount = parseFloat(uiElements.debtAmount.value);
    const description = uiElements.debtDescription.value.trim();

    if (!personName || isNaN(amount) || !description) {
        return alert("Lütfen kişi adı, tutar ve açıklama alanlarını doldurun.");
    }
    
    let person;
    const personData = {
        person_name: personName,
        phone,
        address,
        shop_id: currentShopId // YENİ
    };

    if (personId) { // Var olan kişiye işlem ekleniyor
        const { data, error } = await supabase.from('debt_persons').update(personData).eq('id', personId).select();
        if (error) return alert(`Kişi güncellenemedi: ${error.message}`);
        person = data[0];
    } else { // Yeni kişi oluşturuluyor
        const { data, error } = await supabase.from('debt_persons').insert([personData]).select();
        if (error) return alert(`Yeni kişi oluşturulamadı: ${error.message}`);
        person = data[0];
    }
    
    // İşlemi 'debt_transactions' tablosuna kaydet
    const transactionRecord = { 
        person_id: person.id, 
        amount, 
        description,
        shop_id: currentShopId, // YENİ
        user_id: currentUserId  // YENİ
    };
    const { error: transactionError } = await supabase.from('debt_transactions').insert([transactionRecord]);
    if (transactionError) return alert(`İşlem kaydedilemedi: ${transactionError.message}`);
    
    await logAction('DEBT_TRANSACTION', { personName: personName, amount, description });
    
    await refreshData();
    resetDebtForm();
}

function addTransactionToPerson(personId) {
    const person = state.debts.find(p => p.id === personId);
    if (!person) return;
    uiElements.debtPersonId.value = person.id;
    uiElements.debtPersonName.value = person.person_name;
    uiElements.debtPersonName.readOnly = true;
    uiElements.debtPersonPhone.value = person.phone || '';
    uiElements.debtPersonAddress.value = person.address || '';
    uiElements.debtSubmitButton.textContent = `${person.person_name} için İşlem Kaydet`;
    if(uiElements.debtAmount) uiElements.debtAmount.focus();
}

async function deletePerson(personId) {
    const person = state.debts.find(p => p.id === personId);
    if (!person) return;
    if (confirm(`'${person.person_name}' adlı kişiyi ve tüm geçmişini silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`)) {
        // İlişkili olduğu için önce işlemleri, sonra kişiyi silmek daha güvenlidir.
        await supabase.from('debt_transactions').delete().eq('person_id', personId);
        const { error } = await supabase.from('debt_persons').delete().eq('id', personId);
        
        if (error) {
            alert(`Kişi silinirken hata oluştu: ${error.message}`);
        } else {
            await logAction('DEBT_PERSON_DELETE', { personId: personId, personName: person.person_name });
            await refreshData();
        }
    }
}

export function getCreditSaleCart() {
    return creditSaleCart;
}

export function initializeDebtManager(elements) {
    uiElements = elements;
    window.app = window.app || {};
    window.app.addTransactionToPerson = addTransactionToPerson;
    window.app.deletePerson = deletePerson;

    if (uiElements.debtForm) uiElements.debtForm.addEventListener('submit', handleDebtFormSubmit);
    if (uiElements.debtSearchInput) uiElements.debtSearchInput.addEventListener('input', () => renderAll());
    if (uiElements.clearDebtFormButton) uiElements.clearDebtFormButton.addEventListener('click', resetDebtForm);
    if(uiElements.debtSaleForm) uiElements.debtSaleForm.addEventListener('submit', handleDebtSaleScan);
    if(uiElements.debtSaleConfirmBtn) uiElements.debtSaleConfirmBtn.addEventListener('click', confirmDebtSale);
    if(uiElements.debtSaleClearBtn) uiElements.debtSaleClearBtn.addEventListener('click', clearDebtSaleCart);
}