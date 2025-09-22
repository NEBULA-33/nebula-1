import { state } from './dataManager.js';
import { renderAll } from './uiManager.js';
import { getCurrentRole } from './authManager.js';
import { logAction } from './logManager.js';
import { supabase } from './supabaseClient.js';


let uiElements = {};

// Veri değişikliğinden sonra arayüzü yenilemek için yardımcı fonksiyon
async function refreshProducts() {
    const currentShopId = state.currentShop?.id;
    if (!currentShopId) return;

    const { data, error } = await supabase.from('products').select('*').eq('shop_id', currentShopId);
    if (error) {
        console.error('Ürünler yenilenemedi:', error);
    } else {
        state.products = data || [];
        renderAll();
    }
}

function resetProductForm() {
    if (uiElements.productForm) uiElements.productForm.reset();
    if (uiElements.editProductIdInput) uiElements.editProductIdInput.value = '';
    if (uiElements.pluCodesContainer) uiElements.pluCodesContainer.innerHTML = '';
    if (uiElements.productSubmitBtn) uiElements.productSubmitBtn.textContent = 'Ürünü Ekle';
    if (uiElements.cancelEditBtn) uiElements.cancelEditBtn.style.display = 'none';

    const fieldsToToggle = [
        uiElements.purchasePriceInput,
        uiElements.sellingPriceInput,
        uiElements.stockQuantityInput
    ];
    fieldsToToggle.forEach(field => {
        if(field) {
            field.readOnly = false;
            field.disabled = false;
        }
    });

    toggleProductFields();
}

function toggleProductFields() {
    if (!uiElements.isWeighableCheckbox || !uiElements.pluSection || !uiElements.barcodeSection) return;
    if (uiElements.isWeighableCheckbox.checked) {
        uiElements.pluSection.style.display = 'block';
        uiElements.barcodeSection.style.display = 'none';
        if (uiElements.pluCodesContainer && uiElements.pluCodesContainer.children.length === 0) {
            addPluInput();
        }
    } else {
        uiElements.pluSection.style.display = 'none';
        uiElements.barcodeSection.style.display = 'block';
    }
}

function addPluInput(value = '') {
    if (!uiElements.pluCodesContainer) return;
    const group = document.createElement('div');
    group.className = 'plu-input-group';
    group.innerHTML = `<input type="text" class="plu-code-input" placeholder="5 haneli PLU kodu" value="${value}"><button type="button" class="delete-btn">Sil</button>`;
    group.querySelector('.delete-btn').onclick = () => group.remove();
    uiElements.pluCodesContainer.appendChild(group);
}

// "Aynı ürün varsa stoğu güncelle" mantığı eklenmiş tam fonksiyon
async function handleProductFormSubmit(e) {
    e.preventDefault();
    
    const currentShopId = state.currentShop?.id;
    if (!currentShopId) return alert("Aktif dükkan seçilemedi! Lütfen tekrar giriş yapın.");

    const editingId = uiElements.editProductIdInput.value ? parseInt(uiElements.editProductIdInput.value) : null;
    
    const productName = uiElements.productNameInput.value.trim();
    const sellingPrice = parseFloat(uiElements.sellingPriceInput.value);
    const stockToAdd = parseFloat(uiElements.stockQuantityInput.value) || 0;

    // Eğer DÜZENLEME MODUNDA DEĞİLSEK, aynı isim ve fiyatta ürün var mı diye kontrol et
    if (!editingId && productName && !isNaN(sellingPrice)) {
        const { data: existingProduct, error: findError } = await supabase
            .from('products')
            .select('*')
            .eq('shop_id', currentShopId)
            .eq('name', productName)
            .eq('selling_price', sellingPrice)
            .single();

        if (findError && findError.code !== 'PGRST116') { // PGRST116 "hiç satır bulunamadı" hatasıdır, bu bizim için bir hata değil.
            return alert(`Ürün kontrol edilirken hata: ${findError.message}`);
        }

        // Eğer ürün bulunduysa, stoğunu güncelle ve işlemi bitir
        if (existingProduct) {
            const newStock = (existingProduct.stock || 0) + stockToAdd;
            const { error: updateError } = await supabase
                .from('products')
                .update({ stock: newStock, purchase_price: parseFloat(uiElements.purchasePriceInput.value) }) // Alış fiyatını da güncelleyelim
                .eq('id', existingProduct.id);

            if (updateError) {
                return alert(`Stok güncellenirken hata: ${updateError.message}`);
            }

            await logAction('PRODUCT_STOCK_ADD', { productName: productName, addedStock: stockToAdd });
            await refreshProducts();
            resetProductForm();
            return; // Fonksiyonu burada sonlandırıyoruz.
        }
    }

    // --- Eğer ürün bulunamadıysa VEYA DÜZENLEME MODUNDAYSAK, normal ekleme/güncelleme işlemi devam eder ---

    const pluCodes = Array.from(uiElements.pluCodesContainer.querySelectorAll('.plu-code-input')).map(input => input.value.trim()).filter(Boolean);
    
    const productData = {
        name: productName,
        selling_price: sellingPrice,
        category: uiElements.productCategoryInput.value.trim(),
        is_weighable: uiElements.isWeighableCheckbox.checked,
        show_in_quick_add: uiElements.showInQuickAddCheckbox.checked,
        plu_codes: pluCodes,
        barcode: uiElements.productBarcodeInput.value.trim(),
        vat_rate: parseFloat(uiElements.productVatRateSelect.value),
        purchase_price: parseFloat(uiElements.purchasePriceInput.value),
        shop_id: currentShopId
    };

    let error;
    if (editingId) {
        // Düzenleme modunda stock'u üzerine ekleme, direkt yeni değeri ata
        productData.stock = stockToAdd;
        const { error: updateError } = await supabase.from('products').update(productData).eq('id', editingId);
        error = updateError;
        if (!error) await logAction('PRODUCT_UPDATE', { productId: editingId, productName: productData.name });
    } else {
        // Yeni ürün eklenirken stok doğrudan atanır
        productData.stock = stockToAdd;
        const { error: insertError } = await supabase.from('products').insert([productData]);
        error = insertError;
        if (!error) await logAction('PRODUCT_CREATE', { productName: productData.name });
    }

    if (error) {
        console.error('Ürün işlemi başarısız:', error);
        alert(`Hata: ${error.message}`);
    } else {
        await refreshProducts();
        resetProductForm();
    }
}


function editProduct(id) {
    const product = state.products.find(p => p.id === id);
    if (!product) return;
    
    resetProductForm();
    
    uiElements.editProductIdInput.value = product.id;
    uiElements.productNameInput.value = product.name;
    uiElements.productCategoryInput.value = product.category || '';
    uiElements.isWeighableCheckbox.checked = product.is_weighable;
    uiElements.showInQuickAddCheckbox.checked = product.show_in_quick_add || false;
    uiElements.productBarcodeInput.value = product.barcode || '';
    uiElements.productVatRateSelect.value = product.vat_rate;
    uiElements.purchasePriceInput.value = product.purchase_price;
    uiElements.sellingPriceInput.value = product.selling_price;
    uiElements.stockQuantityInput.value = product.stock;
    
    if (product.is_weighable && product.plu_codes) {
        product.plu_codes.forEach(code => addPluInput(code));
    }
    
    toggleProductFields();

  const role = getCurrentRole();
    const isManager = (role === 'manager' || role === 'yönetici'); // Rol adını kontrol edelim
    
    // YÖNETİCİ DEĞİLSE, SADECE YÖNETİCİYE ÖZEL ALANLARI KİLİTLE
    uiElements.purchasePriceInput.disabled = !isManager;
    uiElements.sellingPriceInput.disabled = !isManager; 
    uiElements.stockQuantityInput.disabled = !isManager;
    
    uiElements.productSubmitBtn.textContent = 'Ürünü Güncelle';
    uiElements.cancelEditBtn.style.display = 'inline-block';
    if (uiElements.productForm) uiElements.productForm.scrollIntoView({ behavior: 'smooth' });
}

async function deleteProduct(id) {
    const currentShopId = state.currentShop?.id;
    const productName = state.products.find(p => p.id === id)?.name || 'Bu ürün';
    if (confirm(`'${productName}' adlı ürünü ve tüm geçmişini (satışlar, stok hareketleri vb.) kalıcı olarak silmek istediğinizden emin misiniz?`)) {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id)
            .eq('shop_id', currentShopId);

        if (error) {
            console.error('Ürün silinemedi:', error);
            alert(`Hata: ${error.message}`);
        } else {
            await logAction('PRODUCT_DELETE', { productId: id, productName: productName });
            await refreshProducts();
        }
    }
}

export function initializeProductManager(elements) {
    uiElements = elements;
    window.app = window.app || {};
    window.app.editProduct = editProduct;
    window.app.deleteProduct = deleteProduct;
    if (uiElements.productForm) uiElements.productForm.addEventListener('submit', handleProductFormSubmit);
    if (uiElements.isWeighableCheckbox) uiElements.isWeighableCheckbox.addEventListener('change', toggleProductFields);
    if (uiElements.addPluBtn) uiElements.addPluBtn.addEventListener('click', () => addPluInput());
    if (uiElements.cancelEditBtn) uiElements.cancelEditBtn.addEventListener('click', resetProductForm);
    toggleProductFields();
}